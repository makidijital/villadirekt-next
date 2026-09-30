/* ===============================================================
   🛡️ RESERVATION HELPER TEST FIXTURES (Phase 1)
   ===============================================================
   Deterministic minimum fixture'lar. "İdeal davranış" değil,
   helper'ların `data` parametresinde gerçekten okuduğu alanları
   sağlayan en küçük şekiller.

   Helper'lar `ReservationDetailData` parametresi alıyor (DB row +
   2 embed). Helper'lar bu shape'in çok küçük bir alt kümesini
   okuyor; test fixture'ı da O minimum kümeyi içeriyor — gereksiz
   alanlar `as ReservationDetailData` cast'i ile tip eşlenmiş.
=============================================================== */

import type { ReservationDetailData } from "@/app/(admin)/maki-admin/reservations/[id]/_types/reservation-form-data";

type Partial = Pick<
  ReservationDetailData,
  | "id"
  | "villa_id"
  | "name"
  | "email"
  | "phone"
  | "phone2"
  | "start_date"
  | "end_date"
  | "guests"
  | "status"
  | "total_price"
  | "total_price_try"
  | "original_price"
  | "original_currency"
  | "original_cleaning_fee"
  | "original_cleaning_currency"
  | "cleaning_fee_try"
  | "exchange_rate"
  | "paid_amount"
  | "prepayment_amount"
  | "remaining_payment"
  | "payment_preference"
  | "payment_method_id"
  | "custom_price"
  | "custom_price_note"
  | "payment_link"
  | "note"
  | "identity_number"
  | "country"
  | "city"
  | "address"
  // 🔥 HAVUZ ISITMA — 8. adım. buildNormalPayload/buildCustomPricePayload
  // pool heating regression testleri bu 4 alanı okuyor.
  | "pool_heating_selected"
  | "original_pool_heating_total"
  | "original_pool_heating_currency"
  | "pool_heating_total_try"
>;

/** Tipik prepayment rezervasyon (foreign currency yok). */
export const baseReservation: Partial = {
  id: "res-1",
  villa_id: "villa-1",
  name: "Ahmet Yılmaz",
  email: "ahmet@example.com",
  phone: "+905551112233",
  /* 🛡️ Migration 094 — ikinci telefon (farklı ülke). */
  phone2: "+4915112345678",
  start_date: "2026-06-01",
  end_date: "2026-06-08",
  guests: 4,
  status: "pending",
  total_price: 50000,
  total_price_try: 50000,
  original_price: 0,
  original_currency: "TRY",
  original_cleaning_fee: 0,
  original_cleaning_currency: "TRY",
  cleaning_fee_try: 2500,
  exchange_rate: 1,
  paid_amount: 0,
  prepayment_amount: 10000,
  remaining_payment: 40000,
  payment_preference: "prepayment",
  payment_method_id: "pm-1",
  custom_price: false,
  custom_price_note: null,
  payment_link: null,
  note: null,
  identity_number: "12345678901",
  country: "Türkiye",
  city: "Antalya",
  address: null,
  // 🔥 HAVUZ ISITMA — 8. adım. Default: eski (havuz ısıtmasız) rezervasyon
  // (regresyon fixture'ı — baseReservation kullanan mevcut tüm testler
  // bu değerlerle DEĞİŞMEDEN çalışmaya devam eder).
  pool_heating_selected: false,
  original_pool_heating_total: 0,
  original_pool_heating_currency: "TRY",
  pool_heating_total_try: 0,
};

/** Multi-currency rezervasyon (foreign stay + foreign cleaning). */
export const foreignReservation: Partial = {
  ...baseReservation,
  id: "res-2",
  villa_id: "villa-2",
  total_price: 100000,
  total_price_try: 100000,
  original_price: 1000,
  original_currency: "EUR",
  original_cleaning_fee: 50,
  original_cleaning_currency: "EUR",
  cleaning_fee_try: 5000,
  exchange_rate: 100,
};

/** Custom price rezervasyon. */
export const customPriceReservation: Partial = {
  ...baseReservation,
  id: "res-3",
  villa_id: "villa-3",
  total_price: 75000,
  total_price_try: 75000,
  paid_amount: 25000,
  prepayment_amount: 15000,
  remaining_payment: 60000,
  custom_price: true,
  custom_price_note: "Special VIP rate",
};

/** Cast helper — ReservationDetailData tam union'ını full-fixture
 *  yazmadan tüm helper'ları test edebilmek için tipsel köprü. */
export function asReservation(p: Partial): ReservationDetailData {
  return p as unknown as ReservationDetailData;
}
