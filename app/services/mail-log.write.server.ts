import "server-only";

import { mailLogServerRepository } from "@/lib/db/mail-log.repository.server";
import type { MailLog } from "@/app/services/mail-log.service";

/* ===============================================================
   🛡️ MAIL LOG — SERVER-ONLY WRITE (service-role)
   ===============================================================
   insertMailLog'un service-role karşılığı. RLS PHASE 2 (migration 038)
   sonrası mail_logs admin-only; INSERT yalnız service-role ile (RLS
   bypass) yapılır. Davranış eski mail-log.service.insertMailLog ile
   BİREBİR aynı:
     - payload alan sırası aynen (reservation_id, mail_type, recipient,
       subject, status, provider("resend" default), error_message),
     - hata → console.error("❌ insertMailLog:", ...) + false,
     - başarı → true.

   GÜVENLİK SINIRI:
     • `import "server-only"` — client bundle'a sızarsa build HATA.
     • mailLogServerRepository → dbAdmin (service-role).

   CALLER:
     • app/lib/mail/send.ts (mail pipeline; public + admin mail
       route'larından server-side çağrılır).
   =============================================================== */

export async function insertMailLog(log: MailLog): Promise<boolean> {
  const { error } = await mailLogServerRepository.insert({
    reservation_id: log.reservation_id ?? null,
    mail_type: log.mail_type,
    recipient: log.recipient,
    subject: log.subject,
    status: log.status,
    provider: log.provider || "resend",
    error_message: log.error_message ?? null,
  });

  if (error) {
    console.error("❌ insertMailLog:", error.message);
    return false;
  }

  return true;
}
