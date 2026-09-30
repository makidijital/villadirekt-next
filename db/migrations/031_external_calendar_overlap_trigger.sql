-- ============================================================================
-- Migration 031 — Cross-Table External Calendar Overlap Trigger
-- ============================================================================
-- AMAÇ:
--   reservations + manual_reservations INSERT/UPDATE akışlarında
--   external_calendar_events tablosuyla half-open [start, end) overlap'i
--   ATOMİK olarak engelle. Postgres EXCLUDE constraint'leri cross-table
--   desteklemediğinden BEFORE INSERT/UPDATE trigger pattern'i kullanılır:
--   aynı transaction içinde indexed SELECT → overlap varsa
--   SQLSTATE 23P01 (exclusion_violation) raise.
--
-- KAPSAM:
--   • reservations  — yalnız status IN ('pending','confirmed') satırları
--     (FAZ 2B canonical allow-list; migration 030 ile DB EXCLUDE hizalı)
--   • manual_reservations — tüm satırlar (status filter yok; admin bloku)
--   • external_calendar_events — yalnız is_active = true satırlar
--
-- MEVCUT GUARDS (KORUNUR):
--   • reservations_no_overlap        EXCLUDE GiST (migration 001/030)
--   • manual_reservations_no_overlap EXCLUDE GiST (migration 001)
--   Bu trigger AYRI KATMAN — mevcut constraint'lere DOKUNULMAZ.
--
-- ----------------------------------------------------------------------------
-- DOKUNULMAYAN:
--   • Half-open [start, end) semantic ve adjacent rule
--     (A:1-5, B:5-10 çakışmaz) — trigger aynı `start_date < end
--      AND end_date > start` clause'unu kullanır
--   • createReservation / updateReservationFull / updateReservationStatus
--     signature ve flow — app code SIFIR değişiklik
--   • createManualReservation / updateManualReservation flow
--   • Payment flow / mail dispatcher / activity log / voucher pipeline
--   • iCal sync service (external_calendar_events INSERT yapar, trigger
--     yalnız reservations + manual_reservations tarafında çalışır →
--     sync etkilenmez)
--   • BookingSidebar / AvailabilityInlineCalendar / ReservationCalendar
--   • getBlockedVillaIds contract (read-only listing; trigger write-path)
--
-- ----------------------------------------------------------------------------
-- APP-SIDE ERROR HANDLING (DEĞİŞMEZ):
--   reservation.service.createReservation:
--     if (error.code === '23P01' ||
--         /reservations_no_overlap/i.test(error.message)) → "Bu tarihler
--                                                           müsait değil"
--   manualReservation.service.createManualReservation / update:
--     if (error.code === '23P01' ||
--         /manual_reservations_no_overlap/i.test(error.message)) → aynı
--
--   Trigger RAISE mesajı:
--     `conflicting key value violates exclusion constraint
--      "reservations_external_no_overlap"` veya
--     `... "manual_reservations_external_no_overlap"`
--
--   • code = '23P01' → mevcut "code check" bayrağı ZATEN match eder ✓
--   • Mesaj substring `reservations_no_overlap` /
--                     `manual_reservations_no_overlap` ZATEN var ✓
--   → İki katmanlı app guard değişiklik gerekmeden trigger'ı tanır.
--     Kullanıcıya gösterilen mesaj: "Bu tarihler artık müsait değil"
--     (mevcut constraint hatalarıyla byte-identical UX).
--
-- ----------------------------------------------------------------------------
-- RACE / ATOMICITY:
--   Trigger BEFORE INSERT/UPDATE — aynı transaction. Trigger içindeki
--   SELECT external_calendar_events partial index'i tarar (mevcut
--   external_calendar_events_overlap_idx (villa_id, start_date, end_date)
--   WHERE is_active = true). READ COMMITTED altında sync TX commit etmiş
--   external row'lar görünür → atomik garanti.
--
--   Residual race (kabul edilen):
--     Customer INSERT TX ile iCal sync TX milisaniye aralığında
--     interleave ederse sync henüz commit etmediği için trigger görmez.
--     Mevcut state: window sınırsız. Trigger ile: ~ms. Bu fix kapsamında
--     SERIALIZABLE isolation eklenmiyor (heavy + retry overhead). Mutlak
--     atomicity gerekirse future hardening.
--
--   Tersine race (sync external INSERT + aynı anda reservation INSERT,
--   her ikisi de commit): trigger bu yönde çalışmıyor (sync source-of-
--   truth, reddet semantik değil). Data anomalisi admin reconciliation.
--   Bu çözüm yine bu fix kapsamında değil (user kuralı: "iCal sync
--   pipeline bozulmayacak").
--
-- ----------------------------------------------------------------------------
-- DEADLOCK ANALİZİ:
--   • Trigger external_calendar_events üzerinden YALNIZ READ yapar
--     (S-lock via index scan).
--   • Sync external_calendar_events'a WRITE yapar (X-lock).
--   • Customer INSERT reservations satırına X-lock + external'a S-lock.
--   → Farklı kaynak sıralamaları, ortak X-lock çakışması yok → deadlock
--   riski yok.
--
-- ----------------------------------------------------------------------------
-- PERFORMANCE:
--   • INSERT/UPDATE başına 1 indexed SELECT (partial index hit).
--   • UPDATE OF (villa_id, start_date, end_date, status) clause:
--     trigger yalnız bu kolonlardan biri değiştiğinde çalışır. note-only
--     update, payment_link update vb. trigger'ı tetiklemez.
--   • reservations/manual write QPS düşük → marjinal cost (~0.1ms).
--
-- ----------------------------------------------------------------------------
-- AUDIT (UYGULAMADAN ÖNCE ÇALIŞTIR):
--   1) Trigger ETKİNLEŞTİRME ÖNCESİ — mevcut reservations + external
--      arasında çakışma var mı?
--
--      SELECT r.id AS reservation_id, r.villa_id, r.status,
--             r.start_date AS r_start, r.end_date AS r_end,
--             e.id AS external_id,
--             e.start_date AS e_start, e.end_date AS e_end,
--             e.summary
--      FROM public.reservations r
--      JOIN public.external_calendar_events e
--        ON r.villa_id = e.villa_id
--       AND e.is_active = true
--       AND r.start_date < e.end_date
--       AND r.end_date   > e.start_date
--      WHERE r.status IN ('pending', 'confirmed')
--      ORDER BY r.start_date;
--
--      → Sonuç boş olmalı. Boş değilse: bu satırlar trigger'dan ÖNCEKİ
--        data anomalileri. Trigger MEVCUT satırları DOĞRULAMAZ (sadece
--        yeni INSERT/UPDATE'ler için çalışır), o yüzden migration'ı
--        çalıştırmak güvenli — ama admin'in bu satırları reconcile
--        etmesi tavsiye edilir (örn. çakışan reservation'ı 'rejected'a
--        çek veya external event'i is_active=false yap).
--
--   2) Aynı kontrol manual_reservations için:
--
--      SELECT m.id AS manual_id, m.villa_id,
--             m.start_date AS m_start, m.end_date AS m_end,
--             e.id AS external_id,
--             e.start_date AS e_start, e.end_date AS e_end,
--             e.summary
--      FROM public.manual_reservations m
--      JOIN public.external_calendar_events e
--        ON m.villa_id = e.villa_id
--       AND e.is_active = true
--       AND m.start_date < e.end_date
--       AND m.end_date   > e.start_date
--      ORDER BY m.start_date;
--
-- ----------------------------------------------------------------------------
-- ROLLBACK:
--   BEGIN;
--     DROP TRIGGER IF EXISTS reservations_external_no_overlap_trg
--       ON public.reservations;
--     DROP TRIGGER IF EXISTS manual_reservations_external_no_overlap_trg
--       ON public.manual_reservations;
--     DROP FUNCTION IF EXISTS public.check_external_calendar_no_overlap();
--   COMMIT;
-- ============================================================================


BEGIN;

-- ----------------------------------------------------------------------------
-- 1) TRIGGER FUNCTION — pure, deterministik, single indexed SELECT
-- ----------------------------------------------------------------------------
-- Defansif: external_calendar_events tablosu yoksa no-op (migration sırası
-- güvenliği). RAISE mesajı TG_TABLE_NAME ile dinamik — app-side regex
-- /reservations_no_overlap/i ve /manual_reservations_no_overlap/i
-- mesajda substring olarak match eder → app code'a SIFIR değişiklik.
--
-- ERRCODE = '23P01' (exclusion_violation) → mevcut app catch'leri
-- code check'i zaten yakalar (UX byte-identical).

