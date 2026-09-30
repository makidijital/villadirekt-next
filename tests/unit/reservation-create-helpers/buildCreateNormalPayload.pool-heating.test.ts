/* ===============================================================
   🛡️ HAVUZ ISITMA — Admin YENİ REZERVASYON (/ekle) entegrasyonu
   ===============================================================
   buildCreateNormalPayload — INSERT payload'ının 3-parametreli
   accommodationBase kullandığını ve `data.pool_heating_*` alanlarının
   her zaman (always-write, cleaning_fee_try ile aynı desen) DB
   payload'ına yazıldığını doğrular. [id] admin edit'in
   buildNormalPayload.pool-heating.test.ts testiyle AYNI worked
   example (Section 2): Konaklama 20.000, Temizlik 3.500, Havuz
   Isıtma 5.000, Toplam 28.500, %20 ön ödeme 4.000, Kalan 24.500.
=============================================================== */

import { describe, it, expect } from "vitest";

import { buildCreateNormalPayload } from "@/app/(admin)/maki-admin/reservations/ekle/_helpers/buildCreateNormalPayload";

import {
  baseCreateData,
  villaWithPoolHeating,
  villaWithCleaning,
  poolHeatingPriceDetail,
  tryPriceDetail,
  ratesFixture,
} from "./_fixtures";

const startISO = "2026-07-01";
const endISO = "2026-07-06";

describe("buildCreateNormalPayload — havuz ısıtma seçili (worked example)", () => {
  it("Konaklama 20.000, Temizlik 3.500, Havuz Isıtma 5.000, Toplam 28.500 → %20 ön ödeme 4.000, kalan 24.500", () => {
    const payload = buildCreateNormalPayload({
      data: {
        ...baseCreateData,
        total_price_try: 28500,
        cleaning_fee_try: 3500,
        pool_heating_selected: true,
        pool_heating_total_try: 5000,
        original_pool_heating_total: 5000,
        original_pool_heating_currency: "TRY",
      },
      guestNames: [],
      priceDetail: poolHeatingPriceDetail,
      prepaymentRate: 20,
      selectedVilla: villaWithPoolHeating,
      rates: ratesFixture,
      startISO,
      endISO,
    });

    expect(payload.pool_heating_selected).toBe(true);
    expect(payload.pool_heating_total_try).toBe(5000);
    expect(payload.original_pool_heating_total).toBe(5000);
    expect(payload.original_pool_heating_currency).toBe("TRY");
    // accommodationBase(28500, 3500, 5000) = 20000 → %20 = 4000
    expect(payload.prepayment_amount).toBe(4000);
    expect(payload.remaining_payment).toBe(24500);
  });

  it("full_payment tercihinde havuz ısıtma snapshot'ı yazılır (prepayment matematiğine dahil değil)", () => {
    const payload = buildCreateNormalPayload({
      data: {
        ...baseCreateData,
        total_price_try: 28500,
        cleaning_fee_try: 3500,
        pool_heating_selected: true,
        pool_heating_total_try: 5000,
        payment_preference: "full_payment",
      },
      guestNames: [],
      priceDetail: poolHeatingPriceDetail,
      prepaymentRate: 20,
      selectedVilla: villaWithPoolHeating,
      rates: ratesFixture,
      startISO,
      endISO,
    });

    expect(payload.pool_heating_total_try).toBe(5000);
    expect(payload.prepayment_amount).toBe(28500);
    expect(payload.remaining_payment).toBe(0);
  });
});

describe("buildCreateNormalPayload — havuz ısıtma seçili DEĞİL", () => {
  it("pool_heating_selected=false → pool_heating_total_try 0 yazılır, prepayment havuz ısıtmayı hesaba katmaz", () => {
    const payload = buildCreateNormalPayload({
      data: {
        ...baseCreateData,
        total_price_try: 23500,
        cleaning_fee_try: 3500,
        pool_heating_selected: false,
        pool_heating_total_try: 0,
      },
      guestNames: [],
      priceDetail: { ...poolHeatingPriceDetail, poolHeating: 0, total: 23500 },
      prepaymentRate: 20,
      selectedVilla: villaWithPoolHeating,
      rates: ratesFixture,
      startISO,
      endISO,
    });

    expect(payload.pool_heating_selected).toBe(false);
    expect(payload.pool_heating_total_try).toBe(0);
    // accommodationBase(23500, 3500, 0) = 20000 → %20 = 4000
    expect(payload.prepayment_amount).toBe(4000);
    expect(payload.remaining_payment).toBe(19500);
  });
});

describe("buildCreateNormalPayload — villada havuz ısıtma ücreti yok (NULL-safe)", () => {
  it("selectedVilla.pool_heating_fee=null → pool heating alanları 0/false, eski davranış BYTE-IDENTICAL", () => {
    const payload = buildCreateNormalPayload({
      data: { ...baseCreateData, total_price_try: 36500, cleaning_fee_try: 1500 },
      guestNames: [],
      priceDetail: tryPriceDetail,
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      rates: ratesFixture,
      startISO,
      endISO,
    });

    expect(payload.pool_heating_selected).toBe(false);
    expect(payload.pool_heating_total_try).toBe(0);
    expect(payload.original_pool_heating_total).toBe(0);
    expect(payload.original_pool_heating_currency).toBe("TRY");
    // accommodationBase(36500, 1500, 0) = 35000 → %20 = 7000 (eski davranış)
    expect(payload.prepayment_amount).toBe(7000);
    expect(payload.remaining_payment).toBe(29500);
  });
});

describe("buildCreateNormalPayload — gece sayısı × ücret snapshot derivation", () => {
  it("priceDetail.poolHeating fallback (data.pool_heating_total_try boşsa) kullanılır", () => {
    const payload = buildCreateNormalPayload({
      data: {
        ...baseCreateData,
        total_price_try: 28500,
        cleaning_fee_try: 3500,
        pool_heating_selected: true,
        pool_heating_total_try: 0, // henüz senkronize olmamış senaryo
      },
      guestNames: [],
      priceDetail: poolHeatingPriceDetail, // poolHeating: 5000 (5 gece x 1000 varsayımsal)
      prepaymentRate: 20,
      selectedVilla: villaWithPoolHeating,
      rates: ratesFixture,
      startISO,
      endISO,
    });

    expect(payload.pool_heating_total_try).toBe(5000);
    expect(payload.prepayment_amount).toBe(4000);
  });
});
