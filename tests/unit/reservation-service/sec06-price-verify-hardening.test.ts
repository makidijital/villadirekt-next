import { describe, it, expect, vi, beforeEach } from "vitest";

/* ===============================================================
   🛡️ SEC-06 — price-verify SERTLEŞTİRMESİ (F3 / F4 / F5)
   ===============================================================
   F3: hesapta KULLANILAN bir dövizin kuru yoksa → rateUnavailable
       (eskiden resolveRate sessizce 1:1 çeviriyordu).
   F4: damage_deposit villa.deposit'ten (client formülüyle aynı).
   F5: villa ayarı / settings okunamaz veya recompute patlarsa →
       recomputeFailed (eskiden fail-open, client tutarları yazılıyordu).
   =============================================================== */

const findVillaCleaningConfig = vi.fn();
const getVillaPrices = vi.fn();
const getExchangeRatesMap = vi.fn();
const getPublicSettings = vi.fn();
const getVillaDiscounts = vi.fn();

vi.mock("@/lib/db/reservation.repository", () => ({
  reservationRepository: {
    findVillaCleaningConfig: (...a: unknown[]) => findVillaCleaningConfig(...a),
  },
}));
vi.mock("@/app/services/villa-price.service", () => ({
  getVillaPrices: (...a: unknown[]) => getVillaPrices(...a),
}));
vi.mock("@/app/services/exchange-rate.service", () => ({
  getExchangeRatesMap: (...a: unknown[]) => getExchangeRatesMap(...a),
}));
vi.mock("@/app/services/settings.service", () => ({
  getPublicSettings: (...a: unknown[]) => getPublicSettings(...a),
}));
vi.mock("@/app/services/villa-discount.service", () => ({
  getVillaDiscounts: (...a: unknown[]) => getVillaDiscounts(...a),
}));

import { verifyPublicReservationPrice } from "@/app/services/reservation/_helpers/price-verify";
import type { ReservationCreateInput } from "@/app/services/reservation/types";

const RATES = { USD: 32.5, EUR: 35.1, GBP: 41.2 };
const VILLA = {
  cleaning_fee: 0,
  cleaning_currency: "TRY",
  cleaning_limit: 0,
  custom_prepayment_rate: null,
  pool_heating_fee: 0,
  pool_heating_currency: "TRY",
  pool_heating_months: null,
  deposit: 5000,
};
const TRY_PRICES = [{ start_date: "2027-06-01", end_date: "2027-06-30", price: 9000, currency: "TRY" }];
const EUR_PRICES = [{ start_date: "2027-06-01", end_date: "2027-06-30", price: 200, currency: "EUR" }];

const payload = (over: Partial<ReservationCreateInput> = {}) =>
  ({
    villa_id: "villa-sec06",
    start_date: "2027-06-02",
    end_date: "2027-06-05",
    name: "Test",
    phone: "+905551112233",
    ...over,
  }) as ReservationCreateInput;

function withoutRate(code: string) {
  const r: Record<string, number> = { ...RATES };
  delete r[code];
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  findVillaCleaningConfig.mockResolvedValue({ data: { ...VILLA }, error: null });
  getVillaPrices.mockResolvedValue(EUR_PRICES);
  getExchangeRatesMap.mockResolvedValue({ rates: RATES, updatedAt: null });
  getPublicSettings.mockResolvedValue({ prepayment_rate: 20 });
  getVillaDiscounts.mockResolvedValue([]);
});

