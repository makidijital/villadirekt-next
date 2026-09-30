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
   🔥 PAYMENT CONFIRMED EMAIL
   ===============================================================
   Admin "Ödemeyi Onayla" butonuyla tetiklenen müşteri maili.
   Ödeme alındığını teyit eder.

   - Snapshot only
   - Alınan tutar / kalan tutar bilgisi
   - Premium teyit tonu
   =============================================================== */

export type PaymentConfirmedEmailProps = {
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

  // FINANCIAL (snapshot)
  paidDisplay: string; // "₺18.700"
  remainingDisplay: string; // "₺74.800"
  totalDisplay: string; // "₺93.500"
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

export function renderPaymentConfirmedEmail(
  props: PaymentConfirmedEmailProps
): { subject: string; html: string } {
  const brand = props.brandName || "Maki Dijital";

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

  const financialCard = detailCard("Ödeme", [
    emailKeyValueRow("Toplam", props.totalDisplay),
    emailKeyValueRow("Alınan", props.paidDisplay),
    emailKeyValueRow("Kalan", props.remainingDisplay),
  ]);

  const body =
    `<div style="margin-bottom:14px;display:flex;gap:8px;">${emailBadge(
      "Ödeme Alındı",
      "success"
    )}</div>` +
    emailHeading(`Ödemeniz alındı 🎉`) +
    emailParagraph(
      `Merhaba ${escapeHtml(
        props.guestName
      )}, <strong>${escapeHtml(
        props.villaTitle
      )}</strong> için ödemeniz tarafımıza ulaştı. Aşağıda rezervasyonunuza ilişkin güncel ödeme bilgileri yer alıyor.`
    ) +
    stayCard +
    financialCard +
    (props.damageDepositDisplay
      ? detailCard("Hasar Depozitosu", [
          emailKeyValueRow("Tutar", props.damageDepositDisplay),
          emailKeyValueRow(
            "Açıklama",
            "Hasar olmadığı takdirde iade edilir"
          ),
        ])
      : "") +
    emailDivider() +
    emailParagraph(
      `Sizi ağırlamayı dört gözle bekliyoruz. Konaklama veya ödeme ile ilgili sorularınızda bu maile yanıtlamanız yeterli.`
    );

  return {
    subject: `${brand} · Ödemeniz alındı — ${props.villaTitle}`,
    html: emailLayout({
      brandName: brand,
      brandLogoUrl: props.brandLogoUrl ?? null,
      preheader: `${props.villaTitle} için ödemeniz alındı (${props.startDate} → ${props.endDate})`,
      body,
    }),
  };
}
