"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  getFinanceKpiSnapshot as getFinanceKpiSnapshotService,
  type FinanceKpiSnapshot,
} from "@/app/services/finance.service";
import type { FinanceRangePreset } from "@/app/services/finance.constants";

/* ===============================================================
   🛡️ FINANCE — SERVER ACTION (thin wrapper)
   ===============================================================
   Admin `maki-finans/page.tsx` (client) → bu server action →
   `finance.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmza +
     dönüş tipi service ile BİREBİR (davranış değişmez); amaç yalnız
     client→server sınırını oluşturup native repo'yu client bundle'a
     sızdırmamak.
   =============================================================== */

export async function getFinanceKpiSnapshotAction(
  preset?: FinanceRangePreset
): Promise<FinanceKpiSnapshot> {
  await requirePermission("finance");
  return getFinanceKpiSnapshotService(preset);
}
