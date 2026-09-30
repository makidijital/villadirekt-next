-- ============================================================================
-- Migration 083 — PHASE 10L: Settings Translations (EN/DE) — 4 ALAN
-- ============================================================================
-- AMAÇ:
--   `public.settings` singleton satırındaki YALNIZ 4 doğal-dil alanının
--   EN/DE karşılıklarını tutan, AYRI ve ADDITIVE bir çeviri tablosu:
--
--     footer_copyright          → Footer alt bar telif metni
--     maintenance_message       → Bakım modu ekranı mesajı
--     default_meta_title        → Varsayılan meta başlık
--     default_meta_description  → Varsayılan meta açıklama
--
--   Bu migration'da:
--     ❌ `public.settings` tablosuna HİÇ DOKUNULMAZ (kolon eklenmez,
--        satır UPDATE edilmez, tip/constraint değişmez)
--     ❌ TR backfill YOK — tablo BOŞ oluşturulur; TR canonical kaynak
--        `public.settings` satırı olmaya devam eder
--     ❌ `get_public_settings()` RPC'sine DOKUNULMAZ (migration 081'in
--        48 kolonluk whitelist'i AYNEN kalır). Çeviriler uygulama
--        katmanında AYRI, dar bir sorguyla okunur — bu yüzden RPC'yi
--        değiştirmeye GEREK YOKTUR ve değiştirilmemiştir.
--     ❌ Migration 082'nin 9 çeviri tablosuna DOKUNULMAZ
--     ❌ Secret/config kolonları (resend_api_key, mail_from,
--        mail_from_name, token'lar, boolean/sayısal ayarlar, URL'ler,
--        görseller, script'ler) BU TABLODA YOKTUR ve olamaz
--     ✅ Yalnız 1 yeni CREATE TABLE + 1 CREATE TRIGGER
--
-- ŞEMA GEREKÇESİ (Phase 10L §1 kararı — "Seçenek A: dedike kolon"):
--   Migration 082'deki 9 tablonun HEPSİ bu şekle sahip
--   (<parent>_id + locale + sabit çevrilebilir kolonlar + CHECK +
--   UNIQUE). Key/value (EAV) deseni bu projede HİÇBİR tabloda yok.
--   Dedike kolon seçilmesinin güvenlik sonucu: çevrilebilir ALAN
--   WHITELIST'İ ŞEMANIN KENDİSİ tarafından zorlanır — uygulama
--   katmanı bypass edilse bile `settings_translations` tablosuna
--   4 kolon DIŞINDA bir alan yazılamaz (keyfi kolon UPDATE'i
--   YAPISAL OLARAK İMKÂNSIZ).
--
-- ⚠️ locale CHECK'i 082'DEN DAHA DAR — yalnız ('en','de'):
--   082'de CHECK (locale IN ('tr','en','de')) kullanılıyor çünkü orada
--   ileride TR satırı da tutulabilir. BURADA TR KASITLI OLARAK YASAK:
--   TR canonical değer `public.settings` satırının KENDİSİDİR; aynı
--   metnin ikinci bir TR kopyası iki doğruluk kaynağı (drift) yaratırdı.
--   Böylece "TR bu yoldan yazılabilir mi?" sorusunun cevabı, uygulama
--   katmanındaki whitelist'ten BAĞIMSIZ olarak DB seviyesinde HAYIR'dır.
--
-- DUPLICATE-LOCALE KORUMASI:
--   UNIQUE (settings_id, locale) — aynı settings satırı için aynı
--   locale ikinci kez INSERT edilemez; `upsert ... ON CONFLICT
--   (settings_id, locale)` hedefi de budur.
--
-- REFERANS BÜTÜNLÜĞÜ:
--   settings_id uuid NOT NULL REFERENCES public.settings (id)
--   ON DELETE CASCADE — settings satırı silinirse çevirileri de gider;
--   var olmayan bir settings_id'ye çeviri yazılamaz.
--
-- INDEX: Ayrı index EKLENMEDİ — UNIQUE (settings_id, locale) zaten
--   composite index yaratır ve ilk kolonu settings_id olduğundan
--   "bu settings satırının tüm çevirileri" sorgusu da onu kullanır.
--
-- NATIVE POSTGRESQL (migration 068/071/081/082 CANON):
--   anon/authenticated/service_role rolleri YOK; RLS/GRANT/REVOKE YOK.
--   Tek app rolü doğrudan erişir; yetkilendirme uygulama katmanında
--   (admin route auth → authorizeAdminSession).
--
-- BAĞIMLILIK: `public.trg_touch_updated_at()` — migration 082'de
--   oluşturulan GENEL AMAÇLI touch trigger fonksiyonu. Burada YENİDEN
--   TANIMLANMAZ (082'nin nesnesine dokunmamak için); yalnız yeni
--   tabloya BAĞLANIR. Aşağıdaki DO bloğu, 082 uygulanmadan 083
--   çalıştırılırsa AÇIK bir hata mesajı verir (sessiz hata YOK).
--
-- İDEMPOTENT: CREATE TABLE IF NOT EXISTS + DROP TRIGGER IF EXISTS +
--   CREATE TRIGGER. --single-transaction ile güvenle uygulanır.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0) BAĞIMLILIK KONTROLÜ — migration 082'nin touch trigger fonksiyonu
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'trg_touch_updated_at'
  ) THEN
    RAISE EXCEPTION
      'Migration 083, 082_translation_tables.sql''in public.trg_touch_updated_at() fonksiyonuna bağlıdır. Önce 082''yi uygulayın.';
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 1) settings_translations  (parent: public.settings — SINGLETON)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings_translations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_id               uuid NOT NULL REFERENCES public.settings (id) ON DELETE CASCADE,
  locale                    text NOT NULL,
  footer_copyright          text,
  maintenance_message       text,
  default_meta_title        text,
  default_meta_description  text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settings_translations_locale_check CHECK (locale IN ('en', 'de')),
  CONSTRAINT settings_translations_settings_id_locale_key UNIQUE (settings_id, locale)
);

