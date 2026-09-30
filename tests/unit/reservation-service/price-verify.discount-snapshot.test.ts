import { describe, it, expect, vi, beforeEach } from "vitest";

/* ===============================================================
   🛡️ FAZ 4 — recomputePublicReservationPrice / verifyPublicReservationPrice
   İNDİRİM SNAPSHOT (migration 080 kolonları) — UNIT TESTLERİ
   ===============================================================
   `price-verify.discount.test.ts` (FAZ 3) DOKUNULMADI — o dosya
   server-authoritative TOPLAM fiyatları (total_price_try vb.) test
   ediyordu. Bu dosya YENİ olan discount_applied/discount_type/
   discount_value/discount_currency/original_stay_total_try/
   stay_discount_amount_try alanlarını test eder — kullanıcının
   istediği 12 senaryodan snapshot'a özel olanları (1,2,3,4,5,6,7,8,12)
   + pool heating'in bozulmadığını (11) kapsar. (9=payload-create
   testinde, 10=commission zaten dokunulmayan create.service.ts/
   commission.test.ts ile kanıtlı.)

   ⚠️ Tüm DB/servis bağımlılıkları MOCK'lanır (conflict.test.ts /
   price-verify.discount.test.ts ile AYNI proje konvansiyonu).
=============================================================== */

const RATES = { USD: 30, EUR: 33, GBP: 38 };

const findVillaCleaningConfig = vi.fn();
const getVillaPrices = vi.fn();
const getExchangeRatesMap = vi.fn();
const getPublicSettings = vi.fn();
const getVillaDiscounts = vi.fn();

vi.mock("@/lib/db/reservation.repository", () => ({
  reservationRepository: {
    findVillaCleaningConfig: (...args: unknown[]) =>
      findVillaCleaningConfig(...args),
  },
}));

vi.mock("@/app/services/villa-price.service", () => ({
  getVillaPrices: (...args: unknown[]) => getVillaPrices(...args),
}));

vi.mock("@/app/services/exchange-rate.service", () => ({
  getExchangeRatesMap: (...args: unknown[]) => getExchangeRatesMap(...args),
}));

vi.mock("@/app/services/settings.service", () => ({
  getPublicSettings: (...args: unknown[]) => getPublicSettings(...args),
}));

vi.mock("@/app/services/villa-discount.service", () => ({
  getVillaDiscounts: (...args: unknown[]) => getVillaDiscounts(...args),
}));

import {
  recomputePublicReservationPrice,
  verifyPublicReservationPrice,
  detectAppliedDiscountForStay,
} from "@/app/services/reservation/_helpers/price-verify";
import type { ReservationCreateInput } from "@/app/services/reservation/types";

const VILLA_ID = "villa-discount-snapshot-1";

function mockVillaRow(overrides: Record<string, unknown> = {}) {
  return {
    cleaning_fee: 0,
    cleaning_currency: "TRY",
    cleaning_limit: 0,
    custom_prepayment_rate: null,
    // 🛡️ Senaryo 11 — pool heating BOZULMADI: villa'da gerçek bir fee
    // tanımlı, seçili DEĞİL — snapshot stay hesabına HİÇ karışmamalı.
    pool_heating_fee: 500,
    pool_heating_currency: "TRY",
    pool_heating_months: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findVillaCleaningConfig.mockResolvedValue({ data: mockVillaRow(), error: null });
  getExchangeRatesMap.mockResolvedValue({ rates: RATES, updatedAt: null });
  getPublicSettings.mockResolvedValue({ prepayment_rate: 20 } as never);
  getVillaDiscounts.mockResolvedValue([]);
});

const FLAT_10000 = [
  { start_date: "2026-10-01", end_date: "2026-10-31", price: 10000, currency: "TRY" },
];

describe("detectAppliedDiscountForStay — YENİ discount ENGINE DEĞİL, getActiveDiscount reuse", () => {
  it("discount yok → null", () => {
    expect(detectAppliedDiscountForStay("2026-10-01", "2026-10-05", [])).toBeNull();
  });

  it("stay aralığı discount aralığının tamamen DIŞINDA → null", () => {
    const discounts = [
      { start_date: "2026-01-01", end_date: "2026-01-10", discount_type: "percent" as const, discount_value: 20, currency: null },
    ];
    expect(detectAppliedDiscountForStay("2026-10-01", "2026-10-05", discounts)).toBeNull();
  });

  it("stay aralığı discount ile KISMEN çakışıyor → discount kaydını döner", () => {
    const discounts = [
      { start_date: "2026-10-01", end_date: "2026-10-07", discount_type: "percent" as const, discount_value: 20, currency: null },
    ];
    const found = detectAppliedDiscountForStay("2026-10-05", "2026-10-10", discounts);
    expect(found).not.toBeNull();
    expect(found!.discount_value).toBe(20);
  });
});

