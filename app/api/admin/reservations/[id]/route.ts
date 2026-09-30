import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import {
  getReservationById,
  updateReservationFull,
  deleteReservationById,
} from "@/app/services/reservation.service";
import { reservationServerRepository } from "@/lib/db/reservation.repository.server";
import type { ReservationUpdateInput } from "@/app/services/reservation/types";

/* ===============================================================
   🛡️ /api/admin/reservations/[id] — RESERVATION DETAIL (admin-only)
   ===============================================================
   GET    /api/admin/reservations/<id>           → detay
   PATCH  /api/admin/reservations/<id>  body=    → full update
                                                  (updateReservationFull)
   DELETE /api/admin/reservations/<id>           → silme

   FAZ 2 frontend purge — daha önce `reservations/[id]/page.tsx`
   (CLIENT) bu service'leri DİREKT import ederek çağırıyordu;
   server-only chain (adminGateway/server) client'a sızıyordu.
   Bu route adminFetch (Bearer) + service delege ile davranış
   BYTE-IDENTICAL üretir. Tüm iş mantığı (paid_amount guard, mail
   trigger, audit) service tarafında AYNEN korunur.
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

  /* 🛡️ Admin yetki (reservations) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "reservations"))) {
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
    /* 🛡️ Mig 040 admin-only RLS: anon `db` server-context'te JWT
       taşımaz → DENY → `.single()` PGRST116 → "Rezervasyon
       getirilemedi". Service-role repo geçilir; chain + throw
       mesajları BYTE-IDENTICAL. */
    const reservation = await getReservationById(id, {
      repository: reservationServerRepository,
    });
    return NextResponse.json({ ok: true, reservation });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Rezervasyon alınamadı";
    console.error("[admin.reservations.detail.get] FAILED", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

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

  /* 🛡️ Admin yetki (reservations) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "reservations"))) {
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
  let body: ReservationUpdateInput;
  try {
    body = (await req.json()) as ReservationUpdateInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }
  try {
    /* Service tüm validasyonu yapar (date range, confirmed paid_amount,
       audit, mail dispatch). Hata mesajı caller'a aynen iletilir
       (BYTE-IDENTICAL toast). 040 admin-only RLS: server-context anon
       `db` UPDATE 0 row → silent fail; service-role repo geçilir. */
    await updateReservationFull(id, body, {
      repository: reservationServerRepository,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Güncellenemedi";
    console.error("[admin.reservations.detail.patch] FAILED", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(
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

  /* 🛡️ Admin yetki (reservations) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "reservations"))) {
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
    /* 040 admin-only RLS: server-context anon `db` DELETE 0 row →
       silent fail; service-role repo geçilir. */
    await deleteReservationById(id, {
      repository: reservationServerRepository,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Silinemedi";
    console.error("[admin.reservations.detail.delete] FAILED", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
