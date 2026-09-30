-- ===============================================================
-- 🛡️ Migration 010 — villa_types.cover_image (kategori kapak görseli)
-- ===============================================================
-- AMAÇ:
--   Her villa_type için tek kapak görseli. Full public URL DEĞİL,
--   sadece R2 storage RELATIVE PATH kaydedilir. Bucket adı,
--   project URL veya CDN domain değişirse DB değeri kırılmaz —
--   runtime'da `eski sağlayıcı.storage.from(bucket).getPublicUrl(path)`
--   ile public URL üretilir.
--
--   ÖRNEK DB DEĞERİ:
--     'category-covers/balayi-villalari.webp'
--   ÖRNEK RUNTIME URL (production'da):
--     https://<proj>.eski storage host/storage/v1/object/public/site-assets/
--       category-covers/balayi-villalari.webp
--
-- KORUNAN BEHAVIOR:
--   - villa_types.id, name, slug, created_at — hepsi aynı.
--   - villa_type_relations + villa_images join'i (CategoryCollection
--     count map) aynı; bu kolon ondan bağımsız.
--   - cache "taxonomy" tag'i aynı; admin upload sonrası
--     revalidateTaxonomy() invalidate eder.
--
-- IDEMPOTENT: `IF NOT EXISTS` ile N kere koşulabilir.
-- ===============================================================

ALTER TABLE villa_types
  ADD COLUMN IF NOT EXISTS cover_image TEXT;