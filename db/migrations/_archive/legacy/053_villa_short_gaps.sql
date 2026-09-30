-- ============================================================================
-- Migration 053 — KISA SÜRELİ TARİHLER (VILLA_SHORT_GAPS) — PRECOMPUTE
-- ============================================================================
-- AMAÇ:
--   Sistemde oluşan GERÇEK İÇ BOŞLUKLARI (iki tarafı da dolu, açık uçlu
--   müsaitlik DEĞİL) precompute ederek "Kısa Süreli Tarihler" modülüne
--   hızlı, indexli okuma sağlamak. Anlık hesap YOK; cron + precompute.
--
-- TAMAMEN ADDITIVE — hiçbir mevcut tablo/RPC/constraint/cron değişmez.
--   Yeni tablo: villa_short_gaps
--   Yeni fonksiyon: refresh_villa_short_gaps()  (SECURITY DEFINER, full rebuild)
--   Okuma kaynakları (SADECE OKUR, DEĞİŞTİRMEZ):
--     • reservations             — status IN ('pending','confirmed')
--     • manual_reservations      — tüm satırlar
--     • external_calendar_events — is_active = true
--   → ÜÇ KAYNAK DA boşluk hesabına dahildir (mevcut availability semantiği).
--
-- BOŞLUK TANIMI (half-open [start, end) korunur):
--   1) Villa başına 3 kaynaktan blocking aralıklar (ufuk: bugün → +6 ay).
--   2) Örtüşen/bitişik aralıklar ADA (island) olarak birleştirilir
--      (gaps-and-islands; bitişik checkout=checkin → tek ada, boşluk yok).
--   3) Ardışık iki ada arasındaki boşluk = [önceki_ada_sonu, sonraki_ada_başı).
--      lead() ile YALNIZ iki tarafı da ada ile çevrili İÇ boşluklar üretilir;
--      ufuk başı/sonundaki AÇIK UÇLU müsaitlik DOĞAL OLARAK HARİÇ kalır.
--   4) Yalnız 2..6 gece arası boşluklar (kovalar: 2,3,4,5,6).
--   ⚠️ minimum_stay_nights BU HESAPTA KULLANILMAZ (saf tarih matematiği).
--
-- VERİ MODELİ: boşluk bazlı — her boşluk AYRI satır. Aynı villanın aynı ayda
--   birden çok boşluğu → birden çok satır (ör. 14-16 → 2 gece, 22-25 → 3 gece).
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.refresh_villa_short_gaps();
--   DROP TABLE IF EXISTS public.villa_short_gaps;
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) TABLO — precompute boşluk kayıtları (yalnız PII-SUZ: villa_id + tarih)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.villa_short_gaps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  villa_id     uuid NOT NULL REFERENCES public.villa(id) ON DELETE CASCADE,
  gap_start    date NOT NULL,                  -- boşluğun girişi (dahil)
  gap_end      date NOT NULL,                  -- boşluğun çıkışı (hariç) — half-open
  gap_nights   integer NOT NULL,               -- gap_end - gap_start (2..6)
  bucket_month date NOT NULL,                  -- date_trunc('month', gap_start)
  computed_at  timestamptz NOT NULL DEFAULT now(),

  -- half-open + kova kuralı: tek-gün/ters kayıt ve kova-dışı değer giremez
  CONSTRAINT villa_short_gaps_valid_range CHECK (gap_start < gap_end),
  CONSTRAINT villa_short_gaps_nights_bucket CHECK (gap_nights BETWEEN 2 AND 6),
  CONSTRAINT villa_short_gaps_nights_match CHECK (gap_nights = (gap_end - gap_start))
);

-- Listeleme sorguları: kova + ay filtresi (ana erişim deseni) + villa bazlı.
CREATE INDEX IF NOT EXISTS villa_short_gaps_bucket_idx
  ON public.villa_short_gaps (bucket_month, gap_nights);
CREATE INDEX IF NOT EXISTS villa_short_gaps_villa_idx
  ON public.villa_short_gaps (villa_id);

