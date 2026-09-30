"use server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import {
  deleteSettingsTranslation,
  getSettingsTranslations,
  upsertSettingsTranslation,
  type SettingsTranslationInput,
  type SettingsTranslationSaveResult,
  type SettingsTranslationsLoadResult,
} from "@/app/services/settings-translation.service";
import { revalidateSettings } from "@/app/services/revalidate.actions";
import { authorizeAdminSession } from "@/lib/admin-route-auth";

/* ===============================================================
   🛡️ PHASE 10L §4 — ADMIN SETTINGS TRANSLATION SERVER ACTIONS
   ===============================================================
   `app/(admin)/maki-admin/types/type-translations.action.ts` (Phase 10D)
   ile BİREBİR AYNI desen:
     • Okuma: sayfa zaten middleware ile korunuyor — ekstra auth YOK.
     • Yazma: `authorizeAdminSession()` İLK kontrol — yetkisiz çağrıda
       servise/DB'ye HİÇ ULAŞILMAZ.
     • Bu dosya ince wrapper; iş mantığı `app/services/
       settings-translation.service.ts`'te.

   ⚠️ MEVCUT SETTINGS SAVE AKIŞINA DOKUNULMADI (§4/§14):
     `/api/admin/settings` PUT, `settings.client.ts > updateSettingsClient`
     ve 7 settings alt sayfasının handleSubmit'i DEĞİŞMEDİ. Çeviri
     payload'ı O AKIŞA HİÇ GİRMEZ — ayrı tabloya, ayrı action ile yazılır.

   ⚠️ CACHE (§11): Başarılı yazmadan sonra `revalidateSettings()` —
     mevcut `"settings"` tag'i, YENİ bir cache sistemi/tag EKLENMEDİ.
     Public taraf çevirileri `getPublicSettings()` payload'ı üzerinden
     okuduğu için bu tek invalidate yeterlidir.
   =============================================================== */

export async function loadSettingsTranslationsAction(): Promise<SettingsTranslationsLoadResult> {
  await requirePermission("settings");
  return getSettingsTranslations();
}

export async function saveSettingsTranslation(
  input: SettingsTranslationInput
): Promise<SettingsTranslationSaveResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "settings"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  const result = await upsertSettingsTranslation(input);

  /* Yalnız GERÇEKTEN yazıldıysa invalidate — başarısız denemede public
     cache boşuna temizlenmez. */
  if (result.ok) {
    await revalidateSettings();
  }

  return result;
}

export async function deleteSettingsTranslationAction(
  locale: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "settings"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  const result = await deleteSettingsTranslation(locale);
  if (result.ok) {
    await revalidateSettings();
  }

  return result;
}
