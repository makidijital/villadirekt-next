import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (pilotlar PASS). insert (jsonb
   before_data/after_data → ::jsonb; diff_summary text[] → registry ile
   pg-literal) + count(exact)+range + delete({count}) parity hazır. Method
   yüzeyi + dönüş şekli aynen. Runtime testi yeşil olmadan production'a
   deploy edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ ADMIN ACTIVITY LOG — SERVER-ONLY REPOSITORY (service-role; write + admin read)
   ===============================================================
   `admin_activity_logs` INSERT'i RLS PHASE 2 (migration 038) sonrası
   service-role ile yapılır. `admin-activity-log.service.ts` içindeki
   inline `dbAdmin.from("admin_activity_logs").insert(...)`
   çağrısının BİREBİR taşınmış hali (Phase 1 repo consolidation).

   GÜVENLİK SINIRI (mail-log.repository.server.ts ile aynı konvansiyon):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` (service-role, service-role kimlik bilgisi) → RLS bypass.

   DAVRANIŞ:
     - INSERT payload shape DEĞİŞMEZ — sanitizeForAudit / boundJsonSize /
       slice / field mapping hepsi SERVICE'te kalır; bu repo yalnız
       hazır payload'ı insert eder.
     - native `{ data, error }` döner; throw YOK, log YOK
       (fail-safe try/catch + console.warn SERVICE'te).
=============================================================== */

export const adminActivityLogRepository = {
  async insert(payload: Record<string, unknown>) {
    return await dbAdmin.from("admin_activity_logs").insert(payload);
  },

  /* ---------------------------------------------------------------
     🛡️ ADMIN LIST (service-role) — /api/admin/activity-logs/list
     ---------------------------------------------------------------
     Filtreli listeleme + pagination. `select("*", { count: "exact" })`
     + created_at DESC + `.range(offset, offset+limit-1)`; opsiyonel
     filtreler (adminUserId/action/entityType/from/to) YALNIZ verilirse
     zincire eklenir → route'taki conditional chain BİREBİR. Param
     parse (parseIntSafe) + response assembly caller'da KALIR. Native
     `{ data, error, count }` döner. */
  async list(opts: {
    limit: number;
    offset: number;
    adminUserId?: string | null;
    action?: string | null;
    entityType?: string | null;
    from?: string | null;
    to?: string | null;
  }) {
    let q = dbAdmin
      .from("admin_activity_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(opts.offset, opts.offset + opts.limit - 1);

    if (opts.adminUserId) q = q.eq("admin_user_id", opts.adminUserId);
    if (opts.action) q = q.eq("action", opts.action);
    if (opts.entityType) q = q.eq("entity_type", opts.entityType);
    if (opts.from) q = q.gte("created_at", opts.from);
    if (opts.to) q = q.lte("created_at", opts.to);

    return await q;
  },

  /* ---------------------------------------------------------------
     🛡️ ADMIN CLEANUP DELETES (service-role) — /api/admin/activity-logs/cleanup
     ---------------------------------------------------------------
     `delete({ count: "exact" })` → silinen satır sayısını döndürür.
     Cutoff ISO string + mode kararı caller'da. mail-log cleanup ile
     aynı pattern. BYTE-IDENTICAL eski inline dbAdmin.from
     çağrıları. */

  /** "90d" mode — created_at < cutoff satırları sil (count exact). */
  async deleteOlderThan(cutoffISO: string) {
    return await dbAdmin
      .from("admin_activity_logs")
      .delete({ count: "exact" })
      .lt("created_at", cutoffISO);
  },

  /** "all" mode — kapsayıcı filter (PK NOT NULL → tüm satırlar match;
   *  SDK no-filter delete workaround). count exact. */
  async deleteAll() {
    return await dbAdmin
      .from("admin_activity_logs")
      .delete({ count: "exact" })
      .not("id", "is", null);
  },
};
