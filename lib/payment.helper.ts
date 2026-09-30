/* ===============================================================
   🔥 PAYMENT PREFERENCE — TEK MERKEZİ HELPER
   ===============================================================
   Tüm sistemde payment_preference için tek source-of-truth.

   - "prepayment"   → şimdi sadece ön ödeme alınır
   - "full_payment" → şimdi tam ödeme alınır

   Eski rezervasyonlarda bu alan boş/null olabilir.
   normalizePaymentPreference() bunu güvenle "prepayment"
   default'una düşürür → backward compatibility korunur.
   =============================================================== */

export type PaymentPreference = "prepayment" | "full_payment";

export const PAYMENT_PREFERENCE_VALUES: PaymentPreference[] = [
  "prepayment",
  "full_payment",
];

/* ---------------------------------------------
   🔥 NORMALIZE
   Eski/eksik kayıtlar için fallback.
   payment_preference null/undefined/"" → "prepayment"
---------------------------------------------- */
export function normalizePaymentPreference(
  value: unknown
): PaymentPreference {
  if (value === "full_payment") return "full_payment";
  return "prepayment";
}

/* ---------------------------------------------
   🔥 LABEL — UI / mail / pdf gösterimi
---------------------------------------------- */
export function paymentPreferenceLabel(
  value: unknown
): string {
  const v = normalizePaymentPreference(value);
  if (v === "full_payment") return "Tüm Ödeme";
  return "Ön Ödeme";
}

/* ---------------------------------------------
   🔥 SHORT LABEL — badge / liste görünümü
---------------------------------------------- */
export function paymentPreferenceBadgeLabel(
  value: unknown
): string {
  const v = normalizePaymentPreference(value);
  if (v === "full_payment") return "Full Payment";
  return "Ön Ödeme";
}

/* ===============================================================
   🔥 SHOULD DISPLAY "ŞİMDİ ÖDENECEK TUTAR"
   ===============================================================
   Confirmed rezervasyonlarda ödeme artık "şimdi ödenecek" değil;
   ya zaten alındı ya da ödenmiş kabul ediliyor. Bu yüzden o satır
   gizlenmeli (UI / mail / pdf hepsinde aynı kural).

   Tek source-of-truth — hardcoded `status === "confirmed"`
   kontrollerini her yerde tekrarlamamak için.
   =============================================================== */
export function shouldDisplayPayNow(
  status: unknown
): boolean {
  const s = (status ?? "").toString().toLowerCase().trim();
  return s !== "confirmed";
}

/* ===============================================================
   🔥 SHOULD DISPLAY PAYMENT SECTION (TÜM ÖDEME KARTI)
   ===============================================================
   Cancelled rezervasyonlarda ödeme detayları (toplam, ödeme
   tercihi, ödenen, kalan, ödeme yöntemi) tamamen gizlenmeli —
   iptal edilmiş bir rezervasyonda kullanıcıya gereksiz ödeme
   bilgisi göstermiyoruz.

   Tek source-of-truth — hardcoded `status === "cancelled"`
   kontrollerini her yerde tekrarlamamak için.
   =============================================================== */
export function shouldDisplayPaymentSection(
  status: unknown
): boolean {
  const s = (status ?? "").toString().toLowerCase().trim();
  return s !== "cancelled";
}

/* ===============================================================
   🔥 PAYMENT DISPLAY VALUES — TEK MERKEZİ HESAP
   ===============================================================
   Reservation snapshot'ından "şimdi ödenecek tutar" ve
   "girişte ödenecek tutar" gibi türetilmiş alanları üretir.

   Inputs (snapshot — canlı kur/fiyat değil):
     - total_price_try
     - prepayment_amount
     - paid_amount
     - payment_preference

   Outputs:
     - payNow        → şimdi ödenecek tutar (rezervasyon onayında)
     - remainingOnArrival → girişte ödenecek (toplam − payNow)
     - paymentPreference  → normalize edilmiş değer
     - isFullPayment      → kolay flag
   =============================================================== */
export type PaymentDisplayInput = {
  total_price_try?: number | string | null;
  total_price?: number | string | null;
  prepayment_amount?: number | string | null;
  paid_amount?: number | string | null;
  remaining_payment?: number | string | null;
  payment_preference?: unknown;
};

export type PaymentDisplayValues = {
  paymentPreference: PaymentPreference;
  isFullPayment: boolean;
  totalTRY: number;
  prepaymentTRY: number;
  paidTRY: number;
  /** Şimdi (rezervasyon onayında) ödenecek tutar */
  payNow: number;
  /** Girişte ödenecek tutar (toplam − payNow) */
  remainingOnArrival: number;
  /** Toplam − ödenen (paid bazlı kalan, mevcut rapor mantığı) */
  remainingFromPaid: number;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function getPaymentDisplayValues(
  r: PaymentDisplayInput | null | undefined
): PaymentDisplayValues {
  const totalTRY =
    num(r?.total_price_try) || num(r?.total_price) || 0;

  const prepaymentTRY = num(r?.prepayment_amount);
  const paidTRY = num(r?.paid_amount);

  const paymentPreference = normalizePaymentPreference(
    r?.payment_preference
  );
  const isFullPayment = paymentPreference === "full_payment";

  // 🔥 ŞİMDİ ÖDENECEK
  const payNow = isFullPayment ? totalTRY : prepaymentTRY;

  // 🔥 GİRİŞTE ÖDENECEK (toplam − şimdi ödenecek)
  const remainingOnArrival = Math.max(totalTRY - payNow, 0);

  // 🔥 KALAN (paid bazlı — mevcut rapor logic'i)
  const remainingFromPaid = Math.max(totalTRY - paidTRY, 0);

  return {
    paymentPreference,
    isFullPayment,
    totalTRY,
    prepaymentTRY,
    paidTRY,
    payNow,
    remainingOnArrival,
    remainingFromPaid,
  };
}
