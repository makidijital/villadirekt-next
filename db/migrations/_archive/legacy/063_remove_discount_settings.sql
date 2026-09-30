-- ===============================================================
-- 🛡️ Migration 063 — discount_collection_* settings kolonlarını KALDIR
-- ===============================================================
-- NEDEN:
--   Migration 062'nin İLK sürümü settings tablosuna 3 kolon
--   (discount_collection_enabled/title/subtitle) eklemiş ve
--   get_public_settings() RPC'sini bunları içerecek şekilde
--   değiştirmişti. Sonradan mimari değişti: İndirimli Koleksiyon artık
--   homepage_collections paritesinde — settings BAĞIMLILIĞI YOK
--   (başlık/alt başlık hardcoded, görünürlük aktif villa sayısına bağlı).
--
--   062 dosyası repo'da sadeleştirildi AMA migration zaten uygulanmıştı;
--   uygulanan migration canlı şemayı geri almaz. Bu FORWARD migration
--   kalıntı kolonları + RPC referansını temizler.
--
-- ⚠️ SIRA ÖNEMLİ:
--   1) Önce get_public_settings()'i 051 sürümüne (discount kolonları
--      YOK) geri al → RPC artık bu kolonlara referans vermez.
--   2) Sonra kolonları düşür → RPC kırılmaz.
--
-- KORUNAN: discount_collections tablosu (062), homepage_collections,
--   diğer tüm settings kolonları, hero CTA alanları — sıfır dokunuş.
--
-- IDEMPOTENT: DROP COLUMN IF EXISTS + CREATE OR REPLACE FUNCTION.
-- ===============================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) get_public_settings() — 051 sürümüne geri al (discount kolonları YOK).
--    resend_api_key / mail_from* HÂLÂ HARİÇ.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 2) Kalıntı kolonları düşür (artık RPC referans vermiyor → güvenli).
-- ----------------------------------------------------------------------------
ALTER TABLE public.settings
  DROP COLUMN IF EXISTS discount_collection_enabled,
  DROP COLUMN IF EXISTS discount_collection_title,
  DROP COLUMN IF EXISTS discount_collection_subtitle;

COMMIT;

-- ============================================================================
-- DOĞRULAMA (manuel):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='settings'
--       AND column_name LIKE 'discount_collection_%';
--   -- 0 satır dönmeli.
--   SELECT public.get_public_settings();
--   -- jsonb içinde discount_collection_* görünmemeli; hata olmamalı.
-- ============================================================================
