import { calculateGrandTotal, accommodationBase } from "@/lib/price.engine";
import { formatLocalDate } from "@/lib/date-format";

import type {
  CustomPriceToggleInput,
  CustomPriceToggleNext,
} from "../_types/handler-inputs";
import type { ReservationDetailData } from "./../_types/reservation-form-data";

/* ===============================================================
   🛡️ FAZ 2 — computeCustomPriceToggle (PURE)
   ===============================================================
   Eski page.tsx > `handleCustomPriceToggle` body'sinin BYTE-IDENTICAL
   kopyası (line 960-1079).

   ⚠️ KESIN KURAL — toggle semantiği:
     - Prev null guard: helper input zorunlu strict; page-side null
       kontrol zaten yapar (`setData((prev) => prev ? ... : prev)`).
     - TOGGLE OFF (true → false) — KRİTİK:
         start/end ISO + prices.length > 0 → calculateGrandTotal
         + multi-currency snapshot + financial recalc.
         start/end ISO yoksa veya prices boşsa → sadece flag/note kapat.
     - TOGGLE ON (false → true) → multi-currency alanları nötrle.
     - paid_amount KORUNUR (patch'te yok).

   ⚠️ KESIN KURAL — alan sırası:
     OFF (full recalc): custom_price, custom_price_note, start_date,
     end_date, total_price, total_price_try, original_price,
     original_currency, original_cleaning_fee, original_cleaning_currency,
     cleaning_fee_try, exchange_rate, prepayment_amount, remaining_payment.
     OFF (flag-only): custom_price, custom_price_note.
     ON: custom_price, original_price, original_currency,
     original_cleaning_fee, original_cleaning_currency, cleaning_fee_try,
     exchange_rate.

   Output: PARTIAL — page setData ile `{ ...prev, ...patch }` uygular.
   Eski inline tam object return ediyordu; bu çıktı `{ ...prev, ...patch }`
   semantiği ile eşdeğer çünkü patch tüm üzerine yazılacak alanları
   içerir; geri kalan prev alanları korunur.
=============================================================== */

export function computeCustomPriceToggle(
  input: CustomPriceToggleInput
): CustomPriceToggleNext {
  const { prev, startDate, endDate, prices, rates, selectedVilla, prepaymentRate } =
    input;

  if (prev.custom_price) {
    /* ===============================================================
       🔥 TOGGLE OFF (true → false) — KRİTİK
       =============================================================== */
    const startISO = startDate
      ? formatLocalDate(startDate)
      : prev.start_date;
    const endISO = endDate
      ? formatLocalDate(endDate)
      : prev.end_date;

    if (startISO && endISO && prices.length > 0) {
      const result = calculateGrandTotal({
        start: startISO,
        end: endISO,
        prices,
        currency: "TRY",
        rates,
        cleaning_fee:
          selectedVilla?.cleaning_fee ??
          prev?.villa?.cleaning_fee ??
          0,
        cleaning_currency:
          selectedVilla?.cleaning_currency ||
          prev?.villa?.cleaning_currency ||
          "TRY",
        cleaning_limit:
          selectedVilla?.cleaning_limit ??
          prev?.villa?.cleaning_limit ??
          0,

        /* 🔥 HAVUZ ISITMA — 8. adım. computeReservationPriceRecalc CASE 2
           ile BİREBİR desen: server-authoritative villa context, mevcut
           rezervasyonun `pool_heating_selected` durumu KORUNUR. */
        pool_heating_fee:
          selectedVilla?.pool_heating_fee ??
          prev?.villa?.pool_heating_fee ??
          0,
        pool_heating_currency:
          selectedVilla?.pool_heating_currency ||
          prev?.villa?.pool_heating_currency ||
          "TRY",
        pool_heating_selected: !!prev?.pool_heating_selected,

        /* 🛡️ Migration 076 — sezonluk ay kısıtı. computeReservationPriceRecalc
           CASE 2 ile BİREBİR AYNI fallback zinciri. */
        pool_heating_months:
          selectedVilla?.pool_heating_months ??
          prev?.villa?.pool_heating_months ??
          null,
      });

      const stayCurrency = result.original_currency || "TRY";
      const cleaningCurrency = result.original_cleaning_currency || "TRY";
      const isForeignStay = stayCurrency !== "TRY";
      const isForeignCleaning = cleaningCurrency !== "TRY";

      const exchangeRate = isForeignStay
        ? Number(rates?.[stayCurrency] || 0) || 1
        : isForeignCleaning
          ? Number(rates?.[cleaningCurrency] || 0) || 1
          : 1;

      const nextTotalTRY = Number(result.total) || 0;
      const nextCleaningTRY = Number(result.cleaning) || 0;
      const nextPoolHeatingTRY = Number(result.poolHeating) || 0;

      const newPrepayment = Math.round(
        (accommodationBase(nextTotalTRY, nextCleaningTRY, nextPoolHeatingTRY) *
          prepaymentRate) /
          100
      );
      const newRemaining = Math.max(nextTotalTRY - newPrepayment, 0);

      return {
        custom_price: false,
        custom_price_note: "",

        start_date: startISO,
        end_date: endISO,

        total_price: nextTotalTRY,
        total_price_try: nextTotalTRY,

        original_price: isForeignStay
          ? Number(result.original_stay) || 0
          : 0,
        original_currency: (isForeignStay ? stayCurrency : "TRY") as ReservationDetailData["original_currency"],

        original_cleaning_fee: isForeignCleaning
          ? Number(result.original_cleaning) || 0
          : 0,
        original_cleaning_currency: (isForeignCleaning ? cleaningCurrency : "TRY") as ReservationDetailData["original_cleaning_currency"],

        cleaning_fee_try: nextCleaningTRY,

        exchange_rate:
          isForeignStay || isForeignCleaning ? exchangeRate : 1,

        // 🔥 HAVUZ ISITMA snapshot — 8. adım. `pool_heating_selected`
        // prev'den korunur (yukarıdaki calculateGrandTotal ile aynı değer).
        pool_heating_selected: !!prev?.pool_heating_selected,
        pool_heating_total_try: nextPoolHeatingTRY,
        original_pool_heating_total: Number(result.original_pool_heating) || 0,
        original_pool_heating_currency:
          (result.original_pool_heating_currency ||
            "TRY") as ReservationDetailData["original_pool_heating_currency"],

        prepayment_amount: newPrepayment,
        remaining_payment: newRemaining,
        // paid_amount korunur
      };
    }

    // tarih/prices yoksa sadece flag'i kapat
    return {
      custom_price: false,
      custom_price_note: "",
    };
  }

  /* ---------------------------------------------
     🔥 TOGGLE ON (false → true)
     multi-currency alanları nötrlenir.
  ---------------------------------------------- */
  return {
    custom_price: true,
    original_price: 0,
    original_currency: "TRY",
    original_cleaning_fee: 0,
    original_cleaning_currency: "TRY",
    cleaning_fee_try: 0,
    exchange_rate: 1,
    // 🔥 HAVUZ ISITMA — 8. adım. Custom price = tek düz TRY tutar,
    // itemization yok; cleaning-fee nötrleme deseninin AYNI mantıkla
    // genişletilmesi (redesign DEĞİL). buildCustomPricePayload bu
    // nötrlemeyi DB'ye kalıcı yazar (eski sağlayıcı partial-update stale
    // değer bırakmasın diye).
    pool_heating_selected: false,
    pool_heating_total_try: 0,
    original_pool_heating_total: 0,
    original_pool_heating_currency: "TRY",
  };
}
