import type {
  AdminAuditAction,
  AdminGatewayContext,
} from "./admin-gateway.types";

/* ===============================================================
   🛡️ FAZ 41 — ADMIN GATEWAY INTERFACE
   ===============================================================
   Service-role privileged audit boundary. Tüketici modüller
   `dbAdmin` import etmez; gateway üzerinden geçer.
   Audit log fire-forget.

   ⚠️ GW-P2 CLEANUP:
     Ölü generic CRUD verb'leri (insertRow/updateRow/deleteRow/findRows)
     + `runRaw` escape hatch interface'ten KALDIRILDI (0 tüketici, GW-P1).
     Interface artık yalnız `audit` kontratını taşır.

   ⚠️ KESIN KURAL:
     - `audit(action, entry)` fire-forget; caller await etmez.
     - Throw mesajları / console tag'leri / Result envelope CALLER'da kalır.
=============================================================== */

export interface AdminGateway {
  /** Audit log entry — fire-forget; throw etmez, await edilebilir
   *  ama mevcut caller akışına dahil edilmez (best-effort). */
  audit(
    action: AdminAuditAction | string,
    payload: {
      context?: AdminGatewayContext;
      entityType?: string | null;
      entityId?: string | null;
      before?: Record<string, unknown> | null;
      after?: Record<string, unknown> | null;
      metadata?: Record<string, unknown> | null;
    }
  ): Promise<void>;
}
