import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { setVillaActive } from "@/app/services/villa-admin.service";

/* ===============================================================
   🛡️ /api/admin/villas/[id]/active — VILLA ACTIVE TOGGLE
   ===============================================================
   PATCH { active: boolean } → setVillaActive(id, active) service delege.
   FAZ 2 frontend purge — VillaActions (CLIENT) artık adminFetch ile;
   `villa-admin.service` barrel'ı hard-delete + private-token re-export
   ediyor (server-only chain), client'tan import edilemez.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (villas) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id gerekli" },
      { status: 400 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as { active?: unknown };
  if (typeof body.active !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "active (boolean) zorunlu" },
      { status: 400 }
    );
  }

  const result = await setVillaActive(id, body.active);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error || "Güncellenemedi" },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
