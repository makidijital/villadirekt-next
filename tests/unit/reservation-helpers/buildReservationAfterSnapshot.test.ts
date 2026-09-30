/* ===============================================================
   🛡️ PHASE 1 — buildReservationAfterSnapshot (freeze)
   ===============================================================
   Audit log "after_data" snapshot — saveAll'da DB write payload'ı
   yazıldıktan sonra logActivity'ye verilen 17 alanlı snapshot.

   Önemli: bazı alanlar `data` state'inden, çoğu alan `payload`
   objesinden okunuyor. Bu testler 17-alan kontratını ve hangi
   alanın hangi kaynaktan geldiğini freeze eder. Özellikle
   `custom_price: payload.custom_price` davranışı: hem normal hem
   custom path için doğru flag'i taşıyor.
=============================================================== */

import { describe, it, expect } from "vitest";
import { buildReservationAfterSnapshot } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/buildReservationAfterSnapshot";
import type { ReservationUpdatePayloadShape } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/buildCustomPricePayload";
import { asReservation, baseReservation } from "./_fixtures";

function buildPayload(
  overrides: Partial<ReservationUpdatePayloadShape> = {}
): ReservationUpdatePayloadShape {
  return {
    villa_id: "villa-1",
    name: "Ahmet Yılmaz",
    phone: "+905551112233",
    phone2: "+4915112345678",
    email: "ahmet@example.com",
    identity_number: "12345678901",
    country: "Türkiye",
    city: "Antalya",
    address: null,
    start_date: "2026-06-01",
    end_date: "2026-06-08",
    total_price: 50000,
    total_price_try: 50000,
    original_price: 0,
    original_currency: "TRY",
    original_cleaning_fee: 0,
    original_cleaning_currency: "TRY",
    cleaning_fee_try: 2500,
    exchange_rate: 1,
    // 🔥 HAVUZ ISITMA — 8. adım. ReservationUpdatePayloadShape'e eklenen
    // 4 zorunlu alan (buildCustomPricePayload.ts). buildReservationAfterSnapshot
    // bu alanları OKUMUYOR (17-alan kontratı değişmedi) — yalnız tip
    // uyumluluğu için eklendi.
    pool_heating_selected: false,
    original_pool_heating_total: 0,
    original_pool_heating_currency: "TRY",
    pool_heating_total_try: 0,
    prepayment_amount: 10000,
    remaining_payment: 40000,
    paid_amount: 0,
    custom_price: false,
    custom_price_note: null,
    payment_preference: "prepayment",
    payment_link: null,
    guests: 4,
    guest_names: [],
    note: null,
    status: "pending",
    payment_method_id: "pm-1",
    ...overrides,
  };
}

describe("buildReservationAfterSnapshot — shape contract", () => {
  it("returns the 18 documented fields", () => {
    const result = buildReservationAfterSnapshot({
      id: "res-1",
      data: asReservation(baseReservation),
      payload: buildPayload(),
    });

    expect(Object.keys(result)).toEqual([
      "id",
      "villa_id",
      "name",
      "email",
      "phone",
      /* 🛡️ Migration 094 — audit log kontratına BİLİNÇLİ eklendi. */
      "phone2",
      "start_date",
      "end_date",
      "guests",
      "status",
      "total_price",
      "original_currency",
      "paid_amount",
      "prepayment_amount",
      "remaining_payment",
      "payment_preference",
      "payment_method_id",
      "custom_price",
    ]);
  });
});

describe("buildReservationAfterSnapshot — source-of-truth split", () => {
  it("reads id from input.id (not from data, not from payload)", () => {
    const result = buildReservationAfterSnapshot({
      id: "override-id-xyz",
      data: asReservation({ ...baseReservation, id: "data-id" }),
      payload: buildPayload(),
    });
    expect(result.id).toBe("override-id-xyz");
  });

  it("reads villa_id/name/email/phone from data", () => {
    const result = buildReservationAfterSnapshot({
      id: "res-1",
      data: asReservation({
        ...baseReservation,
        villa_id: "data-villa",
        name: "Data Name",
        email: "data@example.com",
        phone: "+900000000000",
      }),
      payload: buildPayload({
        villa_id: "payload-villa", // payload version IGNORED for these fields
        name: "Payload Name",
        email: "payload@example.com",
        phone: "+999999999999",
      }),
    });

    expect(result.villa_id).toBe("data-villa");
    expect(result.name).toBe("Data Name");
    expect(result.email).toBe("data@example.com");
    expect(result.phone).toBe("+900000000000");
  });

  it("reads financial / date / status fields from payload (not data)", () => {
    const result = buildReservationAfterSnapshot({
      id: "res-1",
      data: asReservation({
        ...baseReservation,
        start_date: "1999-01-01",
        end_date: "1999-01-02",
        guests: 1,
        total_price: 999,
        status: "pending",
      }),
      payload: buildPayload({
        start_date: "2026-07-01",
        end_date: "2026-07-10",
        guests: 6,
        status: "confirmed",
        total_price: 80000,
        original_currency: "EUR",
        paid_amount: 20000,
        prepayment_amount: 16000,
        remaining_payment: 64000,
        payment_preference: "full_payment",
        payment_method_id: "pm-99",
      }),
    });

    expect(result.start_date).toBe("2026-07-01");
    expect(result.end_date).toBe("2026-07-10");
    expect(result.guests).toBe(6);
    expect(result.status).toBe("confirmed");
    expect(result.total_price).toBe(80000);
    expect(result.original_currency).toBe("EUR");
    expect(result.paid_amount).toBe(20000);
    expect(result.prepayment_amount).toBe(16000);
    expect(result.remaining_payment).toBe(64000);
    expect(result.payment_preference).toBe("full_payment");
    expect(result.payment_method_id).toBe("pm-99");
  });

  it("custom_price flag mirrors payload.custom_price (true variant)", () => {
    const result = buildReservationAfterSnapshot({
      id: "res-1",
      data: asReservation(baseReservation),
      payload: buildPayload({ custom_price: true }),
    });
    expect(result.custom_price).toBe(true);
  });

  it("custom_price flag mirrors payload.custom_price (false variant)", () => {
    const result = buildReservationAfterSnapshot({
      id: "res-1",
      data: asReservation(baseReservation),
      payload: buildPayload({ custom_price: false }),
    });
    expect(result.custom_price).toBe(false);
  });
});
