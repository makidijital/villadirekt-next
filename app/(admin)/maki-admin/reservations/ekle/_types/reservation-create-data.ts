import type { Dispatch, SetStateAction } from "react";

import type { PaymentPreference } from "@/lib/payment.helper";
import type {
  PriceDetailSnapshot,
  Currency,
} from "@/app/(admin)/maki-admin/reservations/[id]/_types/reservation-form-data";
import type {
  ReservationFormShape,
  ReservationFormSetter,
} from "@/app/components/admin/reservation-form/types";

/* ===============================================================
   🛡️ TYPE HARDENING — Reservation CREATE Page state shape
   ===============================================================
   FAZ 1 (ekle/page.tsx refactor) extraction'ı.

   [id]/_types/reservation-form-data.ts paralelinde; CREATE
   semantic'ine özel:
     - DB row YOK (henüz INSERT yapılmadı) → `ReservationRow & ...`
       wrapper kullanılmaz.
     - villa / payment_method embed YOK (sadece villa_id seçimi).
     - payment_link / payment_link_status / payment_link_sent_at
       YOK (create flow yalnız snapshot oluşturur; link akışı
       detail page'de yönetilir).
     - paid_amount YOK (create'te DB'ye yazılmaz; DB default 0).
     - id YOK.

   CHILD CONTRACT COMPATIBILITY:
     Wizard step component'ler (`PersonalStep`, `LocationStep`,
     `VillaSelectStep`, `GuestsStep`, `PriceStep`, `PaymentMethodStep`,
     `PaymentPreferenceStep`, `NoteStep`) `ReservationFormShape`
     prop'u alır. `ReservationFormShape` `& Record<string, unknown>`
     ile loose; tüm alanları opsiyonel.

     `ReservationCreateData` `ReservationFormShape` ile intersect
     edilir; required-at-create alanlar narrow ile sıkılaştırılır.
     Bu sayede:
       - Page level: typed strict state
       - Child level: structural subtype assignment compile-time
         başarılı (covariance)
       - setData prop'u: `ReservationFormSetter` ile cast edilir
         (single JSX site).

   KESIN SINIRLAR:
     ❌ Runtime davranış değişmez.
     ❌ Default değer / fallback / parse akışı dokunulmaz.
     ❌ Payload/validation/insert logic değişmez.
     ✅ Yalnız TypeScript compile-time güvenliği artar; silent
        string ↔ number / null ↔ undefined drift'i azaltır.
   =============================================================== */

/* ---------------- VILLA (lite — create context için) ----------------
   Villa seçildikten sonra cleaning + deposit + custom_prepayment_rate
   bilgileri async fetch ile alınır (price recalc + create payload).
   [id]/_types > SelectedVilla ile aynı shape; ek olarak `deposit`
   alanı create damage_deposit snapshot'ı için okunur.

   Child contract `SelectedVillaMeta` (reservation-form/types) ile
   uyumlu kalmak için `deposit: number | null` (string drift'ine izin
   verilmiyor — UI runtime'da Number() coerce yapıyor, DB kolonu
   numeric). */
export type SelectedVillaCreate = {
  id?: string;
  cleaning_fee?: number | null;
  cleaning_currency?: string | null;
  cleaning_limit?: number | null;
  custom_prepayment_rate?: number | string | null;
  /** villa.deposit — DB row'unda numeric; create payload'a
   *  damage_deposit snapshot olarak yazılır (informational).
   *  null/undefined → 0 fallback (mevcut davranış). */
  deposit?: number | null;
  /** 🔥 HAVUZ ISITMA — uçtan uca tamamlama turu. villaAdminRepository
   *  findContextById'nin (villa.repository.server.ts) `/api/admin/villas/[id]`
   *  GET response'unda zaten döndüğü alanlar (Step 8'de eklendi) — create
   *  flow'un bu API'yi zaten çağıran fetchPrices effect'i sayesinde ek bir
   *  server değişikliği gerekmedi. */
  pool_heating_fee?: number | null;
  pool_heating_currency?: string | null;
  /* 🛡️ Migration 076 — sezonluk ay kısıtı. AYNI kaynak (findContextById
   *  genişletildi) — ek server değişikliği gerekmedi. NULL = kısıtlama
   *  yok. */
  pool_heating_months?: number[] | null;
} | null;

/* ---------------- VILLA LIST ITEM ----------------
   `villa` tablosundan id+title seçimi; VillaSelectStep dropdown'u
   için minimum shape. Child `VillaOption` contract'ı (reservation-
   form/types) `title: string` istiyor → DB'de title NOT NULL
   kabul edilmiş (runtime varsayım); child contract ile aligned. */
export type VillaListItem = {
  id: string;
  title: string;
};

/* ---------------- PAYMENT METHOD ROW (admin select için) ----------------
   payment_methods tablosundan SELECT *. PaymentMethodStep dropdown'u
   için minimum shape — `id`, `name`, `type`, `is_active`. Child
   `PaymentMethodOption` contract'ı `name: string` istiyor; aligned. */
export type PaymentMethodListItem = {
  id: string;
  name: string;
  type: string | null;
  is_active?: boolean | null;
};

