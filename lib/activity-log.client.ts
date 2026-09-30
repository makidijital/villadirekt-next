import { adminFetch } from "@/lib/admin-fetch";
import type { ActivityLogPayload } from "@/lib/activity-log.helper";

/* ===============================================================
   🛡️ FAZ 55 — ACTIVITY LOG CLIENT WRAPPER
   ===============================================================
   Admin client component'leri operation başarılı olduktan sonra
   bu wrapper'ı fire-and-forget çağırır:

     const res = await updateVilla(...);
     if (res.ok) {
       logActivity({
         action: "villa.update",
         entity_type: "villa",
         entity_id: villaId,
         entity_title: villa.title,
         before_data: prevVilla,
         after_data: nextVilla,
       }).catch(() => {});  // logger hatası core flow'u etkilemez
     }

   PRODUCTION-SAFE FAIL MODE:
     • Network/auth/server hatası → console.warn + sessizce yutar.
     • Promise resolve eder (asla reject etmez); caller catch'e
       gerek duymaz. Yine de defensively .catch() önerilir.
=============================================================== */

export async function logActivity(
  payload: ActivityLogPayload
): Promise<{ ok: boolean }> {
  try {
    const body: Record<string, unknown> = {
      action: payload.action,
    };
    if (payload.entity_type) body.entity_type = payload.entity_type;
    if (payload.entity_id) body.entity_id = payload.entity_id;
    if (payload.entity_title) body.entity_title = payload.entity_title;
    if (payload.before_data !== undefined) body.before_data = payload.before_data;
    if (payload.after_data !== undefined) body.after_data = payload.after_data;
    if (payload.diff_summary) body.diff_summary = payload.diff_summary;
    if (payload.route) body.route = payload.route;
    else if (typeof window !== "undefined") {
      body.route = window.location.pathname;
    }

    const res = await adminFetch("/api/admin/activity-logs/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true, /* sayfa navigasyonu sırasında log atılırsa kaybolmasın */
    });

    if (!res.ok) {
      console.warn(
        "[activity-log.client] log POST returned HTTP",
        res.status
      );
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.warn("[activity-log.client] log FAILED", msg);
    return { ok: false };
  }
}

/* Re-export type for ergonomic import in admin components. */
export type { ActivityLogPayload } from "@/lib/activity-log.helper";
