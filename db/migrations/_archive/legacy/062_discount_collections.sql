-- ===============================================================
-- 🛡️ Migration 062 — discount_collections (İndirimli Koleksiyon)
-- ===============================================================
-- AMAÇ:
--   Anasayfa "İndirimli Koleksiyon" section'ı için admin tarafından
--   MANUEL seçilmiş villalar. Mevcut homepage_collections (migration
--   012) sisteminin BİREBİR klonu — ayrı tablo, ayrı tag, sıfır
--   dokunuş.
--
--   ⚠️ SETTINGS BAĞIMLILIĞI YOK (homepage_collections paritesi):
--     - Section başlık/alt başlık FRONTEND'de hardcoded.
--     - Görünürlük OTOMATİK: aktif villa varsa render, yoksa null.
--     - settings tablosuna kolon EKLENMEZ, RPC değişmez.
--
--   Sistem ÖZELLIKLERI (012 ile aynı):
--     - villa_id UNIQUE: aynı villa birden fazla satırda olamaz
--     - is_active toggle: koleksiyondan geçici çıkar/geri al
--     - sort_order: drag-drop ile admin sıralar
--     - custom_title: villa kartında gösterilen başlığı override
--     - custom_cover_image: bucket-relative path (opsiyonel)
--
-- KORUNAN BEHAVIOR:
--   - homepage_collections, settings, villa CRUD, taxonomy, pricing —
--     sıfır dokunuş
--   - villa.id FK; villa hard-delete → ON DELETE CASCADE
--
-- IDEMPOTENT: tablo/index IF NOT EXISTS + CREATE.
-- ===============================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) discount_collections tablosu (homepage_collections 012 klonu)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discount_collections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  villa_id    UUID NOT NULL REFERENCES villa(id) ON DELETE CASCADE,
  sort_order  INT  NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  custom_title       TEXT,
  custom_cover_image TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS discount_collections_villa_unique
  ON discount_collections (villa_id);

CREATE INDEX IF NOT EXISTS discount_collections_active_sort
  ON discount_collections (is_active, sort_order);


COMMIT;

-- ============================================================================
-- ROLLBACK (manuel):
--   DROP TABLE IF EXISTS public.discount_collections;
-- ============================================================================
