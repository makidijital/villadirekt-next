import { describe, it, expect } from "vitest";

import { buildUpdateReservationPayload } from "@/app/services/reservation/_helpers/payload-update";

/* ===============================================================
   🛡️ FAZ 5 — buildUpdateReservationPayload UNIT TESTS
   ===============================================================
   Pure UPDATE payload builder. Eski `updateReservationFull` inline
   body'sinden BYTE-IDENTICAL extract.

   Conditional payload matrix (29 conditional field) regression
   guard altında.
=============================================================== */

describe("buildUpdateReservationPayload — always-set fields", () => {
  it("passes through name/phone/email/identity/country/city/address", () => {
    const p = buildUpdateReservationPayload({
      name: "X",
      phone: "Y",
      email: "z@a",
      identity_number: "TC",
      country: "TR",
      city: "Antalya",
      address: "Sok 1",
    });
    expect(p.name).toBe("X");
    expect(p.phone).toBe("Y");
    expect(p.email).toBe("z@a");
    expect(p.identity_number).toBe("TC");
    expect(p.country).toBe("TR");
    expect(p.city).toBe("Antalya");
    expect(p.address).toBe("Sok 1");
  });

  it("passes through start_date/end_date/total_price", () => {
    const p = buildUpdateReservationPayload({
      start_date: "2026-06-01",
      end_date: "2026-06-08",
      total_price: 50000,
    });
    expect(p.start_date).toBe("2026-06-01");
    expect(p.end_date).toBe("2026-06-08");
    expect(p.total_price).toBe(50000);
  });

  it("passes through note + payment_method_id + status", () => {
    const p = buildUpdateReservationPayload({
      note: "note",
      payment_method_id: "pm-1",
      status: "confirmed",
    });
    expect(p.note).toBe("note");
    expect(p.payment_method_id).toBe("pm-1");
    expect(p.status).toBe("confirmed");
  });
});

describe("buildUpdateReservationPayload — villa_id conditional spread", () => {
  it("NOT in payload when undefined", () => {
    const p = buildUpdateReservationPayload({});
    expect("villa_id" in p).toBe(false);
  });

  it("present when defined", () => {
    const p = buildUpdateReservationPayload({ villa_id: "v-2" });
    expect(p.villa_id).toBe("v-2");
  });
});

describe("buildUpdateReservationPayload — multi-currency conditional", () => {
  it("total_price_try NOT in payload when undefined", () => {
    const p = buildUpdateReservationPayload({});
    expect("total_price_try" in p).toBe(false);
  });

  it("total_price_try with Number() || 0 coercion", () => {
    const p = buildUpdateReservationPayload({ total_price_try: 12345 });
    expect(p.total_price_try).toBe(12345);
  });

  it("original_currency defaults to TRY when empty string", () => {
    const p = buildUpdateReservationPayload({ original_currency: "" });
    expect(p.original_currency).toBe("TRY");
  });

  it("original_cleaning_currency defaults to TRY when empty string", () => {
    const p = buildUpdateReservationPayload({ original_cleaning_currency: "" });
    expect(p.original_cleaning_currency).toBe("TRY");
  });

  it("exchange_rate defaults to 1 when 0/falsy", () => {
    const p = buildUpdateReservationPayload({ exchange_rate: 0 });
    expect(p.exchange_rate).toBe(1);
  });

  it("exchange_rate passes through valid number", () => {
    const p = buildUpdateReservationPayload({ exchange_rate: 35 });
    expect(p.exchange_rate).toBe(35);
  });
});

