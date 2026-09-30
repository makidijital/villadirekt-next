import { describe, it, expect, vi, beforeEach } from "vitest";

/* ===============================================================
   🛡️ FAZ 3 — recomputePublicReservationPrice / verifyPublicReservationPrice
   villa_discounts SERVER-AUTHORITATIVE entegrasyonu — UNIT TESTLERİ
   ===============================================================
   AMAÇ:
     `price-verify.ts` artık villa_discounts'ı (`getVillaDiscounts`) da
     okuyup `calculateGrandTotal`'a `discounts` olarak geçiriyor; dönen
     `ServerPriceResult`/`PublicReservationServerVerification.authoritative`
     client'ın gönderdiği HİÇBİR finansal alana bakmadan (yalnız villa_id +
     tarih aralığından) SUNUCUNUN kendi hesapladığı nihai fiyatı taşıyor.
     Bu testler:
       1. Discount yok → mevcut davranış AYNI (regression guard).
       2. Percent indirim → normal fiyatın yüzdesi.
       3. Fixed özel fiyat → HER GECE doğrudan discount_value (ÇIKARMA YOK).
       4. Fixed özel fiyat normal fiyattan YÜKSEK olsa bile → yine discount_value.
       5. %100 percent indirim → stay 0 olabilir, fallback normal fiyata
          DÖNMEZ (calculateStayTotal'ın hadMatchingPrice guard'ı — bkz.
          lib/price.engine.ts — burada UÇTAN UCA server recompute
          seviyesinde de doğrulanıyor).
       6. Kısmi tarih çakışması → yalnız eşleşen geceler etkilenir.
       7. Client'ın gönderdiği SAHTE total_price/total_price_try HİÇBİR
          ŞEKİLDE authoritative sonucu etkilemez (recompute fonksiyonu
          bu alanları imzasında bile ALMAZ; verifyPublicReservationPrice
          seviyesinde de kanıtlanır).
       8. Recompute FAIL (repository hata/throw) → fail-open, authoritative
          null (pool heating precedent'iyle AYNI davranış — booking
          bloklanmaz, body override edilmez).

   ⚠️ Tüm DB/servis bağımlılıkları MOCK'lanır — gerçek Postgres/RPC
   çağrısı yapılmaz (conflict.test.ts ile AYNI proje konvansiyonu).
   `server-only` vitest.config.ts'de stub'lanmış (TOTP 2FA adımından
   beri) — bu dosya artık DOĞRUDAN import edilebiliyor.
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
} from "@/app/services/reservation/_helpers/price-verify";
import type { ReservationCreateInput } from "@/app/services/reservation/types";

const VILLA_ID = "villa-discount-test-1";

/** Ortak villa row — cleaning/pool heating 0, custom_prepayment_rate yok
 *  (settings fallback 20 kullanılır) → testler yalnız STAY/discount
 *  matematiğine odaklanır (cleaning/pool heating izolasyonu ZATEN
 *  price.engine.test.ts'de kanıtlandı). */
