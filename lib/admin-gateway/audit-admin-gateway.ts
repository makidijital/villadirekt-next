import "server-only";

import type { AdminGateway } from "./admin-gateway.provider";
import type {
  AdminAuditAction,
  AdminGatewayContext,
} from "./admin-gateway.types";
import { adminAuditRepository } from "./audit.repository";

/* ===============================================================
   🛡️ ADMIN GATEWAY — AUDIT IMPLEMENTATION
   ===============================================================
   `AdminGateway` kontratının tek implementasyonu. Yalnız `audit`
   yüzeyi vardır; yazma native `adminAuditRepository` üzerinden
   PostgreSQL'e gider.

   Audit best-effort / fire-forget: caller `void adminGateway.audit(...)`
   ile çağırır, audit hatası ana akışı ASLA bozmaz.
=============================================================== */

export const adminGatewayImpl: AdminGateway = {
  async audit(action, payload) {
    /* Best-effort fire-forget; caller `void adminGateway.audit(...)`
       pattern'i ile bloklamaz. Audit fail asla ana akışı bozmaz.

       IMPLICIT ADMIN CONTEXT:
         Caller `context.adminUserId` vermediyse gateway'in kendisi
         `getCurrentAdmin()` ile lookup yapar. Bu sayede service
         signature'ları DEĞIŞMEZ; caller migration sıfır.
         Lookup fail → admin_user_id null (audit kaydı yine düşer). */
    let adminUserId: string | null =
      payload.context?.adminUserId ?? null;
    if (
      adminUserId === null &&
      payload.context?.adminUserId === undefined
    ) {
      try {
        const { getCurrentAdmin } = await import("@/lib/admin-auth");
        const admin = await getCurrentAdmin();
        adminUserId = admin?.id ?? null;
      } catch {
        adminUserId = null;
      }
    }

    await adminAuditRepository.insert({
      admin_user_id: adminUserId,
      action,
      entity_type: payload.entityType ?? null,
      entity_id: payload.entityId ?? null,
      before_data: payload.before ?? null,
      after_data: payload.after ?? null,
      metadata: payload.metadata ?? null,
      ip: payload.context?.ip ?? null,
      user_agent: payload.context?.userAgent ?? null,
    });
  },
};

/* Kullanım örneği (caller'da fire-forget audit):

   import { adminGateway } from "@/lib/admin-gateway/server";

   // Audit fire-forget (await yok, caller akışını bloklamaz):
   void adminGateway.audit("villa.visibility_toggle", {
     context: { adminUserId, ip, userAgent },
     entityType: "villa",
     entityId: id,
     after: { is_active: true },
   });
*/

export { adminAuditRepository };
export type { AdminAuditAction, AdminGatewayContext };
