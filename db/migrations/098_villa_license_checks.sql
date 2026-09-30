-- ============================================================================
-- Migration 098 — Villa KTB Belge Kontrolü (runs / checks / states)
-- ============================================================================
-- AMAÇ:
--   Admin "Mülkler → Belge Kontrolü" ekranı için, villaların
--   `villa.tourism_document_number` değerlerinin T.C. Kültür ve Turizm
--   Bakanlığı (KTB) kaydına göre kontrol sonuçlarını ve GEÇMİŞİNİ tutmak.
--
-- TASARIM KARARLARI:
--   • villa tablosuna KOLON EKLENMEZ. Villa kopyalama (clone.service)
--     `select *` + blacklist ile çalıştığı için villa'ya eklenecek kontrol
--     kolonları kopyaya taşınırdı; kontrol verisi ayrı tablolarda tutulur.
--   • KTB'den KİŞİSEL VERİ SAKLANMAZ (belge sahibi, adres vb.). Yalnız
--     sonuç, sebep kodu, HTTP kodu ve yanıt özeti (sha256).
--   • Sonuç değerleri: VALID | NOT_FOUND | INVALID | CHECK_FAILED.
--     CHECK_FAILED hiçbir zaman "geçersiz" anlamına gelmez; son güvenilir
--     durumu (villa_license_states.current_status) DEĞİŞTİRMEZ.
--   • Tek aktif TOPLU tarama: kısmi unique index (trigger='full' AND
--     status IN ('queued','running')). İki admin aynı anda başlatırsa
--     ikinci INSERT 23505 alır → servis mevcut taramayı döner.
--   • Kilit (lease): lease_owner + lease_until. Aynı run için aynı anda
--     yalnız bir tick belge işler; tarayıcı kapanır / container restart
--     olursa lease süresi dolar, sonraki tick kaldığı yerden devam eder.
--   • ON DELETE CASCADE: villa hard-delete edilince kontrol verisi de
--     silinir (soft-delete'te korunur).
--
-- BACKWARD-COMPATIBILITY:
--   • Yalnız YENİ tablolar. Mevcut tablolar / trigger / RLS DEĞİŞMEZ.
--   • IF NOT EXISTS ile tekrar çalıştırılabilir.
--
-- ROLLBACK (gerekirse, ayrı transaction'da):
--   DROP TABLE IF EXISTS public.villa_license_states;
--   DROP TABLE IF EXISTS public.villa_license_checks;
--   DROP TABLE IF EXISTS public.villa_license_check_runs;
-- ============================================================================

BEGIN;

-- 1) Tarama kayıtları -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.villa_license_check_runs (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  status               text        NOT NULL DEFAULT 'queued',
  trigger              text        NOT NULL DEFAULT 'full',
  started_by_admin_id  uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  started_at           timestamptz,
  finished_at          timestamptz,
  total_documents      integer     NOT NULL DEFAULT 0,
  processed_documents  integer     NOT NULL DEFAULT 0,
  valid_count          integer     NOT NULL DEFAULT 0,
  not_found_count      integer     NOT NULL DEFAULT 0,
  invalid_count        integer     NOT NULL DEFAULT 0,
  check_failed_count   integer     NOT NULL DEFAULT 0,
  abort_reason         text,
  lease_owner          text,
  lease_until          timestamptz,
  CONSTRAINT villa_license_check_runs_status
    CHECK (status IN ('queued', 'running', 'completed', 'aborted', 'failed')),
  CONSTRAINT villa_license_check_runs_trigger
    CHECK (trigger IN ('full', 'single'))
);

-- Aynı anda yalnız BİR aktif toplu tarama.
CREATE UNIQUE INDEX IF NOT EXISTS villa_license_check_runs_one_active_full
  ON public.villa_license_check_runs ((true))
  WHERE trigger = 'full' AND status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS villa_license_check_runs_created_idx
  ON public.villa_license_check_runs (created_at DESC);

-- 2) Kontrol geçmişi (her villa × her kontrol bir satır; kuyruk + tarihçe) --
CREATE TABLE IF NOT EXISTS public.villa_license_checks (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                      uuid        NOT NULL
    REFERENCES public.villa_license_check_runs (id) ON DELETE CASCADE,
  villa_id                    uuid        NOT NULL
    REFERENCES public.villa (id) ON DELETE CASCADE,
  document_number_raw         text        NOT NULL,
  document_number_normalized  text,
  result_status               text,       -- NULL = henüz işlenmedi (bekliyor)
  reason_code                 text,
  http_status                 integer,
  attempt_count               integer     NOT NULL DEFAULT 0,
  previous_status             text,
  response_sha256             text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  claimed_at                  timestamptz,
  checked_at                  timestamptz,
  CONSTRAINT villa_license_checks_result_status
    CHECK (result_status IS NULL
           OR result_status IN ('VALID', 'NOT_FOUND', 'INVALID', 'CHECK_FAILED')),
  CONSTRAINT villa_license_checks_previous_status
    CHECK (previous_status IS NULL
           OR previous_status IN ('VALID', 'NOT_FOUND', 'INVALID')),
  CONSTRAINT villa_license_checks_reason_len
    CHECK (reason_code IS NULL OR char_length(reason_code) <= 64),
  CONSTRAINT villa_license_checks_doc_raw_len
    CHECK (char_length(document_number_raw) <= 200)
);

