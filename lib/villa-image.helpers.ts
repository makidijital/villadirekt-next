import {
  storageProvider,
  STORAGE_BUCKETS,
  bucketFromCdnHost,
} from "@/lib/storage";

/* ===============================================================
   🛡️ VILLA IMAGE HELPERS — Bucket: "villa-images"
   ===============================================================
   Bu dosya `villa-images` bucket'ı için TEK SOURCE-OF-TRUTH path
   üretici + parse helper'ı. Daha önce path inline AdminGallery.tsx
   içinde üretiliyordu; merkezileştirildi.

   ─────────────────────────────────────────────────────────────
   STORAGE LAYOUT (NEW — production-grade, human-readable)
   ─────────────────────────────────────────────────────────────
     villa-images/
       villas/
         {slug}__{shortId}/
           gallery-{NNNN}-{rand4}.webp
           gallery-{NNNN}-{rand4}.webp
           ...

   ÖRNEK:
     villa-images/villas/villa-casa-del-mar__2f99586c/gallery-0001-a3f2.webp
     villa-images/villas/villa-casa-del-mar__2f99586c/gallery-0002-7e9b.webp

   ALAN DÖKÜMANI:
     - {slug}    = villa.slug snapshot (readability için).
     - {shortId} = villa.id UUID'sinin ilk 8 hex hanesi
                   (DETERMINISTIC + STABLE: slug değişse bile sabit).
     - {NNNN}    = villa-içi monotonik sıra; var olan dosyaların max
                   seq + 1. 4 haneli sıfır-doldurma.
     - {rand4}   = 4 hex random; concurrent upload race koruması.

   COVER STATÜSÜ:
     Dosya adında DEĞİL. `villa_images.is_cover` flag'i DB'de.
     Aksi halde "kapak yap" toggle'ı file rename gerektirirdi.

   SORT ORDER:
     Aynı: filename'de yansıtılmaz; `villa_images.sort_order` DB'de.

   ─────────────────────────────────────────────────────────────
   BACKWARD COMPATIBILITY (kritik)
   ─────────────────────────────────────────────────────────────
   ESKİ PATTERN (legacy uploads):
     villa-images/{villaId-uuid}/{random-uuid}.webp

   ESKİ DOSYALARA NE OLUR?
     - Hiçbir şey. Olduğu yerde durur.
     - `villa_images.image_url` zaten FULL URL içerir → reads çalışır.
     - Delete/hardDelete'in `.split("/object/public/")[1]` parser'ı
       bucket-agnostic, eski + yeni path için identical çalışır.
     - Sıfır migration script; zero-downtime.

   `parseVillaStorageUrl` ileride o inline parse'i merkezileştirmek
   için hazır; mevcut kod **dokunulmadan** çalışmaya devam ediyor.
   =============================================================== */

/* FAZ 38: Bucket sabit storage.constants'tan; local re-export
   backward-compat — mevcut tüketiciler bu sabiti import ediyor. */
export const VILLA_IMAGES_BUCKET = STORAGE_BUCKETS.VILLA_IMAGES;

const FOLDER_PREFIX = "villas";
const SEQ_PAD = 4;
const RANDOM_HEX_LEN = 4;
const DEFAULT_EXT = "webp";

/* SEO filename truncation budget.
   "filename-NNNN-XXXX.webp" sabit kuyruğu ≈ 14 char; toplam ~80 char
   güvenli sınır. 60 ile slug kuyruktan önce kalır → toplam < 80. */
const MAX_FILENAME_SLUG_LEN = 60;

/* FAZ 38: Retry budget provider implementation içinde tutulur
   (lib/storage/eski sağlayıcı-storage.provider.ts). Buradaki sabitler
   diagnostic comment olarak yorum satırına dönüştürüldü; provider
   davranışıyla byte-identical (3 deneme, 200ms / 400ms backoff). */
// const STORAGE_REMOVE_MAX_ATTEMPTS = 3;
// const STORAGE_REMOVE_BASE_DELAY_MS = 200;

/* ---------------------------------------------------------------
   🛡️ SAFE ID & SLUG NORMALIZERS
   --------------------------------------------------------------- */

/** UUID'nin ilk 8 hex hanesini al; non-hex karakterleri at. Stable +
 *  deterministic (aynı villa.id → her zaman aynı shortId). */
function safeShortId(villaId: string | null | undefined): string {
  const clean = String(villaId || "").replace(/[^a-f0-9-]/gi, "");
  const noDashes = clean.replace(/-/g, "");
  const short = noDashes.slice(0, 8).toLowerCase();
  return short || "no-id";
}

