-- ===============================================================
-- 🛡️ Migration 012 — homepage_collections (manuel anasayfa curasyonu)
-- ===============================================================
-- AMAÇ:
--   Anasayfa "Sessiz lüks. Akdeniz'de." (VillaList) section'ı için
--   admin tarafından MANUEL seçilmiş villalar. Eğer aktif kayıt
--   YOKSA → VillaList mevcut otomatik getCachedVillas() fallback'ine
--   düşer. Aktif kayıt VARSA → sadece bu liste, sort_order ASC.
--
--   Sistem ÖZELLIKLERI:
--     - villa_id UNIQUE: aynı villa birden fazla satırda olamaz
--     - is_active toggle: koleksiyondan geçici çıkar/geri al
--     - sort_order: drag-drop ile admin sıralar
--     - custom_title: villa kartında gösterilen başlığı override
--     - custom_cover_image: bucket-relative path (kategori/bölge
--       cover sistemi ile aynı semantic; opsiyonel, NULL → villa'nın
--       kendi cover'ı kullanılır)
--
-- KORUNAN BEHAVIOR:
--   - villa CRUD, taxonomy, pricing, reservation — sıfır dokunuş
--   - villa.id FK; villa hard-delete edilirse ON DELETE CASCADE
--   - getCachedVillas, getCachedCategoryCovers — değişmez
--
-- IDEMPOTENT: tablo IF NOT EXISTS; index'ler IF NOT EXISTS.
-- ===============================================================

CREATE TABLE IF NOT EXISTS homepage_collections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  villa_id    UUID NOT NULL REFERENCES villa(id) ON DELETE CASCADE,
  sort_order  INT  NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  /* Villa kartı başlığını override eder (NULL → villa.title). */
  custom_title       TEXT,
  /* Storage bucket-relative path (site-assets bucket).
     NULL → villa'nın kendi cover image fallback'i. */
  custom_cover_image TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

/* Aynı villa için tek satır kuralı — admin çift eklemeyi engeller. */
CREATE UNIQUE INDEX IF NOT EXISTS homepage_collections_villa_unique
  ON homepage_collections (villa_id);

/* Sıralama + filter index — aktif + sıraya göre sorgular için. */
CREATE INDEX IF NOT EXISTS homepage_collections_active_sort
  ON homepage_collections (is_active, sort_order);