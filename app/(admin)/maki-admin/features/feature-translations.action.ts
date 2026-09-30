"use server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import {
  getFeatureTranslations,
  upsertFeatureTranslation,
  type FeatureTranslationInput,
  type FeatureTranslationsListResult,
  type FeatureTranslationResult,
} from "@/app/services/villa-feature-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";

/* ===============================================================
   🛡️ PHASE 10D — Batch 2 — Admin Feature Translation UI Server Actions
   ===============================================================
   `villa-translations.action.ts` (Phase 10A) ile BİREBİR AYNI desen:

   Okuma: sayfa zaten middleware ile korunuyor (bkz. features.action.ts'in
   mevcut okuma action'ları — ekstra auth YOK) — ekstra auth GEREKMİYOR.

   Yazma: `authorizeAdminSession()` İLK kontrol — yetkisiz çağrıda
   servis/DB'ye HİÇ ulaşılmaz.

   ⚠️ Bu dosya yalnız ince wrapper — iş mantığı YOK. Batch 1'de yazılan
   `app/services/villa-feature-translation.service.ts` DEĞİŞTİRİLMEDİ,
   yalnız delege edilir. Mevcut `features.action.ts`'deki Feature
   CRUD action'larına (getVillaFeaturesAction/addVillaFeatureAction/
   updateVillaFeatureAction/deleteVillaFeatureAction) DOKUNULMADI.
   =============================================================== */

export async function loadFeatureTranslationsAction(
  featureId: string
): Promise<FeatureTranslationsListResult> {
  await requirePermission("features");
  return getFeatureTranslations(featureId);
}

export async function saveFeatureTranslationAction(
  input: FeatureTranslationInput
): Promise<FeatureTranslationResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "features"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  return upsertFeatureTranslation(input);
}
