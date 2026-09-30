"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  listMailLogs as listMailLogsService,
  type MailLog,
} from "@/app/services/mail-log.service";

/* ===============================================================
   🛡️ MAIL LOGS — SERVER ACTION (thin wrapper)
   ===============================================================
   Admin `system-logs/page.tsx` (client) → bu server action →
   `mail-log.service` (server) → native repo (READ-only).

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmza +
     dönüş tipi service ile BİREBİR (davranış değişmez); amaç yalnız
     client→server sınırını oluşturup native repo'yu client bundle'a
     sızdırmamak.
   =============================================================== */

export async function listMailLogsAction(limit = 50): Promise<MailLog[]> {
  await requirePermission("system_logs");
  return listMailLogsService(limit);
}
