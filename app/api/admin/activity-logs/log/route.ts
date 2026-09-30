import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import { adminActivityLogRepository } from "@/lib/db/admin-activity-log.repository.server";
import {
  boundJsonSize,
  computeDiffSummary,
  sanitizeForAudit,
} from "@/lib/activity-log.helper";

/* ===============================================================
   🛡️ FAZ 55 — ACTIVITY LOG INSERT (admin caller-driven)
   ===============================================================
   Admin client UI bu endpoint'i çağırır (logActivity wrapper'ı
   üzerinden). Server-side endpoint:
     1) admin auth doğrula
     2) before/after JSON masking + size cap
     3) diff_summary compute (caller geçtiyse override)
     4) IP/UA/route capture (server headers)
     5) service-role INSERT

   PRODUCTION-SAFE FAIL MODE:
     • Endpoint hatası → 500 JSON döner ama caller ASLA reject etmez
       (logger fire-and-forget; ana operation zaten başarılı).
     • Network down → caller catch() ile yutar (sentinel log:
       console.warn). Audit kaybolur ama core flow etkilenmez.
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LogPayload = {
  action?: unknown;
  entity_type?: unknown;
  entity_id?: unknown;
  entity_title?: unknown;
  before_data?: unknown;
  after_data?: unknown;
  diff_summary?: unknown;
  route?: unknown;
};

function extractClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  return real ? real.trim() : null;
}

export async function POST(req: Request) {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  let body: LogPayload | null = null;
  try {
    body = (await req.json()) as LogPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz JSON gövdesi" },
      { status: 400 }
    );
  }
  if (!body || typeof body.action !== "string" || !body.action.trim()) {
    return NextResponse.json(
      { ok: false, error: "action gerekli" },
      { status: 400 }
    );
  }

  /* Masking + size cap — caller'ın geçtiği ham obj'lere uygulanır. */
  const beforeSanitized =
    body.before_data !== undefined && body.before_data !== null
      ? boundJsonSize(sanitizeForAudit(body.before_data))
      : null;
  const afterSanitized =
    body.after_data !== undefined && body.after_data !== null
      ? boundJsonSize(sanitizeForAudit(body.after_data))
      : null;

  /* Diff summary: caller override geçtiyse onu kullan (örn. server-side
     computed); yoksa sanitize edilmiş before/after üzerinden compute et. */
  const diffSummary = Array.isArray(body.diff_summary)
    ? (body.diff_summary as unknown[])
        .filter((s): s is string => typeof s === "string" && s.length > 0)
        .slice(0, 64) /* defansif limit */
    : computeDiffSummary(beforeSanitized, afterSanitized);

  const userAgent = req.headers.get("user-agent") || null;
  const ipAddress = extractClientIp(req);
  const routeStr =
    typeof body.route === "string" && body.route.trim()
      ? body.route.trim().slice(0, 500)
      : null;

  const row = {
    admin_user_id: auth.caller.id,
    admin_email: auth.caller.email,
    action: String(body.action).trim().slice(0, 80),
    entity_type:
      typeof body.entity_type === "string" && body.entity_type.trim()
        ? body.entity_type.trim().slice(0, 40)
        : null,
    entity_id:
      typeof body.entity_id === "string" && body.entity_id.trim()
        ? body.entity_id.trim().slice(0, 80)
        : null,
    entity_title:
      typeof body.entity_title === "string" && body.entity_title.trim()
        ? body.entity_title.trim().slice(0, 200)
        : null,
    before_data: beforeSanitized,
    after_data: afterSanitized,
    diff_summary: diffSummary,
    route: routeStr,
    ip_address: ipAddress,
    user_agent: userAgent ? userAgent.slice(0, 500) : null,
  };

  const { error } = await adminActivityLogRepository.insert(row);

  if (error) {
    console.error("[activity-logs.log] INSERT FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
