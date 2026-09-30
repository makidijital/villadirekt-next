import {
  calculateGrandTotal,
  accommodationBase,
  type DiscountRange,
} from "@/lib/price.engine";
import { formatLocalDate } from "@/lib/date-format";

import type {
  PriceRecalcInput,
  PriceRecalcResult,
} from "../_types/handler-inputs";
import type { ReservationDetailData } from "./../_types/reservation-form-data";

/* ===============================================================
   🛡️ FAZ 2 — computeReservationPriceRecalc (PURE)
   ===============================================================
   Eski page.tsx > L588-820 useEffect body'sinin BYTE-IDENTICAL
   kopyası. Bu helper REFACTOR'UN EN KRİTİK NOKTASI.

   ⚠️ ZERO BUSINESS CHANGE: alan-alan + fallback chain + coercion
   pattern + 3-path branching aynen korundu.

   3 PATH (PriceRecalcResult discriminated union):
     1. `clear` — !startDate || !endDate || prices.length === 0
        → page setPriceDetail(null), return.
     2. `custom_price` — data.custom_price=true
        → priceDetail SNAPSHOT data'dan kurulur (nights, total_price_try);
           start_date / end_date data ile farklıysa data sync patch döner.
        → calculateGrandTotal ASLA çalışmaz, canlı kur ASLA kullanılmaz.
     3. `snapshot` (no_recalc) — !hasDateChanged && !hasVillaChanged
        → priceDetail snapshot data'dan; data ASLA dokunulmaz.
     4. `recalc` — hasDateChanged || hasVillaChanged
        → calculateGrandTotal + multi-currency derivation + financial
           snapshot data patch.

   ⚠️ CALLER ORCHESTRATION (page'in useEffect body'si):
     const r = computeReservationPriceRecalc({...});
     if (r.kind === "clear") { setPriceDetail(null); return; }
     setPriceDetail(r.priceDetail);
     if (r.kind === "custom_price" && r.dataPatch) {
       setData((prev) => prev ? { ...prev, ...r.dataPatch } : prev);
     }
     if (r.kind === "recalc") {
       setData((prev) => prev ? { ...prev, ...r.dataPatch } : prev);
     }

   ⚠️ KESIN KURAL — ALAN SIRASI:
     custom_price branch priceDetail:
       nights, stay, cleaning, total, original_stay, original_currency,
       original_cleaning, original_cleaning_currency, currency.
     snapshot branch priceDetail:
       AYNI 9 alan.
     recalc branch priceDetail: calculateGrandTotal'ın döndüğü shape
       (engine helper kontratı).
     recalc branch dataPatch:
       start_date, end_date, total_price, total_price_try,
       original_price, original_currency, original_cleaning_fee,
       original_cleaning_currency, cleaning_fee_try, exchange_rate,
       prepayment_amount, remaining_payment.

   ⚠️ KESIN KURAL — CLEANING FALLBACK CHAIN:
     selectedVilla?.cleaning_fee ?? data?.villa?.cleaning_fee ?? 0
     selectedVilla?.cleaning_currency || data?.villa?.cleaning_currency || "TRY"
     selectedVilla?.cleaning_limit ?? data?.villa?.cleaning_limit ?? 0
=============================================================== */

