import { describe, it, expect } from "vitest";

import { computeCustomPriceToggle } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/computeCustomPriceToggle";

import type { ReservationDetailData } from "@/app/(admin)/maki-admin/reservations/[id]/_types/reservation-form-data";

/* ===============================================================
   🛡️ HAVUZ ISITMA — 8. adım (Admin edit doğruluk düzeltmesi)
   ===============================================================
   computeCustomPriceToggle — kullanıcı talimatı: "Bu adımda custom
   price davranışını yeniden tasarlama. Mevcut custom price mantığını
   koru. Sadece pool heating nedeniyle oluşan yanlış accommodation/
   prepayment hesabını düzelt."

   TOGGLE OFF (true→false) full-recalc branch computeReservationPriceRecalc
   CASE 2 ile AYNI bug'a sahipti (calculateGrandTotal havuz ısıtma
   parametreleri olmadan çağrılıyordu) → aynı düzeltme burada da uygulandı.
   TOGGLE ON (false→true) branch'i havuz ısıtmayı da (cleaning ile aynı
   desende) nötrler — redesign DEĞİL, mevcut nötrleme deseninin genişlemesi.
=============================================================== */

const rates = { TRY: 1, USD: 35, EUR: 40 };
const startDate = new Date(2026, 5, 1); // 2026-06-01
const endDate = new Date(2026, 5, 5); // 2026-06-05 → 4 gece
const prices = [
  { start_date: "2026-05-01", end_date: "2026-10-31", price: 5000, currency: "TRY" },
];

describe("computeCustomPriceToggle — 8. adım: TOGGLE ON (false→true) havuz ısıtma nötrleme", () => {
  it("pool_heating alanlarını nötrler (cleaning ile aynı desen)", () => {
    const prevOFF = {
      custom_price: false,
      villa: null,
      pool_heating_selected: true,
      pool_heating_total_try: 5000,
    } as unknown as ReservationDetailData;

    const p = computeCustomPriceToggle({
      prev: prevOFF,
      startDate: null,
      endDate: null,
      prices: [],
      rates,
      selectedVilla: null,
      prepaymentRate: 20,
    });

    expect(p.custom_price).toBe(true);
    expect(p.pool_heating_selected).toBe(false);
    expect(p.pool_heating_total_try).toBe(0);
    expect(p.original_pool_heating_total).toBe(0);
    expect(p.original_pool_heating_currency).toBe("TRY");
  });
});

describe("computeCustomPriceToggle — 8. adım: TOGGLE OFF (true→false) full recalc + havuz ısıtma", () => {
  it("worked example: 4 gece × 1.250 TL/gece havuz ısıtma → toplam 28.500, ön ödeme %20=4.000", () => {
    const prevON = {
      custom_price: true,
      custom_price_note: "VIP",
      start_date: "2026-06-01",
      end_date: "2026-06-05",
      villa: null,
      pool_heating_selected: true, // custom price sırasında bile korunan seçim
    } as unknown as ReservationDetailData;

    const p = computeCustomPriceToggle({
      prev: prevON,
      startDate,
      endDate,
      prices,
      rates,
      selectedVilla: {
        cleaning_fee: 3500,
        cleaning_currency: "TRY",
        cleaning_limit: 0,
        pool_heating_fee: 1250,
        pool_heating_currency: "TRY",
      },
      prepaymentRate: 20,
    });

    expect(p.custom_price).toBe(false);
    expect(p.pool_heating_selected).toBe(true); // KORUNDU
    expect(p.pool_heating_total_try).toBe(5000); // 4 × 1.250
    expect(p.total_price_try).toBe(28500); // 20.000 + 3.500 + 5.000
    expect(p.prepayment_amount).toBe(4000); // accommodationBase(28500,3500,5000)*20%
    expect(p.remaining_payment).toBe(24500);
  });

  it("regresyon: pool_heating_selected hiç yoksa (eski rezervasyon) → poolHeating=0, eski davranış birebir", () => {
    const prevON = {
      custom_price: true,
      custom_price_note: "",
      start_date: "2026-06-01",
      end_date: "2026-06-05",
      villa: null,
      // pool_heating_selected YOK
    } as unknown as ReservationDetailData;

    const p = computeCustomPriceToggle({
      prev: prevON,
      startDate,
      endDate,
      prices,
      rates,
      selectedVilla: { cleaning_fee: 3500, cleaning_currency: "TRY", cleaning_limit: 0 },
      prepaymentRate: 20,
    });

    expect(p.pool_heating_selected).toBe(false);
    expect(p.pool_heating_total_try).toBe(0);
    expect(p.total_price_try).toBe(23500); // 20.000 + 3.500 (havuz ısıtma yok)
    expect(p.prepayment_amount).toBe(4000); // accommodationBase(23500,3500,0)*20%
  });
});
