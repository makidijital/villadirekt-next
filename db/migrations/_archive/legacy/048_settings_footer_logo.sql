-- ============================================================================
-- Migration 048 — settings.footer_logo (footer'a özel negatif/beyaz logo)
-- ============================================================================
-- AMAÇ:
--   Footer artık koyu (lacivert) premium zemin kullanıyor. Bazı markaların
--   mevcut `site_logo`'su koyu zeminde yeterince görünmeyebilir. Footer için
--   ayrı bir logo (beyaz/negatif versiyon) yüklenebilsin.
--
-- DAVRANIŞ:
--   - `site_logo` AYNEN kalır (header, mobil menü vb.).
--   - `footer_logo` opsiyonel; NULL ise footer `site_logo`'ya fallback eder
--     (application-layer; bkz. Footer.tsx).
--   - Storage path: site-assets/logo/footer-logo.webp (mevcut logo upload
--     mimarisi yeniden kullanılır; folder="logo", slug="footer-logo").
--
-- ⚠️ get_public_settings RPC GÜNCELLEMESİ ZORUNLU:
--   Public footer `getPublicSettings()` → SECURITY DEFINER RPC
--   `get_public_settings` (mig 041) ile okur. Bu RPC whitelist projeksiyon
--   kullanıyor; `footer_logo` whitelist'e EKLENMEZSE public footer alanı
--   HİÇ görmez. Bu yüzden RPC CREATE OR REPLACE ile yeniden tanımlanır
--   (resend_api_key hariç tutma davranışı AYNEN; sadece footer_logo eklendi).
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
-- ROLLBACK:
--   alter table public.settings drop column if exists footer_logo;
--   (RPC eski hâline 041'i tekrar koşarak döndürülebilir.)
-- ============================================================================

alter table public.settings
  add column if not exists footer_logo text null;

comment on column public.settings.footer_logo is
  'Footer''a özel logo (koyu zemin için beyaz/negatif). NULL → footer '
  'site_logo''ya fallback eder (application-layer). Storage: '
  'site-assets/logo/footer-logo.webp.';

-- ----------------------------------------------------------------------------
-- get_public_settings RPC — footer_logo whitelist'e eklendi (mig 041 + bu alan)
-- resend_api_key / mail_from / mail_from_name HÂLÂ ÇIKTIDA YOK.
-- ----------------------------------------------------------------------------
create or replace function public.get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select to_jsonb(t)
  from (
    select
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
      business_hours,
      instagram, facebook, youtube, tiktok, whatsapp_link,
      default_meta_title, default_meta_description, default_og_image,
      robots_index, robots_follow,
      google_site_verification, yandex_verification, bing_verification,
      favicon_url, browser_theme_color, footer_copyright, company_legal_name,
      custom_head_scripts, analytics_script, gtm_container_id,
      maintenance_mode, maintenance_message
    from public.settings
    limit 1
  ) t;
$$;

revoke all on function public.get_public_settings() from public;