/* ===============================================================
   🛡️ PHASE 1 — buildCustomPricePayload (freeze)
   ===============================================================
   Custom price KAYIT payload. Multi-currency YOK; tüm financial
   snapshot manuel total üzerinden kurulur. Bu helper byte-identical
   olarak orijinal inline payload'dan çıkarıldı; test'in görevi
   coercion / rounding / fallback davranışını koruma altına almak.

   Kritik freeze noktaları:
     • customTotal: total_price_try öncelikli, sonra total_price, sonra 0
     • Math.round(total * rate / 100) banker's-rounding YOK; standart
       JS Math.round (yarıyı yukarı atar, half-to-even DEĞİL)
     • payment_link trim + "" → null coercion
     • guest_names trim + boş filtre
     • payment_method_id "" → null coercion
     • custom_price = true sabit
     • normalizePaymentPreference fallback
=============================================================== */

import { describe, it, expect } from "vitest";
import { buildCustomPricePayload } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/buildCustomPricePayload";
import { asReservation, customPriceReservation } from "./_fixtures";

describe("buildCustomPricePayload — financial snapshot", () => {
  it("computes prepayment via Math.round(total * rate / 100), prepayment branch", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        total_price_try: 100000,
        paid_amount: 25000,
        payment_preference: "prepayment",
      }),
      guestNames: [],
      prepaymentRate: 20,
    });

    expect(payload.total_price).toBe(100000);
    expect(payload.total_price_try).toBe(100000);
    expect(payload.prepayment_amount).toBe(20000); // 100000 * 20 / 100
    expect(payload.remaining_payment).toBe(80000); // 100000 - 20000
    expect(payload.paid_amount).toBe(25000); // paid_amount preserved
  });

  it("rounds prepayment to nearest integer (Math.round, half-up)", () => {
    // 12345 * 20 / 100 = 2469 (exact). 12350 * 33 / 100 = 4075.5 → 4076 (half-up)
    const r = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        total_price_try: 12350,
        payment_preference: "prepayment",
      }),
      guestNames: [],
      prepaymentRate: 33,
    });
    expect(r.prepayment_amount).toBe(4076);
  });

  it("full_payment branch sets prepayment=total, remaining=0", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        total_price_try: 75000,
        paid_amount: 0,
        payment_preference: "full_payment",
      }),
      guestNames: [],
      prepaymentRate: 20,
    });

    expect(payload.prepayment_amount).toBe(75000);
    expect(payload.remaining_payment).toBe(0);
  });

  it("falls back to total_price when total_price_try is 0 / falsy", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        total_price_try: 0,
        total_price: 33000,
      }),
      guestNames: [],
      prepaymentRate: 20,
    });
    expect(payload.total_price).toBe(33000);
    expect(payload.total_price_try).toBe(33000);
  });

  it("defaults total to 0 when both total_price_try and total_price are missing", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        total_price_try: null,
        total_price: null,
      }),
      guestNames: [],
      prepaymentRate: 20,
    });
    expect(payload.total_price).toBe(0);
    expect(payload.prepayment_amount).toBe(0);
    expect(payload.remaining_payment).toBe(0);
  });

  it("defaults paid_amount to 0 when missing", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        paid_amount: null,
      }),
      guestNames: [],
      prepaymentRate: 20,
    });
    expect(payload.paid_amount).toBe(0);
  });
});

describe("buildCustomPricePayload — fixed (non-multi-currency) fields", () => {
  it("forces original_* fields, cleaning_fee_try=0, exchange_rate=1", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        original_currency: "EUR", // these are IGNORED in custom path
        original_cleaning_currency: "USD",
        exchange_rate: 100,
      }),
      guestNames: [],
      prepaymentRate: 20,
    });

    expect(payload.original_price).toBe(0);
    expect(payload.original_currency).toBe("TRY");
    expect(payload.original_cleaning_fee).toBe(0);
    expect(payload.original_cleaning_currency).toBe("TRY");
    expect(payload.cleaning_fee_try).toBe(0);
    expect(payload.exchange_rate).toBe(1);
  });

  it("sets custom_price=true and persists custom_price_note", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        custom_price_note: "VIP rate negotiated",
      }),
      guestNames: [],
      prepaymentRate: 20,
    });
    expect(payload.custom_price).toBe(true);
    expect(payload.custom_price_note).toBe("VIP rate negotiated");
  });

  it("coerces empty / null custom_price_note to null", () => {
    const empty = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        custom_price_note: "",
      }),
      guestNames: [],
      prepaymentRate: 20,
    });
    expect(empty.custom_price_note).toBeNull();

    const nulled = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        custom_price_note: null,
      }),
      guestNames: [],
      prepaymentRate: 20,
    });
    expect(nulled.custom_price_note).toBeNull();
  });
});