/* ---------------- RESERVATION CREATE DATA ----------------
   Wizard form state. handleCreate çağrıldığında bu shape'in
   alanları:
     - Validation: validateCreateForm() pure helper'ı (FAZ 3) okur.
     - Custom path: buildCreateCustomPricePayload (FAZ 3) okur.
     - Normal path: buildCreateNormalPayload (FAZ 3) okur.

   `ReservationFormShape & Record<string, unknown>` intersection'ı
   üzerinde required override:
     - Validation'da NOT-EMPTY beklenenler (name, phone, email,
       villa_id, country, city, guests, status, payment_preference,
       custom_price) initial value'ya sahip → opsiyonel değil.
     - Pricing alanları (total_price, total_price_try, original_*,
       cleaning_*, exchange_rate) initial value 0/"TRY" → sayısal/
       string default; opsiyonel değil.
     - Tarih (start_date / end_date) wizard sırasında Date object
       state ayrı tutulur; bu alanlar useEffect ile senkronize edilir.
       Initial state'te yok → `string | undefined` (ReservationFormShape
       içindeki tip aynen).
   =============================================================== */
export type ReservationCreateData = ReservationFormShape & {
  /* Kişi bilgileri — initial "" */
  name: string;
  phone: string;
  /** 🛡️ Migration 094 — ikinci telefon. Admin'de OPSİYONEL. */
  phone2: string;

  /* 🛡️ Migration 080 — İNDİRİM SNAPSHOT (public ile AYNI alanlar).
     `buildStayDiscountSnapshot` (lib/price.engine.ts) tarafından
     doldurulur; payload builder → `payload-create.ts` ile DB'ye yazılır.
     OPSİYONEL: indirim hesaplanmamış durumda (tarih/villa seçilmeden)
     alanlar undefined kalır → payload-create null/false'a düşürür. */
  discount_applied?: boolean;
  discount_type?: "percent" | "fixed" | null;
  discount_value?: number | null;
  discount_currency?: string | null;
  original_stay_total_try?: number | null;
  stay_discount_amount_try?: number | null;
  email: string;
  identity_number: string;

  /* Konum — initial "" */
  country: string;
  city: string;
  address: string;

  /* Villa — initial "" */
  villa_id: string;

  /* Misafir — initial 1 */
  guests: number;

  /* Not + status — initial "" / "pending" */
  note: string;
  /** Create page'de status her zaman "pending" — DB INSERT
   *  default'u da "pending". Strict literal: ileride status alanı
   *  create UI'a eklenirse type genişletilir. */
  status: "pending";

  /* PARA / MULTI CURRENCY — initial 0 / "TRY" / 1 */
  total_price: number;
  total_price_try: number;
  original_price: number;
  original_currency: Currency | string;
  original_cleaning_fee: number;
  original_cleaning_currency: Currency | string;
  cleaning_fee_try: number;
  exchange_rate: number;

  /* 🔥 HAVUZ ISITMA — uçtan uca tamamlama turu. `pool_heating_selected`
     admin'in kendi seçimidir (checkbox); diğer 3 alan cleaning_fee_try
     ile AYNI desende, price-calc effect'i tarafından türetilip yazılır. */
  pool_heating_selected: boolean;
  original_pool_heating_total: number;
  original_pool_heating_currency: Currency | string;
  pool_heating_total_try: number;

  /* CUSTOM PRICE — initial false / "" */
  custom_price: boolean;
  custom_price_note: string;

  /* PAYMENT PREFERENCE — initial "prepayment" */
  payment_preference: PaymentPreference;

  /* PAYMENT METHOD — initial null */
  payment_method_id: string | null;
};

/* ---------------- SETTER ALIAS ----------------
   React useState dispatch — page.tsx içinde typed.
   Child wizard step component'lere geçerken `ReservationFormSetter`
   ile cast edilir (variance gerekli; setter contravariant pozisyon).
   Cast tek JSX site'ta; semantic değişmez. */
export type ReservationCreateDataSetter = Dispatch<
  SetStateAction<ReservationCreateData>
>;

/* ---------------- INITIAL STATE FACTORY ----------------
   useState init için tek source-of-truth. Mevcut inline default
   object'in BYTE-IDENTICAL kopyası; her FAZ'da değişmemesi için
   helper'a alındı.

   ⚠️ KESIN KURAL: Initial value'lar mevcut runtime davranışla
   aynen aynı. Yeni alan eklenirse bu factory ve handler'lar
   senkron olmalı. */
export function initialReservationCreateData(): ReservationCreateData {
  return {
    name: "",
    phone: "",
    phone2: "",
    email: "",
    identity_number: "",
    city: "",
    country: "",
    address: "",
    villa_id: "",
    guests: 1,
    note: "",
    status: "pending",

    /* PARA / MULTI CURRENCY */
    total_price: 0,
    total_price_try: 0,

    original_price: 0,
    original_currency: "TRY",

    original_cleaning_fee: 0,
    original_cleaning_currency: "TRY",

    cleaning_fee_try: 0,
    exchange_rate: 1,

    /* HAVUZ ISITMA */
    pool_heating_selected: false,
    original_pool_heating_total: 0,
    original_pool_heating_currency: "TRY",
    pool_heating_total_try: 0,

    /* CUSTOM PRICE — admin override (manuel fiyat) */
    custom_price: false,
    custom_price_note: "",

    /* PAYMENT PREFERENCE — default ön ödeme */
    payment_preference: "prepayment",

    /* ÖDEME YÖNTEMİ — public form ile aynı convention */
    payment_method_id: null,
  };
}

/* ---------------- RE-EXPORTS ----------------
   `PriceDetailSnapshot`: [id] sayfasıyla AYNI shape. Single source-of-
   truth: [id]/_types/reservation-form-data.ts. Buradan re-export
   ediyoruz ki create page tek noktadan import alabilsin.

   `ReservationFormSetter` re-export: page.tsx JSX boundary'sinde
   `setData as ReservationFormSetter` cast'i için convenience. */
export type {
  PriceDetailSnapshot,
  Currency,
  ReservationFormSetter,
};
