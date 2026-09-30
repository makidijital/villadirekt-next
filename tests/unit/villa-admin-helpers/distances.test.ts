import { describe, it, expect } from "vitest";

import { sanitizeDistances } from "@/app/services/villa-admin/_helpers/distances";

/* ===============================================================
   🛡️ FAZ 5 — sanitizeDistances UNIT TESTS
   ===============================================================
   Pure helper. Nullable VillaDistanceInput'tan strict
   {title:string; distance:string}[] çıkarır.
=============================================================== */

describe("sanitizeDistances", () => {
  it("returns [] for null / undefined / non-array", () => {
    expect(sanitizeDistances(null)).toEqual([]);
    expect(sanitizeDistances(undefined)).toEqual([]);
  });

  it("returns [] for empty array", () => {
    expect(sanitizeDistances([])).toEqual([]);
  });

  it("passes valid rows through with trim", () => {
    expect(
      sanitizeDistances([
        { title: "Plaj", distance: "500m" },
        { title: "  Market  ", distance: "  1km  " },
      ])
    ).toEqual([
      { title: "Plaj", distance: "500m" },
      { title: "Market", distance: "1km" },
    ]);
  });

  it("filters rows with empty title", () => {
    expect(
      sanitizeDistances([
        { title: "", distance: "500m" },
        { title: "   ", distance: "1km" },
      ])
    ).toEqual([]);
  });

  it("filters rows with empty distance", () => {
    expect(
      sanitizeDistances([
        { title: "Plaj", distance: "" },
        { title: "Market", distance: "   " },
      ])
    ).toEqual([]);
  });

  it("filters rows with null/undefined title or distance", () => {
    expect(
      sanitizeDistances([
        { title: null, distance: "500m" },
        { title: "Plaj", distance: null },
        { title: undefined, distance: undefined },
      ])
    ).toEqual([]);
  });

  it("mixes valid + invalid rows correctly", () => {
    expect(
      sanitizeDistances([
        { title: "Plaj", distance: "500m" },
        { title: "", distance: "1km" },
        { title: "Market", distance: "" },
        { title: "Havalimanı", distance: "30km" },
      ])
    ).toEqual([
      { title: "Plaj", distance: "500m" },
      { title: "Havalimanı", distance: "30km" },
    ]);
  });
});
