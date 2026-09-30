import { describe, it, expect } from "vitest";

import {
  safeCommissionRate,
  calcCommissionAmount,
  DEFAULT_COMMISSION_RATE,
} from "@/app/services/reservation/_helpers/commission";

/* ===============================================================
   🛡️ FAZ 5 — commission helpers UNIT TESTS
   ===============================================================
   Pure helpers. Eski `reservation.service.ts` inline body'sinden
   BYTE-IDENTICAL extract. Regression guard.
=============================================================== */

describe("safeCommissionRate", () => {
  it("returns finite in-range number as-is", () => {
    expect(safeCommissionRate(0)).toBe(0);
    expect(safeCommissionRate(15)).toBe(15);
    expect(safeCommissionRate(50)).toBe(50);
    expect(safeCommissionRate(100)).toBe(100);
  });

  it("returns DEFAULT (20) for null/undefined", () => {
    expect(safeCommissionRate(null)).toBe(DEFAULT_COMMISSION_RATE);
    expect(safeCommissionRate(undefined)).toBe(DEFAULT_COMMISSION_RATE);
  });

  it("returns DEFAULT for non-number types", () => {
    expect(safeCommissionRate("15")).toBe(DEFAULT_COMMISSION_RATE);
    expect(safeCommissionRate(true)).toBe(DEFAULT_COMMISSION_RATE);
    expect(safeCommissionRate({})).toBe(DEFAULT_COMMISSION_RATE);
  });

  it("returns DEFAULT for non-finite numbers", () => {
    expect(safeCommissionRate(NaN)).toBe(DEFAULT_COMMISSION_RATE);
    expect(safeCommissionRate(Infinity)).toBe(DEFAULT_COMMISSION_RATE);
    expect(safeCommissionRate(-Infinity)).toBe(DEFAULT_COMMISSION_RATE);
  });

  it("returns DEFAULT for out-of-range numbers", () => {
    expect(safeCommissionRate(-1)).toBe(DEFAULT_COMMISSION_RATE);
    expect(safeCommissionRate(101)).toBe(DEFAULT_COMMISSION_RATE);
    expect(safeCommissionRate(-0.5)).toBe(DEFAULT_COMMISSION_RATE);
  });
});

describe("DEFAULT_COMMISSION_RATE", () => {
  it("is 20 (regression guard — service-side fallback değeri)", () => {
    expect(DEFAULT_COMMISSION_RATE).toBe(20);
  });
});

describe("calcCommissionAmount", () => {
  it("computes base × rate/100", () => {
    expect(calcCommissionAmount(10000, 20)).toBe(2000);
    expect(calcCommissionAmount(50000, 15)).toBe(7500);
    expect(calcCommissionAmount(1000, 50)).toBe(500);
  });

  it("returns 0 when base is 0", () => {
    expect(calcCommissionAmount(0, 20)).toBe(0);
  });

  it("returns 0 when base is negative", () => {
    expect(calcCommissionAmount(-100, 20)).toBe(0);
  });

  it("returns 0 when base is non-finite", () => {
    expect(calcCommissionAmount(NaN, 20)).toBe(0);
    expect(calcCommissionAmount(Infinity, 20)).toBe(0);
  });

  it("returns 0 for non-number base via Number()", () => {
    expect(calcCommissionAmount("abc", 20)).toBe(0);
    expect(calcCommissionAmount(null, 20)).toBe(0);
    expect(calcCommissionAmount(undefined, 20)).toBe(0);
  });

  it("coerces string number via Number()", () => {
    expect(calcCommissionAmount("10000", 20)).toBe(2000);
  });

  it("handles 0 rate (zero commission)", () => {
    expect(calcCommissionAmount(10000, 0)).toBe(0);
  });

  it("handles 100 rate (full commission)", () => {
    expect(calcCommissionAmount(10000, 100)).toBe(10000);
  });
});
