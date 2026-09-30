import type { PaymentPreference } from "@/lib/payment.helper";
import type { PaymentLinkStatus } from "@/lib/payment-link.helper";

/* ===============================================================
   🛡️ FAZ 1 — RESERVATION SERVICE TYPES
   ===============================================================
   Eski `app/services/reservation.service.ts` inline parametre
   shape'leri ve internal payload type'ı BYTE-IDENTICAL bu dosyaya
   çıkarıldı. Facade (reservation.service.ts) bu dosyadan re-export
   eder; caller'lar (ReservationForm, reservations/[id]/page,
   reservations/page) için import path değişmedi.

   ⚠️ KESIN KURAL:
     - Field set aynen.
     - Optional / nullable contract aynen.
     - Literal union'lar aynen.
     - Compile-time davranışı genişletilmedi/daraltılmadı.
   =============================================================== */

/* ---------------- STATUS ENUM ALIAS ---------------- */

/** `updateReservationFull` ve INSERT payload'da kullanılan tam set. */
export type ReservationStatusFull =
  | "pending"
  | "confirmed"
  | "rejected"
  | "cancelled";

/** ⚠️ LEGACY ASIMETRİSİ KORUNDU — `updateReservationStatus(id, status)`
 *  signature'ı tarihten beri 3-değerli (cancelled YOK). Refactor
 *  scope dışı; davranış değişimi yasak. */
export type ReservationStatusLegacy =
  | "pending"
  | "confirmed"
  | "rejected";

/* ---------------- CREATE INPUT ---------------- */

/** `createReservation(data: ...)` parametre shape'inin BYTE-IDENTICAL
 *  kopyası. Field sırası eski signature ile aynı (audit/log diff
 *  stability için). */
export type ReservationCreateInput = {
  villa_id: string;
  start_date: string;
  end_date: string;
  total_price: number;

  original_price?: number;
  original_currency?: string;
  exchange_rate?: number;
  total_price_try?: number;

  original_cleaning_fee?: number;
  original_cleaning_currency?: string;
  cleaning_fee_try?: number;

  // 🔥 HAVUZ ISITMA — 6. adım (public reservation create snapshot).
  // Sadece tanımlıysa yazılır tarzında DEĞİL — payload-create.ts'de
  // cleaning fee ile AYNI always-write coercion deseni kullanılır
  // (bkz. buildCreateReservationPayload). Field set + isim DB kolonlarıyla
  // birebir (migration 075): pool_heating_selected, original_pool_heating_total,
  // original_pool_heating_currency, pool_heating_total_try.
  pool_heating_selected?: boolean;
  original_pool_heating_total?: number;
  original_pool_heating_currency?: string;
  pool_heating_total_try?: number;

  // 🛡️ İNDİRİM/ÖZEL FİYAT SNAPSHOT — FAZ 4 (public reservation create).
  // Migration 080 kolonlarıyla BİREBİR isim. Client'tan gelen değerler
  // ASLA güvenilmez — route.ts (public create) bu alanları
  // `verifyPublicReservationPrice`'ın server-authoritative sonucuyla
  // createReservation'dan ÖNCE override eder (bkz. price-verify.ts,
  // route.ts). payload-create.ts pool heating ile AYNI "always-write"
  // deseniyle bu 6 alanı da her zaman INSERT payload'a yazar — discount
  // uygulanmadıysa TÜMÜ null (discount_applied hariç, o zaman false).
  discount_applied?: boolean;
  discount_type?: "percent" | "fixed" | null;
  discount_value?: number | null;
  discount_currency?: string | null;
  original_stay_total_try?: number | null;
  stay_discount_amount_try?: number | null;

  name: string;
  phone: string;
  /** 🛡️ Migration 094 — ikinci telefon (E.164). Public akışta ZORUNLU
   *  (create.service guard); admin akışında opsiyonel. */
  phone2?: string | null;
  email?: string;

  identity_number?: string;
  country?: string | null;
  city?: string | null;
  address?: string | null;

  guests?: number;
  guest_names?: string[]; // 🔥 EKLENDİ

  note?: string | null;

  payment_method_id?: string | null;
  prepayment?: number;

  // 🔥 FINANCIAL SNAPSHOT
  prepayment_amount?: number;
  remaining_payment?: number;
  paid_amount?: number;

  // 🔥 CUSTOM PRICE
  custom_price?: boolean;
  custom_price_note?: string | null;

  // 🔥 PAYMENT PREFERENCE
  // Sadece tanımlıysa yazılır → eski rezervasyonlar bozulmaz.
  payment_preference?: PaymentPreference;

  // 🔥 DAMAGE DEPOSIT — villa.deposit'ten snapshot
  // Sadece tanımlıysa yazılır; eski rezervasyonlar etkilenmez.
  damage_deposit?: number;
};

/* ---------------- UPDATE INPUT ---------------- */

/** `updateReservationFull(id, data: ...)` parametre shape'inin
 *  BYTE-IDENTICAL kopyası. Nullable widening (TUR 1) aynen
 *  korundu. */
