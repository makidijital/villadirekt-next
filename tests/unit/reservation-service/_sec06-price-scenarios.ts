/* ===============================================================
   🛡️ SEC-06 — FİYAT PARİTE SENARYOLARI (test verisi, test DEĞİL)
   ===============================================================
   `sec06-price-parity.test.ts` bu senaryoları server recompute'tan
   (verifyPublicReservationPrice) geçirir ve sonucu SEC-06 düzeltmesi
   ÖNCESİ kodla üretilmiş `__fixtures__/sec06-price-baseline.json`
   ile BİREBİR karşılaştırır → "önceki fiyat = sonraki fiyat" kanıtı.

   Kapsam: TRY/EUR/USD/GBP villa, sezon geçişi, karışık para birimi,
   temizlik (limit altı/üstü, dövizli), percent/fixed indirim (kısmi,
   çapraz kur, %100, normalden yüksek özel fiyat), havuz ısıtma
   (sezon içi/dışı, dövizli), ön ödeme oranı önceliği (villa override
   0/30/"" → settings → 20), çakışan fiyat dönemleri, eksik gece.
   =============================================================== */

export type Sec06PriceRow = {
  start_date: string;
  end_date: string;
  price: number;
  currency: string;
};

export type Sec06DiscountRow = {
  start_date: string;
  end_date: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  currency: string | null;
};

export type Sec06Scenario = {
  name: string;
  start: string;
  end: string;
  pool?: boolean;
  prices: Sec06PriceRow[];
  discounts?: Sec06DiscountRow[];
  villa?: Record<string, unknown>;
  settings?: Record<string, unknown>;
};

export const SEC06_RATES = { USD: 32.5, EUR: 35.1, GBP: 41.2 };

export const SEC06_BASE_VILLA = {
  cleaning_fee: 0,
  cleaning_currency: "TRY",
  cleaning_limit: 0,
  custom_prepayment_rate: null,
  pool_heating_fee: 0,
  pool_heating_currency: "TRY",
  pool_heating_months: null,
};

const TRY_OCT: Sec06PriceRow[] = [
  { start_date: "2026-10-01", end_date: "2026-10-31", price: 10000, currency: "TRY" },
];
const EUR_JUN: Sec06PriceRow[] = [
  { start_date: "2027-06-01", end_date: "2027-06-30", price: 200, currency: "EUR" },
];

