"use server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import {
  getMenuTranslations,
  upsertMenuTranslation,
  type MenuTranslationInput,
  type MenuTranslationsListResult,
  type MenuTranslationResult,
} from "@/app/services/menu-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";

/* ===============================================================
   🛡️ MENÜ ÇEVİRİ SERVER ACTION'LARI (migration 086)
   ===============================================================
   `app/(admin)/maki-admin/types/type-translations.action.ts` ile
   BİREBİR AYNI desen.

   Okuma: sayfa zaten middleware ile korunuyor — ekstra auth gerekmez.
   Yazma: `authorizeAdminSession()` İLK kontrol — yetkisiz çağrıda
   servis/DB'ye HİÇ ulaşılmaz.

   ⚠️ Bu dosya yalnız ince wrapper — iş mantığı YOK
   (`app/services/menu-translation.service.ts`'e delege eder).
   Mevcut menü CRUD'u (`/api/admin/menu` route handler) DEĞİŞMEDİ.
   =============================================================== */

export async function loadMenuTranslationsAction(
  menuId: string
): Promise<MenuTranslationsListResult> {
  await requirePermission("menu");
  return getMenuTranslations(menuId);
}

export async function saveMenuTranslationAction(
  input: MenuTranslationInput
): Promise<MenuTranslationResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "menu"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  return upsertMenuTranslation(input);
}
