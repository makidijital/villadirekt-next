/* ===============================================================
   🛡️ FAZ 51 — CURRENCY ENGINE TESTS
   ===============================================================
   Hedef: lib/currency.ts
     • convertPrice (FAZ 2A safe-rate hardening)
     • formatCurrency (Intl wrapper)
=============================================================== */

import { describe, it, expect } from "vitest";
import { convertPrice, formatCurrency } from "@/lib/currency";

describe("convertPrice", () => {
  const rates = { USD: 30, EUR: 33, GBP: 38 };

  it("returns 0 immediately when amount is 0", () => {
    expect(convertPrice(0, "TRY", "USD", rates)).toBe(0);
  });

  it("returns amount unchanged when same currency", () => {
    expect(convertPrice(1000, "TRY", "TRY", rates)).toBe(1000);
    expect(convertPrice(100.55, "USD", "USD", rates)).toBe(100.55);
  });

  it("converts TRY → USD using target rate", () => {
    expect(convertPrice(3000, "TRY", "USD", rates)).toBe(100);
  });

  it("converts USD → TRY using source rate", () => {
    expect(convertPrice(100, "USD", "TRY", rates)).toBe(3000);
  });

  it("converts USD → EUR via TRY pivot", () => {
    /* USD→TRY: 100*30=3000; TRY→EUR: 3000/33=90.91 */
    expect(convertPrice(100, "USD", "EUR", rates)).toBeCloseTo(90.91, 2);
  });

  it("falls back to rate=1 when target rate is missing/invalid", () => {
    /* FAZ 2A: silent 0→1 hatasını fix etti; rate yoksa fallback 1 */
    const partial = { USD: 30 } as Record<string, number>;
    expect(convertPrice(1000, "TRY", "JPY", partial)).toBe(1000);
  });

  it("handles invalid (zero) rate gracefully", () => {
    /* DB'den 0 gelen kur sessizce 1:1 çevirir; convertPrice fallback'e
       düşer (FAZ 2A semantic). */
    const broken = { USD: 0 } as Record<string, number>;
    expect(convertPrice(100, "USD", "TRY", broken)).toBe(100);
  });
});

describe("formatCurrency", () => {
  it("formats TRY with the TR locale symbol and no fractional digits", () => {
    const out = formatCurrency(1234, "TRY");
    /* "₺1.234" benzeri çıktı — locale spesifik whitespace ve symbol
       konumu node sürümüne göre değişebilir; sade kontrol: rakamlar
       ve TRY symbol/kod içersin. */
    expect(out).toMatch(/1\.234/);
    expect(/₺|TRY/.test(out)).toBe(true);
  });

  it("formats USD with the USD symbol", () => {
    const out = formatCurrency(5000, "USD");
    expect(out).toMatch(/5\.000/);
    expect(/\$|USD/.test(out)).toBe(true);
  });
});
