import { describe, it, expect } from "vitest";

import { buildCreateReservationPayload } from "@/app/services/reservation/_helpers/payload-create";

import type { ReservationCreateInput } from "@/app/services/reservation/types";

/* ===============================================================
   🛡️ FAZ 5 — buildCreateReservationPayload UNIT TESTS
   ===============================================================
   Pure INSERT payload builder. Eski `createReservation` inline
   body'sinden BYTE-IDENTICAL extract.
=============================================================== */

const minimalInput: ReservationCreateInput = {
  villa_id: "villa-1",
  start_date: "2026-06-01",
  end_date: "2026-06-08",
  total_price: 50000,
  name: "Ahmet Yılmaz",
  phone: "+905551112233",
};

describe("buildCreateReservationPayload — required fields", () => {
  it("preserves villa_id, start_date, end_date, name, phone", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect(p.villa_id).toBe("villa-1");
    expect(p.start_date).toBe("2026-06-01");
    expect(p.end_date).toBe("2026-06-08");
    expect(p.name).toBe("Ahmet Yılmaz");
    expect(p.phone).toBe("+905551112233");
  });

  it("status is hardcoded 'pending'", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect(p.status).toBe("pending");
  });
});

describe("buildCreateReservationPayload — numeric coercion", () => {
  it("total_price defaults to 0 when missing/falsy", () => {
    const p = buildCreateReservationPayload({
      data: { ...minimalInput, total_price: 0 },
      reservationCommissionAmount: 0,
    });
    expect(p.total_price).toBe(0);
  });

  it("guests defaults to 1 (not 0)", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect(p.guests).toBe(1);
  });

  it("exchange_rate defaults to 1 when not provided", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect(p.exchange_rate).toBe(1);
  });

  it("original_price defaults to 0", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect(p.original_price).toBe(0);
  });
});

describe("buildCreateReservationPayload — string defaults", () => {
  it("original_currency defaults to TRY", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect(p.original_currency).toBe("TRY");
  });

  it("original_cleaning_currency defaults to TRY", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect(p.original_cleaning_currency).toBe("TRY");
  });

  it("email / identity / country / city / address default to null", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect(p.email).toBeNull();
    expect(p.identity_number).toBeNull();
    expect(p.country).toBeNull();
    expect(p.city).toBeNull();
    expect(p.address).toBeNull();
  });

  it("note defaults to null when not provided", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect(p.note).toBeNull();
  });

  it("guest_names defaults to [] when not provided", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect(p.guest_names).toEqual([]);
  });
});

describe("buildCreateReservationPayload — conditional spread", () => {
  it("prepayment_amount NOT in payload when undefined", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect("prepayment_amount" in p).toBe(false);
  });

  it("paid_amount defaults to 0 when undefined (NOT omitted)", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    /* paid_amount conditional has fallback: { paid_amount: 0 } when undefined.
       Bu önemli — diğer alanlardan farklı: undefined → 0 fallback YAZILIR. */
    expect(p.paid_amount).toBe(0);
  });

  it("custom_price NOT in payload when undefined", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect("custom_price" in p).toBe(false);
    expect("custom_price_note" in p).toBe(false);
  });

  it("payment_preference NOT in payload when undefined", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect("payment_preference" in p).toBe(false);
  });

  it("damage_deposit NOT in payload when undefined", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect("damage_deposit" in p).toBe(false);
  });

  it("payment_preference 'full_payment' passes through", () => {
    const p = buildCreateReservationPayload({
      data: { ...minimalInput, payment_preference: "full_payment" },
      reservationCommissionAmount: 0,
    });
    expect(p.payment_preference).toBe("full_payment");
  });

  it("payment_preference invalid → coerces to 'prepayment'", () => {
    const p = buildCreateReservationPayload({
      data: {
        ...minimalInput,
        /* @ts-expect-error garbage input */
        payment_preference: "garbage",
      },
      reservationCommissionAmount: 0,
    });
    expect(p.payment_preference).toBe("prepayment");
  });

  it("custom_price coerces to boolean via !!", () => {
    const p = buildCreateReservationPayload({
      data: { ...minimalInput, custom_price: true },
      reservationCommissionAmount: 0,
    });
    expect(p.custom_price).toBe(true);
  });

  it("damage_deposit coerces via Number() || 0", () => {
    const p = buildCreateReservationPayload({
      data: { ...minimalInput, damage_deposit: 5000 },
      reservationCommissionAmount: 0,
    });
    expect(p.damage_deposit).toBe(5000);
  });

  it("commission_amount snapshot passes through", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 12345,
    });
    expect(p.reservation_commission_amount).toBe(12345);
  });
});

describe("buildCreateReservationPayload — guest_names pass-through", () => {
  it("preserves provided guest_names array", () => {
    const p = buildCreateReservationPayload({
      data: { ...minimalInput, guest_names: ["Misafir 2", "Misafir 3"] },
      reservationCommissionAmount: 0,
    });
    expect(p.guest_names).toEqual(["Misafir 2", "Misafir 3"]);
  });
});

describe("buildCreateReservationPayload — payment_method_id ?? null", () => {
  it("null when undefined", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect(p.payment_method_id).toBeNull();
  });

  it("preserves explicit null", () => {
    const p = buildCreateReservationPayload({
      data: { ...minimalInput, payment_method_id: null },
      reservationCommissionAmount: 0,
    });
    expect(p.payment_method_id).toBeNull();
  });

  it("passes through string id", () => {
    const p = buildCreateReservationPayload({
      data: { ...minimalInput, payment_method_id: "pm-1" },
      reservationCommissionAmount: 0,
    });
    expect(p.payment_method_id).toBe("pm-1");
  });
});
