import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { processLicenseScanTick } from "@/app/services/villa-license-check.service";

/* ===============================================================
   🛡️ POST /api/admin/villa-license-checks/runs/[runId]/tick
   ===============================================================
   Admin ekranı açıkken periyodik çağrılır; run kilidini alıp zaman
   bütçesi içinde küçük bir batch işler. Kilit başka istekteyse
   `busy: true` ile hemen döner (çift işleme YOK).
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ runId: string }> }
): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return NextResponse.json({ ok: false, error: FORBIDDEN_MESSAGE }, { status: 403 });
  }
  const { runId } = await ctx.params;
  if (!runId) {
    return NextResponse.json({ ok: false, error: "runId gerekli" }, { status: 400 });
  }
  const result = await processLicenseScanTick(runId);
  if (!result.ok) {
    const status =
      result.code === "not_found" ? 404 : result.code === "parser_unverified" ? 409 : 500;
    return NextResponse.json({ ok: false, code: result.code, error: result.error }, { status });
  }
  return NextResponse.json({
    ok: true,
    run: result.run,
    busy: result.busy,
    processedDocuments: result.processedDocuments,
  });
}
