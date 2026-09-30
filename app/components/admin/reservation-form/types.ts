/* ===============================================================
   🔥 RESERVATION FORM SHARED TYPES
   ===============================================================
   Bu types dosyası reservation create/edit wizard'ı için
   presentational componentlerin prop'larını typeladığı yer.

   Page tarafında state hala useState<any>(...) — değişmedi.
   Buradaki tipler "page'den component'e geçen prop shape"i ifade
   eder; component içinde tip güvenliği sağlar, ama page'in
   mevcut state contract'ı bozulmaz.

   Yeni `any` introduced YOK — Record<string, unknown> ile bilinmeyen
   alan tolerated. Page'deki useState<any> aynen korunur.
   =============================================================== */

import type { Dispatch, SetStateAction } from "react";

import type { PaymentPreference } from "@/lib/payment.helper";

/* ---------------- RESERVATION FORM SHAPE ---------------- */
export type ReservationFormShape = {
  name?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  identity_number?: string;

  city?: string;
  country?: string;
  address?: string;

  villa_id?: string;
  guests?: number;

  start_date?: string;
  end_date?: string;

  // Multi currency / pricing snapshot
  total_price?: number;
  total_price_try?: number;
  original_price?: number;
  original_currency?: string;
  original_cleaning_fee?: number;
  original_cleaning_currency?: string;
  cleaning_fee_try?: number;
  exchange_rate?: number;

  // Havuz ısıtma
  pool_heating_selected?: boolean;
  original_pool_heating_total?: number;
  original_pool_heating_currency?: string;
  pool_heating_total_try?: number;

  // Custom price (admin override)
  custom_price?: boolean;
  custom_price_note?: string;

  // Financial snapshot
  prepayment_amount?: number;
  remaining_payment?: number;
  paid_amount?: number;

  // Payment
  payment_preference?: PaymentPreference;
  payment_method_id?: string | null;
  payment_link?: string | null;
  payment_link_status?: string;
  payment_link_sent_at?: string | null;

  // Damage deposit (informational snapshot)
  damage_deposit?: number;

  // Status
  status?: string;

  // Note
  note?: string;

  // Reservation no (server-generated; read-only display)
  reservation_no?: string;
} & Record<string, unknown>;

export type ReservationFormSetter = Dispatch<
  SetStateAction<ReservationFormShape>
>;

/* ---------------- LOOKUP / OPTION SHAPES ---------------- */
export type VillaOption = {
  id: string;
  title: string;
} & Record<string, unknown>;

export type PaymentMethodOption = {
  id: string;
  name: string;
  type?: string | null;
} & Record<string, unknown>;

/* ---------------- WIZARD STEP ---------------- */
export type ReservationWizardStep = {
  id: number;
  label: string;
};

/* ---------------- PRICE DETAIL ---------------- */
export type ReservationPriceDetail = {
  nights?: number;
  stay?: number;
  cleaning?: number;
  poolHeating?: number;
  total?: number;
  original_stay?: number;
  original_cleaning?: number;
  original_pool_heating?: number;
  original_currency?: string;
  original_cleaning_currency?: string;
  original_pool_heating_currency?: string;
  currency?: string;
} & Record<string, unknown>;

/* ---------------- SELECTED VILLA META ---------------- */
export type SelectedVillaMeta = {
  cleaning_fee?: number | null;
  cleaning_currency?: string | null;
  cleaning_limit?: number | null;
  custom_prepayment_rate?: number | string | null;
  deposit?: number | null;
  pool_heating_fee?: number | null;
  pool_heating_currency?: string | null;
  /* 🛡️ Migration 076 — sezonluk ay kısıtı. NULL = kısıtlama yok. */
  pool_heating_months?: number[] | null;
} & Record<string, unknown>;

/* ---------------- PAYMENT DISPLAY (helper output mirror) ---------------- */
export type ReservationPaymentDisplay = {
  paymentPreference: PaymentPreference;
  isFullPayment: boolean;
  totalTRY: number;
  prepaymentTRY: number;
  paidTRY: number;
  payNow: number;
  remainingOnArrival: number;
  remainingFromPaid: number;
};

/* ---------------- VALIDATION ERROR MAP ---------------- */
export type ReservationFormErrors = Record<string, string>;
