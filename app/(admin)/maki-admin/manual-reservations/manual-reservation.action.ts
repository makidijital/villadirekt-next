"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  createManualReservation as createManualReservationService,
  updateManualReservation as updateManualReservationService,
  deleteManualReservation as deleteManualReservationService,
  getVillaAvailabilitySnapshot as getVillaAvailabilitySnapshotService,
} from "@/app/services/manualReservation.service";

/* ===============================================================
   🛡️ MANUAL RESERVATION — SERVER ACTIONS (thin wrapper, FAZ 4 S2)
   ===============================================================
   Admin client'lar (ManualReservationForm, ManualReservationList) →
   bu server action'lar → `manualReservation.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service'ten türetilir (Parameters/ReturnType → cast/any
     YOK, birebir). Validation, 23P01 overlap parse, activity log, TR hata
     mesajları, response şekli hepsi service'te AYNEN.
   =============================================================== */

export async function createManualReservationAction(
  ...args: Parameters<typeof createManualReservationService>
): ReturnType<typeof createManualReservationService> {
  await requirePermission("manual_reservations");
  return createManualReservationService(...args);
}

export async function updateManualReservationAction(
  ...args: Parameters<typeof updateManualReservationService>
): ReturnType<typeof updateManualReservationService> {
  await requirePermission("manual_reservations");
  return updateManualReservationService(...args);
}

export async function deleteManualReservationAction(
  ...args: Parameters<typeof deleteManualReservationService>
): ReturnType<typeof deleteManualReservationService> {
  await requirePermission("manual_reservations");
  return deleteManualReservationService(...args);
}

export async function getVillaAvailabilitySnapshotAction(
  ...args: Parameters<typeof getVillaAvailabilitySnapshotService>
): ReturnType<typeof getVillaAvailabilitySnapshotService> {
  await requirePermission("manual_reservations");
  return getVillaAvailabilitySnapshotService(...args);
}
