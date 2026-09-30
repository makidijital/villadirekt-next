import "server-only";

import { adminActivityLogRepository } from "@/lib/db/admin-activity-log.repository.server";
import {
  boundJsonSize,
  computeDiffSummary,
  sanitizeForAudit,
  type ActivityEntityType,
} from "@/lib/activity-log.helper";

/* ===============================================================
   🛡️ FAZ 55B — SERVER-SIDE ACTIVITY LOG INSERT
   ===============================================================
   Server-side endpoint'lerin (örn. /api/admin/exchange-rates/refresh,
   /api/admin/mail-logs/cleanup) ana operation başarılı olduktan sonra
   çağırdığı service-role helper. Client-side `/api/admin/activity-
   logs/log` route'u client component'lerden POST için; bu helper
   server-side endpoint'lerin **inline insert** ihtiyacı için
   (ek HTTP roundtrip yok).

   GUARANTEED FAIL-SAFE:
     • Try/catch kaplı; ASLA throw etmez.
     • Logger insert fail → console.warn + { ok: false } döner;
       caller'ın core operation'ı etkilenmez (additive logging).
     • Caller awaitlemese bile unhandled rejection olmaz.

   MASKING + DIFF:
     • Aynı helper'lar (sanitizeForAudit, boundJsonSize,
       computeDiffSummary) — client log endpoint'i ile birebir
       behavior parity.
     • Caller `diff_summary` override geçerse compute atlanır.
=============================================================== */

export type AdminActivityLogContext = {
  admin_user_id: string;
  admin_email: string;
  route?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
};

export type AdminActivityLogInput = {
  action: string;
  entity_type?: ActivityEntityType | null;
  entity_id?: string | null;
  entity_title?: string | null;
  before_data?: unknown;
  after_data?: unknown;
  /** Caller manuel diff geçerse compute atlanır. */
  diff_summary?: string[] | null;
};

/** Server-side log insert. Asla throw etmez. */
export async function insertAdminActivityLog(
  ctx: AdminActivityLogContext,
  input: AdminActivityLogInput
): Promise<{ ok: boolean }> {
  try {
    const beforeSanitized =
      input.before_data !== undefined && input.before_data !== null
        ? boundJsonSize(sanitizeForAudit(input.before_data))
        : null;
    const afterSanitized =
      input.after_data !== undefined && input.after_data !== null
        ? boundJsonSize(sanitizeForAudit(input.after_data))
        : null;

    const diff = Array.isArray(input.diff_summary)
      ? input.diff_summary
          .filter((s): s is string => typeof s === "string" && s.length > 0)
          .slice(0, 64)
      : computeDiffSummary(beforeSanitized, afterSanitized);

    const { error } = await adminActivityLogRepository.insert({
      admin_user_id: ctx.admin_user_id,
      admin_email: ctx.admin_email,
      action: String(input.action || "").trim().slice(0, 80),
      entity_type: input.entity_type
        ? String(input.entity_type).trim().slice(0, 40)
        : null,
      entity_id: input.entity_id
        ? String(input.entity_id).trim().slice(0, 80)
        : null,
      entity_title: input.entity_title
        ? String(input.entity_title).trim().slice(0, 200)
        : null,
      before_data: beforeSanitized,
      after_data: afterSanitized,
      diff_summary: diff,
      route: ctx.route ? String(ctx.route).slice(0, 500) : null,
      ip_address: ctx.ip_address || null,
      user_agent: ctx.user_agent ? String(ctx.user_agent).slice(0, 500) : null,
    });

    if (error) {
      console.warn("[admin-activity-log] INSERT FAILED", error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[admin-activity-log] EXCEPTION", msg);
    return { ok: false };
  }
}

/* ---------------------------------------------------------------
   🛡️ extractAdminContextFromRequest
   API route'larda standart context derleme convenience helper.
   IP: x-forwarded-for ilk hop → fallback x-real-ip → null
   UA: user-agent header
   route: URL pathname
--------------------------------------------------------------- */
export function extractAdminContextFromRequest(
  req: Request,
  caller: { id: string; email: string }
): AdminActivityLogContext {
  let ip: string | null = null;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) ip = first;
  }
  if (!ip) {
    const real = req.headers.get("x-real-ip");
    if (real) ip = real.trim();
  }
  const ua = req.headers.get("user-agent");
  let route: string | null = null;
  try {
    route = new URL(req.url).pathname;
  } catch {
    /* ignore — bad URL */
  }
  return {
    admin_user_id: caller.id,
    admin_email: caller.email,
    route,
    ip_address: ip,
    user_agent: ua ? ua.slice(0, 500) : null,
  };
}
