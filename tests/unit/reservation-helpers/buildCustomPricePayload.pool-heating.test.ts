/* ===============================================================
   🛡️ HAVUZ ISITMA — 8. adım (Admin edit doğruluk düzeltmesi)
   ===============================================================
   buildCustomPricePayload — custom price kayıt payload'ı havuz
   ısıtmayı her zaman nötrler (0/false) — computeCustomPriceToggle
   TOGGLE ON'daki local-state nötrlemesini save anında DB'ye kalıcı
   yazar (eski sağlayıcı partial-update stale değer bırakmasın diye).
   Custom price = tek düz TRY tutar, itemization yok — bu davranış
   YENİDEN TASARLANMADI, mevcut cleaning-fee nötrleme deseni genişletildi.
=============================================================== */

import { describe, it, expect } from "vitest";
import { buildCustomPricePayload } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/buildCustomPricePayload";
import { asReservation, customPriceReservation } from "./_fixtures";

describe("buildCustomPricePayload — 8. adım: havuz ısıtma her zaman nötrlenir", () => {
  it("data.pool_heating_selected=true olsa bile payload'da false/0 olarak persist edilir", () => {
    const payload = buildCustomPricePayload({
      data: asReservation({
        ...customPriceReservation,
        pool_heating_selected: true,
        pool_heating_total_try: 5000,
        original_pool_heating_total: 5000,
        original_pool_heating_currency: "TRY",
      }),
      guestNames: [],
      prepaymentRate: 20,
    });

    expect(payload.pool_heating_selected).toBe(false);
    expect(payload.pool_heating_total_try).toBe(0);
    expect(payload.original_pool_heating_total).toBe(0);
    expect(payload.original_pool_heating_currency).toBe("TRY");
  });

  it("havuz ısıtması olmayan custom price rezervasyonunda da aynı sabit değerler (regresyon)", () => {
    const payload = buildCustomPricePayload({
      data: asReservation(customPriceReservation),
      guestNames: [],
      prepaymentRate: 20,
    });

    expect(payload.pool_heating_selected).toBe(false);
    expect(payload.pool_heating_total_try).toBe(0);
    expect(payload.original_pool_heating_total).toBe(0);
    expect(payload.original_pool_heating_currency).toBe("TRY");
  });
});