describe("recomputePublicReservationPrice — discount snapshot alanları (migration 080)", () => {
  it("1) Discount yok → snapshot TAMAMEN default (discount_applied=false, diğer 5 alan null)", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([]);

    const res = await recomputePublicReservationPrice({
      villa_id: VILLA_ID,
      start_date: "2026-10-01",
      end_date: "2026-10-05",
    });

    expect(res!.discountApplied).toBe(false);
    expect(res!.discountType).toBeNull();
    expect(res!.discountValue).toBeNull();
    expect(res!.discountCurrency).toBeNull();
    expect(res!.originalStayTotalTry).toBeNull();
    expect(res!.stayDiscountAmountTry).toBeNull();
    // 12) Eski davranış (Faz 3) bozulmadı — normal toplam AYNEN.
    expect(res!.totalPriceTry).toBe(40000);
  });

  it("2+3) %20 percent → original_stay_total_try=40.000, savings=8.000, final total=32.000", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2026-10-01", end_date: "2026-10-10", discount_type: "percent", discount_value: 20, currency: null },
    ]);

    const res = await recomputePublicReservationPrice({
      villa_id: VILLA_ID,
      start_date: "2026-10-01",
      end_date: "2026-10-05",
    });

    expect(res!.discountApplied).toBe(true);
    expect(res!.discountType).toBe("percent");
    expect(res!.discountValue).toBe(20);
    expect(res!.discountCurrency).toBeNull(); // percent → NULL
    expect(res!.originalStayTotalTry).toBe(40000); // indirimsiz 4×10.000
    expect(res!.stayDiscountAmountTry).toBe(8000); // 40.000-32.000
    expect(res!.totalPriceTry).toBe(32000);
  });

  it("4) Fixed özel fiyat 5.000 → discount_value=5000 (ÇIKARMA YOK), discount_currency='TRY', original=40.000, savings=20.000", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2026-10-01", end_date: "2026-10-10", discount_type: "fixed", discount_value: 5000, currency: "TRY" },
    ]);

    const res = await recomputePublicReservationPrice({
      villa_id: VILLA_ID,
      start_date: "2026-10-01",
      end_date: "2026-10-05",
    });

    expect(res!.discountApplied).toBe(true);
    expect(res!.discountType).toBe("fixed");
    // 🛡️ "5.000 TL gecelik indirim" DEĞİL — ham gecelik özel fiyat değeri.
    expect(res!.discountValue).toBe(5000);
    expect(res!.discountCurrency).toBe("TRY");
    expect(res!.originalStayTotalTry).toBe(40000); // 4×10.000 (indirimsiz)
    expect(res!.stayDiscountAmountTry).toBe(20000); // 40.000-20.000
    expect(res!.totalPriceTry).toBe(20000); // 4×5.000
  });

  it("5) Fixed özel fiyat (15.000) normal fiyattan (10.000) YÜKSEK → savings NEGATİF, clamp YOK", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2026-10-01", end_date: "2026-10-10", discount_type: "fixed", discount_value: 15000, currency: "TRY" },
    ]);

    const res = await recomputePublicReservationPrice({
      villa_id: VILLA_ID,
      start_date: "2026-10-01",
      end_date: "2026-10-05",
    });

    expect(res!.discountValue).toBe(15000);
    expect(res!.originalStayTotalTry).toBe(40000); // 4×10.000
    expect(res!.totalPriceTry).toBe(60000); // 4×15.000
    // 40.000 - 60.000 = -20.000 → NEGATİF, 0'a clamp EDİLMEZ.
    expect(res!.stayDiscountAmountTry).toBe(-20000);
  });

  it("6) %100 percent indirim → final stay 0, fallback normale DÖNMEZ, savings=original (tam tutar)", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2026-10-01", end_date: "2026-10-10", discount_type: "percent", discount_value: 100, currency: null },
    ]);

    const res = await recomputePublicReservationPrice({
      villa_id: VILLA_ID,
      start_date: "2026-10-01",
      end_date: "2026-10-05",
    });

    expect(res!.discountApplied).toBe(true);
    expect(res!.totalPriceTry).toBe(0); // final stay 0, normale FALLBACK yok
    expect(res!.originalStayTotalTry).toBe(40000);
    expect(res!.stayDiscountAmountTry).toBe(40000); // tam tutar tasarruf
  });

  it("7) Kısmi tarih çakışması → yalnız eşleşen geceler indirimli; snapshot metadata doğru discount kaydını taşır", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2026-10-01", end_date: "2026-10-07", discount_type: "percent", discount_value: 20, currency: null },
    ]);

    // check-in 5 Ekim, check-out 10 Ekim → geceler 05,06,07 (indirimli) + 08,09 (normal).
    const res = await recomputePublicReservationPrice({
      villa_id: VILLA_ID,
      start_date: "2026-10-05",
      end_date: "2026-10-10",
    });

    expect(res!.discountApplied).toBe(true);
    expect(res!.discountValue).toBe(20);
    expect(res!.originalStayTotalTry).toBe(50000); // 5 gece × 10.000 (indirimsiz TOPLAM)
    expect(res!.totalPriceTry).toBe(8000 * 3 + 10000 * 2); // 44.000
    expect(res!.stayDiscountAmountTry).toBe(50000 - 44000); // 6.000
  });

  it("11) Pool heating bozulmadı — discount snapshot alanları pool heating snapshot'ını ETKİLEMEZ", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2026-10-01", end_date: "2026-10-10", discount_type: "fixed", discount_value: 5000, currency: "TRY" },
    ]);

    const res = await recomputePublicReservationPrice({
      villa_id: VILLA_ID,
      start_date: "2026-10-01",
      end_date: "2026-10-05",
      pool_heating_selected: true,
    });

    // Villa'da pool_heating_fee=500 TRY, selected=true, 4 gece → 2.000 TRY.
    expect(res!.poolHeatingSelected).toBe(true);
    expect(res!.poolHeatingTotalTry).toBe(2000);
    // total = discounted stay (20.000) + cleaning (0) + pool heating (2.000).
    expect(res!.totalPriceTry).toBe(22000);
    // Discount snapshot HÂLÂ doğru (pool heating'den ETKİLENMEDİ).
    expect(res!.originalStayTotalTry).toBe(40000);
    expect(res!.stayDiscountAmountTry).toBe(20000);
  });
});