COMMENT ON TABLE public.villa_short_gaps IS
  'Precompute: iki tarafi da dolu gercek ic bosluklar (2-6 gece). '
  'refresh_villa_short_gaps() ile gece cron + iCal sync sonrasi yenilenir. '
  'minimum_stay_nights KULLANILMAZ. Salt-okuma modul kaynagi (PII-suz).';


-- ----------------------------------------------------------------------------
-- 3) REFRESH FONKSİYONU — full rebuild (idempotent). SECURITY DEFINER:
--    underlying availability tablolarını tablo sahibi yetkisiyle okur;
--    tabloya yazar.
--    Cron route sunucu tarafı yönetim bağlantısıyla EXECUTE eder.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_villa_short_gaps()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := current_date;
  v_horizon date := (current_date + interval '6 months')::date;
  v_count integer;
BEGIN
  -- Tam yeniden hesap: önce temizle, sonra doldur (tek transaction).
  DELETE FROM public.villa_short_gaps;

  WITH blocks AS (
    SELECT r.villa_id, r.start_date, r.end_date
      FROM public.reservations r
     WHERE r.status IN ('pending','confirmed')
       AND r.end_date   > v_today
       AND r.start_date < v_horizon
    UNION ALL
    SELECT m.villa_id, m.start_date, m.end_date
      FROM public.manual_reservations m
     WHERE m.end_date   > v_today
       AND m.start_date < v_horizon
    UNION ALL
    SELECT e.villa_id, e.start_date, e.end_date
      FROM public.external_calendar_events e
     WHERE e.is_active = true
       AND e.end_date   > v_today
       AND e.start_date < v_horizon
  ),
  -- Ada başlangıcı işaretle: önceki tüm satırların max(end) >= start ise
  -- aynı ada (örtüşme/bitişiklik), değilse yeni ada.
  flagged AS (
    SELECT villa_id, start_date, end_date,
      CASE WHEN max(end_date) OVER (
             PARTITION BY villa_id
             ORDER BY start_date, end_date
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ) >= start_date
        THEN 0 ELSE 1 END AS is_new_island
    FROM blocks
  ),
  islanded AS (
    SELECT villa_id, start_date, end_date,
      sum(is_new_island) OVER (
        PARTITION BY villa_id
        ORDER BY start_date, end_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS island_id
    FROM flagged
  ),
  islands AS (
    SELECT villa_id, island_id,
           min(start_date) AS island_start,
           max(end_date)   AS island_end
      FROM islanded
     GROUP BY villa_id, island_id
  ),
  gaps AS (
    SELECT villa_id,
           island_end AS gap_start,
           lead(island_start) OVER (
             PARTITION BY villa_id ORDER BY island_start
           ) AS gap_end
      FROM islands
  )
  INSERT INTO public.villa_short_gaps
    (villa_id, gap_start, gap_end, gap_nights, bucket_month)
  SELECT g.villa_id, g.gap_start, g.gap_end,
         (g.gap_end - g.gap_start) AS gap_nights,
         date_trunc('month', g.gap_start)::date AS bucket_month
    FROM gaps g
    JOIN public.villa v ON v.id = g.villa_id
   WHERE g.gap_end IS NOT NULL                       -- iki tarafı da ada → iç boşluk
     AND (g.gap_end - g.gap_start) BETWEEN 2 AND 6   -- kova 2..6
     AND g.gap_start >= v_today                      -- geçmiş boşluk yok
     AND g.gap_end   <= v_horizon                    -- ufuk içi
     AND v.is_active = true                          -- yalnız yayında villalar
     AND v.deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_villa_short_gaps() FROM public;

COMMIT;

-- ----------------------------------------------------------------------------
-- 5) BACKFILL — ilk dolum (deploy anında bir kez). Cron ileride tazeler.
-- ----------------------------------------------------------------------------
SELECT public.refresh_villa_short_gaps();

-- ============================================================================
-- Doğrulama (manuel, opsiyonel):
--   SELECT bucket_month, gap_nights, count(*)
--     FROM villa_short_gaps GROUP BY 1,2 ORDER BY 1,2;
--   -- belirli villa boşlukları:
--   SELECT villa_id, gap_start, gap_end, gap_nights
--     FROM villa_short_gaps WHERE villa_id = '<uuid>' ORDER BY gap_start;
-- ============================================================================
