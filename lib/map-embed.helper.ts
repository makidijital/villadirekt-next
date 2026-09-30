/* ===============================================================
   🛡️ SEC-05 — VILLA MAP EMBED GÜVENLİ SRC ÇÖZÜMLEME (saf / edge-safe)
   ===============================================================
   `villa.map_embed` alanı admin'in yapıştırdığı HAM iframe HTML'ini
   tutuyordu ve public villa detay (`/kiralik-villa/[slug]`) ile
   off-market (`/v/[token]`) sayfalarında `dangerouslySetInnerHTML`
   ile basılıyordu → keyfi `<script>` / event-handler enjeksiyonu
   (Stored XSS — SEC-05).

   Bu helper, admin'in yapıştırdığı Google Maps embed'inden YALNIZ
   güvenli `src` URL'ini çıkarır ve doğrular. Çağıran taraf artık ham
   HTML basmaz; kendi `<iframe src={...}>` etiketini üretir. Böylece:
     - Mevcut geçerli Google Maps embed'leri ÇALIŞMAYA devam eder
       (src host + path allow-list'ten geçerse).
     - Ham `<script>`, `onerror`, `<style>`, başka host'lu iframe vb.
       geçerli bir Google Maps `src` üretmediği için ELENİR → null.

   Kabul edilen girdi biçimleri (mevcut UX ile uyumlu):
     1) Tam iframe HTML  → `<iframe src="https://www.google.com/maps/embed?pb=...">`
     2) Çıplak URL       → `https://www.google.com/maps/embed?pb=...`

   Saf fonksiyon (yalnız `URL` + string) → server ve client güvenli.
   =============================================================== */

/* Google Maps embed host allow-list. `output=embed` (q-tabanlı) ve
   `/maps/embed?pb=` (paylaş-embed) biçimlerinin tümü bu host'lardadır. */
const ALLOWED_MAP_HOSTS = new Set<string>([
  "www.google.com",
  "google.com",
  "maps.google.com",
]);

/**
 * Ham `map_embed` değerinden güvenli, allow-list'li Google Maps embed
 * URL'ini çıkarır.
 * @returns Güvenli `https` Google Maps URL'i; yoksa `null`.
 */
export function extractSafeMapEmbedSrc(
  raw: string | null | undefined
): string | null {
  if (!raw || typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;

  /* Aday URL: çıplak URL ise doğrudan; değilse ilk src="..."/src='...'. */
  let candidate: string | null = null;
  if (/^https?:\/\//i.test(value)) {
    candidate = value;
  } else {
    const m = value.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (m) candidate = m[1];
  }
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (!ALLOWED_MAP_HOSTS.has(url.hostname.toLowerCase())) return null;
  /* Yalnız harita yolları — `/maps`, `/maps/embed` vb. */
  if (!url.pathname.toLowerCase().startsWith("/maps")) return null;

  return url.toString();
}

/** Boolean kısayol. */
export function hasSafeMapEmbed(raw: string | null | undefined): boolean {
  return extractSafeMapEmbedSrc(raw) !== null;
}