function mockVillaRow(overrides: Record<string, unknown> = {}) {
  return {
    cleaning_fee: 0,
    cleaning_currency: "TRY",
    cleaning_limit: 0,
    custom_prepayment_rate: null,
    pool_heating_fee: 0,
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

const FLAT_10000: Array<{
  start_date: string;
  end_date: string;
  price: number;
  currency: string;
}> = [{ start_date: "2026-10-01", end_date: "2026-10-31", price: 10000, currency: "TRY" }];

describe("recomputePublicReservationPrice — villa_discounts server-authoritative (FAZ 3)", () => {
  it("1) Discount yok → mevcut fiyat aynı (4 gece × 10.000 = 40.000)", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([]);

    const res = await recomputePublicReservationPrice({
      villa_id: VILLA_ID,
      start_date: "2026-10-01",
      end_date: "2026-10-05",
    });

    expect(res).not.toBeNull();
    expect(res!.totalPriceTry).toBe(40000);
    expect(res!.totalPrice).toBe(40000);
    expect(getVillaDiscounts).toHaveBeenCalledWith(VILLA_ID);
  });

  it("2) %20 percent indirim → 4 gece × 8.000 = 32.000", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2026-10-01", end_date: "2026-10-10", discount_type: "percent", discount_value: 20, currency: null },
    ]);

    const res = await recomputePublicReservationPrice({
      villa_id: VILLA_ID,
      start_date: "2026-10-01",
      end_date: "2026-10-05",
    });

    expect(res!.totalPriceTry).toBe(32000);
  });

  it("3) Fixed özel fiyat 5.000 → HER GECE doğrudan 5.000 (ÇIKARMA YOK) — 4 gece × 5.000 = 20.000", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2026-10-01", end_date: "2026-10-10", discount_type: "fixed", discount_value: 5000, currency: "TRY" },
    ]);

    const res = await recomputePublicReservationPrice({
      villa_id: VILLA_ID,
      start_date: "2026-10-01",
      end_date: "2026-10-05",
    });

    expect(res!.totalPriceTry).toBe(20000);
  });

  it("4) Fixed özel fiyat (15.000) normal fiyattan (10.000) YÜKSEK olsa bile → final 4×15.000=60.000 (engellenmez)", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2026-10-01", end_date: "2026-10-10", discount_type: "fixed", discount_value: 15000, currency: "TRY" },
    ]);

    const res = await recomputePublicReservationPrice({
      villa_id: VILLA_ID,
      start_date: "2026-10-01",
      end_date: "2026-10-05",
    });

    expect(res!.totalPriceTry).toBe(60000);
  });

  it("5) %100 percent indirim → stay 0 olur, normal fiyata FALLBACK ETMEZ", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2026-10-01", end_date: "2026-10-10", discount_type: "percent", discount_value: 100, currency: null },
    ]);

    const res = await recomputePublicReservationPrice({
      villa_id: VILLA_ID,
      start_date: "2026-10-01",
      end_date: "2026-10-05",
    });

    expect(res!.totalPriceTry).toBe(0);
    expect(res!.totalPrice).toBe(0);
  });

  it("6) Kısmi tarih çakışması → yalnız eşleşen geceler indirimli (indirim 01-07, konaklama 05-10 → geceler 05,06,07 indirimli / 08,09 normal)", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2026-10-01", end_date: "2026-10-07", discount_type: "percent", discount_value: 20, currency: null },
    ]);

    // check-in 5 Ekim, check-out 10 Ekim → geceler 05,06,07,08,09 (5 gece).
    const res = await recomputePublicReservationPrice({
      villa_id: VILLA_ID,
      start_date: "2026-10-05",
      end_date: "2026-10-10",
    });

    // 05,06,07 → 8.000 (indirimli) ; 08,09 → 10.000 (normal)
    expect(res!.totalPriceTry).toBe(8000 * 3 + 10000 * 2);
    expect(res!.totalPriceTry).toBe(44000);
  });

  it("7) Server hesaplaması villa_id/tarih dışında hiçbir client alanına BAĞIMLI DEĞİL (fonksiyon imzasında total_price/total_price_try YOK)", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2026-10-01", end_date: "2026-10-10", discount_type: "fixed", discount_value: 5000, currency: "TRY" },
    ]);

    // Kasıtlı: fazladan client alanları (total_price/total_price_try)
    // geçirilse bile TypeScript/runtime seviyesinde YOK SAYILIR (input
    // type'ında böyle bir alan YOK — recomputePublicReservationPrice
    // yalnız villa_id/start_date/end_date/pool_heating_selected alır).
    // `as unknown as Parameters<...>[0]` ile kasıtlı fazladan alanlı bir
    // payload geçiriliyor — bu, "client total'ı asla okunmuyor"
    // garantisinin hem tip hem runtime seviyesinde kanıtı.
    const fakeClientPayload = {
      villa_id: VILLA_ID,
      start_date: "2026-10-01",
      end_date: "2026-10-05",
      total_price: 1,
      total_price_try: 1,
    } as unknown as Parameters<typeof recomputePublicReservationPrice>[0];
    const res = await recomputePublicReservationPrice(fakeClientPayload);

    // Sahte client "1" değeri YOK SAYILIYOR — server kendi hesapladığı
    // 20.000'i (4 gece × 5.000 özel fiyat) döner.
    expect(res!.totalPriceTry).toBe(20000);
  });

  it("8) Recompute FAIL (repository throw) → hatayı fırlatır (kendi try/catch'i YOK; fail-open sorumluluğu caller'da)", async () => {
    getVillaPrices.mockRejectedValue(new Error("DB patladı"));

    // recomputePublicReservationPrice kendi içinde try/catch YAPMAZ —
    // hatayı yukarı fırlatır; fail-open sorumluluğu caller'da
    // (verifyPublicReservationPrice) — bkz. sonraki describe bloğu.
    await expect(
      recomputePublicReservationPrice({
        villa_id: VILLA_ID,
        start_date: "2026-10-01",
        end_date: "2026-10-05",
      })
    ).rejects.toThrow("DB patladı");
  });
});

