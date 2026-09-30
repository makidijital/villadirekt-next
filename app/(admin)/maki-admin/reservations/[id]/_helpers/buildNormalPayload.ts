import {
  getPaymentDisplayValues,
  normalizePaymentPreference,
} from "@/lib/payment.helper";
import { accommodationBase } from "@/lib/price.engine";
import { resolveManualPrepayment } from "./manualPrepayment";

import type {
  ReservationDetailData,
  PriceDetailSnapshot,
} from "../_types/reservation-form-data";
import type { ReservationUpdatePayloadShape } from "./buildCustomPricePayload";

/* ===============================================================
   🛡️ TUR 3 — saveAll extraction helper (pure, zero behavior change)
   ===============================================================
   🔥 MULTI CURRENCY KAYIT payload — saveAll içinde inline yazılıydı
   (orijinal line 1395-1514). Admin TRY giriyor:
     total_price === total_price_try
   Snapshot alanları priceDetail / data'dan okunur. Eski TRY-only
   rezervasyonlar `original_currency: "TRY"` ile kayıtlı kalır →
   eski sistem bozulmaz.

   🔥 FINANCIAL SNAPSHOT — payment_preference dinamik
   Tek source-of-truth: getPaymentDisplayValues
     full_payment  → prepayment_amount=total, remaining_payment=0
     prepayment    → prepayment_amount=raw,   remaining_payment=total−raw
   paid_amount: ASLA resetlenmez; helper input'una geçiyor
                ama yalnız payment.paidTRY için; DB yazımı
                ayrı kolon, dokunulmuyor.
   Admin payment_preference değiştirip kaydedince snapshot'lar
   otomatik senkronlanır (UI ↔ DB tutarlı).

   ⚠️ Custom path ile NORMAL path bilinçli olarak duplicated. İlk
   decomposition turunda merge optimization YAPILMADI — sebep:
   pricing matematiği ve snapshot derivasyonu birbirinden farklı.
=============================================================== */

export function buildNormalPayload(input: {
  data: ReservationDetailData;
  guestNames: string[];
  priceDetail: PriceDetailSnapshot | null;
  prepaymentRate: number;
}): ReservationUpdatePayloadShape {
  const { data, guestNames, priceDetail, prepaymentRate } = input;

  const stayCurrency = data.original_currency || "TRY";
  const cleaningCurrency = data.original_cleaning_currency || "TRY";

  const isForeignStay = stayCurrency !== "TRY";
  const isForeignCleaning = cleaningCurrency !== "TRY";

  const totalTRY =
    Number(data.total_price_try) || Number(data.total_price) || 0;

  const cleaningTRY =
    Number(data.cleaning_fee_try) || Number(priceDetail?.cleaning) || 0;

  // 🔥 HAVUZ ISITMA — 8. adım. `data.pool_heating_total_try` DOĞRUDAN
  // okunur — bu alan computeReservationPriceRecalc / computeCustomPriceToggle
  // helper'ları tarafından `data` state'inde zaten güncel tutulur (aynı
  // `cleaning_fee_try` deseni: recalc sonucu `setData` merge'i ile senkron).
  const poolHeatingTRY = Number(data.pool_heating_total_try) || 0;

  const exchangeRate =
    isForeignStay || isForeignCleaning
      ? Number(data.exchange_rate) || 1
      : 1;

  // Ön ödeme havuz ısıtmayı İÇERMEZ: accommodationBase 3. parametre ile
  // havuz ısıtmayı da toplamdan düşer (total - cleaning - poolHeating).
  // 🛡️ Admin "Şimdi Ödenecek Tutar" manuel değeri (geçerliyse) korunur;
  // yoksa mevcut otomatik hesap AYNEN (bkz. ./manualPrepayment).
  const rawPrepayment =
    resolveManualPrepayment(data, totalTRY) ??
    Math.round(
      (accommodationBase(totalTRY, cleaningTRY, poolHeatingTRY) *
        prepaymentRate) /
        100
    );
  const writePayment = getPaymentDisplayValues({
    total_price_try: totalTRY,
    prepayment_amount: rawPrepayment,
    payment_preference: data.payment_preference,
  });
  const prepaymentAmount = writePayment.payNow;
  const remainingPayment = writePayment.remainingOnArrival;

  const paidAmount = Number(data.paid_amount) || 0;

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

    // 🔥 PARA — TRY snapshot
    total_price: totalTRY,
    total_price_try: totalTRY,

    // 🔥 KONAKLAMA snapshot
    original_price: isForeignStay ? Number(data.original_price) || 0 : 0,
    original_currency: isForeignStay ? stayCurrency : "TRY",

    // 🔥 TEMİZLİK snapshot
    original_cleaning_fee: isForeignCleaning
      ? Number(data.original_cleaning_fee) || 0
      : 0,
    original_cleaning_currency: isForeignCleaning ? cleaningCurrency : "TRY",

    cleaning_fee_try: cleaningTRY,

    // 🔥 HAVUZ ISITMA snapshot — 8. adım. `data.pool_heating_*` her
    // zaman doğrudan yazılır (always-write, cleaning_fee_try ile aynı
    // desen) — eski rezervasyonlarda bu alanlar undefined→0/false olur,
    // regresyon yok.
    pool_heating_selected: !!data.pool_heating_selected,
    original_pool_heating_total: Number(data.original_pool_heating_total) || 0,
    original_pool_heating_currency: data.original_pool_heating_currency || "TRY",
    pool_heating_total_try: poolHeatingTRY,

    // 🔥 KUR
    exchange_rate: exchangeRate,

    // 🔥 FINANCIAL SNAPSHOT
    prepayment_amount: prepaymentAmount,
    remaining_payment: remainingPayment,
    paid_amount: paidAmount,

    // 🔥 CUSTOM PRICE (normal flow → false)
    custom_price: false,
    custom_price_note: null,

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
