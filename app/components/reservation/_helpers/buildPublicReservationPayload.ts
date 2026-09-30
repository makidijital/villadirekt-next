import type { ReservationCreateInput } from "@/app/services/reservation/types";

import type { PublicReservationFormData } from "../_types/reservation-form-data";
/* 🛡️ E.164 normalize — ülke kodu kaybolmadan saklanır. */
import { normalizePhone } from "@/lib/phone.helper";

/* ===============================================================
   🛡️ FAZ 2 — buildPublicReservationPayload (PURE)
   ===============================================================
   Eski `ReservationForm.tsx > handleSubmit` içinde inline createReservation
   payload object'in BYTE-IDENTICAL kopyası (L298-378).

   ⚠️ KESIN KURAL — Alan sırası + coercion + ternary'ler AYNEN:
     - villa_id, start_date, end_date
     - total_price = snapshotTotalTRY (snapshot TRY)
     - original_price / original_currency foreign ternary
     - original_cleaning_fee / original_cleaning_currency foreign ternary
     - exchange_rate = hasForeignCurrency ? exchangeRate : 1
     - total_price_try = snapshotTotalTRY (aynı snapshot)
     - cleaning_fee_try = snapshotCleaningTRY
     - name/phone/email .trim()
     - identity_number = identity.trim()
     - country/city/address || null
     - guests = Number(guests) || 1
     - guest_names: raw array (NO trim/filter — admin'den farklı)
     - note || null
     - payment_method_id direct
     - prepayment_amount / remaining_payment snapshot (TRY)
     - paid_amount = 0 hardcoded
     - payment_preference direct
     - damage_deposit = Number(villa?.deposit) || 0

   ⚠️ KESIN FARK admin/buildCreateNormalPayload ile:
     - Public: snapshot-based (display currency'den bağımsız;
       calculateGrandTotal currency="TRY" ile yeniden çağrılır)
     - Admin: data state-based (admin TRY giriyor; data.total_price_try'ı
       direkt okur)
     - Public: prepayment = calculatePrepayment(snapshot, rate)
              (preference-agnostic)
     - Admin: getPaymentDisplayValues helper kullanır (preference-aware)
     Public davranışı BYTE-IDENTICAL korunur; preference-aware refactor
     YAPMA — bu davranış değişimi olur.

   ⚠️ KESIN FARK admin/buildCreateNormalPayload ile (guest_names):
     - Public: raw array (`guestNames` direkt)
     - Admin: `.map(s => s.trim()).filter(s => s.length > 0)`
     Public davranışı AYNEN; trim/filter EKLENMEZ.

   PURE: input alır, ReservationCreateInput döner. Side-effect YOK.
=============================================================== */

/** Snapshot result shape (calculateGrandTotal'ın currency="TRY" ile
 *  döndüğü subset). Sadece payload'ın okuduğu alanlar. */
export type PublicReservationSnapshot = {
  total: number;
  cleaning: number;
  original_currency?: string | null;
  original_cleaning_currency?: string | null;
  original_stay?: number | null;
  original_cleaning?: number | null;
  // 🔥 HAVUZ ISITMA — 6. adım. calculateGrandTotal'ın TRY snapshot
  // çağrısının döndürdüğü ek alanlar (bkz. lib/price.engine.ts).
  poolHeating?: number;
  original_pool_heating?: number | null;
  original_pool_heating_currency?: string | null;
};

export type BuildPublicReservationPayloadInput = {
  villa: { id: string; deposit?: number | string | null };
  start: string;
  end: string;
  form: PublicReservationFormData;
  guestNames: string[];
  snapshot: PublicReservationSnapshot;
  snapshotTotalTRY: number;
  snapshotCleaningTRY: number;
  snapshotPrepayment: number;
  snapshotRemaining: number;
  exchangeRate: number;
  hasForeignCurrency: boolean;
  // 🔥 HAVUZ ISITMA — 6. adım. OPSİYONEL — geçilmezse eski davranış
  // (poolHeatingSelected=false, snapshotPoolHeatingTRY=undefined→0)
  // BYTE-IDENTICAL kalır; mevcut test dosyası (buildPublicReservationPayload.test.ts)
  // bu iki alanı hiç geçmeden aynı sonucu üretmeye devam eder.
  poolHeatingSelected?: boolean;
  snapshotPoolHeatingTRY?: number;
};

