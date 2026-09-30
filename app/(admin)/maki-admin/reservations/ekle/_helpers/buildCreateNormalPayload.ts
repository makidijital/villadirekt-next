import {
  getPaymentDisplayValues,
  normalizePaymentPreference,
} from "@/lib/payment.helper";
import { accommodationBase } from "@/lib/price.engine";

import type {
  ReservationCreateData,
  SelectedVillaCreate,
  PriceDetailSnapshot,
} from "../_types/reservation-create-data";
import type { ReservationCreatePayloadShape } from "./buildCreateCustomPricePayload";

/* ===============================================================
   🛡️ FAZ 3 — buildCreateNormalPayload (PURE)
   ===============================================================
   Eski page.tsx `handleCreate` içindeki **normal branch** INSERT
   payload inşası — birebir kopya. Multi-currency snapshot derivation
   + getPaymentDisplayValues + payload object literal aynen.

   ⚠️ KESIN KURAL: payload shape ve coercion BYTE-IDENTICAL.
   Alan sırası ve isimleri eski inline pattern'le aynı; DB write
   diff'i yok.

   DERİVATION KAYNAKLARI (create-specific):
     - stayCurrency / cleaningCurrency: priceDetail → data fallback
     - exchangeRate: rates[stayCurrency] (live) → data.exchange_rate
     - totalTRY: data.total_price_try → data.total_price → priceDetail.total
   Bu derivation [id]/_helpers/buildNormalPayload ile **farklı**:
     - Update: data snapshot okur (rates kullanmaz)
     - Create: live rates + priceDetail okur (snapshot oluşturur)

   FARK ([id] helper'ı ile):
     - INSERT semantic'i (UPDATE değil) — status literal "pending".
     - `paid_amount` yazılmaz (DB default 0).
     - `damage_deposit` snapshot (villa.deposit'tan).
   =============================================================== */

export type BuildCreateNormalPayloadInput = {
  data: ReservationCreateData;
  guestNames: string[];
  priceDetail: PriceDetailSnapshot | null;
  prepaymentRate: number;
  selectedVilla: SelectedVillaCreate;
  rates: Record<string, number>;
  /* startDate/endDate'i ISO string'e çevirme caller sorumluluğunda. */
  startISO: string;
  endISO: string;
};

