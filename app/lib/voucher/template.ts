import type { VoucherProps } from "./data";
import { getCountryLabel } from "@/lib/country.helper";

/* ===============================================================
   🔥 VOUCHER DOCUMENT TEMPLATE — premium, print-friendly
   ===============================================================
   - Tamamen ayrı UI; mail email-shell'inden BAĞIMSIZ
   - Print-ready CSS (A4, color-adjust exact)
   - Modern tipografi + bölümleme
   - Aynı helper-driven data ile beslenir (data.ts)

   ReservationApprovedEmail HTML'i HACK'LENMEZ; bu bağımsız
   bir voucher dokümanıdır. Hem PDF (browser print) hem mail
   attachment için aynı render kullanılır.

   ⚠️ LAYOUT NOTU:
     Label/value satırları HTML `<table>` ile render edilir
     (display:flex YERİNE). Browser print engine'leri (Chrome,
     Safari, Firefox; mobil dahil) en garantili biçimde table
     layout'unu PDF'e döker. Flex bazı engine'lerde print mode'da
     wrap/align davranışı bozularak değerin label'a yapışmasına
     yol açıyordu (kullanıcı raporu: "VillaVilla In Love",
     "Toplam₺38.000"). Table layout bu davranışı kökten çözer.
   =============================================================== */

