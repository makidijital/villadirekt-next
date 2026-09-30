/* ===============================================================
   🛡️ EKSİK SEZON FİYATI — REGRESYON KİLİDİ
   ===============================================================
   PROBLEM (düzeltildi): `villa_prices` seçilen tarih aralığının bazı
   gecelerini kapsamıyorsa motor o geceleri sessizce 0 TL sayıyor ve
   toplamı düşürüyordu. Hiçbir gece kapsanmıyorsa `prices[0]`'ın TEK
   GECELİK fiyatı tüm konaklamanın bedeli oluyordu.

   BU DOSYA İKİ ŞEYİ BİRDEN KİLİTLER:
     A) YANLIŞ davranış geri gelmesin  → eksik kapsamada GEÇERLİ fiyat
        üretilmemeli (`priceAvailable === false`, para alanları 0).
     B) DOĞRU davranış değişmesin      → tam kapsanan hesaplarda tüm
        sayılar ESKİSİYLE BİREBİR aynı kalmalı (indirim, kur, sezon
        geçişi, temizlik dahil).

   Gerçek motor çalışır; hiçbir şey mock'lanmaz (saf fonksiyonlar).
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateGrandTotal,
  calculateStayTotal,
  type DiscountRange,
} from "@/lib/price.engine";
import type { PriceRange } from "@/lib/villa-row.types";

const RATES = { USD: 40, EUR: 45, GBP: 50 };
/** 08.10.2026 → 15.10.2026 = 7 gece (8,9,10,11,12,13,14). */
const START = "2026-10-08";
const END = "2026-10-15";

const P = (
  price: number,
  start_date: string,
  end_date: string,
  currency = "TRY"
): PriceRange => ({ price, currency, start_date, end_date });

function total(prices: PriceRange[], opts: Record<string, unknown> = {}) {
  return calculateGrandTotal({
    start: (opts.start as string) ?? START,
    end: (opts.end as string) ?? END,
    prices,
    currency: (opts.currency as string) ?? "TRY",
    rates: RATES,
    cleaning_fee: (opts.cleaning_fee as number) ?? 0,
    cleaning_currency: "TRY",
    cleaning_limit: 0,
    discounts: (opts.discounts as DiscountRange[] | null) ?? null,
  });
}

/* ===============================================================
   A) DOĞRU HESAPLAR — DEĞİŞMEMELİ
   =============================================================== */
describe("A) tam kapsanan hesaplar — mevcut sonuçlar BİREBİR korunur", () => {
  it("1) 7/7 gecede fiyat var → 70.000 (değişmedi)", () => {
    const r = total([P(10000, "2026-10-01", "2026-10-31")]);
    expect(r.nights).toBe(7);
    expect(r.stay).toBe(70000);
    expect(r.total).toBe(70000);
    expect(r.priceAvailable).toBe(true);
    expect(r.uncoveredNights).toBe(0);
  });

  it("6) sezon geçişi, tüm geceler kapsanıyor → 110.000 (değişmedi)", () => {
    /* 8,9,10 Eki = 3 × 10.000 ; 11,12,13,14 Eki = 4 × 20.000 */
    const r = total([
      P(10000, "2026-10-01", "2026-10-10"),
      P(20000, "2026-10-11", "2026-10-20"),
    ]);
    expect(r.stay).toBe(110000);
    expect(r.total).toBe(110000);
    expect(r.priceAvailable).toBe(true);
  });

  it("7) indirimli + tam kapsanan → 56.000 (%20, değişmedi)", () => {
    const d: DiscountRange[] = [
      {
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        discount_type: "percent",
        discount_value: 20,
        currency: null,
      },
    ];
    const r = total([P(10000, "2026-10-01", "2026-10-31")], { discounts: d });
    expect(r.stay).toBe(56000);
    expect(r.priceAvailable).toBe(true);
  });

  it("7b) %100 indirim → stay 0 AMA fiyat GEÇERLİ (meşru sıfır)", () => {
    /* Kritik ayrım: "indirimle 0'a düşen gece" ≠ "fiyatı olmayan gece".
       Kapsama kontrolü İNDİRİMDEN ÖNCEKİ fiyata bakar. */
    const d: DiscountRange[] = [
      {
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        discount_type: "percent",
        discount_value: 100,
        currency: null,
      },
    ];
    const r = total([P(10000, "2026-10-01", "2026-10-31")], { discounts: d });
    expect(r.stay).toBe(0);
    expect(r.priceAvailable).toBe(true);
    expect(r.uncoveredNights).toBe(0);
  });

  it("8) kur dönüşümü (EUR villa → TRY gösterim) → 63.000 (değişmedi)", () => {
    const r = total([P(200, "2026-10-01", "2026-10-31", "EUR")]);
    expect(r.stay).toBe(63000); // 7 × 200 × 45
    expect(r.original_stay).toBe(1400);
    expect(r.original_currency).toBe("EUR");
    expect(r.priceAvailable).toBe(true);
  });

  it("9) temizlik ücreti dahil normal hesap → değişmedi", () => {
    const r = total([P(10000, "2026-10-01", "2026-10-31")], {
      cleaning_fee: 1500,
    });
    expect(r.stay).toBe(70000);
    expect(r.cleaning).toBe(1500);
    expect(r.total).toBe(71500);
    expect(r.priceAvailable).toBe(true);
  });

  it("9b) 1 gece ve 30 gece → doğru çarpım (değişmedi)", () => {
    const full = [P(10000, "2026-01-01", "2027-12-31")];
    expect(total(full, { start: "2026-10-08", end: "2026-10-09" }).total).toBe(
      10000
    );
    expect(total(full, { start: "2026-10-01", end: "2026-10-31" }).total).toBe(
      300000
    );
  });
});

