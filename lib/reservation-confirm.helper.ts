/* ===============================================================
   🔥 RESERVATION CONFIRM GUARD — TEK MERKEZİ KURAL
   ===============================================================
   Rezervasyon yalnız ödeme alındıktan sonra "confirmed" durumuna
   geçebilir. Bu helper:

   - canConfirmReservation(paid_amount) → boolean
       paid_amount > 0 ise true; aksi halde false
   - RESERVATION_CONFIRM_GUARD_MESSAGE
       UI'da gösterilecek standart hata/açıklama metni

   Kullanım yerleri:
   - Detail page saveAll (transition guard)
   - Detail page status pill UI (disable + title)
   - Reservation list page updateStatus("confirmed") guard
   - Tooltip / alert metni

   Mevcut "Ödemeyi Onayla" akışını (`/api/mail/payment-confirmed`)
   etkilemez; o route zaten paid_amount > 0 kontrolünü yapıyor ve
   atomik update'te status='confirmed' + payment_link_status='paid'
   birlikte yazıyor → guard koşulunu doğal olarak sağlıyor.
   =============================================================== */

export const RESERVATION_CONFIRM_GUARD_MESSAGE =
  "Ödeme alınmadan rezervasyon onaylanamaz. Önce 'Alınan tutar' alanını doldurun, sonra 'Ödemeyi Onayla' butonunu kullanın.";

export function canConfirmReservation(
  paidAmount: unknown
): boolean {
  const n = Number(paidAmount);
  return Number.isFinite(n) && n > 0;
}
