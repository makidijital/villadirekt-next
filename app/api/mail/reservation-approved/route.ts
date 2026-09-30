import { NextResponse } from "next/server";
import { reservationServerRepository } from "@/lib/db/reservation.repository.server";
import { applyRateLimit } from "@/lib/rate-limit";
import { sendMail } from "@/app/lib/mail/send";
import { renderReservationApprovedEmail } from "@/app/lib/mail/templates/ReservationApprovedEmail";
import { getMailConfig } from "@/app/lib/mail/client";
import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";

import {
  getPaymentDisplayValues,
  paymentPreferenceLabel,
  shouldDisplayPayNow,
} from "@/lib/payment.helper";

import {
  shouldDisplayDamageDeposit,
  formatDamageDepositTRY,
} from "@/lib/damage-deposit.helper";

import { formatTRY, formatMoney } from "@/lib/format";
import {
  formatDateTr,
  formatDateTimeTr,
  nightsBetween,
} from "@/lib/date-format";


/* ===============================================================
   🔥 POST /api/mail/reservation-approved
   ===============================================================
   Body: { reservationId: string }
   Auth: Authorization: Bearer <admin access_token> ZORUNLU
   - Reservation snapshot okuma (canlı kur/fiyat YOK)
   - ReservationApprovedEmail render → sendMail
   - mail_logs.mail_type = "reservation_approved"
   =============================================================== */

/* CURRENCY_SYMBOL map / formatMoney / formatTRY / formatDateTr /
   formatDateTimeTr / nightsBetween → lib/format + lib/date-format
   (önceden inline tanımlıydı, davranış birebir aynı). */

