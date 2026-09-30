"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import { fetchBlockedDates } from "./fetchBlockedDates";
import type {
  FetchBlockedDatesInput,
  BlockedDateGroups,
} from "../_types/handler-inputs";

/* ===============================================================
   🛡️ FETCH BLOCKED DATES — SERVER ACTION (thin wrapper, FAZ 4 S2)
   ===============================================================
   Client component'ler (ManualReservationForm, reservations/[id]/page) →
   bu server action → `fetchBlockedDates` (server-only) → native repo.
   Eskiden client-side anon DB client read'iydi; native repo server-only
   olduğu için server boundary arkasına alındı.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — grup üretimi (confirmed/pending/manual
     checkin/checkout/middle + unique dedup) fetchBlockedDates'te AYNEN.
     Dönüş `BlockedDateGroups` (9 × Date[]) — server action boundary'sinde
     Date serileştirmesi Next.js tarafından korunur; şekil BİREBİR.
     Server tüketiciler (manualReservation.service, handler-inputs)
     fetchBlockedDates'i DOĞRUDAN kullanmaya devam eder.
   =============================================================== */

export async function fetchBlockedDatesAction(
  input: FetchBlockedDatesInput
): Promise<BlockedDateGroups> {
  await requirePermission("reservations");
  return fetchBlockedDates(input);
}
