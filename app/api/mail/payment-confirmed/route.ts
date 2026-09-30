import { NextResponse } from "next/server";
import { reservationServerRepository } from "@/lib/db/reservation.repository.server";
import { adminGateway } from "@/lib/admin-gateway/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { sendMail } from "@/app/lib/mail/send";
import { renderPaymentConfirmedEmail } from "@/app/lib/mail/templates/PaymentConfirmedEmail";
import { getMailConfig } from "@/app/lib/mail/client";
import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";

import {
  getPaymentDisplayValues,
} from "@/lib/payment.helper";

import {
  shouldDisplayDamageDeposit,
  formatDamageDepositTRY,
} from "@/lib/damage-deposit.helper";

import { normalizePaymentLinkStatus } from "@/lib/payment-link.helper";

import { formatTRY } from "@/lib/format";
import { formatDateTr, nightsBetween } from "@/lib/date-format";

/* ===============================================================
   🔥 POST /api/mail/payment-confirmed
   ===============================================================
   Body: { reservationId: string }
   Auth: Authorization: Bearer <admin access_token> ZORUNLU

   Akış:
     0. authorizeAdminCaller(req) — admin doğrula (active)
     1. Reservation snapshot fetch
     2. paid_amount > 0 olmalı (yoksa 422)
     3. payment_link_status zaten "paid" ise 422
     4. PaymentConfirmedEmail render → sendMail
     5. Mail başarılıysa: payment_link_status = "paid"
     6. Structured logging — silent fail YOK.

   Bu route hem credit_card hem bank_transfer rezervasyonları
   için aynı şekilde çalışır.
   =============================================================== */

/* formatTRY / formatDateTr / nightsBetween → lib/format + lib/date-format
   (önceden inline tanımlıydı, davranış birebir aynı). */

type ReservationRow = {
  id: string;
  name: string | null;
  email: string | null;
  damage_deposit?: number | null;
  start_date: string | null;
  end_date: string | null;
  total_price: number | null;
  total_price_try: number | null;
  prepayment_amount: number | null;
  paid_amount: number | null;
  payment_preference: string | null;
  payment_link_status: string | null;
  villa: { title: string | null } | null;
};

