import { describe, it, expect } from "vitest";

import { buildPublicReservationPayload } from "@/app/components/reservation/_helpers/buildPublicReservationPayload";
import { initialPublicReservationFormData } from "@/app/components/reservation/_types/reservation-form-data";

/* ===============================================================
   🛡️ FAZ 4 — buildPublicReservationPayload UNIT TESTS
   ===============================================================
   Pure INSERT payload builder. Eski ReservationForm > handleSubmit
   inline createReservation arg'ından BYTE-IDENTICAL extract.
=============================================================== */

const baseInput = () => ({
  villa: { id: "villa-1", deposit: 5000 },
  start: "2026-06-01",
  end: "2026-06-08",
  form: {
    ...initialPublicReservationFormData(),
    name: "  Ahmet Yılmaz  ",      // trim test
    phone: "  05551112233  ",
    email: "  test@example.com  ",
    identity: "  12345678901  ",
    country: "TR",
    city: "Antalya",
    address: "Sok 1",
    note: "Note text",
    guests: "4",
    payment_method_id: "pm-1",
  },
  guestNames: ["Misafir 2", "Misafir 3", "  Misafir 4  "],
  snapshot: {
    total: 50000,
    cleaning: 1500,
    original_currency: "TRY",
    original_cleaning_currency: "TRY",
    original_stay: 0,
    original_cleaning: 0,
  },
  snapshotTotalTRY: 50000,
  snapshotCleaningTRY: 1500,
  snapshotPrepayment: 10000,
  snapshotRemaining: 40000,
  exchangeRate: 1,
  hasForeignCurrency: false,
});

describe("buildPublicReservationPayload — TRY-only happy path", () => {
  it("emits villa_id + dates + TRY snapshot", () => {
    const p = buildPublicReservationPayload(baseInput());
    expect(p.villa_id).toBe("villa-1");
    expect(p.start_date).toBe("2026-06-01");
    expect(p.end_date).toBe("2026-06-08");
    expect(p.total_price).toBe(50000);
    expect(p.total_price_try).toBe(50000);
    expect(p.cleaning_fee_try).toBe(1500);
    expect(p.exchange_rate).toBe(1);
  });

  it("emits TRY originals when no foreign currency", () => {
    const p = buildPublicReservationPayload(baseInput());
    expect(p.original_price).toBe(0);
    expect(p.original_currency).toBe("TRY");
    expect(p.original_cleaning_fee).toBe(0);
    expect(p.original_cleaning_currency).toBe("TRY");
  });

  it("financial snapshot", () => {
    const p = buildPublicReservationPayload(baseInput());
    expect(p.prepayment_amount).toBe(10000);
    expect(p.remaining_payment).toBe(40000);
    expect(p.paid_amount).toBe(0);
  });

  it("damage_deposit from villa.deposit", () => {
    const p = buildPublicReservationPayload(baseInput());
    expect(p.damage_deposit).toBe(5000);
  });

  it("payment_preference passes through", () => {
    const p = buildPublicReservationPayload({
      ...baseInput(),
      form: {
        ...baseInput().form,
        payment_preference: "full_payment",
      },
    });
    expect(p.payment_preference).toBe("full_payment");
  });
});

describe("buildPublicReservationPayload — trim() on user fields", () => {
  it("trims name/phone/email/identity", () => {
    const p = buildPublicReservationPayload(baseInput());
    expect(p.name).toBe("Ahmet Yılmaz");
    expect(p.phone).toBe("05551112233");
    expect(p.email).toBe("test@example.com");
    expect(p.identity_number).toBe("12345678901");
  });

  it("does NOT trim guest_names (admin asimetrisi — public raw array)", () => {
    const p = buildPublicReservationPayload(baseInput());
    /* Eski public davranış: guest_names raw geçer; .map(trim) YOK.
       Admin'de trim+filter var; public'te YOK — KORUNDU. */
    expect(p.guest_names).toEqual([
      "Misafir 2",
      "Misafir 3",
      "  Misafir 4  ", // not trimmed
    ]);
  });
});

describe("buildPublicReservationPayload — nullable fallbacks", () => {
  it("country/city/address default to null when empty", () => {
    const p = buildPublicReservationPayload({
      ...baseInput(),
      form: {
        ...baseInput().form,
        country: "",
        city: "",
        address: "",
      },
    });
    expect(p.country).toBeNull();
    expect(p.city).toBeNull();
    expect(p.address).toBeNull();
  });

  it("note defaults to null when empty", () => {
    const p = buildPublicReservationPayload({
      ...baseInput(),
      form: { ...baseInput().form, note: "" },
    });
    expect(p.note).toBeNull();
  });

  it("guests defaults to 1 when empty string", () => {
    const p = buildPublicReservationPayload({
      ...baseInput(),
      form: { ...baseInput().form, guests: "" },
    });
    expect(p.guests).toBe(1);
  });
});

describe("buildPublicReservationPayload — foreign currency snapshot", () => {
  it("preserves foreign original stay + cleaning when snapshot is foreign", () => {
    const p = buildPublicReservationPayload({
      ...baseInput(),
      snapshot: {
        total: 100000,
        cleaning: 2500,
        original_currency: "EUR",
        original_cleaning_currency: "EUR",
        original_stay: 1000,
        original_cleaning: 25,
      },
      snapshotTotalTRY: 100000,
      snapshotCleaningTRY: 2500,
      exchangeRate: 40,
      hasForeignCurrency: true,
    });

    expect(p.original_price).toBe(1000);
    expect(p.original_currency).toBe("EUR");
    expect(p.original_cleaning_fee).toBe(25);
    expect(p.original_cleaning_currency).toBe("EUR");
    expect(p.exchange_rate).toBe(40);
  });

  it("exchange_rate = 1 when hasForeignCurrency is false (overrides input)", () => {
    const p = buildPublicReservationPayload({
      ...baseInput(),
      exchangeRate: 35,
      hasForeignCurrency: false,
    });
    expect(p.exchange_rate).toBe(1);
  });
});

describe("buildPublicReservationPayload — damage_deposit coercion", () => {
  it("coerces villa.deposit via Number() || 0", () => {
    const p = buildPublicReservationPayload({
      ...baseInput(),
      villa: { id: "v", deposit: "7500" }, // string → 7500
    });
    expect(p.damage_deposit).toBe(7500);
  });

  it("0 when villa.deposit missing", () => {
    const p = buildPublicReservationPayload({
      ...baseInput(),
      villa: { id: "v" },
    });
    expect(p.damage_deposit).toBe(0);
  });
});
