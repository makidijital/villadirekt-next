import { describe, it, expect } from "vitest";

import { computeReservationPriceRecalc } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/computeReservationPriceRecalc";

import type { ReservationDetailData } from "@/app/(admin)/maki-admin/reservations/[id]/_types/reservation-form-data";

/* ===============================================================
   🛡️ HAVUZ ISITMA — 8. adım (Admin edit doğruluk düzeltmesi)
   ===============================================================
   computeReservationPriceRecalc REGRESSION + YENİ DAVRANIŞ testleri.

   Kapsam (kullanıcı talebindeki minimum 4 senaryo):
     1) tarih değişikliği + pool heating (gece başına yeniden hesap)
     2) villa değişikliği + pool heating (seçim korunur, yeni villa
        ücreti kullanılır; yeni villada ücret yoksa 0'a düşer)
     3) pool heating olmayan eski rezervasyon (regresyon — byte-identical)
     4) accommodation base / ön ödeme hesabı (worked example)

   WORKED EXAMPLE (kullanıcı talebi, verbatim):
     Konaklama=20.000 Temizlik=3.500 Havuz Isıtma=5.000 Toplam=28.500
     Ön ödeme %20=4.000. accommodationBase = total - cleaning - poolHeating.
   Bu değerleri elde etmek için: 4 gece × 5.000 TL/gece = 20.000 (stay),
   cleaning_fee=3.500 (limitsiz → sabit), pool_heating_fee=1.250 TL/gece
   × 4 gece = 5.000.
=============================================================== */

const rates = { TRY: 1, USD: 35, EUR: 40 };

const prices = [
  { start_date: "2026-05-01", end_date: "2026-10-31", price: 5000, currency: "TRY" },
];

const baseData = {
  id: "res-1",
  villa_id: "villa-1",
  villa: null,
  custom_price: false,
  total_price_try: 28500,
  cleaning_fee_try: 3500,
  original_price: 0,
  original_currency: "TRY",
  original_cleaning_fee: 0,
  original_cleaning_currency: "TRY",
  paid_amount: 0,
} as unknown as ReservationDetailData;

// 4 gece: 2026-06-01 → 2026-06-05
const startDate4 = new Date(2026, 5, 1);
const endDate4 = new Date(2026, 5, 5);

describe("computeReservationPriceRecalc — 8. adım: TARİH DEĞİŞİKLİĞİ + havuz ısıtma", () => {
  it("worked example: 4 gece × 1.250 TL/gece = 5.000 havuz ısıtma; toplam 28.500; ön ödeme %20=4.000", () => {
    const r = computeReservationPriceRecalc({
      data: { ...baseData, pool_heating_selected: true } as unknown as ReservationDetailData,
      startDate: startDate4,
      endDate: endDate4,
      prices,
      rates,
      originalStartDate: "2026-07-01", // farklı tarih → hasDateChanged=true
      originalEndDate: "2026-07-05",
      originalVillaId: "villa-1", // villa AYNI → hasVillaChanged=false
      selectedVilla: {
        cleaning_fee: 3500,
        cleaning_currency: "TRY",
        cleaning_limit: 0,
        pool_heating_fee: 1250,
        pool_heating_currency: "TRY",
      },
      prepaymentRate: 20,
    });

    expect(r.kind).toBe("recalc");
    if (r.kind !== "recalc") return;

    expect(r.priceDetail.poolHeating).toBe(5000);
    expect(r.dataPatch.total_price_try).toBe(28500); // 20.000 + 3.500 + 5.000
    expect(r.dataPatch.pool_heating_selected).toBe(true);
    expect(r.dataPatch.pool_heating_total_try).toBe(5000);
    // Konaklama (accommodation base) = 28.500 - 3.500 - 5.000 = 20.000
    // Ön ödeme %20 = 4.000 (HAVUZ ISITMAYI İÇERMEZ)
    expect(r.dataPatch.prepayment_amount).toBe(4000);
    expect(r.dataPatch.remaining_payment).toBe(24500);
  });

  it("gece sayısı değişince havuz ısıtma toplamı YENİ gece sayısına göre yeniden hesaplanır (gece başına ücret)", () => {
    // 4 → 7 geceye çıkar (2026-06-01 → 2026-06-08)
    const startDate7 = new Date(2026, 5, 1);
    const endDate7 = new Date(2026, 5, 8);

    const r = computeReservationPriceRecalc({
      data: {
        ...baseData,
        pool_heating_selected: true,
        pool_heating_total_try: 5000, // eski (4 gece) snapshot
      } as unknown as ReservationDetailData,
      startDate: startDate7,
      endDate: endDate7,
      prices,
      rates,
      originalStartDate: "2026-06-01", // eski 4 gecelik aralık
      originalEndDate: "2026-06-05",
      originalVillaId: "villa-1",
      selectedVilla: {
        cleaning_fee: 3500,
        cleaning_currency: "TRY",
        cleaning_limit: 0,
        pool_heating_fee: 1250,
        pool_heating_currency: "TRY",
      },
      prepaymentRate: 20,
    });

    expect(r.kind).toBe("recalc");
    if (r.kind !== "recalc") return;
    // 7 gece × 1.250 = 8.750 (4 gecelik eski 5.000 DEĞİL)
    expect(r.dataPatch.pool_heating_total_try).toBe(8750);
  });
});