CREATE OR REPLACE FUNCTION public.check_external_calendar_no_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 0) Defansif guard — external table henüz yoksa no-op.
  IF to_regclass('public.external_calendar_events') IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1) Allow-list — yalnız bloklayıcı status'lerde external'ı kontrol et.
  --    reservations: pending/confirmed (FAZ 2B canonical)
  --    manual_reservations: tüm satırlar (status filter yok)
  IF TG_TABLE_NAME = 'reservations' THEN
    IF NEW.status IS NULL
       OR NEW.status NOT IN ('pending', 'confirmed') THEN
      RETURN NEW;  -- rejected / cancelled / NULL → availability'yi açar
    END IF;
  END IF;

  -- 2) Half-open [start, end) overlap — mevcut canonical clause.
  --    (existing.start_date < range.end) AND (existing.end_date > range.start)
  --    Adjacent valid: A:1-5, B:5-10 → 1<10 ✓ AND 5>5 ✗ → no overlap.
  IF EXISTS (
    SELECT 1
      FROM public.external_calendar_events
     WHERE villa_id   = NEW.villa_id
       AND is_active  = true
       AND start_date < NEW.end_date
       AND end_date   > NEW.start_date
  ) THEN
    -- Mesaj formatı: app-side regex match için substring
    -- `<table>_no_overlap` içerir; ERRCODE native EXCLUDE constraint
    -- ihlali ile aynı (23P01) → mevcut error mapping byte-identical.
    RAISE EXCEPTION
      'conflicting key value violates exclusion constraint "%_external_no_overlap"',
      TG_TABLE_NAME
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------------------------
-- 2) TRIGGERS — reservations + manual_reservations
-- ----------------------------------------------------------------------------
-- UPDATE OF clause: trigger yalnız availability'yi etkileyen kolon
-- değiştiğinde çalışır → note/payment_link/paid_amount/vb. update'leri
-- trigger'ı tetiklemez (perf + minimal side-effect).

