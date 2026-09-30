-- ============================================================================
-- Migration 041 — PUBLIC SETTINGS RPC (SECURITY DEFINER, SECRET-SAFE)
-- ============================================================================
-- AMAÇ:
--   settings tablosu secret kolon içerir ve admin-only olarak kapatılacaktı.
--   Public site (TopBar/ReservationForm/useBookingEngine + tüm public server
--   pages → getCachedSettings) settings'i doğrudan okuyordu. Bu RPC, public
--   tarafın resend_api_key GÖRMEDEN güvenli public kolonları okuyabilmesi için
--   SECURITY DEFINER bir kapı sağlar (039 availability RPC deseniyle aynı).
--
--   ❌ resend_api_key / mail_from / mail_from_name → RPC ÇIKTISINDA YOK.
--   ✅ Tüm public site config kolonları (contact/social/hero/SEO/branding/
--      prepayment/maintenance/scripts) → güvenli.
--
-- DAVRANIŞ:
--   - to_jsonb projeksiyonu → tek satır jsonb objesi (row yoksa null).
--   - getPublicSettings() bunu çağırır; dönen jsonb `Settings` (safe subset)
--     olarak parse edilir. resend_api_key alanı tanımsız gelir.
--   - SECURITY DEFINER + pinned search_path → tablo kapatılsa da public
--     okuma çalışır (definer tablo sahibi yetkisiyle okur).
--
-- ÖZELLİKLER: idempotent (CREATE OR REPLACE) · search_path pinned · additive
--   (042'den ÖNCE deploy edilir, hiçbir şeyi bozmaz).
-- ============================================================================

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

-- ----------------------------------------------------------------------------
-- DOĞRULAMA / ROLLBACK
-- ----------------------------------------------------------------------------
-- select public.get_public_settings();  -- jsonb döner, resend_api_key YOK
-- drop function if exists public.get_public_settings();
-- ============================================================================
