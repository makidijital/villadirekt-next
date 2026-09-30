import { reservationRepository } from "@/lib/db/reservation.repository";

import type { ReservationConflictWindow } from "../types";

/* ===============================================================
   🛡️ FAZ 2 — RESERVATION CONFLICT HELPERS (FAZ 33 delege)
   ===============================================================
   Eski `createReservation` içinde inline iki conflict check
   bloğunun BYTE-IDENTICAL kopyası:
     1) reservations: status allow-list (pending+confirmed) + half-open overlap
     2) manual_reservations: half-open overlap (status filtresi yok)

   FAZ 33 (CONFLICT extraction):
     DB I/O artık doğrudan eski sağlayıcı client'ı değil
     `reservationRepository.findOverlappingReservations` ve
     `reservationRepository.findOverlappingManualBlocks` üzerinden
     delege edilir. Davranış BYTE-IDENTICAL:
       - Aynı tablolar (`reservations`, `manual_reservations`)
       - Aynı predicate chain (eq villa_id + in status + lt + gt)
       - Aynı half-open overlap geometry
       - Status allow-list HELPER tarafında (`AVAILABILITY_BLOCKING_STATUSES`)
         — repository allow-list'i parametre olarak alır, business
         meaning'i bilmez.
     Throw mesajları + log tag'leri bu dosyada kalır
     (repository sessizdir).

   ⚠️ AVAILABILITY SEMANTIC (Faz 2B — yorum aynen):
     Yalnızca `pending` ve `confirmed` rezervasyonlar availability'yi
     block eder. `rejected` ve `cancelled` müsait sayılır.

   🔗 LOCKSTEP CONTRACT (yorum aynen):
     `lib/availability.helper.ts > getBlockedVillaIds` AYNI
     lockstep'te aynı status allow-list'ini ve aynı half-open
     overlap clause'larını kullanır. İki taraf divergence'a
     düşerse arama sonuçları sapar.

   ⚠️ KESIN KURAL:
     - Status allow-list ["pending", "confirmed"] aynen.
     - Half-open overlap (`.lt(start)` + `.gt(end)`) aynen
       (repository içinde uygulanıyor; helper yalnız parametre
       geçer).
     - Console.error tag (`❌ Conflict error:`, `❌ Manual conflict error:`)
       aynen.
     - throw new Error("Rezervasyon kontrol hatası") + ("Bu tarihler dolu")
       aynen.
=============================================================== */

/** TUR2 — `pending` ve `confirmed` rezervasyonlar villa availability'yi
 *  block eder. Diğer statüler müsait. Bu allow-list `availability.helper.ts`
 *  ile lockstep contract altında. */
export const AVAILABILITY_BLOCKING_STATUSES = [
  "pending",
  "confirmed",
] as const;

/* ---------------------------------------------------------------
   🔥 checkReservationConflict — UX FAST-PATH
   ---------------------------------------------------------------
   Bu SELECT, kullanıcıya INSERT round-trip'inden önce hızlı
   feedback vermek için var; race-prone (TOCTOU). Asıl atomik
   garanti DB seviyesindeki EXCLUDE constraint
   'reservations_no_overlap' tarafından sağlanır.
   Helper conflict bulursa throw eder; orchestrator'da try/catch YOK.
=============================================================== */
export async function checkReservationConflict(
  window: ReservationConflictWindow
): Promise<void> {
  /* 🛡️ PII-SAFE: anon overlap SELECT yerine SECURITY DEFINER RPC
     (check_villa_availability_conflict, migration 039) — reservations
     (pending/confirmed) + manual_reservations overlap'ını DB içinde
     (RLS-bypass) hesaplar, yalnız boolean döner. 040 admin-only RLS
     sonrası da çalışır. Asıl atomik garanti DB EXCLUDE constraint. */
  const { data: hasConflict, error: conflictError } =
    await reservationRepository.checkAvailabilityConflict(window);

  if (conflictError) {
    console.error("❌ Conflict error:", conflictError.message);
    throw new Error("Rezervasyon kontrol hatası");
  }

  if (hasConflict === true) {
    throw new Error("Bu tarihler dolu");
  }
}

/* ---------------------------------------------------------------
   🔥 checkManualBlockConflict — cross-table fast-path
   ---------------------------------------------------------------
   manual_reservations tablosu ayrı; üzerinde de EXCLUDE constraint
   var ama cross-table race INSERT seviyesinde değil application
   seviyesinde tutuluyor (manual blok oluşturma frekansı çok düşük).
   Helper conflict bulursa throw eder.
=============================================================== */
export async function checkManualBlockConflict(
  _window: ReservationConflictWindow
): Promise<void> {
  /* 🛡️ NO-OP: manual_reservations overlap kontrolü artık combined RPC
     (checkReservationConflict → check_villa_availability_conflict) içinde
     yapılıyor. Orchestrator çağrı sırası (BYTE-IDENTICAL) korunsun diye
     fonksiyon imzası kalır; davranış aynı — tek "Bu tarihler dolu". */
  return;
}
