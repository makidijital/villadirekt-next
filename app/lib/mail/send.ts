/* ===============================================================
   🔥 SEND MAIL (high-level wrapper)
   ===============================================================
   - Settings'ten config çeker
   - Resend REST üzerinden gönderir
   - Sonucu mail_logs tablosuna yazar
   - DEBUG: tüm checkpoint'ler [mail] prefix ile loglanır
   =============================================================== */

import {
  formatFrom,
  getMailConfig,
  resendSend,
  type ResendResult,
} from "./client";
import { insertMailLog } from "@/app/services/mail-log.write.server";

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromNameOverride?: string;
  fromOverride?: string;
  mailType: string;
  reservationId?: string | null;
  replyTo?: string | string[];
};

export type SendMailResult = ResendResult & {
  recipient: string;
  subject: string;
};

export async function sendMail(
  input: SendMailInput
): Promise<SendMailResult> {
  console.log("[mail] sendMail invoked", {
    to: input.to,
    subject: input.subject,
    mailType: input.mailType,
    reservationId: input.reservationId ?? null,
  });

  const cfg = await getMailConfig();
  const { apiKey, from, fromName } = cfg;

  const fromAddress = (input.fromOverride || from || "").trim();
  const fromDisplayName = (input.fromNameOverride || fromName || "").trim();
  const fromHeader = formatFrom(fromDisplayName, fromAddress);

  const recipient = (input.to || "").trim();
  const subject = (input.subject || "").trim();

  // 🔥 API key veya temel veriler eksikse log + erken çıkış
  if (!apiKey || !fromAddress || !recipient || !subject) {
    const errorMsg = !apiKey
      ? "Resend API key yok (settings.resend_api_key veya RESEND_API_KEY env)"
      : !fromAddress
        ? "Mail from adresi tanımlı değil"
        : !recipient
          ? "Alıcı boş"
          : "Konu boş";

    console.error("[mail] precheck failed:", errorMsg);

    await insertMailLog({
      reservation_id: input.reservationId ?? null,
      mail_type: input.mailType,
      recipient: recipient || "",
      subject: subject || "",
      status: "failed",
      provider: "resend",
      error_message: errorMsg,
    });

    return {
      ok: false,
      error: errorMsg,
      recipient,
      subject,
    };
  }

  const result = await resendSend(apiKey, {
    from: fromHeader,
    to: recipient,
    subject,
    html: input.html,
    text: input.text,
    reply_to: input.replyTo,
  });

  console.log("[mail] sendMail result", {
    ok: result.ok,
    id: result.id,
    status: result.status,
    error: result.error,
  });

  const logged = await insertMailLog({
    reservation_id: input.reservationId ?? null,
    mail_type: input.mailType,
    recipient,
    subject,
    status: result.ok ? "sent" : "failed",
    provider: "resend",
    error_message: result.ok ? null : result.error || null,
  });

  console.log("[mail] mail_logs write", { logged });

  return { ...result, recipient, subject };
}
