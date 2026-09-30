import type { Dispatch, SetStateAction } from "react";

import type { ReservationRow } from "@/types/database";
import type { PaymentMethodLike } from "@/lib/payment-link.helper";

/* ===============================================================
   🛡️ TYPE HARDENING — Reservation Detail Page state shape
   ===============================================================
   FAZ 2.5 / production-safe incremental type hardening (zero regression).

   ÖZET:
     - DB row (ReservationRow) + getReservationById query'sinin embed
       eklediği `villa` ve `payment_method` alanlarını birleştiren
       tek typed shape: `ReservationDetailData`.
     - Currency için literal union (`Currency`) — runtime davranış
       değişmez; sadece compile-time bilinen değerler.
     - Pricing engine snapshot için `PriceDetailSnapshot`.
     - selectedVilla için `SelectedVilla` (villa.service tarafındaki
       custom_prepayment_rate + cleaning_* alanlarını içerir).
     - `setData` dispatch tipi: page.tsx + child component'ler arası
       byte-identical signature kontratı.

   KESIN SINIRLAR:
     ❌ Runtime davranış değişmez.
     ❌ Default değer / fallback / parse akışı dokunulmaz.
     ❌ Payload/validation/save logic değişmez.
     ✅ Yalnız TypeScript compile-time güvenliği artar; silent string
        ↔ number / null ↔ undefined drift'i azaltır.

   GENİŞLETME:
     Yeni alan eklenince:
       1. DB migration → ReservationRow tip güncellenir.
       2. Buradaki extend bloğu otomatik genişler.
       3. Form state ile child component prop'ları otomatik
          compile-check edilir.
   =============================================================== */

/* ---------------- CURRENCY (literal union) ----------------
   Codebase'te kullanılan dört para birimi. ReservationRow'da
   `original_currency: string | null` typed; bu literal narrow,
   runtime fallback "TRY" semantic'i ile uyumlu. Geçici drift
   tolere edilebilmesi için string union YERINE genişletme amaçlı
   `(string & {})` eklemek YOK — strict tutuluyor; bilinmeyen
   currency string'i kabul edilirse refactor gerekir. */
export type Currency = "TRY" | "USD" | "EUR" | "GBP";

/* ---------------- VILLA EMBED (getReservationById select) ----------------
   getReservationById query'sinde villa şu alanlar ile embed edilir:
     villa:villa_id (title, cleaning_fee, cleaning_currency,
                     cleaning_limit, custom_prepayment_rate)
   DB client embed bazen tek object, bazen array döndürür;
   pratikte tek object beklenir. Defansif olarak ikisini de
   şu noktada tolere edebiliriz, ama page.tsx mevcut kodu
   `.villa?.title` pattern'i kullandığı için object varsayalım. */
export type ReservationVillaEmbed = {
  title: string | null;
  cleaning_fee: number | null;
  cleaning_currency: string | null;
  cleaning_limit: number | null;
  custom_prepayment_rate: number | string | null;
  /** 🔥 HAVUZ ISITMA — 8. adım. select-shapes.ts'in SELECT_RESERVATION_DETAIL
   *  villa embed'ine eklendi (bkz. o dosya). Admin edit/recalculate akışı
   *  için villa'nın gerçek havuz ısıtma ücretini taşır. */
  pool_heating_fee: number | null;
  pool_heating_currency: string | null;
  /* 🛡️ Migration 076 — sezonluk ay kısıtı. select-shapes.ts'in
   *  SELECT_RESERVATION_DETAIL villa embed'ine eklendi. */
  pool_heating_months: number[] | null;
} | null;

/* ---------------- PAYMENT METHOD EMBED ----------------
   getReservationById query'sinde payment_method şu alanlar ile embed:
     payment_method:payment_method_id (id, name, type)
   `isPaymentRequestSupported` helper'ı yalnız `.type` kullanır;
   diğer alanlar UI display için. PaymentMethodLike (helper tarafı)
   ile uyumlu (`{ type?: string | null } | null | undefined`). */
export type ReservationPaymentMethodEmbed = {
  id: string;
  name: string | null;
  type: string | null;
} | null;

/* ---------------- RESERVATION DETAIL DATA ----------------
   getReservationById return shape — DB row + 2 embed.
   page.tsx + 14 child component buradaki shape üzerinden çalışır.

   Wrapper amaçlı: ReservationRow zaten typed; embed alanları ekstra.
   `unknown`'a uzanan alanlar (örn. henüz typed olmayan future field'lar)
   için defansif `Record<string, unknown>` index signature YOK — kapalı
   shape (excess property checks aktif). Bilinmeyen alan eklenince
   compile-time hata verir → silent drift önlenir. */