describe("computeReservationPriceRecalc — 8. adım: VİLLA DEĞİŞİKLİĞİ + havuz ısıtma", () => {
  it("villa değişince YENİ villanın pool_heating_fee'si kullanılır; pool_heating_selected KORUNUR", () => {
    const r = computeReservationPriceRecalc({
      data: {
        ...baseData,
        villa_id: "villa-new",
        pool_heating_selected: true, // mevcut rezervasyonun seçimi — caller bunu DEĞİŞTİRMEZ
      } as unknown as ReservationDetailData,
      startDate: startDate4,
      endDate: endDate4,
      prices,
      rates,
      originalStartDate: "2026-06-01", // tarih AYNI → hasDateChanged=false
      originalEndDate: "2026-06-05",
      originalVillaId: "villa-old", // villa FARKLI → hasVillaChanged=true
      selectedVilla: {
        cleaning_fee: 3500,
        cleaning_currency: "TRY",
        cleaning_limit: 0,
        pool_heating_fee: 2000, // YENİ villanın ücreti
        pool_heating_currency: "TRY",
      },
      prepaymentRate: 20,
    });

    expect(r.kind).toBe("recalc");
    if (r.kind !== "recalc") return;
    expect(r.dataPatch.pool_heating_selected).toBe(true); // KORUNDU
    expect(r.dataPatch.pool_heating_total_try).toBe(8000); // 4 gece × 2.000
  });

  it("yeni villada havuz ısıtma ücreti YOKSA (0/null) → toplam havuz ısıtma 0 olur, seçim yine KORUNUR, hesap doğru devam eder", () => {
    const r = computeReservationPriceRecalc({
      data: {
        ...baseData,
        villa_id: "villa-new-no-pool",
        pool_heating_selected: true,
      } as unknown as ReservationDetailData,
      startDate: startDate4,
      endDate: endDate4,
      prices,
      rates,
      originalStartDate: "2026-06-01",
      originalEndDate: "2026-06-05",
      originalVillaId: "villa-old",
      selectedVilla: {
        cleaning_fee: 3500,
        cleaning_currency: "TRY",
        cleaning_limit: 0,
        pool_heating_fee: 0, // yeni villada havuz ısıtma yok
        pool_heating_currency: "TRY",
      },
      prepaymentRate: 20,
    });

    expect(r.kind).toBe("recalc");
    if (r.kind !== "recalc") return;
    expect(r.dataPatch.pool_heating_selected).toBe(true); // seçim yine korunur
    expect(r.dataPatch.pool_heating_total_try).toBe(0);
    // Toplam = stay(20.000) + cleaning(3.500) + 0 = 23.500
    expect(r.dataPatch.total_price_try).toBe(23500);
    // accommodationBase = 23.500 - 3.500 - 0 = 20.000 → ön ödeme %20=4.000
    expect(r.dataPatch.prepayment_amount).toBe(4000);
  });
});

describe("computeReservationPriceRecalc — 8. adım: REGRESYON (havuz ısıtması olmayan eski rezervasyon)", () => {
  it("snapshot branch (tarih/villa aynı): pool_heating alanları hiç yoksa davranış BYTE-IDENTICAL kalır", () => {
    const r = computeReservationPriceRecalc({
      data: {
        ...baseData,
        total_price_try: 50000,
        cleaning_fee_try: 1500,
        // pool_heating_* alanları YOK (eski rezervasyon)
      } as unknown as ReservationDetailData,
      startDate: startDate4,
      endDate: endDate4,
      prices,
      rates,
      originalStartDate: "2026-06-01",
      originalEndDate: "2026-06-05",
      originalVillaId: "villa-1",
      selectedVilla: null,
      prepaymentRate: 20,
    });

    expect(r.kind).toBe("snapshot");
    if (r.kind !== "snapshot") return;
    expect(r.priceDetail.total).toBe(50000);
    expect(r.priceDetail.cleaning).toBe(1500);
    expect(r.priceDetail.stay).toBe(48500); // 50.000 - 1.500 - 0 (eski davranışla birebir)
    expect(r.priceDetail.poolHeating).toBe(0);
  });

  it("recalc branch (villa değişti): pool_heating_selected hiç set değilse → poolHeating=0, total eski mantıkla birebir", () => {
    const r = computeReservationPriceRecalc({
      data: {
        ...baseData,
        villa_id: "villa-new",
        // pool_heating_selected YOK (undefined) → engine default false
      } as unknown as ReservationDetailData,
      startDate: startDate4,
      endDate: endDate4,
      prices,
      rates,
      originalStartDate: "2026-06-01",
      originalEndDate: "2026-06-05",
      originalVillaId: "villa-old",
      selectedVilla: { cleaning_fee: 3500, cleaning_currency: "TRY", cleaning_limit: 0 },
      prepaymentRate: 20,
    });

    expect(r.kind).toBe("recalc");
    if (r.kind !== "recalc") return;
    expect(r.dataPatch.pool_heating_selected).toBe(false);
    expect(r.dataPatch.pool_heating_total_try).toBe(0);
    expect(r.dataPatch.total_price_try).toBe(23500); // 20.000 + 3.500 (eski davranış)
    expect(r.dataPatch.prepayment_amount).toBe(4000); // accommodationBase(23500,3500,0)=20000
  });
});
