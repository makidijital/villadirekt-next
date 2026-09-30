-- ============================================================================
-- Migration 082 — PHASE 3: Database Translation Architecture (TR/EN/DE)
-- ============================================================================
-- AMAÇ:
--   Çoklu dil mimarisinin veri katmanı. 9 mevcut public-content tablosu
--   için AYRI, ADDITIVE çeviri tabloları oluşturur. Ana tablolar (villa,
--   villa_locations, villa_types, villa_features, rule_items,
--   price_include_items, villa_distances, pages, faqs) HİÇ DEĞİŞMEZ —
--   ne kolon eklenir ne var olan veri dokunulur. Mevcut Türkçe içerik bu
--   tablolarda SOURCE OF TRUTH olarak kalmaya devam eder.
--
--   Bu migration'da:
--     ❌ TR backfill YOK (çeviri tabloları BOŞ oluşturulur)
--     ❌ Mevcut satır UPDATE'i YOK
--     ❌ Mevcut kolon/tip değişikliği YOK
--     ❌ Mevcut FK/RLS/GRANT değişikliği YOK
--     ❌ Slug/routing/locale-URL mantığı YOK (sonraki faz)
--     ✅ Yalnız 9 yeni CREATE TABLE + 1 genel amaçlı touch-trigger
--        fonksiyonu + 9 CREATE TRIGGER
--
-- ⚠️ ŞEMA DOĞRULAMA NOTU (önemli):
--   Ana tablo kolonları, `db/migrations` içinde bu 9 tablonun hiçbiri
--   için bir CREATE TABLE bulunamadığından (migration takibi
--   başlamadan ÖNCE oluşturulmuşlar) doğrudan production'a canlı
--   sorgu ATILAMADI (bu ortamdan DB'ye ağ erişimi yok — DNS/egress
--   kısıtlı). Bunun yerine gerçek, production'da ÇALIŞAN repository
--   query kodu (lib/db/*.repository*.ts, .select(...) çağrıları)
--   satır satır incelenerek doğrulandı. Bu inceleme SIRASINDA audit
--   raporundaki 2 varsayım YANLIŞ çıktı ve DÜZELTİLDİ:
--     1) "villa_rules" diye bir tablo YOK — gerçek tablo adı
--        `rule_items` (bkz. lib/db/rule-item.repository.ts,
--        lib/db/taxonomy.repository.server.ts, relation-metadata.ts).
--        Çeviri tablosu bu yüzden `villa_rule_translations` DEĞİL,
--        `rule_item_translations` olarak adlandırıldı.
--     2) `rule_items` ve `price_include_items` tablolarının çevrilebilir
--        metin kolonu `name` DEĞİL, `title` (bkz. rule-item.repository.ts
--        `.select("id, title")`, price-include-item.repository.ts
--        `.select("id, title")`).
--   `faqs.id` tipi (uuid) için doğrudan bir migration referansı
--   bulunamadı; projedeki TÜM diğer tabloların (villa, villa_locations,
--   villa_types, villa_features, rule_items, price_include_items,
--   villa_distances, pages — bu SONUNCUSU migration 004'te
--   `menu_parent_id UUID` self-reference ile doğrulandı) %100 tutarlı
--   `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` konvansiyonuna
--   dayanarak faqs.id de uuid kabul edildi. Bu TEK noktada doğrudan
--   migration-metni doğrulaması YAPILAMADI — production'a uygulanmadan
--   önce `SELECT id FROM faqs LIMIT 1;` ile teyit edilmesi önerilir.
--
-- ORTAK ŞEMA (9 tablo için tutarlı):
--   id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
--   <parent>_id   uuid NOT NULL REFERENCES <parent_table>(id) ON DELETE CASCADE
--   locale        text NOT NULL CHECK (locale IN ('tr','en','de'))
--   <çevrilebilir alanlar>  (hepsi nullable — boşsa ileride TR fallback)
--   created_at    timestamptz NOT NULL DEFAULT now()
--   updated_at    timestamptz NOT NULL DEFAULT now() (BEFORE UPDATE touch trigger)
--   UNIQUE (<parent>_id, locale)
--
-- INDEX: Ayrı bir index EKLENMEDİ — UNIQUE(<parent>_id, locale) zaten
--   composite bir index yaratır ve bu index'in ilk kolonu <parent>_id
--   olduğundan "bu parent'ın tüm çevirileri" sorgusu da aynı index'i
--   kullanır (ek, redundant bir tekil-kolon index gereksiz).
--
-- NATIVE POSTGRESQL (migration 068/071 CANON — 081 ile AYNI desen):
--   anon/authenticated/service_role rolleri YOK; RLS/GRANT/REVOKE
--   YOK. Tek app rolü (bağlantı string'indeki kullanıcı) doğrudan
--   erişir; yetkilendirme application katmanında (admin route auth).
--
-- TOUCH TRIGGER — genel amaçlı, TEK fonksiyon:
--   settings tablosunun (migration 051) kendine özel
--   `trg_settings_touch_updated_at()` fonksiyonu var; ama burada 9
--   tabloya aynı deseni birebir kopyalamak (9 ayrı fonksiyon) gereksiz
--   tekrar olur. Bunun yerine TEK, tamamen generic
--   `public.trg_touch_updated_at()` fonksiyonu (settings'inkiyle AYNI
--   SECURITY INVOKER + search_path pinning) 9 tabloya da trigger
--   olarak bağlanır. Bu fonksiyon başka HİÇBİR mevcut tabloya
--   dokunmaz/bağlanmaz — yalnız bu migration'ın yarattığı 9 tabloda
--   kullanılır.
--
-- İDEMPOTENT: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION +
--   DROP TRIGGER IF EXISTS + CREATE TRIGGER + ADD CONSTRAINT guard'lı
--   (DO bloğu, pg_constraint kontrolü). --single-transaction ile
--   güvenle uygulanır.
--
-- ROLLBACK (gerekirse, en alt bölümde de var):
--   BEGIN;
--     DROP TABLE IF EXISTS public.villa_translations;
--     DROP TABLE IF EXISTS public.villa_location_translations;
--     DROP TABLE IF EXISTS public.villa_type_translations;
--     DROP TABLE IF EXISTS public.villa_feature_translations;
--     DROP TABLE IF EXISTS public.rule_item_translations;
--     DROP TABLE IF EXISTS public.price_include_item_translations;
--     DROP TABLE IF EXISTS public.villa_distance_translations;
--     DROP TABLE IF EXISTS public.page_translations;
--     DROP TABLE IF EXISTS public.faq_translations;
--     DROP FUNCTION IF EXISTS public.trg_touch_updated_at();
--   COMMIT;
--   -- Ana tablolara (villa, pages, faqs, ...) HİÇ DOKUNULMADIĞI için
--   -- rollback'in mevcut Türkçe içerik üzerinde SIFIR etkisi vardır.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0) GENEL AMAÇLI TOUCH TRIGGER FONKSİYONU (yalnız bu 9 tablo kullanır)
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

COMMENT ON FUNCTION public.trg_touch_updated_at() IS
  'Genel amaçlı BEFORE UPDATE touch trigger — yalnız migration 082''nin '
  '9 çeviri tablosuna bağlıdır. Diğer hiçbir tabloya dokunmaz.';

-- ----------------------------------------------------------------------------
-- 1) villa_translations  (parent: public.villa)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.villa_translations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  villa_id         uuid NOT NULL REFERENCES public.villa (id) ON DELETE CASCADE,
  locale           text NOT NULL,
  title            text,
  description      text,
  badge            text,
  seo_title        text,
  seo_description  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT villa_translations_locale_check CHECK (locale IN ('tr', 'en', 'de')),
  CONSTRAINT villa_translations_villa_id_locale_key UNIQUE (villa_id, locale)
);

COMMENT ON TABLE public.villa_translations IS
  'Villa title/description/badge/seo_title/seo_description çevirileri. '
  'public.villa TR base data SOURCE OF TRUTH kalır; bu tablo BOŞ '
  'başlar (TR backfill YOK).';

DROP TRIGGER IF EXISTS villa_translations_touch_updated_at ON public.villa_translations;
CREATE TRIGGER villa_translations_touch_updated_at
  BEFORE UPDATE ON public.villa_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2) villa_location_translations  (parent: public.villa_locations)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.villa_location_translations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id  uuid NOT NULL REFERENCES public.villa_locations (id) ON DELETE CASCADE,
  locale       text NOT NULL,
  name         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT villa_location_translations_locale_check CHECK (locale IN ('tr', 'en', 'de')),
  CONSTRAINT villa_location_translations_location_id_locale_key UNIQUE (location_id, locale)
);

COMMENT ON TABLE public.villa_location_translations IS
  'villa_locations.name çevirileri. Parent tablo değişmedi, boş başlar.';

DROP TRIGGER IF EXISTS villa_location_translations_touch_updated_at ON public.villa_location_translations;
CREATE TRIGGER villa_location_translations_touch_updated_at
  BEFORE UPDATE ON public.villa_location_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3) villa_type_translations  (parent: public.villa_types)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.villa_type_translations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id     uuid NOT NULL REFERENCES public.villa_types (id) ON DELETE CASCADE,
  locale      text NOT NULL,
  name        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT villa_type_translations_locale_check CHECK (locale IN ('tr', 'en', 'de')),
  CONSTRAINT villa_type_translations_type_id_locale_key UNIQUE (type_id, locale)
);

COMMENT ON TABLE public.villa_type_translations IS
  'villa_types.name çevirileri. Parent tablo değişmedi, boş başlar.';

DROP TRIGGER IF EXISTS villa_type_translations_touch_updated_at ON public.villa_type_translations;
CREATE TRIGGER villa_type_translations_touch_updated_at
  BEFORE UPDATE ON public.villa_type_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4) villa_feature_translations  (parent: public.villa_features)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.villa_feature_translations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id  uuid NOT NULL REFERENCES public.villa_features (id) ON DELETE CASCADE,
  locale      text NOT NULL,
  name        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT villa_feature_translations_locale_check CHECK (locale IN ('tr', 'en', 'de')),
  CONSTRAINT villa_feature_translations_feature_id_locale_key UNIQUE (feature_id, locale)
);

COMMENT ON TABLE public.villa_feature_translations IS
  'villa_features.name çevirileri. Parent tablo değişmedi, boş başlar.';

DROP TRIGGER IF EXISTS villa_feature_translations_touch_updated_at ON public.villa_feature_translations;
CREATE TRIGGER villa_feature_translations_touch_updated_at
  BEFORE UPDATE ON public.villa_feature_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 5) rule_item_translations  (parent: public.rule_items)
--    ⚠️ Gerçek tablo adı "rule_items" (audit'teki "villa_rules" YANLIŞTI —
--       bkz. dosya başı doğrulama notu). Çevrilebilir kolon: title.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rule_item_translations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id     uuid NOT NULL REFERENCES public.rule_items (id) ON DELETE CASCADE,
  locale      text NOT NULL,
  title       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rule_item_translations_locale_check CHECK (locale IN ('tr', 'en', 'de')),
  CONSTRAINT rule_item_translations_rule_id_locale_key UNIQUE (rule_id, locale)
);

COMMENT ON TABLE public.rule_item_translations IS
  'rule_items.title çevirileri (villa kuralları). Parent tablo '
  'değişmedi, boş başlar.';

DROP TRIGGER IF EXISTS rule_item_translations_touch_updated_at ON public.rule_item_translations;
CREATE TRIGGER rule_item_translations_touch_updated_at
  BEFORE UPDATE ON public.rule_item_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 6) price_include_item_translations  (parent: public.price_include_items)
--    ⚠️ Çevrilebilir kolon "name" DEĞİL, "title" (bkz. doğrulama notu).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_include_item_translations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  include_id  uuid NOT NULL REFERENCES public.price_include_items (id) ON DELETE CASCADE,
  locale      text NOT NULL,
  title       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_include_item_translations_locale_check CHECK (locale IN ('tr', 'en', 'de')),
  CONSTRAINT price_include_item_translations_include_id_locale_key UNIQUE (include_id, locale)
);

COMMENT ON TABLE public.price_include_item_translations IS
  'price_include_items.title çevirileri (fiyata dahil hizmetler). '
  'Parent tablo değişmedi, boş başlar.';

DROP TRIGGER IF EXISTS price_include_item_translations_touch_updated_at ON public.price_include_item_translations;
CREATE TRIGGER price_include_item_translations_touch_updated_at
  BEFORE UPDATE ON public.price_include_item_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 7) villa_distance_translations  (parent: public.villa_distances)
--    title + distance İKİSİ DE serbest metin (bkz. lib/distance.helper.ts —
--    "distance" admin'in elle girdiği bir metin, örn. "650m" / "5 dk").
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.villa_distance_translations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distance_id  uuid NOT NULL REFERENCES public.villa_distances (id) ON DELETE CASCADE,
  locale       text NOT NULL,
  title        text,
  distance     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT villa_distance_translations_locale_check CHECK (locale IN ('tr', 'en', 'de')),
  CONSTRAINT villa_distance_translations_distance_id_locale_key UNIQUE (distance_id, locale)
);

COMMENT ON TABLE public.villa_distance_translations IS
  'villa_distances.title/distance çevirileri. Parent tablo değişmedi, '
  'boş başlar.';

DROP TRIGGER IF EXISTS villa_distance_translations_touch_updated_at ON public.villa_distance_translations;
CREATE TRIGGER villa_distance_translations_touch_updated_at
  BEFORE UPDATE ON public.villa_distance_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 8) page_translations  (parent: public.pages)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_translations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id          uuid NOT NULL REFERENCES public.pages (id) ON DELETE CASCADE,
  locale           text NOT NULL,
  title            text,
  body             text,
  excerpt          text,
  seo_title        text,
  seo_description  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT page_translations_locale_check CHECK (locale IN ('tr', 'en', 'de')),
  CONSTRAINT page_translations_page_id_locale_key UNIQUE (page_id, locale)
);

COMMENT ON TABLE public.page_translations IS
  'pages.title/body/excerpt/seo_title/seo_description çevirileri '
  '(CMS sayfaları). Parent tablo değişmedi, boş başlar.';

DROP TRIGGER IF EXISTS page_translations_touch_updated_at ON public.page_translations;
CREATE TRIGGER page_translations_touch_updated_at
  BEFORE UPDATE ON public.page_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 9) faq_translations  (parent: public.faqs)
--    ⚠️ faqs.id tipi doğrudan bir migration'dan doğrulanamadı — bkz.
--       dosya başı doğrulama notu. Uygulamadan ÖNCE teyit edilmeli.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faq_translations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faq_id      uuid NOT NULL REFERENCES public.faqs (id) ON DELETE CASCADE,
  locale      text NOT NULL,
  question    text,
  answer      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faq_translations_locale_check CHECK (locale IN ('tr', 'en', 'de')),
  CONSTRAINT faq_translations_faq_id_locale_key UNIQUE (faq_id, locale)
);

COMMENT ON TABLE public.faq_translations IS
  'faqs.question/answer çevirileri. Parent tablo değişmedi, boş başlar.';

DROP TRIGGER IF EXISTS faq_translations_touch_updated_at ON public.faq_translations;
CREATE TRIGGER faq_translations_touch_updated_at
  BEFORE UPDATE ON public.faq_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

COMMIT;

-- ============================================================================
-- DOĞRULAMA (deploy sonrası, üretimde çalıştırmadan önce ELLE kontrol edin)
-- ============================================================================
--   -- 9 tablo da oluştu mu + boş mu?
--   SELECT 'villa_translations', count(*) FROM public.villa_translations
--   UNION ALL SELECT 'villa_location_translations', count(*) FROM public.villa_location_translations
--   UNION ALL SELECT 'villa_type_translations', count(*) FROM public.villa_type_translations
--   UNION ALL SELECT 'villa_feature_translations', count(*) FROM public.villa_feature_translations
--   UNION ALL SELECT 'rule_item_translations', count(*) FROM public.rule_item_translations
--   UNION ALL SELECT 'price_include_item_translations', count(*) FROM public.price_include_item_translations
--   UNION ALL SELECT 'villa_distance_translations', count(*) FROM public.villa_distance_translations
--   UNION ALL SELECT 'page_translations', count(*) FROM public.page_translations
--   UNION ALL SELECT 'faq_translations', count(*) FROM public.faq_translations;
--   -- Hepsi 0 dönmeli (TR backfill YOK).
--
--   -- Mevcut villa sayısı DEĞİŞMEDİ mi? (önce/sonra karşılaştırın)
--   SELECT count(*) FROM public.villa;
--
--   -- CHECK constraint çalışıyor mu? (hata beklenir)
--   INSERT INTO public.villa_translations (villa_id, locale, title)
--     VALUES ((SELECT id FROM public.villa LIMIT 1), 'fr', 'test');
--   -- ERROR: violates check constraint "villa_translations_locale_check"
--
--   -- UNIQUE constraint çalışıyor mu? (2. INSERT hata vermeli)
--   INSERT INTO public.villa_translations (villa_id, locale, title)
--     VALUES ((SELECT id FROM public.villa LIMIT 1), 'en', 'Test EN');
--   INSERT INTO public.villa_translations (villa_id, locale, title)
--     VALUES ((SELECT id FROM public.villa LIMIT 1), 'en', 'Test EN 2');
--   -- ERROR: duplicate key value violates unique constraint
--   -- (test verisini silmeyi unutmayın)
--
--   -- CASCADE çalışıyor mu? (test villası + test çevirisi ile deneyin, prod villasıyla DENEMEYİN)
-- ============================================================================

-- ============================================================================
-- ROLLBACK
-- ============================================================================
--   BEGIN;
--     DROP TABLE IF EXISTS public.villa_translations;
--     DROP TABLE IF EXISTS public.villa_location_translations;
--     DROP TABLE IF EXISTS public.villa_type_translations;
--     DROP TABLE IF EXISTS public.villa_feature_translations;
--     DROP TABLE IF EXISTS public.rule_item_translations;
--     DROP TABLE IF EXISTS public.price_include_item_translations;
--     DROP TABLE IF EXISTS public.villa_distance_translations;
--     DROP TABLE IF EXISTS public.page_translations;
--     DROP TABLE IF EXISTS public.faq_translations;
--     DROP FUNCTION IF EXISTS public.trg_touch_updated_at();
--   COMMIT;
--   -- Ana tablolara (villa, villa_locations, villa_types, villa_features,
--   -- rule_items, price_include_items, villa_distances, pages, faqs)
--   -- HİÇ DOKUNULMADIĞI için rollback'in mevcut içerik üzerinde SIFIR
--   -- etkisi vardır.
-- ============================================================================
