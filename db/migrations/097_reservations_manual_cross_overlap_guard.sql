-- ============================================================================
-- Migration 097 — Reservations ↔ Manual Blocks Cross-Table Overlap Guard
-- ============================================================================
-- AMAÇ:
--   Web/admin rezervasyonu (reservations) ile manuel blok
--   (manual_reservations) arasında, aynı villa + half-open [start, end)
--   overlap'ini DB seviyesinde SON SAVUNMA HATTI olarak reddetmek.
--   Uygulama kontrolü (check_villa_availability_conflict RPC,
--   manualReservation.service cross-check) AYNEN çalışmaya devam eder;
--   bu migration yalnız uygulama kontrolü atlanırsa / yarışta kaçırılırsa
--   devreye girer.
--
-- MEVCUT DURUM (bu migration'dan ÖNCE):
--   • reservations ↔ reservations       : EXCLUDE reservations_no_overlap
--                                          (001/030; pending+confirmed) ✓
--   • manual ↔ manual                    : EXCLUDE manual_reservations_no_overlap
--                                          (001) ✓
--   • reservations → external (iCal)     : trigger 031 ✓
--   • manual → external (iCal)           : trigger 031 ✓
--   • reservations → manual              : DB KORUMASI YOK  ← bu migration
--   • manual → reservations              : DB KORUMASI YOK  ← bu migration
--   • external → reservations/manual     : bilinçli olarak YOK (031 notu:
--       iCal sync source-of-truth; tek batch UPSERT — reddetmek tüm
--       kaynağın sync'ini düşürür). Bu migration da DOKUNMAZ.
--
-- KURAL (mevcut uygulama semantiği ile BİREBİR):
--   • reservations: yalnız status IN ('pending','confirmed') bloklar
--     (AVAILABILITY_BLOCKING_STATUSES / 030 EXCLUDE WHERE ile aynı).
--     rejected / cancelled / NULL → kontrol edilmez.
--   • manual_reservations: tüm satırlar bloklar (status kolonu yok).
--   • Overlap: existing.start_date < NEW.end_date
--              AND existing.end_date > NEW.start_date   (half-open [) )
--     Örn. 10–15 ile 15–20 ÇAKIŞMAZ; 10–15 ile 14–16 ÇAKIŞIR.
--
-- YARIŞ (RACE) GÜVENLİĞİ:
--   Cross-table kontrol EXCLUDE ile yapılamaz; trigger + EXISTS tek başına
--   READ COMMITTED altında yarışa açıktır (iki TX aynı anda "yok" görür).
--   Bu yüzden her iki trigger da kontrol ÖNCESİ villa bazlı,
--   transaction-scoped advisory lock alır:
--       pg_advisory_xact_lock(hashtextextended('villa_availability:' || villa_id, 0))
--   Aynı villaya eşzamanlı ikinci yazan, ilki COMMIT/ROLLBACK edene kadar
--   bekler; trigger fonksiyonu VOLATILE olduğundan beklemeden sonraki
--   EXISTS sorgusu yeni snapshot alır ve commit edilmiş satırı görür.
--   Kilit yalnız bu iki tablodaki bloklayıcı yazımlarda alınır; farklı
--   villalar birbirini beklemez. (REPEATABLE READ / SERIALIZABLE altında
--   snapshot sabit olduğundan bu garanti READ COMMITTED içindir — uygulama
--   varsayılan READ COMMITTED kullanır.)
--
-- HATA SÖZLEŞMESİ (app kodu DEĞİŞMEDEN tanınır):
--   RAISE ... USING ERRCODE = '23P01' (exclusion_violation)
--   • reservation create  → mapInsertError (code 23P01) → "Bu tarihler artık müsait değil"
--   • manual create/update → code 23P01 → "Bu tarihler artık müsait değil"
--   • admin reservation update/status → mevcut genel "Güncellenemedi" /
--     "Durum güncellenemedi" (reservations_no_overlap ihlaliyle AYNI davranış)
--
-- DOKUNULMAYAN:
--   • reservations_no_overlap / manual_reservations_no_overlap EXCLUDE'ları
--   • 031 trigger'ları ve check_external_calendar_no_overlap()
--   • check_villa_availability_conflict / get_blocked_villa_ids /
--     get_villa_blocked_ranges RPC'leri
--   • external_calendar_events ve iCal sync pipeline
--   • Uygulama kodu (SIFIR değişiklik)
--
-- MEVCUT SATIRLAR:
--   Trigger mevcut satırları DOĞRULAMAZ (yalnız yeni INSERT/UPDATE).
--   Aşağıdaki DO bloğu uygulama anında mevcut çakışma sayısını NOTICE
--   olarak yazar (migration'ı DURDURMAZ).
--   UPDATE'te "dolu ayak izi" değişmiyorsa (aynı villa + aynı tarihler,
--   rezervasyon zaten pending/confirmed — örn. pending → confirmed onayı
--   veya aynı değerlerle form kaydı) kontrol ATLANIR → eski çakışmalı
--   satırların admin akışı kilitlenmez. Yalnız tarih/villa değişimi veya
--   rejected/cancelled → pending/confirmed geçişi kontrol edilir.
--   Yine de uygulamadan ÖNCE aşağıdaki AUDIT sorgusunu çalıştırın.
--
-- AUDIT (UYGULAMADAN ÖNCE, SALT-OKUNUR):
--   SELECT r.id AS reservation_id, r.villa_id, r.status,
--          r.start_date AS r_start, r.end_date AS r_end,
--          m.id AS manual_id, m.start_date AS m_start, m.end_date AS m_end
--     FROM public.reservations r
--     JOIN public.manual_reservations m
--       ON m.villa_id = r.villa_id
--      AND m.start_date < r.end_date
--      AND m.end_date   > r.start_date
--    WHERE r.status IN ('pending', 'confirmed')
--    ORDER BY r.start_date;
--   → Boş olmalı. Değilse admin reconcile etmeli (manuel bloğu sil/kısalt
--     veya rezervasyonu reddet) — migration yine de güvenle uygulanabilir.
--
-- İDEMPOTENT: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.
--
-- ROLLBACK:
--   BEGIN;
--     DROP TRIGGER IF EXISTS reservations_manual_no_overlap_trg
--       ON public.reservations;
--     DROP TRIGGER IF EXISTS manual_reservations_reservation_no_overlap_trg
--       ON public.manual_reservations;
--     DROP FUNCTION IF EXISTS public.check_reservation_manual_no_overlap();
--   COMMIT;
--   (Veri değiştirilmez; rollback yalnız korumayı kaldırır.)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) TRIGGER FUNCTION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_reservation_manual_no_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- villa'sız satır (legacy nullable kolon) → kontrol edilecek kapsam yok.
  IF NEW.villa_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'reservations' THEN
    -- Yalnız bloklayıcı status'ler (FAZ 2B canonical allow-list).
    IF NEW.status IS NULL
       OR NEW.status NOT IN ('pending', 'confirmed') THEN
      RETURN NEW;
    END IF;

    -- UPDATE'te "dolu ayak izi" DEĞİŞMEDİYSE (zaten bloklayıcı + aynı
    -- villa + aynı tarihler; örn. pending → confirmed onayı, aynı
    -- değerlerle tam form kaydı) yeni bir çakışma oluşamaz → kontrol yok.
    -- Böylece migration öncesinden kalan olası çakışmalı satırların
    -- admin onay/düzenleme akışı KİLİTLENMEZ.
    IF TG_OP = 'UPDATE'
       AND OLD.status IN ('pending', 'confirmed')
       AND OLD.villa_id   IS NOT DISTINCT FROM NEW.villa_id
       AND OLD.start_date IS NOT DISTINCT FROM NEW.start_date
       AND OLD.end_date   IS NOT DISTINCT FROM NEW.end_date THEN
      RETURN NEW;
    END IF;

    -- Villa bazlı seri hale getirme (bkz. YARIŞ GÜVENLİĞİ).
    PERFORM pg_advisory_xact_lock(
      hashtextextended('villa_availability:' || NEW.villa_id::text, 0)
    );

    IF EXISTS (
      SELECT 1
        FROM public.manual_reservations m
       WHERE m.villa_id   = NEW.villa_id
         AND m.start_date < NEW.end_date
         AND m.end_date   > NEW.start_date
    ) THEN
      RAISE EXCEPTION
        'conflicting key value violates exclusion constraint "reservations_manual_no_overlap"'
        USING ERRCODE = '23P01';
    END IF;

  ELSIF TG_TABLE_NAME = 'manual_reservations' THEN
    -- UPDATE'te villa/tarih aynıysa (ör. aynı değerlerle kaydet) → kontrol yok.
    IF TG_OP = 'UPDATE'
       AND OLD.villa_id   IS NOT DISTINCT FROM NEW.villa_id
       AND OLD.start_date IS NOT DISTINCT FROM NEW.start_date
       AND OLD.end_date   IS NOT DISTINCT FROM NEW.end_date THEN
      RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended('villa_availability:' || NEW.villa_id::text, 0)
    );

    IF EXISTS (
      SELECT 1
        FROM public.reservations r
       WHERE r.villa_id   = NEW.villa_id
         AND r.status IN ('pending', 'confirmed')
         AND r.start_date < NEW.end_date
         AND r.end_date   > NEW.start_date
    ) THEN
      RAISE EXCEPTION
        'conflicting key value violates exclusion constraint "manual_reservations_reservation_no_overlap"'
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_reservation_manual_no_overlap() IS
  'BEFORE INSERT/UPDATE trigger (migration 097). reservations (pending/'
  'confirmed) <-> manual_reservations half-open [start,end) overlap reddi, '
  'SQLSTATE 23P01. Villa bazli pg_advisory_xact_lock ile READ COMMITTED '
  'altinda yaris-guvenli. Mevcut EXCLUDE constraint''lere ve 031 external '
  'trigger''ina dokunmaz.';

