import { NextResponse } from "next/server";
import { reservationServerRepository } from "@/lib/db/reservation.repository.server";
import { applyRateLimit } from "@/lib/rate-limit";
import { sendMail } from "@/app/lib/mail/send";
import { renderPaymentLinkEmail } from "@/app/lib/mail/templates/PaymentLinkEmail";
import { getMailConfig } from "@/app/lib/mail/client";
import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";

import {
  getPaymentDisplayValues,
  paymentPreferenceLabel,
} from "@/lib/payment.helper";

import {
  shouldDisplayDamageDeposit,
  formatDamageDepositTRY,
} from "@/lib/damage-deposit.helper";

import { formatTRY } from "@/lib/format";
import { formatDateTr, nightsBetween } from "@/lib/date-format";

/* ===============================================================
   🔥 POST /api/mail/payment-link
   ===============================================================
   Body: { reservationId: string }
   Auth: Authorization: Bearer <admin access_token> ZORUNLU

   Akış:
     0. authorizeAdminCaller(req) — admin doğrula (active)
     1. Reservation snapshot fetch (canlı kur/fiyat YOK)
     2. payment_link doğrulanır (boş olamaz)
     3. PaymentLinkEmail render → sendMail
     4. Mail başarılıysa:
          payment_link_status = "sent"
          payment_link_sent_at = now()
        DB update edilir.
     5. Structured logging — silent fail YOK.

   Mevcut mail sistemi bozulmaz (request/approved/cancelled
   route'larıyla simetrik yapı).
   =============================================================== */

/* formatTRY / formatDateTr / nightsBetween → lib/format + lib/date-format
   (önceden inline tanımlıydı, davranış birebir aynı). */

type PaymentLinkReservationRow = {
  id: string;
  reservation_no: string | null;
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
  payment_link: string | null;
  villa: { title: string | null } | null;
};

export async function POST(req: Request) {
  /* Rate limit: 5 req/dakika/IP — mail spam koruması. */
  const limited = await applyRateLimit(req, "mail");
  if (limited) return limited;

  console.log("[mail.payment_link] POST");

  try {
    /* ---------- ADMIN AUTH ---------- */
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      console.error("[mail.payment_link.auth] UNAUTHORIZED", {
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
    console.info("[mail.payment_link.auth] ADMIN_VERIFIED", {
      callerId: auth.caller.id,
    });

    const body = await req.json().catch(() => ({}));
    const reservationId = (body?.reservationId || "")
      .toString()
      .trim();

    if (!reservationId) {
      console.error("[mail.payment_link] BAD_REQUEST", {
        reason: "reservationId zorunlu",
      });
      return NextResponse.json(
        { ok: false, error: "reservationId zorunlu" },
        { status: 400 }
      );
    }

    // 🔥 Reservation snapshot fetch — minimal alan
    // FAZ 36: DB I/O reservationServerRepository.findByIdForPaymentLinkMail
    // üzerinden delege. SELECT shape + .maybeSingle() resolver
    // repo içinde AYNEN; route'ta if (fetchErr || !rRaw) → 404
    // branch davranışı byte-identical.
    const { data: rRaw, error: fetchErr } =
      await reservationServerRepository.findByIdForPaymentLinkMail(reservationId);

    if (fetchErr || !rRaw) {
      console.error("[mail.payment_link] NOT_FOUND", {
        reservationId,
        error: fetchErr?.message,
      });
      return NextResponse.json(
        { ok: false, error: "Rezervasyon bulunamadı" },
        { status: 404 }
      );
    }

    const r = rRaw as unknown as PaymentLinkReservationRow;

    // 🔥 payment_link validation
    const paymentLink = (r.payment_link || "").trim();
    if (!paymentLink) {
      console.error("[mail.payment_link] MISSING_LINK", {
        reservationId,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Ödeme linki boş — önce link kaydet",
        },
        { status: 422 }
      );
    }

    const recipient = (r.email || "").trim();
    if (!recipient) {
      console.error("[mail.payment_link] MISSING_EMAIL", {
        reservationId,
      });
      return NextResponse.json(
        { ok: false, error: "Müşteri e-posta adresi yok" },
        { status: 422 }
      );
    }

    const cfg = await getMailConfig();
    const brand = cfg.fromName || "Maki Dijital";

    // 🔥 Helper'dan beslenen değerler — tek source-of-truth
    const payment = getPaymentDisplayValues({
      total_price_try: r.total_price_try,
      total_price: r.total_price,
      prepayment_amount: r.prepayment_amount,
      paid_amount: r.paid_amount,
      payment_preference: r.payment_preference,
    });

    const villaTitle =
      (r.villa?.title || "").trim() || "Villa";

    const { subject, html } = renderPaymentLinkEmail({
      brandName: brand,
      brandLogoUrl: cfg.brandLogoUrl,

      villaTitle,
      reservationNo: r.reservation_no || null,

      startDate: formatDateTr(r.start_date),
      endDate: formatDateTr(r.end_date),
      nights: nightsBetween(r.start_date, r.end_date),

      guestName: r.name || "Misafir",

      paymentPreferenceLabel: paymentPreferenceLabel(
        r.payment_preference
      ),
      isFullPayment: payment.isFullPayment,
      payNowDisplay: formatTRY(payment.payNow),

      damageDepositDisplay: shouldDisplayDamageDeposit(r.damage_deposit)
        ? formatDamageDepositTRY(r.damage_deposit)
        : null,

      paymentLink,
    });

    const result = await sendMail({
      to: recipient,
      subject,
      html,
      mailType: "payment_link",
      reservationId: r.id,
    });

    if (!result.ok) {
      console.error("[mail.payment_link] SEND_FAILED", {
        reservationId,
        recipient,
        error: result.error,
      });
      return NextResponse.json(
        { ok: false, error: result.error || "Gönderilemedi" },
        { status: 502 }
      );
    }

    /* ---------------------------------------------
       🔥 STATUS UPDATE — sadece mail başarılıysa
         payment_link_status = "sent"
         payment_link_sent_at = now()
       Update fail olsa bile mail gönderilmiş oluyor;
       structured log bırakılır.
    ---------------------------------------------- */
    const sentAt = new Date().toISOString();
    // FAZ 36: DB I/O reservationServerRepository.updateById üzerinden
    // delege. Payload shape + alan sırası ({ payment_link_status,
    // payment_link_sent_at }) repo'ya inline geçer; predicate
    // (.eq("id", r.id)) repo içinde aynen.
    const { error: updateErr } = await reservationServerRepository.updateById(
      r.id,
      {
        payment_link_status: "sent",
        payment_link_sent_at: sentAt,
      }
    );

    if (updateErr) {
      console.error("[mail.payment_link] STATUS_UPDATE_FAILED", {
        reservationId,
        error: updateErr.message,
      });
      // Mail gitti, status güncellenmedi → caller bilsin
      return NextResponse.json(
        {
          ok: true,
          warning: "Mail gönderildi ancak status güncellenemedi",
          id: result.id,
          recipient,
          sentAt,
        },
        { status: 200 }
      );
    }

    console.info("[mail.payment_link] SENT", {
      reservationId,
      recipient,
      mailId: result.id,
      sentAt,
    });

    return NextResponse.json({
      ok: true,
      id: result.id,
      recipient,
      sentAt,
      payment_link_status: "sent",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[mail.payment_link] EXCEPTION", { error: message });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
