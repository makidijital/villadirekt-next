import { describe, it, expect } from "vitest";

import { buildCreateReservationPayload } from "@/app/services/reservation/_helpers/payload-create";

import type { ReservationCreateInput } from "@/app/services/reservation/types";

/* ===============================================================
   🛡️ FAZ 4 — buildCreateReservationPayload EK TESTLER (İNDİRİM SNAPSHOT)
   ===============================================================
   Mevcut payload-create.test.ts / payload-create.pool-heating.test.ts
   DOKUNULMADI. Burada yalnız YENİ migration 080 snapshot alanları
   (always-write coercion — pool heating ile BİREBİR desen, ama null
   default'lu) test edilir.

   ⚠️ Bu dosya GÜVENLİK sınırını test ETMEZ (o route.ts'in override
   bloğunda — bkz. price-verify.discount-snapshot.test.ts). Burada
   yalnız `buildCreateReservationPayload`'ın kendisine gelen `data`'yı
   DOĞRU coerce ettiği doğrulanır (mevcut mimari: bu helper "saf" bir
   builder, güvenlik sınırı caller'da).
=============================================================== */

const minimalInput: ReservationCreateInput = {
  villa_id: "villa-1",
  start_date: "2026-06-01",
  end_date: "2026-06-08",
  total_price: 50000,
  name: "Ahmet Yılmaz",
  phone: "+905551112233",
};

describe("buildCreateReservationPayload — indirim snapshot defaults (senaryo 1, 9, 12)", () => {
  it("discount alanları hiç verilmemişse → discount_applied=false, diğer 5 alan null (eski rezervasyon davranışı bozulmadı)", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect(p.discount_applied).toBe(false);
    expect(p.discount_type).toBeNull();
    expect(p.discount_value).toBeNull();
    expect(p.discount_currency).toBeNull();
    expect(p.original_stay_total_try).toBeNull();
    expect(p.stay_discount_amount_try).toBeNull();
  });

  it("her zaman 6 alanı YAZAR — conditional spread DEĞİL (always-write deseni)", () => {
    const p = buildCreateReservationPayload({
      data: minimalInput,
      reservationCommissionAmount: 0,
    });
    expect("discount_applied" in p).toBe(true);
    expect("discount_type" in p).toBe(true);
    expect("discount_value" in p).toBe(true);
    expect("discount_currency" in p).toBe(true);
    expect("original_stay_total_try" in p).toBe(true);
    expect("stay_discount_amount_try" in p).toBe(true);
  });
});

describe("buildCreateReservationPayload — indirim snapshot uygulandığında (senaryo 9)", () => {
  it("percent indirim snapshot'ı doğru geçer (discount_currency null)", () => {
    const p = buildCreateReservationPayload({
      data: {
        ...minimalInput,
        discount_applied: true,
        discount_type: "percent",
        discount_value: 20,
        discount_currency: null,
        original_stay_total_try: 40000,
        stay_discount_amount_try: 8000,
      },
      reservationCommissionAmount: 0,
    });
    expect(p.discount_applied).toBe(true);
    expect(p.discount_type).toBe("percent");
    expect(p.discount_value).toBe(20);
    expect(p.discount_currency).toBeNull();
    expect(p.original_stay_total_try).toBe(40000);
    expect(p.stay_discount_amount_try).toBe(8000);
  });

  it("fixed özel fiyat snapshot'ı doğru geçer (discount_currency dolu) — negatif savings CLAMP edilmez", () => {
    const p = buildCreateReservationPayload({
      data: {
        ...minimalInput,
        discount_applied: true,
        discount_type: "fixed",
        discount_value: 15000,
        discount_currency: "TRY",
        original_stay_total_try: 40000,
        // Fixed özel fiyat normal fiyattan yüksek → NEGATİF savings.
        stay_discount_amount_try: -20000,
      },
      reservationCommissionAmount: 0,
    });
    expect(p.discount_type).toBe("fixed");
    expect(p.discount_value).toBe(15000);
    expect(p.discount_currency).toBe("TRY");
    expect(p.stay_discount_amount_try).toBe(-20000);
  });

  it("stay_discount_amount_try = 0 → null'a DÜŞMEZ (Number(x)||0 pattern 0'ı 0 olarak korur)", () => {
    const p = buildCreateReservationPayload({
      data: {
        ...minimalInput,
        discount_applied: true,
        discount_type: "fixed",
        discount_value: 10000,
        discount_currency: "TRY",
        original_stay_total_try: 40000,
        stay_discount_amount_try: 0,
      },
      reservationCommissionAmount: 0,
    });
    expect(p.stay_discount_amount_try).toBe(0);
  });
});
