import { describe, it, expect } from "vitest";

import { computeCustomPriceAmountChange } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/computeCustomPriceAmountChange";

import type { ReservationDetailData } from "@/app/(admin)/maki-admin/reservations/[id]/_types/reservation-form-data";

const prev = {
  paid_amount: 5000,
} as unknown as ReservationDetailData;

describe("computeCustomPriceAmountChange", () => {
  it("sets total_price and total_price_try to newAmount", () => {
    const p = computeCustomPriceAmountChange({
      prev,
      newAmount: 50000,
      prepaymentRate: 20,
    });
    expect(p.total_price).toBe(50000);
    expect(p.total_price_try).toBe(50000);
  });

  it("computes prepayment = round(total × rate / 100)", () => {
    expect(
      computeCustomPriceAmountChange({ prev, newAmount: 50000, prepaymentRate: 20 })
        .prepayment_amount
    ).toBe(10000);
    expect(
      computeCustomPriceAmountChange({ prev, newAmount: 33333, prepaymentRate: 30 })
        .prepayment_amount
    ).toBe(10000);
  });

  it("remaining_payment = max(newAmount - paid_amount, 0)", () => {
    expect(
      computeCustomPriceAmountChange({ prev: { paid_amount: 5000 } as ReservationDetailData, newAmount: 10000, prepaymentRate: 20 })
        .remaining_payment
    ).toBe(5000);
    expect(
      computeCustomPriceAmountChange({ prev: { paid_amount: 20000 } as ReservationDetailData, newAmount: 10000, prepaymentRate: 20 })
        .remaining_payment
    ).toBe(0);
  });

  it("nullifies multi-currency fields (original_*, cleaning_*, exchange_rate=1)", () => {
    const p = computeCustomPriceAmountChange({ prev, newAmount: 50000, prepaymentRate: 20 });
    expect(p.original_price).toBe(0);
    expect(p.original_currency).toBe("TRY");
    expect(p.original_cleaning_fee).toBe(0);
    expect(p.original_cleaning_currency).toBe("TRY");
    expect(p.cleaning_fee_try).toBe(0);
    expect(p.exchange_rate).toBe(1);
  });

  it("does NOT include paid_amount in patch (preserve prev)", () => {
    const p = computeCustomPriceAmountChange({ prev, newAmount: 50000, prepaymentRate: 20 });
    expect("paid_amount" in p).toBe(false);
  });

  it("coerces falsy paid_amount via Number() || 0", () => {
    const p = computeCustomPriceAmountChange({
      prev: { paid_amount: null } as unknown as ReservationDetailData,
      newAmount: 10000,
      prepaymentRate: 20,
    });
    expect(p.remaining_payment).toBe(10000); // paid → 0 → 10000-0
  });
});
