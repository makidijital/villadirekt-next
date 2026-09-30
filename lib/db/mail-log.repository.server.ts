import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (pilotlar PASS). insert/count-head/
   maybeSingle/delete({count}) parity hazır; method yüzeyi + dönüş şekli
   aynen. Runtime testi yeşil olmadan production'a deploy edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ MAIL LOG — SERVER-ONLY REPOSITORY (service-role; write + admin read)
   ===============================================================
   `mail_logs` tablosu RLS PHASE 2 (migration 038) sonrası admin-only:
   anon ve normal authenticated INSERT REDDEDILIR. mail_logs INSERT'i
   PUBLIC mail flow'larından (auth YOK: reservation-request / -approved /
   -cancelled) tetiklendiği için bu yazımlar SERVICE ROLE ile yapılmak
   zorunda — service_role RLS'i bypass eder.

   GÜVENLİK SINIRI (lib/payment-account.server.ts ile aynı konvansiyon):
     • `import "server-only"` — bu dosya CLIENT bundle'a sızarsa Next.js
       BUILD HATA verir. Net defansif guard.
     • `dbAdmin` service-role kimlik bilgisi okur (NEXT_PUBLIC_
       prefix YOK) → yalnız server runtime. Client bundle'da expose YOK.

   NEDEN AYRI DOSYA (read repo'dan ayrıştırma):
     `lib/db/mail-log.repository.ts` READ (findRecent) için anon client
     kullanır ve admin `system-logs` CLIENT component'inden import edilir.
     Service-role insert'i aynı dosyaya koymak dbAdmin import'unu
     client bundle'a sokardı (attack surface). Split → write yalnız bu
     server dosyasında.

   CALLER:
     • app/services/mail-log.write.server.ts → insertMailLog (server)
       └─ app/lib/mail/send.ts (mail pipeline, route handler'lardan)

   DAVRANIŞ:
     - INSERT payload shape DEĞİŞMEZ (caller mapping aynen).
     - native `{ data, error }` döner; throw YOK, log YOK
       (üst katman insertMailLog console tag + boolean döner).
=============================================================== */

export const mailLogServerRepository = {
  async insert(payload: Record<string, unknown>) {
    return await dbAdmin.from("mail_logs").insert(payload);
  },

  /* ---------------------------------------------------------------
     🛡️ ADMIN STATS READS (service-role) — /api/admin/mail-logs/stats
     ---------------------------------------------------------------
     mail_logs admin-only RLS (mig 038) → anon SELECT boş döner; admin
     stats kartı service-role ile sayar/okur. `head: true, count:
     "exact"` gövde döndürmez; native `{ count, error }` caller'da
     kullanılır. BYTE-IDENTICAL eski inline dbAdmin.from
     çağrıları. */

  /** Count — tüm satırlar (head:true, count exact; gövde gelmez). */
  async countAll() {
    return await dbAdmin
      .from("mail_logs")
      .select("id", { count: "exact", head: true });
  },

  /** Count — status filtreli (head:true, count exact). */
  async countByStatus(status: string) {
    return await dbAdmin
      .from("mail_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
  },

  /** Latest created_at — tek satır (order desc, limit 1, maybeSingle). */
  async findLatestCreatedAt() {
    return await dbAdmin
      .from("mail_logs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  },

  /* ---------------------------------------------------------------
     🛡️ ADMIN CLEANUP DELETES (service-role) — /api/admin/mail-logs/cleanup
     ---------------------------------------------------------------
     `delete({ count: "exact" })` → silinen satır sayısını döndürür
     (native `{ count, error }`). Cutoff ISO string + mode kararı
     caller'da. BYTE-IDENTICAL eski inline dbAdmin.from
     çağrıları. */

  /** "30d" mode — created_at < cutoff satırları sil (count exact). */
  async deleteOlderThan(cutoffISO: string) {
    return await dbAdmin
      .from("mail_logs")
      .delete({ count: "exact" })
      .lt("created_at", cutoffISO);
  },

  /** "all" mode — kapsayıcı filter (PK NOT NULL → tüm satırlar match;
   *  SDK no-filter delete'i reddettiği için resmi eski sağlayıcı-js
   *  workaround). Net etki TRUNCATE ile aynı; count exact. */
  async deleteAll() {
    return await dbAdmin
      .from("mail_logs")
      .delete({ count: "exact" })
      .not("id", "is", null);
  },
};
