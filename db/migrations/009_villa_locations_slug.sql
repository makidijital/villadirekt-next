-- ===============================================================
-- 🛡️ Migration 009 — villa_locations.slug (SEO-friendly URL)
-- ===============================================================
-- AMAÇ:
--   Bölge URL'leri için human-readable, SEO-friendly slug.
--   /arama?regions=2f99586c-...  →  /arama?regions=kalkan
--
-- IDEMPOTENT:
--   Kolon ve index `IF NOT EXISTS` ile eklenir. Admin tarafından
--   manuel slug'lar mevcutsa korunur (backfill sadece slug IS NULL
--   olan satırları doldurur). Migration N kere koşulabilir, side
--   effect yok.
--
-- KORUNAN BEHAVIOR:
--   - villa_locations.id (UUID) PRIMARY KEY aynen.
--   - villa.location_id FK aynen.
--   - /arama page'i hem UUID hem slug accept eder (resolver layer).
--   - Mevcut tüm filter/availability/reservation logic dokunulmaz.
--
-- STRATEJİ — Migration 008 (villa_types.slug) ile birebir paralel.
-- ===============================================================

-- 1) Column
ALTER TABLE villa_locations
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2) Partial unique index (NULL satırlar dışlanır)
CREATE UNIQUE INDEX IF NOT EXISTS villa_locations_slug_unique
  ON villa_locations (slug)
  WHERE slug IS NOT NULL;

-- 3) Backfill — Türkçe-aware slugify, çakışmaları swallow et
DO $$
DECLARE
  r RECORD;
  candidate TEXT;
BEGIN
  FOR r IN
    SELECT id, name
      FROM villa_locations
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

    IF candidate IS NULL OR length(candidate) = 0 THEN
      CONTINUE;
    END IF;

    BEGIN
      UPDATE villa_locations SET slug = candidate WHERE id = r.id;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
END $$;