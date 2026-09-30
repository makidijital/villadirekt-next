import type {
  CustomPriceAmountChangeInput,
  CustomPriceAmountChangeNext,
} from "../_types/handler-inputs";

/* ===============================================================
   🛡️ FAZ 2 — computeCustomPriceAmountChange (PURE)
   ===============================================================
   Eski page.tsx > `handleCustomPriceAmountChange` body'sinin
   BYTE-IDENTICAL kopyası (line 1085-1110).

   Custom price input onChange — total_price_try güncelleyip
   prepayment + remaining recalc eder. paid_amount KORUNUR
   (prev'den okunur, helper output'ta yok).

   ⚠️ KESIN KURAL:
     - Number(prev.paid_amount) || 0 coercion aynen.
     - Math.round((v * prepaymentRate) / 100) aynen.
     - Math.max(v - paid, 0) aynen.
     - Multi-currency nötr alanları (original_price, ...) AYNI sırayla.
=============================================================== */

export function computeCustomPriceAmountChange(
  input: CustomPriceAmountChangeInput
): CustomPriceAmountChangeNext {
  const { prev, newAmount: v, prepaymentRate } = input;

  const paid = Number(prev.paid_amount) || 0;
  const newPrepayment = Math.round((v * prepaymentRate) / 100);
  const newRemaining = Math.max(v - paid, 0);

  return {
    total_price: v,
    total_price_try: v,

    // multi-currency nötr
    original_price: 0,
    original_currency: "TRY",
    original_cleaning_fee: 0,
    original_cleaning_currency: "TRY",
    cleaning_fee_try: 0,
    exchange_rate: 1,

    // financial snapshot
    prepayment_amount: newPrepayment,
    remaining_payment: newRemaining,
    // paid_amount korunur (prev.paid_amount otomatik kalır — patch'te YOK)
  };
}
