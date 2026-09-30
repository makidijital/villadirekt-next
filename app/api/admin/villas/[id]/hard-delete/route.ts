import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { hardDeleteVilla } from "@/app/services/villa-admin.service";

/* ===============================================================
   🛡️ /api/admin/villas/[id]/hard-delete — VILLA HARD DELETE (admin-only)
   ===============================================================
   POST → `hardDeleteVilla(id)` service delege.

   Service orchestration BYTE-IDENTICAL:
     1) Storage cleanup (best-effort)
     2) Promise.all 7 relation table DELETE (array order STABLE)
     3) DELETE FROM villa + SQLSTATE 23503 → TR mesajı
     4) adminGateway.audit("villa.hard_deleted", ...) fire-forget

   Service return shape: `{ ok: boolean; error?: string }` —
   route AYNEN iletir (caller `res.ok` ile branch'ler).

   🔥 FAZ 2 STABILIZATION (önceki inline workaround temizlendi):
   ────────────────────────────────────────────────────────────
   Önceki tur'da bu route service'i bypass edip dbAdmin ile
   in-line DELETE yapıyordu (geçici workaround). Şimdi root cause
   PROVIDER seviyesinde çözüldü:
     - `villa-admin/hard-delete.service.ts` artık `villa.repository
        .server` (dbAdmin, service-role, RLS bypass) kullanıyor.
     - Service'in iç AST'si AYNEN; sadece execution context değişti.
     - Route artık SAFE şekilde service'i çağırabilir.

   AUTH: authorizeAdminCaller (Bearer).
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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

  try {
    const result = await hardDeleteVilla(id);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Kalıcı silme başarısız";
    console.error("[admin.villas.hard-delete] FAILED", msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }
}