DROP TRIGGER IF EXISTS reservations_external_no_overlap_trg
  ON public.reservations;
CREATE TRIGGER reservations_external_no_overlap_trg
  BEFORE INSERT OR UPDATE OF villa_id, start_date, end_date, status
  ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_external_calendar_no_overlap();

DROP TRIGGER IF EXISTS manual_reservations_external_no_overlap_trg
  ON public.manual_reservations;
CREATE TRIGGER manual_reservations_external_no_overlap_trg
  BEFORE INSERT OR UPDATE OF villa_id, start_date, end_date
  ON public.manual_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_external_calendar_no_overlap();

COMMIT;


-- ----------------------------------------------------------------------------
-- 3) DOĞRULAMA (uygulamadan sonra çalıştır)
-- ----------------------------------------------------------------------------
-- Function + trigger'lar oluştu mu?
--
--   SELECT tgname, tgrelid::regclass, tgenabled
--   FROM pg_trigger
--   WHERE tgname IN ('reservations_external_no_overlap_trg',
--                    'manual_reservations_external_no_overlap_trg');
--   -- Beklenen: 2 satır, tgenabled='O' (origin).
--
--   SELECT proname FROM pg_proc
--   WHERE proname = 'check_external_calendar_no_overlap';
--   -- Beklenen: 1 satır.
--
-- Smoke test 1 — external block + customer reservation BLOCK edilmeli:
--
--   BEGIN;
--     INSERT INTO public.external_calendar_events
--       (source_id, villa_id, external_uid,
--        start_date, end_date, is_active)
--     VALUES (
--       (SELECT id FROM external_calendar_sources LIMIT 1),
--       'VILLA_UUID', 'smoke-uid-1',
--       '2099-06-01', '2099-06-08', true
--     );
--     -- Aşağıdaki INSERT trigger ile REJECT olmalı (SQLSTATE 23P01):
--     INSERT INTO public.reservations
--       (villa_id, start_date, end_date, status, name, phone, total_price)
--     VALUES ('VILLA_UUID', '2099-06-03', '2099-06-06', 'pending',
--             'smoke-customer', '0', 0);
--     -- Beklenen: ERROR conflicting key value violates exclusion constraint
--     --          "reservations_external_no_overlap"
--   ROLLBACK;
--
-- Smoke test 2 — adjacent rule (external 1-8, reservation 8-12) İZİN:
--
--   BEGIN;
--     INSERT INTO public.external_calendar_events
--       (source_id, villa_id, external_uid,
--        start_date, end_date, is_active)
--     VALUES (
--       (SELECT id FROM external_calendar_sources LIMIT 1),
--       'VILLA_UUID', 'smoke-uid-2',
--       '2099-07-01', '2099-07-08', true
--     );
--     INSERT INTO public.reservations
--       (villa_id, start_date, end_date, status, name, phone, total_price)
--     VALUES ('VILLA_UUID', '2099-07-08', '2099-07-12', 'pending',
--             'smoke-adjacent', '0', 0);
--     -- Beklenen: BAŞARILI (8 < 8 yanlış → overlap yok)
--   ROLLBACK;
--
-- Smoke test 3 — rejected status İZİN (allow-list dışı, trigger no-op):
--
--   BEGIN;
--     INSERT INTO public.external_calendar_events
--       (source_id, villa_id, external_uid,
--        start_date, end_date, is_active)
--     VALUES (
--       (SELECT id FROM external_calendar_sources LIMIT 1),
--       'VILLA_UUID', 'smoke-uid-3',
--       '2099-08-01', '2099-08-08', true
--     );
--     INSERT INTO public.reservations
--       (villa_id, start_date, end_date, status, name, phone, total_price)
--     VALUES ('VILLA_UUID', '2099-08-03', '2099-08-06', 'rejected',
--             'smoke-rejected', '0', 0);
--     -- Beklenen: BAŞARILI (rejected bloklayıcı değil; mevcut davranış)
--   ROLLBACK;
--
-- Smoke test 4 — manual_reservations da kontrol edilir:
--
--   BEGIN;
--     INSERT INTO public.external_calendar_events
--       (source_id, villa_id, external_uid,
--        start_date, end_date, is_active)
--     VALUES (
--       (SELECT id FROM external_calendar_sources LIMIT 1),
--       'VILLA_UUID', 'smoke-uid-4',
--       '2099-09-01', '2099-09-08', true
--     );
--     INSERT INTO public.manual_reservations
--       (villa_id, start_date, end_date, source, status)
--     VALUES ('VILLA_UUID', '2099-09-03', '2099-09-06', 'manual', 'blocked');
--     -- Beklenen: ERROR conflicting key value violates exclusion constraint
--     --          "manual_reservations_external_no_overlap"
--   ROLLBACK;
--
-- Smoke test 5 — is_active=false external IGNORED (soft-deactivated):
--
--   BEGIN;
--     INSERT INTO public.external_calendar_events
--       (source_id, villa_id, external_uid,
--        start_date, end_date, is_active)
--     VALUES (
--       (SELECT id FROM external_calendar_sources LIMIT 1),
--       'VILLA_UUID', 'smoke-uid-5',
--       '2099-10-01', '2099-10-08', false
--     );
--     INSERT INTO public.reservations
--       (villa_id, start_date, end_date, status, name, phone, total_price)
--     VALUES ('VILLA_UUID', '2099-10-03', '2099-10-06', 'pending',
--             'smoke-deactivated', '0', 0);
--     -- Beklenen: BAŞARILI (is_active=false soft-deleted, bloklayıcı değil)
--   ROLLBACK;
--
-- Smoke test 6 — note-only update trigger TETİKLEMEZ:
--
--   BEGIN;
--     -- Mevcut bir rezervasyonu seç:
--     UPDATE public.reservations
--     SET note = 'trigger UPDATE OF clause smoke'
--     WHERE id = 'EXISTING_RESERVATION_UUID';
--     -- Beklenen: BAŞARILI (note kolonu UPDATE OF listesinde değil,
--     --                     external check çalışmaz)
--   ROLLBACK;


