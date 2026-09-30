import { describe, it, expect } from "vitest";

import {
  normalizeCustomPrepaymentRate,
  normalizeTourismDocumentNumber,
  normalizeMinimumStayNights,
  normalizeYouTubeVideosForDb,
  normalizeCommissionRate,
  DEFAULT_COMMISSION_RATE,
} from "@/app/services/villa-admin/_helpers/normalizers";

/* ===============================================================
   🛡️ FAZ 5 — VILLA ADMIN NORMALIZER UNIT TESTS
   ===============================================================
   5 pure normalizer. Eski createVillaFull + updateVillaFull
   inline body'sinden BYTE-IDENTICAL extract edildi. Bu testler
   regression guard.
=============================================================== */

describe("normalizeCustomPrepaymentRate", () => {
  it("returns null for empty string, null, undefined", () => {
    expect(normalizeCustomPrepaymentRate("")).toBeNull();
    expect(normalizeCustomPrepaymentRate(null)).toBeNull();
    expect(normalizeCustomPrepaymentRate(undefined)).toBeNull();
  });

  it("coerces string number to number", () => {
    expect(normalizeCustomPrepaymentRate("25")).toBe(25);
    expect(normalizeCustomPrepaymentRate("0")).toBe(0);
    expect(normalizeCustomPrepaymentRate("100.5")).toBe(100.5);
  });

  it("passes finite number as-is", () => {
    expect(normalizeCustomPrepaymentRate(30)).toBe(30);
    expect(normalizeCustomPrepaymentRate(0)).toBe(0);
  });

  it("NaN-equivalent input returns NaN (matches old runtime behavior)", () => {
    /* Eski inline kod: `=== "" || === null || === undefined ? null : Number(raw)`
       "abc" → Number("abc") → NaN. Davranış preserve. */
    expect(Number.isNaN(normalizeCustomPrepaymentRate("abc"))).toBe(true);
  });
});

describe("normalizeTourismDocumentNumber", () => {
  it("returns null for empty string, null, undefined", () => {
    expect(normalizeTourismDocumentNumber("")).toBeNull();
    expect(normalizeTourismDocumentNumber(null)).toBeNull();
    expect(normalizeTourismDocumentNumber(undefined)).toBeNull();
  });

  it("passes string as-is (no sanitize/format)", () => {
    expect(normalizeTourismDocumentNumber("ABC-123-XYZ")).toBe("ABC-123-XYZ");
    expect(normalizeTourismDocumentNumber("  spaced  ")).toBe("  spaced  ");
  });
});

describe("normalizeMinimumStayNights", () => {
  it("returns null for null, undefined", () => {
    expect(normalizeMinimumStayNights(null)).toBeNull();
    expect(normalizeMinimumStayNights(undefined)).toBeNull();
  });

  it("returns null for zero or negative numbers", () => {
    expect(normalizeMinimumStayNights(0)).toBeNull();
    expect(normalizeMinimumStayNights(-1)).toBeNull();
  });

  it("returns null for non-finite numbers", () => {
    expect(normalizeMinimumStayNights(NaN)).toBeNull();
    expect(normalizeMinimumStayNights(Infinity)).toBeNull();
  });

  it("returns Math.floor for positive numbers", () => {
    expect(normalizeMinimumStayNights(1)).toBe(1);
    expect(normalizeMinimumStayNights(7)).toBe(7);
    expect(normalizeMinimumStayNights(7.9)).toBe(7);
    expect(normalizeMinimumStayNights(2.1)).toBe(2);
  });
});

describe("normalizeYouTubeVideosForDb", () => {
  it("returns null for empty/undefined/null input", () => {
    expect(normalizeYouTubeVideosForDb(null)).toBeNull();
    expect(normalizeYouTubeVideosForDb(undefined)).toBeNull();
    expect(normalizeYouTubeVideosForDb([])).toBeNull();
  });

  it("returns normalized array for valid videos", () => {
    const result = normalizeYouTubeVideosForDb([
      { id: "dQw4w9WgXcQ", url: "https://youtube.com/watch?v=dQw4w9WgXcQ" },
    ]);
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result?.length).toBeGreaterThan(0);
  });

  it("dedups + filters invalid → null when all invalid", () => {
    /* Geçersiz ID (11 char değil) → drop. Hepsi geçersiz → empty → null. */
    const result = normalizeYouTubeVideosForDb([
      { id: "short", url: "https://youtube.com/?v=short" },
    ]);
    expect(result).toBeNull();
  });
});

describe("normalizeCommissionRate", () => {
  it("returns DEFAULT (20) for null, undefined, empty", () => {
    expect(normalizeCommissionRate(null)).toBe(DEFAULT_COMMISSION_RATE);
    expect(normalizeCommissionRate(undefined)).toBe(DEFAULT_COMMISSION_RATE);
    expect(normalizeCommissionRate("")).toBe(DEFAULT_COMMISSION_RATE);
  });

  it("returns DEFAULT for out-of-range values", () => {
    expect(normalizeCommissionRate(-1)).toBe(DEFAULT_COMMISSION_RATE);
    expect(normalizeCommissionRate(101)).toBe(DEFAULT_COMMISSION_RATE);
    expect(normalizeCommissionRate("abc")).toBe(DEFAULT_COMMISSION_RATE);
    expect(normalizeCommissionRate(NaN)).toBe(DEFAULT_COMMISSION_RATE);
  });

  it("accepts 0 (zero commission is valid)", () => {
    expect(normalizeCommissionRate(0)).toBe(0);
    expect(normalizeCommissionRate("0")).toBe(0);
  });

  it("accepts boundary 100", () => {
    expect(normalizeCommissionRate(100)).toBe(100);
    expect(normalizeCommissionRate("100")).toBe(100);
  });

  it("coerces string number in range", () => {
    expect(normalizeCommissionRate("15")).toBe(15);
    expect(normalizeCommissionRate("15.5")).toBe(15.5);
  });

  it("passes finite number in range as-is", () => {
    expect(normalizeCommissionRate(15)).toBe(15);
    expect(normalizeCommissionRate(50)).toBe(50);
  });
});

describe("DEFAULT_COMMISSION_RATE", () => {
  it("is 20 (regression guard — UI ile tutarlı fallback)", () => {
    expect(DEFAULT_COMMISSION_RATE).toBe(20);
  });
});
