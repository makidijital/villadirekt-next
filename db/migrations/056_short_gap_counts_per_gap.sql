-- ============================================================================
-- Migration 056 — FIX: get_short_gap_counts() DISTINCT villa → gap sayımı
-- ============================================================================
-- SORUN:
--   Liste sayfası (1 gap = 1 kart) gap-başına kart gösteriyor; ancak ana
--   sayfa sayaçları `get_short_gap_counts()` (054) `count(DISTINCT villa_id)`
--   kullandığı için DISTINCT VİLLA sayıyordu.
--   → Aynı villanın aynı ay/gece kovasında birden çok boşluğu varsa:
--      ana sayfa "(1)" ↔ liste 2+ kart  → tutarsız.
--
-- ÇÖZÜM:
--   054'teki fonksiyonu CREATE OR REPLACE ile aynen yeniden tanımla; YALNIZ
--   aggregate değişir:
--     count(DISTINCT g.villa_id)  →  count(*)
--   Böylece sayaç = GAP sayısı = liste kart sayısı (1 gap = 1 fırsat).
--
--   ⚠️ Kolon adı (`villa_count`) ve fonksiyon imzası BİLİNÇLİ olarak AYNI
--   bırakıldı → tüketici (ShortGapsSection) DEĞİŞMEZ; yalnız dönen sayı
--   semantiği distinct-villa yerine gap olur. CREATE OR REPLACE mevcut
--   GRANT'leri korur (anon/authenticated/service_role).
--
-- TAMAMEN ADDITIVE — short-gaps hesap fonksiyonuna (refresh_villa_short_gaps),
--   cron'lara, listeleme sayfasına, tabloya, RLS'e DOKUNMAZ. Yalnız sayaç
--   RPC'sinin aggregate'i düzelir.
--
-- ROLLBACK:
--   054'teki sürüme dön (count(DISTINCT g.villa_id) ile CREATE OR REPLACE).
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
    count(*) AS villa_count   -- 056 FIX: gap sayısı (1 gap = 1 fırsat),
                              -- liste kart sayısıyla birebir tutarlı.
  FROM public.villa_short_gaps g
  GROUP BY g.bucket_month, g.gap_nights
  ORDER BY g.bucket_month, g.gap_nights;
$$;

COMMIT;

-- ============================================================================
-- Doğrulama (manuel):
--   SELECT * FROM public.get_short_gap_counts();
--   -- villa_count artık o (ay, gece) kovasındaki TOPLAM boşluk sayısı;
--   -- liste sayfasındaki kart sayısıyla eşleşmeli.
-- ============================================================================
