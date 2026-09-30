import { describe, it, expect } from "vitest";

import { computeCustomPriceToggle } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/computeCustomPriceToggle";

import type { ReservationDetailData } from "@/app/(admin)/maki-admin/reservations/[id]/_types/reservation-form-data";

/* ===============================================================
   🛡️ FAZ 5 — computeCustomPriceToggle UNIT TESTS
   ===============================================================
   Eski page.tsx handleCustomPriceToggle body byte-identical extract.
   3 branch: ON→OFF (full recalc), ON→OFF (flag-only), OFF→ON.
=============================================================== */

const startDate = new Date(2026, 5, 1);
const endDate = new Date(2026, 5, 8);

const ratesFixture = { TRY: 1, USD: 35, EUR: 40 };

const prevON = {
  custom_price: true,
  custom_price_note: "VIP",
  start_date: "2026-06-01",
  end_date: "2026-06-08",
  villa: null,
} as unknown as ReservationDetailData;

const prevOFF = {
  custom_price: false,
  villa: null,
} as unknown as ReservationDetailData;

describe("computeCustomPriceToggle — OFF → ON branch", () => {
  it("sets custom_price=true and nullifies multi-currency fields", () => {
    const p = computeCustomPriceToggle({
      prev: prevOFF,
      startDate: null,
      endDate: null,
      prices: [],
      rates: ratesFixture,
      selectedVilla: null,
      prepaymentRate: 20,
    });
    expect(p.custom_price).toBe(true);
    expect(p.original_price).toBe(0);
    expect(p.original_currency).toBe("TRY");
    expect(p.original_cleaning_fee).toBe(0);
    expect(p.original_cleaning_currency).toBe("TRY");
    expect(p.cleaning_fee_try).toBe(0);
    expect(p.exchange_rate).toBe(1);
  });

  it("does NOT include start_date/end_date in patch", () => {
    const p = computeCustomPriceToggle({
      prev: prevOFF,
      startDate: null,
      endDate: null,
      prices: [],
      rates: ratesFixture,
      selectedVilla: null,
      prepaymentRate: 20,
    });
    expect("start_date" in p).toBe(false);
    expect("end_date" in p).toBe(false);
  });
});

describe("computeCustomPriceToggle — ON → OFF flag-only branch", () => {
  it("when prices empty: returns flag-only patch (custom_price=false + custom_price_note='')", () => {
    const p = computeCustomPriceToggle({
      prev: prevON,
      startDate,
      endDate,
      prices: [],
      rates: ratesFixture,
      selectedVilla: null,
      prepaymentRate: 20,
    });
    expect(p.custom_price).toBe(false);
    expect(p.custom_price_note).toBe("");
    expect("total_price" in p).toBe(false);
    expect("start_date" in p).toBe(false);
  });

  it("when startDate null: returns flag-only patch", () => {
    const p = computeCustomPriceToggle({
      prev: { ...prevON, start_date: undefined as unknown as string },
      startDate: null,
      endDate: null,
      prices: [{ start_date: "x", end_date: "y", price: 100, currency: "TRY" }],
      rates: ratesFixture,
      selectedVilla: null,
      prepaymentRate: 20,
    });
    expect(p.custom_price).toBe(false);
    expect("total_price" in p).toBe(false);
  });
});

describe("computeCustomPriceToggle — ON → OFF full recalc branch", () => {
  it("with valid dates + prices: triggers recalc patch (TRY-only)", () => {
    const prices = [
      {
        start_date: "2026-05-01",
        end_date: "2026-10-31",
        price: 5000,
        currency: "TRY",
      },
    ];
    const p = computeCustomPriceToggle({
      prev: prevON,
      startDate,
      endDate,
      prices,
      rates: ratesFixture,
      selectedVilla: {
        cleaning_fee: 1500,
        cleaning_currency: "TRY",
        cleaning_limit: 0,
      },
      prepaymentRate: 20,
    });
    expect(p.custom_price).toBe(false);
    expect(p.custom_price_note).toBe("");
    expect(p.start_date).toBeDefined();
    expect(p.end_date).toBeDefined();
    expect(p.total_price_try).toBeGreaterThan(0);
    expect(p.original_currency).toBe("TRY");
    expect(p.exchange_rate).toBe(1);
    expect("paid_amount" in p).toBe(false);
  });
});
