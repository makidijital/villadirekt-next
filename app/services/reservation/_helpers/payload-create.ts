import type { ReservationCreateInput } from "../types";

/* ===============================================================
   🛡️ FAZ 2 — buildCreateReservationPayload (PURE)
   ===============================================================
   Eski `createReservation` içinde inline INSERT payload object'inin
   BYTE-IDENTICAL kopyası (line 263-361).

   ⚠️ KESIN KURAL:
     - Alan sırası alan-alan aynen.
     - Coercion: `Number(x) || 0`, `string || null`, `string || "TRY"`,
       `Number(...) || 1`, `!!flag`, `?? null` — aynen.
     - Conditional spread (`...(data.X !== undefined ? { X } : {})`)
       aynen.
     - Status hardcoded `"pending"` aynen (create flow her zaman
       pending; confirmed transition update flow'unda).
     - reservation_commission_amount input olarak gelir (helper
       commission rate fetch + calcCommissionAmount sonucunu
       orchestrator hesaplar).

   ⚠️ Caller orchestrator (`create.service.ts`):
     - Validation kendi yapar
     - Conflict check kendi yapar
     - Commission rate'i fetch eder, calcCommissionAmount sonucunu
       buraya `reservationCommissionAmount` olarak verir
     - Bu helper'dan dönen payload'u repository.insert(...) ile
       gönderir
     - SQLSTATE 23P01 catch'i kendi yapar
=============================================================== */

export type BuildCreateReservationPayloadInput = {
  data: ReservationCreateInput;
  /** Orchestrator tarafında hesaplanan commission amount snapshot.
   *  Formula: total_price_try × (rate / 100); helper'da
   *  `calcCommissionAmount` ile üretilir. */
  reservationCommissionAmount: number;
};

/** INSERT payload — runtime'da `db.from("reservations").insert(...)`
 *  argümanına geçer. Excess property check'i DB client aşırı
 *  geniştir; pratikte loose accept eder. Burada strict tutmuyoruz
 *  çünkü conditional spread'ler key'lerin opsiyonel varlığını
 *  şart koşar. */
export function buildCreateReservationPayload(
  input: BuildCreateReservationPayloadInput
): Record<string, unknown> {
  const { data, reservationCommissionAmount } = input;

  return {
    villa_id: data.villa_id,

    start_date: data.start_date,
    end_date: data.end_date,
    total_price: Number(data.total_price) || 0,

    original_price:
      Number(data.original_price) || 0,

    original_currency:
      data.original_currency || "TRY",

    exchange_rate:
      Number(data.exchange_rate) || 1,

    total_price_try:
      Number(data.total_price_try) || 0,

    original_cleaning_fee:
      Number(data.original_cleaning_fee) || 0,

    original_cleaning_currency:
      data.original_cleaning_currency || "TRY",

    cleaning_fee_try:
      Number(data.cleaning_fee_try) || 0,

    // 🔥 HAVUZ ISITMA — 6. adım. Cleaning fee ile AYNI always-write
    // coercion deseni (conditional-spread DEĞİL) — snapshot her zaman
    // dört kolonu yazar; seçilmemiş/fee'siz rezervasyonlarda 0/"TRY"/false
    // default'ları DB'ye net yazılır (undefined bırakılmaz).
    pool_heating_selected: !!data.pool_heating_selected,

    original_pool_heating_total:
      Number(data.original_pool_heating_total) || 0,

    original_pool_heating_currency:
      data.original_pool_heating_currency || "TRY",

    pool_heating_total_try:
      Number(data.pool_heating_total_try) || 0,

    // 🛡️ İNDİRİM/ÖZEL FİYAT SNAPSHOT — FAZ 4. Pool heating ile AYNI
    // always-write deseni (conditional-spread DEĞİL) — snapshot her
    // zaman 6 kolonu yazar. Discount uygulanmadıysa (discount_applied
    // false) diğer 5 kolon null default'una düşer (undefined bırakılmaz).
    // Client body'de bu alanlar varsa dahi (route.ts server-authoritative
    // sonuçla OVERRIDE etmediği sürece) burada yalnız coerce edilir —
    // GÜVENLİK SINIRI route.ts'te (bkz. price-verify.ts doc-comment'i),
    // bu helper mevcut pool-heating/cleaning helper'ları gibi kendisine
    // gelen `data`'ya güvenen SAF bir builder'dır.
    discount_applied: !!data.discount_applied,

    discount_type:
      data.discount_type === "percent" || data.discount_type === "fixed"
        ? data.discount_type
        : null,

    discount_value:
      data.discount_value === undefined || data.discount_value === null
        ? null
        : Number(data.discount_value) || 0,

    discount_currency: data.discount_currency ?? null,

    original_stay_total_try:
      data.original_stay_total_try === undefined ||
      data.original_stay_total_try === null
        ? null
        : Number(data.original_stay_total_try) || 0,

    stay_discount_amount_try:
      data.stay_discount_amount_try === undefined ||
      data.stay_discount_amount_try === null
        ? null
        : Number(data.stay_discount_amount_try) || 0,

    name: data.name,
    phone: data.phone,
    phone2: data.phone2 ?? null,
    email: data.email || null,

    identity_number: data.identity_number || null,
    country: data.country || null,
    city: data.city || null,
    address: data.address || null,

    guests: Number(data.guests) || 1,

    guest_names: data.guest_names || [], // 🔥 BURASI

    note: data.note || null,

    status: "pending",

    payment_method_id: data.payment_method_id ?? null,

    // 🔥 FINANCIAL SNAPSHOT
    // Sadece tanımlı alanlar yazılır → eski rezervasyonlar bozulmaz
    ...(data.prepayment_amount !== undefined
      ? { prepayment_amount: Number(data.prepayment_amount) || 0 }
      : {}),

    ...(data.remaining_payment !== undefined
      ? { remaining_payment: Number(data.remaining_payment) || 0 }
      : {}),

    ...(data.paid_amount !== undefined
      ? { paid_amount: Number(data.paid_amount) || 0 }
      : { paid_amount: 0 }), // ilk kayıtta 0

    // 🔥 CUSTOM PRICE — sadece tanımlıysa yaz (eski rezervasyonlar bozulmaz)
    ...(data.custom_price !== undefined
      ? { custom_price: !!data.custom_price }
      : {}),

    ...(data.custom_price_note !== undefined
      ? { custom_price_note: data.custom_price_note || null }
      : {}),

    // 🔥 PAYMENT PREFERENCE — sadece tanımlıysa yaz
    // (eski rezervasyonlar bozulmaz; default DB tarafında "prepayment")
    ...(data.payment_preference !== undefined
      ? {
          payment_preference:
            data.payment_preference === "full_payment"
              ? "full_payment"
              : "prepayment",
        }
      : {}),

    // 🔥 DAMAGE DEPOSIT — villa.deposit snapshot
    // Sadece tanımlıysa yazılır; informational (accounting'e
    // dahil değil; ayrı kolon).
    ...(data.damage_deposit !== undefined
      ? { damage_deposit: Number(data.damage_deposit) || 0 }
      : {}),

    // 🛡️ COMMISSION AMOUNT — accounting snapshot
    // villa.commission_rate × total_price_try / 100
    // (her zaman total_price_try üzerinden — paid_amount/
    //  prepayment_amount/original_price ASLA değil).
    // Rate null/invalid/range dışı → 20 fallback (safeCommissionRate).
    // Bu field DB'de NOT NULL DEFAULT 0 olabilir veya nullable; her
    // iki durumda da snapshot değeri yazılır.
    reservation_commission_amount: reservationCommissionAmount,
  };
}
