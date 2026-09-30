import "server-only";

import { voucherRepository } from "@/lib/db/voucher.repository.server";
import { getMailConfig } from "@/app/lib/mail/client";
import { getSettings } from "@/app/services/settings.service";
import { resolveAssetUrlVersioned } from "@/lib/storage.helpers";

/* 🛡️ PHASE 3 (migration 040): voucher reservation snapshot'ı tam PII
   içerir (name/phone/email/identity/address/price). 040 admin-only RLS
   sonrası server-anon SELECT reddedilir. Bu dosya yalnız server route'
   larından (api/mail/voucher, api/voucher/[id]) çağrılır → veri erişimi
   voucherRepository (→ dbAdmin, service_role) + `import "server-only"`
   üzerinden güvenli. PII server'da kalır; voucher PDF'i zaten authorize
   edilmiş admin/erişim ile üretilir. (Phase 1 repo consolidation.) */
import {
  getPaymentDisplayValues,
  paymentPreferenceLabel,
} from "@/lib/payment.helper";

import {
  shouldDisplayDamageDeposit,
  formatDamageDepositTRY,
} from "@/lib/damage-deposit.helper";

import { formatTRY } from "@/lib/format";
import {
  formatDateTr,
  formatDateTimeTr,
  nightsBetween,
} from "@/lib/date-format";

/* ===============================================================
   🔥 VOUCHER DATA BUILDER — shared, helper-driven
   ===============================================================
   Tek source-of-truth normalize edilmiş voucher data'sı üretir.
   - Reservation snapshot (TRY-only customer-facing display)
   - payment_preference dinamik (getPaymentDisplayValues helper)
   - Confirmed status guard

   Bu modül sadece DATA üretir; HTML render'ı template.ts'de.
   ReservationApprovedEmail ve diğer mail flow'ları DOKUNULMAZ.
   =============================================================== */

export type VoucherProps = {
  brandName: string;
  /* 🔥 Firma logosu — settings.site_logo (Storage URL veya relative
     path; data layer resolveAssetUrl ile public URL'e çevirir).
     Yoksa null → template logo bloğunu HİÇ render etmez (placeholder
     avatar KULLANILMAZ; M markası kaldırıldı). */
  brandLogoUrl: string | null;

  voucherNo: string;
  createdAtDisplay: string;

  villaTitle: string;

  // 🔥 DAMAGE DEPOSIT — informational; accounting'e dahil değil
  damageDepositDisplay: string | null;

  // Stay
  startDate: string;
  endDate: string;
  nights: number;
  guestsTotal: number;

  // Customer
  guestName: string;
  identityNumber: string | null;
  phone: string | null;
  /** 🛡️ İkinci telefon — eski rezervasyonlarda null → satır basılmaz. */
  phone2: string | null;
  email: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  otherGuestNames: string[];
  note: string | null;

  // Payment (helper-driven, TRY-only)
  totalDisplay: string;
  paymentPreferenceLabel: string;
  payNowDisplay: string;
  paidDisplay: string | null;
  remainingDisplay: string;
  paymentMethodName: string | null;
};

export type VoucherDataResult =
  | {
      ok: true;
      props: VoucherProps;
      recipient: string | null;
      villaTitle: string;
    }
  | { ok: false; error: string; status: number };

/* formatTRY / formatDateTr / formatDateTimeTr / nightsBetween →
   lib/format + lib/date-format (önceden inline tanımlıydı,
   davranış birebir aynı). */