-- ----------------------------------------------------------------------------
-- DOCUMENTATION
-- ----------------------------------------------------------------------------
COMMENT ON FUNCTION public.check_external_calendar_no_overlap() IS
  'BEFORE INSERT/UPDATE trigger function. reservations + manual_reservations '
  'için external_calendar_events tablosuyla half-open [start,end) overlap '
  'check. SQLSTATE 23P01 ile raise → app-side error mapping byte-identical. '
  'reservations için yalnız status IN (pending,confirmed) satırlarında '
  'çalışır (FAZ 2B canonical allow-list). is_active=false external satırlar '
  'ignored. Mevcut EXCLUDE constraint''lere DOKUNMAZ; cross-table guard '
  'olarak ek katman. Migration 031.';

COMMENT ON TRIGGER reservations_external_no_overlap_trg
  ON public.reservations IS
  'Cross-table atomic guard: reservations ↔ external_calendar_events. '
  'BEFORE INSERT OR UPDATE OF (villa_id, start_date, end_date, status). '
  'UPDATE OF clause sayesinde note/payment alanı update''lerinde trigger '
  'çalışmaz. Migration 031.';

COMMENT ON TRIGGER manual_reservations_external_no_overlap_trg
  ON public.manual_reservations IS
  'Cross-table atomic guard: manual_reservations ↔ external_calendar_events. '
  'BEFORE INSERT OR UPDATE OF (villa_id, start_date, end_date). Migration 031.';