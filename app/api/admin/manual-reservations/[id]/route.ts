import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { manualReservationServerRepository } from "@/lib/db/manual-reservation.repository.server";

/* ===============================================================
   🛡️ /api/admin/manual-reservations/[id] — DETAIL (admin-only)
   ===============================================================
   GET → admin "Blok düzenle" edit sayfası için.

   ⚠️ NEDEN BU ROUTE VAR?
     /maki-admin/manual-reservations/[id]/page.tsx eskiden RSC'di
     ve `getManualReservationById(id)` → anon `db` ile select
     yapıyordu. Migration 040 admin-only RLS sonrası RSC anon
     session-less SELECT → DENY → `data: null` → `notFound()` →
     **Next page 404**.

     Bu route /api/admin/manual-reservations (list) ile birebir
     aynı pattern: adminFetch (Bearer) → server route → service-role
     repository.

   ⚠️ BYTE-IDENTICAL CONTRACT:
     - SELECT: `id, villa_id, start_date, end_date, note, source,
       status, created_at` — anon repo `SELECT_MANUAL_DETAIL` ile aynı.
     - `.maybeSingle()` resolver — eski service ile aynı (missing row
       → data:null, error:null, route 404 döner).
     - Response shape: `{ ok: true, manual_reservation: row }` veya
       `{ ok: false, error }`.

   AUTH:
     `authorizeAdminCaller` — Bearer token + admin_users is_active
     kontrolü. /api/admin/manual-reservations ile aynı pattern.
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

  /* 🛡️ Admin yetki (manual_reservations) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "manual_reservations"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "id zorunlu" },
      { status: 400 }
    );
  }

  const { data, error } =
    await manualReservationServerRepository.findById(id);

  if (error) {
    console.error(
      "[admin.manual-reservations.detail] FAILED",
      error.message
    );
    return NextResponse.json(
      { ok: false, error: error.message || "Kayıt alınamadı" },
      { status: 500 }
    );
  }

  if (!data) {
    /* Eski RSC davranışı: missing row → notFound() (Next 404).
       Caller adminFetch çağrısı 404 görür → page kendi
       not-found UI'sını render eder. */
    return NextResponse.json(
      { ok: false, error: "Kayıt bulunamadı" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    manual_reservation: data,
  });
}
