/* ===============================================================
   🛡️ YOUTUBE HELPER — URL parser + embed/thumbnail URL builder
   ===============================================================
   AMAÇ:
     Villa YouTube video sistemi için pure, framework-agnostic helper.
     Admin form + service + frontend renderer'lar bu modülü tüketir.

   PURE & SSR-SAFE:
     - DOM/React bağımlılığı yok
     - Server ve client tarafında AYNI çıktı (deterministik)
     - Side effect yok

   SECURITY:
     - Sadece normalize edilmiş video ID kabul edilir
       (11 karakter, [A-Za-z0-9_-])
     - Embed URL `youtube-nocookie.com` (privacy-enhanced)
     - Raw HTML/iframe input ASLA kabul edilmez
     - URL'den parse → ID → güvenli template ile yeniden inşa
     - XSS yüzeyi sıfır

   DESTEKLENEN FORMATLAR:
     - https://www.youtube.com/watch?v=XXXX[&t=...]
     - https://youtube.com/watch?v=XXXX
     - https://m.youtube.com/watch?v=XXXX
     - https://youtu.be/XXXX[?t=...]
     - https://www.youtube.com/shorts/XXXX
     - https://youtube.com/shorts/XXXX
     - https://www.youtube.com/embed/XXXX[?...]
     - https://www.youtube.com/v/XXXX (legacy)
     - Sade 11-karakterlik ID girilirse direkt kabul

   REDDEDİLEN:
     - YouTube olmayan domain'ler (vimeo, dailymotion, vb.)
     - Geçersiz ID uzunluğu (≠ 11 karakter)
     - Boş / null / undefined / non-string

   GERIYE UYUMLULUK:
     - parseYouTubeId(...) → string | null  → caller null-safe kontrol
     - getYouTubeEmbedUrl/Thumbnail → her zaman valid URL döner
       (ID validation çağrıdan ÖNCE yapılmalı)
   =============================================================== */

/* 11-character YouTube video ID regex.
   YouTube ID alfabesi: A-Z, a-z, 0-9, - (dash), _ (underscore)
   Uzunluk: tam 11 karakter (sabit).
   Anchor'lar (^$) ile FULL match şartı — substring eşleşme yok. */
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/* URL parse pattern'leri — sırayla denenir. Her biri group 1'de
   tam 11 karakterlik ID yakalar. Anchor'lı değil — URL içinde
   herhangi bir yerde olabilir (ama path/query'de).
   Domain whitelisting: SADECE youtube.com / youtu.be (+ m./www.).
   URL-encoded edge case'lere girilmedi (admin form input
   typically clean URL). */
