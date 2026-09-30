"use server";

import { getPublicSettings } from "@/app/services/settings.service";
import type { Settings } from "@/app/services/settings.types";

/* ===============================================================
   🛡️ SETTINGS — PUBLIC SERVER ACTION (thin wrapper, FAZ 6 S2)
   ===============================================================
   Public client'lar (TopBar, ReservationForm, useBookingEngine) →
   bu server action → `settings.service.getPublicSettings` → RPC
   `get_public_settings` (SECURITY DEFINER, public-safe; secret DÖNMEZ).

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız delege eder. Dönüş
     (`Settings | null`) BİREBİR; RPC/SQL/repository/service değişmedi.

   ⚠️ ADMIN oku/yaz S3'te server action DEĞİL: secret (resend_api_key)
     yetkilendirmesi RLS `is_active_admin` (JWT) yerine service-role
     kullanınca zayıflardı. Bu yüzden admin tarafı app'in secure pattern'i
     ile `/api/admin/settings` (authorizeAdminCaller Bearer) üzerinden gider
     → `app/services/settings.client.ts` (adminFetch). Bkz. S3.
   =============================================================== */

export async function getPublicSettingsAction(): Promise<Settings | null> {
  return getPublicSettings();
}
