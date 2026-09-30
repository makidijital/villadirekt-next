"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  listExternalCalendarSources as listExternalCalendarSourcesService,
  createExternalCalendarSource as createExternalCalendarSourceService,
  setExternalCalendarSourceActive as setExternalCalendarSourceActiveService,
  type ExternalCalendarSourceListResult,
  type ExternalCalendarSourceResult,
  type CreateExternalCalendarSourceInput,
} from "@/app/services/external-calendar-source.service";

/* ===============================================================
   🛡️ ICAL SYNC — SERVER ACTIONS (thin wrapper, FAZ 4 S1)
   ===============================================================
   Admin `IcalSyncCard` (client) → bu server action'lar →
   `external-calendar-source.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service ile BİREBİR (validation/sanitize/timestamp
     service'te kalır). Sync yazma yolu (route/service-role) DEĞİŞMEZ.
   =============================================================== */

export async function listExternalCalendarSourcesAction(
  villaId: string
): Promise<ExternalCalendarSourceListResult> {
  await requirePermission("external_calendars");
  return listExternalCalendarSourcesService(villaId);
}

export async function createExternalCalendarSourceAction(
  input: CreateExternalCalendarSourceInput
): Promise<ExternalCalendarSourceResult> {
  await requirePermission("external_calendars");
  return createExternalCalendarSourceService(input);
}

export async function setExternalCalendarSourceActiveAction(
  id: string,
  active: boolean
): Promise<ExternalCalendarSourceResult> {
  await requirePermission("external_calendars");
  return setExternalCalendarSourceActiveService(id, active);
}
