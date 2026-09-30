import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { adminActivityLogRepository } from "@/lib/db/admin-activity-log.repository.server";

/* ===============================================================
   🛡️ FAZ 55 — ACTIVITY LOG CLEANUP (admin POST)
   ===============================================================
   • mode "90d" → 90 günden eski satırları sil
   • mode "all" → tüm satırları sil (audit reset)
   Same pattern: mail-logs cleanup. transaction-safe (tek DELETE).
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MODES = ["90d", "all"] as const;
type Mode = (typeof ALLOWED_MODES)[number];

function isMode(v: unknown): v is Mode {
  return typeof v === "string" && (ALLOWED_MODES as readonly string[]).includes(v);
}

export async function POST(req: Request) {
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

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz JSON gövdesi" },
      { status: 400 }
    );
  }
  const mode = (body as { mode?: unknown } | null)?.mode;
  if (!isMode(mode)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz mode (beklenen: '90d' veya 'all')" },
      { status: 400 }
    );
  }

  let result;
  if (mode === "90d") {
    const cutoff = new Date(
      Date.now() - 90 * 24 * 60 * 60 * 1000
    ).toISOString();
    result = await adminActivityLogRepository.deleteOlderThan(cutoff);
  } else {
    result = await adminActivityLogRepository.deleteAll();
  }

  if (result.error) {
    console.error("[activity-logs.cleanup] FAILED", result.error.message);
    return NextResponse.json(
      { ok: false, error: result.error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    mode,
    deleted: result.count ?? 0,
  });
}