export function buildCreateNormalPayload(
  input: BuildCreateNormalPayloadInput
): ReservationCreatePayloadShape {
  const {
    data,
    guestNames,
    priceDetail,
    prepaymentRate,
    selectedVilla,
    rates,
    startISO,
    endISO,
  } = input;

  /* ---------------------------------------------
     🔥 MULTI-CURRENCY SNAPSHOT — create derivation
     Eski TRY-only rezervasyonlar bozulmaz çünkü
     orijinal currency = TRY ise foreign alanlar 0/"TRY"
     olarak yazılır (NULL davranışı korunur).
  ---------------------------------------------- */
  const stayCurrency =
    priceDetail?.original_currency || data.original_currency || "TRY";

  const cleaningCurrency =
    priceDetail?.original_cleaning_currency ||
    data.original_cleaning_currency ||
    "TRY";

  const isForeignStay = stayCurrency !== "TRY";
  const isForeignCleaning = cleaningCurrency !== "TRY";

  const exchangeRate =
    isForeignStay
      ? Number(rates?.[stayCurrency]) || Number(data.exchange_rate) || 1
      : isForeignCleaning
        ? Number(rates?.[cleaningCurrency]) ||
        Number(data.exchange_rate) ||
        1
        : 1;

  const totalTRY =
    Number(data.total_price_try) ||
    Number(data.total_price) ||
    Number(priceDetail?.total) ||
    0;

  const cleaningTRY =
    Number(data.cleaning_fee_try) ||
    Number(priceDetail?.cleaning) ||
    0;

  /* 🔥 HAVUZ ISITMA — uçtan uca tamamlama turu. `data.pool_heating_total_try`
     doğrudan okunur — bu alan page'in price-calc effect'i tarafından
     `data` state'inde zaten güncel tutulur (cleaning_fee_try ile aynı desen). */
  const poolHeatingTRY =
    Number(data.pool_heating_total_try) ||
    Number(priceDetail?.poolHeating) ||
    0;

  /* ---------------------------------------------
     🔥 FINANCIAL SNAPSHOT — payment_preference dinamik
     Tek source-of-truth: getPaymentDisplayValues
       full_payment  → prepayment_amount=total, remaining_payment=0
       prepayment    → prepayment_amount=raw,   remaining_payment=total−raw
     paid_amount: 0 (ilk kayıtta; create page'de gönderilmiyor,
                     DB default kullanılıyor)
     Ön ödeme havuz ısıtmayı İÇERMEZ: accommodationBase 3. parametre
     ile havuz ısıtmayı da toplamdan düşer (total - cleaning - poolHeating).
  ---------------------------------------------- */
  const rawPrepayment = Math.round(
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

  return {
    name: data.name,
    phone: data.phone,
    phone2: data.phone2 || null,
    email: data.email,
    identity_number: data.identity_number,
    city: data.city,
    country: data.country,
    address: data.address,
    villa_id: data.villa_id,
    guests: data.guests,
    /* Diğer misafirlerin isimleri (boşlar filtrelenir). */
    guest_names: guestNames
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    note: data.note,
    /* Yeni rezervasyon her zaman "pending" — confirmed geçişi
       sadece detail page "Ödemeyi Onayla" akışıyla yapılır. */
    status: "pending",
    start_date: startISO,
    end_date: endISO,

    /* 🔥 ADMIN TRY giriyor */
    total_price: Number(data.total_price) || totalTRY,
    total_price_try: totalTRY,

    /* 🔥 KONAKLAMA SNAPSHOT */
    original_price: isForeignStay
      ? Number(priceDetail?.original_stay) ||
      Number(data.original_price) ||
      0
      : 0,
    original_currency: isForeignStay ? stayCurrency : "TRY",

    /* 🔥 TEMİZLİK SNAPSHOT */
    original_cleaning_fee: isForeignCleaning
      ? Number(priceDetail?.original_cleaning) ||
      Number(data.original_cleaning_fee) ||
      0
      : 0,
    original_cleaning_currency: isForeignCleaning ? cleaningCurrency : "TRY",

    cleaning_fee_try: cleaningTRY,

    /* 🔥 HAVUZ ISITMA SNAPSHOT — her zaman doğrudan yazılır (always-write,
       cleaning_fee_try ile aynı desen). Villa'da ücret yoksa/seçili
       değilse tüm alanlar 0/false olur — eski (havuz ısıtmasız)
       davranışla BYTE-IDENTICAL. */
    /* 🛡️ İNDİRİM SNAPSHOT — migration 080. PUBLIC akışla AYNI alanlar;
       değerler `buildStayDiscountSnapshot` (lib/price.engine.ts) ile
       sayfada üretilip `data`'ya yazıldı. Burada yalnız TAŞINIR —
       hesap YAPILMAZ. `payload-create.ts` zaten bu 6 kolonu
       always-write ile DB'ye yazıyor (public ile ortak builder).
       İndirim yoksa false + null'lar → eski davranış birebir. */
    discount_applied: !!data.discount_applied,
    discount_type: data.discount_type ?? null,
    discount_value: data.discount_value ?? null,
    discount_currency: data.discount_currency ?? null,
    original_stay_total_try: data.original_stay_total_try ?? null,
    stay_discount_amount_try: data.stay_discount_amount_try ?? null,

    pool_heating_selected: !!data.pool_heating_selected,
    original_pool_heating_total:
      Number(data.original_pool_heating_total) || 0,
    original_pool_heating_currency:
      data.original_pool_heating_currency || "TRY",
    pool_heating_total_try: poolHeatingTRY,

    /* 🔥 KUR */
    exchange_rate: exchangeRate,

    /* 🔥 FINANCIAL SNAPSHOT (paid_amount create'te yazılmaz;
       DB default 0; tahsilat detail page'de yönetilir) */
    prepayment_amount: prepaymentAmount,
    remaining_payment: remainingPayment,

    /* 🔥 CUSTOM PRICE (normal flow → false) */
    custom_price: false,
    custom_price_note: null,

    /* 🔥 PAYMENT PREFERENCE */
    payment_preference: normalizePaymentPreference(data.payment_preference),

    /* 🔥 PAYMENT METHOD */
    payment_method_id: data.payment_method_id || null,

    /* 🔥 DAMAGE DEPOSIT — villa.deposit snapshot
       (informational; accounting'e dahil değil) */
    damage_deposit: Number(selectedVilla?.deposit) || 0,
  };
}