export async function POST(req: Request) {
  /* Rate limit: 5 req/dakika/IP — mail spam koruması. */
  const limited = await applyRateLimit(req, "mail");
  if (limited) return limited;

  console.log("[mail.payment_confirmed] POST");

  try {
    /* ---------- ADMIN AUTH ---------- */
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      console.error("[mail.payment_confirmed.auth] UNAUTHORIZED", {
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
    console.info("[mail.payment_confirmed.auth] ADMIN_VERIFIED", {
      callerId: auth.caller.id,
    });

    const body = await req.json().catch(() => ({}));
    const reservationId = (body?.reservationId || "")
      .toString()
      .trim();

    if (!reservationId) {
      console.error("[mail.payment_confirmed] BAD_REQUEST", {
        reason: "reservationId zorunlu",
      });
      return NextResponse.json(
        { ok: false, error: "reservationId zorunlu" },
        { status: 400 }
      );
    }

    // FAZ 36: DB I/O reservationServerRepository.findByIdForPaymentConfirmedMail
    // üzerinden delege. SELECT shape (`payment_link_status` dahil;
    // duplicate protection guard'ı için kritik) + .maybeSingle()
    // resolver repo içinde aynen.
    const { data: rRaw, error: fetchErr } =
      await reservationServerRepository.findByIdForPaymentConfirmedMail(
        reservationId
      );

    if (fetchErr || !rRaw) {
      console.error("[mail.payment_confirmed] NOT_FOUND", {
        reservationId,
        error: fetchErr?.message,
      });
      return NextResponse.json(
        { ok: false, error: "Rezervasyon bulunamadı" },
        { status: 404 }
      );
    }

    const r = rRaw as unknown as ReservationRow;

    const paid = Number(r.paid_amount) || 0;
    if (paid <= 0) {
      console.error("[mail.payment_confirmed] NO_PAID_AMOUNT", {
        reservationId,
        paid,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Önce alınan tutarı kaydet (paid_amount > 0)",
        },
        { status: 422 }
      );
    }

    const currentStatus = normalizePaymentLinkStatus(
      r.payment_link_status
    );
    if (currentStatus === "paid") {
      console.warn("[mail.payment_confirmed] ALREADY_PAID", {
        reservationId,
      });
      return NextResponse.json(
        { ok: false, error: "Ödeme zaten onaylanmış" },
        { status: 422 }
      );
    }

    const recipient = (r.email || "").trim();
    if (!recipient) {
      console.error("[mail.payment_confirmed] MISSING_EMAIL", {
        reservationId,
      });
      return NextResponse.json(
        { ok: false, error: "Müşteri e-posta adresi yok" },
        { status: 422 }
      );
    }

    const cfg = await getMailConfig();
    const brand = cfg.fromName || "Maki Dijital";

    const payment = getPaymentDisplayValues({
      total_price_try: r.total_price_try,
      total_price: r.total_price,
      prepayment_amount: r.prepayment_amount,
      paid_amount: r.paid_amount,
      payment_preference: r.payment_preference,
    });

    const villaTitle = (r.villa?.title || "").trim() || "Villa";

    const { subject, html } = renderPaymentConfirmedEmail({
      brandName: brand,
      brandLogoUrl: cfg.brandLogoUrl,
      villaTitle,
      startDate: formatDateTr(r.start_date),
      endDate: formatDateTr(r.end_date),
      nights: nightsBetween(r.start_date, r.end_date),
      guestName: r.name || "Misafir",

      totalDisplay: formatTRY(payment.totalTRY),
      paidDisplay: formatTRY(payment.paidTRY),
      remainingDisplay: formatTRY(payment.remainingFromPaid),

      damageDepositDisplay: shouldDisplayDamageDeposit(r.damage_deposit)
        ? formatDamageDepositTRY(r.damage_deposit)
        : null,
    });

    const result = await sendMail({
      to: recipient,
      subject,
      html,
      mailType: "payment_confirmed",
      reservationId: r.id,
    });

    if (!result.ok) {
      console.error("[mail.payment_confirmed] SEND_FAILED", {
        reservationId,
        recipient,
        error: result.error,
      });
      return NextResponse.json(
        { ok: false, error: result.error || "Gönderilemedi" },
        { status: 502 }
      );
    }

    /* 🛡️ ADMIN BİLDİRİM KOPYASI — reservation-request paterni birebir.
       Müşteriyle AYNI body (`html`), yalnız subject farklı:
       "Ödemeniz alındı" → "Ödemeyi onayladınız". Müşteri maili
       (yukarıda) AYNEN gönderildi; bu EK gönderim BEST-EFFORT —
       müşteri response'unu ve aşağıdaki status update'i ETKİLEMEZ.
       Ayrı mailType → müşteri mail_logs satırı değişmez.
       Şablon / diğer route'lar DOKUNULMADI. */
    /* Alıcı YALNIZ env'den; tanımsız/boşsa admin kopyası atlanır
       (sabit/eski bir adrese fallback YOK). */
    const adminNotifyTo = (process.env.MAIL_ADMIN_NOTIFY_TO || "").trim();
    if (adminNotifyTo) {
      const adminSubject = subject.replace(
        "Ödemeniz alındı",
        "Ödemeyi onayladınız"
      );
      try {
        const adminResult = await sendMail({
          to: adminNotifyTo,
          subject: adminSubject,
          html,
          mailType: "payment_confirmed_admin",
          reservationId: r.id,
        });
        if (!adminResult.ok) {
          console.error(
            "[mail.payment_confirmed.admin] FAILED",
            adminResult.error
          );
        }
      } catch (adminErr) {
        console.error(
          "[mail.payment_confirmed.admin] EXCEPTION",
          adminErr instanceof Error ? adminErr.message : adminErr
        );
      }
    } else {
      console.warn("[mail.payment_confirmed.admin] SKIPPED — MAIL_ADMIN_NOTIFY_TO tanımsız");
    }

    // 🔥 STATUS UPDATE — payment_link_status = "paid"
    // FAZ 36: DB I/O reservationServerRepository.updateById üzerinden
    // delege. Payload `{ payment_link_status: "paid" }` aynen;
    // `payment_link_sent_at` payload'a EKLENMEZ (payment-link
    // route'tan farklı — orijinal asimetri korunur).
    const { error: updateErr } = await reservationServerRepository.updateById(
      r.id,
      { payment_link_status: "paid" }
    );

    if (updateErr) {
      console.error(
        "[mail.payment_confirmed] STATUS_UPDATE_FAILED",
        {
          reservationId,
          error: updateErr.message,
        }
      );
      return NextResponse.json(
        {
          ok: true,
          warning: "Mail gönderildi ancak status güncellenemedi",
          id: result.id,
          recipient,
        },
        { status: 200 }
      );
    }

    console.info("[mail.payment_confirmed] CONFIRMED", {
      reservationId,
      recipient,
      mailId: result.id,
    });

    /* FAZ 42: AUDIT (fire-forget). Route'tan caller.id explicit
       geçer (Bearer auth doğrulanmış). */
    void adminGateway.audit("payment.confirmed", {
      context: {
        adminUserId: auth.caller.id,
        ip: req.headers.get("x-forwarded-for"),
        userAgent: req.headers.get("user-agent"),
      },
      entityType: "reservation",
      entityId: reservationId,
      after: { payment_link_status: "paid" },
      metadata: {
        source: "/api/mail/payment-confirmed",
        paidAmount: paid,
        mailId: result.id,
      },
    });

    return NextResponse.json({
      ok: true,
      id: result.id,
      recipient,
      payment_link_status: "paid",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[mail.payment_confirmed] EXCEPTION", {
      error: message,
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
