-- ============================================================================
-- 🔥 DOUBLE-BOOKING PROTECTION — DB-LEVEL ATOMIC ENFORCEMENT
-- ============================================================================
-- Bu migration concurrent reservation insert'lerinde race condition'ı
-- engellemek için iki Postgres EXCLUDE constraint'i ekler.
--
-- ÇALIŞMASI:
--   GiST index'i (villa_id, daterange) çiftine göre overlap'i atomik
--   olarak doğrular. Aynı villa için aynı tarih aralığında iki
--   concurrent INSERT geldiğinde Postgres ikincisini SQLSTATE 23P01
--   (exclusion_violation) ile reddeder. Application-level SELECT
--   yarış aralığı kapanır.
--
-- DATE RANGE TİPİ:
--   daterange(start_date, end_date, '[)')
--     - inclusive start, EXCLUSIVE end
--     - Rezervasyon 2026-07-01 → 2026-07-05  ⇒ kapsar 1,2,3,4 (5 değil)
--     - Rezervasyon 2026-07-05 → 2026-07-10  ⇒ kapsar 5,6,7,8,9
--     - İki range adjacent → overlap YOK ⇒ "checkout = next checkin"
--       semantiği AYNEN korunur.
--
-- WHERE PREDIKATI:
--   reservations: WHERE (status IS DISTINCT FROM 'rejected')
--     - Mevcut application-level kontrol (.neq("status","rejected"))
--       ile birebir aynı: pending / confirmed / cancelled blocklayıcı,
--       rejected serbest bırakıcı.
--   manual_reservations: predikat YOK — tüm manuel bloklar her zaman
--                        date'i kapatır.
--
-- ÖN GEREKSİNİM:
--   btree_gist extension. uuid (=) + daterange (&&) operatörlerinin
--   aynı GiST index'inde birlikte kullanılabilmesi için şart.
--
-- UYARI — VAR OLAN ÇAKIŞAN VERİ:
--   ALTER TABLE ... ADD CONSTRAINT, mevcut çakışan satırlar varsa
--   FAIL eder. Önce aşağıdaki SELECT ile audit yap; ardından düzelt
--   (status='rejected' yap, sil, veya tarihi değiştir), sonra migration'ı
--   uygula. Bu güvenli yöntem.
--
-- ROLLBACK:
--   ALTER TABLE reservations         DROP CONSTRAINT reservations_no_overlap;
--   ALTER TABLE manual_reservations  DROP CONSTRAINT manual_reservations_no_overlap;
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) AUDIT (ÖNCE ÇALIŞTIR — sonuç boş gelmeli)
-- ----------------------------------------------------------------------------
-- Mevcut çakışan reservations satırlarını listele:
--
-- WITH r AS (
--   SELECT id, villa_id, start_date, end_date, status,
--          daterange(start_date, end_date, '[)') AS rng
--   FROM reservations
--   WHERE status IS DISTINCT FROM 'rejected'
-- )
-- SELECT a.id AS a_id, b.id AS b_id, a.villa_id,
--        a.start_date AS a_start, a.end_date AS a_end,
--        b.start_date AS b_start, b.end_date AS b_end,
--        a.status AS a_status, b.status AS b_status
-- FROM r a JOIN r b
--   ON a.villa_id = b.villa_id
--  AND a.id < b.id
--  AND a.rng && b.rng;
--
-- Çakışan manual_reservations satırlarını listele:
--
-- WITH m AS (
--   SELECT id, villa_id, start_date, end_date,
--          daterange(start_date, end_date, '[)') AS rng
--   FROM manual_reservations
-- )
-- SELECT a.id AS a_id, b.id AS b_id, a.villa_id,
--        a.start_date AS a_start, a.end_date AS a_end,
--        b.start_date AS b_start, b.end_date AS b_end
-- FROM m a JOIN m b
--   ON a.villa_id = b.villa_id
--  AND a.id < b.id
--  AND a.rng && b.rng;


-- ----------------------------------------------------------------------------
-- 1) EXTENSION
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- ----------------------------------------------------------------------------
-- 2) RESERVATIONS — partial EXCLUDE (rejected hariç)
-- ----------------------------------------------------------------------------
ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    villa_id WITH =,
    daterange(start_date, end_date, '[)') WITH &&
  )
  WHERE (status IS DISTINCT FROM 'rejected');


-- ----------------------------------------------------------------------------
-- 3) MANUAL_RESERVATIONS — full EXCLUDE
-- ----------------------------------------------------------------------------
ALTER TABLE manual_reservations
  ADD CONSTRAINT manual_reservations_no_overlap
  EXCLUDE USING gist (
    villa_id WITH =,
    daterange(start_date, end_date, '[)') WITH &&
  );


-- ----------------------------------------------------------------------------
-- 4) DOĞRULAMA (uygulamadan sonra ÇALIŞTIR)
-- ----------------------------------------------------------------------------
-- Constraint'lerin oluştuğunu kontrol et:
--
-- SELECT conname, contype, conrelid::regclass
-- FROM pg_constraint
-- WHERE conname IN ('reservations_no_overlap',
--                   'manual_reservations_no_overlap');
--
-- Test: aynı villa için adjacent date'ler INSERT — başarılı olmalı
-- (checkout = next checkin valid):
--
-- BEGIN;
--   INSERT INTO reservations (villa_id, start_date, end_date, status, ...)
--   VALUES ('VILLA_UUID', '2099-01-01', '2099-01-05', 'pending', ...);
--   INSERT INTO reservations (villa_id, start_date, end_date, status, ...)
--   VALUES ('VILLA_UUID', '2099-01-05', '2099-01-10', 'pending', ...);
-- ROLLBACK;
--
-- Test: aynı villa için OVERLAPPING date'ler INSERT — ikinci hata vermeli
-- (SQLSTATE 23P01 exclusion_violation):
--
-- BEGIN;
--   INSERT INTO reservations (villa_id, start_date, end_date, status, ...)
--   VALUES ('VILLA_UUID', '2099-02-01', '2099-02-05', 'pending', ...);
--   INSERT INTO reservations (villa_id, start_date, end_date, status, ...)
--   VALUES ('VILLA_UUID', '2099-02-04', '2099-02-08', 'pending', ...);
-- -- Beklenen: ERROR  conflicting key value violates exclusion constraint
-- -- "reservations_no_overlap"
-- ROLLBACK;
