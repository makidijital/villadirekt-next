"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  getVillaFeatures as getVillaFeaturesService,
  addVillaFeature as addVillaFeatureService,
  updateVillaFeature as updateVillaFeatureService,
  deleteVillaFeature as deleteVillaFeatureService,
  type Feature,
} from "@/app/services/villa-feature.service";

/* ===============================================================
   🛡️ VILLA FEATURES — SERVER ACTIONS (thin wrapper)
   ===============================================================
   Admin `features/page.tsx` (client) → bu server action'lar →
   `villa-feature.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service ile BİREBİR (davranış değişmez); amaç yalnız
     client→server sınırını oluşturup native repo'yu client bundle'a
     sızdırmamak.
   =============================================================== */

export async function getVillaFeaturesAction(): Promise<Feature[]> {
  await requirePermission("features");
  return getVillaFeaturesService();
}

export async function addVillaFeatureAction(name: string): Promise<boolean> {
  await requirePermission("features");
  return addVillaFeatureService(name);
}

export async function updateVillaFeatureAction(
  id: string,
  name: string
): Promise<boolean> {
  await requirePermission("features");
  return updateVillaFeatureService(id, name);
}

export async function deleteVillaFeatureAction(id: string): Promise<boolean> {
  await requirePermission("features");
  return deleteVillaFeatureService(id);
}
