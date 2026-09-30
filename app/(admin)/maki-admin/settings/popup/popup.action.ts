"use server";

import { revalidateTag } from "next/cache";

import { callerHasPermission, requirePermission } from "@/lib/auth/action-authz";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import {
  getSitePopupForAdmin,
  saveSitePopup,
  type SitePopupAdminValues,
  type SitePopupSaveResult,
} from "@/app/services/site-popup.service";
import { SITE_POPUP_CACHE_TAG } from "@/lib/site-popup.cache";

/* ===============================================================
   🛡️ ADMIN > AYARLAR > AÇILIŞ POPUP — server actions
   ===============================================================
   settings-translations.action.ts ile AYNI desen:
     • Okuma: requirePermission("settings") — yetkisizse THROW.
     • Yazma: authorizeAdminSession + callerHasPermission("settings")
       İLK kontrol; yetkisiz çağrı servise/DB'ye HİÇ ulaşmaz.
   Başarılı yazmadan sonra YALNIZ "site-popup" tag'i invalidate edilir
   (settings/menu/villa cache'leri etkilenmez).
   =============================================================== */

export async function loadSitePopupAction(): Promise<SitePopupAdminValues | null> {
  await requirePermission("settings");
  return getSitePopupForAdmin();
}

export async function saveSitePopupAction(input: unknown): Promise<SitePopupSaveResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "settings"))) {
    return { ok: false, error: "Yetkisiz" };
  }
  const result = await saveSitePopup(input);
  if (result.ok) {
    revalidateTag(SITE_POPUP_CACHE_TAG, { expire: 0 });
  }
  return result;
}
