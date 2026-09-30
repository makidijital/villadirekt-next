import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import {
  VILLA_DETAIL_READERS,
} from "@/lib/auth/admin-permission-map";
import { villaAdminRepository } from "@/lib/db/villa.repository.server";

/* ===============================================================
   🛡️ /api/admin/villas/[id] — VILLA CONTEXT (admin-only)
   ===============================================================
   GET → reservation detail page için single villa context fields:
         id, title, cleaning_fee, cleaning_currency, cleaning_limit,
         custom_prepayment_rate.

   FAZ 2 frontend purge — daha önce client `db.from("villa")
   .select(...).eq("id", villaId).single()` çağrılıyordu. Aynı
   select shape ve aynı .single() semantic'i korunur.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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

  /* 🛡️ Admin yetki (VILLA_DETAIL_READERS) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, VILLA_DETAIL_READERS))) {
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

  const { data, error } = await villaAdminRepository.findContextById(id);

  if (error) {
    console.error("[admin.villas.detail] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Villa alınamadı" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, villa: data });
}
