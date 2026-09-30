-- ============================================================================
-- Migration 051 — settings.updated_at + auto-touch trigger + RPC whitelist
-- ============================================================================
-- AMAÇ:
--   Anasayfa Hero görseli admin'den değiştirildikten sonra browser /
--   R2 storage CDN / Next/Image optimizer cache'lerinin EŞ ZAMANLI
--   miss etmesi gerekiyor. Cache-bust mekanizması (lib/hero.helpers.ts
--   > withCacheBust) URL'e `?ts=<cacheKey>` ekliyor. `cacheKey` =
--   `settings.updated_at ?? <12h bucket>` (app/(public)/page.tsx:65-74).
--
--   Bugüne kadar `settings` tablosunda `updated_at` kolonu YOK ve RPC
--   whitelist'i bu alanı dönmüyordu → cacheKey her zaman 12-saatlik
--   bucket'a düşüyor → upload sonrası `?ts=` değişmiyor → cache layers
--   ESKİ byte'ları döndürmeye devam ediyor. (Detaylı kök neden analizi
--   konuşma transcript'inde.)
--
-- BU MIGRATION:
--   1) settings tablosuna `updated_at timestamptz NOT NULL DEFAULT now()`
--      ekler (additive). Mevcut tek satırın `updated_at`'i `now()` ile
--      doldurulur (DEFAULT ile ADD COLUMN backfill semantic'i).
--   2) BEFORE UPDATE trigger function `trg_settings_touch_updated_at()`
--      + trigger `settings_touch_updated_at`. Her UPDATE'te
--      `NEW.updated_at = now()` set edilir. Application koduna dokunmak
--      gerekmez.
--   3) get_public_settings() RPC whitelist'ine `updated_at` ekler.
--      Public render bu alanı okuyabilsin diye. resend_api_key /
--      mail_from* hâlâ HARİÇ.
--
-- KORUNAN (DOKUNULMAZ):
--   • Mevcut tüm settings kolonları (id, site_name, hero_*, footer_logo,
--     watermark_*, mail/Resend, SEO, sosyal, maintenance, vb.).
--   • Storage path `site-assets/hero/homepage-hero.webp` — değişmez.
--   • Upload sistemi (SettingsField.tsx) — değişmez.
--   • lib/hero.helpers.ts withCacheBust mantığı — değişmez.
--   • app/(public)/page.tsx heroCacheKey hesabı — zaten
--     `settings.updated_at ?? stableBucket` cast'i mevcut; yeni alan
--     otomatik kullanılır.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION +
-- DROP TRIGGER IF EXISTS + CREATE TRIGGER. Migration tekrar koşulabilir.
--
-- ROLLBACK (en alt bölümde).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) settings.updated_at kolonu
-- ----------------------------------------------------------------------------
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.settings.updated_at IS
  'Son güncelleme timestamp''i. BEFORE UPDATE trigger ile auto-touch. '
  'Anasayfa Hero görsel cache-bust mekanizması bu alana bağlı (page.tsx '
  '> heroCacheKey > lib/hero.helpers.ts > withCacheBust).';

-- ----------------------------------------------------------------------------
-- 2) BEFORE UPDATE trigger — auto-touch updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_settings_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Trigger DROP + CREATE (idempotent re-run guard)
DROP TRIGGER IF EXISTS settings_touch_updated_at ON public.settings;

CREATE TRIGGER settings_touch_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_settings_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3) get_public_settings() RPC — whitelist'e updated_at eklendi
--    (mig 041 + 048 + 051) — resend_api_key / mail_from* HÂLÂ HARİÇ.
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

COMMIT;


-- ----------------------------------------------------------------------------
-- DOĞRULAMA
-- ----------------------------------------------------------------------------
--   -- Kolon mevcut mu?
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='settings' AND column_name='updated_at';
--
--   -- Trigger çalışıyor mu?
--   UPDATE public.settings SET site_name = site_name WHERE id = (SELECT id FROM public.settings LIMIT 1);
--   SELECT id, updated_at FROM public.settings;
--   -- updated_at, UPDATE çağrısının tam zamanına eşit olmalı.
--
--   -- RPC çıktısı updated_at içeriyor mu?
--   SELECT public.get_public_settings();
--   -- jsonb içinde updated_at field'ı görünmeli; resend_api_key görünmemeli.


-- ----------------------------------------------------------------------------
-- ROLLBACK
-- ----------------------------------------------------------------------------
--   BEGIN;
--     -- 1) RPC'yi mig 048 haline döndür (updated_at projeksiyon dışı):
--     --    041 + 048'i tekrar koş (CREATE OR REPLACE).
--     -- 2) Trigger + function:
--     DROP TRIGGER IF EXISTS settings_touch_updated_at ON public.settings;
--     DROP FUNCTION IF EXISTS public.trg_settings_touch_updated_at();
--     -- 3) Kolon:
--     ALTER TABLE public.settings DROP COLUMN IF EXISTS updated_at;
--   COMMIT;
-- ============================================================================
