import { reservationRepository } from "@/lib/db/reservation.repository";

import {
  canConfirmReservation,
  RESERVATION_CONFIRM_GUARD_MESSAGE,
} from "@/lib/reservation-confirm.helper";

/* 🛡️ READ repository INJECTION (mig 040 hardening):
   Caller services (update.service / status.service) deps.repository
   geçerse fallback paid_amount fetch service-role ile yapılır.
   Default anon repo korunur (test + diğer caller'lar değişmez). */
type ReservationPaidAmountRepository = Pick<
  typeof reservationRepository,
  "findPaidAmount"
>;

/* ===============================================================
   🛡️ FAZ 2 — RESERVATION STATUS HELPER (assertCanConfirm)
   ===============================================================
   Eski `reservation.service.ts` içinde internal tanımlı
   `assertCanConfirm` fonksiyonunun BYTE-IDENTICAL kopyası.

   FAZ 33 (READ extraction):
     Fallback paid_amount DB fetch artık doğrudan eski sağlayıcı
     client'ı tüketmez; `reservationRepository.findPaidAmount`
     üzerinden delege edilir. Davranış BYTE-IDENTICAL:
       - Aynı tablo (`reservations`)
       - Aynı select (`paid_amount`)
       - Aynı predicate (`.eq("id", id)`)
       - Aynı resolver (`.maybeSingle()`)
     Console tag (`[reservation.confirm-guard] FETCH_FAILED`) +
     throw mesajları (`"Doğrulama hatası"`,
     `RESERVATION_CONFIRM_GUARD_MESSAGE`) bu dosyada kalır
     (repository sessizdir).

   Reservation'a `status: "confirmed"` set eden tüm service
   yollarında çağrılır. Frontend'de zaten aynı `canConfirmReservation`
   helper'ı UX guard'ı yapıyor; bu fonksiyon **server-side
   source-of-truth** olarak duplicate kod üretmeden aynı kuralı
   enforce eder:
     - Çağrı payload'ında paid_amount tanımlıysa → onu kullan.
     - Tanımlı değilse → DB'den fetch et (mevcut kayıtın gerçek
       paid_amount'u).
     - canConfirmReservation(paidAmount) === false ise throw.
   throw mesajı RESERVATION_CONFIRM_GUARD_MESSAGE; çağıran taraflar
   mevcut catch/error handler'larıyla aynı pattern'i sürdürür.

   ⚠️ KESIN KURAL:
     - Console.error tag (`[reservation.confirm-guard] FETCH_FAILED`)
       aynen.
     - throw new Error("Doğrulama hatası") aynen.
     - throw new Error(RESERVATION_CONFIRM_GUARD_MESSAGE) aynen.
=============================================================== */

export async function assertCanConfirm(
  id: string,
  payloadPaid: unknown,
  deps?: { repository?: ReservationPaidAmountRepository }
): Promise<void> {
  let effectivePaid: unknown = payloadPaid;
  if (effectivePaid === undefined) {
    const repository = deps?.repository ?? reservationRepository;
    const { data: existing, error: fetchErr } =
      await repository.findPaidAmount(id);
    if (fetchErr) {
      console.error(
        "[reservation.confirm-guard] FETCH_FAILED",
        fetchErr.message
      );
      throw new Error("Doğrulama hatası");
    }
    effectivePaid = existing?.paid_amount;
  }
  if (!canConfirmReservation(effectivePaid)) {
    throw new Error(RESERVATION_CONFIRM_GUARD_MESSAGE);
  }
}
