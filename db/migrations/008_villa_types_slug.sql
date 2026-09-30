-- ===============================================================
-- 🛡️ Migration 008 — villa_types.slug (SEO-friendly URL)
-- ===============================================================
-- AMAÇ:
--   Kategori URL'leri için human-readable, SEO-friendly slug alanı.
--   /arama?categories=2f99586c-a997-...  →  /arama?categories=balayi-villalari
--
-- KORUNAN BEHAVIOR:
--   - villa_types.id (UUID) PRIMARY KEY aynen kalır.
--   - villa_type_relations.type_id → UUID aynen kalır.
--   - /arama page'i hem UUID hem slug accept eder (resolver layer).
--   - Mevcut tüm filter/availability/reservation logic dokunulmaz.
--
-- STRATEJİ:
--   1) `slug TEXT NULL` — nullable başlar; eski kayıtlar geçici olarak
--      slug'sız çalışabilir (FE fallback UUID'ye düşer).
--   2) PARTIAL UNIQUE INDEX `slug IS NOT NULL` — duplicate slug
--      yasaklanır ama mevcut NULL satırlar için constraint çalışmaz.
--   3) BACKFILL — Türkçe karakter aware slugify:
--        translate(ı→i, ş→s, ç→c, ğ→g, ü→u, ö→o, â→a, î→i, û→u)
--      sonra regex ile non-alphanumeric → '-', leading/trailing '-' trim.
--
-- BACKFILL COLLISION:
--   Aynı normalized slug'a düşen 2+ kayıt varsa (örn. "Balayı" ve
--   "balayi" → her ikisi "balayi") UNIQUE index ihlal eder ve update
--   o satır için fail eder. Bu durumda admin manuel olarak slug'ı
--   düzenleyebilir (FE service `addVillaType` / `updateVillaType`
--   katmanı slug field'ı support eder).
-- ===============================================================

-- 1) Column
ALTER TABLE villa_types
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2) Partial unique index (NULL satırlar dışlanır → backward-compat)
CREATE UNIQUE INDEX IF NOT EXISTS villa_types_slug_unique
  ON villa_types (slug)
  WHERE slug IS NOT NULL;

-- 3) Backfill — sadece slug IS NULL olanlar; collision olursa atla
--    (PostgreSQL UPDATE'i tek tek fail etmez, set-based; ama UNIQUE
--    ihlali oluşursa tüm UPDATE rollback olur. Bu yüzden satır satır
--    DO block kullanıyoruz; çakışan satır bırakılır, diğerleri set'lenir.)
DO $$
DECLARE
  r RECORD;
  candidate TEXT;
BEGIN
  FOR r IN
    SELECT id, name
      FROM villa_types
     WHERE slug IS NULL
       AND name IS NOT NULL
       AND length(trim(name)) > 0
  LOOP
    candidate := lower(
      regexp_replace(
        regexp_replace(
          translate(
            r.name,
            'ıİşŞçÇğĞüÜöÖâÂîÎûÛ',
            'iIsScCgGuUoOaAiIuU'
          ),
          '[^A-Za-z0-9]+', '-', 'g'
        ),
        '(^-|-$)', '', 'g'
      )
    );

    -- Boş çıktı (örn. sadece özel karakterler) varsa atla.
    IF candidate IS NULL OR length(candidate) = 0 THEN
      CONTINUE;
    END IF;

    -- UNIQUE çakışmasını swallow et: ayrı try block.
    BEGIN
      UPDATE villa_types SET slug = candidate WHERE id = r.id;
    EXCEPTION WHEN unique_violation THEN
      -- Çakışma → admin manuel düzeltsin.
      CONTINUE;
    END;
  END LOOP;
END $$;