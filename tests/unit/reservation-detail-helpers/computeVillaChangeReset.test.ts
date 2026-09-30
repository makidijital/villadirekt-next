import { describe, it, expect } from "vitest";

import { computeVillaChangeReset } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/computeVillaChangeReset";

import type { ReservationDetailData } from "@/app/(admin)/maki-admin/reservations/[id]/_types/reservation-form-data";

/* ===============================================================
   🛡️ FAZ 5 — computeVillaChangeReset UNIT TESTS
   ===============================================================
   Pure state reset PATCH. handleVillaChange içinden çağrılır.
=============================================================== */

const prev = {
  id: "res-1",
  villa_id: "villa-old",
  villa: { title: "Old Villa" },
  custom_price: true,
  custom_price_note: "VIP",
  total_price: 50000,
  total_price_try: 50000,
  original_price: 1000,
  original_currency: "EUR",
  original_cleaning_fee: 50,
  original_cleaning_currency: "EUR",
  cleaning_fee_try: 2500,
  exchange_rate: 40,
  prepayment_amount: 10000,
  remaining_payment: 30000,
  paid_amount: 10000,
} as unknown as ReservationDetailData;

describe("computeVillaChangeReset", () => {
  it("sets villa_id + villa null", () => {
    const p = computeVillaChangeReset({ prev, newVillaId: "villa-new" });
    expect(p.villa_id).toBe("villa-new");
    expect(p.villa).toBeNull();
  });

  it("closes custom_price + clears note", () => {
    const p = computeVillaChangeReset({ prev, newVillaId: "villa-new" });
    expect(p.custom_price).toBe(false);
    expect(p.custom_price_note).toBe("");
  });

  it("resets financial snapshot to zero", () => {
    const p = computeVillaChangeReset({ prev, newVillaId: "villa-new" });
    expect(p.total_price).toBe(0);
    expect(p.total_price_try).toBe(0);
    expect(p.original_price).toBe(0);
    expect(p.original_currency).toBe("TRY");
    expect(p.original_cleaning_fee).toBe(0);
    expect(p.original_cleaning_currency).toBe("TRY");
    expect(p.cleaning_fee_try).toBe(0);
    expect(p.exchange_rate).toBe(1);
    expect(p.prepayment_amount).toBe(0);
    expect(p.remaining_payment).toBe(0);
  });

  it("resets paid_amount to 0 (new villa rule)", () => {
    const p = computeVillaChangeReset({ prev, newVillaId: "villa-new" });
    expect(p.paid_amount).toBe(0);
  });

  it("patch contains exactly 18 keys (regression guard — 8. adım: +3 havuz ısıtma tutar alanı)", () => {
    const p = computeVillaChangeReset({ prev, newVillaId: "villa-new" });
    expect(Object.keys(p).sort()).toEqual([
      "villa_id",
      "villa",
      "custom_price",
      "custom_price_note",
      "total_price",
      "total_price_try",
      "original_price",
      "original_currency",
      "original_cleaning_fee",
      "original_cleaning_currency",
      "cleaning_fee_try",
      "exchange_rate",
      "prepayment_amount",
      "remaining_payment",
      "paid_amount",
      // 🔥 HAVUZ ISITMA — 8. adım. Yalnız TUTAR alanları; `pool_heating_selected`
      // BİLİNÇLİ OLARAK YOK (mevcut rezervasyonun seçimi korunmalı — bkz.
      // computeVillaChangeReset.pool-heating.test.ts).
      "pool_heating_total_try",
      "original_pool_heating_total",
      "original_pool_heating_currency",
    ].sort());
  });

  it("8. adım: patch 'pool_heating_selected' key'ini İÇERMEZ (mevcut seçim korunmalı)", () => {
    const p = computeVillaChangeReset({ prev, newVillaId: "villa-new" });
    expect("pool_heating_selected" in p).toBe(false);
  });
});
