import { describe, it, expect } from "vitest";

import { buildCreateNormalPayload } from "@/app/(admin)/maki-admin/reservations/ekle/_helpers/buildCreateNormalPayload";

import {
  baseCreateData,
  villaWithCleaning,
  villaForeignCleaning,
  tryPriceDetail,
  foreignPriceDetail,
  ratesFixture,
} from "./_fixtures";

/* ===============================================================
   🛡️ FAZ 5 — buildCreateNormalPayload UNIT TESTS
   ===============================================================
   Pure INSERT payload builder. Normal branch — multi-currency
   snapshot derivation + getPaymentDisplayValues + alan default'ları.
=============================================================== */

const startISO = "2026-06-01";
const endISO = "2026-06-08";

describe("buildCreateNormalPayload — TRY-only happy path", () => {
  it("produces a TRY-snapshot payload with custom_price=false", () => {
    const payload = buildCreateNormalPayload({
      data: { ...baseCreateData, total_price_try: 50000 },
      guestNames: [],
      priceDetail: tryPriceDetail,
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      rates: ratesFixture,
      startISO,
      endISO,
    });

    expect(payload).toMatchObject({
      villa_id: "villa-1",
      status: "pending",
      total_price: 50000,
      total_price_try: 50000,
      original_price: 0,
      original_currency: "TRY",
      original_cleaning_fee: 0,
      original_cleaning_currency: "TRY",
      exchange_rate: 1,
      custom_price: false,
      custom_price_note: null,
      payment_method_id: "pm-1",
      payment_preference: "prepayment",
      damage_deposit: 3000,
    });
  });

  it("computes prepayment correctly", () => {
    const payload = buildCreateNormalPayload({
      data: { ...baseCreateData, total_price_try: 100000 },
      guestNames: [],
      priceDetail: tryPriceDetail,
      prepaymentRate: 30,
      selectedVilla: villaWithCleaning,
      rates: ratesFixture,
      startISO,
      endISO,
    });
    /* 🛡️ ÖN ÖDEME ARTIK KONAKLAMA ALT-TOPLAMI ÜZERİNDEN (FAZ 2/B)
       Kural (lib/price.engine > accommodationBase):
         accommodationBase = totalTRY - cleaningTRY - poolHeatingTRY
         prepayment        = Math.round(accommodationBase * rate / 100)
       Temizlik ve havuz ısıtma ÖN ÖDEMEYE dahil DEĞİL; girişte tahsil
       edilir → remaining tam total üzerinden hesaplanır.

       Bu fixture için ELLE hesap (üretim çıktısı kopyalanmadı):
         cleaningTRY  = data.cleaning_fee_try(0) || priceDetail.cleaning
                      = tryPriceDetail.cleaning = 1.500
         poolHeating  = 0 (tryPriceDetail.poolHeating tanımsız)
         base         = 100.000 - 1.500 - 0        = 98.500
         prepayment   = round(98.500 x 30 / 100)   = round(29.550) = 29.550
         remaining    = 100.000 - 29.550           = 70.450
       ESKİ beklenti 30.000 / 70.000 idi (brüt toplam üzerinden). */
    expect(payload.prepayment_amount).toBe(29550);
    expect(payload.remaining_payment).toBe(70450);

    /* 🛡️ FİNANSAL TUTARLILIK: ön ödeme + girişte ödenecek = TAM TOPLAM.
       Temizlik/havuz ısıtma ön ödemeden düşülse bile müşteriden
       tahsil edilmeye devam ettiğini kilitler (gelir kaçağı guard'ı). */
    expect(payload.prepayment_amount + payload.remaining_payment).toBe(
      payload.total_price_try
    );
  });

  it("full_payment → prepayment=total, remaining=0", () => {
    const payload = buildCreateNormalPayload({
      data: {
        ...baseCreateData,
        total_price_try: 50000,
        payment_preference: "full_payment",
      },
      guestNames: [],
      priceDetail: tryPriceDetail,
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      rates: ratesFixture,
      startISO,
      endISO,
    });
    expect(payload.prepayment_amount).toBe(50000);
    expect(payload.remaining_payment).toBe(0);
  });
});