describe("verifyPublicReservationPrice — authoritative snapshot (FAZ 3)", () => {
  const BASE_PAYLOAD: ReservationCreateInput = {
    villa_id: VILLA_ID,
    start_date: "2026-10-01",
    end_date: "2026-10-05",
    total_price: 1, // 🛡️ SAHTE client değeri — authoritative bunu YOK SAYMALI
    name: "Test Müşteri",
    phone: "5551112233",
    // 🛡️ Client'ın gönderdiği (sahte/manipüle) finansal alanlar:
    total_price_try: 1,
    original_price: 999999,
    original_currency: "USD",
    exchange_rate: 999,
    original_cleaning_fee: 999999,
    original_cleaning_currency: "EUR",
    cleaning_fee_try: 999999,
    prepayment_amount: 1,
    remaining_payment: 1,
  };

  it("authoritative, server'ın hesapladığı DOĞRU değerleri döner — client'ın sahte total_price/total_price_try'ını YOK SAYAR", async () => {
    getVillaPrices.mockResolvedValue(FLAT_10000);
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2026-10-01", end_date: "2026-10-10", discount_type: "fixed", discount_value: 5000, currency: "TRY" },
    ]);

    const verification = await verifyPublicReservationPrice(BASE_PAYLOAD);

    expect(verification.authoritative).not.toBeNull();
    // 4 gece × 5.000 özel fiyat = 20.000 — client'ın gönderdiği "1" DEĞİL.
    expect(verification.authoritative!.total_price).toBe(20000);
    expect(verification.authoritative!.total_price_try).toBe(20000);
    // Villa TRY olduğu için (foreign currency yok) original_price/original_currency
    // client'ın sahte USD/999999 değerlerini DEĞİL, gerçek TRY/0 defaultunu yansıtır.
    expect(verification.authoritative!.original_currency).toBe("TRY");
    expect(verification.authoritative!.original_price).toBe(0);
    expect(verification.authoritative!.exchange_rate).toBe(1);
  });

  it("recompute FAIL (fail-open) → authoritative null, poolHeating null, comparison null — booking BLOKLANMAZ", async () => {
    getVillaPrices.mockRejectedValue(new Error("DB patladı"));

    const verification = await verifyPublicReservationPrice(BASE_PAYLOAD);

    expect(verification.authoritative).toBeNull();
    expect(verification.poolHeating).toBeNull();
    expect(verification.comparison).toBeNull();
  });

  it("villa_id eksik → recompute null döner, authoritative null (route body'yi değiştirmez)", async () => {
    const verification = await verifyPublicReservationPrice({
      ...BASE_PAYLOAD,
      villa_id: "",
    });

    expect(verification.authoritative).toBeNull();
  });

  it("dövizli villa (USD) + fixed özel fiyat farklı currency (TRY) → convertPrice ile villa currency'sine çevrilir, exchange_rate doğru döner", async () => {
    getVillaPrices.mockResolvedValue([
      { start_date: "2026-10-01", end_date: "2026-10-31", price: 100, currency: "USD" },
    ]);
    getVillaDiscounts.mockResolvedValue([]);

    const verification = await verifyPublicReservationPrice({
      ...BASE_PAYLOAD,
    });

    expect(verification.authoritative).not.toBeNull();
    // Villa USD → original_currency USD, exchange_rate RATES.USD (30) olmalı
    // (client'ın sahte exchange_rate:999 değeri YOK SAYILIR).
    expect(verification.authoritative!.original_currency).toBe("USD");
    expect(verification.authoritative!.exchange_rate).toBe(30);
    // 4 gece × 100 USD = 400 USD → original_price 400 (indirim yok).
    expect(verification.authoritative!.original_price).toBe(400);
    // total_price_try = 400 USD × 30 = 12.000 TRY (client'ın "1" değeri DEĞİL).
    expect(verification.authoritative!.total_price_try).toBe(12000);
  });
});
