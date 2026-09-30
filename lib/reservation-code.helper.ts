/* ===============================================================
   🔥 RESERVATION CODE — TEK MERKEZİ HELPER
   ===============================================================
   DB tarafında trigger ile üretilen `reservations.reservation_no`
   kolonu artık standart rezervasyon kodu (örn. REZ-2026-0042).

   Bu helper:
   - normalize: trim + null/undefined koruması
   - display: UI fallback ("—")
   - format: çıktıyı olduğu gibi koruyup, boşsa empty string

   Eski rezervasyonlarda alan NULL olabilir → davranış sorun
   yaratmaz; çağıranlar conditional render ile satırı atlar
   veya display fallback'i gösterir.
   =============================================================== */

export function normalizeReservationNo(
  value: unknown
): string {
  return (value ?? "").toString().trim();
}

/* UI display — boşsa em-dash */
export function reservationCodeDisplay(
  value: unknown
): string {
  return normalizeReservationNo(value) || "—";
}

/* Mail / PDF gibi yerlerde "varsa render" karar yardımcısı */
export function hasReservationCode(value: unknown): boolean {
  return normalizeReservationNo(value).length > 0;
}
