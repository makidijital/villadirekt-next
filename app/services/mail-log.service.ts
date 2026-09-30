import { mailLogRepository } from "@/lib/db/mail-log.repository";

/* ===============================================================
   🔥 MAIL LOGS (READ + type — client-safe)
   ===============================================================
   Tablo: mail_logs
   Kolonlar:
   - id
   - reservation_id (nullable — test/non-reservation mail için null)
   - mail_type (örn: "test", "reservation_request", ...)
   - recipient (text)
   - subject (text)
   - status ("sent" | "failed")
   - provider ("resend")
   - error_message (text, nullable)
   - created_at (timestamp)

   ⚠️ insertMailLog ARTIK BURADA DEĞİL. mail_logs INSERT'i RLS PHASE 2
   (migration 038) sonrası yalnız service-role ile server-side yapılır:
     → app/services/mail-log.write.server.ts (insertMailLog, "server-only")
   Bu dosya admin `system-logs` CLIENT component'inden import edildiği için
   service-role'e BAĞLANMAZ; yalnız READ (listMailLogs) + type barındırır.
   =============================================================== */

export type MailLog = {
  id?: string;
  reservation_id?: string | null;
  mail_type: string;
  recipient: string;
  subject: string;
  status: "sent" | "failed";
  provider: string;
  error_message?: string | null;
  created_at?: string;
};

export async function listMailLogs(limit = 50) {
  /* FAZ 40: mailLogRepository.findRecent delege. */
  const { data, error } = await mailLogRepository.findRecent(limit);

  if (error) {
    console.error("❌ listMailLogs:", error.message);
    return [];
  }

  return data || [];
}
