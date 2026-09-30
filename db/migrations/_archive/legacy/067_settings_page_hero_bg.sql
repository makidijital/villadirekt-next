-- ============================================================================
-- Migration 067 — settings.page_hero_background_image + RPC whitelist
-- ============================================================================
-- AMAÇ:
--   Tüm public iç sayfalarda kullanılan ortak PageHero arka plan görseli
--   için tek nullable kolon. Görsel doğrudan gösterilmez; PageHero'da
--   güçlü beyaz/sand overlay + hafif blur + gradient altında DOKU olarak
--   kullanılır (okunabilirlik her zaman korunur).
--
-- TAMAMEN ADDITIVE:
--   1) settings.page_hero_background_image TEXT (nullable) — mevcut satır/
--      sorgulara sıfır risk (mig 007 hero_background_image deseni birebir).
--   2) get_public_settings() RPC whitelist'ine kolon eklenir. RPC açık
--      kolon whitelist'i olduğundan, eklenmezse alan public'e ULAŞMAZ.
--
-- ⚠️ RPC gövdesi 063 (mevcut authoritative sürüm: footer_logo + updated_at
--    dahil, discount kolonları hariç) baz alınır; YALNIZ tek yeni kolon
--    eklenir. Başka hiçbir kolon eklenmez/çıkarılmaz.
--
-- DEĞER: UploadField relative path yazar (site-assets/hero/page-hero.webp).
--   Public tarafta resolveAssetUrlVersioned(path, updated_at) ile URL +
--   cache-bust üretilir. Legacy FULL URL kayıtları da çalışır (pass-through).
--
-- ROLLBACK:
--   ALTER TABLE public.settings DROP COLUMN IF EXISTS page_hero_background_image;
--   -- get_public_settings()'i 063 sürümüne geri al (bu kolon olmadan).
-- ============================================================================

BEGIN;

-- 1) Kolon (additive, nullable)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS page_hero_background_image TEXT;

COMMENT ON COLUMN public.settings.page_hero_background_image IS
  'Tum public ic sayfalarda kullanilan ortak PageHero arka plan gorseli '
  '(site-assets relative path, or. hero/page-hero.webp). Guclu beyaz/sand '
  'overlay + blur + gradient altinda DOKU olarak kullanilir; foto gosterimi '
  'degil. NULL = gorsel yok (yalniz whisper wash).';

-- 2) get_public_settings() — 063 whitelist'i + page_hero_background_image
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

REVOKE ALL ON FUNCTION public.get_public_settings() FROM public;

COMMIT;

-- ============================================================================
-- Doğrulama:
--   SELECT (public.get_public_settings())->'page_hero_background_image';
-- ============================================================================
