/* ===============================================================
   🛡️ FAZ 4 — RESERVATION SERVICE — BARREL / FACADE
   ===============================================================
   Bu dosya FAZ 4 sonrası bir BARREL'a dönüştü. İçerik domain bazında
   parçalandı (`./reservation/` altında) ve buradan re-export edilir.

   ZERO CALLER MIGRATION:
     Eski caller'lar (`@/app/services/reservation.service`) aynı
     import path'inden bilinmeyen değişiklikle çalışmaya devam eder.
     Hiçbir caller dosya dokunmamak refactor'un kritik şartı.

   CALLER ENVANTERİ (sıfır değişiklik):
     - components/reservation/ReservationForm.tsx → createReservation
     - (admin)/maki-admin/reservations/[id]/page.tsx →
         getReservationById, updateReservationFull, deleteReservationById
     - (admin)/maki-admin/reservations/page.tsx → updateReservationStatus

   DOMAIN PARTITIONING:
     ./reservation/types.ts                  → 8 type
     ./reservation/_helpers/commission.ts    → safeCommissionRate +
                                               calcCommissionAmount +
                                               fetchCommissionRate +
                                               DEFAULT_COMMISSION_RATE
     ./reservation/_helpers/conflict.ts      → checkReservationConflict +
                                               checkManualBlockConflict
     ./reservation/_helpers/status.ts        → assertCanConfirm
     ./reservation/_helpers/errors.ts        → mapInsertError
     ./reservation/_helpers/select-shapes.ts → SELECT_RESERVATION_DETAIL +
                                               SELECT_RESERVATION_LIST
     ./reservation/_helpers/payload-create.ts → buildCreateReservationPayload
     ./reservation/_helpers/payload-update.ts → buildUpdateReservationPayload
     ./reservation/create.service.ts         → createReservation
     ./reservation/update.service.ts         → updateReservationFull
     ./reservation/read.service.ts           → getReservationById +
                                               getReservations
     ./reservation/status.service.ts         → updateReservationStatus
     ./reservation/note.service.ts           → updateReservationNote
     ./reservation/delete.service.ts         → deleteReservationById

   ⚠️ Runtime davranış BYTE-IDENTICAL. Bu dosya yalnız re-export
      yapar; iç gövde mantığı barındırmaz.
=============================================================== */

/* ---------------- CREATE ---------------- */
export { createReservation } from "./reservation/create.service";

/* ---------------- READ ---------------- */
export {
  getReservationById,
  getReservations,
} from "./reservation/read.service";

/* ---------------- UPDATE ---------------- */
export { updateReservationFull } from "./reservation/update.service";

/* ---------------- STATUS ---------------- */
export { updateReservationStatus } from "./reservation/status.service";

/* ---------------- NOTE ---------------- */
export { updateReservationNote } from "./reservation/note.service";

/* ---------------- DELETE ---------------- */
export { deleteReservationById } from "./reservation/delete.service";
