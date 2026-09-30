import "server-only";

/* 🛡️ Migration AUD-P5A — service-role eski sağlayıcı provider (`@/lib/db/server`)
   yerine native privileged provider (`dbAdminNative`). İkisi de RLS-bypass;
   insert byte-identical. `dbAdmin` alias korunur → insert() gövdesi + kolonlar
   + jsonb alanları + try/catch best-effort DEĞİŞMEDİ. jsonb parity: native
   query-compiler plain-object → `JSON.stringify(...)::jsonb` (before_data/
   after_data/metadata aynen jsonb persist). */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

import type { AdminAuditEntry } from "./admin-gateway.types";

/* ===============================================================
   🛡️ FAZ 41 — ADMIN AUDIT REPOSITORY
   ===============================================================
   `admin_audit_logs` tablo INSERT — service-role client (RLS bypass).
   Best-effort: INSERT fail olsa bile caller akışı bozulmaz.

   ⚠️ KESIN KURAL:
     - Best-effort: try/catch boundary; throw YOK.
     - Console tag (`[admin_audit.insert] FAILED`) emit edilir;
       caller'a result envelope YOK (fire-forget).
     - Tablo henüz oluşturulmadıysa migration sonrası aktif olur;
       bu cycle table SQL'i scope dışı (DB ops).
=============================================================== */

export const adminAuditRepository = {
  /** Best-effort insert; fail throw etmez. */
  async insert(entry: AdminAuditEntry): Promise<void> {
    try {
      const { error } = await dbAdmin.from("admin_audit_logs").insert({
        admin_user_id: entry.admin_user_id ?? null,
        action: entry.action,
        entity_type: entry.entity_type ?? null,
        entity_id: entry.entity_id ?? null,
        before_data: entry.before_data ?? null,
        after_data: entry.after_data ?? null,
        metadata: entry.metadata ?? null,
        ip: entry.ip ?? null,
        user_agent: entry.user_agent ?? null,
      });
      if (error) {
        console.error("[admin_audit.insert] FAILED", error.message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.error("[admin_audit.insert] EXCEPTION", msg);
    }
  },
};