export type ReservationDetailData = ReservationRow & {
  villa: ReservationVillaEmbed;
  payment_method: ReservationPaymentMethodEmbed;
  /** 🛡️ CLIENT-ONLY (DB'ye yazılmaz): Tahsilat kartındaki manuel
   *  "Şimdi Ödenecek Tutar" kilidi — bkz. _helpers/manualPrepayment.ts */
  prepayment_manual_amount?: number | null;
};

/* ---------------- PRICE DETAIL SNAPSHOT ----------------
   `priceDetail` state — calculateGrandTotal sonucundan veya DB
   snapshot'tan türetilen pricing özeti. UI tarafı bu shape'i kullanır;
   pricing engine helper kontratıyla birebir.

   Tüm alanlar non-optional number (helper her zaman 0 fallback'li
   number döner); null/undefined drift yok. Eksik field engelleme:
   compile-time çakışmada çıkar. */
export type PriceDetailSnapshot = {
  /** Konaklama gece sayısı (calendar selection sonrası). */
  nights: number;
  /** Konaklama tutarı (TRY). */
  stay: number;
  /** Temizlik tutarı (TRY, cleaning_limit muafiyeti uygulanmış). */
  cleaning: number;
  /** Toplam tutar (TRY) = stay + cleaning + poolHeating. */
  total: number;
  /** Havuz ısıtma tutarı (TRY). 🔥 8. adım — calculateGrandTotal'ın
   *  `poolHeating` dönüşüyle birebir. OPTIONAL tutuldu (cleaning/total'dan
   *  FARKLI olarak) — bu tip'i literal olarak inşa eden mevcut çağıranlar
   *  (ör. DateRangeCard/LiveDatePriceSummary — bu adımda dokunulmadı)
   *  bu alanı hiç bilmeyebilir; `priceDetail.poolHeating` okunduğunda
   *  `undefined` → tüketen taraf (accommodationBase 3. param, default=0)
   *  bunu 0 gibi ele alır → regresyon yok. */
  poolHeating?: number;
  /** Multi-currency snapshot: orijinal konaklama tutarı (foreign
   *  currency başlangıç değeri). Foreign currency yoksa null. */
  original_stay?: number | null;
  /** Multi-currency snapshot: orijinal temizlik tutarı. */
  original_cleaning?: number | null;
  /** 🔥 8. adım — Multi-currency snapshot: orijinal havuz ısıtma tutarı. */
  original_pool_heating?: number | null;
  /** Orijinal konaklama currency'si (foreign ise). */
  original_currency?: string | null;
  /** Orijinal temizlik currency'si (foreign ise). */
  original_cleaning_currency?: string | null;
  /** 🔥 8. adım — Orijinal havuz ısıtma currency'si (foreign ise). */
  original_pool_heating_currency?: string | null;
  /** Target currency (display tarafı; "TRY" default). custom_price
   *  branch'ında snapshot olarak yazılır; price recalc result'da
   *  helper'dan akar. */
  currency?: string;
};

/* ---------------- SELECTED VILLA (admin reservations side fetch) ----------------
   Admin villa change sonrası villa detayı async olarak çekilir
   (cleaning_fee, cleaning_currency, custom_prepayment_rate, ...).
   priceCard ve toggle handler'ı bu shape'i kullanır. */
export type SelectedVilla = {
  id?: string;
  cleaning_fee?: number | null;
  cleaning_currency?: string | null;
  cleaning_limit?: number | null;
  custom_prepayment_rate?: number | string | null;
  /** 🔥 HAVUZ ISITMA — 8. adım. Villa change sonrası async fetch edilen
   *  villa detayının pool heating alanları (bkz. villa.repository.server.ts
   *  findContextById). */
  pool_heating_fee?: number | null;
  pool_heating_currency?: string | null;
  /* 🛡️ Migration 076 — sezonluk ay kısıtı. AYNI kaynak (findContextById
   *  genişletildi). */
  pool_heating_months?: number[] | null;
} | null;

/* ---------------- SETTER ALIAS ----------------
   React useState dispatch — page.tsx + child component'ler
   arasında byte-identical signature kontratı. Functional updater
   pattern (`setData((prev) => ...)`) typed; child component'ler
   bu alias'ı prop type'ında kullanır → component'ler arası drift
   compile-time yakalanır. */
export type ReservationDetailDataSetter = Dispatch<
  SetStateAction<ReservationDetailData | null>
>;

/* ---------------- PAYMENT METHOD HELPER COMPAT ----------------
   `isPaymentRequestSupported(method: PaymentMethodLike)` helper'ı
   `{ type?: string | null } | null | undefined` bekler. Bizim
   `ReservationPaymentMethodEmbed` ile uyumludur (subset). Bu
   re-export tip migration sırasında external import sayısını
   azaltır. */
export type { PaymentMethodLike };
