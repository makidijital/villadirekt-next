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
   🔥 WESTERN UNION PAYMENT EMAIL
   ===============================================================
   Western Union flow için müşteriye gönderilen ödeme talebi maili.
   BankTransferPaymentEmail ile simetrik; banka bloğu yerine WU
   alıcı bilgileri + MTCN notu render eder.

   - Snapshot only (canlı kur/fiyat YOK)
   - Aktif WU kaydı (western_union_accounts) bilgileri
   - referenceCode → açıklamaya yazılması istenen kod
   =============================================================== */

export type WesternUnionPaymentEmailProps = {
  brandName?: string;
  brandLogoUrl?: string | null;

  villaTitle: string;
  reservationNo?: string | null;

  startDate: string;
  endDate: string;
  nights: number;

  damageDepositDisplay?: string | null;

  guestName: string;

  paymentPreferenceLabel: string;
  isFullPayment: boolean;
  payNowDisplay: string;

  // WESTERN UNION (aktif kayıt)
  westernUnion: {
    recipientName: string;
    country: string | null;
    city: string | null;
    phone: string | null;
    instructions: string | null;
  };

  referenceCode: string;
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

export function renderWesternUnionPaymentEmail(
  props: WesternUnionPaymentEmailProps
): { subject: string; html: string } {
  const brand = props.brandName || "Maki Dijital";

  const introText = props.isFullPayment
    ? "Rezervasyonunuz için toplam ödeme talep edilmektedir. Western Union ile ödeme için aşağıdaki bilgileri kullanabilirsiniz."
    : "Rezervasyonunuzu kesinleştirmek için ön ödeme gerekmektedir. Western Union ile ödeme için aşağıdaki bilgileri kullanabilirsiniz.";

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

  const wu = props.westernUnion;
  const wuCard = detailCard("Western Union Bilgileri", [
    emailKeyValueRow("Alıcı", wu.recipientName || "—"),
    wu.country ? emailKeyValueRow("Ülke", wu.country) : "",
    wu.city ? emailKeyValueRow("Şehir", wu.city) : "",
    wu.phone ? emailKeyValueRow("Telefon", wu.phone) : "",
    wu.instructions ? emailKeyValueRow("Not", wu.instructions) : "",
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
    wuCard +
    referenceCard +
    emailDivider() +
    emailParagraph(
      `Lütfen açıklamaya <strong>${escapeHtml(
        props.referenceCode
      )}</strong> kodunu ekleyin. <strong>Transfer sonrası MTCN kodunu bizimle paylaşınız.</strong> Ödeme tarafımıza ulaştığında rezervasyonunuz onaylanacaktır. Sorularınız için bu maile yanıtlamanız yeterli.`
    );

  return {
    subject: `${brand} · Western Union Ödeme Bilgileri — ${props.villaTitle}`,
    html: emailLayout({
      brandName: brand,
      brandLogoUrl: props.brandLogoUrl ?? null,
      preheader: `${props.villaTitle} için Western Union ödeme talimatları (${props.startDate} → ${props.endDate})`,
      body,
    }),
  };
}
