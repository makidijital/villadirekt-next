import {
  emailLayout,
  emailHeading,
  emailParagraph,
  emailBadge,
  emailButton,
  emailDivider,
  emailKeyValueRow,
  escapeHtml,
} from "./email-shell";

/* ===============================================================
   🔥 PAYMENT LINK EMAIL
   ===============================================================
   Admin tarafından "Ödeme Linki Gönder" butonuyla tetiklenen
   müşteri maili.

   - Snapshot mantığı: değerler reservation kaydından gelir
     (canlı kur / canlı fiyat KULLANILMAZ)
   - CTA: "Ödeme Yap" → reservation.payment_link
   - Intro metni payment_preference'a göre değişir
   - Maki Dijital branding
   =============================================================== */

export type PaymentLinkEmailProps = {
  brandName?: string;
  brandLogoUrl?: string | null;

  // META
  villaTitle: string;
  reservationNo?: string | null;

  // 🔥 DAMAGE DEPOSIT — informational; accounting'e dahil değil
  damageDepositDisplay?: string | null;

  // STAY
  startDate: string;
  endDate: string;
  nights: number;

  // CUSTOMER
  guestName: string;

  // PAYMENT
  paymentPreferenceLabel: string; // "Ön Ödeme" / "Tüm Ödeme"
  isFullPayment: boolean;
  payNowDisplay: string; // örn "₺18.700"

  // CTA
  paymentLink: string;
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

export function renderPaymentLinkEmail(
  props: PaymentLinkEmailProps
): { subject: string; html: string } {
  const brand = props.brandName || "Maki Dijital";

  const introText = props.isFullPayment
    ? "Rezervasyonunuz için toplam ödeme talep edilmektedir."
    : "Rezervasyonunuzu kesinleştirmek için ön ödeme gerekmektedir.";

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

  const body =
    `<div style="margin-bottom:14px;display:flex;gap:8px;">${emailBadge(
      "Ödeme Linki",
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
    emailButton(props.paymentLink, "Ödeme Yap") +
    emailDivider() +
    emailParagraph(
      `Bu link sadece sizin rezervasyonunuza özeldir. Ödeme tamamlandıktan sonra rezervasyonunuz onaylanacaktır. Sorularınız için bu maile yanıtlamanız yeterli.`
    );

  return {
    subject: `${brand} · Ödeme Linki — ${props.villaTitle}`,
    html: emailLayout({
      brandName: brand,
      brandLogoUrl: props.brandLogoUrl ?? null,
      preheader: `${props.villaTitle} için ödeme linkiniz hazır (${props.startDate} → ${props.endDate})`,
      body,
    }),
  };
}
