/* ===============================================================
   🛡️ PHASE 1 — buildReservationBeforeSnapshot (freeze)
   ===============================================================
   Audit log "before_data" snapshot — saveAll çağrıldığında `data`
   state'inin O ANKİ haliyle aynı 17 alanı seçer. Tam DB snapshot'ı
   DEĞİL (helper notunda da yazılı); mevcut davranış.

   Bu testler:
     • alan kümesinin (key set) ve sırasının değişmediğini
     • null/undefined alanların aynen aktarıldığını
     • değer dönüşümü/coercion YAPILMADIĞINI
   freeze eder.
=============================================================== */

import { describe, it, expect } from "vitest";
import { buildReservationBeforeSnapshot } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/buildReservationBeforeSnapshot";
import { asReservation, baseReservation } from "./_fixtures";

describe("buildReservationBeforeSnapshot — shape contract", () => {
  it("returns exactly the 18 documented fields in declaration order", () => {
    const snapshot = buildReservationBeforeSnapshot(
      asReservation(baseReservation)
    );

    // Field-set freeze — yeni alan eklenirse audit log kontratı
    // değişir, bilinçli güncelleme gerekir.
    expect(Object.keys(snapshot)).toEqual([
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
      "note",
    ]);
  });

  it("copies every field value as-is (no coercion)", () => {
    const snapshot = buildReservationBeforeSnapshot(
      asReservation(baseReservation)
    );
    expect(snapshot).toEqual({
      id: "res-1",
      villa_id: "villa-1",
      name: "Ahmet Yılmaz",
      email: "ahmet@example.com",
      phone: "+905551112233",
      phone2: "+4915112345678",
      start_date: "2026-06-01",
      end_date: "2026-06-08",
      guests: 4,
      status: "pending",
      total_price: 50000,
      original_currency: "TRY",
      paid_amount: 0,
      prepayment_amount: 10000,
      remaining_payment: 40000,
      payment_preference: "prepayment",
      payment_method_id: "pm-1",
      note: null,
    });
  });
});

describe("buildReservationBeforeSnapshot — null preservation", () => {
  it("preserves null values without coercing them to default sentinel", () => {
    const input = asReservation({
      ...baseReservation,
      email: null,
      guests: null,
      total_price: null,
      original_currency: null,
      paid_amount: null,
      prepayment_amount: null,
      remaining_payment: null,
      payment_method_id: null,
      note: null,
    });

    const snapshot = buildReservationBeforeSnapshot(input);

    expect(snapshot.email).toBeNull();
    expect(snapshot.guests).toBeNull();
    expect(snapshot.total_price).toBeNull();
    expect(snapshot.original_currency).toBeNull();
    expect(snapshot.paid_amount).toBeNull();
    expect(snapshot.prepayment_amount).toBeNull();
    expect(snapshot.remaining_payment).toBeNull();
    expect(snapshot.payment_method_id).toBeNull();
    expect(snapshot.note).toBeNull();
  });
});
