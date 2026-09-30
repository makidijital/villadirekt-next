import type {
  ReservationUpdateInput,
  ReservationUpdatePayload,
} from "../types";

/* ===============================================================
   🛡️ FAZ 2 — buildUpdateReservationPayload (PURE)
   ===============================================================
   Eski `updateReservationFull` içinde inline payload build
   bloğunun (line 609-716) BYTE-IDENTICAL kopyası.

   ⚠️ KESIN KURAL:
     - 13 always-set field (villa_id conditional spread + 12 doğrudan
       atama) — alan sırası aynen.
     - 18 conditional `if (data.X !== undefined)` field — koşul + atama
       aynen.
     - Coercion (Number(x) || 0, string || "TRY", string || null,
       !!flag, etc.) aynen.
     - payment_link `.toString().trim() || null` aynen.
     - payment_link_status allowed-list normalize aynen.

   ÇAĞIRAN: `update.service.ts > updateReservationFull` orchestrator.
=============================================================== */

export function buildUpdateReservationPayload(
  data: ReservationUpdateInput
): ReservationUpdatePayload {
  const payload: ReservationUpdatePayload = {
    // 🔥 VILLA — sadece tanımlıysa update edilir
    ...(data.villa_id !== undefined ? { villa_id: data.villa_id } : {}),

    name: data.name,
    phone: data.phone,
    phone2: data.phone2 ?? null,
    email: data.email,

    identity_number: data.identity_number,
    country: data.country,
    city: data.city,
    address: data.address,

    guests: data.guests,
    guest_names: data.guest_names,

    note: data.note,

    start_date: data.start_date,
    end_date: data.end_date,
    total_price: data.total_price,

    payment_method_id: data.payment_method_id,
    status: data.status,
  };

  if (data.total_price_try !== undefined)
    payload.total_price_try = Number(data.total_price_try) || 0;

  if (data.original_price !== undefined)
    payload.original_price = Number(data.original_price) || 0;

  if (data.original_currency !== undefined)
    payload.original_currency = data.original_currency || "TRY";

  if (data.original_cleaning_fee !== undefined)
    payload.original_cleaning_fee =
      Number(data.original_cleaning_fee) || 0;

  if (data.original_cleaning_currency !== undefined)
    payload.original_cleaning_currency =
      data.original_cleaning_currency || "TRY";

  if (data.cleaning_fee_try !== undefined)
    payload.cleaning_fee_try = Number(data.cleaning_fee_try) || 0;

  if (data.exchange_rate !== undefined)
    payload.exchange_rate = Number(data.exchange_rate) || 1;

  /* ------------------------------------------------------------
     🔥 HAVUZ ISITMA — 8. adım (admin edit doğruluk düzeltmesi).
     Cleaning-fee grubuyla BİREBİR desen: sadece tanımlı alanlar
     payload'a girer → eski rezervasyonlar (pool heating alanları
     hiç yok) bozulmaz.
  ------------------------------------------------------------ */
  if (data.pool_heating_selected !== undefined)
    payload.pool_heating_selected = !!data.pool_heating_selected;

  if (data.original_pool_heating_total !== undefined)
    payload.original_pool_heating_total =
      Number(data.original_pool_heating_total) || 0;

  if (data.original_pool_heating_currency !== undefined)
    payload.original_pool_heating_currency =
      data.original_pool_heating_currency || "TRY";

  if (data.pool_heating_total_try !== undefined)
    payload.pool_heating_total_try =
      Number(data.pool_heating_total_try) || 0;

  /* ------------------------------------------------------------
     🔥 FINANCIAL SNAPSHOT
     Sadece undefined olmayanlar payload'a girer.
     Bu sayede eski rezervasyonlar bozulmaz, paid_amount
     resetlenmez (sadece admin değiştirirse update olur).
  ------------------------------------------------------------ */
  if (data.prepayment_amount !== undefined)
    payload.prepayment_amount = Number(data.prepayment_amount) || 0;

  if (data.remaining_payment !== undefined)
    payload.remaining_payment = Number(data.remaining_payment) || 0;

  if (data.paid_amount !== undefined)
    payload.paid_amount = Number(data.paid_amount) || 0;

  /* ------------------------------------------------------------
     🔥 CUSTOM PRICE
     Sadece tanımlı alanlar payload'a girer.
     Eski rezervasyonlarda custom_price NULL/false kalabilir.
  ------------------------------------------------------------ */
  if (data.custom_price !== undefined)
    payload.custom_price = !!data.custom_price;

  if (data.custom_price_note !== undefined)
    payload.custom_price_note = data.custom_price_note || null;

  /* ------------------------------------------------------------
     🔥 PAYMENT PREFERENCE
     Sadece tanımlıysa update edilir.
     Eski rezervasyonlarda payment_preference NULL kalabilir
     (helper normalize ile "prepayment" gibi davranır).
  ------------------------------------------------------------ */
  if (data.payment_preference !== undefined)
    payload.payment_preference =
      data.payment_preference === "full_payment"
        ? "full_payment"
        : "prepayment";

  /* ------------------------------------------------------------
     🔥 PAYMENT LINK
     Sadece tanımlı alanlar update edilir.
     payment_link_status helper allowed values dışındaysa
     "pending" fallback'e düşürülür.
  ------------------------------------------------------------ */
  if (data.payment_link !== undefined)
    payload.payment_link =
      (data.payment_link || "").toString().trim() || null;

  if (data.payment_link_status !== undefined) {
    const s = data.payment_link_status;
    payload.payment_link_status =
      s === "sent" || s === "paid" || s === "expired"
        ? s
        : "pending";
  }

  if (data.payment_link_sent_at !== undefined)
    payload.payment_link_sent_at =
      data.payment_link_sent_at || null;

  return payload;
}
