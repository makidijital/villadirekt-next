/* ===============================================================
   🔥 PAYMENT LINK — TEK MERKEZİ HELPER
   ===============================================================
   Tüm sistemde payment_link_status için tek source-of-truth.

   Allowed values:
     - pending   → henüz link gönderilmedi
     - sent      → müşteriye mail ile gönderildi
     - paid      → müşteri ödedi
     - expired   → linkin süresi doldu

   Eski rezervasyonlarda bu alan boş/null olabilir.
   normalizePaymentLinkStatus() → "pending" fallback'i
   sayesinde backward compatibility korunur.
   =============================================================== */

export type PaymentLinkStatus = "pending" | "sent" | "paid" | "expired";

export const PAYMENT_LINK_STATUS_VALUES: PaymentLinkStatus[] = [
  "pending",
  "sent",
  "paid",
  "expired",
];

/* ---------------------------------------------
   🔥 NORMALIZE — fallback "pending"
---------------------------------------------- */
export function normalizePaymentLinkStatus(
  value: unknown
): PaymentLinkStatus {
  if (value === "sent") return "sent";
  if (value === "paid") return "paid";
  if (value === "expired") return "expired";
  return "pending";
}

/* ---------------------------------------------
   🔥 LABEL — UI / mail / pdf
---------------------------------------------- */
export function paymentLinkStatusLabel(value: unknown): string {
  const v = normalizePaymentLinkStatus(value);
  switch (v) {
    case "pending":
      return "Bekliyor";
    case "sent":
      return "Gönderildi";
    case "paid":
      return "Ödendi";
    case "expired":
      return "Süresi Doldu";
  }
}

/* ---------------------------------------------
   🔥 COLOR TOKENS
   - swatch: kavramsal renk (gray/blue/green/red)
   - badgeClass: admin UI tailwind className
   - emailVariant: email-shell emailBadge varyantı
---------------------------------------------- */
export type PaymentLinkSwatch = "gray" | "blue" | "green" | "red";
export type PaymentLinkEmailVariant =
  | "neutral"
  | "info"
  | "success"
  | "danger"
  | "warning";

export type PaymentLinkColorTokens = {
  swatch: PaymentLinkSwatch;
  badgeClass: string;
  emailVariant: PaymentLinkEmailVariant;
};

export function paymentLinkStatusColor(
  value: unknown
): PaymentLinkColorTokens {
  const v = normalizePaymentLinkStatus(value);
  switch (v) {
    case "pending":
      return {
        swatch: "gray",
        badgeClass:
          "bg-stone-50 text-stone-700 border-stone-200",
        emailVariant: "neutral",
      };
    case "sent":
      return {
        swatch: "blue",
        badgeClass:
          "bg-blue-50 text-blue-700 border-blue-200",
        emailVariant: "info",
      };
    case "paid":
      return {
        swatch: "green",
        badgeClass:
          "bg-emerald-50 text-emerald-700 border-emerald-200",
        emailVariant: "success",
      };
    case "expired":
      return {
        swatch: "red",
        badgeClass: "bg-red-50 text-red-700 border-red-200",
        emailVariant: "danger",
      };
  }
}

/* ===============================================================
   🔥 PAYMENT METHOD TYPE — credit_card / bank_transfer
   ===============================================================
   payment_methods.type kolonu projede henüz tüm yerlerde
   tanımlı olmayabilir; helper güvenli default ile çalışır.
   =============================================================== */
export type PaymentMethodLike = {
  type?: string | null;
  /* 🛡️ Western Union tespiti için isim (additive — mevcut tüketiciler
     yalnız `type` okur, etkilenmez). WU satırı admin formunda yalnız
     name ile eklendiğinden type=bank_transfer default'una düşer; bu
     yüzden WU ayrımı isimden yapılır. */
  name?: string | null;
} | null | undefined;

