import { describe, it, expect } from "vitest";

import { buildPublicReservationPayload } from "@/app/components/reservation/_helpers/buildPublicReservationPayload";
import { initialPublicReservationFormData } from "@/app/components/reservation/_types/reservation-form-data";

/* ===============================================================
   🛡️ HAVUZ ISITMA — 6. adım — buildPublicReservationPayload EK TESTLER
   ===============================================================
   Mevcut buildPublicReservationPayload.test.ts DOKUNULMADI (regresyon
   kanıtı — o dosya poolHeatingSelected/snapshotPoolHeatingTRY hiç
   geçmeden aynı sonucu üretmeye devam ediyor, bkz. senaryo 8/9).
   Burada yalnız YENİ pool heating alanları test edilir.
=============================================================== */

const baseInput = () => ({
  villa: { id: "villa-1", deposit: 5000 },
  start: "2026-10-05",
  end: "2026-10-10", // 5 gece
  form: {
    ...initialPublicReservationFormData(),
    name: "Ahmet Yılmaz",
    phone: "05551112233",
    email: "test@example.com",
    identity: "12345678901",
    country: "TR",
    city: "Antalya",
    address: "Sok 1",
    note: "",
    guests: "2",
    payment_method_id: "pm-1",
  },
  guestNames: [],
  snapshot: {
    total: 28500,
    cleaning: 3500,
    original_currency: "TRY",
    original_cleaning_currency: "TRY",
    original_stay: 0,
    original_cleaning: 0,
    poolHeating: 5000,
    original_pool_heating: 0,
    original_pool_heating_currency: "TRY",
  },
  snapshotTotalTRY: 28500,
  snapshotCleaningTRY: 3500,
  snapshotPrepayment: 4000,
  snapshotRemaining: 24500,
  exchangeRate: 1,
  hasForeignCurrency: false,
});

describe("buildPublicReservationPayload — havuz ısıtma (6. adım)", () => {
  it("poolHeatingSelected=false (varsayılan/geçilmedi) → pool_heating_selected=false, total=0", () => {
    const p = buildPublicReservationPayload(baseInput());
    expect(p.pool_heating_selected).toBe(false);
    expect(p.original_pool_heating_total).toBe(0);
    expect(p.original_pool_heating_currency).toBe("TRY");
    // snapshotPoolHeatingTRY de geçilmedi → undefined; payload-create.ts
    // katmanında Number(undefined)||0 ile 0'a coerce edilir; burada
    // ham payload'da field hâlâ mevcut (undefined olabilir) — kritik olan
    // pool_heating_selected'in false olması.
  });

  it("poolHeatingSelected=true, TRY villa → pool_heating_selected=true, TRY snapshot 0/'TRY' (foreign ternary)", () => {
    const p = buildPublicReservationPayload({
      ...baseInput(),
      poolHeatingSelected: true,
      snapshotPoolHeatingTRY: 5000,
    });
    expect(p.pool_heating_selected).toBe(true);
    // original_currency TRY ise ternary 0/"TRY" döner (cleaning fee ile
    // BİREBİR aynı desen).
    expect(p.original_pool_heating_total).toBe(0);
    expect(p.original_pool_heating_currency).toBe("TRY");
    expect(p.pool_heating_total_try).toBe(5000);
  });

  it("döviz villa (EUR) → original_pool_heating_total/currency gerçek villa değerini taşır", () => {
    const p = buildPublicReservationPayload({
      ...baseInput(),
      poolHeatingSelected: true,
      snapshotPoolHeatingTRY: 16500,
      snapshot: {
        ...baseInput().snapshot,
        original_pool_heating: 500,
        original_pool_heating_currency: "EUR",
      },
    });
    expect(p.original_pool_heating_total).toBe(500);
    expect(p.original_pool_heating_currency).toBe("EUR");
    expect(p.pool_heating_total_try).toBe(16500);
  });

  it("poolHeatingSelected/snapshotPoolHeatingTRY hiç geçilmezse mevcut (pool-heating-öncesi) davranış bozulmaz (regresyon)", () => {
    const { poolHeatingSelected, snapshotPoolHeatingTRY, ...withoutPoolHeating } =
      { ...baseInput(), poolHeatingSelected: undefined, snapshotPoolHeatingTRY: undefined };
    void poolHeatingSelected;
    void snapshotPoolHeatingTRY;
    const p = buildPublicReservationPayload(withoutPoolHeating);
    expect(p.total_price).toBe(28500);
    expect(p.cleaning_fee_try).toBe(3500);
    expect(p.prepayment_amount).toBe(4000);
    expect(p.remaining_payment).toBe(24500);
    expect(p.pool_heating_selected).toBe(false);
  });
});
