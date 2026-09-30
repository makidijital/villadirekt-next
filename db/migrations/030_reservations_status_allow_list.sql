-- ============================================================================
-- Migration 030 — Reservations Status Allow-List Alignment
-- ============================================================================
-- AMAÇ:
--   DB-level EXCLUDE constraint'in availability allow-list'ini app-level
--   canonical kuralla HİZALA. Mevcut drift:
--
--     ESKI (migration 001):
--       WHERE (status IS DISTINCT FROM 'rejected')
--       → bloklayıcı set: {pending, confirmed, cancelled, NULL, +future}
--
--     APP CANONICAL (Faz 2B + lib/availability.validator):
--       AVAILABILITY_BLOCKING_STATUSES = ["pending", "confirmed"]
--       → bloklayıcı set: {pending, confirmed}
--
--   Drift sonucu: `status='cancelled'` bir rezervasyon ile çakışan yeni
--   pending INSERT:
--     • app fast-path SELECT geçer (cancelled allow-list dışı)
--     • DB EXCLUDE constraint REJECT eder (cancelled bloklayıcı sayılıyor)
--     • kullanıcı "Bu tarihler artık müsait değil" görür (gerçekte boş)
--
--   Bu migration constraint'i app canonical ile hizalar:
--     WHERE status IN ('pending', 'confirmed')
--
-- ----------------------------------------------------------------------------
-- DOKUNULMAYAN:
--   • Half-open [start, end) semantik — aynı GiST + daterange(...,'[)')
--   • Adjacent rule (A:1-5, B:5-10 çakışmaz) — semantic byte-identical
--   • Reservation create / update / status flow — app code SIFIR değişiklik
--   • Mail / payment / voucher / activity-log — etkilenmiyor
--   • manual_reservations_no_overlap — dokunulmuyor (zaten partial filter
--     yok; tüm manuel satırlar her zaman bloklayıcı, doğru semantic)
--   • external_calendar_events — ayrı tablo, ayrı lifecycle
--
-- ----------------------------------------------------------------------------
-- GÜVENLIK ANALIZI:
--   Yeni constraint ESKİSİNDEN DAHA AZ KISITLAYICI (less restrictive):
--     • Eski: cancelled+non-rejected overlap çiftleri DB-level engelleniyordu
--     • Yeni: cancelled artık tamamen serbest, yalnız pending+confirmed
--             arası overlap yakalanır
--   → `ADD CONSTRAINT` fail riski YOK; eski constraint geçen tüm satırlar
--     yeni constraint'ten de geçer. Data migration gerekmiyor.
--
--   Çift rezervasyon koruması KORUNUR:
--     • pending ↔ pending overlap → REJECT
--     • pending ↔ confirmed overlap → REJECT
--     • confirmed ↔ confirmed overlap → REJECT
--     • rejected/cancelled herhangi biriyle overlap → izin (app davranışı)
--
-- ----------------------------------------------------------------------------
-- ZORUNLU AUDIT (UYGULAMADAN ÖNCE ÇALIŞTIR):
--   Production'da legal-dışı status değeri ya da yeni constraint'in
--   serbest bıraktığı çakışmalar var mı kontrol et.
--
--   1) Hangi statüsler mevcut:
--      SELECT status, count(*) FROM reservations GROUP BY status ORDER BY 2 DESC;
--      Beklenen: pending / confirmed / rejected / cancelled (varsa).
--      Tipo / legacy varsa ("canceled" vb.) — önce normalize et.
--
--   2) Yeni constraint kapsamına giren çakışmalar (UYGULAMA ÖNCESİ
--      boş gelmeli — uygulayınca yeni constraint ADD başarılı olur):
--      WITH r AS (
--        SELECT id, villa_id, start_date, end_date, status,
--               daterange(start_date, end_date, '[)') AS rng
--        FROM reservations
--        WHERE status IN ('pending', 'confirmed')
--      )
--      SELECT a.id AS a_id, b.id AS b_id, a.villa_id,
--             a.start_date AS a_start, a.end_date AS a_end,
--             a.status AS a_status, b.status AS b_status
--      FROM r a JOIN r b
--        ON a.villa_id = b.villa_id
--       AND a.id < b.id
--       AND a.rng && b.rng;
--      → Sonuç boş olmalı (mevcut constraint zaten engelliyordu).
--
--   3) Yeni constraint'in artık SERBEST bırakacağı eski çakışmalar
--      (sadece bilgi; data normalize etmeye gerek yok, app zaten doğru
--      davranıyor):
--      WITH r AS (
--        SELECT id, villa_id, start_date, end_date, status,
--               daterange(start_date, end_date, '[)') AS rng
--        FROM reservations
--        WHERE status IS DISTINCT FROM 'rejected'
--      )
--      SELECT a.id AS a_id, b.id AS b_id, a.villa_id,
--             a.status AS a_status, b.status AS b_status
--      FROM r a JOIN r b
--        ON a.villa_id = b.villa_id
--       AND a.id < b.id
--       AND a.rng && b.rng
--       AND NOT (a.status IN ('pending','confirmed')
--                AND b.status IN ('pending','confirmed'));
--      → cancelled'lı satırlar burada görünebilir; app onları zaten serbest
--        sayıyor, dolayısıyla yeni constraint ile semantic hizalı.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK:
--   BEGIN;
--     ALTER TABLE public.reservations
--       DROP CONSTRAINT reservations_no_overlap;
--     ALTER TABLE public.reservations
--       ADD CONSTRAINT reservations_no_overlap
--       EXCLUDE USING gist (
--         villa_id WITH =,
--         daterange(start_date, end_date, '[)') WITH &&
--       )
--       WHERE (status IS DISTINCT FROM 'rejected');
--   COMMIT;
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) DROP + RE-CREATE — tek transaction
-- ----------------------------------------------------------------------------
BEGIN;

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_no_overlap;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    villa_id WITH =,
    daterange(start_date, end_date, '[)') WITH &&
  )
  WHERE (status IN ('pending', 'confirmed'));

