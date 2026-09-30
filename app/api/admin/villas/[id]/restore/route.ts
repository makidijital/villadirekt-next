import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { restoreVilla } from "@/app/services/villa-admin.service";

/* ===============================================================
   🛡️ /api/admin/villas/[id]/restore — TRASH RESTORE (admin-only)
   ===============================================================
   POST → `restoreVilla(id)` service delege.
     - deleted_at = NULL
     - is_active  = true
     - Idempotent predicate: yalnız `deleted_at IS NOT NULL` kayıtlara
       uygulanır (canlı bir villayı bozmaz).

   Service `VillaServiceResult` shape döner:
     `{ ok: true }` veya `{ ok: false; error: string }`
   Route bu shape'i AYNEN iletir (caller `res.ok` ile branch'ler).

   FAZ 2 frontend purge — `villas/trash/page.tsx` (CLIENT) daha önce
   `restoreVilla`'yı visibility.service'ten DEEP import ediyordu;
   visibility.service `villa.repository.server` (server-only) zincirini
   pulluyor → runtime client leak. Bu route adminFetch (Bearer)
   arkasında SAME service delege; davranış BYTE-IDENTICAL.

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
    const result = await restoreVilla(id);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Geri yüklenemedi";
    console.error("[admin.villas.restore] FAILED", msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }
}
