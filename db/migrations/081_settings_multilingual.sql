-- ============================================================================
-- Migration 081 — settings.multilingual_enabled + public_default_locale
--                 + get_public_settings whitelist (PHASE 1A — SETTINGS ONLY)
-- ============================================================================
-- AMAÇ:
--   Çoklu dil (TR/EN/DE) sistemine geçişin İLK fazı. Bu migration YALNIZ
--   admin panelinden çoklu dil sisteminin açık/kapalı olabilmesi ve public
--   varsayılan dilin seçilebilmesi için `settings` tablosuna 2 kolon ekler
--   ve bunları public `get_public_settings()` whitelist'ine dahil eder.
--
--   BU MIGRATION İLE BİRLİKTE:
--     - Hiçbir public URL, routing, middleware davranışı DEĞİŞMEZ.
--     - Hiçbir çeviri/dictionary/locale-resolver sistemi KURULMAZ.
--     - Hiçbir UI dil seçici EKLENMEZ.
--     - Fiyat/indirim/rezervasyon/pool-heating/cache mimarisi ETKİLENMEZ.
--   multilingual_enabled DEFAULT false olduğu için mevcut site davranışı
--   BİREBİR AYNI kalır (bu satır DB seviyesinde garanti edilir).
--
-- KOLONLAR (additive, mevcut satır bozulmaz):
--   multilingual_enabled   boolean NOT NULL DEFAULT false
--   public_default_locale  text    NOT NULL DEFAULT 'tr'
--                           CHECK (public_default_locale IN ('tr','en','de'))
--
--   Mevcut tek settings satırı ALTER anında bu default'ları alır — hiçbir
--   backfill/veri taşıma gerekmez, mevcut hiçbir kolon değişmez/rename
--   edilmez.
--
-- ⚠️ NATIVE POSTGRESQL (migration 068 CANON — 071'deki desenle AYNI):
--   Bu projede anon/authenticated/service_role rolleri YOK; RLS/GRANT/
--   REVOKE eski sağlayıcı dönemi kalıntısıdır (071'in kendi yorumunda da belirtildi).
--   Bu migration BİLİNÇLİ olarak native desenle yazıldı: role/grant/revoke/
--   RLS değişikliği YOK. get_public_settings() SECURITY DEFINER olarak
--   CREATE OR REPLACE edilir; tek app-rolü (service-role bağlantısı)
--   doğrudan çağırır. 071 sürümünün whitelist'i birebir korunur, yalnız
--   2 yeni kolon EKLENİR.
--
-- İDEMPOTENT: add column if not exists + create or replace function.
--   --single-transaction ile güvenle uygulanır (rol referansı YOK → abort yok).
--
-- ROLLBACK (gerekirse):
--   BEGIN;
--     ALTER TABLE public.settings DROP COLUMN IF EXISTS multilingual_enabled;
--     ALTER TABLE public.settings DROP COLUMN IF EXISTS public_default_locale;
--     -- get_public_settings()'i 071 sürümüne geri al (bu 2 kolon olmadan).
--   COMMIT;
-- ============================================================================

BEGIN;

-- 1) Kolonlar (additive, default KAPALI / 'tr')
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS multilingual_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS public_default_locale text NOT NULL DEFAULT 'tr';

-- CHECK constraint — yalnız tr/en/de kabul edilir. Kolon DEFAULT 'tr' ile
-- NOT NULL eklendiği için mevcut tek satır constraint'i sorunsuz karşılar
-- (mevcut veri riske girmez — yeni kolon, backfill yok).
DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'settings_public_default_locale_check'
      AND conrelid = 'public.settings'::regclass
  ) THEN
    ALTER TABLE public.settings
      ADD CONSTRAINT settings_public_default_locale_check
      CHECK (public_default_locale IN ('tr', 'en', 'de'));
  END IF;
END
$constraint$;

COMMENT ON COLUMN public.settings.multilingual_enabled IS
  'Çoklu dil (TR/EN/DE) sisteminin admin tarafından açık/kapalı edilmesi. '
  'PHASE 1A — yalnız ayar altyapısı; false iken public site davranışı '
  'BİREBİR eskisi gibi (routing/UI/cache/fiyat etkilenmez). Default false.';

COMMENT ON COLUMN public.settings.public_default_locale IS
  'Çoklu dil AÇIKKEN public sitenin ilk-ziyaretçi varsayılan dili '
  '(tr | en | de). multilingual_enabled=false iken kullanılmaz (site '
  'yine tr davranır). Default ''tr''. CHECK ile 3 değerle sınırlı.';

-- 2) get_public_settings() — 071 whitelist'i + multilingual_enabled +
--    public_default_locale. (Native: grant/revoke YOK. Whitelist 071 ile
--    birebir; yalnız 2 kolon eklendi.)
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
      multilingual_enabled,
      public_default_locale,
      updated_at
    FROM public.settings
    LIMIT 1
  ) t;
$$;

COMMIT;

-- ============================================================================
-- UYGULAMA (native production, manuel — YALNIZ AÇIK ONAY SONRASI):
--   psql "$DATABASE_URL" --single-transaction -f db/migrations/081_settings_multilingual.sql
-- DOĞRULAMA:
--   SELECT multilingual_enabled, public_default_locale FROM public.settings LIMIT 1;
--     -- beklenen: false, 'tr'
--   SELECT (public.get_public_settings() ->> 'multilingual_enabled');   -- "false"
--   SELECT (public.get_public_settings() ->> 'public_default_locale');  -- "tr"
--   -- CHECK constraint testi (başarısız olmalı):
--   -- UPDATE public.settings SET public_default_locale = 'fr';  -- ERROR beklenir
-- ============================================================================
