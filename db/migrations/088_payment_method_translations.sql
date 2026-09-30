-- ============================================================================
-- Migration 088 — payment_method_translations (TR/EN/DE ödeme yöntemi adları)
-- ============================================================================
-- AMAÇ:
--   `/maki-admin/payment-methods` üzerinden yönetilen ödeme yöntemlerinin
--   EN/DE adlarını saklamak. Migration 082'nin (PHASE 3) 9 çeviri tablosu ve
--   migration 086'nın (menu) şemasıyla YAPISAL OLARAK BİREBİR AYNI — yeni bir
--   çeviri mimarisi İCAT EDİLMEDİ.
--
--   Bu migration'da:
--     ❌ `public.payment_methods` tablosuna DOKUNULMAZ (kolon eklenmez/değişmez)
--     ❌ Mevcut `payment_methods.name` değerleri DEĞİŞTİRİLMEZ (TR canonical kalır)
--     ❌ TR backfill YOK (tablo BOŞ oluşturulur)
--     ❌ Mevcut satır UPDATE'i / veri yazımı YOK
--     ❌ `type` / `is_active` kolonları ÇEVRİLMEZ (kod/flag alanı)
--     ✅ Yalnız 1 CREATE TABLE + 1 CREATE TRIGGER
--
-- ⚠️ KRİTİK — `payment_methods.name` YALNIZ BİR ETİKET DEĞİLDİR:
--   `lib/payment-link.helper.ts > isWesternUnionMethod()` canonical `name`
--   üzerinde substring araması yapar ("western union"). Bu yüzden çeviri
--   AYRI bir tabloda tutulur ve canonical `name` HİÇBİR ZAMAN çeviriyle
--   ezilmez — ne DB'de ne de `/api/public/payment-methods` cevabında.
--   Çeviri YALNIZ GÖRÜNEN ETİKETİ etkiler.
--
-- ⚠️ ŞEMA DOĞRULAMA NOTU (migration 082 ile AYNI durum):
--   `public.payment_methods` tablosunun CREATE TABLE'ı `db/migrations`
--   altında YOKTUR (migration takibi başlamadan önce oluşturulmuş). Kolon
--   tipleri, çalışan repository query'leri (lib/db/payment.repository.server.ts)
--   ve `types/database.ts > PaymentMethodRow` üzerinden doğrulanmıştır.
--   `payment_methods.id` tipi için doğrudan bir migration referansı
--   BULUNAMADI; projedeki TÜM diğer tabloların `id UUID PRIMARY KEY DEFAULT
--   gen_random_uuid()` konvansiyonuna dayanarak uuid kabul edilmiştir
--   (migration 082'nin `faqs.id` için koyduğu AYNI uyarı).
--   ➜ Uygulamadan ÖNCE teyit edilmeli:
--        SELECT id FROM public.payment_methods LIMIT 1;
--
-- ORTAK ŞEMA (migration 082/086 ile birebir):
--   id                 uuid PRIMARY KEY DEFAULT gen_random_uuid()
--   payment_method_id  uuid NOT NULL REFERENCES public.payment_methods(id)
--                        ON DELETE CASCADE
--   locale             text NOT NULL CHECK (locale IN ('tr','en','de'))
--   name               text            (nullable — boş/NULL ise TR fallback)
--   created_at         timestamptz NOT NULL DEFAULT now()
--   updated_at         timestamptz NOT NULL DEFAULT now() (BEFORE UPDATE touch)
--   UNIQUE (payment_method_id, locale)
--
-- INDEX: Ayrı index EKLENMEDİ — UNIQUE(payment_method_id, locale) zaten
--   composite bir index yaratır ve ilk kolonu `payment_method_id` olduğu için
--   "bu yöntemin tüm çevirileri" ve batch `payment_method_id IN (...)`
--   sorguları da aynı index'i kullanır.
--
-- NATIVE POSTGRESQL (migration 068/071/082/086 CANON):
--   anon/authenticated/service_role rolleri YOK; RLS/GRANT/REVOKE YOK.
--   Tek app rolü doğrudan erişir; yetkilendirme application katmanında
--   (admin route auth / authorizeAdminSession + `payment_methods` yetkisi).
--
-- TOUCH TRIGGER:
--   Migration 082'de oluşturulan genel amaçlı `public.trg_touch_updated_at()`
--   fonksiyonu REUSE edilir — yeni fonksiyon TANIMLANMAZ. (082 bu DB'de
--   uygulanmamışsa aşağıdaki CREATE OR REPLACE fonksiyonu idempotent şekilde
--   oluşturur; 082 uygulanmışsa hiçbir şey değişmez.)
--
-- İDEMPOTENT: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION +
--   DROP TRIGGER IF EXISTS + CREATE TRIGGER. --single-transaction ile
--   güvenle uygulanır.
--
-- ROLLBACK:
--   BEGIN;
--     DROP TABLE IF EXISTS public.payment_method_translations;
--   COMMIT;
--   -- `public.payment_methods` tablosuna HİÇ dokunulmadığı için rollback'in
--   -- mevcut Türkçe ödeme yöntemi adları üzerinde SIFIR etkisi vardır.
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
-- 1) payment_method_translations  (parent: public.payment_methods)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_method_translations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method_id  uuid NOT NULL REFERENCES public.payment_methods (id) ON DELETE CASCADE,
  locale             text NOT NULL,
  name               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_method_translations_locale_check CHECK (locale IN ('tr', 'en', 'de')),
  CONSTRAINT payment_method_translations_payment_method_id_locale_key UNIQUE (payment_method_id, locale)
);

