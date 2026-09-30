import { NextResponse } from "next/server";
import { reservationServerRepository } from "@/lib/db/reservation.repository.server";
import { applyRateLimit } from "@/lib/rate-limit";
import { sendMail } from "@/app/lib/mail/send";
import { renderWesternUnionPaymentEmail } from "@/app/lib/mail/templates/WesternUnionPaymentEmail";
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

import { getActiveWesternUnionAccount } from "@/lib/western-union-account.server";

import {
  shouldDisplayDamageDeposit,
  formatDamageDepositTRY,
} from "@/lib/damage-deposit.helper";

import { formatTRY } from "@/lib/format";
import { formatDateTr, nightsBetween } from "@/lib/date-format";

/* ===============================================================
   🔥 POST /api/mail/western-union-payment
   ===============================================================
   Body: { reservationId: string }
   Auth: Authorization: Bearer <admin access_token> ZORUNLU

   bank-transfer-payment route'unun WU karşılığı (simetrik):
     0. authorizeAdminCaller
     1. Reservation snapshot fetch (EFT route ile AYNI select reuse)
     2. Aktif WU kaydı çek; yoksa 422
     3. WesternUnionPaymentEmail render → sendMail
     4. Başarılıysa payment_link_status='sent', payment_link_sent_at=now()
     5. Structured logging.

   EFT/Havale akışına (bank-transfer route + payment_accounts) SIFIR
   temas — ayrı tablo + ayrı route + ayrı template.
   =============================================================== */

function buildReferenceCode(
  reservationNo: string | null | undefined,
  id: string
): string {
  const fromDb = (reservationNo || "").toString().trim();
  if (fromDb) return fromDb;
  const cleaned = (id || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const tail = cleaned.slice(-8) || "REZERVASYON";
  return `R-${tail}`;
}

type ReservationRow = {
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
  villa: { title: string | null } | null;
};

export async function POST(req: Request) {
  const limited = await applyRateLimit(req, "mail");
  if (limited) return limited;

  console.log("[mail.western_union_payment] POST");

  try {
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      console.error("[mail.western_union_payment.auth] UNAUTHORIZED", {
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

    const body = await req.json().catch(() => ({}));
    const reservationId = (body?.reservationId || "").toString().trim();

    if (!reservationId) {
      console.error("[mail.western_union_payment] BAD_REQUEST", {
        reason: "reservationId zorunlu",
      });
      return NextResponse.json(
        { ok: false, error: "reservationId zorunlu" },
        { status: 400 }
      );
    }

    const { data: rRaw, error: fetchErr } =
      await reservationServerRepository.findByIdForBankTransferMail(
        reservationId
      );

    if (fetchErr || !rRaw) {
      console.error("[mail.western_union_payment] NOT_FOUND", {
        reservationId,
        error: fetchErr?.message,
      });
      return NextResponse.json(
        { ok: false, error: "Rezervasyon bulunamadı" },
        { status: 404 }
      );
    }

    const r = rRaw as unknown as ReservationRow;

    const recipient = (r.email || "").trim();
    if (!recipient) {
      console.error("[mail.western_union_payment] MISSING_EMAIL", {
        reservationId,
      });
      return NextResponse.json(
        { ok: false, error: "Müşteri e-posta adresi yok" },
        { status: 422 }
      );
    }

    // 🔥 Aktif Western Union kaydı
    const wu = await getActiveWesternUnionAccount();
    if (!wu || !(wu.recipient_name || "").trim()) {
      console.error("[mail.western_union_payment] NO_ACTIVE_WU", {
        reservationId,
      });
      return NextResponse.json(
        {
          ok: false,
          error:
            "Aktif Western Union kaydı bulunamadı — Ödeme ayarlarından bir WU kaydını aktif yap",
        },
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

    const { subject, html } = renderWesternUnionPaymentEmail({
      brandName: brand,
      brandLogoUrl: cfg.brandLogoUrl,
      villaTitle,
      reservationNo: r.reservation_no || null,
      startDate: formatDateTr(r.start_date),
      endDate: formatDateTr(r.end_date),
      nights: nightsBetween(r.start_date, r.end_date),
      guestName: r.name || "Misafir",

      paymentPreferenceLabel: paymentPreferenceLabel(r.payment_preference),
      isFullPayment: payment.isFullPayment,
      payNowDisplay: formatTRY(payment.payNow),

      westernUnion: {
        recipientName: (wu.recipient_name || "").trim(),
        country: (wu.country || "").trim() || null,
        city: (wu.city || "").trim() || null,
        phone: (wu.phone || "").trim() || null,
        instructions: (wu.instructions || "").trim() || null,
      },

      referenceCode: buildReferenceCode(r.reservation_no, r.id),

      damageDepositDisplay: shouldDisplayDamageDeposit(r.damage_deposit)
        ? formatDamageDepositTRY(r.damage_deposit)
        : null,
    });

    const result = await sendMail({
      to: recipient,
      subject,
      html,
      mailType: "western_union_payment",
      reservationId: r.id,
    });

    if (!result.ok) {
      console.error("[mail.western_union_payment] SEND_FAILED", {
        reservationId,
        recipient,
        error: result.error,
      });
      return NextResponse.json(
        { ok: false, error: result.error || "Gönderilemedi" },
        { status: 502 }
      );
    }

    const sentAt = new Date().toISOString();
    const { error: updateErr } = await reservationServerRepository.updateById(
      r.id,
      {
        payment_link_status: "sent",
        payment_link_sent_at: sentAt,
      }
    );

    if (updateErr) {
      console.error("[mail.western_union_payment] STATUS_UPDATE_FAILED", {
        reservationId,
        error: updateErr.message,
      });
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

    console.info("[mail.western_union_payment] SENT", {
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
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[mail.western_union_payment] EXCEPTION", {
      error: message,
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
