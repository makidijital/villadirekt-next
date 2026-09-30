-- ============================================================================
-- Migration 084 — PHASE 10M: settings_translations kapsam daraltma
-- ============================================================================
-- AMAÇ:
--   `settings_translations` çeviri kapsamından `maintenance_message`
--   kolonunu kaldırmak. Bakım modu mesajı artık ÇEVRİLMEYECEK; her
--   dilde canonical TR metin (`public.settings.maintenance_message`)
--   gösterilir.
--
--   Kalan çeviri kapsamı (3 alan):
--     footer_copyright · default_meta_title · default_meta_description
--
-- ⚠️ BU MİGRASYON `public.settings` TABLOSUNA HİÇ DOKUNMAZ.
--   `public.settings.maintenance_message` CANONICAL alandır ve
--   KORUNUR — bugün aktif olarak kullanılıyor:
--     • app/(public)/layout.tsx — bakım modu ekranı
--     • app/(admin)/maki-admin/settings/gelismis — admin düzenleme
--     • get_public_settings() RPC whitelist'i (migration 041/048/051/
--       063/067/071/081 boyunca taşınıyor)
--   Yalnızca ÇEVİRİ tablosundaki kolon düşürülür.
--
-- ⚠️ `address` İÇİN BU MİGRASYONDA HİÇBİR ŞEY YOK:
--   `settings_translations` tablosunda `address` kolonu HİÇBİR ZAMAN
--   OLUŞTURULMADI (bkz. migration 083 CREATE TABLE gövdesi). Phase 10M'de
--   kaldırılan "İletişim · Adres" bölümü YALNIZCA admin ekranındaki
--   salt-okunur bir UI kartıydı — DB karşılığı yoktu.
--   `public.settings.address` canonical alandır ve KORUNUR (Footer,
--   /iletisim, schema.org structured data, admin settings).
--
-- ⚠️ MİGRASYON 083 DEĞİŞTİRİLMEDİ (commit 44cd7ac). Commit edilmiş
--   migration geçmişi bu projede yeniden yazılmaz; kapsam daraltması
--   ileriye dönük yeni bir migration ile yapılır.
--
-- 🔴 DESTRUCTIVE — GERİ ALINAMAZ:
--   `DROP COLUMN` kolondaki TÜM veriyi siler. Uygulamadan ÖNCE veri
--   kontrolü yapılmalıdır (aşağıdaki "UYGULAMA ÖNCESİ" bölümü).
--   `IF EXISTS` yalnız İDEMPOTENSİ içindir (migration iki kez
--   çalıştırılırsa hata vermez) — veri güvenliği SAĞLAMAZ.
--
-- KAPSAM:
--   ❌ public.settings tablosuna dokunulmaz
--   ❌ get_public_settings() RPC'sine dokunulmaz
--   ❌ migration 082'nin 9 çeviri tablosuna dokunulmaz
--   ❌ public.trg_touch_updated_at() fonksiyonuna dokunulmaz
--      (settings_translations dahil 10 tablo onu kullanmaya devam eder)
--   ❌ locale CHECK / UNIQUE / FK / trigger DEĞİŞMEZ
--   ✅ Yalnız 1 kolon DROP + tablo/kolon COMMENT güncellemesi
-- ============================================================================

-- ============================================================================
-- UYGULAMA ÖNCESİ — VERİ KONTROLÜ (ZORUNLU, read-only)
-- ============================================================================
--   -- Tablo uygulanmış mı? (NULL dönerse 083 hiç uygulanmamış demektir)
--   SELECT to_regclass('public.settings_translations');
--
--   -- Kaybolacak veri var mı?
--   SELECT locale, maintenance_message
--   FROM public.settings_translations
--   WHERE btrim(coalesce(maintenance_message, '')) <> '';
--
--   -- Satır DÖNERSE: bu metinler kalıcı olarak silinecektir. Gerekliyse
--   -- önce dışa aktarın; bakım mesajının TR canonical karşılığı
--   -- public.settings.maintenance_message'ta durmaya devam eder.
-- ============================================================================

BEGIN;

ALTER TABLE public.settings_translations
  DROP COLUMN IF EXISTS maintenance_message;

COMMENT ON TABLE public.settings_translations IS
  'settings tablosundaki 3 doğal-dil alanının EN/DE çevirileri '
  '(footer_copyright, default_meta_title, default_meta_description). '
  'TR canonical kaynak public.settings satırıdır — bu tabloda TR SATIRI '
  'TUTULMAZ (CHECK ile yasak). Boş/NULL alan public tarafta TR '
  'canonical''e düşer. Secret/config kolonları (resend_api_key, '
  'mail_from*, token''lar, URL/görsel/script alanları) bu tabloda '
  'YOKTUR. maintenance_message migration 084''te çeviri kapsamından '
  'ÇIKARILDI (canonical public.settings.maintenance_message KORUNDU).';

COMMIT;

-- ============================================================================
-- UYGULAMA (native production, manuel — YALNIZ AÇIK ONAY SONRASI):
--   psql "$DATABASE_URL" --single-transaction -f db/migrations/084_drop_settings_translation_maintenance_message.sql
--
-- DOĞRULAMA:
--   SELECT column_name
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'settings_translations'
--   ORDER BY ordinal_position;
--   -- Beklenen: id, settings_id, locale, footer_copyright,
--   --           default_meta_title, default_meta_description,
--   --           created_at, updated_at
--
--   -- Constraint'ler DEĞİŞMEDİ mi?
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.settings_translations'::regclass;
--   -- Beklenen: PK + settings_translations_locale_check +
--   --           settings_translations_settings_id_locale_key + FK
--
--   -- Canonical alan DURUYOR mu? (kritik)
--   SELECT maintenance_message IS NOT NULL AS canonical_duruyor
--   FROM public.settings LIMIT 1;
-- ============================================================================

-- ============================================================================
-- ROLLBACK (kolonu geri ekler — VERİ GERİ GELMEZ)
-- ============================================================================
--   BEGIN;
--     ALTER TABLE public.settings_translations
--       ADD COLUMN IF NOT EXISTS maintenance_message text;
--   COMMIT;
--   -- Not: Kod tarafı (Phase 10M) bu kolonu artık okumaz/yazmaz; geri
--   -- eklemek yalnız şemayı 083 durumuna döndürür, davranışı DEĞİL.
-- ============================================================================
