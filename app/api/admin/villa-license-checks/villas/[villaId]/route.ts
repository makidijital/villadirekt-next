import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { recheckVillaLicense } from "@/app/services/villa-license-check.service";

/* ===============================================================
   🛡️ POST /api/admin/villa-license-checks/villas/[villaId]
   ===============================================================
   Tek villanın belgesini KTB'de yeniden kontrol eder (önbelleksiz).
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ villaId: string }> }
): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return NextResponse.json({ ok: false, error: FORBIDDEN_MESSAGE }, { status: 403 });
  }
  const { villaId } = await ctx.params;
  if (!villaId) {
    return NextResponse.json({ ok: false, error: "villaId gerekli" }, { status: 400 });
  }
  const result = await recheckVillaLicense(villaId, auth.caller.id);
  if (!result.ok) {
    const status =
      result.code === "not_found" ? 404
      : result.code === "no_document" ? 422
      : result.code === "parser_unverified" ? 409
      : 500;
    return NextResponse.json({ ok: false, code: result.code, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, result: result.result, reason: result.reason });
}