function buildVoucherNo(
  reservationNo: string | null | undefined,
  id: string
): string {
  // Rezervasyon Belgesi kodu:
  //   - Birinci tercih: DB-üretilen reservation_no (REZ-2026-NNNN)
  //   - Eski kayıtlarda NULL ise: id-tabanlı fallback ("RB-XXXX...")
  const fromDb = (reservationNo || "").toString().trim();
  if (fromDb) return fromDb;

  const cleaned = (id || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  const tail = cleaned.slice(-8) || "REZERVASYON";
  return `RB-${tail}`;
}

type VoucherReservationRow = {
  id: string;
  reservation_no: string | null;
  damage_deposit: number | null;
  name: string | null;
  phone: string | null;
  /** 🛡️ İkinci telefon — eski rezervasyonlarda null → satır basılmaz. */
  phone2: string | null;
  email: string | null;
  identity_number: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  guests: number | null;
  guest_names: string[] | null;
  note: string | null;
  status: string | null;
  created_at: string | null;
  start_date: string | null;
  end_date: string | null;
  total_price: number | null;
  total_price_try: number | null;
  paid_amount: number | null;
  prepayment_amount: number | null;
  remaining_payment: number | null;
  payment_preference: string | null;
  villa: { title: string | null } | null;
  payment_method: { name: string | null } | null;
};

export async function buildVoucherData(
  reservationId: string
): Promise<VoucherDataResult> {
  if (!reservationId) {
    return {
      ok: false,
      error: "reservationId zorunlu",
      status: 400,
    };
  }

  const { data: rRaw, error: fetchErr } =
    await voucherRepository.findReservationById(reservationId);

  if (fetchErr || !rRaw) {
    console.error("[voucher.data] NOT_FOUND", {
      reservationId,
      error: fetchErr?.message,
    });
    return {
      ok: false,
      error: "Rezervasyon bulunamadı",
      status: 404,
    };
  }

  // 🔥 Voucher yalnız confirmed rezervasyonlar için
  const status = (rRaw.status || "").toString().toLowerCase().trim();
  if (status !== "confirmed") {
    console.warn("[voucher.data] NOT_CONFIRMED", {
      reservationId,
      status: rRaw.status,
    });
    return {
      ok: false,
      error:
        "Rezervasyon Belgesi yalnızca onaylanmış rezervasyonlar için oluşturulabilir",
      status: 422,
    };
  }

  const r = rRaw as unknown as VoucherReservationRow;

  const cfg = await getMailConfig();
  const brand = cfg.fromName || "Maki Dijital";

  /* 🔥 Firma logosu — settings.site_logo (Header/Footer ile AYNI
     kaynak). resolveAssetUrl HEM FULL URL (legacy) HEM relative path
     (yeni) destekler; yoksa null → template logo render etmez,
     placeholder/M avatarı GÖSTERİLMEZ. */
  let brandLogoUrl: string | null = null;
  try {
    const settings = await getSettings();
    /* 🛡️ `?v=settings.updated_at` — Header/Footer ile AYNI versiyon. */
    brandLogoUrl =
      resolveAssetUrlVersioned(settings?.site_logo, settings?.updated_at) ||
      null;
  } catch {
    brandLogoUrl = null;
  }

  const totalTRY =
    Number(r.total_price_try) || Number(r.total_price) || 0;

  // 🔥 TEK source-of-truth — getPaymentDisplayValues
  const payment = getPaymentDisplayValues({
    total_price_try: r.total_price_try,
    total_price: r.total_price,
    prepayment_amount: r.prepayment_amount,
    paid_amount: r.paid_amount,
    payment_preference: r.payment_preference,
  });

  const villaTitle = (r.villa?.title || "").trim() || "Villa";
  const guestNames = Array.isArray(r.guest_names) ? r.guest_names : [];

  const props: VoucherProps = {
    brandName: brand,
    brandLogoUrl,

    voucherNo: buildVoucherNo(r.reservation_no, r.id),
    createdAtDisplay: formatDateTimeTr(r.created_at),

    villaTitle,

    damageDepositDisplay: shouldDisplayDamageDeposit(r.damage_deposit)
      ? formatDamageDepositTRY(r.damage_deposit)
      : null,

    startDate: formatDateTr(r.start_date),
    endDate: formatDateTr(r.end_date),
    nights: nightsBetween(r.start_date, r.end_date),
    guestsTotal: Number(r.guests) || 1,

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

    // TRY-only customer-facing
    totalDisplay: formatTRY(totalTRY),
    paymentPreferenceLabel: paymentPreferenceLabel(
      r.payment_preference
    ),
    payNowDisplay: formatTRY(payment.payNow),
    paidDisplay:
      Number(r.paid_amount) > 0
        ? formatTRY(Number(r.paid_amount))
        : null,
    remainingDisplay: formatTRY(payment.remainingFromPaid),
    paymentMethodName:
      (r.payment_method?.name || "").trim() || null,
  };

  return {
    ok: true,
    props,
    recipient: (r.email || "").trim() || null,
    villaTitle,
  };
}
