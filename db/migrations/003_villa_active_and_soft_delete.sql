-- ============================================================================
-- 🛡️ VILLA VISIBILITY + SOFT DELETE
-- ============================================================================
-- İki ortogonal kontrol ekler:
--
--   is_active   BOOLEAN  (default TRUE)
--     - true  → public+admin görünür
--     - false → public görünmez (pasif), admin görür ve düzenleyebilir
--
--   deleted_at TIMESTAMPTZ (default NULL)
--     - NULL      → kayıt aktif
--     - <stamp>   → soft-deleted: admin de göstermez, public de göstermez
--                   (rezervasyon geçmişi orphan bırakmamak için tablo
--                    kaydı muhafaza edilir)
--
-- KASITLI HARD-DELETE YOK:
--   reservations.villa_id, villa_images, villa_prices, villa_distances ve
--   4 villa_*_relations tablosu villa.id'ye bağlı. Hard delete'in CASCADE
--   varyantı geçmiş rezervasyon kaydını kaybeder; SET NULL varyantı orphan
--   bırakır. Soft delete reservation integrity'sini bozmaz.
--
-- INDEX:
--   idx_villa_visibility — public listing/detail query path'i için
--     (is_active=true, deleted_at IS NULL).
--   idx_villa_deleted_at — admin "silinmişler" görünümü için (gelecekte
--     gerekirse kullanılır; şu an sadece deleted_at IS NULL filtresi
--     yeterli, ama composite indekste ucundan yararlanılır).
--
-- ROLLBACK:
--   ALTER TABLE villa
--     DROP COLUMN IF EXISTS is_active,
--     DROP COLUMN IF EXISTS deleted_at;
--   DROP INDEX IF EXISTS idx_villa_visibility;
--   DROP INDEX IF EXISTS idx_villa_deleted_at;
-- ============================================================================

ALTER TABLE public.villa
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_villa_visibility
  ON public.villa (is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_villa_deleted_at
  ON public.villa (deleted_at);

COMMENT ON COLUMN public.villa.is_active IS
  'true: public+admin görünür. false: pasif — public görünmez, admin görür/düzenler. Reservation/slug/id korunur.';
COMMENT ON COLUMN public.villa.deleted_at IS
  'NULL: aktif kayıt. timestamp: soft-deleted — admin de göstermez. Rezervasyon FK''leri orphan bırakmamak için tablo kaydı muhafaza edilir.';