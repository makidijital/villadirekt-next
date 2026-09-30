/* ===============================================================
   🛡️ FAZ 38 — STORAGE BUCKET CONSTANTS
   ===============================================================
   Tüm bucket isimleri tek dosyada. Hard-coded bucket string'leri
   provider yerine bu sabitleri kullanır → provider migration'da
   tek dosya değişiklik.

   ⚠️ KESIN KURAL — Bucket adları AYNEN (R2 fiziksel adlar):
     - "tatilinyeri-villa-images"  → villa gallery + private-token-aware reads
     - "tatilinyeri-site-assets"   → logo/watermark/favicon/hero/og + branding/
                                   + category-covers/ + location-covers/ +
                                   page-covers/
   =============================================================== */

export const STORAGE_BUCKETS = {
  /** Villa gallery + admin upload. Migration 003 + 005 düzeyinde
   *  RLS policy'leriyle gel — admin write, anon read. */
  VILLA_IMAGES: "tatilinyeri-villa-images",

  /** Singleton site varlıkları + admin branding + cover'lar. */
  SITE_ASSETS: "tatilinyeri-site-assets",
} as const;

/** Tip-güvenli union — caller'lar `STORAGE_BUCKETS.VILLA_IMAGES`
 *  veya `STORAGE_BUCKETS.SITE_ASSETS` dışında bucket geçemez. */
export type StorageBucket =
  (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];
