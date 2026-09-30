"use server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import {
  getFaqTranslations,
  upsertFaqTranslation,
  type FaqTranslationInput,
  type FaqTranslationResult,
  type FaqTranslationsMapResult,
} from "@/app/services/faq-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";

/* ===============================================================
   🛡️ SSS ÇEVİRİ SERVER ACTION'LARI
   ===============================================================
   `app/(admin)/maki-admin/menu/menu-translations.action.ts` ve
   `types/type-translations.action.ts` ile BİREBİR AYNI desen.

   Okuma: sayfa zaten middleware ile korunuyor — ekstra auth gerekmez.
   Yazma: `authorizeAdminSession()` İLK kontrol — yetkisiz çağrıda
   servis/DB'ye HİÇ ulaşılmaz.

   ⚠️ İnce wrapper — iş mantığı YOK. Mevcut `faqs.action.ts`
   (canonical CRUD) DEĞİŞTİRİLMEDİ.
   =============================================================== */

export async function loadFaqTranslationsAction(
  faqIds: string[]
): Promise<FaqTranslationsMapResult> {
  await requirePermission("faqs");
  return getFaqTranslations(faqIds);
}

export async function saveFaqTranslationAction(
  input: FaqTranslationInput
): Promise<FaqTranslationResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "faqs"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  return upsertFaqTranslation(input);
}
