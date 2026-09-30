-- ============================================================================
-- Migration 087 — settings_translations.business_hours (EN/DE çalışma saatleri)
-- ============================================================================
-- AMAÇ:
--   `/iletisim` sayfasının EN/DE sürümleri devreye alınırken, "Çalışma
--   Saatleri" metninin (serbest metin: "Hafta içi 09:00 - 18:00" gibi)
--   dile göre gösterilebilmesi. Migration 085 ile BİREBİR AYNI desen
--   (o da `settings_translations`'a ADDITIVE kolon eklemişti).
--
--   Bu migration'da:
--     ❌ Mevcut satır UPDATE'i / veri yazımı YOK
--     ❌ `public.settings` tablosuna DOKUNULMAZ (TR canonical
--        `settings.business_hours` AYNEN kalır)
--     ❌ Kolon/tip/CHECK/UNIQUE/FK değişikliği YOK
--     ✅ Yalnız 1 ADDITIVE `ADD COLUMN IF NOT EXISTS`
--
-- ⚠️ KAPSAM — YALNIZ `business_hours`:
--   Telefon, e-posta, adres, WhatsApp ve sosyal medya bağlantıları
--   VERİDİR; her dilde aynı kalır ve ÇEVRİLMEZ. Bu yüzden onlar için
--   kolon EKLENMEDİ (bkz. lib/i18n/settings-translations.types.ts
--   whitelist'i — çift kilit).
--
-- LOCALE: Tablonun mevcut `CHECK (locale IN ('en','de'))` kısıtı
--   (migration 083) AYNEN geçerlidir — TR bu tabloda TUTULMAZ.
--
-- NATIVE POSTGRESQL (migration 068/071/082/083/085 CANON):
--   anon/authenticated/service_role rolleri YOK; RLS/GRANT/REVOKE YOK.
--
-- İDEMPOTENT: `ADD COLUMN IF NOT EXISTS` — tekrar çalıştırmak güvenli.
--   --single-transaction ile uygulanabilir.
--
-- ROLLBACK:
--   BEGIN;
--     ALTER TABLE public.settings_translations DROP COLUMN IF EXISTS business_hours;
--   COMMIT;
--   -- `public.settings` tablosuna HİÇ dokunulmadığı için rollback'in
--   -- mevcut Türkçe çalışma saatleri üzerinde SIFIR etkisi vardır.
-- ============================================================================

BEGIN;

ALTER TABLE public.settings_translations
  ADD COLUMN IF NOT EXISTS business_hours text;

COMMENT ON COLUMN public.settings_translations.business_hours IS
  'settings.business_hours çevirisi (EN/DE). Boş/NULL ise public tarafta '
  'TR canonical değer gösterilir (resolveSettingsText semantiği).';

COMMIT;

-- ============================================================================
-- DOĞRULAMA (deploy sonrası ELLE kontrol)
-- ============================================================================
--   -- Kolon eklendi mi + hepsi NULL mı?
--   SELECT locale, business_hours FROM public.settings_translations;
--   -- business_hours tüm satırlarda NULL dönmeli (backfill YOK).
--
--   -- Canonical TR değer DEĞİŞMEDİ mi?
--   SELECT business_hours FROM public.settings;
-- ============================================================================
