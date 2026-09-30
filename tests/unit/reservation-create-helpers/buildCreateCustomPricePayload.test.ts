import { describe, it, expect } from "vitest";

import { buildCreateCustomPricePayload } from "@/app/(admin)/maki-admin/reservations/ekle/_helpers/buildCreateCustomPricePayload";

import { baseCreateData, villaWithCleaning } from "./_fixtures";

/* ===============================================================
   🛡️ FAZ 5 — buildCreateCustomPricePayload UNIT TESTS
   ===============================================================
   Pure INSERT payload builder. Custom branch — multi-currency yok;
   tüm financial snapshot manuel total üzerinden kurulur.
=============================================================== */

const startDate = new Date(2026, 5, 1); // 1 Haz 2026 (LOCAL)
const endDate = new Date(2026, 5, 8); // 8 Haz 2026
const startISO = "2026-06-01";
const endISO = "2026-06-08";

describe("buildCreateCustomPricePayload — happy path", () => {
  it("produces a complete INSERT shape with custom flags", () => {
    const payload = buildCreateCustomPricePayload({
      data: {
        ...baseCreateData,
        custom_price: true,
        custom_price_note: "VIP rate",
        total_price_try: 50000,
        total_price: 50000,
      },
      guestNames: ["Misafir 2", "Misafir 3"],
      startDate,
      endDate,
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      startISO,
      endISO,
    });

    expect(payload).toMatchObject({
      villa_id: "villa-1",
      name: "Ahmet Yılmaz",
      phone: "+905551112233",
      email: "ahmet@example.com",
      identity_number: "12345678901",
      country: "TR",
      city: "Antalya",
      address: "Test mah. 1 sok.",
      start_date: "2026-06-01",
      end_date: "2026-06-08",
      status: "pending",
      total_price: 50000,
      total_price_try: 50000,
      original_price: 0,
      original_currency: "TRY",
      original_cleaning_fee: 0,
      original_cleaning_currency: "TRY",
      cleaning_fee_try: 0,
      exchange_rate: 1,
      custom_price: true,
      custom_price_note: "VIP rate",
      payment_preference: "prepayment",
      payment_method_id: "pm-1",
      damage_deposit: 3000,
      guests: 4,
      guest_names: ["Misafir 2", "Misafir 3"],
    });
  });
});

describe("buildCreateCustomPricePayload — prepayment derivation", () => {
  it("computes prepayment = total * rate / 100 (prepayment preference)", () => {
    const payload = buildCreateCustomPricePayload({
      data: {
        ...baseCreateData,
        custom_price: true,
        total_price_try: 100000,
        payment_preference: "prepayment",
      },
      guestNames: [],
      startDate,
      endDate,
      prepaymentRate: 25,
      selectedVilla: villaWithCleaning,
      startISO,
      endISO,
    });
    expect(payload.prepayment_amount).toBe(25000);
    expect(payload.remaining_payment).toBe(75000);
  });

  it("full_payment → prepayment_amount=total, remaining=0", () => {
    const payload = buildCreateCustomPricePayload({
      data: {
        ...baseCreateData,
        custom_price: true,
        total_price_try: 80000,
        payment_preference: "full_payment",
      },
      guestNames: [],
      startDate,
      endDate,
      prepaymentRate: 30,
      selectedVilla: villaWithCleaning,
      startISO,
      endISO,
    });
    expect(payload.prepayment_amount).toBe(80000);
    expect(payload.remaining_payment).toBe(0);
  });
});

describe("buildCreateCustomPricePayload — coercion + defaults", () => {
  it("falls back to total_price when total_price_try is 0", () => {
    const payload = buildCreateCustomPricePayload({
      data: {
        ...baseCreateData,
        custom_price: true,
        total_price_try: 0,
        total_price: 12345,
      },
      guestNames: [],
      startDate,
      endDate,
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      startISO,
      endISO,
    });
    expect(payload.total_price).toBe(12345);
    expect(payload.total_price_try).toBe(12345);
  });

  it("filters empty guest_names entries", () => {
    const payload = buildCreateCustomPricePayload({
      data: { ...baseCreateData, custom_price: true, total_price_try: 50000 },
      guestNames: ["", " ", "Misafir 2", "  Misafir 3  "],
      startDate,
      endDate,
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      startISO,
      endISO,
    });
    expect(payload.guest_names).toEqual(["Misafir 2", "Misafir 3"]);
  });

  it("custom_price_note empty string → null in payload", () => {
    const payload = buildCreateCustomPricePayload({
      data: {
        ...baseCreateData,
        custom_price: true,
        custom_price_note: "",
        total_price_try: 50000,
      },
      guestNames: [],
      startDate,
      endDate,
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      startISO,
      endISO,
    });
    expect(payload.custom_price_note).toBeNull();
  });

  it("missing payment_method_id → null in payload", () => {
    const payload = buildCreateCustomPricePayload({
      data: {
        ...baseCreateData,
        custom_price: true,
        payment_method_id: null,
        total_price_try: 50000,
      },
      guestNames: [],
      startDate,
      endDate,
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      startISO,
      endISO,
    });
    expect(payload.payment_method_id).toBeNull();
  });

  it("selectedVilla null → damage_deposit=0", () => {
    const payload = buildCreateCustomPricePayload({
      data: { ...baseCreateData, custom_price: true, total_price_try: 50000 },
      guestNames: [],
      startDate,
      endDate,
      prepaymentRate: 20,
      selectedVilla: null,
      startISO,
      endISO,
    });
    expect(payload.damage_deposit).toBe(0);
  });
});

describe("buildCreateCustomPricePayload — invariants (regression guard)", () => {
  it("custom_price flag is always true and multi-currency is neutralized", () => {
    const payload = buildCreateCustomPricePayload({
      data: {
        ...baseCreateData,
        custom_price: true,
        total_price_try: 50000,
        original_price: 9999, // bilinçli kirli; payload nötrlemeli
        original_currency: "EUR",
        original_cleaning_fee: 50,
        original_cleaning_currency: "EUR",
        cleaning_fee_try: 2500,
        exchange_rate: 40,
      },
      guestNames: [],
      startDate,
      endDate,
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      startISO,
      endISO,
    });
    expect(payload.custom_price).toBe(true);
    expect(payload.original_price).toBe(0);
    expect(payload.original_currency).toBe("TRY");
    expect(payload.original_cleaning_fee).toBe(0);
    expect(payload.original_cleaning_currency).toBe("TRY");
    expect(payload.cleaning_fee_try).toBe(0);
    expect(payload.exchange_rate).toBe(1);
  });
});