describe("buildCustomPricePayload — payment_link coercion", () => {
  it("trims and persists non-empty payment_link", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        payment_link: "  https://pay.example/abc  ",
      }),
      guestNames: [],
      prepaymentRate: 20,
    });
    expect(payload.payment_link).toBe("https://pay.example/abc");
  });

  it("coerces whitespace-only payment_link to null", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        payment_link: "   ",
      }),
      guestNames: [],
      prepaymentRate: 20,
    });
    expect(payload.payment_link).toBeNull();
  });

  it("coerces null payment_link to null", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        payment_link: null,
      }),
      guestNames: [],
      prepaymentRate: 20,
    });
    expect(payload.payment_link).toBeNull();
  });
});

describe("buildCustomPricePayload — guest_names cleanup", () => {
  it("trims each name and filters out empty strings", () => {
    const payload = buildCustomPricePayload({
      data: asReservation(customPriceReservation),
      guestNames: ["  Alice ", "", "Bob", "   ", " Carol"],
      prepaymentRate: 20,
    });
    expect(payload.guest_names).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("returns empty array when all names are empty/whitespace", () => {
    const payload = buildCustomPricePayload({
      data: asReservation(customPriceReservation),
      guestNames: ["", "   ", "\t"],
      prepaymentRate: 20,
    });
    expect(payload.guest_names).toEqual([]);
  });
});

describe("buildCustomPricePayload — payment_method_id coercion", () => {
  it("coerces empty string to null", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        payment_method_id: "",
      }),
      guestNames: [],
      prepaymentRate: 20,
    });
    expect(payload.payment_method_id).toBeNull();
  });

  it("preserves valid payment_method_id", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        payment_method_id: "pm-bank-wire",
      }),
      guestNames: [],
      prepaymentRate: 20,
    });
    expect(payload.payment_method_id).toBe("pm-bank-wire");
  });
});

describe("buildCustomPricePayload — payment_preference normalization", () => {
  it("falls back to 'prepayment' for null / unknown values", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        payment_preference: null,
      }),
      guestNames: [],
      prepaymentRate: 20,
    });
    expect(payload.payment_preference).toBe("prepayment");
  });

  it("preserves 'full_payment' as-is", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        payment_preference: "full_payment",
      }),
      guestNames: [],
      prepaymentRate: 20,
    });
    expect(payload.payment_preference).toBe("full_payment");
  });
});

describe("buildCustomPricePayload — pass-through fields", () => {
  it("copies villa/contact/date/note/status/guests as-is", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        villa_id: "villa-X",
        name: "Test",
        phone: "+901112223344",
        email: "x@y.z",
        identity_number: "99",
        country: "TR",
        city: "Antalya",
        address: "Some address",
        start_date: "2026-08-01",
        end_date: "2026-08-05",
        guests: 5,
        note: "Late check-in",
        status: "confirmed",
      }),
      guestNames: [],
      prepaymentRate: 20,
    });

    expect(payload.villa_id).toBe("villa-X");
    expect(payload.name).toBe("Test");
    expect(payload.phone).toBe("+901112223344");
    expect(payload.email).toBe("x@y.z");
    expect(payload.identity_number).toBe("99");
    expect(payload.country).toBe("TR");
    expect(payload.city).toBe("Antalya");
    expect(payload.address).toBe("Some address");
    expect(payload.start_date).toBe("2026-08-01");
    expect(payload.end_date).toBe("2026-08-05");
    expect(payload.guests).toBe(5);
    expect(payload.note).toBe("Late check-in");
    expect(payload.status).toBe("confirmed");
  });
});
