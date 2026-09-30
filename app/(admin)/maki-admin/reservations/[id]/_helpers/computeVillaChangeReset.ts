import type {
  VillaChangeResetInput,
  VillaChangeResetPatch,
} from "../_types/handler-inputs";

/* ===============================================================
   🛡️ FAZ 2 — computeVillaChangeReset (PURE)
   ===============================================================
   Eski page.tsx > `handleVillaChange` içinde inline yazılı state
   reset payload'ının BYTE-IDENTICAL kopyası (line 904-928 orijinal).

   Pure compute — `setData((prev) => prev ? { ...prev, ...patch } : prev)`
   pattern'i için PATCH döner. Page tarafı side-effect setter'ları
   (setStartDate(null), setEndDate(null), setPriceDetail(null),
   setPrices([]), setSelectedVilla(null), setBlockedDates([]) vb.)
   AYRI ÇAĞIRIR — eski sıra korunur.

   ⚠️ KESIN KURAL:
     - Alan sırası BYTE-IDENTICAL: villa_id, villa, custom_price,
       custom_price_note, total_price, total_price_try, original_*,
       cleaning_fee_try, exchange_rate, prepayment_amount,
       remaining_payment, paid_amount.
     - paid_amount: 0 reset aynen (yeni villa).
     - villa: null (stale join temizliği).
   =============================================================== */

export function computeVillaChangeReset(
  input: VillaChangeResetInput
): VillaChangeResetPatch {
  const { newVillaId } = input;
  return {
    villa_id: newVillaId,
    villa: null,

    // 🔥 CUSTOM PRICE → kapat
    custom_price: false,
    custom_price_note: "",

    // 🔥 FINANCIAL SNAPSHOT → sıfırla
    total_price: 0,
    total_price_try: 0,
    original_price: 0,
    original_currency: "TRY",
    original_cleaning_fee: 0,
    original_cleaning_currency: "TRY",
    cleaning_fee_try: 0,
    exchange_rate: 1,

    // 🔥 HAVUZ ISITMA — 8. adım. Yalnız TUTAR alanları sıfırlanır
    // (yeni villanın recalc'ı zaten doğru tutarı yazacak — bkz.
    // computeReservationPriceRecalc CASE 2). `pool_heating_selected`
    // BİLİNÇLİ OLARAK BU PATCH'E DAHİL EDİLMEDİ — kullanıcı talimatı:
    // "mevcut rezervasyondaki pool_heating_selected durumu korunmalı".
    // `{...prev, ...patch}` merge'i sayesinde prev'deki seçim aynen kalır.
    pool_heating_total_try: 0,
    original_pool_heating_total: 0,
    original_pool_heating_currency: "TRY",

    prepayment_amount: 0,
    remaining_payment: 0,

    // 🔥 PAID → 0 (yeni villa)
    paid_amount: 0,
  };
}