export function buildPublicReservationPayload(
  input: BuildPublicReservationPayloadInput
): ReservationCreateInput {
  const {
    villa,
    start,
    end,
    form,
    guestNames,
    snapshot,
    snapshotTotalTRY,
    snapshotCleaningTRY,
    snapshotPrepayment,
    snapshotRemaining,
    exchangeRate,
    hasForeignCurrency,
    poolHeatingSelected,
    snapshotPoolHeatingTRY,
  } = input;

  return {
    villa_id: villa.id,

    start_date: start,
    end_date: end,

    // 🔥 admin convention — total_price = TRY snapshot
    total_price: snapshotTotalTRY,

    // ORJİNAL KONAKLAMA (villanın gerçek currency'si)
    original_price:
      snapshot?.original_currency !== "TRY"
        ? snapshot?.original_stay || 0
        : 0,

    original_currency:
      snapshot?.original_currency !== "TRY"
        ? snapshot?.original_currency || "TRY"
        : "TRY",

    // ORJİNAL TEMİZLİK (villanın cleaning currency'si)
    original_cleaning_fee:
      snapshot?.original_cleaning_currency !== "TRY"
        ? snapshot?.original_cleaning || 0
        : 0,

    original_cleaning_currency:
      snapshot?.original_cleaning_currency !== "TRY"
        ? snapshot?.original_cleaning_currency || "TRY"
        : "TRY",

    // 🔥 SABİTLENEN KUR — sadece dövizli villalarda anlamlı,
    // display currency'den bağımsız.
    exchange_rate: hasForeignCurrency ? exchangeRate : 1,

    // 🔥 TRY karşılığı — snapshot
    total_price_try: snapshotTotalTRY,

    cleaning_fee_try: snapshotCleaningTRY,

    // 🔥 HAVUZ ISITMA — 6. adım. Cleaning fee'nin foreign-currency
    // ternary deseni BİREBİR: TRY ise 0/"TRY", döviz ise gerçek villa
    // değeri. Server (route.ts → price-verify) bu client değerini
    // GÜVENMEZ, kendi hesapladığı authoritative snapshot ile override eder;
    // burada yine de doğru (client-side) değer üretilir — normal/honest
    // akışta server'ın üreteceğiyle eşleşir.
    pool_heating_selected: !!poolHeatingSelected,

    original_pool_heating_total:
      snapshot?.original_pool_heating_currency !== "TRY"
        ? snapshot?.original_pool_heating || 0
        : 0,

    original_pool_heating_currency:
      snapshot?.original_pool_heating_currency !== "TRY"
        ? snapshot?.original_pool_heating_currency || "TRY"
        : "TRY",

    pool_heating_total_try: snapshotPoolHeatingTRY,

    // USER
    name: form.name.trim(),
    phone: normalizePhone(form.phone),
    /* 🛡️ İkinci telefon — E.164 normalize; ülke kodu korunur. */
    phone2: normalizePhone(form.phone2),
    email: form.email.trim(),

    identity_number: form.identity.trim(),

    country: form.country || null,

    city: form.city || null,

    address: form.address || null,

    guests: Number(form.guests) || 1,

    guest_names: guestNames,

    note: form.note || null,

    /* payment_method_id zorunlu — validate edildi; defensive
       fallback için non-null assertion YOK, type-level loose. */
    payment_method_id: form.payment_method_id,

    // 🔥 FINANCIAL SNAPSHOT — TRY only, display'den bağımsız
    prepayment_amount: snapshotPrepayment,
    remaining_payment: snapshotRemaining,
    paid_amount: 0,

    // 🔥 PAYMENT PREFERENCE — kullanıcı tercihi
    payment_preference: form.payment_preference,

    // 🔥 DAMAGE DEPOSIT — villa.deposit snapshot
    // (informational; total/prepayment/remaining'e dahil değil)
    damage_deposit: Number(villa?.deposit) || 0,
  };
}