-- ----------------------------------------------------------------------------
-- 2) TRIGGERS
-- ----------------------------------------------------------------------------
-- UPDATE OF: yalnız availability'yi etkileyen kolonlar değişince çalışır
-- (note / ödeme / paid_amount vb. update'ler tetiklemez) — 031 ile aynı.

DROP TRIGGER IF EXISTS reservations_manual_no_overlap_trg
  ON public.reservations;
CREATE TRIGGER reservations_manual_no_overlap_trg
  BEFORE INSERT OR UPDATE OF villa_id, start_date, end_date, status
  ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_reservation_manual_no_overlap();

DROP TRIGGER IF EXISTS manual_reservations_reservation_no_overlap_trg
  ON public.manual_reservations;
CREATE TRIGGER manual_reservations_reservation_no_overlap_trg
  BEFORE INSERT OR UPDATE OF villa_id, start_date, end_date
  ON public.manual_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_reservation_manual_no_overlap();

-- ----------------------------------------------------------------------------
-- 3) MEVCUT ÇAKIŞMA BİLGİSİ (durdurmaz, yalnız NOTICE)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  existing_conflicts integer;
BEGIN
  SELECT count(*)
    INTO existing_conflicts
    FROM public.reservations r
    JOIN public.manual_reservations m
      ON m.villa_id = r.villa_id
     AND m.start_date < r.end_date
     AND m.end_date   > r.start_date
   WHERE r.status IN ('pending', 'confirmed');

  IF existing_conflicts > 0 THEN
    RAISE NOTICE
      '097: % adet MEVCUT reservation<->manual cakismasi var (trigger bunlari degistirmez; admin reconcile onerilir — header AUDIT sorgusu).',
      existing_conflicts;
  END IF;
END
$$;

COMMIT;

-- ----------------------------------------------------------------------------
-- 4) DOĞRULAMA (uygulamadan sonra)
-- ----------------------------------------------------------------------------
--   SELECT tgname, tgrelid::regclass, tgenabled
--     FROM pg_trigger
--    WHERE tgname IN ('reservations_manual_no_overlap_trg',
--                     'manual_reservations_reservation_no_overlap_trg');
--   → 2 satır, tgenabled = 'O'.
