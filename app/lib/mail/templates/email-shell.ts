/* ===============================================================
   🔥 EMAIL LAYOUT — shared HTML shell (inline-styled, client-safe)
   ===============================================================
   - Gmail / Outlook / Apple Mail uyumlu inline CSS
   - Maki Dijital branding: cyan/blue/green gradient + slate dark
   - "React Email" pattern: küçük helper fonksiyonlar component gibi
   =============================================================== */

export type LayoutProps = {
  brandName?: string;
  /* 🔥 Firma logosu — settings.site_logo public URL'i. Yoksa null →
     header logo bloğunu render ETMEZ; placeholder/M avatarı
     KESİNLİKLE GÖSTERİLMEZ. PDF voucher ile aynı kaynak. */
  brandLogoUrl?: string | null;
  preheader?: string; // inbox preview text
  body: string; // ham HTML (component'lerden gelir)
};

export function escapeHtml(text: string): string {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function emailLayout({
  brandName = "Maki Dijital",
  brandLogoUrl = null,
  preheader = "",
  body,
}: LayoutProps): string {
  const safePreheader = escapeHtml(preheader);
  const safeBrand = escapeHtml(brandName);

  /* 🔥 LOGO BLOĞU — Outlook + Gmail mobil + Apple Mail safe:
       - `display:block` → Outlook image gap fix
       - `border:0; outline:none; text-decoration:none` → MSO/AOL fix
       - `max-height:60px` → kullanıcı kuralı (tutarlı boyut)
       - `width:auto; height:auto` → aspect ratio korunur
       - `max-width:240px` → ultra geniş logoları taşmasın
       - `alt={brand}` → görsel yüklenmediğinde firma adı görünür
     brandLogoUrl yoksa BLOK YOK (kullanıcı kuralı: placeholder
     KULLANMA; sadece firma adı göster). */
  const logoBlock = brandLogoUrl
    ? `<img src="${escapeHtml(brandLogoUrl)}" alt="${safeBrand}" style="display:block;border:0;outline:none;text-decoration:none;max-height:60px;height:auto;width:auto;max-width:240px;margin:0 0 12px;" />`
    : "";

  return `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>${safeBrand}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
    <!-- preheader (gizli) -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#f6f7f9;">
      ${safePreheader}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid rgba(15,23,42,0.08);border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
            <!-- HEADER — dikey düzen: logo (varsa) + firma adı + altyazı.
                 Eski "M" placeholder avatarı + "Admin · CRM" altyazısı
                 kaldırıldı (müşteri mailinde uygunsuz). Logo yoksa sadece
                 firma adı + "Rezervasyon Sistemi" altyazısı render olur. -->
            <tr>
              <td style="padding:24px 28px 20px;border-bottom:1px solid rgba(15,23,42,0.06);">
                ${logoBlock}
                <div style="font-size:16px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;line-height:1.2;">${safeBrand}</div>
                <div style="font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#94a3b8;margin-top:4px;">Rezervasyon Sistemi</div>
              </td>
            </tr>

            <!-- BODY -->
            <tr>
              <td style="padding:28px;">
                ${body}
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="padding:18px 28px;background:#fafafa;border-top:1px solid rgba(15,23,42,0.06);">
                <p style="margin:0;font-size:11.5px;color:#94a3b8;line-height:1.5;">
                  Bu e-posta ${safeBrand} sistemi tarafından otomatik gönderildi.
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;">
            © ${new Date().getFullYear()} ${safeBrand}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/* ---------------------------------------------
   Reusable inline components (helper fonksiyonlar)
---------------------------------------------- */
export function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;letter-spacing:-0.02em;font-weight:700;color:#0f172a;">${escapeHtml(
    text
  )}</h1>`;
}

export function emailParagraph(text: string): string {
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#334155;">${text}</p>`;
}

export function emailDivider(): string {
  return `<div style="height:1px;background:rgba(15,23,42,0.08);margin:20px 0;"></div>`;
}

export function emailKeyValueRow(label: string, value: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0;">
    <tr>
      <td style="font-size:12px;color:#64748b;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;padding-right:12px;width:38%;">${escapeHtml(
        label
      )}</td>
      <td style="font-size:14px;color:#0f172a;font-weight:500;">${escapeHtml(
        value
      )}</td>
    </tr>
  </table>`;
}

export function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 4px;">
    <tr>
      <td style="border-radius:10px;background:#0f172a;">
        <a href="${href}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:-0.01em;">${escapeHtml(
          label
        )}</a>
      </td>
    </tr>
  </table>`;
}

export function emailBadge(
  text: string,
  variant: "neutral" | "success" | "warning" | "danger" | "info" = "info"
): string {
  const styles: Record<string, string> = {
    neutral: "background:#f6f7f9;color:#475569;border:1px solid rgba(15,23,42,0.08);",
    success: "background:#ecfaf2;color:#176b46;border:1px solid #c8eed7;",
    warning: "background:#fff8eb;color:#92560a;border:1px solid #fde7bf;",
    danger: "background:#fdeef0;color:#9a2a36;border:1px solid #f4cfd5;",
    info: "background:#ecfeff;color:#0e7490;border:1px solid #a5f3fc;",
  };
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:0;${styles[variant]}">${escapeHtml(
    text
  )}</span>`;
}
