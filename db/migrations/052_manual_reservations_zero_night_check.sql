-- ============================================================
-- 052 — MANUAL_RESERVATIONS ZERO-NIGHT CHECK
-- ============================================================
-- Amaç: manuel bloklarda aynı gün başlangıç/bitiş (start_date =
-- end_date) kayıtlarını DB seviyesinde kalıcı olarak engellemek.
--
-- Arka plan:
--   Availability modeli half-open daterange [start, end) kullanır.
--   start == end → daterange(start, end, '[)') = EMPTY (boş aralık);
--   EXCLUDE GiST constraint boş aralığı hiçbir şeyle çakışmaz sayar,
--   bu yüzden tek günlük (zero-night) manuel blok overlap motoruna
--   görünmez ama takvimi kilitler → görsel/mantık tutarsızlığı.
--   `external_calendar_events` tablosunda zaten eşdeğer koruma var
--   (029: external_calendar_events_date_order). Bu migration aynı
--   garantiyi manual_reservations için ekler.
--
-- Service katmanı (app/services/manualReservation.service.ts) create
-- ve update akışlarında `start >= end` ile zaten reddediyor; bu CHECK
-- servisi bypass eden tüm yolları (doğrudan SQL, ileride eklenecek
-- route) da kapatan kalıcı emniyet kemeridir.
--
-- ⚠️ GÜVENLİK: Constraint eklenmeden ÖNCE mevcut kirli kayıt
-- (start_date >= end_date) kontrol edilir; varsa migration HATA verip
-- DURUR (constraint eklenmez). Önce kirli kayıtlar temizlenmeli.
--
-- Rollback:
--   ALTER TABLE manual_reservations
--     DROP CONSTRAINT manual_reservations_date_order;
-- ============================================================

BEGIN;

-- 1) PRE-CHECK — kirli (zero-night / ters) kayıt varsa DURDUR.
--    Bu blok migration'ı güvenli kılar: kirli veri üstüne constraint
--    eklemeye çalışmaz, açık bir hata mesajıyla raporlar.
DO $$
DECLARE
  dirty_count integer;
BEGIN
  SELECT count(*)
    INTO dirty_count
    FROM manual_reservations
   WHERE start_date >= end_date;

  IF dirty_count > 0 THEN
    RAISE EXCEPTION
      'ABORT: manual_reservations icinde % adet zero-night/ters kayit var (start_date >= end_date). Constraint eklenmedi. Once bu kayitlari temizleyin: SELECT id, start_date, end_date FROM manual_reservations WHERE start_date >= end_date;',
      dirty_count;
  END IF;
END
$$;

-- 2) CHECK constraint — half-open [start, end) zero-night reddi.
--    external_calendar_events_date_order ile isim/semantik parite.
ALTER TABLE manual_reservations
  ADD CONSTRAINT manual_reservations_date_order
  CHECK (start_date < end_date);

COMMIT;

-- ============================================================
-- Doğrulama (manuel, opsiyonel):
--   -- constraint listede mi?
--   SELECT conname FROM pg_constraint
--    WHERE conname = 'manual_reservations_date_order';
--
--   -- zero-night insert artık reddedilmeli (test):
--   -- INSERT INTO manual_reservations (villa_id, start_date, end_date)
--   --   VALUES ('<uuid>', '2026-08-19', '2026-08-19');  -- → CHECK violation
-- ============================================================