function escapeHtml(text: string | number | null | undefined): string {
  return ((text ?? "") + "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Tek satır = `<tr>`; iki `<td>` → label / value.
   Print-safe; flexbox-render farklılıklarından bağımsız. */
function rowHtml(label: string, value: string, strong = false): string {
  return `<tr class="row">
    <td class="row-label">${escapeHtml(label)}</td>
    <td class="row-value${strong ? " strong" : ""}">${escapeHtml(value)}</td>
  </tr>`;
}

function sectionHtml(title: string, rows: string[]): string {
  const filtered = rows.filter((r) => r && r.length > 0);
  if (filtered.length === 0) return "";
  return `<section class="section">
    <p class="section-title">${escapeHtml(title)}</p>
    <table class="rows"><tbody>${filtered.join("")}</tbody></table>
  </section>`;
}

export function renderVoucherDocument(
  props: VoucherProps
): { subject: string; html: string } {
  const stayRows = [
    rowHtml("Villa", props.villaTitle, true),
    rowHtml(
      "Tarih Aralığı",
      `${props.startDate} — ${props.endDate}`
    ),
    rowHtml("Konaklama Süresi", `${props.nights} gece`),
    rowHtml("Misafir Sayısı", `${props.guestsTotal} kişi`),
  ];

  const customerRows = [
    rowHtml("Ad Soyad", props.guestName, true),
    props.identityNumber
      ? rowHtml("TC / Pasaport", props.identityNumber)
      : "",
    props.phone ? rowHtml("Telefon", props.phone) : "",
    props.phone2 ? rowHtml("Telefon 2", props.phone2) : "",
    props.email ? rowHtml("E-posta", props.email) : "",
    /* 🌍 Display override: TR ISO → "Türkiye". Voucher PDF/print
       output; underlying snapshot data (props.country) aynen ISO
       code'la beslenir, sadece görünen text dönüşür. */
    props.country ? rowHtml("Ülke", getCountryLabel(props.country)) : "",
    props.city ? rowHtml("Şehir", props.city) : "",
    props.address ? rowHtml("Adres", props.address) : "",
    props.otherGuestNames.length > 0
      ? rowHtml(
          "Diğer Misafirler",
          props.otherGuestNames
            .filter((n) => (n || "").trim().length)
            .join(", ") || "—"
        )
      : "",
    props.note ? rowHtml("Not", props.note) : "",
  ];

  // 🔥 PDF rezervasyon belgesi olarak çalışır → "Şimdi Ödenecek
  //    Tutar" kaldırıldı (yalnız mail / admin tarafında geçerli).
  //    payNowDisplay prop'u korunuyor (data layer dokunulmadı,
  //    helper-driven değer gerekirse ileride render edilebilir).
  const paymentRows = [
    rowHtml("Toplam", props.totalDisplay, true),
    rowHtml("Ödeme Tercihi", props.paymentPreferenceLabel),
    props.paidDisplay ? rowHtml("Ödenen", props.paidDisplay) : "",
    rowHtml("Kalan", props.remainingDisplay),
    props.paymentMethodName
      ? rowHtml("Ödeme Yöntemi", props.paymentMethodName)
      : "",
  ];

  const subject = `${props.brandName} · Rezervasyon Belgesi — ${props.villaTitle}`;
  const subjectEscaped = escapeHtml(subject);

  /* 🔥 LOGO BLOĞU — yalnız brandLogoUrl varsa render. Yoksa hiçbir
     placeholder / "M" avatarı gösterilmez. img alt = brandName,
     boyutlar max-height ile sabit; print engine'inde object-fit
     contain ile aspect ratio korunur. */
  const logoBlock = props.brandLogoUrl
    ? `<img class="brand-logo" src="${escapeHtml(
        props.brandLogoUrl
      )}" alt="${escapeHtml(props.brandName)}" />`
    : "";

  const html = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>${subjectEscaped}</title>
    <style>
      @page { size: A4; margin: 16mm 14mm; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: #f6f7f9;
        color: #0f172a;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .doc {
        max-width: 760px;
        margin: 32px auto;
        padding: 36px 40px 32px;
        background: #ffffff;
        border: 1px solid rgba(15,23,42,0.08);
        border-radius: 18px;
        box-shadow: 0 1px 2px rgba(15,23,42,0.04);
      }

      /* ===== HEADER — 2 kolon: brand (sol) + stamp (sağ) ===== */
      .header {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 22px;
      }
      .header td {
        padding: 0 0 18px;
        border-bottom: 1px solid rgba(15,23,42,0.08);
        vertical-align: top;
      }
      .header .brand-cell { text-align: left; }
      .header .stamp-cell { text-align: right; width: 42%; }

      .brand-logo {
        display: block;
        max-height: 44px;
        max-width: 200px;
        width: auto;
        height: auto;
        object-fit: contain;
        margin-bottom: 10px;
      }
      .brand-text-name {
        font-size: 16px;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: #0f172a;
        line-height: 1.2;
      }
      .brand-text-sub {
        font-size: 10px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: #94a3b8;
        margin-top: 4px;
      }

      .stamp-label {
        font-size: 10px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: #94a3b8;
      }
      .stamp-value {
        font-size: 13px;
        font-weight: 700;
        color: #0f172a;
        margin-top: 4px;
        font-variant-numeric: tabular-nums;
        word-break: break-all;
      }
      .stamp-meta {
        font-size: 11px;
        color: #94a3b8;
        margin-top: 6px;
      }

      .title-eyebrow {
        font-size: 11px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: #06b6d4;
        font-weight: 700;
      }
      .title {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: #0f172a;
        margin: 6px 0 4px;
        line-height: 1.15;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      .lede {
        font-size: 14px;
        color: #475569;
        line-height: 1.6;
        margin: 0 0 26px;
      }

      /* ===== SECTIONS ===== */
      .section { margin: 0 0 26px; }
      .section-title {
        font-size: 11px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        font-weight: 700;
        color: #475569;
        padding-bottom: 10px;
        margin: 0 0 8px;
        border-bottom: 1px solid rgba(15,23,42,0.08);
      }

      /* ===== ROWS (print-safe table layout) ===== */
      .rows {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .rows .row td {
        padding: 11px 0;
        vertical-align: top;
        border-top: 1px dashed rgba(15,23,42,0.06);
      }
      .rows tr:first-child td { border-top: 0; }
      .row-label {
        width: 38%;
        padding-right: 16px !important;
        font-size: 11.5px;
        font-weight: 500;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        line-height: 1.5;
        word-break: break-word;
      }
      .row-value {
        font-size: 14px;
        color: #0f172a;
        font-weight: 600;
        text-align: right;
        font-variant-numeric: tabular-nums;
        line-height: 1.5;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      .row-value.strong {
        font-weight: 800;
        font-size: 15px;
      }

      .footer {
        margin-top: 32px;
        padding-top: 18px;
        border-top: 1px solid rgba(15,23,42,0.08);
        font-size: 11.5px;
        color: #94a3b8;
        line-height: 1.6;
      }
      @media print {
        body { background: #ffffff; }
        .doc {
          margin: 0;
          padding: 0 6mm;
          border: none;
          border-radius: 0;
          box-shadow: none;
          max-width: none;
        }
        .section { page-break-inside: avoid; }
        .rows .row { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <article class="doc">
      <table class="header"><tbody><tr>
        <td class="brand-cell">
          ${logoBlock}
          <div class="brand-text-name">${escapeHtml(props.brandName)}</div>
          <div class="brand-text-sub">Rezervasyon Belgesi</div>
        </td>
        <td class="stamp-cell">
          <div class="stamp-label">Rezervasyon Kodu</div>
          <div class="stamp-value">${escapeHtml(props.voucherNo)}</div>
          <div class="stamp-meta">Oluşturma: ${escapeHtml(
            props.createdAtDisplay
          )}</div>
        </td>
      </tr></tbody></table>

      <p class="title-eyebrow">Onaylanmış Rezervasyon</p>
      <h1 class="title">${escapeHtml(props.villaTitle)}</h1>
      <p class="lede">
        Sayın <strong>${escapeHtml(
          props.guestName
        )}</strong>, konaklamanız onaylanmıştır. Bu belge, rezervasyonunuzun resmi teyididir; check-in sırasında yanınızda bulundurmanız önerilir.
      </p>

      ${sectionHtml("Konaklama", stayRows)}
      ${sectionHtml("Ödeme Özeti", paymentRows)}
      ${
        props.damageDepositDisplay
          ? sectionHtml("Hasar Depozitosu", [
              rowHtml("Tutar", props.damageDepositDisplay, true),
              rowHtml(
                "Açıklama",
                "Hasar olmadığı takdirde iade edilir"
              ),
            ])
          : ""
      }
      ${sectionHtml("Misafir Bilgileri", customerRows)}

      <footer class="footer">
        Bu belge ${escapeHtml(
          props.brandName
        )} tarafından oluşturulmuştur. Sorularınız için bu maile yanıtlamanız yeterli.
      </footer>
    </article>
  </body>
</html>`;

  return { subject, html };
}
