-- ============================================================================
-- Migration 054 — KISA SÜRELİ TARİHLER: ANA SAYFA SAYAÇ RPC
-- ============================================================================
-- AMAÇ:
--   Ana sayfadaki "Kısa Süreli Tarihler" section'ını beslemek. Her
--   (ay, gece) kovası için DISTINCT villa sayısı döndürür.
--
--   ⚠️ SAYI = boşluk sayısı DEĞİL → DISTINCT VİLLA sayısı.
--      Aynı villanın aynı ay/gece kovasında birden çok boşluğu olsa bile
--      1 sayılır: count(DISTINCT villa_id).
--
-- TAMAMEN ADDITIVE — mevcut RPC'lere DOKUNMAZ. Yalnız villa_short_gaps
--   (053) tablosunu OKUR. Yazma yok. minimum_stay_nights KULLANILMAZ.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.get_short_gap_counts();
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_short_gap_counts()
RETURNS TABLE (
  bucket_month date,
  gap_nights   integer,
  villa_count  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    g.bucket_month,
    g.gap_nights,
    count(DISTINCT g.villa_id) AS villa_count
  FROM public.villa_short_gaps g
  GROUP BY g.bucket_month, g.gap_nights
  ORDER BY g.bucket_month, g.gap_nights;
$$;

REVOKE ALL ON FUNCTION public.get_short_gap_counts() FROM public;

COMMIT;

-- ============================================================================
-- Doğrulama (manuel):
--   SELECT * FROM public.get_short_gap_counts();
--   -- bucket_month | gap_nights | villa_count
--   -- 2026-06-01   |     2      |     49
--   -- 2026-06-01   |     3      |    135   ...
-- ============================================================================