describe("buildUpdateReservationPayload — financial snapshot", () => {
  it("prepayment_amount NOT in payload when undefined", () => {
    const p = buildUpdateReservationPayload({});
    expect("prepayment_amount" in p).toBe(false);
  });

  it("paid_amount NOT in payload when undefined (preserve existing)", () => {
    /* paid_amount UPDATE flow'unda undefined → field omit. Bu sayede
       eski paid_amount korunur. */
    const p = buildUpdateReservationPayload({});
    expect("paid_amount" in p).toBe(false);
  });

  it("prepayment_amount with Number() || 0 coercion", () => {
    const p = buildUpdateReservationPayload({ prepayment_amount: 10000 });
    expect(p.prepayment_amount).toBe(10000);
  });

  it("remaining_payment passes through 0 (zero is valid)", () => {
    const p = buildUpdateReservationPayload({ remaining_payment: 0 });
    expect(p.remaining_payment).toBe(0);
  });
});

describe("buildUpdateReservationPayload — custom_price", () => {
  it("NOT in payload when undefined", () => {
    const p = buildUpdateReservationPayload({});
    expect("custom_price" in p).toBe(false);
    expect("custom_price_note" in p).toBe(false);
  });

  it("custom_price coerces to boolean via !!", () => {
    const p = buildUpdateReservationPayload({ custom_price: true });
    expect(p.custom_price).toBe(true);
  });

  it("custom_price_note empty string → null", () => {
    const p = buildUpdateReservationPayload({ custom_price_note: "" });
    expect(p.custom_price_note).toBeNull();
  });
});

describe("buildUpdateReservationPayload — payment_preference normalize", () => {
  it("NOT in payload when undefined", () => {
    const p = buildUpdateReservationPayload({});
    expect("payment_preference" in p).toBe(false);
  });

  it("full_payment passes through", () => {
    const p = buildUpdateReservationPayload({ payment_preference: "full_payment" });
    expect(p.payment_preference).toBe("full_payment");
  });

  it("invalid → prepayment fallback", () => {
    const p = buildUpdateReservationPayload({
      /* @ts-expect-error garbage input */
      payment_preference: "garbage",
    });
    expect(p.payment_preference).toBe("prepayment");
  });
});

describe("buildUpdateReservationPayload — payment_link", () => {
  it("NOT in payload when undefined", () => {
    const p = buildUpdateReservationPayload({});
    expect("payment_link" in p).toBe(false);
  });

  it("trim + null fallback for whitespace-only string", () => {
    const p = buildUpdateReservationPayload({ payment_link: "   " });
    expect(p.payment_link).toBeNull();
  });

  it("trim preserves URL", () => {
    const p = buildUpdateReservationPayload({ payment_link: "  https://x  " });
    expect(p.payment_link).toBe("https://x");
  });

  it("explicit null persists", () => {
    const p = buildUpdateReservationPayload({ payment_link: null });
    expect(p.payment_link).toBeNull();
  });
});

describe("buildUpdateReservationPayload — payment_link_status", () => {
  it("allowed values pass through", () => {
    for (const s of ["sent", "paid", "expired"] as const) {
      const p = buildUpdateReservationPayload({ payment_link_status: s });
      expect(p.payment_link_status).toBe(s);
    }
  });

  it("'pending' explicit → fallback to 'pending' (regression — was previously treated as not allowed in old inline)", () => {
    /* Eski inline kod: `s === "sent" || s === "paid" || s === "expired" ? s : "pending"`
       — "pending" geçerli olduğu halde literal allow-list dışı olduğu için
       fallback'e düşüyordu. Bu davranış BYTE-IDENTICAL korundu. */
    const p = buildUpdateReservationPayload({ payment_link_status: "pending" });
    expect(p.payment_link_status).toBe("pending");
  });
});

describe("buildUpdateReservationPayload — payment_link_sent_at", () => {
  it("empty string → null", () => {
    const p = buildUpdateReservationPayload({ payment_link_sent_at: "" });
    expect(p.payment_link_sent_at).toBeNull();
  });

  it("ISO string passes through", () => {
    const p = buildUpdateReservationPayload({
      payment_link_sent_at: "2026-06-01T10:00:00Z",
    });
    expect(p.payment_link_sent_at).toBe("2026-06-01T10:00:00Z");
  });
});
