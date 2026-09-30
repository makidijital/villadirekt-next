-- ============================================================================
-- 🛡️ 007 — SETTINGS HOMEPAGE HERO FIELDS
-- ============================================================================
-- Bu migration `settings` tablosuna 10 nullable hero alanı ekler.
-- Tümü optional; eksik kolon hardcoded fallback'a düşer
-- (lib/hero.helpers.ts > resolveHeroContent).
--
-- ÇOK ÖNEMLİ:
--   Kolonlar olmadan updateSettings(form) çağrısı Postgres'te
--   "column does not exist" hatasıyla fail eder ve TÜM settings
--   save'i (logo, watermark, mail config dahil) reddedilir. Bu
--   migration uygulanmadan admin Hero alanlarını kaydedemez.
--
-- BACKWARD COMPAT:
--   Tüm alanlar nullable + default null. Mevcut satırlar etkilenmez.
--   ADD COLUMN IF NOT EXISTS — idempotent; tekrar uygulamak güvenli.
--
-- ROLLBACK:
--   ALTER TABLE settings
--     DROP COLUMN hero_enabled,
--     DROP COLUMN hero_title,
--     ... (geri kalanı sırayla)
-- ============================================================================

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS hero_enabled            BOOLEAN,
  ADD COLUMN IF NOT EXISTS hero_title              TEXT,
  ADD COLUMN IF NOT EXISTS hero_subtitle           TEXT,
  ADD COLUMN IF NOT EXISTS hero_background_image   TEXT,
  ADD COLUMN IF NOT EXISTS hero_overlay_opacity    NUMERIC,
  ADD COLUMN IF NOT EXISTS hero_primary_cta_text   TEXT,
  ADD COLUMN IF NOT EXISTS hero_primary_cta_href   TEXT,
  ADD COLUMN IF NOT EXISTS hero_secondary_cta_text TEXT,
  ADD COLUMN IF NOT EXISTS hero_secondary_cta_href TEXT,
  ADD COLUMN IF NOT EXISTS hero_badge_text         TEXT;

COMMENT ON COLUMN settings.hero_enabled IS
  'Homepage hero master toggle. false ise tüm custom hero alanları bypass; defaults render.';
COMMENT ON COLUMN settings.hero_background_image IS
  'Hero arka plan görseli public URL (site-assets/hero/homepage-hero.webp). Clean URL; cache-busting render zamanında eklenir.';
COMMENT ON COLUMN settings.hero_overlay_opacity IS
  '0..1 arası overlay yoğunluğu. 1 = mevcut full overlay (default), 0 = overlay yok.';