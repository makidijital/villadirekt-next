import { describe, it, expect } from "vitest";

import { validateCreateForm } from "@/app/(admin)/maki-admin/reservations/ekle/_helpers/validateCreateForm";

import { baseCreateData, tryPriceDetail } from "./_fixtures";

/* ===============================================================
   🛡️ FAZ 5 — validateCreateForm UNIT TESTS
   ===============================================================
   Pure validator. Inline `validateForm` body'sinin BYTE-IDENTICAL
   kopyası — bu testler regression guard.
=============================================================== */

const validDate = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const validStart = validDate("2026-06-01");
const validEnd = validDate("2026-06-08");

describe("validateCreateForm — happy path", () => {
  it("returns empty object when all fields valid", () => {
    const errors = validateCreateForm({
      data: { ...baseCreateData, total_price_try: 50000 },
      startDate: validStart,
      endDate: validEnd,
      priceDetail: tryPriceDetail,
    });
    expect(errors).toEqual({});
  });
});

describe("validateCreateForm — required fields", () => {
  it("flags empty villa_id", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, villa_id: "", total_price_try: 50000 },
      startDate: validStart,
      endDate: validEnd,
      priceDetail: tryPriceDetail,
    });
    expect(e.villa_id).toBe("Villa zorunlu");
  });

  it("flags missing start_date when startDate is null", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, total_price_try: 50000 },
      startDate: null,
      endDate: validEnd,
      priceDetail: tryPriceDetail,
    });
    expect(e.start_date).toBe("Giriş tarihi zorunlu");
  });

  it("flags missing end_date when endDate is null", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, total_price_try: 50000 },
      startDate: validStart,
      endDate: null,
      priceDetail: tryPriceDetail,
    });
    expect(e.end_date).toBe("Çıkış tarihi zorunlu");
  });

  it("flags end_date when end <= start", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, total_price_try: 50000 },
      startDate: validEnd,
      endDate: validStart,
      priceDetail: tryPriceDetail,
    });
    expect(e.end_date).toBe("Çıkış tarihi giriş tarihinden sonra olmalı");
  });

  it("flags equal start and end as invalid", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, total_price_try: 50000 },
      startDate: validStart,
      endDate: validStart,
      priceDetail: tryPriceDetail,
    });
    expect(e.end_date).toBe("Çıkış tarihi giriş tarihinden sonra olmalı");
  });

  it("flags empty name (after trim)", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, name: "   ", total_price_try: 50000 },
      startDate: validStart,
      endDate: validEnd,
      priceDetail: tryPriceDetail,
    });
    expect(e.name).toBe("Ad Soyad zorunlu");
  });

  it("flags empty phone (after trim)", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, phone: "", total_price_try: 50000 },
      startDate: validStart,
      endDate: validEnd,
      priceDetail: tryPriceDetail,
    });
    expect(e.phone).toBe("Telefon zorunlu");
  });

  it("flags empty email", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, email: "", total_price_try: 50000 },
      startDate: validStart,
      endDate: validEnd,
      priceDetail: tryPriceDetail,
    });
    expect(e.email).toBe("E-posta zorunlu");
  });

  it("flags malformed email", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, email: "not-an-email", total_price_try: 50000 },
      startDate: validStart,
      endDate: validEnd,
      priceDetail: tryPriceDetail,
    });
    expect(e.email).toBe("Geçerli e-posta gir");
  });

  it("accepts a valid email", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, email: "foo@bar.co", total_price_try: 50000 },
      startDate: validStart,
      endDate: validEnd,
      priceDetail: tryPriceDetail,
    });
    expect(e.email).toBeUndefined();
  });

  it("flags empty country", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, country: "", total_price_try: 50000 },
      startDate: validStart,
      endDate: validEnd,
      priceDetail: tryPriceDetail,
    });
    expect(e.country).toBe("Ülke zorunlu");
  });

  it("flags empty city", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, city: "", total_price_try: 50000 },
      startDate: validStart,
      endDate: validEnd,
      priceDetail: tryPriceDetail,
    });
    expect(e.city).toBe("Şehir zorunlu");
  });

  it("flags guests < 1", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, guests: 0, total_price_try: 50000 },
      startDate: validStart,
      endDate: validEnd,
      priceDetail: tryPriceDetail,
    });
    expect(e.guests).toBe("En az 1 misafir");
  });

  it("flags missing payment_method_id", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, payment_method_id: null, total_price_try: 50000 },
      startDate: validStart,
      endDate: validEnd,
      priceDetail: tryPriceDetail,
    });
    expect(e.payment_method_id).toBe("Ödeme yöntemi seç");
  });
});

describe("validateCreateForm — total check fallback chain", () => {
  it("falls back to priceDetail.total when total_price_try is 0", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, total_price_try: 0 },
      startDate: validStart,
      endDate: validEnd,
      priceDetail: { ...tryPriceDetail, total: 50000 },
    });
    expect(e.total_price_try).toBeUndefined();
  });

  it("flags total_price_try when both data and priceDetail are 0", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, total_price_try: 0 },
      startDate: validStart,
      endDate: validEnd,
      priceDetail: { ...tryPriceDetail, total: 0 },
    });
    expect(e.total_price_try).toBe("Toplam tutar 0'dan büyük olmalı");
  });

  it("flags total_price_try when priceDetail is null and total is 0", () => {
    const e = validateCreateForm({
      data: { ...baseCreateData, total_price_try: 0 },
      startDate: validStart,
      endDate: validEnd,
      priceDetail: null,
    });
    expect(e.total_price_try).toBe("Toplam tutar 0'dan büyük olmalı");
  });
});

describe("validateCreateForm — multiple errors accumulated", () => {
  it("returns all failing rules in a single pass", () => {
    const e = validateCreateForm({
      data: {
        ...baseCreateData,
        villa_id: "",
        name: "",
        email: "",
        city: "",
        guests: 0,
        payment_method_id: null,
        total_price_try: 0,
      },
      startDate: null,
      endDate: null,
      priceDetail: null,
    });
    expect(Object.keys(e).sort()).toEqual([
      "city",
      "email",
      "guests",
      "name",
      "payment_method_id",
      "start_date",
      "end_date",
      "total_price_try",
      "villa_id",
    ].sort());
  });
});
