-- ============================================================================
-- Migration 085 — HOMEPAGE i18n: settings_translations HERO alanları
-- ============================================================================
-- AMAÇ:
--   Ana sayfa Hero bölümünün admin tarafından girilen 5 doğal-dil alanının
--   EN/DE karşılıklarını tutabilmek için `settings_translations` tablosuna
--   5 yeni kolon eklemek.
--
--   Eklenenler:
--     hero_title               → Hero H1 (\n ile çok satırlı olabilir)
--     hero_subtitle            → Hero gövde metni
--     hero_badge_text          → Hero üst rozeti (eyebrow)
--     hero_primary_cta_text    → Birincil buton METNİ
--     hero_secondary_cta_text  → İkincil buton METNİ
--
--   Migration 083 + 084 sonrası mevcut kolonlar (DEĞİŞMEZ):
--     footer_copyright · default_meta_title · default_meta_description
--   Bu migration sonrası toplam çevrilebilir alan: 8.
--
-- ⚠️ KAPSAM DIŞI — BİLİNÇLİ OLARAK EKLENMEYENLER:
--   • hero_primary_cta_href / hero_secondary_cta_href → DİL BAĞIMSIZ.
--     Bugünkü değerler sayfa-içi anchor ("#kisa-sureli-firsatlar", "#sss");
--     çevrilmeleri anlamsız ve kırılgan olurdu.
--   • hero_background_image / site_logo / favicon_url / default_og_image
--     → görsel, dil bağımsız.
--   • hero_enabled / hero_overlay_opacity → boolean / sayısal ayar.
--   • site_name, company_legal_name, phone, email, address, sosyal medya
--     → canonical; her dilde aynı.
--   • business_hours → henüz public EN/DE karşılığı yok (kapsam dışı).
--
-- ⚠️ BU MİGRASYON:
--   ❌ `public.settings` tablosuna HİÇ DOKUNMAZ — canonical hero_* alanları
--      (migration 007/067) olduğu gibi kalır ve TR kaynağı olmaya devam eder.
--   ❌ `get_public_settings()` RPC'sine DOKUNMAZ — çeviriler uygulama
--      katmanında ayrı, dar bir sorgudan okunur (Phase 10L §5 kararı).
--   ❌ BACKFILL YAPMAZ — kolonlar NULL başlar; NULL/boş değer public
--      tarafta TR canonical'e düşer.
--   ❌ Mevcut kolon/constraint/index/trigger'a DOKUNMAZ:
--      locale CHECK ('en','de') · UNIQUE (settings_id, locale) ·
--      settings_id FK CASCADE · touch trigger AYNEN kalır.
--   ❌ Migration 001-084'e DOKUNMAZ.
--   ✅ Yalnız ADDITIVE `ADD COLUMN IF NOT EXISTS` — non-destructive,
--      idempotent, veri kaybı riski YOKTUR.
-- ============================================================================

BEGIN;

ALTER TABLE public.settings_translations
  ADD COLUMN IF NOT EXISTS hero_title              text,
  ADD COLUMN IF NOT EXISTS hero_subtitle           text,
  ADD COLUMN IF NOT EXISTS hero_badge_text         text,
  ADD COLUMN IF NOT EXISTS hero_primary_cta_text   text,
  ADD COLUMN IF NOT EXISTS hero_secondary_cta_text text;

COMMENT ON TABLE public.settings_translations IS
  'settings tablosundaki 8 doğal-dil alanının EN/DE çevirileri '
  '(footer_copyright, default_meta_title, default_meta_description, '
  'hero_title, hero_subtitle, hero_badge_text, hero_primary_cta_text, '
  'hero_secondary_cta_text). TR canonical kaynak public.settings '
  'satırıdır — bu tabloda TR SATIRI TUTULMAZ (CHECK ile yasak). '
  'Boş/NULL alan public tarafta TR canonical''e düşer. Secret/config '
  'kolonları (resend_api_key, mail_from*, token''lar, URL/görsel/script '
  'alanları) bu tabloda YOKTUR. CTA href''leri ve hero görseli DİL '
  'BAĞIMSIZ olduğu için buraya EKLENMEDİ.';

COMMENT ON COLUMN public.settings_translations.hero_title IS
  'Ana sayfa Hero başlığı çevirisi. Canonical: settings.hero_title. '
  'Satır sonu (\n) karakteri TR''de olduğu gibi çok satırlı başlık üretir.';

COMMENT ON COLUMN public.settings_translations.hero_primary_cta_text IS
  'Hero birincil buton METNİ çevirisi. Buton bağlantısı '
  '(settings.hero_primary_cta_href) DİL BAĞIMSIZDIR ve çevrilmez.';

COMMENT ON COLUMN public.settings_translations.hero_secondary_cta_text IS
  'Hero ikincil buton METNİ çevirisi. Buton bağlantısı '
  '(settings.hero_secondary_cta_href) DİL BAĞIMSIZDIR ve çevrilmez.';

COMMIT;

-- ============================================================================
-- UYGULAMA (native production, manuel — YALNIZ AÇIK ONAY SONRASI):
--   psql "$DATABASE_URL" --single-transaction -f db/migrations/085_add_settings_translation_hero_fields.sql
--
-- DOĞRULAMA:
--   SELECT column_name
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'settings_translations'
--   ORDER BY ordinal_position;
--   -- Beklenen: id, settings_id, locale, footer_copyright,
--   --           default_meta_title, default_meta_description,
--   --           created_at, updated_at, hero_title, hero_subtitle,
--   --           hero_badge_text, hero_primary_cta_text,
--   --           hero_secondary_cta_text
--
--   -- Constraint'ler DEĞİŞMEDİ mi?
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.settings_translations'::regclass;
--
--   -- Canonical hero alanları DURUYOR mu? (kritik)
--   SELECT hero_title IS NOT NULL AS canonical_hero_duruyor
--   FROM public.settings LIMIT 1;
-- ============================================================================

-- ============================================================================
-- ROLLBACK (destructive — eklenen çeviri verisini siler)
-- ============================================================================
--   BEGIN;
--     ALTER TABLE public.settings_translations
--       DROP COLUMN IF EXISTS hero_title,
--       DROP COLUMN IF EXISTS hero_subtitle,
--       DROP COLUMN IF EXISTS hero_badge_text,
--       DROP COLUMN IF EXISTS hero_primary_cta_text,
--       DROP COLUMN IF EXISTS hero_secondary_cta_text;
--   COMMIT;
--   -- `public.settings` canonical hero alanları ETKİLENMEZ.
-- ============================================================================
