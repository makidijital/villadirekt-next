import { getPaymentDisplayValues } from "@/lib/payment.helper";
import { normalizePaymentPreference } from "@/lib/payment.helper";

import type { ReservationDetailData } from "../_types/reservation-form-data";
import { resolveManualPrepayment } from "./manualPrepayment";

/* ===============================================================
   🛡️ TUR 3 — saveAll extraction helper (pure, zero behavior change)
   ===============================================================
   🔥 CUSTOM PRICE KAYIT payload — saveAll içinde inline yazılıydı
   (orijinal line 1232-1311). Multi-currency YOK; tüm financial
   snapshot manuel total üzerinden kurulur. remaining_payment =
   total - paid_amount. paid_amount KORUNUR.

   Bu helper SAF: input alır, payload object literal döner.
   updateReservationFull çağrısı, audit log, mail dispatch, toast,
   reload — TÜMÜ saveAll'da (orchestrator). Logic byte-identical.

   ⚠️ ÖNEMLİ:
     - Field sırası ve isimleri AYNI (DB write byte-equivalent).
     - normalizePaymentPreference helper aynen kullanılır.
     - payment_link trim/null coercion aynen.
     - getPaymentDisplayValues çağrısı aynı snapshot input ile.
     - guest_names trim+filter pattern aynı.
=============================================================== */

export type ReservationUpdatePayloadShape = {
  villa_id: string;
  name: string;
  phone: string;
  phone2?: string | null;
  email: string | null;
  identity_number: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  start_date: string;
  end_date: string;
  total_price: number;
  total_price_try: number;
  original_price: number;
  original_currency: string;
  original_cleaning_fee: number;
  original_cleaning_currency: string;
  cleaning_fee_try: number;
  exchange_rate: number;
  // 🔥 HAVUZ ISITMA — 8. adım (admin edit doğruluk düzeltmesi).
  pool_heating_selected: boolean;
  original_pool_heating_total: number;
  original_pool_heating_currency: string;
  pool_heating_total_try: number;
  prepayment_amount: number;
  remaining_payment: number;
  paid_amount: number;
  custom_price: boolean;
  custom_price_note: string | null;
  payment_preference: "prepayment" | "full_payment";
  payment_link: string | null;
  guests: number | null;
  guest_names: string[];
  note: string | null;
  status: ReservationDetailData["status"];
  payment_method_id: string | null;
};

export function buildCustomPricePayload(input: {
  data: ReservationDetailData;
  guestNames: string[];
  prepaymentRate: number;
}): ReservationUpdatePayloadShape {
  const { data, guestNames, prepaymentRate } = input;

  const customTotal =
    Number(data.total_price_try) || Number(data.total_price) || 0;

  const customPaid = Number(data.paid_amount) || 0;

  // 🔥 DB SNAPSHOT — payment_preference dinamik (helper)
  //   full_payment  → prepayment_amount=total, remaining_payment=0
  //   prepayment    → prepayment_amount=raw,   remaining_payment=total−raw
  // paid_amount tamamen ayrı kolonda, accounting tarafı korunuyor.
  // 🛡️ Admin "Şimdi Ödenecek Tutar" manuel değeri (geçerliyse) korunur;
  // yoksa mevcut otomatik hesap AYNEN (bkz. ./manualPrepayment).
  const customRawPrepayment =
    resolveManualPrepayment(data, customTotal) ??
    Math.round((customTotal * prepaymentRate) / 100);
  const customWritePayment = getPaymentDisplayValues({
    total_price_try: customTotal,
    prepayment_amount: customRawPrepayment,
    payment_preference: data.payment_preference,
  });
  const customPrepayment = customWritePayment.payNow;
  const customRemaining = customWritePayment.remainingOnArrival;

  return {
    // 🔥 VILLA persist
    villa_id: data.villa_id,

    name: data.name,
    phone: data.phone,
    phone2: data.phone2 || null,
    email: data.email,
    identity_number: data.identity_number,
    country: data.country,
    city: data.city,
    address: data.address,
    start_date: data.start_date,
    end_date: data.end_date,

    // CUSTOM SNAPSHOT
    total_price: customTotal,
    total_price_try: customTotal,

    original_price: 0,
    original_currency: "TRY",
    original_cleaning_fee: 0,
    original_cleaning_currency: "TRY",
    cleaning_fee_try: 0,
    exchange_rate: 1,

    // 🔥 HAVUZ ISITMA — 8. adım. Custom price = tek düz TRY tutar,
    // itemization yok; cleaning-fee nötrleme deseninin aynısı. Bu
    // kayıt eski sağlayıcı partial-update semantiğinde DB'ye kalıcı yazılır
    // (computeCustomPriceToggle TOGGLE ON'daki local state nötrlemesini
    // save anında persist eder).
    pool_heating_selected: false,
    original_pool_heating_total: 0,
    original_pool_heating_currency: "TRY",
    pool_heating_total_try: 0,

    // FINANCIAL SNAPSHOT
    prepayment_amount: customPrepayment,
    remaining_payment: customRemaining,
    paid_amount: customPaid,

    // CUSTOM FLAGS
    custom_price: true,
    custom_price_note: data.custom_price_note || null,

    // 🔥 PAYMENT PREFERENCE
    payment_preference: normalizePaymentPreference(data.payment_preference),

    // 🔥 PAYMENT LINK (sadece input değeri persist edilir;
    //    status / sent_at sadece mail dispatch flow'unda set olur)
    payment_link: (data.payment_link || "").toString().trim() || null,

    guests: data.guests,
    // 🔥 Diğer misafirlerin isimleri (boşlar filtrelenir)
    guest_names: guestNames.map((s) => s.trim()).filter((s) => s.length > 0),
    note: data.note,
    // 🔥 status DB'ye yazılır; transition durumunda
    //    payment-confirmed route ek olarak payment_link_status
    //    güncellemesi yapar ve dispatchStatusChangeMail
    //    approved mail'i tetikler.
    status: data.status,
    payment_method_id: data.payment_method_id || null,
  };
}
