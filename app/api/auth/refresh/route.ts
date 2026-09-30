import { NextResponse } from "next/server";

import { refreshSession } from "@/lib/auth/native/session.service";

/* ===============================================================
   🛡️ FAZ 2 (NATIVE AUTH) — POST /api/auth/refresh
   ===============================================================
   Refresh cookie ile access token yenile (refresh rotation + is_active
   teyidi session.service içinde). YALNIZ AUTH_PROVIDER=native iken aktif
   (yoksa 404).
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await refreshSession();
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