describe("buildCreateNormalPayload — foreign currency snapshot", () => {
  it("preserves foreign stay + cleaning currency from priceDetail", () => {
    const payload = buildCreateNormalPayload({
      data: { ...baseCreateData, total_price_try: 72500 },
      guestNames: [],
      priceDetail: foreignPriceDetail,
      prepaymentRate: 20,
      selectedVilla: villaForeignCleaning,
      rates: ratesFixture,
      startISO,
      endISO,
    });

    expect(payload.original_currency).toBe("EUR");
    expect(payload.original_cleaning_currency).toBe("EUR");
    expect(payload.original_price).toBe(700);
    expect(payload.original_cleaning_fee).toBe(25);
    /* exchange_rate live rates'ten (EUR=40). */
    expect(payload.exchange_rate).toBe(40);
  });

  it("falls back to data.original_currency when priceDetail null", () => {
    const payload = buildCreateNormalPayload({
      data: {
        ...baseCreateData,
        total_price_try: 50000,
        original_currency: "USD",
        original_price: 1500,
        exchange_rate: 35,
      },
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      rates: ratesFixture,
      startISO,
      endISO,
    });
    expect(payload.original_currency).toBe("USD");
    expect(payload.original_price).toBe(1500);
    expect(payload.exchange_rate).toBe(35);
  });

  it("missing live rate falls back to data.exchange_rate", () => {
    const payload = buildCreateNormalPayload({
      data: {
        ...baseCreateData,
        total_price_try: 50000,
        original_currency: "XXX", // unknown currency
        exchange_rate: 99,
      },
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      rates: ratesFixture, // no XXX
      startISO,
      endISO,
    });
    expect(payload.exchange_rate).toBe(99);
  });
});

describe("buildCreateNormalPayload — totalTRY fallback chain", () => {
  it("uses data.total_price_try when present", () => {
    const payload = buildCreateNormalPayload({
      data: { ...baseCreateData, total_price_try: 11111, total_price: 22222 },
      guestNames: [],
      priceDetail: { ...tryPriceDetail, total: 33333 },
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      rates: ratesFixture,
      startISO,
      endISO,
    });
    expect(payload.total_price_try).toBe(11111);
  });

  it("falls back to data.total_price when total_price_try is 0", () => {
    const payload = buildCreateNormalPayload({
      data: { ...baseCreateData, total_price_try: 0, total_price: 22222 },
      guestNames: [],
      priceDetail: { ...tryPriceDetail, total: 33333 },
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      rates: ratesFixture,
      startISO,
      endISO,
    });
    expect(payload.total_price_try).toBe(22222);
  });

  it("falls back to priceDetail.total when both data fields are 0", () => {
    const payload = buildCreateNormalPayload({
      data: { ...baseCreateData, total_price_try: 0, total_price: 0 },
      guestNames: [],
      priceDetail: { ...tryPriceDetail, total: 33333 },
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      rates: ratesFixture,
      startISO,
      endISO,
    });
    expect(payload.total_price_try).toBe(33333);
  });
});

describe("buildCreateNormalPayload — payment_preference normalization", () => {
  it("invalid preference defaults to prepayment", () => {
    const payload = buildCreateNormalPayload({
      data: {
        ...baseCreateData,
        total_price_try: 50000,
        /* @ts-expect-error - garbage input intentional */
        payment_preference: "garbage",
      },
      guestNames: [],
      priceDetail: tryPriceDetail,
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      rates: ratesFixture,
      startISO,
      endISO,
    });
    expect(payload.payment_preference).toBe("prepayment");
  });
});

describe("buildCreateNormalPayload — guest_names trim+filter", () => {
  it("filters empty entries and trims surviving entries", () => {
    const payload = buildCreateNormalPayload({
      data: { ...baseCreateData, total_price_try: 50000 },
      guestNames: ["", " ", "Alice", "  Bob  ", ""],
      priceDetail: tryPriceDetail,
      prepaymentRate: 20,
      selectedVilla: villaWithCleaning,
      rates: ratesFixture,
      startISO,
      endISO,
    });
    expect(payload.guest_names).toEqual(["Alice", "Bob"]);
  });
});
