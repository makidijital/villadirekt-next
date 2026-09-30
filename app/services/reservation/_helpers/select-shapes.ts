/* ===============================================================
   🛡️ FAZ 2 — RESERVATION SELECT SHAPES (single source-of-truth)
   ===============================================================
   Eski `reservation.service.ts` içinde `getReservationById` ve
   `getReservations` inline SELECT string'leri vardı. Single source
   olarak buraya alındı.

   ⚠️ KESIN KURAL — STRING SEMANTIK:
     - Whitespace + indentation BYTE-IDENTICAL korundu (eski sağlayıcı
       parser whitespace tolere eder ama exact-string semantic
       diff için sabit).
     - Embed alanları + sıraları aynen.
     - Comma/newline pattern'i aynen.
=============================================================== */

/** `getReservationById` — DB row + villa embed + payment_method embed. */
export const SELECT_RESERVATION_DETAIL = `
      *,
      villa:villa_id (
        title,
        cleaning_fee,
        cleaning_currency,
        cleaning_limit,
        custom_prepayment_rate,
        pool_heating_fee,
        pool_heating_currency,
        pool_heating_months
      ),
      payment_method:payment_method_id (
        id,
        name,
        type
      )
    `;

/** `getReservations` — listing projection (DB columns + villa.title). */
export const SELECT_RESERVATION_LIST = `
  id,
  reservation_no,
  name,
  phone,
  phone2,
  start_date,
  end_date,

  total_price,

  original_price,
  original_currency,
  exchange_rate,
  total_price_try,

  payment_preference,

  status,
  created_at,

  villa:villa_id (
    title
  )
`;