CREATE INDEX IF NOT EXISTS villa_license_checks_run_pending_idx
  ON public.villa_license_checks (run_id, document_number_normalized)
  WHERE result_status IS NULL;
CREATE INDEX IF NOT EXISTS villa_license_checks_run_idx
  ON public.villa_license_checks (run_id);
CREATE INDEX IF NOT EXISTS villa_license_checks_villa_idx
  ON public.villa_license_checks (villa_id, checked_at DESC);

-- 3) Villa başına son güvenilir durum ---------------------------------------
CREATE TABLE IF NOT EXISTS public.villa_license_states (
  villa_id                    uuid        PRIMARY KEY
    REFERENCES public.villa (id) ON DELETE CASCADE,
  document_number_normalized  text,
  current_status              text        NOT NULL DEFAULT 'UNCHECKED',
  previous_status             text,
  status_changed_at           timestamptz,
  first_valid_at              timestamptz,
  last_valid_at               timestamptz,
  last_checked_at             timestamptz,
  last_success_at             timestamptz,
  last_result_status          text,
  last_reason_code            text,
  consecutive_failures        integer     NOT NULL DEFAULT 0,
  consecutive_not_found       integer     NOT NULL DEFAULT 0,
  consecutive_invalid         integer     NOT NULL DEFAULT 0,
  last_check_id               uuid,
  review_state                text        NOT NULL DEFAULT 'ok',
  review_reason               text,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT villa_license_states_current_status
    CHECK (current_status IN ('UNCHECKED', 'VALID', 'NOT_FOUND', 'INVALID')),
  CONSTRAINT villa_license_states_previous_status
    CHECK (previous_status IS NULL
           OR previous_status IN ('VALID', 'NOT_FOUND', 'INVALID')),
  CONSTRAINT villa_license_states_last_result_status
    CHECK (last_result_status IS NULL
           OR last_result_status IN ('VALID', 'NOT_FOUND', 'INVALID', 'CHECK_FAILED')),
  CONSTRAINT villa_license_states_review_state
    CHECK (review_state IN ('ok', 'needs_review'))
);

COMMENT ON TABLE public.villa_license_check_runs IS
  'KTB belge kontrolü tarama kayıtları (Mülkler → Belge Kontrolü). trigger=full: toplu, single: tek villa. Migration 098.';
COMMENT ON TABLE public.villa_license_checks IS
  'KTB belge kontrolü geçmişi. result_status NULL = bekleyen satır. KTB kişisel verisi SAKLANMAZ. Migration 098.';
COMMENT ON TABLE public.villa_license_states IS
  'Villa başına son GÜVENİLİR KTB belge durumu. CHECK_FAILED current_status''u değiştirmez. Migration 098.';

COMMIT;
