import { NextResponse } from "next/server";
import { sendMail } from "@/app/lib/mail/send";
import { applyRateLimit } from "@/lib/rate-limit";
import { buildVoucherContent } from "@/app/lib/voucher/build";
import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";

/* ===============================================================
   🔥 POST /api/mail/voucher
   ===============================================================
   Body: { reservationId: string }
   Auth: Authorization: Bearer <admin access_token> ZORUNLU

   Akış:
     0. authorizeAdminCaller(req) — admin doğrula (active)
     1. buildVoucherContent → confirmed rezervasyon için HTML render
        (ReservationApprovedEmail görünümüyle birebir aynı)
     2. sendMail → mailType: "voucher"
     3. Structured logging — silent fail YOK; PII loglanmaz

   Mevcut /api/mail/reservation-approved route'una dokunulmaz;
   bu ayrı bir voucher gönderim akışı. Customer aynı görünümlü
   maili "Voucher" konusuyla alır.
   =============================================================== */
export async function POST(req: Request) {
  /* Rate limit: 5 req/dakika/IP — mail spam koruması. */
  const limited = await applyRateLimit(req, "mail");
  if (limited) return limited;

  console.log("[mail.voucher] POST");

  try {
    /* ---------- ADMIN AUTH ---------- */
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      console.error("[mail.voucher.auth] UNAUTHORIZED", {
        status: auth.status,
        error: auth.error,
      });
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
    console.info("[mail.voucher.auth] ADMIN_VERIFIED", {
      callerId: auth.caller.id,
    });

    const body = await req.json().catch(() => ({}));
    const reservationId = (body?.reservationId || "")
      .toString()
      .trim();

    if (!reservationId) {
      console.error("[mail.voucher] BAD_REQUEST", {
        reason: "reservationId zorunlu",
      });
      return NextResponse.json(
        { ok: false, error: "reservationId zorunlu" },
        { status: 400 }
      );
    }

    const built = await buildVoucherContent(reservationId);
    if (!built.ok) {
      console.error("[mail.voucher] BUILD_FAILED", {
        reservationId,
        status: built.status,
        error: built.error,
      });
      return NextResponse.json(
        { ok: false, error: built.error },
        { status: built.status }
      );
    }

    if (!built.recipient) {
      console.error("[mail.voucher] MISSING_EMAIL", {
        reservationId,
      });
      return NextResponse.json(
        { ok: false, error: "Müşteri e-posta adresi yok" },
        { status: 422 }
      );
    }

    const result = await sendMail({
      to: built.recipient,
      subject: built.subject,
      html: built.html,
      mailType: "voucher",
      reservationId,
    });

    if (!result.ok) {
      console.error("[mail.voucher] SEND_FAILED", {
        reservationId,
        recipient: built.recipient,
        error: result.error,
      });
      return NextResponse.json(
        { ok: false, error: result.error || "Gönderilemedi" },
        { status: 502 }
      );
    }

    console.info("[mail.voucher] SENT", {
      reservationId,
      recipient: built.recipient,
      mailId: result.id,
    });

    return NextResponse.json({
      ok: true,
      id: result.id,
      recipient: built.recipient,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[mail.voucher] EXCEPTION", { error: message });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