/* ---------------------------------------------
   🔥 NULL-SAFE FALLBACK
   - method NULL/undefined ise → "bank_transfer"
   - method.type NULL/boş ise → "bank_transfer"
   Backward compatibility: type kolonu olmayan eski
   payment_methods kayıtları default olarak EFT/Havale
   gibi davranır → mevcut sistem bozulmaz.
---------------------------------------------- */
export function paymentMethodType(
  method: PaymentMethodLike
): string {
  const raw = ((method?.type ?? "") + "").toLowerCase().trim();
  return raw || "bank_transfer";
}

export function isCreditCardMethod(
  method: PaymentMethodLike
): boolean {
  return paymentMethodType(method) === "credit_card";
}

export function isBankTransferMethod(
  method: PaymentMethodLike
): boolean {
  return paymentMethodType(method) === "bank_transfer";
}

/* ---------------------------------------------
   🔥 WESTERN UNION TESPİTİ
   - type === "western_union" (ileride forma type seçici eklenirse) VEYA
   - name "western union" içeriyorsa (mevcut durum: WU satırı yalnız
     name ile eklendi, type=bank_transfer default'una düştü).
   Önemli: WU type'ı çoğunlukla bank_transfer olduğundan, endpoint/label
   kararlarında WU kontrolü bank_transfer'dan ÖNCE yapılmalı.
---------------------------------------------- */
export function isWesternUnionMethod(
  method: PaymentMethodLike
): boolean {
  const t = ((method?.type ?? "") + "").toLowerCase().trim();
  if (t === "western_union") return true;
  const n = ((method?.name ?? "") + "").toLowerCase().trim();
  return n.includes("western union") || n.includes("western_union");
}

/* ---------------------------------------------
   🔥 SHOULD DISPLAY PAYMENT LINK SECTION
   - credit_card → true
   - bank_transfer veya tanımsız → false
   (Sadece kredi kartı odaklı eski API; geriye dönük uyum
    için korunuyor. Yeni flow için isPaymentRequestSupported.)
---------------------------------------------- */
export function shouldDisplayPaymentLinkSection(
  method: PaymentMethodLike
): boolean {
  return isCreditCardMethod(method);
}

/* ===============================================================
   🔥 UNIFIED PAYMENT REQUEST
   ===============================================================
   Hem credit_card hem bank_transfer aynı "ödeme talebi"
   mantığında çalışır. Cash veya tanımsız ise gizli kalır.

   - isPaymentRequestSupported(method) → section gate
   - paymentRequestActionLabel(method) → CTA metni
   - paymentRequestEndpoint(method) → hangi mail route'a POST atılır
   =============================================================== */
export function isPaymentRequestSupported(
  method: PaymentMethodLike
): boolean {
  return (
    isCreditCardMethod(method) ||
    isWesternUnionMethod(method) ||
    isBankTransferMethod(method)
  );
}

export function paymentRequestActionLabel(
  method: PaymentMethodLike
): string {
  if (isCreditCardMethod(method)) return "Ödeme Linki Gönder";
  /* WU kontrolü bank_transfer'dan ÖNCE (WU type=bank_transfer olabilir). */
  if (isWesternUnionMethod(method)) return "Western Union Bilgilerini Gönder";
  if (isBankTransferMethod(method))
    return "Ödeme Bilgilerini Gönder";
  return "Ödeme Talebi Gönder";
}

export function paymentRequestEndpoint(
  method: PaymentMethodLike
): string | null {
  if (isCreditCardMethod(method)) return "/api/mail/payment-link";
  /* WU kontrolü bank_transfer'dan ÖNCE — WU çoğunlukla type=bank_transfer
     olduğundan aksi halde yanlışlıkla EFT route'una giderdi. */
  if (isWesternUnionMethod(method)) return "/api/mail/western-union-payment";
  if (isBankTransferMethod(method))
    return "/api/mail/bank-transfer-payment";
  return null;
}
