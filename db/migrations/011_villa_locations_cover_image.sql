-- ===============================================================
-- 🛡️ Migration 011 — villa_locations.cover_image (bölge kapak görseli)
-- ===============================================================
-- AMAÇ:
--   Her villa_location için tek kapak görseli. Migration 010
--   (villa_types.cover_image) ile BİREBİR paralel mimari:
--   bucket-relative path saklanır, public URL runtime'da
--   `eski sağlayıcı.storage.from(bucket).getPublicUrl(path)` ile üretilir.
--
--   ÖRNEK DB DEĞERİ:
--     'location-covers/kalkan.webp'
--   ÖRNEK RUNTIME URL (production'da):
--     https://<proj>.eski storage host/storage/v1/object/public/site-assets/
--       location-covers/kalkan.webp
--
-- KORUNAN BEHAVIOR:
--   - villa_locations.id, name, slug, created_at — hepsi aynı.
--   - villa.location_id FK ondan bağımsız.
--   - cache "taxonomy" tag'i aynı; admin upload sonrası
--     revalidateTaxonomy() invalidate eder.
--
-- IDEMPOTENT: `IF NOT EXISTS` ile N kere koşulabilir.
-- ===============================================================

ALTER TABLE villa_locations
  ADD COLUMN IF NOT EXISTS cover_image TEXT;