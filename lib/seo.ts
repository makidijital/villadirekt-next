/* ===============================================================
   🛡️ SEO — site URL + metadataBase standardizasyonu (tek kaynak)
   ===============================================================
   AMAÇ:
     SITE_URL mantığı StructuredData / sitemap.ts / robots.ts /
     kiralik-villalar içinde dağınıktı. Bu modül canonical/metadataBase
     için TEK source-of-truth sağlar.

   İKİ AYRI KAVRAM (bilinçli):
     • SITE_URL — genel kullanım (sitemap/robots base). Yalnız
       NEXT_PUBLIC_SITE_URL; tanımsızsa "" (relative).
     • siteMetadataBase() — CANONICAL domain. YALNIZ explicit
       NEXT_PUBLIC_SITE_URL; şema yoksa https:// eklenir. Tanımsızsa
       undefined → Next default (prod'da NEXT_PUBLIC_SITE_URL set
       EDİLMELİ; build anında da tanımlı olmalı).
   =============================================================== */

/** Genel site URL — sitemap/robots base (yalnız NEXT_PUBLIC_SITE_URL). */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  ""
).replace(/\/+$/, "");

/**
 * Canonical metadataBase — YALNIZ NEXT_PUBLIC_SITE_URL'den.
 * - Şema yoksa `https://` eklenir.
 * - Geçersiz/eksikse `undefined` (Next default; canonical'a yanlış
 *   domain BASILMAZ).
 * - `new URL` ASLA throw etmez (try/catch guard).
 */
export function siteMetadataBase(): URL | undefined {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (!raw) return undefined;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return undefined;
  }
}