const URL_PATTERNS: ReadonlyArray<RegExp> = [
  /* Standart watch URL: youtube.com/watch?v=XXXX */
  /(?:^|[^a-zA-Z0-9])(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/watch\?(?:[^"\s]*?&)?v=([A-Za-z0-9_-]{11})(?:[&?#].*)?/,

  /* Short URL: youtu.be/XXXX */
  /(?:^|[^a-zA-Z0-9])(?:https?:\/\/)?(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})(?:[&?#].*)?/,

  /* Shorts: youtube.com/shorts/XXXX */
  /(?:^|[^a-zA-Z0-9])(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})(?:[&?#].*)?/,

  /* Embed URL: youtube.com/embed/XXXX */
  /(?:^|[^a-zA-Z0-9])(?:https?:\/\/)?(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})(?:[&?#].*)?/,

  /* Legacy /v/XXXX */
  /(?:^|[^a-zA-Z0-9])(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([A-Za-z0-9_-]{11})(?:[&?#].*)?/,
];

/* ===============================================================
   🛡️ parseYouTubeId — URL veya ID → normalize edilmiş 11-char ID
   ===============================================================
   Input örnekleri (tümü `"dQw4w9WgXcQ"` döner):
     - "dQw4w9WgXcQ"                                         (raw ID)
     - "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
     - "https://youtu.be/dQw4w9WgXcQ"
     - "https://youtube.com/shorts/dQw4w9WgXcQ"
     - "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"
     - "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=15s"

   Geçersiz input (null döner):
     - "" / null / undefined / non-string
     - "https://vimeo.com/123456"
     - "youtube.com/watch?v=short" (ID < 11 char)
     - "<script>..." (XSS attempt)
     - raw iframe HTML
=============================================================== */
export function parseYouTubeId(
  input: string | null | undefined
): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  /* 1) Raw ID — anchor'lı match (sadece ID, başka karakter yok). */
  if (YOUTUBE_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  /* 2) URL pattern'leri sırayla dene. İlk eşleşen ID'yi al ve
     yeniden validate et (defansif — regex doğru match etse bile
     başka pattern'e karışmasın). */
  for (const pattern of URL_PATTERNS) {
    const m = trimmed.match(pattern);
    if (m && m[1] && YOUTUBE_ID_PATTERN.test(m[1])) {
      return m[1];
    }
  }

  return null;
}

/* ===============================================================
   🛡️ getYouTubeEmbedUrl — privacy-enhanced embed URL
   ===============================================================
   Output: https://www.youtube-nocookie.com/embed/{id}
   Notlar:
     - `youtube-nocookie.com` cookie set etmez (GDPR / privacy)
     - Autoplay query parametresi caller'a bırakıldı (default YOK)
     - ID input'u validate edilmiş varsayılır — caller'ın
       parseYouTubeId çağırması beklenir. Defansif olarak
       regex bir kez daha kontrol edilir; geçersizse boş string.
=============================================================== */
export function getYouTubeEmbedUrl(
  id: string | null | undefined
): string {
  if (!id || !YOUTUBE_ID_PATTERN.test(id)) return "";
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

/* ===============================================================
   🛡️ getYouTubeThumbnailUrl — preview image URL
   ===============================================================
   Resolution stratejisi:
     - "hq"  → 480x360 (4:3 actually; ratio container'la kırpılır)
                  → hqdefault.jpg (eski videolar dahil HER ZAMAN var)
     - "max" → 1280x720 (16:9 native)
                  → maxresdefault.jpg (yeni videolarda var; eski
                    bazı videolar için 404 dönebilir)

   Default: "hq" — universal compatibility önemli (broken thumbnail
   yerine her zaman çalışan kalite).
=============================================================== */
export function getYouTubeThumbnailUrl(
  id: string | null | undefined,
  quality: "hq" | "max" = "hq"
): string {
  if (!id || !YOUTUBE_ID_PATTERN.test(id)) return "";
  const file = quality === "max" ? "maxresdefault.jpg" : "hqdefault.jpg";
  return `https://i.ytimg.com/vi/${id}/${file}`;
}

/* ===============================================================
   🛡️ VillaYouTubeVideo — DB JSONB array elemanının tipi
   ===============================================================
   Storage shape (DB column `villa.youtube_videos`):
     [{ id: string, url: string }, ...]

   - id  : normalize edilmiş 11-char video ID (parseYouTubeId çıktısı)
     - url : admin'in girdiği orijinal URL (UX/audit/edit için)

   Tüm caller'lar bu shape'i bekler; service-layer validate eder.
=============================================================== */
export type VillaYouTubeVideo = {
  id: string;
  url: string;
};

/* ===============================================================
   🛡️ normalizeYouTubeVideos — input array'ini DB-canonical hale getir
   ===============================================================
   - Geçersiz item'ları (parse edilemeyen url) filter dışı bırakır
   - Aynı ID'li duplicate'leri dedup eder (ilk geçerli kayıt kalır,
     sonrakiler düşer)
   - Order korunur (admin sıralama önemli olabilir)
   - Empty / non-array → [] döner (service-layer null'a dönüştürür)
=============================================================== */
export function normalizeYouTubeVideos(
  input: unknown
): VillaYouTubeVideo[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: VillaYouTubeVideo[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as { id?: unknown; url?: unknown };
    /* Hem `id` hem `url`'den ID extract dene; ID > url önceliği. */
    const candidateId =
      typeof obj.id === "string" ? obj.id : "";
    const candidateUrl =
      typeof obj.url === "string" ? obj.url : "";
    const id = parseYouTubeId(candidateId) || parseYouTubeId(candidateUrl);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    /* URL: kullanıcı orijinali tutulur (debug/edit için); yoksa
       canonical watch URL'i üretilir. */
    const url =
      candidateUrl && candidateUrl.trim()
        ? candidateUrl.trim()
        : `https://www.youtube.com/watch?v=${id}`;
    out.push({ id, url });
  }
  return out;
}

/* ===============================================================
   🛡️ isYouTubeUrl — quick check (form validation hint)
   ===============================================================
   Hem URL hem raw ID kabul; parseYouTubeId !== null → true.
=============================================================== */
export function isYouTubeUrl(input: string | null | undefined): boolean {
  return parseYouTubeId(input) !== null;
}
