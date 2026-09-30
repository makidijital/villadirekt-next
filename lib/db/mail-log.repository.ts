import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 3 — anon repo) — client-sever sonrası native
   provider'a alındı. Admin okuma artık system-logs/system-logs.action ("use
   server") üzerinden. eski sağlayıcı importu tamamen kaldırıldı. `server-only`
   defansif sınır. Method yüzeyi + SQL davranışı AYNEN. */
import { dbNative as db } from "@/lib/db/native";
import type { MailLog } from "@/app/services/mail-log.service";

/* ===============================================================
   🛡️ MAIL LOG REPOSITORY (READ-ONLY, native)
   ===============================================================
   `mail_logs` tablosu — mail audit paginated read.

   ⚠️ READ yalnız: List = created_at DESC + limit. `db` = native provider
   (`dbNative`); tek app rolü → RLS/session-DI YOK. Admin `system-logs`
   ekranı server action üzerinden okur.

   ⚠️ INSERT BURADA YOK (migration 038 sonrası anon yazma RLS ile
   reddedilir). mail_logs INSERT'i SERVICE-ROLE ile server-only yapılır:
     → lib/db/mail-log.repository.server.ts (mailLogServerRepository.insert)
     → app/services/mail-log.write.server.ts (insertMailLog)
=============================================================== */

export const mailLogRepository = {
  async findRecent(limit: number) {
    /* Native `.from<T>()` — tüketici (system-logs page) `MailLog[]`
       bekliyor; cast'siz tip-parity için satır tipi burada (SQL `select *`
       aynen). `import type` → erased, runtime cycle yok. */
    return await db
      .from<MailLog & { [k: string]: unknown }>("mail_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
  },
};
