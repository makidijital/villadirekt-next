import { NextResponse } from "next/server";
import { reservationServerRepository } from "@/lib/db/reservation.repository.server";
import { applyRateLimit } from "@/lib/rate-limit";
import { sendMail } from "@/app/lib/mail/send";
import { renderBankTransferPaymentEmail } from "@/app/lib/mail/templates/BankTransferPaymentEmail";
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

/* 🛡️ getActivePaymentAccount payment-account.server.ts'e taşındı
   (server-only + service-role). Migration 034 RLS hardening sonrası
   anon SELECT sıfır → helper anon client kullanmıyor. Pure utility
   `paymentAccountDisplay` helper'da kalmaya devam. */
import { getActivePaymentAccount } from "@/lib/payment-account.server";
import { paymentAccountDisplay } from "@/lib/payment-account.helper";

import {
  shouldDisplayDamageDeposit,
  formatDamageDepositTRY,
} from "@/lib/damage-deposit.helper";

import { formatTRY } from "@/lib/format";
import { formatDateTr, nightsBetween } from "@/lib/date-format";

/* ===============================================================
   🔥 POST /api/mail/bank-transfer-payment
   ===============================================================
   Body: { reservationId: string }
   Auth: Authorization: Bearer <admin access_token> ZORUNLU

   Akış:
     0. authorizeAdminCaller(req) — admin doğrula (active)
     1. Reservation snapshot fetch (canlı kur/fiyat YOK)
     2. Aktif firma hesabı çek; yoksa 422
     3. BankTransferPaymentEmail render → sendMail
     4. Mail başarılıysa:
          payment_link_status = "sent"
          payment_link_sent_at = now()
        DB update edilir.
     5. Structured logging — silent fail YOK.

   Unified payment request flow'unun bank_transfer karşılığı.
   Credit card payment-link route'una davranış olarak simetrik.
   =============================================================== */

/* formatTRY / formatDateTr / nightsBetween → lib/format + lib/date-format
   (önceden inline tanımlıydı, davranış birebir aynı). */

/* ---------------------------------------------
   🔥 REFERENCE CODE
   - Birinci tercih: DB-üretilen reservation_no (REZ-2026-NNNN)
   - Eski kayıtlarda reservation_no NULL ise:
     reservation id'nin son 8 alfanümerik karakteri ile fallback
---------------------------------------------- */
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
  /* Rate limit: 5 req/dakika/IP — mail spam koruması. */
  const limited = await applyRateLimit(req, "mail");
  if (limited) return limited;

  console.log("[mail.bank_transfer_payment] POST");

  try {
    /* ---------- ADMIN AUTH ---------- */
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      console.error(
        "[mail.bank_transfer_payment.auth] UNAUTHORIZED",
        { status: auth.status, error: auth.error }
      );
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
    console.info(
      "[mail.bank_transfer_payment.auth] ADMIN_VERIFIED",
      { callerId: auth.caller.id }
    );

    const body = await req.json().catch(() => ({}));
    const reservationId = (body?.reservationId || "")
      .toString()
      .trim();

    if (!reservationId) {
      console.error(
        "[mail.bank_transfer_payment] BAD_REQUEST",
        { reason: "reservationId zorunlu" }
      );
      return NextResponse.json(
        { ok: false, error: "reservationId zorunlu" },
        { status: 400 }
      );
    }

    // FAZ 36: DB I/O reservationServerRepository.findByIdForBankTransferMail
    // üzerinden delege. SELECT shape (reservation_no dahil, buildReferenceCode
    // için kritik) + .maybeSingle() resolver repo içinde aynen.
    const { data: rRaw, error: fetchErr } =
      await reservationServerRepository.findByIdForBankTransferMail(reservationId);

    if (fetchErr || !rRaw) {
      console.error("[mail.bank_transfer_payment] NOT_FOUND", {
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
      console.error(
        "[mail.bank_transfer_payment] MISSING_EMAIL",
        { reservationId }
      );
      return NextResponse.json(
        { ok: false, error: "Müşteri e-posta adresi yok" },
        { status: 422 }
      );
    }

    // 🔥 Aktif firma hesabı
    const account = await getActivePaymentAccount();
    const accountDisplay = paymentAccountDisplay(account);
    if (!accountDisplay) {
      console.error(
        "[mail.bank_transfer_payment] NO_ACTIVE_ACCOUNT",
        { reservationId }
      );
      return NextResponse.json(
        {
          ok: false,
          error:
            "Aktif firma hesabı bulunamadı — Firma Hesap Bilgileri'nden bir hesabı aktif yap",
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

    const { subject, html } = renderBankTransferPaymentEmail({
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

      bankAccount: {
        bankName: accountDisplay.bankName,
        accountHolder: accountDisplay.accountHolder,
        ibanFormatted: accountDisplay.ibanFormatted,
        branchName: accountDisplay.branchName,
        branchCode: accountDisplay.branchCode,
        swiftCode: accountDisplay.swiftCode,
        currency: accountDisplay.currency,
      },

      // 🔥 EFT/Havale referans kodu — DB reservation_no'su öncelikli;
      // eski kayıtlarda fallback id-tabanlı koda düşer.
      referenceCode: buildReferenceCode(r.reservation_no, r.id),

      damageDepositDisplay: shouldDisplayDamageDeposit(r.damage_deposit)
        ? formatDamageDepositTRY(r.damage_deposit)
        : null,
    });

    const result = await sendMail({
      to: recipient,
      subject,
      html,
      mailType: "bank_transfer_payment",
      reservationId: r.id,
    });

    if (!result.ok) {
      console.error(
        "[mail.bank_transfer_payment] SEND_FAILED",
        {
          reservationId,
          recipient,
          error: result.error,
        }
      );
      return NextResponse.json(
        { ok: false, error: result.error || "Gönderilemedi" },
        { status: 502 }
      );
    }

    // 🔥 STATUS UPDATE — sadece mail başarılıysa
    // FAZ 36: DB I/O reservationServerRepository.updateById üzerinden
    // delege. Payload shape (payment-link route ile IDENTICAL —
    // status + sent_at) inline geçer; alan sırası AYNEN.
    const sentAt = new Date().toISOString();
    const { error: updateErr } = await reservationServerRepository.updateById(
      r.id,
      {
        payment_link_status: "sent",
        payment_link_sent_at: sentAt,
      }
    );

    if (updateErr) {
      console.error(
        "[mail.bank_transfer_payment] STATUS_UPDATE_FAILED",
        {
          reservationId,
          error: updateErr.message,
        }
      );
      return NextResponse.json(
        {
          ok: true,
          warning:
            "Mail gönderildi ancak status güncellenemedi",
          id: result.id,
          recipient,
          sentAt,
        },
        { status: 200 }
      );
    }

    console.info("[mail.bank_transfer_payment] SENT", {
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
    console.error("[mail.bank_transfer_payment] EXCEPTION", {
      error: message,
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