describe("verifyPublicReservationPrice — authoritative discount snapshot (senaryo 8)", () => {
  const FAKE_CLIENT_PAYLOAD: ReservationCreateInput = {
    villa_id: VILLA_ID,
    start_date: "2026-10-01",
    end_date: "2026-10-05",
    total_price: 1,
    name: "Test Müşteri",
    phone: "5551112233",
    // 🛡️ Client'ın gönderdiği SAHTE discount snapshot alanları — server
    // BUNLARI KULLANMAMALI, kendi hesapladığı gerçek değerleri dönmeli.
    discount_applied: true,
    discount_type: "fixed",
    discount_value: 1,
    discount_currency: "USD",
    original_stay_total_try: 999999,
    stay_discount_amount_try: 999999,
  };

  it("8) Client'ın sahte discount_applied/type/value/currency/original/savings alanları YOK SAYILIR — server kendi hesapladığını döner", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    // Sunucu tarafında GERÇEK indirim: %20 (client'ın gönderdiği "fixed/1/USD" DEĞİL).
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2026-10-01", end_date: "2026-10-10", discount_type: "percent", discount_value: 20, currency: null },
    ]);

    const verification = await verifyPublicReservationPrice(FAKE_CLIENT_PAYLOAD);

    expect(verification.authoritative).not.toBeNull();
    expect(verification.authoritative!.discount_applied).toBe(true);
    expect(verification.authoritative!.discount_type).toBe("percent");
    expect(verification.authoritative!.discount_value).toBe(20);
    expect(verification.authoritative!.discount_currency).toBeNull();
    expect(verification.authoritative!.original_stay_total_try).toBe(40000);
    expect(verification.authoritative!.stay_discount_amount_try).toBe(8000);
  });

  it("8b) Server'da HİÇ indirim yokken client sahte discount_applied=true gönderirse → server false/null döner", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([]); // sunucuda gerçek indirim YOK

    const verification = await verifyPublicReservationPrice(FAKE_CLIENT_PAYLOAD);

    expect(verification.authoritative!.discount_applied).toBe(false);
    expect(verification.authoritative!.discount_type).toBeNull();
    expect(verification.authoritative!.discount_value).toBeNull();
    expect(verification.authoritative!.discount_currency).toBeNull();
    expect(verification.authoritative!.original_stay_total_try).toBeNull();
    expect(verification.authoritative!.stay_discount_amount_try).toBeNull();
  });

  it("recompute FAIL (fail-open) → authoritative null (discount snapshot dahil hiçbir alan override edilmez)", async () => {
    getVillaPrices.mockRejectedValue(new Error("DB patladı"));

    const verification = await verifyPublicReservationPrice(FAKE_CLIENT_PAYLOAD);

    expect(verification.authoritative).toBeNull();
  });
});