/* ===============================================================
   B) EKSİK KAPSAMA — GEÇERLİ FİYAT ÜRETİLMEMELİ
   =============================================================== */
describe("B) eksik kapsama — hesap GEÇERSİZ", () => {
  it("2) 6/7 gecede fiyat var (12 Ekim boş) → GEÇERSİZ (eskiden 60.000)", () => {
    const r = total([
      P(10000, "2026-10-01", "2026-10-11"),
      P(10000, "2026-10-13", "2026-10-31"),
    ]);
    expect(r.priceAvailable).toBe(false);
    expect(r.uncoveredNights).toBe(1);
    expect(r.stay).toBe(0);
    expect(r.total).toBe(0);
  });

  it("3) 1/7 gecede fiyat var → GEÇERSİZ (eskiden 10.000)", () => {
    const r = total([P(10000, "2026-10-08", "2026-10-08")]);
    expect(r.priceAvailable).toBe(false);
    expect(r.uncoveredNights).toBe(6);
    expect(r.total).toBe(0);
  });

  it("4) 0/7 — satır var ama hiçbiri eşleşmiyor → GEÇERSİZ (eskiden tek gece fiyatı)", () => {
    const r = total([P(10000, "2026-12-01", "2026-12-31")]);
    expect(r.priceAvailable).toBe(false);
    expect(r.uncoveredNights).toBe(7);
    expect(r.stay).toBe(0);
    expect(r.total).toBe(0);
  });

  it("5) prices = [] → GEÇERSİZ", () => {
    const r = total([]);
    expect(r.priceAvailable).toBe(false);
    expect(r.uncoveredNights).toBe(7);
    expect(r.total).toBe(0);
  });

  it("5b) sezonlar arası 1 günlük boşluk → GEÇERSİZ (eskiden 90.000)", () => {
    const r = total([
      P(10000, "2026-10-01", "2026-10-10"),
      P(20000, "2026-10-12", "2026-10-20"),
    ]);
    expect(r.priceAvailable).toBe(false);
    expect(r.uncoveredNights).toBe(1); // 11 Ekim
    expect(r.total).toBe(0);
  });

  it("5c) eksik kapsama + temizlik ücreti → temizlik de 0 (fail-closed)", () => {
    /* Eskiden total = 0 + 1500 = 1500 > 0 olduğu için kart/özet bunu
       GEÇERLİ bir fiyat sanıp gösteriyordu. */
    const r = total([P(10000, "2026-12-01", "2026-12-31")], {
      cleaning_fee: 1500,
    });
    expect(r.priceAvailable).toBe(false);
    expect(r.cleaning).toBe(0);
    expect(r.total).toBe(0);
  });

  it("5d) eksik kapsama + indirim → yine GEÇERSİZ", () => {
    const d: DiscountRange[] = [
      {
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        discount_type: "percent",
        discount_value: 20,
        currency: null,
      },
    ];
    const r = total(
      [P(10000, "2026-10-01", "2026-10-11"), P(10000, "2026-10-13", "2026-10-31")],
      { discounts: d }
    );
    expect(r.priceAvailable).toBe(false);
    expect(r.total).toBe(0);
  });

  it("5e) eksik kapsama + EUR → yine GEÇERSİZ", () => {
    const r = total([P(200, "2026-12-01", "2026-12-31", "EUR")]);
    expect(r.priceAvailable).toBe(false);
    expect(r.total).toBe(0);
  });

  it("5f) `calculateStayTotal` eksik gece sayısını raporlar", () => {
    const st = calculateStayTotal(
      START,
      END,
      [P(10000, "2026-10-01", "2026-10-11"), P(10000, "2026-10-13", "2026-10-31")],
      "TRY",
      RATES
    );
    expect(st.uncoveredNights).toBe(1);
    /* Ham stay HÂLÂ hesaplanır (motorun iç değeri); geçersiz sayma
       kararı calculateGrandTotal katmanında verilir. */
    expect(st.stay).toBe(60000);
  });
});

