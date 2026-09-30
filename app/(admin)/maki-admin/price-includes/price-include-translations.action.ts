"use server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import {
  getPriceIncludeTranslations,
  upsertPriceIncludeTranslation,
  type PriceIncludeTranslationInput,
  type PriceIncludeTranslationsListResult,
  type PriceIncludeTranslationResult,
} from "@/app/services/price-include-item-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";

/* ===============================================================
   🛡️ PHASE 10D — Batch 3 — Admin Price-Include Translation UI Server Actions
   ===============================================================
   `feature-translations.action.ts` (Batch 2) / `villa-translations.action.ts`
   (Phase 10A) ile BİREBİR AYNI desen.

   Okuma: sayfa zaten middleware ile korunuyor — ekstra auth GEREKMİYOR.
   Yazma: `authorizeAdminSession()` İLK kontrol — yetkisiz çağrıda
   servis/DB'ye HİÇ ulaşılmaz.

   ⚠️ Bu dosya yalnız ince wrapper — iş mantığı YOK. Batch 1'de yazılan
   `app/services/price-include-item-translation.service.ts` DEĞİŞTİRİLMEDİ,
   yalnız delege edilir. Mevcut `price-includes.action.ts`'deki CRUD
   action'larına DOKUNULMADI.
   =============================================================== */

export async function loadPriceIncludeTranslationsAction(
  includeId: string
): Promise<PriceIncludeTranslationsListResult> {
  await requirePermission("price_includes");
  return getPriceIncludeTranslations(includeId);
}

export async function savePriceIncludeTranslationAction(
  input: PriceIncludeTranslationInput
): Promise<PriceIncludeTranslationResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "price_includes"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  return upsertPriceIncludeTranslation(input);
}
