-- ============================================================================
-- Migration 032 — external_calendar_events.manually_deactivated
-- ============================================================================
-- AMAÇ:
--   Admin'in tek tek event'i pasifleştirebilmesi + sonraki sync'in onu
--   geri diriltememesi için minimal bir override bayrağı.
--
-- ROOT CAUSE (BEFORE):
--   `syncExternalCalendarSource > buildUpsertRows` UPSERT payload'ında
--   `is_active: true` FORCE-SET ediyor. Aynı event_uid feed'de tekrar
--   görünürse ON CONFLICT DO UPDATE → is_active=true rewrite → admin'in
--   manuel pasifleştirmesi geri dirilir.
--
-- ÇÖZÜM:
--   `manually_deactivated boolean NOT NULL DEFAULT false` ekle.
--   Admin pasifleştirme: is_active=false + manually_deactivated=true.
--   Sync upsert sonrası post-step: source_id+manually_deactivated=true
--   satırlar için is_active'i tekrar false'a düşür.
--
-- DOKUNULMAYAN:
--   • EXCLUDE constraint'ler (migration 001/030)
--   • Cross-table overlap trigger (migration 031)
--   • external_calendar_events_overlap_idx (WHERE is_active=true) —
--     manually_deactivated=true satırlar zaten is_active=false olacağı
--     için index hit'i dışında kalır, availability sorgusu doğal hizalı.
--   • RLS policy'leri (anon deny + authenticated SELECT only)
--   • Migration 029 schema (kolon ek; mevcut satırlar default=false ile
--     backfill — geçmiş davranış birebir korunur)
--
-- ROLLBACK:
--   BEGIN;
--     ALTER TABLE public.external_calendar_events
--       DROP COLUMN IF EXISTS manually_deactivated;
--   COMMIT;
-- ============================================================================

BEGIN;

ALTER TABLE public.external_calendar_events
  ADD COLUMN IF NOT EXISTS manually_deactivated boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.external_calendar_events.manually_deactivated IS
  'Admin tek tek pasifleştirme override''ı (FAZ 56G+). true ise sonraki '
  'sync''ler upsert sırasında is_active''i geri true yapsa bile post-step '
  'sweep tekrar false''a düşürür. Sync stale-deactivate normal akışı '
  'etkilenmez; yalnız manuel-pasifleştirilen event''ler immune.';

COMMIT;

-- ----------------------------------------------------------------------------
-- DOĞRULAMA
-- ----------------------------------------------------------------------------
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'external_calendar_events'
--   AND column_name = 'manually_deactivated';
-- → 1 satır: boolean / NO / false
