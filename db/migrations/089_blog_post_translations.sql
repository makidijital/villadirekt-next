-- ============================================================================
-- Migration 089 — blog_post_translations (TR/EN/DE blog içerik çevirileri)
-- ============================================================================
-- AMAÇ:
--   `/blog` ve `/blog/[slug]` sayfalarının EN/DE sürümlerinde yazı
--   başlığı, özeti, gövdesi ve SEO alanlarının çevrilebilmesi.
--   Migration 082'nin `page_translations` tablosuyla YAPISAL OLARAK
--   BİREBİR AYNI şema — yeni bir çeviri mimarisi İCAT EDİLMEDİ.
--
--   Bu migration'da:
--     ❌ `public.blog_posts` tablosuna DOKUNULMAZ (kolon eklenmez/değişmez)
--     ❌ Mevcut `blog_posts` değerleri DEĞİŞTİRİLMEZ (TR canonical kalır)
--     ❌ TR backfill YOK (tablo BOŞ oluşturulur)
--     ❌ Mevcut satır UPDATE'i / veri yazımı YOK
--     ❌ Slug ÇEVRİLMEZ — URL contract'ı (/blog/<slug>) her locale'de AYNI
--     ❌ cover_image / og_image / category / author / published_at /
--        is_active / noindex ÇEVRİLMEZ (medya + yayın durumu ortak)
--     ✅ Yalnız 1 CREATE TABLE + 1 CREATE TRIGGER
--
-- ORTAK ŞEMA (migration 082 > page_translations ile birebir):
--   id               uuid PRIMARY KEY DEFAULT gen_random_uuid()
--   blog_post_id     uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE
--   locale           text NOT NULL CHECK (locale IN ('tr','en','de'))
--   title            text            (nullable — boş/NULL ise TR fallback)
--   body             text
--   excerpt          text
--   seo_title        text
--   seo_description  text
--   created_at       timestamptz NOT NULL DEFAULT now()
--   updated_at       timestamptz NOT NULL DEFAULT now() (BEFORE UPDATE touch)
--   UNIQUE (blog_post_id, locale)
--
-- INDEX: Ayrı index EKLENMEDİ — UNIQUE(blog_post_id, locale) zaten composite
--   bir index yaratır ve ilk kolonu `blog_post_id` olduğu için "bu yazının
--   tüm çevirileri" ve batch `blog_post_id IN (...)` sorguları da aynı
--   index'i kullanır (082/086/088 ile AYNI gerekçe).
--
-- NATIVE POSTGRESQL (migration 068/071/082 CANON):
--   anon/authenticated/service_role rolleri YOK; RLS/GRANT/REVOKE YOK.
--   Tek app rolü doğrudan erişir; yetkilendirme application katmanında
--   (admin route auth / authorizeAdminSession).
--
-- TOUCH TRIGGER:
--   Migration 082'de oluşturulan genel amaçlı `public.trg_touch_updated_at()`
--   fonksiyonu REUSE edilir — yeni fonksiyon TANIMLANMAZ.
--
-- İDEMPOTENT: CREATE TABLE IF NOT EXISTS + DROP TRIGGER IF EXISTS +
--   CREATE TRIGGER. --single-transaction ile güvenle uygulanır.
--
-- ROLLBACK:
--   BEGIN;
--     DROP TABLE IF EXISTS public.blog_post_translations;
--   COMMIT;
--   -- `blog_posts` tablosuna HİÇ DOKUNULMADIĞI için rollback'in mevcut
--   -- Türkçe blog içeriği üzerinde SIFIR etkisi vardır.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0) GENEL AMAÇLI TOUCH TRIGGER FONKSİYONU — migration 082 ile AYNI tanım.
--    082 zaten uygulandıysa CREATE OR REPLACE no-op'tur (aynı gövde).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_touch_updated_at()
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

-- ----------------------------------------------------------------------------
-- 1) blog_post_translations  (parent: public.blog_posts)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blog_post_translations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_post_id     uuid NOT NULL REFERENCES public.blog_posts (id) ON DELETE CASCADE,
  locale           text NOT NULL,
  title            text,
  body             text,
  excerpt          text,
  seo_title        text,
  seo_description  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_post_translations_locale_check
    CHECK (locale IN ('tr', 'en', 'de')),
  CONSTRAINT blog_post_translations_post_id_locale_key
    UNIQUE (blog_post_id, locale)
);

COMMENT ON TABLE public.blog_post_translations IS
  'blog_posts icerik cevirileri (title/body/excerpt/seo_*). blog_posts TR '
  'base data SOURCE OF TRUTH kalir; bu tablo BOS baslar (TR backfill YOK). '
  'slug CEVRILMEZ - /blog/<slug> URL contract her locale icin AYNI. '
  'Bos/NULL alan public tarafta TR canonical degere fallback eder.';

DROP TRIGGER IF EXISTS blog_post_translations_touch_updated_at
  ON public.blog_post_translations;
CREATE TRIGGER blog_post_translations_touch_updated_at
  BEFORE UPDATE ON public.blog_post_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

COMMIT;

-- ============================================================================
-- DOĞRULAMA (deploy sonrası ELLE kontrol)
-- ============================================================================
--   SELECT count(*) FROM public.blog_post_translations;   -- 0 dönmeli
--   SELECT id, title, slug FROM public.blog_posts ORDER BY published_at DESC;
--   -- (blog_posts satırları DEĞİŞMEMİŞ olmalı)
-- ============================================================================