/** Slug'ı dosya/klasör adı için güvenli forma çek. lib/slug > slugifyTr
 *  zaten URL'ye uygun output veriyor; burada DEFENSIVE bir layer daha:
 *  unicode bulaşmasını önle, çift dash'leri çök. */
function safeSlug(slug: string | null | undefined): string {
  const s = String(slug || "").trim().toLowerCase();
  const normalized = s
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "villa";
}

/** Crypto-safe küçük random hex suffix. Browser + Node 18+ uyumlu. */
function randomHex(len: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(Math.ceil(len / 2));
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, len);
  }
  // Defensive fallback (yalnız eski/exotic runtimes)
  return Math.random().toString(16).slice(2, 2 + len).padEnd(len, "0");
}

function padSeq(n: number): string {
  return String(Math.max(1, Math.floor(n))).padStart(SEQ_PAD, "0");
}

function normalizeExt(ext: string | null | undefined): string {
  const e = String(ext || DEFAULT_EXT)
    .replace(/^\./, "")
    .toLowerCase()
    .trim();
  return e || DEFAULT_EXT;
}

/* ---------------------------------------------------------------
   🛡️ PATH BUILDERS
   --------------------------------------------------------------- */

/**
 * Villa için kalıcı klasör adı.
 *   FORMAT: villas/{slug}__{shortId}
 *
 *  STABLE INVARIANT:
 *  - shortId villa.id'den deterministic — slug değişse bile aynı.
 *  - Slug bölümü sadece okunabilirlik; rename'de eski klasör olduğu
 *    yerde durur (orphan engellemek için RENAME YAPILMAZ).
 */
export function buildVillaFolderName(villa: {
  id: string;
  slug?: string | null;
}): string {
  const slug = safeSlug(villa.slug);
  const shortId = safeShortId(villa.id);
  return `${FOLDER_PREFIX}/${slug}__${shortId}`;
}

/**
 * Slug'ı SEO filename'e güvenli forma çek. Aşırı uzun slug'lar
 * `MAX_FILENAME_SLUG_LEN` ile kesilir; kesim noktası kelime
 * sınırına (`-`) tutturulur — yarım kalmış kelimeyle bitmez.
 */
function truncateSlugForFilename(
  slug: string,
  maxLen: number = MAX_FILENAME_SLUG_LEN
): string {
  if (slug.length <= maxLen) return slug;
  const cut = slug.slice(0, maxLen);
  const lastDash = cut.lastIndexOf("-");
  // Kelime sınırı kesimin %50'sinden geride değilse onu kullan
  if (lastDash > Math.floor(maxLen / 2)) {
    return cut.slice(0, lastDash).replace(/-+$/, "");
  }
  return cut.replace(/-+$/, "");
}

/**
 * Villa içi SEO-friendly gallery dosya adı.
 *   FORMAT: {villaSlug}-{NNNN}-{rand4}.{ext}
 *
 *   - villaSlug: villa.slug snapshot. Slug değişimi sonrası YENİ
 *     uploadlar yeni slug'la dosya üretir; eski dosyalar olduğu
 *     yerde durur (rename YOK).
 *   - NNNN: 4 haneli monotonik villa-içi seq.
 *   - rand4: concurrent upload race koruması.
 *
 *  ÖRNEK:
 *    "villa-casa-del-mar"   + 1 → "villa-casa-del-mar-0001-a3f2.webp"
 *    "fethiye-luks-deniz..." + 2 → "fethiye-luks-deniz-manzarali-villa-0002-7e9b.webp"
 *    null/empty             + 1 → "gallery-0001-XXXX.webp" (legacy fallback)
 *
 *  BACKWARD COMPATIBILITY:
 *    Eski "gallery-NNNN-XXXX" dosyaları sequence regex tarafından
 *    hala tanınır (`nextGallerySequenceFromUrls`). Yeni format aynı
 *    `-NNNN-XXXX.ext` kuyruğunu paylaşır.
 */
export function buildVillaImageFilename(
  villaSlug: string | null | undefined,
  sequenceNumber: number,
  extension: string = DEFAULT_EXT
): string {
  const baseSlug = truncateSlugForFilename(safeSlug(villaSlug));
  const seq = padSeq(sequenceNumber);
  const rand = randomHex(RANDOM_HEX_LEN);
  const ext = normalizeExt(extension);
  // Slug yoksa veya tamamen sanitize edilip boş kaldıysa legacy
  // "gallery-" prefix'i kullan — sequence regex ile geriye dönük uyum.
  if (baseSlug && baseSlug !== "villa") {
    return `${baseSlug}-${seq}-${rand}.${ext}`;
  }
  return `gallery-${seq}-${rand}.${ext}`;
}

