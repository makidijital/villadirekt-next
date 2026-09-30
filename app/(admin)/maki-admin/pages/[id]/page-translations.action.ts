"use server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import {
  getPageTranslations,
  upsertPageTranslation,
  type PageTranslationInput,
  type PageTranslationsListResult,
  type PageTranslationResult,
} from "@/app/services/page-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";

/* ===============================================================
   🛡️ PHASE 12C — Admin Sayfa Çeviri UI Server Actions
   ===============================================================
   `villa-translations.action.ts` (Phase 10A) / `type-translations.
   action.ts` (Phase 10D Batch 3) ile BİREBİR AYNI desen.

   Okuma: sayfa zaten middleware ile korunuyor — ekstra auth GEREKMİYOR.
   Yazma: `authorizeAdminSession()` İLK kontrol — yetkisiz çağrıda
   servis/DB'ye HİÇ ulaşılmaz.

   ⚠️ Bu dosya yalnız ince wrapper — iş mantığı YOK. Mevcut Pages
   CRUD API route'larına (`/api/admin/pages`) DOKUNULMADI.
   =============================================================== */

export async function loadPageTranslationsAction(
  pageId: string
): Promise<PageTranslationsListResult> {
  await requirePermission("pages");
  return getPageTranslations(pageId);
}

export async function savePageTranslationAction(
  input: PageTranslationInput
): Promise<PageTranslationResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "pages"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  return upsertPageTranslation(input);
}
