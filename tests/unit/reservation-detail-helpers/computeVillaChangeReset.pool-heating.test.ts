import { describe, it, expect } from "vitest";

import { computeVillaChangeReset } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/computeVillaChangeReset";

import type { ReservationDetailData } from "@/app/(admin)/maki-admin/reservations/[id]/_types/reservation-form-data";

/* ===============================================================
   🛡️ HAVUZ ISITMA — 8. adım (Admin edit doğruluk düzeltmesi)
   ===============================================================
   computeVillaChangeReset — kullanıcı talimatı:
     "Villa değişikliğinde mevcut rezervasyondaki pool_heating_selected
      durumu korunmalı. Yeni villada ücret yoksa toplam havuz ısıtma
      0/NULL olmalı ve hesap doğru şekilde devam etmeli."

   Bu dosya YALNIZ reset PATCH'inin şeklini doğrular (pure compute).
   Asıl TUTAR yeniden hesabı computeReservationPriceRecalc'in CASE 2
   ("recalc") branch'inde yapılır — bkz.
   computeReservationPriceRecalc.pool-heating.test.ts.
=============================================================== */

const prevWithPoolHeatingSelected = {
  id: "res-1",
  villa_id: "villa-old",
  villa: { title: "Old Villa" },
  custom_price: false,
  total_price: 28500,
  total_price_try: 28500,
  original_price: 0,
  original_currency: "TRY",
  original_cleaning_fee: 0,
  original_cleaning_currency: "TRY",
  cleaning_fee_try: 3500,
  exchange_rate: 1,
  prepayment_amount: 4000,
  remaining_payment: 24500,
  paid_amount: 0,
  // 🔥 Mevcut rezervasyonun havuz ısıtma seçimi + snapshot'ı
  pool_heating_selected: true,
  pool_heating_total_try: 5000,
  original_pool_heating_total: 5000,
  original_pool_heating_currency: "TRY",
} as unknown as ReservationDetailData;

describe("computeVillaChangeReset — 8. adım: havuz ısıtma", () => {
  it("TUTAR alanlarını sıfırlar (pool_heating_total_try, original_pool_heating_total/currency)", () => {
    const p = computeVillaChangeReset({
      prev: prevWithPoolHeatingSelected,
      newVillaId: "villa-new",
    });
    expect(p.pool_heating_total_try).toBe(0);
    expect(p.original_pool_heating_total).toBe(0);
    expect(p.original_pool_heating_currency).toBe("TRY");
  });

  it("patch 'pool_heating_selected' anahtarını İÇERMEZ → merge sonrası prev'deki seçim (true) korunur", () => {
    const p = computeVillaChangeReset({
      prev: prevWithPoolHeatingSelected,
      newVillaId: "villa-new",
    });
    expect("pool_heating_selected" in p).toBe(false);

    // Page.tsx'in gerçek merge deseni: setData(prev => ({...prev, ...patch}))
    const merged = { ...prevWithPoolHeatingSelected, ...p };
    expect(merged.pool_heating_selected).toBe(true); // KORUNDU
    expect(merged.pool_heating_total_try).toBe(0); // TUTAR sıfırlandı (recalc bekliyor)
  });

  it("pool_heating_selected=false olan eski rezervasyonda da aynı şekilde davranır (regresyon)", () => {
    const prevNoPoolHeating = {
      ...prevWithPoolHeatingSelected,
      pool_heating_selected: false,
      pool_heating_total_try: 0,
    } as unknown as ReservationDetailData;

    const p = computeVillaChangeReset({
      prev: prevNoPoolHeating,
      newVillaId: "villa-new",
    });
    expect("pool_heating_selected" in p).toBe(false);
    const merged = { ...prevNoPoolHeating, ...p };
    expect(merged.pool_heating_selected).toBe(false); // korunur (false olarak)
  });
});
