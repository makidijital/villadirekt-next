import type {
  ReservationCreateData,
  SelectedVillaCreate,
  PriceDetailSnapshot,
} from "@/app/(admin)/maki-admin/reservations/ekle/_types/reservation-create-data";

/* ===============================================================
   🛡️ RESERVATION CREATE HELPER TEST FIXTURES (FAZ 5)
   ===============================================================
   Pure helper'lar için deterministic minimum fixture'lar.
   Page state'inin gerçekten okunan alanları sağlanır; gereksiz
   alanlar default factory'den miras alınır.
=============================================================== */

/* Initial factory aynısı — tek noktada source-of-truth.
   Test'lerde override için spread pattern: `{...base, foo: bar}` */
export const baseCreateData: ReservationCreateData = {
  name: "Ahmet Yılmaz",
  phone: "+905551112233",
  /* 🛡️ Migration 094 — admin akışında OPSİYONEL; fixture boş bırakır. */
  phone2: "",
  email: "ahmet@example.com",
  identity_number: "12345678901",
  city: "Antalya",
  country: "TR",
  address: "Test mah. 1 sok.",
  villa_id: "villa-1",
  guests: 4,
  note: "",
  status: "pending",
  total_price: 0,
  total_price_try: 0,
  original_price: 0,
  original_currency: "TRY",
  original_cleaning_fee: 0,
  original_cleaning_currency: "TRY",
  cleaning_fee_try: 0,
  exchange_rate: 1,
  /* 🔥 HAVUZ ISITMA — uçtan uca tamamlama turu. initialReservationCreateData()
     ile AYNI default'lar (false/0/"TRY"/0) — ReservationCreateData artık
     bu 4 alanı required olarak taşıyor. */
  pool_heating_selected: false,
  original_pool_heating_total: 0,
  original_pool_heating_currency: "TRY",
  pool_heating_total_try: 0,
  custom_price: false,
  custom_price_note: "",
  payment_preference: "prepayment",
  payment_method_id: "pm-1",
};

export const villaWithCleaning: SelectedVillaCreate = {
  id: "villa-1",
  cleaning_fee: 1500,
  cleaning_currency: "TRY",
  cleaning_limit: 7,
  custom_prepayment_rate: null,
  deposit: 3000,
};

export const villaForeignCleaning: SelectedVillaCreate = {
  id: "villa-2",
  cleaning_fee: 50,
  cleaning_currency: "EUR",
  cleaning_limit: 0,
  custom_prepayment_rate: null,
  deposit: 5000,
};

/* 🔥 HAVUZ ISITMA — gecelik ücretli villa (worked example: 5000 TRY/gece
   × ... ama testlerde priceDetail.poolHeating doğrudan sabit verilir,
   calculateGrandTotal burada ÇALIŞTIRILMAZ — pure payload builder testi). */
export const villaWithPoolHeating: SelectedVillaCreate = {
  id: "villa-3",
  cleaning_fee: 3500,
  cleaning_currency: "TRY",
  cleaning_limit: 7,
  custom_prepayment_rate: null,
  deposit: 4000,
  pool_heating_fee: 5000,
  pool_heating_currency: "TRY",
};

/* Havuz ısıtma ücreti OLMAYAN villa — NULL/0 güvenli davranış testleri için. */
export const villaNoPoolHeating: SelectedVillaCreate = {
  id: "villa-4",
  cleaning_fee: 1500,
  cleaning_currency: "TRY",
  cleaning_limit: 7,
  custom_prepayment_rate: null,
  deposit: 3000,
  pool_heating_fee: null,
  pool_heating_currency: null,
};

/* Pure priceDetail fixture'ları — calculateGrandTotal benzeri çıktı. */
export const tryPriceDetail: PriceDetailSnapshot = {
  nights: 7,
  stay: 35000,
  cleaning: 1500,
  total: 36500,
  original_stay: null,
  original_cleaning: null,
  original_currency: "TRY",
  original_cleaning_currency: "TRY",
  currency: "TRY",
};

export const foreignPriceDetail: PriceDetailSnapshot = {
  nights: 7,
  stay: 70000,
  cleaning: 2500,
  total: 72500,
  original_stay: 700,
  original_cleaning: 25,
  original_currency: "EUR",
  original_cleaning_currency: "EUR",
  currency: "TRY",
};

/* 🔥 HAVUZ ISITMA — worked example (Section 2): Konaklama 20.000,
   Temizlik 3.500, Havuz Isıtma 5.000, Toplam 28.500. */
export const poolHeatingPriceDetail: PriceDetailSnapshot = {
  nights: 5,
  stay: 20000,
  cleaning: 3500,
  poolHeating: 5000,
  total: 28500,
  original_stay: null,
  original_cleaning: null,
  original_pool_heating: null,
  original_currency: "TRY",
  original_cleaning_currency: "TRY",
  original_pool_heating_currency: "TRY",
  currency: "TRY",
};

/* Live exchange rates fixture — page.tsx /api/exchange-rates'ten
   gelen Record<string, number>. */
export const ratesFixture: Record<string, number> = {
  TRY: 1,
  USD: 35,
  EUR: 40,
  GBP: 45,
};
