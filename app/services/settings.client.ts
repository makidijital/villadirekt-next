import { adminFetch } from "@/lib/admin-fetch";
import type { Settings } from "@/app/services/settings.types";

/* ===============================================================
   🛡️ SETTINGS — ADMIN CLIENT (adminFetch, FAZ 6 S3)
   ===============================================================
   Admin settings sayfaları (7 sub-route) için oku/yaz — app'in secure
   admin pattern'i: `adminFetch` (browser session Bearer) → `/api/admin/
   settings` (authorizeAdminCaller → is_active_admin) → service-role repo.

   ⚠️ İmzalar eski `settings.service.getSettings`/`updateSettings` ile
     BİREBİR (`Settings | null` / `boolean`) → sayfaların call-site'ları,
     loading, toast, validation davranışı DEĞİŞMEZ (yalnız import repoint).
     Secret yetkilendirmesi eskiyle aynı seviyede (JWT-doğrulamalı admin;
     RLS yerine route authorizeAdminCaller). Public/mail flow'a dokunulmadı.
=============================================================== */

/** GET → full settings row (admin). Hata/oturum yok → null (eski
 *  getSettings maybeSingle→null davranışıyla uyumlu). */
export async function getSettingsClient(): Promise<Settings | null> {
  try {
    const res = await adminFetch("/api/admin/settings");
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      settings?: Settings | null;
    } | null;
    if (!res.ok || !json?.ok) return null;
    return (json.settings as Settings) || null;
  } catch {
    return null;
  }
}

/** PUT → update (admin). Başarı → true; oturum/hata → false (eski
 *  updateSettings davranışıyla uyumlu). */
export async function updateSettingsClient(
  values: Partial<Settings>
): Promise<boolean> {
  try {
    const res = await adminFetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
    } | null;
    return !!(res.ok && json?.ok);
  } catch {
    return false;
  }
}
