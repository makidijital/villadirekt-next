import {
  emailLayout,
  emailHeading,
  emailParagraph,
  emailBadge,
  emailDivider,
  emailKeyValueRow,
  escapeHtml,
} from "./email-shell";
import { getCountryLabel } from "@/lib/country.helper";

/* ===============================================================
   🔥 RESERVATION CANCELLED EMAIL
   ===============================================================
   - Snapshot only (canlı kur/fiyat YOK)
   - Nazik, profesyonel, saygılı ton
   - Maki Dijital branding
   =============================================================== */

export type ReservationCancelledProps = {
  brandName?: string;
  brandLogoUrl?: string | null;

  // META
  createdAtDisplay: string;
  status?: string;
  villaTitle: string;

  // 🔥 DB-üretilen rezervasyon kodu (REZ-2026-0042). NULL ise satır gizli.
  reservationNo?: string | null;

  // STAY
  startDate: string;
  endDate: string;
  nights: number;
  guestsTotal: number;

  // FINANCIAL (snapshot)
  totalDisplay: string;
  totalTryDisplay?: string | null;
  paidDisplay?: string | null;
  remainingDisplay?: string | null;
  paymentMethodName?: string | null;

  // 🔥 PAYMENT PREFERENCE
  paymentPreferenceLabel?: string | null;
  payNowDisplay?: string | null;

  // CUSTOMER
  guestName: string;
  identityNumber?: string | null;
  phone?: string | null;
  /** 🛡️ İkinci telefon — eski rezervasyonlarda null → satır BASILMAZ. */
  phone2?: string | null;
  email?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  otherGuestNames?: string[];
  note?: string | null;

  // OPSIYONEL
  reason?: string | null;
};

function statusBadge(status?: string) {
  switch ((status || "").toLowerCase()) {
    case "confirmed":
      return emailBadge("Onaylandı", "success");
    case "rejected":
    case "cancelled":
      return emailBadge("İptal", "danger");
    default:
      return emailBadge("Beklemede", "warning");
  }
}

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

export function renderReservationCancelledEmail(
  props: ReservationCancelledProps
): { subject: string; html: string } {
  const brand = props.brandName || "Maki Dijital";

  const otherGuestsBlock =
    props.otherGuestNames && props.otherGuestNames.length
      ? emailKeyValueRow(
        "Diğer misafirler",
        props.otherGuestNames
          .filter((n) => (n || "").trim().length)
          .join(", ") || "—"
      )
      : "";

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
    emailKeyValueRow("Misafir sayısı", `${props.guestsTotal} kişi`),
    emailKeyValueRow("Oluşturma tarihi", props.createdAtDisplay),
    props.reason ? emailKeyValueRow("Sebep", props.reason) : "",
  ]);

  // 🔥 Cancelled mail — ödeme kartı tamamen gösterilmez
  // (Toplam / Ödeme Tercihi / Şimdi Ödenecek / Ödenen / Kalan /
  //  Ödeme Yöntemi alanlarının hiçbiri müşteriye iletilmez.)
  const financialCard = "";

  const customerCard = detailCard("Müşteri Bilgileri", [
    emailKeyValueRow("Ad Soyad", props.guestName),
    props.identityNumber
      ? emailKeyValueRow("TC / Pasaport", props.identityNumber)
      : "",
    props.phone ? emailKeyValueRow("Telefon", props.phone) : "",
    props.phone2 ? emailKeyValueRow("Telefon 2", props.phone2) : "",
    props.email ? emailKeyValueRow("E-posta", props.email) : "",
    /* 🌍 Display override: TR ISO → "Türkiye". Snapshot/payload
       aynen ISO code akar; sadece kullanıcıya görünen text dönüşür. */
    props.country
      ? emailKeyValueRow("Ülke", getCountryLabel(props.country))
      : "",
    props.city ? emailKeyValueRow("Şehir", props.city) : "",
    props.address ? emailKeyValueRow("Adres", props.address) : "",
    otherGuestsBlock,
    props.note ? emailKeyValueRow("Not", props.note) : "",
  ]);

  const body =
    `<div style="margin-bottom:14px;display:flex;gap:8px;">${emailBadge(
      "İptal",
      "danger"
    )} ${statusBadge(props.status)}</div>` +
    emailHeading(`Rezervasyonunuz iptal edildi`) +
    emailParagraph(
      `Sayın ${escapeHtml(
        props.guestName
      )}, <strong>${escapeHtml(
        props.villaTitle
      )}</strong> için olan rezervasyon talebiniz maalesef bu kez gerçekleşemedi. Bilginiz için detaylar aşağıda yer alıyor.`
    ) +
    stayCard +
    financialCard +
    customerCard +
    emailDivider() +
    emailParagraph(
      `Yaşanan değişiklik için anlayışınıza teşekkür ederiz. İlerideki tarihler için yeni bir rezervasyon talebi oluşturmak isterseniz size en uygun seçenekleri sunmaktan mutluluk duyarız — bu maile yanıtlamanız yeterli.`
    );

  return {
    subject: `${brand} · Rezervasyon iptal bildirimi — ${props.villaTitle}`,
    html: emailLayout({
      brandName: brand,
      brandLogoUrl: props.brandLogoUrl ?? null,
      preheader: `${props.villaTitle} rezervasyonu iptal edildi (${props.startDate} → ${props.endDate})`,
      body,
    }),
  };
}
