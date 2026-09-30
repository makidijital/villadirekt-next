import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import {
  createReservation,
  updateReservationStatus,
} from "@/app/services/reservation.service";
import { reservationServerRepository } from "@/lib/db/reservation.repository.server";
import type {
  ReservationCreateInput,
  ReservationStatusLegacy,
} from "@/app/services/reservation/types";

/* ===============================================================
   🛡️ /api/admin/reservations — RESERVATION CRUD partial (admin-only)
   ===============================================================
   GET                                  → liste (admin reservations page)
   PATCH  ?id=<uuid> { status }         → status update (status.service delege)
   DELETE ?id=<uuid>                    → silme (direkt dbAdmin)

   FAZ 2 frontend purge — daha önce `reservations/page.tsx` (CLIENT)
   bu işlemleri DİREKT yapıyordu:
     - anon `db.from("reservations").select(...)` (RLS)
     - service `updateReservationStatus` (server-only chain'i client'a sızdırıyordu)
     - anon `db.from("reservations").delete()`

   Bu route adminFetch (Bearer) + service-role path'i ile davranış
   BYTE-IDENTICAL aynen üretir.

   ⚠️ STATUS PATCH:
     `updateReservationStatus` service'i 'confirmed' transition'da
     paid_amount kuralını enforce eder, audit log atar (adminGateway).
     Bu route service'i delege eder; iş mantığı tek source-of-truth.

   ⚠️ DELETE:
     Eski client davranışı: anon `.delete().eq("id", id)` — service yok.
     Bu route da aynı davranışı koruyor (dbAdmin direkt delete).
     Audit log eski path'te de yoktu; davranış değişmedi.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
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

  const { data, error } =
    await reservationServerRepository.findAllForAdminList();

  if (error) {
    console.error("[admin.reservations.list] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Liste alınamadı" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, reservations: data || [] });
}

/* POST — admin reservation create. createReservation service'i delege
   eder; service tüm validasyonu, EXCLUDE constraint catch + TOCTOU
   overlap guard'ı, audit logging'i yapar. Eski page-level direct
   `db.from("reservations").insert(payload)` davranışı service
   katmanına BYTE-IDENTICAL taşındı:
     - service throw → 400/409 + error message (caller catch'i aynen)
     - başarı → { ok, reservation: { id, reservation_no } } */
export async function POST(req: Request): Promise<Response> {
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

  let body: ReservationCreateInput;
  try {
    body = (await req.json()) as ReservationCreateInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  try {
    const created = await createReservation(body, {
      insertRepository: reservationServerRepository,
    });
    const row = created as
      | { id?: string; reservation_no?: string }
      | null;
    return NextResponse.json({
      ok: true,
      reservation: {
        id: row?.id ?? null,
        reservation_no: row?.reservation_no ?? null,
      },
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Rezervasyon oluşturulamadı";
    /* "Bu tarihler dolu" → 409 conflict; diğer → 400. mapInsertError
       service tarafında message üretir; caller catch'i text'i aynen
       gösterir. */
    const status = /tarihler dolu/i.test(msg) ? 409 : 400;
    console.error("[admin.reservations.create] FAILED", msg);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

const ALLOWED_STATUS = ["pending", "confirmed", "rejected"] as const;
type AllowedStatus = (typeof ALLOWED_STATUS)[number];

export async function PATCH(req: Request): Promise<Response> {
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

  let id = "";
  try {
    id = (new URL(req.url).searchParams.get("id") || "").trim();
  } catch {
    /* URL parse hata → boş id */
  }
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id zorunlu" },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { status?: unknown };
  const status = (body.status ?? "").toString().trim();
  if (!ALLOWED_STATUS.includes(status as AllowedStatus)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz durum" },
      { status: 400 }
    );
  }

  /* Service'e delege — server-side 'confirmed' guard + audit + side-effects.
     Service hata atarsa mesajı caller'a aynen iletilir (BYTE-IDENTICAL toast).
     🛡️ 040 admin-only RLS: server-context anon `db` UPDATE 0 row → silent
     fail; service-role repo geçilir. Aynı zamanda assertCanConfirm
     fallback (paid_amount fetch) da service-role ile çalışır → 'confirmed'
     transition yanlışlıkla guard message ile reddedilmez. */
  try {
    await updateReservationStatus(
      id,
      status as ReservationStatusLegacy,
      { repository: reservationServerRepository }
    );
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Durum güncellenemedi";
    console.error("[admin.reservations.patch] FAILED", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request): Promise<NextResponse> {
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

  let id = "";
  try {
    id = (new URL(req.url).searchParams.get("id") || "").trim();
  } catch {
    /* URL parse hata → boş id */
  }
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id zorunlu" },
      { status: 400 }
    );
  }

  const { error } = await reservationServerRepository.deleteById(id);
  if (error) {
    console.error("[admin.reservations.delete] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Silinemedi" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
