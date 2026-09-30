-- ===============================================================
-- 096 — site_popup_translations (AÇILIŞ POPUP'I — EN/DE İÇERİK)
-- ===============================================================
-- AMAÇ:
--   Açılış popup'ının (migration 095) metin içeriğinin İngilizce ve
--   Almanca karşılıkları. Admin: Ayarlar > Açılış Popup > dil sekmeleri.
--
-- ŞEMA GEREKÇESİ — projedeki mevcut çeviri deseni (082/083/086/088/089):
--   <parent>_id + locale + dedike çevrilebilir kolonlar + CHECK + UNIQUE.
--   JSONB/EAV yerine dedike kolon: çevrilebilir alan listesi şemanın
--   kendisiyle sınırlanır; uzunluk CHECK'leri 095 ile birebir aynıdır.
--
-- TR CANONICAL = public.site_popup SATIRININ KENDİSİ:
--   Mevcut Türkçe içerik (title/description/highlight_text/stats/
--   button_text/button_url) YERİNDE kalır; bu migration site_popup'a
--   HİÇ DOKUNMAZ (kolon/satır/constraint değişmez), taşıma/backfill
--   GEREKMEZ ve veri kaybı olmaz. Bu tabloda TR satırı TUTULMAZ
--   (CHECK ile yasak — 083 ile aynı gerekçe: iki doğruluk kaynağı olmasın).
--
-- DİL-BAĞIMSIZ ALANLAR çevrilmez (site_popup'ta tek kopya):
--   is_enabled, image_path (R2 görseli), show_button, display_scope,
--   dismiss_duration, starts_at, ends_at.
--
-- FALLBACK (uygulama katmanı, lib/site-popup.ts):
--   EN/DE alanı boş/NULL → aynı alanın Türkçe değeri gösterilir.
--   Satır hiç yoksa → popup tamamen Türkçe gösterilir.
--
-- YENİ DİL: locale CHECK'ine eklenir (082/083 ile aynı yöntem).
--
-- BAĞIMLILIK: public.site_popup (095) + public.trg_touch_updated_at() (082).
-- İDEMPOTENT: CREATE TABLE IF NOT EXISTS + DROP/CREATE TRIGGER.
-- ===============================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.site_popup') IS NULL THEN
    RAISE EXCEPTION 'Migration 096, 095_site_popup.sql''e bağlıdır. Önce 095''i uygulayın.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'trg_touch_updated_at'
  ) THEN
    RAISE EXCEPTION
      'Migration 096, 082_translation_tables.sql''in public.trg_touch_updated_at() fonksiyonuna bağlıdır. Önce 082''yi uygulayın.';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.site_popup_translations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  popup_id        smallint    NOT NULL REFERENCES public.site_popup (id) ON DELETE CASCADE,
  locale          text        NOT NULL,
  title           text,
  description     text,
  highlight_text  text,
  stats           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  button_text     text,
  button_url      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT site_popup_translations_locale_check   CHECK (locale IN ('en', 'de')),
  CONSTRAINT site_popup_translations_popup_locale_key UNIQUE (popup_id, locale),
  CONSTRAINT site_popup_translations_stats_is_array CHECK (jsonb_typeof(stats) = 'array' AND jsonb_array_length(stats) <= 4),
  CONSTRAINT site_popup_translations_title_len      CHECK (title IS NULL OR char_length(title) <= 200),
  CONSTRAINT site_popup_translations_description_len CHECK (description IS NULL OR char_length(description) <= 600),
  CONSTRAINT site_popup_translations_highlight_len  CHECK (highlight_text IS NULL OR char_length(highlight_text) <= 24),
  CONSTRAINT site_popup_translations_button_text_len CHECK (button_text IS NULL OR char_length(button_text) <= 60),
  CONSTRAINT site_popup_translations_button_url_len CHECK (button_url IS NULL OR char_length(button_url) <= 500)
);

COMMENT ON TABLE public.site_popup_translations IS
  'Açılış popup''ı (site_popup) metinlerinin EN/DE çevirileri. TR canonical kaynak '
  'site_popup satırıdır — bu tabloda TR satırı tutulmaz (CHECK). Boş/NULL alan public '
  'tarafta Türkçe değere düşer. Görsel/tarih/kapsam/süre alanları çevrilmez.';

DROP TRIGGER IF EXISTS site_popup_translations_touch_updated_at ON public.site_popup_translations;
CREATE TRIGGER site_popup_translations_touch_updated_at
  BEFORE UPDATE ON public.site_popup_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

COMMIT;

-- ===============================================================
-- UYGULAMA (production, manuel — YALNIZ AÇIK ONAY SONRASI):
--   psql "$DATABASE_URL" --single-transaction -f db/migrations/096_site_popup_translations.sql
--
-- DOĞRULAMA:
--   SELECT count(*) FROM public.site_popup_translations;          -- 0 (boş başlar)
--   SELECT title, button_text FROM public.site_popup WHERE id = 1; -- TR içerik aynen
--
-- ROLLBACK:
--   BEGIN; DROP TABLE IF EXISTS public.site_popup_translations; COMMIT;
--   (site_popup'a dokunulmadığı için TR içerik etkilenmez.)
-- ===============================================================