COMMENT ON TABLE public.settings_translations IS
  'settings tablosundaki 4 doğal-dil alanının EN/DE çevirileri '
  '(footer_copyright, maintenance_message, default_meta_title, '
  'default_meta_description). TR canonical kaynak public.settings '
  'satırıdır — bu tabloda TR SATIRI TUTULMAZ (CHECK ile yasak). '
  'Tablo BOŞ başlar; boş/NULL alan public tarafta TR canonical''e düşer. '
  'Secret/config kolonları (resend_api_key, mail_from*, token''lar, '
  'URL/görsel/script alanları) bu tabloda YOKTUR.';

COMMENT ON COLUMN public.settings_translations.footer_copyright IS
  'Footer telif metni çevirisi. {year} ve {site_name} yer tutucuları '
  'çeviride de AYNEN korunur — render sırasında değiştirilir.';

COMMENT ON COLUMN public.settings_translations.maintenance_message IS
  'Bakım modu ekranındaki mesajın çevirisi. Bakım ekranının diğer '
  'metinleri (ör. "Bakım" üst etiketi) bu fazda çevrilmez.';

DROP TRIGGER IF EXISTS settings_translations_touch_updated_at ON public.settings_translations;
CREATE TRIGGER settings_translations_touch_updated_at
  BEFORE UPDATE ON public.settings_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

COMMIT;

-- ============================================================================
-- UYGULAMA (native production, manuel — YALNIZ AÇIK ONAY SONRASI):
--   psql "$DATABASE_URL" --single-transaction -f db/migrations/083_settings_translations.sql
--
-- DOĞRULAMA:
--   -- 1) TR yazılamıyor mu? (CHECK reddetmeli)
--   INSERT INTO public.settings_translations (settings_id, locale, footer_copyright)
--     VALUES ((SELECT id FROM public.settings LIMIT 1), 'tr', 'X');
--   -- ERROR: new row violates check constraint "settings_translations_locale_check"
--
--   -- 2) Aynı locale iki kez yazılamıyor mu? (UNIQUE reddetmeli)
--   INSERT INTO public.settings_translations (settings_id, locale, footer_copyright)
--     VALUES ((SELECT id FROM public.settings LIMIT 1), 'en', 'A');
--   INSERT INTO public.settings_translations (settings_id, locale, footer_copyright)
--     VALUES ((SELECT id FROM public.settings LIMIT 1), 'en', 'B');
--   -- ERROR: duplicate key value violates unique constraint
--
--   -- 3) Var olmayan settings_id reddediliyor mu? (FK)
--   INSERT INTO public.settings_translations (settings_id, locale)
--     VALUES (gen_random_uuid(), 'en');
--   -- ERROR: insert or update on table ... violates foreign key constraint
--
--   -- (test verisini temizlemeyi unutmayın:
--   --  DELETE FROM public.settings_translations WHERE locale = 'en';)
-- ============================================================================

-- ============================================================================
-- ROLLBACK
-- ============================================================================
--   BEGIN;
--     DROP TABLE IF EXISTS public.settings_translations;
--   COMMIT;
--   -- `public.settings` tablosuna HİÇ DOKUNULMADIĞI ve TR içerik orada
--   -- durduğu için rollback'in mevcut içerik üzerinde SIFIR etkisi vardır.
--   -- public.trg_touch_updated_at() DROP EDİLMEZ — migration 082'nin
--   -- 9 tablosu onu kullanmaya devam eder.
-- ============================================================================