export const SEC06_SCENARIOS: Sec06Scenario[] = [
  { name: "01 TRY 4 gece", start: "2026-10-01", end: "2026-10-05", prices: TRY_OCT },
  { name: "02 TRY 1 gece", start: "2026-10-10", end: "2026-10-11", prices: TRY_OCT },
  {
    name: "03 TRY 30 gece iki sezon",
    start: "2026-10-15",
    end: "2026-11-14",
    prices: [
      ...TRY_OCT,
      { start_date: "2026-11-01", end_date: "2026-11-30", price: 12000, currency: "TRY" },
    ],
  },
  {
    name: "04 sezon geçişi EUR→TRY karışık para birimi",
    start: "2027-06-28",
    end: "2027-07-03",
    prices: [
      ...EUR_JUN,
      { start_date: "2027-07-01", end_date: "2027-07-31", price: 9000, currency: "TRY" },
    ],
  },
  { name: "05 EUR villa 4 gece", start: "2027-06-02", end: "2027-06-06", prices: EUR_JUN },
  {
    name: "06 USD villa 3 gece",
    start: "2027-06-02",
    end: "2027-06-05",
    prices: [{ start_date: "2027-06-01", end_date: "2027-06-30", price: 333.33, currency: "USD" }],
  },
  {
    name: "07 GBP villa 2 gece",
    start: "2027-06-02",
    end: "2027-06-04",
    prices: [{ start_date: "2027-06-01", end_date: "2027-06-30", price: 180, currency: "GBP" }],
  },
  {
    name: "08 temizlik TRY limit altı (4<7) → alınır",
    start: "2026-10-01",
    end: "2026-10-05",
    prices: TRY_OCT,
    villa: { cleaning_fee: 1500, cleaning_currency: "TRY", cleaning_limit: 7 },
  },
  {
    name: "09 temizlik TRY limit eşit (7) → alınmaz",
    start: "2026-10-01",
    end: "2026-10-08",
    prices: TRY_OCT,
    villa: { cleaning_fee: 1500, cleaning_currency: "TRY", cleaning_limit: 7 },
  },
  {
    name: "10 temizlik GBP limit altı, EUR villa",
    start: "2027-06-02",
    end: "2027-06-05",
    prices: EUR_JUN,
    villa: { cleaning_fee: 100, cleaning_currency: "GBP", cleaning_limit: 5 },
  },
  {
    name: "11 temizlik limit 0 → her zaman",
    start: "2026-10-01",
    end: "2026-10-15",
    prices: TRY_OCT,
    villa: { cleaning_fee: 2000, cleaning_currency: "TRY", cleaning_limit: 0 },
  },
  {
    name: "12 temizlik EUR, TRY villa",
    start: "2026-10-01",
    end: "2026-10-03",
    prices: TRY_OCT,
    villa: { cleaning_fee: 40, cleaning_currency: "EUR", cleaning_limit: 3 },
  },
  {
    name: "13 percent %20 tüm geceler",
    start: "2026-10-01",
    end: "2026-10-05",
    prices: TRY_OCT,
    discounts: [
      { start_date: "2026-10-01", end_date: "2026-10-10", discount_type: "percent", discount_value: 20, currency: null },
    ],
  },
  {
    name: "14 percent %10 kısmi çakışma (EUR)",
    start: "2027-06-08",
    end: "2027-06-14",
    prices: EUR_JUN,
    discounts: [
      { start_date: "2027-06-10", end_date: "2027-06-12", discount_type: "percent", discount_value: 10, currency: null },
    ],
  },
  {
    name: "15 fixed TRY özel fiyat, TRY villa",
    start: "2026-10-01",
    end: "2026-10-05",
    prices: TRY_OCT,
    discounts: [
      { start_date: "2026-10-01", end_date: "2026-10-31", discount_type: "fixed", discount_value: 7500, currency: "TRY" },
    ],
  },
  {
    name: "16 fixed EUR özel fiyat, EUR villa, kısmi",
    start: "2027-07-08",
    end: "2027-07-12",
    prices: [{ start_date: "2027-07-01", end_date: "2027-07-31", price: 300, currency: "EUR" }],
    discounts: [
      { start_date: "2027-07-10", end_date: "2027-07-11", discount_type: "fixed", discount_value: 150, currency: "EUR" },
    ],
  },
  {
    name: "17 fixed TRY özel fiyat, EUR villa (çapraz kur)",
    start: "2027-06-02",
    end: "2027-06-05",
    prices: EUR_JUN,
    discounts: [
      { start_date: "2027-06-01", end_date: "2027-06-30", discount_type: "fixed", discount_value: 5000, currency: "TRY" },
    ],
  },
  {
    name: "18 fixed normalden YÜKSEK özel fiyat",
    start: "2026-10-01",
    end: "2026-10-04",
    prices: TRY_OCT,
    discounts: [
      { start_date: "2026-10-01", end_date: "2026-10-31", discount_type: "fixed", discount_value: 15000, currency: "TRY" },
    ],
  },
  {
    name: "19 percent %100 → konaklama 0 (meşru)",
    start: "2026-10-01",
    end: "2026-10-03",
    prices: TRY_OCT,
    villa: { cleaning_fee: 1000, cleaning_currency: "TRY", cleaning_limit: 0 },
    discounts: [
      { start_date: "2026-10-01", end_date: "2026-10-31", discount_type: "percent", discount_value: 100, currency: null },
    ],
  },
  {
    name: "20 fixed USD özel fiyat, EUR villa (çapraz döviz)",
    start: "2027-06-02",
    end: "2027-06-04",
    prices: EUR_JUN,
    discounts: [
      { start_date: "2027-06-01", end_date: "2027-06-30", discount_type: "fixed", discount_value: 250, currency: "USD" },
    ],
  },
  {
    name: "21 havuz TRY seçili, ay kısıtı yok",
    start: "2026-10-01",
    end: "2026-10-05",
    pool: true,
    prices: TRY_OCT,
    villa: { pool_heating_fee: 500, pool_heating_currency: "TRY", pool_heating_months: null },
  },
  {
    name: "22 havuz EUR seçili, sezon içi",
    start: "2027-06-02",
    end: "2027-06-06",
    pool: true,
    prices: EUR_JUN,
    villa: { pool_heating_fee: 50, pool_heating_currency: "EUR", pool_heating_months: [6, 7, 8] },
  },
  {
    name: "23 havuz seçili, sezon dışı → 0",
    start: "2026-10-01",
    end: "2026-10-05",
    pool: true,
    prices: TRY_OCT,
    villa: { pool_heating_fee: 500, pool_heating_currency: "TRY", pool_heating_months: [6, 7, 8] },
  },
  {
    name: "24 havuz seçilmedi, ücret tanımlı → 0",
    start: "2026-10-01",
    end: "2026-10-05",
    pool: false,
    prices: TRY_OCT,
    villa: { pool_heating_fee: 500, pool_heating_currency: "TRY", pool_heating_months: null },
  },
  {
    name: "25 kombine: EUR + temizlik GBP + %10 + havuz EUR",
    start: "2027-06-09",
    end: "2027-06-13",
    pool: true,
    prices: EUR_JUN,
    villa: {
      cleaning_fee: 100,
      cleaning_currency: "GBP",
      cleaning_limit: 5,
      pool_heating_fee: 50,
      pool_heating_currency: "EUR",
      pool_heating_months: [6, 7, 8],
    },
    discounts: [
      { start_date: "2027-06-10", end_date: "2027-06-12", discount_type: "percent", discount_value: 10, currency: null },
    ],
  },
  {
    name: "26 villa ön ödeme override 30",
    start: "2026-10-01",
    end: "2026-10-05",
    prices: TRY_OCT,
    villa: { custom_prepayment_rate: 30, cleaning_fee: 1500, cleaning_limit: 7 },
  },
  {
    name: "27 villa ön ödeme override 0",
    start: "2026-10-01",
    end: "2026-10-05",
    prices: TRY_OCT,
    villa: { custom_prepayment_rate: 0 },
  },
  {
    name: "28 villa override boş string → settings 25",
    start: "2026-10-01",
    end: "2026-10-05",
    prices: TRY_OCT,
    villa: { custom_prepayment_rate: "" },
    settings: { prepayment_rate: 25 },
  },
  {
    name: "29 settings 35, override yok",
    start: "2027-06-02",
    end: "2027-06-06",
    prices: EUR_JUN,
    settings: { prepayment_rate: 35 },
  },
  {
    name: "30 settings prepayment_rate null → 20",
    start: "2026-10-01",
    end: "2026-10-05",
    prices: TRY_OCT,
    settings: { prepayment_rate: null },
  },
  {
    name: "31 eksik gece → priceUnavailable",
    start: "2026-10-29",
    end: "2026-11-03",
    prices: TRY_OCT,
  },
  {
    name: "32 çakışan fiyat dönemleri (ilk eşleşen)",
    start: "2027-09-12",
    end: "2027-09-15",
    prices: [
      { start_date: "2027-08-11", end_date: "2027-09-30", price: 9000, currency: "TRY" },
      { start_date: "2027-09-10", end_date: "2027-09-15", price: 999, currency: "EUR" },
    ],
  },
  {
    name: "33 yuvarlama: küsuratlı EUR + override 33",
    start: "2027-06-02",
    end: "2027-06-05",
    prices: [{ start_date: "2027-06-01", end_date: "2027-06-30", price: 123.45, currency: "EUR" }],
    villa: { custom_prepayment_rate: 33, cleaning_fee: 77.7, cleaning_currency: "USD", cleaning_limit: 4 },
  },
  {
    name: "34 uzun konaklama 91 gece (3 sezon)",
    start: "2026-10-01",
    end: "2026-12-31",
    prices: [
      ...TRY_OCT,
      { start_date: "2026-11-01", end_date: "2026-11-30", price: 12000, currency: "TRY" },
      { start_date: "2026-12-01", end_date: "2026-12-31", price: 150, currency: "EUR" },
    ],
  },
];
