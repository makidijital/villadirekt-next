/* ===============================================================
   🛡️ HAVUZ ISITMA — Admin YENİ REZERVASYON (/ekle) custom price
   ===============================================================
   buildCreateCustomPricePayload — custom price INSERT payload'ı
   havuz ısıtmayı her zaman nötrler (0/false). [id] admin edit'in
   buildCustomPricePayload.pool-heating.test.ts testiyle AYNI desen:
   custom total tek düz TRY tutarı — havuz ısıtma ayrı satır olarak
   taşınmaz, checkbox da custom price'ta gizlenir (PriceStep.tsx).
=============================================================== */

import { describe, it, expect } from "vitest";

import { buildCreateCustomPricePayload } from "@/app/(admin)/maki-admin/reservations/ekle/_helpers/buildCreateCustomPricePayload";

import { baseCreateData, villaWithPoolHeating } from "./_fixtures";

const startDate = new Date("2026-07-01T00:00:00Z");
const endDate = new Date("2026-07-06T00:00:00Z");
const startISO = "2026-07-01";
const endISO = "2026-07-06";

describe("buildCreateCustomPricePayload — havuz ısıtma her zaman nötrlenir", () => {
  it("data.pool_heating_selected=true olsa bile payload'da false/0 olarak yazılır", () => {
    const payload = buildCreateCustomPricePayload({
      data: {
        ...baseCreateData,
        custom_price: true,
        total_price_try: 30000,
        pool_heating_selected: true,
        pool_heating_total_try: 5000,
        original_pool_heating_total: 5000,
        original_pool_heating_currency: "TRY",
      },
      guestNames: [],
      startDate,
      endDate,
      prepaymentRate: 20,
      selectedVilla: villaWithPoolHeating,
      startISO,
      endISO,
    });

    expect(payload.pool_heating_selected).toBe(false);
    expect(payload.pool_heating_total_try).toBe(0);
    expect(payload.original_pool_heating_total).toBe(0);
    expect(payload.original_pool_heating_currency).toBe("TRY");
    // multi-currency alanlarla AYNI nötrleme deseni (regresyon)
    expect(payload.original_price).toBe(0);
    expect(payload.cleaning_fee_try).toBe(0);
  });

  it("havuz ısıtması olmayan custom price rezervasyonunda da aynı sabit değerler (regresyon)", () => {
    const payload = buildCreateCustomPricePayload({
      data: { ...baseCreateData, custom_price: true, total_price_try: 30000 },
      guestNames: [],
      startDate,
      endDate,
      prepaymentRate: 20,
      selectedVilla: villaWithPoolHeating,
      startISO,
      endISO,
    });

    expect(payload.pool_heating_selected).toBe(false);
    expect(payload.pool_heating_total_try).toBe(0);
    expect(payload.custom_price).toBe(true);
    expect(payload.total_price_try).toBe(30000);
  });
});
