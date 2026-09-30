import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/cron-auth";
import { adminActivityLogRepository } from "@/lib/db/admin-activity-log.repository.server";

/* ===============================================================
   🛡️ CRON — ACTIVITY LOGS RETENTION (thin wrapper)
   ===============================================================
   Zamanlama: her gece (Coolify Scheduled Task).
   Tetikleyici: zamanlanmış görev → GET /api/cron/activity-
   logs-cleanup (Authorization: Bearer <CRON_SECRET>).

   ⚠️ TASARIM PRENSİBİ:
     Mevcut `/api/admin/activity-logs/cleanup` route'una DOKUNULMADI;
     admin manuel cleanup yeteneği AYNEN (mode "90d" | "all"). Bu cron
     wrapper paralel bir endpoint — yalnız iki fark:
       1. Auth: admin Bearer JWT yerine CRON_SECRET Bearer
       2. Mode sabit "90d" — admin endpoint'indeki 90 günlük cutoff
          değeri (line 52-59) AYNEN.

   ⚠️ BUSINESS LOGIC PARITY:
     Cutoff hesap: `Date.now() - 90 * 24 * 60 * 60 * 1000` → ISO.
     DELETE: `from("admin_activity_logs").delete({ count: "exact" })
     .lt("created_at", cutoff)`. Admin route'undaki "90d" şubesiyle
     BYTE-IDENTICAL.
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = authorizeCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const cutoff = new Date(
    Date.now() - 90 * 24 * 60 * 60 * 1000
  ).toISOString();

  const result = await adminActivityLogRepository.deleteOlderThan(cutoff);

  if (result.error) {
    console.error("[cron.activity-logs-cleanup] FAILED", {
      message: result.error.message,
    });
    return NextResponse.json(
      { ok: false, error: result.error.message },
      { status: 500 }
    );
  }

  const deleted = result.count ?? 0;
  console.log("[cron.activity-logs-cleanup] OK", { deleted, cutoff });
  return NextResponse.json({ ok: true, mode: "90d", deleted });
}