COMMENT ON TABLE public.payment_method_translations IS
  'payment_methods.name çevirileri (rezervasyon formundaki ödeme yöntemi '
  'etiketi). public.payment_methods TR base data SOURCE OF TRUTH kalır; bu '
  'tablo BOŞ başlar (TR backfill YOK). `type` / `is_active` ÇEVRİLMEZ. '
  'Canonical `name` iş mantığında da kullanılır (isWesternUnionMethod) — '
  'bu yüzden ASLA çeviriyle ezilmez, yalnız görünen etiket çözülür.';

DROP TRIGGER IF EXISTS payment_method_translations_touch_updated_at ON public.payment_method_translations;
CREATE TRIGGER payment_method_translations_touch_updated_at
  BEFORE UPDATE ON public.payment_method_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

COMMIT;

-- ============================================================================
-- DOĞRULAMA (deploy sonrası ELLE kontrol)
-- ============================================================================
--   -- Tablo oluştu mu + boş mu?
--   SELECT count(*) FROM public.payment_method_translations;   -- 0 dönmeli
--
--   -- Mevcut ödeme yöntemi adları DEĞİŞMEDİ mi? (önce/sonra karşılaştırın)
--   SELECT id, name, type FROM public.payment_methods ORDER BY created_at DESC;
--
--   -- CHECK constraint çalışıyor mu? (hata beklenir)
--   INSERT INTO public.payment_method_translations (payment_method_id, locale, name)
--     VALUES ((SELECT id FROM public.payment_methods LIMIT 1), 'fr', 'test');
--   -- ERROR: violates check constraint "payment_method_translations_locale_check"
--
--   -- UNIQUE constraint çalışıyor mu? (2. INSERT hata vermeli)
--   INSERT INTO public.payment_method_translations (payment_method_id, locale, name)
--     VALUES ((SELECT id FROM public.payment_methods LIMIT 1), 'en', 'Test EN');
--   INSERT INTO public.payment_method_translations (payment_method_id, locale, name)
--     VALUES ((SELECT id FROM public.payment_methods LIMIT 1), 'en', 'Test EN 2');
--   -- ERROR: duplicate key value violates unique constraint
--   -- (test verisini silmeyi unutmayın)
-- ============================================================================
