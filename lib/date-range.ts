/* ===============================================================
   🔥 DATE RANGE HELPERS — TEK MERKEZİ HELPER
   ===============================================================
   Calendar/range bazlı yardımcı fonksiyonlar. Şu an sadece
   getValidEndDate; ileride aynı semantik (half-open range,
   "checkout = next checkin valid") çevresinde başka tek-source
   helper'lar buraya eklenebilir.

   ÇOK ÖNEMLİ — overlap semantiği:
     (start < existing_end) AND (end > existing_start)
   Yani A: 1-5 ile B: 5-10 ÇAKIŞMAZ (adjacent valid).
   Bu modüldeki helper'lar bu kuralı bozmaz; sadece günü-günü
   tarama yapan getValidEndDate gibi UI guard'larını paylaşır.
   =============================================================== */

/* ---------------------------------------------
   🔥 getValidEndDate(start, end, blockedDates) → Date
   - start'tan başlar, end'e kadar gün gün ilerler.
   - Bir blocked güne çarparsa: ÖNCEKİ günü döner (range'i
     blocked'dan önce keser).
   - Hiç blocked'a denk gelmezse: orijinal end'i döner.
   - Reservations create + edit page'lerinde birebir aynı
     implementasyon.
---------------------------------------------- */
export function getValidEndDate(
  start: Date,
  end: Date,
  blockedDates: Date[]
): Date {
  let current = new Date(start);
  while (current <= end) {
    const isBlocked = blockedDates.some(
      (d) => d.toDateString() === current.toDateString()
    );
    if (isBlocked) {
      const prev = new Date(current);
      prev.setDate(prev.getDate() - 1);
      return prev;
    }
    current.setDate(current.getDate() + 1);
  }
  return end;
}