/** Tam bucket-relative path (folder + filename). Upload caller'ı bunu
 *  R2 storage'a yazar; aynı path'in public URL'i DB'ye yazılır.
 *
 *  Slug iki yerde:
 *    1) Folder: villas/{slug}__{shortId}/  ← stable identity
 *    2) Filename: {slug}-NNNN-XXXX.{ext}    ← SEO-friendly
 *
 *  Slug değişse bile folder shortId sayesinde aynı kalır; sadece
 *  yeni filename'ler yeni slug ile yazılır → mevcut dosyalar
 *  etkilenmez. */
export function buildVillaImagePath(
  villa: { id: string; slug?: string | null },
  sequenceNumber: number,
  extension: string = DEFAULT_EXT
): string {
  const folder = buildVillaFolderName(villa);
  const filename = buildVillaImageFilename(villa.slug, sequenceNumber, extension);
  return `${folder}/${filename}`;
}

/* ---------------------------------------------------------------
   🛡️ SEQUENCE RESOLVER
   --------------------------------------------------------------- */

/**
 * Mevcut görsel URL'lerinden bir sonraki sequence numarasını çıkar.
 * `-NNNN-XXXX.{ext}` kuyruk paterniyle eşleşen filename'lerin
 * max NNNN değerini bulup +1 döner.
 *
 *   - Hiç pattern eşleşmesi yoksa → 1
 *   - Tüm dosyalar legacy (UUID/UUID.webp) ise → 1
 *   - Karma (eski legacy + faz 7 + faz 8 SEO) ise → max(NNNN) + 1
 *
 * REGEX KAPSAMI:
 *   ✓ "gallery-0001-a3f2.webp"           ← faz 7 (jenerik)
 *   ✓ "villa-casa-del-mar-0001-a3f2.webp" ← faz 8 (SEO)
 *   ✓ "fethiye-luks-villa-0042-7e9b.webp" ← faz 8 (SEO)
 *   ✗ "{uuid}/{uuid}.webp"                ← legacy (segments harfli)
 *   ✗ UUID v4 (hex bloklar tamamı sayı değil) → false-pozitif yok
 */
export function nextGallerySequenceFromUrls(
  existingImageUrls: ReadonlyArray<string | null | undefined>
): number {
  let maxSeq = 0;
  /* Strict 4-digit seq + 4-char hex random + extension.
     `-` prefix'i UUID segmentleriyle false-positive yapmaz çünkü
     UUID bloklarının hiçbiri tamamen sayı değil. */
  const re = /-(\d{4})-[0-9a-f]{4}\.[a-z0-9]+(?:\?|$)/i;
  for (const url of existingImageUrls) {
    if (!url) continue;
    const m = String(url).match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
  }
  return maxSeq + 1;
}

/* ---------------------------------------------------------------
   🛡️ PUBLIC URL — NEW-pattern uploads için
   --------------------------------------------------------------- */

/**
 * Verilen bucket-relative path için public URL üretir.
 * NOT: DB'de `villa_images.image_url` FULL URL tutuyor; bu fonksiyon
 * yalnız upload sonrası "DB'ye yazılacak URL" üretiminde kullanılır.
 * READ path'leri (villa detay, /arama, listing) DB'deki tam URL'i
 * direkt kullanır → bu fonksiyona dokunmaz.
 */
export function getVillaImagePublicUrl(path: string): string | null {
  /* FAZ 38: storageProvider delege; URL formatı + null-fallback aynen. */
  if (!path) return null;
  return storageProvider.getPublicUrl(VILLA_IMAGES_BUCKET, path);
}

/* ---------------------------------------------------------------
   🛡️ PARSE — URL → { bucket, path }
   --------------------------------------------------------------- */

/**
 * Tam public URL'i veya bucket-relative path'i `{ bucket, path }`
 * objesine ayrıştırır. Helper'ı `deleteVillaImage` ve `hardDeleteVilla`
 * gibi storage cleanup yollarının kullanmasını umuyoruz; **mevcut
 * inline parser'lar BYTE-IDENTICAL semantic'le çalıştığı için zorunlu
 * değil** — backward-compat refactor'ı için hazır altyapı.
 *
 * KABUL EDİLEN INPUT:
 *   1) "https://{proj}.eski storage host/storage/v1/object/public/{bucket}/{path}"
 *      → eski + yeni pattern hepsi bu formata uyar.
 *   2) Bucket-relative ("villas/{folder}/gallery-...webp" gibi)
 *      → assumed VILLA_IMAGES_BUCKET.
 *   3) null / boş → null.
 *
 * Output bucket adı **dinamik**; legacy `villa-images` veya farklı
 * bucket'larda da çalışır (örn. ileride taxonomy görselleri taşınırsa).
 */
