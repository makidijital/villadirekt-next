import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { reservationShareRepository } from "@/lib/db/reservation-share.repository.server";
import {
  generateShareToken,
  hashShareToken,
  shareExpiresAtFromEndDate,
  buildReservationShareUrl,
} from "@/lib/reservation-share.helper";

/* ===============================================================
   🛡️ ADMIN — REZERVASYON PAYLAŞIM LİNKİ (create / revoke)
   ===============================================================
   POST   → yeni güvenli paylaşım linki üretir; RAW URL döner (hash-at-rest
            olduğu için ham token YALNIZ burada, bir kez görünür). expires_at
            = reservation.end_date + 3 gün (helper). Çoklu aktif link tolere
            edilir (hepsi geçerli; eski gönderilen link bozulmaz).
   DELETE → rezervasyonun TÜM aktif linklerini iptal eder (revoked_at).

   Auth: `authorizeAdminCaller` (native access cookie). Mevcut reservation
   create/update/lookup/price'a DOKUNMAZ — additive.
   =============================================================== */

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
      { ok: false, error: "Rezervasyon ID gerekli." },
      { status: 400 }
    );
  }

  /* Rezervasyonu oku → end_date'ten expires_at (kafadan süre yok). */
  const { data: rows, error: readErr } =
    await reservationShareRepository.findReservationForShare(id);
  const row =
    Array.isArray(rows) && rows.length > 0
      ? (rows[0] as { end_date: string | null })
      : null;
  if (readErr || !row) {
    return NextResponse.json(
      { ok: false, error: "Rezervasyon bulunamadı." },
      { status: 404 }
    );
  }

  const expiresAt = shareExpiresAtFromEndDate(row.end_date);
  if (!expiresAt) {
    return NextResponse.json(
      {
        ok: false,
        error: "Rezervasyon çıkış tarihi geçersiz; link oluşturulamadı.",
      },
      { status: 400 }
    );
  }

  /* Opportunistic cleanup (expired/revoked fiziksel sil) — best-effort. */
  await reservationShareRepository.cleanupStale(id).catch(() => {});

  const rawToken = generateShareToken();
  const tokenHash = hashShareToken(rawToken);

  const { error: insErr } = await reservationShareRepository.create({
    reservation_id: id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_by: null, // nullable soft-ref
  });
  if (insErr) {
    console.error("[share-link] create error:", insErr.message);
    return NextResponse.json(
      { ok: false, error: "Link oluşturulamadı." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    url: buildReservationShareUrl(rawToken),
    expiresAt,
  });
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
      { ok: false, error: "Rezervasyon ID gerekli." },
      { status: 400 }
    );
  }

  const { error } = await reservationShareRepository.revokeByReservation(id);
  if (error) {
    console.error("[share-link] revoke error:", error.message);
    return NextResponse.json(
      { ok: false, error: "İptal edilemedi." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
