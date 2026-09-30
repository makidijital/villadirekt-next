/* ===============================================================
   🛡️ PHASE 1 — normalizeStatusKey (production behavior freeze)
   ===============================================================
   Helper:  (value || "").toString().toLowerCase().trim()

   Bu testler "ideal" davranışı değil, MEVCUT pattern'i freeze eder.
   Özellikle JS truthy/falsy semantic'i (0 / false / "" → empty)
   beklendiği gibi koruma altında.
=============================================================== */

import { describe, it, expect } from "vitest";
import { normalizeStatusKey } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/normalizeStatusKey";

describe("normalizeStatusKey", () => {
  it("lowercases canonical status values", () => {
    expect(normalizeStatusKey("CONFIRMED")).toBe("confirmed");
    expect(normalizeStatusKey("Pending")).toBe("pending");
    expect(normalizeStatusKey("REJECTED")).toBe("rejected");
    expect(normalizeStatusKey("Cancelled")).toBe("cancelled");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeStatusKey("  confirmed  ")).toBe("confirmed");
    expect(normalizeStatusKey("\tpending\n")).toBe("pending");
  });

  it("returns empty string for null / undefined", () => {
    expect(normalizeStatusKey(null)).toBe("");
    expect(normalizeStatusKey(undefined)).toBe("");
  });

  it("returns empty string for empty / whitespace-only", () => {
    expect(normalizeStatusKey("")).toBe("");
    expect(normalizeStatusKey("   ")).toBe("");
  });

  it("coerces non-string values via toString()", () => {
    expect(normalizeStatusKey(123)).toBe("123");
    expect(normalizeStatusKey(true)).toBe("true");
  });

  it("collapses falsy primitives to empty string (|| short-circuit)", () => {
    // Production pattern: (value || "").toString() — 0, false, NaN,
    // null, undefined hepsi `|| ""` fallback'inden geçer.
    expect(normalizeStatusKey(0)).toBe("");
    expect(normalizeStatusKey(false)).toBe("");
    expect(normalizeStatusKey(NaN)).toBe("");
  });
});
