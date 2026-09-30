import { describe, it, expect } from "vitest";

import { computeReservationPriceRecalc } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/computeReservationPriceRecalc";

import type { ReservationDetailData } from "@/app/(admin)/maki-admin/reservations/[id]/_types/reservation-form-data";

/* ===============================================================
   🛡️ FAZ 5 — computeReservationPriceRecalc UNIT TESTS
   ===============================================================
   En kritik helper. 4-path discriminated union; eski page.tsx
   useEffect body BYTE-IDENTICAL.
=============================================================== */

const startDate = new Date(2026, 5, 1);
const endDate = new Date(2026, 5, 8);

const rates = { TRY: 1, USD: 35, EUR: 40 };

const baseData = {
  id: "res-1",
  villa_id: "villa-1",
  villa: null,
  custom_price: false,
  total_price_try: 50000,
  cleaning_fee_try: 1500,
  original_price: 0,
  original_currency: "TRY",
  original_cleaning_fee: 0,
  original_cleaning_currency: "TRY",
  paid_amount: 0,
} as unknown as ReservationDetailData;

const prices = [
  { start_date: "2026-05-01", end_date: "2026-10-31", price: 5000, currency: "TRY" },
];

describe("computeReservationPriceRecalc — clear branch", () => {
  it("returns clear when startDate is null", () => {
    const r = computeReservationPriceRecalc({
      data: baseData,
      startDate: null,
      endDate,
      prices,
      rates,
      originalStartDate: null,
      originalEndDate: null,
      originalVillaId: null,
      selectedVilla: null,
      prepaymentRate: 20,
    });
    expect(r.kind).toBe("clear");
  });

  it("returns clear when endDate is null", () => {
    const r = computeReservationPriceRecalc({
      data: baseData,
      startDate,
      endDate: null,
      prices,
      rates,
      originalStartDate: null,
      originalEndDate: null,
      originalVillaId: null,
      selectedVilla: null,
      prepaymentRate: 20,
    });
    expect(r.kind).toBe("clear");
  });

  it("returns clear when prices is empty", () => {
    const r = computeReservationPriceRecalc({
      data: baseData,
      startDate,
      endDate,
      prices: [],
      rates,
      originalStartDate: null,
      originalEndDate: null,
      originalVillaId: null,
      selectedVilla: null,
      prepaymentRate: 20,
    });
    expect(r.kind).toBe("clear");
  });
});

describe("computeReservationPriceRecalc — custom_price branch", () => {
  it("data.custom_price=true → custom_price branch", () => {
    const r = computeReservationPriceRecalc({
      data: { ...baseData, custom_price: true, total_price_try: 12345, start_date: "2026-06-01", end_date: "2026-06-08" } as unknown as ReservationDetailData,
      startDate,
      endDate,
      prices,
      rates,
      originalStartDate: null,
      originalEndDate: null,
      originalVillaId: null,
      selectedVilla: null,
      prepaymentRate: 20,
    });
    expect(r.kind).toBe("custom_price");
    if (r.kind === "custom_price") {
      expect(r.priceDetail.total).toBe(12345);
      expect(r.priceDetail.cleaning).toBe(0);
      expect(r.priceDetail.currency).toBe("TRY");
      expect(r.dataPatch).toBeNull(); // start/end already match
    }
  });

  it("custom_price + date drift → dataPatch with start/end sync", () => {
    const r = computeReservationPriceRecalc({
      data: { ...baseData, custom_price: true, start_date: "2026-05-15", end_date: "2026-05-22" } as unknown as ReservationDetailData,
      startDate,
      endDate,
      prices,
      rates,
      originalStartDate: null,
      originalEndDate: null,
      originalVillaId: null,
      selectedVilla: null,
      prepaymentRate: 20,
    });
    expect(r.kind).toBe("custom_price");
    if (r.kind === "custom_price") {
      expect(r.dataPatch).not.toBeNull();
      expect(r.dataPatch?.start_date).toBe("2026-06-01");
      expect(r.dataPatch?.end_date).toBe("2026-06-08");
    }
  });
});

describe("computeReservationPriceRecalc — snapshot branch (no recalc)", () => {
  it("no date change + no villa change → snapshot (priceDetail only)", () => {
    const r = computeReservationPriceRecalc({
      data: baseData,
      startDate,
      endDate,
      prices,
      rates,
      originalStartDate: "2026-06-01",
      originalEndDate: "2026-06-08",
      originalVillaId: "villa-1",
      selectedVilla: null,
      prepaymentRate: 20,
    });
    expect(r.kind).toBe("snapshot");
    if (r.kind === "snapshot") {
      expect(r.priceDetail.total).toBe(50000);
      expect(r.priceDetail.cleaning).toBe(1500);
      expect(r.priceDetail.stay).toBe(48500); // 50000 - 1500
    }
  });
});

describe("computeReservationPriceRecalc — recalc branch", () => {
  it("date changed → triggers recalc (TRY-only path)", () => {
    const r = computeReservationPriceRecalc({
      data: baseData,
      startDate,
      endDate,
      prices,
      rates,
      originalStartDate: "2026-07-01",
      originalEndDate: "2026-07-08",
      originalVillaId: "villa-1",
      selectedVilla: { cleaning_fee: 1500, cleaning_currency: "TRY", cleaning_limit: 0 },
      prepaymentRate: 20,
    });
    expect(r.kind).toBe("recalc");
    if (r.kind === "recalc") {
      expect(r.dataPatch.start_date).toBe("2026-06-01");
      expect(r.dataPatch.end_date).toBe("2026-06-08");
      expect(r.dataPatch.total_price_try).toBeGreaterThan(0);
      expect("paid_amount" in r.dataPatch).toBe(false); // KORUNUR
    }
  });

  it("villa changed → triggers recalc", () => {
    const r = computeReservationPriceRecalc({
      data: { ...baseData, villa_id: "villa-NEW" } as unknown as ReservationDetailData,
      startDate,
      endDate,
      prices,
      rates,
      originalStartDate: "2026-06-01",
      originalEndDate: "2026-06-08",
      originalVillaId: "villa-1",
      selectedVilla: { cleaning_fee: 1500, cleaning_currency: "TRY", cleaning_limit: 0 },
      prepaymentRate: 20,
    });
    expect(r.kind).toBe("recalc");
  });
});
