import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { adminActivityLogRepository } from "@/lib/db/admin-activity-log.repository.server";

/* ===============================================================
   🛡️ FAZ 55 — ACTIVITY LOG LIST (admin GET, service-role)
   ===============================================================
   Filtreli listeleme + pagination. UI bu endpoint'ten okur.

   QUERY:
     • admin_user_id=<uuid>   (optional)
     • action=<string>        (optional, exact match)
     • entity_type=<string>   (optional, exact match)
     • from=<ISO>             (optional, created_at >= from)
     • to=<ISO>               (optional, created_at <= to)
     • limit=<int 1..200>     (default 50)
     • offset=<int>           (default 0)

   RESPONSE:
     {
       ok: true,
       items: [...rows],
       total: number,           // exact count
       returned: number,        // current page size
       offset, limit
     }
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseIntSafe(v: string | null, def: number, min: number, max: number) {
  if (!v) return def;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: Request) {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ SEC-03 (Faz 1) — aktivite logları `activity_logs` izni ister.
     İzin yoksa log tablosuna hiç sorgu atılmaz. */
  if (!(await callerHasPermission(auth.caller.id, "activity_logs"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const limit = parseIntSafe(url.searchParams.get("limit"), 50, 1, 200);
  const offset = parseIntSafe(url.searchParams.get("offset"), 0, 0, 100_000);
  const adminUserId = url.searchParams.get("admin_user_id");
  const action = url.searchParams.get("action");
  const entityType = url.searchParams.get("entity_type");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const { data, error, count } = await adminActivityLogRepository.list({
    limit,
    offset,
    adminUserId,
    action,
    entityType,
    from,
    to,
  });
  if (error) {
    console.error("[activity-logs.list] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    items: data || [],
    total: count ?? 0,
    returned: (data || []).length,
    offset,
    limit,
  });
}