describe("F3 — eksik kur", () => {
  it("EUR villa + EUR kuru yok → rateUnavailable, authoritative YOK", async () => {
    getExchangeRatesMap.mockResolvedValue({ rates: withoutRate("EUR"), updatedAt: null });
    const v = await verifyPublicReservationPrice(payload());
    expect(v.rateUnavailable).toBe(true);
    expect(v.authoritative).toBeNull();
    expect(v.poolHeating).toBeNull();
    expect(v.recomputeFailed).toBe(false);
  });

  it("kur tablosu tamamen okunamadı ({}) + dövizli villa → rateUnavailable", async () => {
    getExchangeRatesMap.mockResolvedValue({ rates: {}, updatedAt: null });
    const v = await verifyPublicReservationPrice(payload());
    expect(v.rateUnavailable).toBe(true);
  });

  it("kur 0 / NaN (geçersiz) → rateUnavailable (resolveRate ile aynı ölçüt)", async () => {
    getExchangeRatesMap.mockResolvedValue({ rates: { ...RATES, EUR: 0 }, updatedAt: null });
    expect((await verifyPublicReservationPrice(payload())).rateUnavailable).toBe(true);
    getExchangeRatesMap.mockResolvedValue({ rates: { ...RATES, EUR: Number.NaN }, updatedAt: null });
    expect((await verifyPublicReservationPrice(payload())).rateUnavailable).toBe(true);
  });

  it("TRY villa, EUR kuru yok → ETKİLENMEZ (kur gerekmiyor)", async () => {
    getVillaPrices.mockResolvedValue(TRY_PRICES);
    getExchangeRatesMap.mockResolvedValue({ rates: withoutRate("EUR"), updatedAt: null });
    const v = await verifyPublicReservationPrice(payload());
    expect(v.rateUnavailable).toBe(false);
    expect(v.authoritative?.total_price_try).toBe(27000);
  });

  it("tahsil edilen dövizli temizlik (GBP) kuru yok → rateUnavailable", async () => {
    getVillaPrices.mockResolvedValue(TRY_PRICES);
    findVillaCleaningConfig.mockResolvedValue({
      data: { ...VILLA, cleaning_fee: 100, cleaning_currency: "GBP", cleaning_limit: 5 },
      error: null,
    });
    getExchangeRatesMap.mockResolvedValue({ rates: withoutRate("GBP"), updatedAt: null });
    expect((await verifyPublicReservationPrice(payload())).rateUnavailable).toBe(true);
  });

  it("dövizli temizlik tahsil EDİLMİYORSA (limit üstü) kur aranmaz", async () => {
    getVillaPrices.mockResolvedValue(TRY_PRICES);
    findVillaCleaningConfig.mockResolvedValue({
      data: { ...VILLA, cleaning_fee: 100, cleaning_currency: "GBP", cleaning_limit: 2 },
      error: null,
    });
    getExchangeRatesMap.mockResolvedValue({ rates: withoutRate("GBP"), updatedAt: null });
    const v = await verifyPublicReservationPrice(payload());
    expect(v.rateUnavailable).toBe(false);
    expect(v.authoritative?.cleaning_fee_try).toBe(0);
  });

  it("seçili dövizli havuz ısıtma (EUR) kuru yok → rateUnavailable; seçilmemişse etkilenmez", async () => {
    getVillaPrices.mockResolvedValue(TRY_PRICES);
    findVillaCleaningConfig.mockResolvedValue({
      data: { ...VILLA, pool_heating_fee: 50, pool_heating_currency: "EUR" },
      error: null,
    });
    getExchangeRatesMap.mockResolvedValue({ rates: withoutRate("EUR"), updatedAt: null });
    expect(
      (await verifyPublicReservationPrice(payload({ pool_heating_selected: true }))).rateUnavailable
    ).toBe(true);
    expect(
      (await verifyPublicReservationPrice(payload({ pool_heating_selected: false }))).rateUnavailable
    ).toBe(false);
  });

  it("fixed özel fiyat farklı dövizde (USD) ve USD kuru yok → rateUnavailable", async () => {
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2027-06-01", end_date: "2027-06-30", discount_type: "fixed", discount_value: 250, currency: "USD" },
    ]);
    getExchangeRatesMap.mockResolvedValue({ rates: withoutRate("USD"), updatedAt: null });
    expect((await verifyPublicReservationPrice(payload())).rateUnavailable).toBe(true);
  });

  it("percent indirim ek kur gerektirmez", async () => {
    getVillaPrices.mockResolvedValue(TRY_PRICES);
    getVillaDiscounts.mockResolvedValue([
      { start_date: "2027-06-01", end_date: "2027-06-30", discount_type: "percent", discount_value: 10, currency: null },
    ]);
    getExchangeRatesMap.mockResolvedValue({ rates: {}, updatedAt: null });
    const v = await verifyPublicReservationPrice(payload());
    expect(v.rateUnavailable).toBe(false);
    expect(v.authoritative?.total_price_try).toBe(24300);
  });
});

describe("F4 — hasar depozitosu", () => {
  it("client'ın sahte damage_deposit'i yok sayılır; villa.deposit kullanılır", async () => {
    const v = await verifyPublicReservationPrice(payload({ damage_deposit: 0 }));
    expect(v.authoritative?.damage_deposit).toBe(5000);
  });

  it("villa.deposit null/boş → 0 (client formülü Number(x) || 0 ile aynı)", async () => {
    findVillaCleaningConfig.mockResolvedValue({ data: { ...VILLA, deposit: null }, error: null });
    expect((await verifyPublicReservationPrice(payload({ damage_deposit: 99999 }))).authoritative?.damage_deposit).toBe(0);
  });
});

describe("F5 — fail-closed", () => {
  it("villa ayarları okunamadı (DB hata) → recomputeFailed, authoritative YOK", async () => {
    findVillaCleaningConfig.mockResolvedValue({ data: null, error: { message: "db down" } });
    const v = await verifyPublicReservationPrice(payload());
    expect(v.recomputeFailed).toBe(true);
    expect(v.authoritative).toBeNull();
    expect(v.priceUnavailable).toBe(false);
  });

  it("villa satırı yok → recomputeFailed", async () => {
    findVillaCleaningConfig.mockResolvedValue({ data: null, error: null });
    expect((await verifyPublicReservationPrice(payload())).recomputeFailed).toBe(true);
  });

  it("settings okunamadı + villa override yok → recomputeFailed (sessiz %20 yok)", async () => {
    getPublicSettings.mockResolvedValue(null);
    expect((await verifyPublicReservationPrice(payload())).recomputeFailed).toBe(true);
  });

  it("settings okunamadı AMA villa override var → hesap AYNEN (settings gerekmiyor)", async () => {
    getPublicSettings.mockResolvedValue(null);
    findVillaCleaningConfig.mockResolvedValue({ data: { ...VILLA, custom_prepayment_rate: 30 }, error: null });
    getVillaPrices.mockResolvedValue(TRY_PRICES);
    const v = await verifyPublicReservationPrice(payload());
    expect(v.recomputeFailed).toBe(false);
    expect(v.authoritative?.prepayment_amount).toBe(8100);
  });

  it("recompute beklenmeyen hata → recomputeFailed", async () => {
    getVillaPrices.mockRejectedValue(new Error("boom"));
    const v = await verifyPublicReservationPrice(payload());
    expect(v.recomputeFailed).toBe(true);
    expect(v.authoritative).toBeNull();
  });

  it("villa_id eksik → recomputeFailed", async () => {
    expect((await verifyPublicReservationPrice(payload({ villa_id: "" }))).recomputeFailed).toBe(true);
  });

  it("başarılı hesapta bayraklar false ve authoritative dolu", async () => {
    const v = await verifyPublicReservationPrice(payload());
    expect(v.recomputeFailed).toBe(false);
    expect(v.rateUnavailable).toBe(false);
    expect(v.priceUnavailable).toBe(false);
    expect(v.authoritative?.total_price_try).toBe(21060);
  });
});
