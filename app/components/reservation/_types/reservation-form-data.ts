import type { Dispatch, SetStateAction } from "react";

import type { PaymentPreference } from "@/lib/payment.helper";
/* 🛡️ Uluslararası telefon — mevcut helper, yeni kütüphane YOK. */
import { DEFAULT_DIAL_CODE } from "@/lib/phone.helper";
/* 🛡️ MIGRATION 088 — ödeme yöntemi adının EN/DE haritası (additive). */
import type { TaxonomyNameByLocale } from "@/lib/i18n/taxonomy-name.helper";

/* ===============================================================
   🛡️ FAZ 1 — PUBLIC RESERVATION FORM TYPES (extracted)
   ===============================================================
   Eski `ReservationForm.tsx` içinde inline tanımlı state shape'leri
   typed extraction. Admin pattern (reservations/ekle/_types) referans
   alındı; ama PUBLIC FORM kendi shape'ine sahip:
     - guests: string (admin: number)
     - country/city zorunlu değil (admin'de zorunlu)
     - custom_price YOK (public custom price flow yok)
     - identity zorunlu (admin'de optional)

   ⚠️ KESIN SINIRLAR:
     - Runtime davranış değişmez.
     - Initial alan sırası BYTE-IDENTICAL.
     - Default değerler aynen.
     - Public booking submit flow'a hiç etki yok.
=============================================================== */

/* ---------------- PUBLIC RESERVATION FORM DATA ----------------
   Eski `useState({ ... })` inline initial object'in birebir typed
   karşılığı. Public submit flow'un OKUDUĞU form state'i.

   ⚠️ Field set + sıra eski inline ile aynen:
     name, email, phone, identity, country, city, address, note,
     guests, payment_method_id, payment_preference. */
export type PublicReservationFormData = {
  name: string;
  email: string;
  /** Telefon 1 — E.164 (ülke kodu + numara birleşik). */
  phone: string;
  /** 🛡️ Telefon 1 ülke kodu (UI seçici state'i, "+90"). */
  phone_dial: string;
  /** 🛡️ Telefon 1 ulusal numara (UI input state'i). */
  phone_national: string;
  /** 🛡️ Telefon 2 — E.164. YENİ public rezervasyonlarda ZORUNLU. */
  phone2: string;
  /** 🛡️ Telefon 2 ülke kodu — Telefon 1'den BAĞIMSIZ seçilebilir. */
  phone2_dial: string;
  phone2_national: string;
  identity: string;
  country: string;
  city: string;
  address: string;
  note: string;
  /** Admin form'da `number`; public form'da `string` (input type=number'dan).
   *  Eski inline kontrat aynen. */
  guests: string;
  payment_method_id: string | null;
  /** Default "prepayment" — eski inline değer. */
  payment_preference: PaymentPreference;
};

export type PublicReservationFormDataSetter = Dispatch<
  SetStateAction<PublicReservationFormData>
>;

/* ---------------- INITIAL STATE FACTORY ----------------
   useState init için tek source-of-truth. Eski inline initial
   object'in BYTE-IDENTICAL kopyası.

   ⚠️ KESIN KURAL: Alan SIRASI ve VALUE'lar eski inline ile aynen.
   Yeni alan ekleme YAPILMAZ; field değer değişimi YAPILMAZ. */
export function initialPublicReservationFormData(): PublicReservationFormData {
  return {
    name: "",
    email: "",
    phone: "",
    /* 🛡️ Varsayılan ülke kodu +90; kullanıcı her iki alan için de
       bağımsız değiştirebilir. */
    phone_dial: DEFAULT_DIAL_CODE,
    phone_national: "",
    phone2: "",
    phone2_dial: DEFAULT_DIAL_CODE,
    phone2_national: "",
    identity: "",
    country: "",
    city: "",
    address: "",
    note: "",
    guests: "",
    payment_method_id: null,
    // 🔥 PAYMENT PREFERENCE — default: ön ödeme
    payment_preference: "prepayment",
  };
}

/* ---------------- COMPANION STATE TYPES ----------------
   Eski `useState<any[]>` companion state'ler için narrow shape'ler.
   country-state-city kütüphanesi tipleri loose; UI'da yalnız
   isoCode + name + countryCode okuruz. */

/** Country-state-city Country tipi minimum projection.
 *  Library shape'i geniş; biz isoCode + name kullanıyoruz. */
export type CountryOption = {
  isoCode: string;
  name: string;
};

/** Country-state-city State tipi minimum projection. */
export type CityOption = {
  isoCode: string;
  name: string;
  countryCode: string;
};

/** payment_methods.id+name+type — public select için. */
export type PublicPaymentMethodOption = {
  id: string;
  /** 🛡️ CANONICAL TR ad — ÇEVİRİYLE EZİLMEZ. `type` gibi bu alan da
   *  iş mantığında okunabilir (`lib/payment-link.helper.ts`). */
  name: string;
  type?: string | null;
  /** 🛡️ MIGRATION 088 — ADDITIVE, opsiyonel. `/api/public/payment-methods`
   *  cevabındaki EN/DE ad haritası; görünen etiket
   *  `resolveTaxonomyName(name, name_by_locale, locale)` ile çözülür.
   *  Yoksa/boşsa TR canonical gösterilir. */
  name_by_locale?: TaxonomyNameByLocale;
};

/* ---------------- VALIDATION ERROR MAP ----------------
   `errors` state'i — Record<string, string>. Eski `any` typing
   kapatıldı. */
export type PublicReservationFormErrors = Record<string, string>;
