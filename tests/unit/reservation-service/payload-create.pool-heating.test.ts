import { describe, it, expect } from "vitest";

import { buildCreateReservationPayload } from "@/app/services/reservation/_helpers/payload-create";

import type { ReservationCreateInput } from "@/app/services/reservation/types";

/* ===============================================================
   🛡️ HAVUZ ISITMA — 6. adım — buildCreateReservationPayload EK TESTLER
   ===============================================================
   Mevcut payload-create.test.ts DOKUNULMADI. Burada yalnız YENİ pool
   heating snapshot alanları (always-write coercion — cleaning fee ile
   BİREBİR desen) test edilir.
=============================================================== */

const minimalInput: ReservationCreateInput = {
  villa_id: "villa-1",
  start_date: "2026-06-01",
  end_date: "2026-06-08",
  total_price: 50000,
  name: "Ahmet Yılmaz",
  phone: "+905551112233",
};

describe("buildCreateReservationPayload — havuz ısıtma defaults (regresyon — senaryo 8)", () => {
  it("pool heating alanları hiç verilmemişse → false/0/0/'TRY' (eski rezervasyon davranışı bozulmadı)", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect(p.pool_heating_selected).toBe(false);
    expect(p.original_pool_heating_total).toBe(0);
    expect(p.original_pool_heating_currency).toBe("TRY");
    expect(p.pool_heating_total_try).toBe(0);
  });

  it("her zaman alanları YAZAR — conditional spread DEĞİL (cleaning fee ile aynı always-write deseni)", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect("pool_heating_selected" in p).toBe(true);
    expect("original_pool_heating_total" in p).toBe(true);
    expect("original_pool_heating_currency" in p).toBe(true);
    expect("pool_heating_total_try" in p).toBe(true);
  });
});

describe("buildCreateReservationPayload — havuz ısıtma explicit değerler", () => {
  it("pool_heating_selected coerces via !! (truthy)", () => {
    const p = buildCreateReservationPayload({
      data: { ...minimalInput, pool_heating_selected: true },
      reservationCommissionAmount: 0,
    });
    expect(p.pool_heating_selected).toBe(true);
  });

  it("5 gece × 1.000 TL = 5.000 TL snapshot geçer", () => {
    const p = buildCreateReservationPayload({
      data: {
        ...minimalInput,
        pool_heating_selected: true,
        original_pool_heating_total: 5000,
        original_pool_heating_currency: "TRY",
        pool_heating_total_try: 5000,
      },
      reservationCommissionAmount: 0,
    });
    expect(p.original_pool_heating_total).toBe(5000);
    expect(p.original_pool_heating_currency).toBe("TRY");
    expect(p.pool_heating_total_try).toBe(5000);
  });

  it("original_pool_heating_currency verilmezse 'TRY' fallback", () => {
    const p = buildCreateReservationPayload({
      data: { ...minimalInput, pool_heating_selected: true, pool_heating_total_try: 5000 },
      reservationCommissionAmount: 0,
    });
    expect(p.original_pool_heating_currency).toBe("TRY");
  });

  it("original_pool_heating_total Number() || 0 ile coerce edilir", () => {
    const p = buildCreateReservationPayload({
      data: {
        ...minimalInput,
        // @ts-expect-error garbage input coercion testi
        original_pool_heating_total: "not-a-number",
      },
      reservationCommissionAmount: 0,
    });
    expect(p.original_pool_heating_total).toBe(0);
  });
});