export function computeReservationPriceRecalc(
  input: PriceRecalcInput
): PriceRecalcResult {
  const {
    data,
    startDate,
    endDate,
    prices,
    rates,
    /* 🛡️ villa_discounts — OPSİYONEL (default []). Takvimde gösterilen
       indirimli gecelik fiyatın AYNISI toplama yansısın diye
       calculateGrandTotal'a iletilir. Verilmezse davranış ESKİSİYLE
       BİREBİR AYNI (discounts=null → indirim uygulanmaz). */
    discounts,
    originalStartDate,
    originalEndDate,
    originalVillaId,
    selectedVilla,
    prepaymentRate,
  } = input;

  if (!startDate || !endDate || prices.length === 0) {
    return { kind: "clear" };
  }

  const startISO = formatLocalDate(startDate);
  const endISO = formatLocalDate(endDate);

  /* ===============================================================
     🔥 CUSTOM PRICE — RECALCULATION TAMAMEN KAPALI
  =============================================================== */
  if (data?.custom_price) {
    const priceDetail = {
      nights: Math.ceil(
        (new Date(endISO).getTime() - new Date(startISO).getTime()) /
        (1000 * 60 * 60 * 24)
      ),
      stay: Number(data?.total_price_try || 0),
      cleaning: 0,
      // 🔥 HAVUZ ISITMA — 8. adım. Custom price = tek düz TRY tutar,
      // itemization yok (temizlik ile aynı muamele). Redesign DEĞİL —
      // mevcut custom price mantığı korunuyor, yalnız tip-shape
      // (PriceDetailSnapshot.poolHeating zorunlu) tamamlanıyor.
      poolHeating: 0,
      total: Number(data?.total_price_try || 0),
      original_stay: 0,
      original_currency: "TRY",
      original_cleaning: 0,
      original_cleaning_currency: "TRY",
      original_pool_heating: 0,
      original_pool_heating_currency: "TRY",
      currency: "TRY",
    };

    // start_date / end_date senkron tut, data'yı yeniden yazma
    if (
      data?.start_date !== startISO ||
      data?.end_date !== endISO
    ) {
      return {
        kind: "custom_price",
        priceDetail,
        dataPatch: {
          start_date: startISO,
          end_date: endISO,
        },
      };
    }

    return {
      kind: "custom_price",
      priceDetail,
      dataPatch: null,
    };
  }

  /* ===============================================================
     🔥 EDIT PAGE — KRİTİK MANTIK
  =============================================================== */
  const hasDateChanged =
    originalStartDate !== null &&
    originalEndDate !== null &&
    (originalStartDate !== startISO || originalEndDate !== endISO);

  const hasVillaChanged =
    originalVillaId !== null &&
    data?.villa_id !== undefined &&
    data?.villa_id !== originalVillaId;

  const shouldRecalc = hasDateChanged || hasVillaChanged;

  /* ---------------------------------------------
     🟢 CASE 1 — TARİH + VILLA AYNI
  ---------------------------------------------- */
  if (!shouldRecalc) {
    const snapshotResult = {
      nights: Math.ceil(
        (new Date(endISO).getTime() - new Date(startISO).getTime()) /
        (1000 * 60 * 60 * 24)
      ),

      stay:
        Number(data?.total_price_try || 0) -
        Number(data?.cleaning_fee_try || 0) -
        Number(data?.pool_heating_total_try || 0),

      cleaning: Number(data?.cleaning_fee_try || 0),

      // 🔥 HAVUZ ISITMA — 8. adım. Tarih/villa DEĞİŞMEDİĞİ için mevcut
      // reservation snapshot'ı aynen okunur (recalc YOK — CASE 1).
      poolHeating: Number(data?.pool_heating_total_try || 0),

      total: Number(data?.total_price_try || 0),

      original_stay: Number(data?.original_price || 0),

      original_currency: data?.original_currency || "TRY",

      original_cleaning: Number(data?.original_cleaning_fee || 0),

      original_cleaning_currency:
        data?.original_cleaning_currency || "TRY",

      original_pool_heating: Number(data?.original_pool_heating_total || 0),

      original_pool_heating_currency:
        data?.original_pool_heating_currency || "TRY",

      currency: "TRY",
    };

    return {
      kind: "snapshot",
      priceDetail: snapshotResult,
    };
  }

  /* ---------------------------------------------
     🟠 CASE 2 — TARİH veya VILLA DEĞİŞTİ
  ---------------------------------------------- */
  const result = calculateGrandTotal({
    start: startISO,
    end: endISO,
    prices,
    currency: "TRY",
    rates,
    discounts: discounts && discounts.length > 0 ? discounts : null,
    cleaning_fee:
      selectedVilla?.cleaning_fee ??
      data?.villa?.cleaning_fee ??
      0,
    cleaning_currency:
      selectedVilla?.cleaning_currency ||
      data?.villa?.cleaning_currency ||
      "TRY",
    cleaning_limit:
      selectedVilla?.cleaning_limit ??
      data?.villa?.cleaning_limit ??
      0,

    /* 🔥 HAVUZ ISITMA — 8. adım. Cleaning fallback zinciriyle BİREBİR
       desen: SERVER-authoritative villa context (selectedVilla → async
       fetch edilen YENİ villa; data?.villa → embed fallback) — client'tan
       gelen ücrete ASLA güvenilmez. `pool_heating_selected` MEVCUT
       rezervasyondan (`data?.pool_heating_selected`) OKUNUR ve KORUNUR —
       villa değişse de kullanıcının "havuz ısıtma istiyorum" seçimi
       sıfırlanmaz (kullanıcı talimatı). Yeni villada ücret yoksa
       (0/null) engine `poolHeating: 0` döner → hesap doğru devam eder. */
    pool_heating_fee:
      selectedVilla?.pool_heating_fee ??
      data?.villa?.pool_heating_fee ??
      0,
    pool_heating_currency:
      selectedVilla?.pool_heating_currency ||
      data?.villa?.pool_heating_currency ||
      "TRY",
    pool_heating_selected: !!data?.pool_heating_selected,

    /* 🛡️ Migration 076 — sezonluk ay kısıtı. Cleaning/pool_heating_fee
       fallback zinciriyle BİREBİR desen: selectedVilla (yeni async
       fetch edilen villa) → data?.villa (embed fallback) → null
       (kısıtlama yok). Tarih/villa değiştiğinde bu kural da YENİDEN
       uygulanır — örn. tarihi Temmuz'a çekmek pasif aydaysa
       result.poolHeating otomatik 0'a düşer. */
    pool_heating_months:
      selectedVilla?.pool_heating_months ??
      data?.villa?.pool_heating_months ??
      null,
  });

  const stayCurrency = result.original_currency || "TRY";
  const cleaningCurrency = result.original_cleaning_currency || "TRY";

  const isForeignStay = stayCurrency !== "TRY";
  const isForeignCleaning = cleaningCurrency !== "TRY";

  /* ---------------------------------------------
     🔥 KUR — yeni rezervasyon koşullarına göre canlı kur
  ---------------------------------------------- */
  const exchangeRate = isForeignStay
    ? Number(rates?.[stayCurrency] || 0) || 1
    : isForeignCleaning
      ? Number(rates?.[cleaningCurrency] || 0) || 1
      : 1;

  const nextTotalTRY = Number(result.total) || 0;
  const nextCleaningTRY = Number(result.cleaning) || 0;
  // 🔥 HAVUZ ISITMA — 8. adım. Gece başına ücret olduğu için `result`
  // (calculateGrandTotal) YENİ gece sayısına göre zaten yeniden
  // hesaplandı (start/end ISO değişmiş olabilir — tarih değişikliği).
  const nextPoolHeatingTRY = Number(result.poolHeating) || 0;

  /* ---------------------------------------------
     🔥 FINANCIAL SNAPSHOT — paid_amount KORUNUR
     Ön ödeme havuz ısıtmayı İÇERMEZ: accommodationBase 3. parametre
     ile havuz ısıtmayı da toplamdan düşer (total - cleaning - poolHeating).
  ---------------------------------------------- */
  const newPrepayment = Math.round(
    (accommodationBase(nextTotalTRY, nextCleaningTRY, nextPoolHeatingTRY) *
      prepaymentRate) /
      100
  );
  const newRemaining = Math.max(nextTotalTRY - newPrepayment, 0);

  return {
    kind: "recalc",
    priceDetail: result,
    dataPatch: {
      start_date: startISO,
      end_date: endISO,

      // ADMIN TRY görür
      total_price: nextTotalTRY,
      total_price_try: nextTotalTRY,

      // KONAKLAMA snapshot
      original_price: isForeignStay
        ? Number(result.original_stay) || 0
        : 0,
      original_currency: (isForeignStay ? stayCurrency : "TRY") as ReservationDetailData["original_currency"],

      // TEMİZLİK snapshot
      original_cleaning_fee: isForeignCleaning
        ? Number(result.original_cleaning) || 0
        : 0,
      original_cleaning_currency: (isForeignCleaning ? cleaningCurrency : "TRY") as ReservationDetailData["original_cleaning_currency"],

      cleaning_fee_try: nextCleaningTRY,

      // KUR
      exchange_rate:
        isForeignStay || isForeignCleaning ? exchangeRate : 1,

      // 🔥 HAVUZ ISITMA snapshot — 8. adım. `pool_heating_selected`
      // mevcut rezervasyondan korunur (yukarıdaki calculateGrandTotal
      // çağrısıyla AYNI değer — tek source-of-truth).
      pool_heating_selected: !!data?.pool_heating_selected,
      pool_heating_total_try: nextPoolHeatingTRY,
      original_pool_heating_total: Number(result.original_pool_heating) || 0,
      original_pool_heating_currency:
        (result.original_pool_heating_currency ||
          "TRY") as ReservationDetailData["original_pool_heating_currency"],

      // 🔥 FINANCIAL SNAPSHOT
      prepayment_amount: newPrepayment,
      remaining_payment: newRemaining,
      // paid_amount KORUNUR (prev.paid_amount otomatik kalır)
    },
  };
}
