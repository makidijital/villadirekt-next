/* ===============================================================
   🛡️ HAVUZ ISITMA — 8. adım (Admin edit doğruluk düzeltmesi)
   ===============================================================
   buildNormalPayload — kayıt (save) anındaki payload'ın 3-parametreli
   accommodationBase kullandığını ve `data.pool_heating_*` alanlarının
   her zaman (always-write, cleaning_fee_try ile aynı desen) DB
   payload'ına yazıldığını doğrular.
=============================================================== */

import { describe, it, expect } from "vitest";
import { buildNormalPayload } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/buildNormalPayload";
import { asReservation, baseReservation } from "./_fixtures";

describe("buildNormalPayload — 8. adım: havuz ısıtma always-write", () => {
  it("worked example: accommodationBase 3. parametre ile ön ödeme havuz ısıtmayı İÇERMEZ", () => {
    const payload = buildNormalPayload({
      data: asReservation({
        ...baseReservation,
        total_price_try: 28500,
        cleaning_fee_try: 3500,
        pool_heating_selected: true,
        pool_heating_total_try: 5000,
        original_pool_heating_total: 5000,
        original_pool_heating_currency: "TRY",
        payment_preference: "prepayment",
      }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });

    expect(payload.pool_heating_selected).toBe(true);
    expect(payload.pool_heating_total_try).toBe(5000);
    expect(payload.original_pool_heating_total).toBe(5000);
    expect(payload.original_pool_heating_currency).toBe("TRY");
    // Konaklama (accommodation base) = 28.500 - 3.500 - 5.000 = 20.000
    // Ön ödeme %20 = 4.000
    expect(payload.prepayment_amount).toBe(4000);
    expect(payload.remaining_payment).toBe(24500);
  });

  it("regresyon: baseReservation (havuz ısıtması yok) → eski davranış birebir korunur", () => {
    const payload = buildNormalPayload({
      data: asReservation({
        ...baseReservation,
        total_price_try: 50000,
        cleaning_fee_try: 2500,
        payment_preference: "prepayment",
      }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });

    expect(payload.pool_heating_selected).toBe(false);
    expect(payload.pool_heating_total_try).toBe(0);
    // accommodationBase(50000, 2500, 0) = 47500 → %20 = 9500
    expect(payload.prepayment_amount).toBe(9500);
    expect(payload.remaining_payment).toBe(40500);
  });

  it("full_payment tercihinde de havuz ısıtma alanları doğru persist edilir (prepayment matematiğine dahil değil, snapshot olarak yazılır)", () => {
    const payload = buildNormalPayload({
      data: asReservation({
        ...baseReservation,
        total_price_try: 28500,
        cleaning_fee_try: 3500,
        pool_heating_selected: true,
        pool_heating_total_try: 5000,
        payment_preference: "full_payment",
      }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });

    expect(payload.pool_heating_total_try).toBe(5000);
    expect(payload.prepayment_amount).toBe(28500); // full_payment → total
    expect(payload.remaining_payment).toBe(0);
  });
});
