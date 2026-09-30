-- ===============================================================
-- 094 — reservations.phone2 (IKINCI ILETISIM TELEFONU)
-- ===============================================================
-- NEDEN GEREKLI:
--   `reservations` tablosunda ikinci bir telefon numarasini
--   saklayabilecek uygun/bos bir kolon YOK. Mevcut alanlar:
--     phone          -> birinci telefon (NOT NULL, dolu)
--     guest_names    -> text[] ama MISAFIR ADLARI icin
--     note/address   -> serbest metin; yapisal veri icin uygun degil
--   Bu yuzden ayri bir kolon zorunlu.
--
-- NEDEN NULLABLE:
--   Mevcut rezervasyonlarda ikinci telefon YOK. NOT NULL yapmak
--   geriye donuk tum satirlari bozardi (default doldurmak da sahte
--   veri uretirdi). Zorunluluk UYGULAMA katmaninda, yalniz YENI
--   public rezervasyonlar icin uygulanir:
--     app/components/reservation/_helpers/validatePublicReservationForm.ts
--     app/services/reservation/create.service.ts   (backend guard)
--   Admin tarafinda opsiyoneldir -> eski kayitlar duzenlenebilir kalir.
--
-- IDEMPOTENT: IF NOT EXISTS — tekrar calistirmak guvenlidir.
-- GERI ALINABILIR: ALTER TABLE reservations DROP COLUMN phone2;
-- ===============================================================

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS phone2 text;

COMMENT ON COLUMN public.reservations.phone2 IS
  'Ikinci iletisim telefonu (E.164, or. +491511234567). Yeni public rezervasyonlarda uygulama katmaninda zorunlu; eski kayitlarda NULL.';
