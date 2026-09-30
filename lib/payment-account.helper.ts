/* ===============================================================
   🔥 PAYMENT ACCOUNT HELPER — PURE UTILITIES + TYPES
   ===============================================================
   Firma EFT/Havale hesap bilgileri için pure utility katmanı.
   - formatIban() → IBAN'ı 4'lü gruplar halinde gösterir
   - paymentAccountDisplay() → UI/mail/PDF için normalize edilmiş
     görünüm objesi döner

   🛡️ SERVER-ONLY DB QUERY AYRIŞTIRILDI (Migration 034 hardening):
     `getActivePaymentAccount` fonksiyonu `lib/payment-account.server.ts`
     dosyasına taşındı (service-role + "server-only" guard).
     Sebep: payment_accounts tablosunda anon RLS erişim KAPATILDI;
     server-side mail akışı service-role kullanmak zorunda.
     Bu helper artık DB query etmiyor → CLIENT bundle güvenli
     (admin client component'leri formatIban'ı import ediyor).

   "Aktif hesap" mantığı service tarafında (single-active)
   kontrol edilir; pure helper yalnız tip + format döner.
   =============================================================== */

export type PaymentAccount = {
  id: string;
  bank_name: string | null;
  account_holder: string | null;
  iban: string | null;
  branch_name: string | null;
  branch_code: string | null;
  swift_code: string | null;
  currency: string | null;
  is_active: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/* ---------------------------------------------
   🛡️ getActivePaymentAccount KALDIRILDI — server-only dosyaya taşındı
   ---------------------------------------------
   Yeni konum: `lib/payment-account.server.ts > getActivePaymentAccount`
   Server-side mail akışı oradan import etmeli (service-role + "server-only"
   guard). Migration 034 RLS hardening sonrası anon erişim sıfır.
---------------------------------------------- */

/* ---------------------------------------------
   🔥 FORMAT IBAN
   - Boşlukları/lowercase'i temizler
   - 4'erli gruplara böler
   - "TR12 3456 7890 1234 5678 9012 34" gibi
---------------------------------------------- */
export function formatIban(
  iban: string | null | undefined
): string {
  const cleaned = (iban || "")
    .toString()
    .replace(/\s+/g, "")
    .toUpperCase();
  if (!cleaned) return "";
  return cleaned.match(/.{1,4}/g)?.join(" ") || cleaned;
}

/* ---------------------------------------------
   🔥 DISPLAY OBJECT — UI/mail/PDF için normalize
---------------------------------------------- */
export type PaymentAccountDisplay = {
  bankName: string;
  accountHolder: string;
  ibanRaw: string;
  ibanFormatted: string;
  branchName: string | null;
  branchCode: string | null;
  swiftCode: string | null;
  currency: string | null;
};

export function paymentAccountDisplay(
  acc: PaymentAccount | null | undefined
): PaymentAccountDisplay | null {
  if (!acc) return null;
  return {
    bankName: (acc.bank_name || "").trim(),
    accountHolder: (acc.account_holder || "").trim(),
    ibanRaw: (acc.iban || "").trim().toUpperCase(),
    ibanFormatted: formatIban(acc.iban),
    branchName: (acc.branch_name || "").trim() || null,
    branchCode: (acc.branch_code || "").trim() || null,
    swiftCode: (acc.swift_code || "").trim().toUpperCase() || null,
    currency: (acc.currency || "").trim().toUpperCase() || null,
  };
}
