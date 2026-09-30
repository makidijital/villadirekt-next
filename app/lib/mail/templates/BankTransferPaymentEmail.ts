import {
  emailLayout,
  emailHeading,
  emailParagraph,
  emailBadge,
  emailDivider,
  emailKeyValueRow,
  escapeHtml,
} from "./email-shell";

/* ===============================================================
   🔥 BANK TRANSFER PAYMENT EMAIL
   ===============================================================
   EFT/Havale flow için müşteriye gönderilen ödeme talebi maili.
   Unified payment request flow'unun bank_transfer karşılığı.

   - Snapshot only (canlı kur/fiyat YOK)
   - Aktif firma hesabı (payment_accounts) bilgileri
   - referenceCode → açıklamaya yazılması istenen kod
   =============================================================== */

export type BankTransferPaymentEmailProps = {
  brandName?: string;
  brandLogoUrl?: string | null;

  // META
  villaTitle: string;
  reservationNo?: string | null;

  // STAY
  startDate: string;
  endDate: string;
  nights: number;

  // 🔥 DAMAGE DEPOSIT — informational; accounting'e dahil değil
  damageDepositDisplay?: string | null;

  // CUSTOMER
  guestName: string;

  // PAYMENT
  paymentPreferenceLabel: string;
  isFullPayment: boolean;
  payNowDisplay: string;

  // BANK ACCOUNT (aktif firma hesabı)
  bankAccount: {
    bankName: string;
    accountHolder: string;
    ibanFormatted: string;
    branchName: string | null;
    branchCode: string | null;
    swiftCode: string | null;
    currency: string | null;
  };

  // REFERENCE
  referenceCode: string; // Açıklamaya yazılacak rezervasyon kodu
};

function detailCard(title: string, rows: string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:#f8fafc;border:1px solid rgba(15,23,42,0.06);border-radius:14px;margin:8px 0;">
    <tr>
      <td style="padding:14px 18px;">
        <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;font-weight:700;color:#94a3b8;">
          ${escapeHtml(title)}
        </p>
        ${rows.join("")}
      </td>
    </tr>
  </table>`;
}

export function renderBankTransferPaymentEmail(
  props: BankTransferPaymentEmailProps
): { subject: string; html: string } {
  const brand = props.brandName || "Maki Dijital";

  const introText = props.isFullPayment
    ? "Rezervasyonunuz için toplam ödeme talep edilmektedir. Aşağıdaki banka hesabına havale/EFT yapabilirsiniz."
    : "Rezervasyonunuzu kesinleştirmek için ön ödeme gerekmektedir. Aşağıdaki banka hesabına havale/EFT yapabilirsiniz.";

  const stayCard = detailCard("Rezervasyon", [
    props.reservationNo
      ? emailKeyValueRow("Rezervasyon Kodu", props.reservationNo)
      : "",
    emailKeyValueRow("Villa", props.villaTitle),
    emailKeyValueRow(
      "Tarih aralığı",
      `${props.startDate} → ${props.endDate}`
    ),
    emailKeyValueRow("Konaklama süresi", `${props.nights} gece`),
  ]);

  const paymentCard = detailCard("Ödeme", [
    emailKeyValueRow("Ödeme Tercihi", props.paymentPreferenceLabel),
    emailKeyValueRow("Şimdi Ödenecek Tutar", props.payNowDisplay),
  ]);

  const ba = props.bankAccount;
  const bankCard = detailCard("Banka Hesap Bilgileri", [
    emailKeyValueRow("Banka", ba.bankName || "—"),
    emailKeyValueRow("Hesap Sahibi", ba.accountHolder || "—"),
    emailKeyValueRow("IBAN", ba.ibanFormatted || "—"),
    ba.branchName ? emailKeyValueRow("Şube", ba.branchName) : "",
    ba.branchCode
      ? emailKeyValueRow("Şube kodu", ba.branchCode)
      : "",
    ba.swiftCode ? emailKeyValueRow("SWIFT", ba.swiftCode) : "",
    ba.currency
      ? emailKeyValueRow("Para birimi", ba.currency)
      : "",
  ]);

  const referenceCard = detailCard("Açıklama / Referans", [
    emailKeyValueRow("Referans Kodu", props.referenceCode),
  ]);

  const body =
    `<div style="margin-bottom:14px;display:flex;gap:8px;">${emailBadge(
      "Ödeme Talebi",
      "info"
    )}</div>` +
    emailHeading(`Merhaba ${escapeHtml(props.guestName)},`) +
    emailParagraph(escapeHtml(introText)) +
    stayCard +
    paymentCard +
    (props.damageDepositDisplay
      ? detailCard("Hasar Depozitosu", [
          emailKeyValueRow("Tutar", props.damageDepositDisplay),
          emailKeyValueRow(
            "Açıklama",
            "Hasar olmadığı takdirde iade edilir"
          ),
        ])
      : "") +
    bankCard +
    referenceCard +
    emailDivider() +
    emailParagraph(
      `Lütfen havale/EFT açıklamasına <strong>${escapeHtml(
        props.referenceCode
      )}</strong> kodunu ekleyin. Ödeme tarafımıza ulaştığında rezervasyonunuz onaylanacaktır. Sorularınız için bu maile yanıtlamanız yeterli.`
    );

  return {
    subject: `${brand} · Ödeme Bilgileri — ${props.villaTitle}`,
    html: emailLayout({
      brandName: brand,
      brandLogoUrl: props.brandLogoUrl ?? null,
      preheader: `${props.villaTitle} için ödeme talimatları (${props.startDate} → ${props.endDate})`,
      body,
    }),
  };
}