export type ReservationUpdateInput = {
  // 🔥 VILLA — admin villayı değiştirebilir
  villa_id?: string;

  name?: string;
  phone?: string;
  phone2?: string | null;
  email?: string | null;

  identity_number?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;

  guests?: number | null;
  guest_names?: string[] | null; // 🔥 EKLENDİ

  note?: string | null;

  start_date?: string;
  end_date?: string;
  total_price?: number | null;

  // 🔥 MULTI CURRENCY
  total_price_try?: number | null;
  original_price?: number | null;
  original_currency?: string | null;
  original_cleaning_fee?: number | null;
  original_cleaning_currency?: string | null;
  cleaning_fee_try?: number | null;
  exchange_rate?: number | null;

  // 🔥 HAVUZ ISITMA — 8. adım (admin edit doğruluk düzeltmesi).
  // Create input'taki (satır 63-66) aynı 4 alan; admin update akışında
  // (tarih/villa değişikliği, recalculate) doğru snapshot yazılabilmesi
  // için eklendi. Field set + isim DB kolonlarıyla birebir (migration 075).
  pool_heating_selected?: boolean | null;
  original_pool_heating_total?: number | null;
  original_pool_heating_currency?: string | null;
  pool_heating_total_try?: number | null;

  payment_method_id?: string | null;
  /* TUR 1: ReservationStatus enum ile aligned (cancelled dahil).
     Migration 030'da allow-list pending+confirmed availability'ye
     etki ediyor; cancelled DB status enum'unda geçerli kayıt
     olarak akar (Faz 4B confirmation guard yalnız "confirmed"
     transition'ında devreye giriyor). */
  status?: ReservationStatusFull;

  // 🔥 FINANCIAL SNAPSHOT
  prepayment_amount?: number | null;
  remaining_payment?: number | null;
  paid_amount?: number | null;

  // 🔥 CUSTOM PRICE
  custom_price?: boolean | null;
  custom_price_note?: string | null;

  // 🔥 PAYMENT PREFERENCE
  payment_preference?: PaymentPreference;

  // 🔥 PAYMENT LINK
  payment_link?: string | null;
  payment_link_status?: PaymentLinkStatus;
  payment_link_sent_at?: string | null;
};

/* ---------------- UPDATE PAYLOAD (DB-SHAPE) ---------------- */

/** `updateReservationFull` içinde inline tanımlı `ReservationUpdatePayload`
 *  shape'inin BYTE-IDENTICAL kopyası. repository update() PostgreSQL'in
 *  nullable kolonlarına `null` yazımını desteklediği için `| null`
 *  widening runtime'da byte-identical.
 *
 *  ⚠️ Bu tip "internal payload" — caller'lar `ReservationUpdateInput`
 *  geçer; helper içinde `ReservationUpdatePayload`'a coerce edilir.
 *  Export edilir çünkü helper + orchestrator + test arasında
 *  paylaşılır. */
export type ReservationUpdatePayload = {
  villa_id?: string;
  name?: string;
  phone?: string;
  phone2?: string | null;
  email?: string | null;
  identity_number?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  guests?: number | null;
  guest_names?: string[] | null;
  note?: string | null;
  start_date?: string;
  end_date?: string;
  total_price?: number | null;
  total_price_try?: number;
  original_price?: number;
  original_currency?: string;
  original_cleaning_fee?: number;
  original_cleaning_currency?: string;
  cleaning_fee_try?: number;
  exchange_rate?: number;
  pool_heating_selected?: boolean;
  original_pool_heating_total?: number;
  original_pool_heating_currency?: string;
  pool_heating_total_try?: number;
  payment_method_id?: string | null;
  status?: ReservationStatusFull;
  prepayment_amount?: number;
  remaining_payment?: number;
  paid_amount?: number;
  custom_price?: boolean;
  custom_price_note?: string | null;
  payment_preference?: "prepayment" | "full_payment";
  payment_link?: string | null;
  payment_link_status?: "pending" | "sent" | "paid" | "expired";
  payment_link_sent_at?: string | null;
};

/* ---------------- CONFLICT WINDOW ---------------- */

/** Conflict check helper (`_helpers/conflict.ts`) input shape'i.
 *  Half-open `[start, end)` overlap kontrolü için minimum field set;
 *  helper tarafında `villa_id` filter + status allow-list ile
 *  birleşir. */
export type ReservationConflictWindow = {
  villa_id: string;
  start_date: string;
  end_date: string;
};

/* ---------------- COMMISSION INPUT ---------------- */

/** Commission snapshot helper (`_helpers/commission.ts`) inputs:
 *    fetchCommissionRate     → villa_id
 *    safeCommissionRate      → unknown raw
 *    calcCommissionAmount    → totalPriceTry + rate
 *  Tek ad altında topluyoruz; helper'larda ayrı imzalar kullanılır. */
export type ReservationCommissionInput = {
  villa_id: string;
  total_price_try: number | undefined;
};

/* ---------------- STATUS TRANSITION ---------------- */

/** `updateReservationFull` ve `updateReservationStatus` ortak
 *  pattern'i: `status === "confirmed"` ise `assertCanConfirm`
 *  guard çağrılır. Bu type guard input'unu typed temsil eder. */
export type ReservationStatusTransition = {
  id: string;
  next_status: ReservationStatusFull | undefined;
  /* Payload'da paid_amount tanımlıysa kullanılır; tanımlı değilse
     helper DB'den fetch eder (fallback). */
  payload_paid_amount: number | null | undefined;
};

/* ---------------- SERVICE RESULT (alias) ---------------- */

/** Bazı exports şu an `Promise<true>` veya `Promise<inserted-row>`
 *  döner. Bu alias future-proof: discriminated union'a evrildiğinde
 *  caller'lar burayı import eder. Şu an kullanılmıyor (defansif). */
export type ReservationServiceResult<T = true> =
  | { ok: true; value: T }
  | { ok: false; error: string };
