import {
  emailLayout,
  emailHeading,
  emailParagraph,
  emailBadge,
  emailDivider,
  emailKeyValueRow,
} from "./email-shell";
import { formatDateTimeTr } from "@/lib/date-format";

export type TestEmailProps = {
  recipient: string;
  brandName?: string;
  brandLogoUrl?: string | null;
  sentAt?: Date;
};

export function renderTestEmail(props: TestEmailProps): {
  subject: string;
  html: string;
} {
  const brand = props.brandName || "Maki Dijital";
  const sentAt = props.sentAt || new Date();

  const body =
    `<div style="margin-bottom:14px;">${emailBadge(
      "Test Mail",
      "success"
    )}</div>` +
    emailHeading("Mail altyapısı çalışıyor 🚀") +
    emailParagraph(
      `Merhaba — bu mail <strong>${brand}</strong> admin paneli üzerinden gönderildi. Resend entegrasyonu ve template foundation'ı başarıyla yapılandırıldı.`
    ) +
    emailParagraph(
      `Production ortamında tüm rezervasyon mailleri bu altyapı üzerinden gönderilecek.`
    ) +
    emailDivider() +
    emailKeyValueRow("Alıcı", props.recipient) +
    emailKeyValueRow(
      "Gönderim",
      /* 🛡️ Central helper (manual UTC→Istanbul math, Intl-bypass-proof).
         lib/date-format.ts > formatDateTimeTr */
      formatDateTimeTr(sentAt.toISOString())
    ) +
    emailKeyValueRow("Sağlayıcı", "Resend");

  return {
    subject: `${brand} · Test Mail`,
    html: emailLayout({
      brandName: brand,
      brandLogoUrl: props.brandLogoUrl ?? null,
      preheader: `${brand} mail altyapısı test mesajı`,
      body,
    }),
  };
}