/* ===============================================================
   C) UÇ DURUMLAR — eski fallback artık fiyat UYDURMUYOR
   =============================================================== */
describe("C) uç durumlar", () => {
  const full = [P(10000, "2026-01-01", "2027-12-31")];

  it("10) aynı gün giriş/çıkış (0 gece) → 0 (eskiden 10.000 uyduruluyordu)", () => {
    const r = total(full, { start: "2026-10-08", end: "2026-10-08" });
    expect(r.nights).toBe(0);
    expect(r.total).toBe(0);
  });

  it("11) bozuk tarih → fiyat UYDURULMAZ (eskiden 10.000)", () => {
    const r = total(full, { start: "abc", end: END });
    expect(r.total).toBe(0);
  });

  it("12) tarih boş → eski davranış aynen (hepsi 0, geçerli)", () => {
    const r = total(full, { start: "", end: "" });
    expect(r.nights).toBe(0);
    expect(r.total).toBe(0);
    expect(r.priceAvailable).toBe(true);
    expect(r.uncoveredNights).toBe(0);
  });
});

/* ===============================================================
   D) SERVER-SIDE DOĞRULAMA — eksik fiyatı KABUL ETMEMELİ
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

describe("D) server-side price verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findVillaCleaningConfig.mockResolvedValue({
      data: {
        cleaning_fee: 0,
        cleaning_currency: "TRY",
        cleaning_limit: 0,
        custom_prepayment_rate: null,
        pool_heating_fee: 0,
        pool_heating_currency: "TRY",
        pool_heating_months: null,
      },
      error: null,
    });
    getExchangeRatesMap.mockResolvedValue({ rates: RATES, updatedAt: null });
    getPublicSettings.mockResolvedValue({ prepayment_rate: 20 } as never);
    getVillaDiscounts.mockResolvedValue([]);
  });

  const payload = {
    villa_id: "villa-1",
    start_date: START,
    end_date: END,
  } as unknown as ReservationCreateInput;

  it("13) eksik gece → priceUnavailable, authoritative YOK (fail-open DEĞİL)", async () => {
    getVillaPrices.mockResolvedValue([
      P(10000, "2026-10-01", "2026-10-11"),
      P(10000, "2026-10-13", "2026-10-31"),
    ]);
    const v = await verifyPublicReservationPrice(payload);
    expect(v.priceUnavailable).toBe(true);
    expect(v.authoritative).toBeNull();
    expect(v.poolHeating).toBeNull();
  });

  it("14) hiç fiyat yok → priceUnavailable", async () => {
    getVillaPrices.mockResolvedValue([]);
    const v = await verifyPublicReservationPrice(payload);
    expect(v.priceUnavailable).toBe(true);
    expect(v.authoritative).toBeNull();
  });

  it("15) tam kapsama → priceUnavailable FALSE, authoritative DOLU (değişmedi)", async () => {
    getVillaPrices.mockResolvedValue([P(10000, "2026-10-01", "2026-10-31")]);
    const v = await verifyPublicReservationPrice(payload);
    expect(v.priceUnavailable).toBe(false);
    expect(v.authoritative).not.toBeNull();
    expect(v.authoritative?.total_price_try).toBe(70000);
  });

  it("16) recompute FAIL → mevcut fail-open AYNEN korunur (priceUnavailable false)", async () => {
    getVillaPrices.mockRejectedValue(new Error("db down"));
    const v = await verifyPublicReservationPrice(payload);
    expect(v.priceUnavailable).toBe(false);
    expect(v.authoritative).toBeNull();
  });
});
