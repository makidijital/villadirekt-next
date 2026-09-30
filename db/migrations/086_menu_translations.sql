-- ============================================================================
-- Migration 086 — menu_translations (TR/EN/DE dinamik menü adı çevirileri)
-- ============================================================================
-- AMAÇ:
--   `/maki-admin/menu` üzerinden MANUEL olarak eklenen menülerin
--   (`menu.source_type = 'manual'`) EN/DE adlarını saklamak. Migration
--   082'nin (PHASE 3) 9 çeviri tablosuyla YAPISAL OLARAK BİREBİR AYNI
--   şema — yeni bir çeviri mimarisi İCAT EDİLMEDİ.
--
-- ⚠️ KAPSAM — YALNIZ `source_type = 'manual'`:
--   Diğer menü türlerinin adı kendi kaynak tablosundan gelir ve
--   çevirileri ZATEN kendi sistemlerindedir:
--     page / page-auto → pages.title      → public.page_translations
--     category         → villa_types.name → public.villa_type_translations
--     region           → villa_locations.name → ÇEVRİLMEZ (özel isim)
--   Bu tablo o kaynaklara HİÇ dokunmaz ve onlar için satır TUTMAZ.
--   Kural application katmanında uygulanır (menu-translation.service.ts
--   parent ön-kontrolü + HeaderWrapper yalnız manual id okur); DB'de
--   CHECK ile ifade edilemez çünkü kural başka bir tablonun kolonuna
--   bağlıdır (trigger eklemek mevcut 082 desenini bozardı).
--
--   Bu migration'da:
--     ❌ `public.menu` tablosuna DOKUNULMAZ (kolon eklenmez/değişmez)
--     ❌ Mevcut `menu.name` değerleri DEĞİŞTİRİLMEZ (TR canonical kalır)
--     ❌ TR backfill YOK (tablo BOŞ oluşturulur)
--     ❌ Mevcut satır UPDATE'i / veri yazımı YOK
--     ❌ Slug/href/routing mantığı YOK — çeviri YALNIZ görünen adı etkiler
--     ✅ Yalnız 1 CREATE TABLE + 1 CREATE TRIGGER
--
-- ORTAK ŞEMA (migration 082 ile birebir):
--   id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
--   menu_id     uuid NOT NULL REFERENCES public.menu(id) ON DELETE CASCADE
--   locale      text NOT NULL CHECK (locale IN ('tr','en','de'))
--   name        text            (nullable — boş/NULL ise TR fallback)
--   created_at  timestamptz NOT NULL DEFAULT now()
--   updated_at  timestamptz NOT NULL DEFAULT now() (BEFORE UPDATE touch trigger)
--   UNIQUE (menu_id, locale)
--
-- INDEX: Ayrı index EKLENMEDİ — UNIQUE(menu_id, locale) zaten composite bir
--   index yaratır ve ilk kolonu `menu_id` olduğu için "bu menünün tüm
--   çevirileri" ve batch `menu_id IN (...)` sorguları da aynı index'i kullanır.
--
-- NATIVE POSTGRESQL (migration 068/071/082 CANON):
--   anon/authenticated/service_role rolleri YOK; RLS/GRANT/REVOKE YOK.
--   Tek app rolü doğrudan erişir; yetkilendirme application katmanında
--   (admin route auth / authorizeAdminSession).
--
-- TOUCH TRIGGER:
--   Migration 082'de oluşturulan genel amaçlı `public.trg_touch_updated_at()`
--   fonksiyonu REUSE edilir — yeni fonksiyon TANIMLANMAZ. (082 bu DB'de
--   uygulanmamışsa aşağıdaki DO bloğu fonksiyonu idempotent şekilde
--   oluşturur; 082 uygulanmışsa hiçbir şey değişmez.)
--
-- İDEMPOTENT: CREATE TABLE IF NOT EXISTS + DROP TRIGGER IF EXISTS +
--   CREATE TRIGGER. --single-transaction ile güvenle uygulanır.
--
-- ROLLBACK:
--   BEGIN;
--     DROP TABLE IF EXISTS public.menu_translations;
--   COMMIT;
--   -- `public.menu` tablosuna HİÇ dokunulmadığı için rollback'in mevcut
--   -- Türkçe menü adları üzerinde SIFIR etkisi vardır.
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
-- 1) menu_translations  (parent: public.menu)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_translations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id     uuid NOT NULL REFERENCES public.menu (id) ON DELETE CASCADE,
  locale      text NOT NULL,
  name        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_translations_locale_check CHECK (locale IN ('tr', 'en', 'de')),
  CONSTRAINT menu_translations_menu_id_locale_key UNIQUE (menu_id, locale)
);

COMMENT ON TABLE public.menu_translations IS
  'menu.name çevirileri — YALNIZ source_type=''manual'' satırlar için. '
  'public.menu TR base data SOURCE OF TRUTH kalır; bu tablo BOŞ başlar '
  '(TR backfill YOK). Link adresi ve kaynak referansı ÇEVRİLMEZ — yalnız '
  'görünen ad. page/category/region türlerinin çevirileri kendi '
  'sistemlerindedir (page_translations / villa_type_translations / yok).';

DROP TRIGGER IF EXISTS menu_translations_touch_updated_at ON public.menu_translations;
CREATE TRIGGER menu_translations_touch_updated_at
  BEFORE UPDATE ON public.menu_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

COMMIT;

-- ============================================================================
-- DOĞRULAMA (deploy sonrası ELLE kontrol)
-- ============================================================================
--   -- Tablo oluştu mu + boş mu?
--   SELECT count(*) FROM public.menu_translations;   -- 0 dönmeli
--
--   -- Mevcut menü adları DEĞİŞMEDİ mi? (önce/sonra karşılaştırın)
--   SELECT id, name FROM public.menu ORDER BY "order";
--
--   -- CHECK constraint çalışıyor mu? (hata beklenir)
--   INSERT INTO public.menu_translations (menu_id, locale, name)
--     VALUES ((SELECT id FROM public.menu LIMIT 1), 'fr', 'test');
--   -- ERROR: violates check constraint "menu_translations_locale_check"
--
--   -- UNIQUE constraint çalışıyor mu? (2. INSERT hata vermeli)
--   INSERT INTO public.menu_translations (menu_id, locale, name)
--     VALUES ((SELECT id FROM public.menu LIMIT 1), 'en', 'Test EN');
--   INSERT INTO public.menu_translations (menu_id, locale, name)
--     VALUES ((SELECT id FROM public.menu LIMIT 1), 'en', 'Test EN 2');
--   -- ERROR: duplicate key value violates unique constraint
--   -- (test verisini silmeyi unutmayın)
-- ============================================================================
