import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import {
  getLicenseCheckOverview,
  startFullLicenseScan,
} from "@/app/services/villa-license-check.service";

/* ===============================================================
   🛡️ /api/admin/villa-license-checks — KTB BELGE KONTROLÜ
   ===============================================================
   GET  → özet + villa listesi + aktif/son tarama
   POST → toplu tarama OLUŞTURUR (yalnız run + bekleyen satırlar;
          KTB sorgusu tick endpoint'inde küçük batch'lerle yapılır).
          Aktif tarama varsa yenisi açılmaz, mevcut döner.
   Yetki: authorizeAdminCaller → callerHasPermission("villas").
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return NextResponse.json({ ok: false, error: FORBIDDEN_MESSAGE }, { status: 403 });
  }
  try {
    const overview = await getLicenseCheckOverview();
    return NextResponse.json({ ok: true, overview });
  } catch (err) {
    console.error("[admin.villa-license-checks] OVERVIEW_FAILED", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Okunamadı" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return NextResponse.json({ ok: false, error: FORBIDDEN_MESSAGE }, { status: 403 });
  }
  const result = await startFullLicenseScan(auth.caller.id);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code, error: result.error },
      { status: result.code === "parser_unverified" ? 409 : 500 }
    );
  }
  return NextResponse.json({ ok: true, run: result.run, alreadyRunning: result.alreadyRunning });
}