COMMIT;


-- ----------------------------------------------------------------------------
-- 2) DOĞRULAMA (uygulamadan sonra çalıştır)
-- ----------------------------------------------------------------------------
-- Constraint güncellendi mi?
--
--   SELECT conname, pg_get_constraintdef(oid) AS def
--   FROM pg_constraint
--   WHERE conname = 'reservations_no_overlap';
--
--   Beklenen def fragment:
--     EXCLUDE USING gist (villa_id WITH =,
--                         daterange(start_date, end_date, '[)') WITH &&)
--     WHERE ((status = ANY (ARRAY['pending'::text, 'confirmed'::text])))
--
-- Smoke test (transactional, ROLLBACK ile temizlenir):
--
--   BEGIN;
--     -- Adjacent valid — başarılı olmalı (checkout = next checkin):
--     INSERT INTO reservations (villa_id, start_date, end_date, status,
--                               name, phone, total_price)
--     VALUES ('VILLA_UUID', '2099-01-01', '2099-01-05', 'pending',
--             'test-a', '0', 0);
--     INSERT INTO reservations (villa_id, start_date, end_date, status,
--                               name, phone, total_price)
--     VALUES ('VILLA_UUID', '2099-01-05', '2099-01-10', 'pending',
--             'test-b', '0', 0);
--   ROLLBACK;
--
--   BEGIN;
--     -- pending ↔ pending overlap — REJECT (SQLSTATE 23P01):
--     INSERT INTO reservations (villa_id, start_date, end_date, status,
--                               name, phone, total_price)
--     VALUES ('VILLA_UUID', '2099-02-01', '2099-02-05', 'pending',
--             'test-a', '0', 0);
--     INSERT INTO reservations (villa_id, start_date, end_date, status,
--                               name, phone, total_price)
--     VALUES ('VILLA_UUID', '2099-02-04', '2099-02-08', 'pending',
--             'test-b', '0', 0);
--     -- Beklenen: ERROR conflicting key value violates exclusion constraint
--     --          "reservations_no_overlap"
--   ROLLBACK;
--
--   BEGIN;
--     -- cancelled + pending overlap — IZIN (yeni davranış, app ile hizalı):
--     INSERT INTO reservations (villa_id, start_date, end_date, status,
--                               name, phone, total_price)
--     VALUES ('VILLA_UUID', '2099-03-01', '2099-03-05', 'cancelled',
--             'test-a', '0', 0);
--     INSERT INTO reservations (villa_id, start_date, end_date, status,
--                               name, phone, total_price)
--     VALUES ('VILLA_UUID', '2099-03-02', '2099-03-06', 'pending',
--             'test-b', '0', 0);
--     -- Beklenen: BAŞARILI (cancelled bloklayıcı değil)
--   ROLLBACK;
--
--   BEGIN;
--     -- rejected + pending overlap — IZIN (mevcut davranış korunur):
--     INSERT INTO reservations (villa_id, start_date, end_date, status,
--                               name, phone, total_price)
--     VALUES ('VILLA_UUID', '2099-04-01', '2099-04-05', 'rejected',
--             'test-a', '0', 0);
--     INSERT INTO reservations (villa_id, start_date, end_date, status,
--                               name, phone, total_price)
--     VALUES ('VILLA_UUID', '2099-04-02', '2099-04-06', 'pending',
--             'test-b', '0', 0);
--     -- Beklenen: BAŞARILI (önceki davranışla aynı)
--   ROLLBACK;


-- ----------------------------------------------------------------------------
-- DOCUMENTATION
-- ----------------------------------------------------------------------------
COMMENT ON CONSTRAINT reservations_no_overlap ON public.reservations IS
  'Half-open [start, end) overlap protection. Allow-list canonical: '
  'WHERE status IN (''pending'', ''confirmed''). app-level '
  'AVAILABILITY_BLOCKING_STATUSES (lib/availability.validator.ts) ile '
  'lockstep. rejected/cancelled rezervasyonlar availability''yi açar — '
  'app fast-path SELECT''leri ve DB constraint aynı semantic.';