"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import { fetchExternalCalendarArraysForVillaAdmin } from "@/lib/external-calendar.admin.helper";
import type { ExternalCalendarAdminArrays } from "@/lib/external-calendar.admin.types";

/* ===============================================================
   🛡️ EXTERNAL CALENDAR ADMIN — SERVER ACTION (thin wrapper)
   ===============================================================
   Reservation-form client component'leri (ManualReservationForm,
   reservations ekle/[id]) → bu server action → `admin.helper` (server) →
   native repo. Eskiden client-side anon DB client read'iydi; native repo
   server-only olduğu için server boundary arkasına alındı. Dönüş
   (`ExternalCalendarAdminArrays`: Date[] + detailByDate) BİREBİR.
   =============================================================== */

export async function fetchExternalCalendarArraysForVillaAdminAction(
  villaId: string
): Promise<ExternalCalendarAdminArrays> {
  await requirePermission(["reservations", "manual_reservations"]);
  return fetchExternalCalendarArraysForVillaAdmin(villaId);
}
