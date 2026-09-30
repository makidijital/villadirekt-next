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
   🔥 RESERVATION REQUEST EMAIL
   ===============================================================
   - Snapshot mantığı: değerler rezervasyon kaydından gelir
     (canlı kur / canlı fiyat KULLANILMAZ)
   - Maki Dijital branding
   - Premium concierge tonu
   =============================================================== */

export type ReservationRequestProps = {
  brandName?: string;
  brandLogoUrl?: string | null;

  // META
  createdAtDisplay: string; // örn "8 May 2026, 14:32"
  status?: string; // pending / confirmed / rejected
  villaTitle: string;

  // 🔥 DB-üretilen rezervasyon kodu (REZ-2026-0042). NULL ise satır gizli.
  reservationNo?: string | null;

  // STAY
  startDate: string; // "8 Tem 2026"
  endDate: string; // "15 Tem 2026"
  nights: number; // 7
  guestsTotal: number; // 4

  // FINANCIAL (snapshot, formatlanmış string)
  totalDisplay: string; // "₺48.000" veya "€2.400"
  totalTryDisplay?: string | null; // dövizliyse TRY karşılığı
  paidDisplay?: string | null; // ödenen
  remainingDisplay?: string | null; // kalan
  paymentMethodName?: string | null;

  // 🔥 PAYMENT PREFERENCE (helper'dan beslenir)
  paymentPreferenceLabel?: string | null; // "Ön Ödeme" / "Tüm Ödeme"
  payNowDisplay?: string | null; // helper'dan: şimdi ödenecek tutar

  // 🔥 DAMAGE DEPOSIT — informational; accounting'e dahil değil
  // Boş/0 ise template satır render etmez.
  damageDepositDisplay?: string | null;

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
};

function statusBadge(status?: string) {
  switch ((status || "").toLowerCase()) {
    case "confirmed":
      return emailBadge("Onaylandı", "success");
    case "rejected":
      return emailBadge("Reddedildi", "danger");
    case "pending":
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

export function renderReservationRequestEmail(
  props: ReservationRequestProps
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

  // 🔥 Müşteriye sadece TRY tutarı gösterilir.
  // Villanın orijinal döviz fiyatı (GBP/EUR/USD) maile yazılmaz —
  // route foreign rezervasyonlarda totalTryDisplay'i TRY karşılığı
  // olarak hazırlıyor; burada onu öncelikli kullanıyoruz.
  // TRY-only rezervasyonlarda totalDisplay zaten "₺X" formatında
  // (route formatTRY üretiyor), o yüzden fallback güvenli.
  const totalRow = emailKeyValueRow(
    "Toplam",
    props.totalTryDisplay || props.totalDisplay
  );

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
  ]);

  const financialCard = detailCard("Ödeme", [
    totalRow,
    props.paymentPreferenceLabel
      ? emailKeyValueRow("Ödeme Tercihi", props.paymentPreferenceLabel)
      : "",
    props.payNowDisplay
      ? emailKeyValueRow("Şimdi Ödenecek Tutar", props.payNowDisplay)
      : "",
    props.paidDisplay
      ? emailKeyValueRow("Ödenen", props.paidDisplay)
      : "",
    props.remainingDisplay
      ? emailKeyValueRow("Kalan", props.remainingDisplay)
      : "",
    props.paymentMethodName
      ? emailKeyValueRow("Ödeme yöntemi", props.paymentMethodName)
      : "",
  ]);

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
      "Yeni Talep",
      "info"
    )} ${statusBadge(props.status)}</div>` +
    emailHeading(`Merhaba ${escapeHtml(props.guestName)},`) +
    emailParagraph(
      `<strong>${escapeHtml(
        props.villaTitle
      )}</strong> için rezervasyon talebiniz alındı. Aşağıda talebinizin tüm detayları yer alıyor. Ekibimiz en kısa sürede sizinle iletişime geçecek.`
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
    customerCard +
    emailDivider() +
    emailParagraph(
      `Talebiniz onaylandığında ödeme bilgileri ile birlikte tekrar bilgilendirileceksiniz. Sorularınız için bu maile yanıtlamanız yeterli.`
    );

  return {
    subject: `${brand} · Rezervasyon talebiniz alındı — ${props.villaTitle}`,
    html: emailLayout({
      brandName: brand,
      brandLogoUrl: props.brandLogoUrl ?? null,
      preheader: `${props.villaTitle} için talebiniz alındı (${props.startDate} → ${props.endDate})`,
      body,
    }),
  };
}