export async function POST(req: Request) {
  /* Rate limit: 5 req/dakika/IP — mail spam koruması. */
  const limited = await applyRateLimit(req, "mail");
  if (limited) return limited;

  console.log("[mail.reservation_approved] POST");

  try {
    /* ---------- ADMIN AUTH ---------- */
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      console.error("[mail.reservation_approved.auth] UNAUTHORIZED", {
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
    console.info("[mail.reservation_approved.auth] ADMIN_VERIFIED", {
      callerId: auth.caller.id,
    });

    const body = await req.json().catch(() => ({}));
    const reservationId = (body?.reservationId || "").toString().trim();

    if (!reservationId) {
      return NextResponse.json(
        { ok: false, error: "reservationId zorunlu" },
        { status: 400 }
      );
    }

    const { data: r, error: fetchErr } =
      await reservationServerRepository.findByIdForRequestMail(reservationId);

    if (fetchErr || !r) {
      console.error(
        "[mail.reservation_approved] reservation not found",
        fetchErr?.message
      );
      return NextResponse.json(
        { ok: false, error: "Rezervasyon bulunamadı" },
        { status: 404 }
      );
    }

    const recipient = (r.email || "").trim();
    if (!recipient) {
      return NextResponse.json(
        { ok: false, error: "Müşteri e-posta adresi yok" },
        { status: 422 }
      );
    }

    const cfg = await getMailConfig();
    const brand = cfg.fromName || "Maki Dijital";

    const originalCurrency = (r.original_currency || "TRY") as string;
    const totalTRY = Number(r.total_price_try) || Number(r.total_price) || 0;
    const isForeign =
      originalCurrency !== "TRY" && Number(r.original_price) > 0;

    const totalDisplay = isForeign
      ? formatMoney(Number(r.original_price) || 0, originalCurrency)
      : formatTRY(totalTRY);
    const totalTryDisplay = isForeign ? formatTRY(totalTRY) : null;

    // 🔥 PAYMENT DISPLAY — payment_preference dinamik
    // (tek helper, hem payNow hem remainingOnArrival burada türetilir)
    const payment = getPaymentDisplayValues(r as any);
    const paymentPreferenceLbl = paymentPreferenceLabel(
      r.payment_preference
    );

    const paidDisplay =
      Number(r.paid_amount) > 0 ? formatTRY(Number(r.paid_amount)) : null;

    // 🔥 Müşteri-facing "Kalan" → helper.remainingOnArrival
    // (full_payment → ₺0, prepayment → total−prepayment).
    // DB'deki remaining_payment SNAPSHOT'ı bozulmuyor; sadece display.
    const remainingDisplay = formatTRY(payment.remainingFromPaid);

    const paymentMethodName: string | null =
      ((r as any)?.payment_method?.name || "").trim() || null;

    const villaTitle =
      ((r as any)?.villa?.title || "").trim() || "Villa";

    const guestNames = Array.isArray(r.guest_names)
      ? (r.guest_names as string[])
      : [];
    // 🔥 Confirmed rezervasyonda "Şimdi Ödenecek" satırı gizlenir
    //    (approved mail için pratikte her zaman gizli olur).
    const payNowDisplay = shouldDisplayPayNow(r.status)
      ? formatTRY(payment.payNow)
      : null;


    const { subject, html } = renderReservationApprovedEmail({
      brandName: brand,
      brandLogoUrl: cfg.brandLogoUrl,

      createdAtDisplay: formatDateTimeTr(r.created_at),
      status: (r.status || "confirmed") as string,
      villaTitle,
      reservationNo:
        ((r as { reservation_no?: string | null })?.reservation_no || null),

      startDate: formatDateTr(r.start_date),
      endDate: formatDateTr(r.end_date),
      nights: nightsBetween(r.start_date, r.end_date),
      guestsTotal: Number(r.guests) || 1,

      totalDisplay,
      totalTryDisplay,
      paidDisplay,
      remainingDisplay,
      paymentMethodName,

      paymentPreferenceLabel: paymentPreferenceLbl,
      payNowDisplay,

      damageDepositDisplay: shouldDisplayDamageDeposit(
        (r as { damage_deposit?: number | null }).damage_deposit
      )
        ? formatDamageDepositTRY(
            (r as { damage_deposit?: number | null }).damage_deposit
          )
        : null,

      guestName: r.name || "Misafir",
      identityNumber: r.identity_number || null,
      phone: r.phone || null,
      phone2: r.phone2 || null,
      email: r.email || null,
      country: r.country || null,
      city: r.city || null,
      address: r.address || null,
      otherGuestNames: guestNames,
      note: r.note || null,
    });

    const result = await sendMail({
      to: recipient,
      subject,
      html,
      mailType: "reservation_approved",
      reservationId: r.id,
    });

    if (!result.ok) {
      console.error(
        "[mail.reservation_approved] FAILED",
        result.error
      );
      return NextResponse.json(
        { ok: false, error: result.error || "Gönderilemedi" },
        { status: 502 }
      );
    }

    /* 🛡️ ADMIN BİLDİRİM KOPYASI — reservation-request paterni birebir.
       Müşteriyle AYNI body (`html`), yalnız subject farklı:
       "Rezervasyonunuz onaylandı" → "Rezervasyonu onayladınız".
       Müşteri maili (yukarıda) AYNEN gönderildi; bu EK gönderim
       BEST-EFFORT — müşteri response'unu etkilemez. Ayrı mailType →
       müşteri mail_logs satırı değişmez. Şablon/diğer route DOKUNULMADI. */
    /* Alıcı YALNIZ env'den; tanımsız/boşsa admin kopyası atlanır
       (sabit/eski bir adrese fallback YOK). */
    const adminNotifyTo = (process.env.MAIL_ADMIN_NOTIFY_TO || "").trim();
    if (adminNotifyTo) {
      const adminSubject = subject.replace(
        "Rezervasyonunuz onaylandı",
        "Rezervasyonu onayladınız"
      );
      try {
        const adminResult = await sendMail({
          to: adminNotifyTo,
          subject: adminSubject,
          html,
          mailType: "reservation_approved_admin",
          reservationId: r.id,
        });
        if (!adminResult.ok) {
          console.error(
            "[mail.reservation_approved.admin] FAILED",
            adminResult.error
          );
        }
      } catch (adminErr) {
        console.error(
          "[mail.reservation_approved.admin] EXCEPTION",
          adminErr instanceof Error ? adminErr.message : adminErr
        );
      }
    } else {
      console.warn("[mail.reservation_approved.admin] SKIPPED — MAIL_ADMIN_NOTIFY_TO tanımsız");
    }

    console.log("[mail.reservation_approved] SENT", {
      id: result.id,
      recipient,
    });

    return NextResponse.json({
      ok: true,
      id: result.id,
      recipient,
    });
  } catch (err: any) {
    console.error(
      "[mail.reservation_approved] EXCEPTION",
      err?.message
    );
    return NextResponse.json(
      { ok: false, error: err?.message || "Bilinmeyen hata" },
      { status: 500 }
    );
  }
}
