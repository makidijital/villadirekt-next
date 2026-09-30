"use server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import {
  getRuleTranslations,
  upsertRuleTranslation,
  type RuleTranslationInput,
  type RuleTranslationsListResult,
  type RuleTranslationResult,
} from "@/app/services/rule-item-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";

/* ===============================================================
   🛡️ PHASE 10D — Batch 3 — Admin Rule Translation UI Server Actions
   ===============================================================
   `feature-translations.action.ts` (Batch 2) / `villa-translations.action.ts`
   (Phase 10A) ile BİREBİR AYNI desen.

   Okuma: sayfa zaten middleware ile korunuyor — ekstra auth GEREKMİYOR.
   Yazma: `authorizeAdminSession()` İLK kontrol — yetkisiz çağrıda
   servis/DB'ye HİÇ ulaşılmaz.

   ⚠️ Bu dosya yalnız ince wrapper — iş mantığı YOK. Batch 1'de yazılan
   `app/services/rule-item-translation.service.ts` DEĞİŞTİRİLMEDİ, yalnız
   delege edilir. Mevcut `rules.action.ts`'deki Rule CRUD action'larına
   DOKUNULMADI.
   =============================================================== */

export async function loadRuleTranslationsAction(
  ruleId: string
): Promise<RuleTranslationsListResult> {
  await requirePermission("rules");
  return getRuleTranslations(ruleId);
}

export async function saveRuleTranslationAction(
  input: RuleTranslationInput
): Promise<RuleTranslationResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "rules"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  return upsertRuleTranslation(input);
}
