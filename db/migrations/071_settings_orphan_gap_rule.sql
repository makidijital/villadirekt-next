-- ============================================================================
-- Migration 071 — settings.orphan_gap_rule_enabled + get_public_settings whitelist
-- ============================================================================
-- AMAÇ:
--   Public booking'de "orphan gap / minimum konaklama boşluk kuralı"nı admin
--   panelinden aç/kapatabilmek için `settings` tablosuna tek boolean kolon
--   ekler ve public `get_public_settings()` whitelist'ine dahil eder.
--
--   KURAL (uygulama katmanı): true → müşteri, minimum konaklama süresinden
--   daha kısa "kullanılamaz" bir boşluk bırakacak tarih aralığını seçemez.
--   Mevcut minimum-stay ve exact gap-fill davranışları DEĞİŞMEZ; bu yalnız
--   EK bir eleme. Kural mantığı lib/stay-rules.helper.ts (saf) + useBookingEngine
--   (frontend) + /api/public/reservations (backend) içindedir.
--
-- DEFAULT: true (AÇIK). Mevcut tek settings satırı ALTER anında default'u alır.
--   NULL asla beklenmez; uygulama katmanı NULL'ı yine de fail-safe TRUE sayar.
--
-- ⚠️ NATIVE POSTGRESQL (migration 068 CANON):
--   Bu projede anon/authenticated/service_role rolleri YOK; RLS/GRANT/REVOKE
--   eski sağlayıcı dönemi kalıntısıdır. Bu migration BİLİNÇLİ olarak native desenle
--   yazıldı: role/grant/revoke/RLS YOK. get_public_settings() SECURITY DEFINER
--   olarak CREATE OR REPLACE edilir; tek app-rolü doğrudan çağırır.
--   (067 sürümündeki `GRANT ... TO anon, authenticated, service_role` satırları
--    native DB'de "role does not exist" hatası verdiği için DAHİL EDİLMEDİ.)
--
-- İDEMPOTENT: add column if not exists + create or replace function.
--   --single-transaction ile güvenle uygulanır (rol referansı YOK → abort yok).
--
-- ROLLBACK (gerekirse):
--   ALTER TABLE public.settings DROP COLUMN IF EXISTS orphan_gap_rule_enabled;
--   -- get_public_settings()'i 067 sürümüne geri al (bu kolon olmadan).
-- ============================================================================

BEGIN;

-- 1) Kolon (additive, default AÇIK)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS orphan_gap_rule_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.settings.orphan_gap_rule_enabled IS
  'Public booking orphan-gap / minimum konaklama bosluk kurali. true → '
  'minimum stay''den kisa kullanilamaz bosluk birakan secim engellenir. '
  'Mevcut minimum-stay ve exact gap-fill davranisini DEGISTIRMEZ (ek eleme). '
  'Default true. Yalniz public musteri booking''ini etkiler.';

-- 2) get_public_settings() — 067 whitelist'i + orphan_gap_rule_enabled.
--    (Native: grant/revoke YOK. Whitelist 067 ile birebir; yalniz 1 kolon eklendi.)
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT to_jsonb(t)
  FROM (
    SELECT
      id,
      site_name, phone, email, address,
      prepayment_rate,
      orphan_gap_rule_enabled,
      site_logo,
      footer_logo,
      watermark_logo, watermark_enabled, watermark_opacity,
      watermark_position, watermark_size,
      hero_enabled, hero_title, hero_subtitle, hero_background_image,
      hero_overlay_opacity,
      hero_primary_cta_text, hero_primary_cta_href,
      hero_secondary_cta_text, hero_secondary_cta_href, hero_badge_text,
      page_hero_background_image,
      business_hours,
      instagram, facebook, youtube, tiktok, whatsapp_link,
      default_meta_title, default_meta_description, default_og_image,
      robots_index, robots_follow,
      google_site_verification, yandex_verification, bing_verification,
      favicon_url, browser_theme_color, footer_copyright, company_legal_name,
      custom_head_scripts, analytics_script, gtm_container_id,
      maintenance_mode, maintenance_message,
      updated_at
    FROM public.settings
    LIMIT 1
  ) t;
$$;

COMMIT;

-- ============================================================================
-- UYGULAMA (native production, manuel):
--   psql "$DATABASE_URL" --single-transaction -f db/migrations/071_settings_orphan_gap_rule.sql
-- DOĞRULAMA:
--   SELECT orphan_gap_rule_enabled FROM public.settings LIMIT 1;                -- true
--   SELECT (public.get_public_settings() ->> 'orphan_gap_rule_enabled');        -- "true"
-- ============================================================================
