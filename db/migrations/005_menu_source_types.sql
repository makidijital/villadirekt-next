-- ============================================================================
-- 🛡️ 005 — MENU DYNAMIC NAVIGATION SOURCE ARCHITECTURE
-- ============================================================================
-- Bu migration `menu` tablosuna iki nullable kolon ekler:
--   - source_type  TEXT  → 'manual' | 'page' | 'category' | 'region'
--   - source_id    UUID  → kaynak entity id (non-manual durumlar için)
--
-- AMAÇ:
--   Menu item'ı bir "navigation reference" gibi davranabilsin.
--   Hardcoded title/url duplicate edilmez; render zamanında source
--   tablosundan resolve edilir:
--     manual   → menu.name, menu.href                  (mevcut davranış)
--     page     → pages.title, /p/{pages.slug}          (source_id = pages.id)
--     category → villa_types.name, /arama?categories=  (source_id = villa_types.id)
--     region   → villa_locations.name, /arama?regions= (source_id = villa_locations.id)
--
-- BACKWARD COMPATIBILITY:
--   Mevcut tüm menu satırları source_type='manual' olarak backfill edilir
--   ve source_id NULL kalır. menu.name + menu.href canonical olarak
--   kullanılmaya devam eder. Hiçbir mevcut menu öğesinin davranışı
--   değişmez.
--
-- ORPHAN HANDLING (application-level):
--   Non-manual türlerin source kaydı silinirse / pasif olursa
--   (villa_types.delete, villa_locations.delete, pages.is_active=false),
--   resolver bu menu satırını tree'den ÇIKARIR → frontend menüsünde
--   sessizce gizlenir. Admin Menü Yönetimi ekranı bu durumda satırı
--   "kaynak bulunamadı" işareti ile göstererek temizleme imkanı verir.
--
-- CROSS-TABLE FK YOK:
--   source_id farklı tablolara işaret edebileceği için (pages /
--   villa_types / villa_locations), tek FK constraint mümkün değil.
--   Integrity application tarafında.
--
-- ROLLBACK:
--   ALTER TABLE menu DROP COLUMN source_type;
--   ALTER TABLE menu DROP COLUMN source_id;
-- ============================================================================

ALTER TABLE menu
  ADD COLUMN IF NOT EXISTS source_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS source_id UUID NULL;

-- Mevcut tüm satırları manual olarak işaretle (idempotent).
UPDATE menu
SET source_type = 'manual'
WHERE source_type IS NULL;

COMMENT ON COLUMN menu.source_type IS
  'Navigation source: manual | page | category | region. Non-manual türlerde menu.name/href cache; render zamanında source tablosundan resolve edilir.';

COMMENT ON COLUMN menu.source_id IS
  'Non-manual: kaynak entity id (pages/villa_types/villa_locations).id. Cross-table reference; FK yok, orphan handling application tarafında (resolve fail → menu satırı tree''den gizlenir).';