export function parseVillaStorageUrl(
  urlOrPath: string | null | undefined
): { bucket: string; path: string } | null {
  if (!urlOrPath) return null;
  const v = String(urlOrPath).trim();
  if (!v) return null;

  // Pattern 1: full public URL (`/object/public/{bucket}/{path}`)
  const idx = v.indexOf("/object/public/");
  if (idx !== -1) {
    const afterPublic = v.slice(idx + "/object/public/".length);
    const [bucket, ...rest] = afterPublic.split("/");
    if (!bucket || rest.length === 0) return null;
    const pathWithoutQuery = rest.join("/").split("?")[0];
    if (!pathWithoutQuery) return null;
    return { bucket, path: pathWithoutQuery };
  }

  /* 🛡️ FAZ B — Pattern 1b: CDN host (NEXT_PUBLIC_CDN_BASE_* host'ları).
     CDN path R2'ye eski sağlayıcı path'i ile BİREBİR kopyalandığı için,
     CDN URL'inin pathname'i hem R2 hem eski sağlayıcı bucket-relative
     path'ine eşittir → remove (eski sağlayıcı) doğru hedefi bulur. */
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      const bucket = bucketFromCdnHost(u.host);
      if (bucket) {
        const cdnPath = u.pathname.replace(/^\/+/, "").split("?")[0];
        if (cdnPath) return { bucket, path: cdnPath };
      }
    } catch {
      /* malformed URL → diğer pattern'lere düş */
    }
  }

  // Pattern 2: bucket-relative path → default villa-images bucket
  if (!/^https?:\/\//i.test(v)) {
    return { bucket: VILLA_IMAGES_BUCKET, path: v.replace(/^\/+/, "") };
  }

  return null;
}

/* ---------------------------------------------------------------
   🛡️ DIAGNOSTIC — Legacy detection
   --------------------------------------------------------------- */

/**
 * Verilen bucket-içi path eski legacy pattern mı?
 *   Legacy: "{uuid}/{uuid}.{ext}"
 *   New:    "villas/{slug}__{shortId}/gallery-NNNN-XXXX.{ext}"
 *
 * Migration tool / debugging için. Runtime davranışını etkilemez.
 */
export function isLegacyVillaImagePath(path: string | null | undefined): boolean {
  if (!path) return false;
  return /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\/[0-9a-f-]{8,36}\.[a-z0-9]+$/i.test(
    String(path)
  );
}

/** Verilen bucket-içi path NEW-pattern mı?
 *  Hem faz 7 (gallery-NNNN) hem faz 8 (slug-NNNN) deseni kapsanır. */
export function isNewVillaImagePath(path: string | null | undefined): boolean {
  if (!path) return false;
  return /^villas\/[a-z0-9-]+__[0-9a-f]{8}\/[a-z0-9-]+-\d{4}-[0-9a-f]{4}\.[a-z0-9]+$/i.test(
    String(path)
  );
}

/* ===============================================================
   🛡️ STORAGE CLEANUP RESULT — shared type (client-safe)
   ===============================================================
   Bulk remove sonuç envelope'u. Yalnız TİP (runtime kod yok) →
   client-safe; hem pure helper tüketicileri hem server-only I/O
   modülü (`lib/villa-image.storage.server.ts`) bu tek tanımı
   paylaşır.

   ⚠️ AYRIŞTIRMA (client/server sprinti):
     `removeVillaStorageFiles` + `removeVillaImageByUrl` storage I/O
     fonksiyonları bu dosyadan `lib/villa-image.storage.server.ts`
     (server-only) modülüne TAŞINDI. Böylece bu dosya YALNIZ
     pure/client-safe path + parse + sequence helper'ı olarak kalır
     ve AdminGallery gibi client bileşenleri güvenle import eder.
     DAVRANIŞ DEĞİŞMEDİ — fonksiyonlar gövdeleriyle birebir taşındı,
     yalnız KONUM değişti.
   =============================================================== */

export type StorageRemoveResult = {
  /** En az 1 path başarısız olsa bile false. */
  ok: boolean;
  /** Hangi path'ler kalıcı fail oldu (orphan). */
  failed: string[];
  attempts: number;
};
