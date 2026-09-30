/* ===============================================================
   🛡️ PHASE 1 — buildNormalPayload (freeze)
   ===============================================================
   Multi-currency normal kayıt payload. Custom path'ten farklı:
     • foreign currency branch'leri (isForeignStay / isForeignCleaning)
     • cleaningTRY fallback: data.cleaning_fee_try || priceDetail.cleaning
     • exchange_rate dinamik (foreign varsa data.exchange_rate, yoksa 1)
     • original_* alanları foreign flag'e göre 0/null veya değer
     • custom_price=false, custom_price_note=null sabit

   Bu helper byte-identical olarak orijinal inline'dan çıkarıldı;
   testler her branch'i ve coercion'u koruma altına alır.
=============================================================== */

import { describe, it, expect } from "vitest";
import { buildNormalPayload } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/buildNormalPayload";
import { asReservation, baseReservation, foreignReservation } from "./_fixtures";

describe("buildNormalPayload — TRY-only branch (no foreign)", () => {
  it("sets original_* fields to 0/'TRY' when no foreign currency", () => {
    const payload = buildNormalPayload({
      data: asReservation(baseReservation),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });

    expect(payload.original_price).toBe(0);
    expect(payload.original_currency).toBe("TRY");
    expect(payload.original_cleaning_fee).toBe(0);
    expect(payload.original_cleaning_currency).toBe("TRY");
    expect(payload.exchange_rate).toBe(1);
  });

  it("uses total_price_try → total_price → 0 fallback for total", () => {
    const a = buildNormalPayload({
      data: asReservation({
        ...baseReservation,
        total_price_try: 50000,
        total_price: 9999,
      }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });
    expect(a.total_price).toBe(50000);
    expect(a.total_price_try).toBe(50000);

    const b = buildNormalPayload({
      data: asReservation({
        ...baseReservation,
        total_price_try: 0,
        total_price: 33000,
      }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });
    expect(b.total_price).toBe(33000);
    expect(b.total_price_try).toBe(33000);

    const c = buildNormalPayload({
      data: asReservation({
        ...baseReservation,
        total_price_try: null,
        total_price: null,
      }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });
    expect(c.total_price).toBe(0);
  });

  it("uses data.cleaning_fee_try first, then priceDetail.cleaning fallback", () => {
    const withData = buildNormalPayload({
      data: asReservation({ ...baseReservation, cleaning_fee_try: 2500 }),
      guestNames: [],
      priceDetail: { nights: 7, stay: 47500, cleaning: 9999, total: 50000 },
      prepaymentRate: 20,
    });
    expect(withData.cleaning_fee_try).toBe(2500); // data wins

    const withFallback = buildNormalPayload({
      data: asReservation({ ...baseReservation, cleaning_fee_try: 0 }),
      guestNames: [],
      priceDetail: { nights: 7, stay: 47500, cleaning: 2500, total: 50000 },
      prepaymentRate: 20,
    });
    expect(withFallback.cleaning_fee_try).toBe(2500); // priceDetail fallback

    const noneAvailable = buildNormalPayload({
      data: asReservation({ ...baseReservation, cleaning_fee_try: 0 }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });
    expect(noneAvailable.cleaning_fee_try).toBe(0);
  });
});

describe("buildNormalPayload — foreign stay currency branch", () => {
  it("persists original_price + original_currency, exchange_rate from data", () => {
    const payload = buildNormalPayload({
      data: asReservation(foreignReservation),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });
    expect(payload.original_price).toBe(1000);
    expect(payload.original_currency).toBe("EUR");
    expect(payload.exchange_rate).toBe(100);
  });

  it("uses fallback exchange_rate=1 when data.exchange_rate is 0/null", () => {
    const payload = buildNormalPayload({
      data: asReservation({
        ...foreignReservation,
        exchange_rate: 0,
      }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });
    expect(payload.exchange_rate).toBe(1);
  });
});

describe("buildNormalPayload — foreign cleaning currency branch", () => {
  it("persists original_cleaning_fee + original_cleaning_currency", () => {
    const payload = buildNormalPayload({
      data: asReservation(foreignReservation),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });
    expect(payload.original_cleaning_fee).toBe(50);
    expect(payload.original_cleaning_currency).toBe("EUR");
  });
});

describe("buildNormalPayload — financial snapshot (payment helper)", () => {
  it("prepayment branch: prepayment = round(total * rate / 100)", () => {
    const payload = buildNormalPayload({
      data: asReservation({
        ...baseReservation,
        total_price_try: 100000,
        payment_preference: "prepayment",
      }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });
    /* 🛡️ ÖN ÖDEME ARTIK KONAKLAMA ALT-TOPLAMI ÜZERİNDEN (FAZ 2/B)
       accommodationBase = totalTRY - cleaningTRY - poolHeatingTRY
       prepayment        = Math.round(accommodationBase * rate / 100)
       Temizlik + havuz ısıtma ön ödemeye girmez, girişte tahsil edilir.

       Bu fixture için ELLE hesap (üretim çıktısı kopyalanmadı):
         cleaningTRY = baseReservation.cleaning_fee_try = 2.500
         poolHeating = baseReservation.pool_heating_total_try = 0
         base        = 100.000 - 2.500 - 0       = 97.500
         prepayment  = round(97.500 x 20 / 100)  = round(19.500) = 19.500
         remaining   = 100.000 - 19.500          = 80.500
       ESKİ beklenti 20.000 / 80.000 idi (brüt toplam üzerinden). */
    expect(payload.prepayment_amount).toBe(19500);
    expect(payload.remaining_payment).toBe(80500);

    /* 🛡️ FİNANSAL TUTARLILIK: ön ödeme + girişte ödenecek = TAM TOPLAM. */
    expect(payload.prepayment_amount + payload.remaining_payment).toBe(
      payload.total_price_try
    );
  });

  it("full_payment branch: prepayment=total, remaining=0", () => {
    const payload = buildNormalPayload({
      data: asReservation({
        ...baseReservation,
        total_price_try: 100000,
        payment_preference: "full_payment",
      }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });
    expect(payload.prepayment_amount).toBe(100000);
    expect(payload.remaining_payment).toBe(0);
  });

  it("preserves paid_amount (never resets)", () => {
    const payload = buildNormalPayload({
      data: asReservation({
        ...baseReservation,
        total_price_try: 100000,
        paid_amount: 35000,
        payment_preference: "prepayment",
      }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });
    expect(payload.paid_amount).toBe(35000);
  });

  it("rounds prepayment with Math.round (half-up)", () => {
    const payload = buildNormalPayload({
      data: asReservation({
        ...baseReservation,
        total_price_try: 12350,
        payment_preference: "prepayment",
      }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 33,
    });
    /* 🛡️ YARI-YUKARI (half-up) YUVARLAMA — konaklama alt-toplamı üzerinden.
       ELLE hesap (üretim çıktısı kopyalanmadı):
         base       = 12.350 - 2.500 - 0      = 9.850
         raw        = 9.850 x 33 / 100        = 3.250,5   ← tam .5
         prepayment = Math.round(3.250,5)     = 3.251     (yarı-yukarı)
       Test hâlâ tam .5 sınırını sınıyor; ESKİ beklenti 4.076 idi
       (brüt 12.350 üzerinden 4.075,5 → 4.076). */
    expect(payload.prepayment_amount).toBe(3251);

    /* 🛡️ FİNANSAL TUTARLILIK: 3.251 + 9.099 = 12.350 (tam toplam). */
    expect(payload.remaining_payment).toBe(9099);
    expect(payload.prepayment_amount + payload.remaining_payment).toBe(
      payload.total_price_try
    );
  });
});

describe("buildNormalPayload — flag invariants", () => {
  it("always sets custom_price=false and custom_price_note=null", () => {
    const payload = buildNormalPayload({
      data: asReservation({
        ...baseReservation,
        custom_price: true,
        custom_price_note: "this should be ignored",
      }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });

    expect(payload.custom_price).toBe(false);
    expect(payload.custom_price_note).toBeNull();
  });
});

describe("buildNormalPayload — string trim / cleanup parity", () => {
  it("trims and persists payment_link, '' → null", () => {
    const trimmed = buildNormalPayload({
      data: asReservation({
        ...baseReservation,
        payment_link: "  https://pay.example/abc  ",
      }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });
    expect(trimmed.payment_link).toBe("https://pay.example/abc");

    const nulled = buildNormalPayload({
      data: asReservation({ ...baseReservation, payment_link: "   " }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });
    expect(nulled.payment_link).toBeNull();
  });

  it("guest_names: trim each + filter out empties", () => {
    const payload = buildNormalPayload({
      data: asReservation(baseReservation),
      guestNames: ["  Alice ", "", "Bob ", "   "],
      priceDetail: null,
      prepaymentRate: 20,
    });
    expect(payload.guest_names).toEqual(["Alice", "Bob"]);
  });

  it("payment_method_id '' → null", () => {
    const payload = buildNormalPayload({
      data: asReservation({
        ...baseReservation,
        payment_method_id: "",
      }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });
    expect(payload.payment_method_id).toBeNull();
  });
});

describe("buildNormalPayload — payment_preference normalization", () => {
  it("falls back to 'prepayment' for null", () => {
    const payload = buildNormalPayload({
      data: asReservation({
        ...baseReservation,
        payment_preference: null,
      }),
      guestNames: [],
      priceDetail: null,
      prepaymentRate: 20,
    });
    expect(payload.payment_preference).toBe("prepayment");
  });
});
