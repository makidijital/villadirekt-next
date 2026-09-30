/* ===============================================================
   🛡️ FAZ 41 — ADMIN GATEWAY BARREL (CLIENT-SAFE: TYPES ONLY)
   ===============================================================
   Tek import: `import type { ... } from "@/lib/admin-gateway"`.

   ⚠️ BU BARREL CLIENT-SAFE — yalnız TIP export'ları (runtime YOK).
   Runtime gateway (`adminGateway`, `adminAuditRepository`)
   `@/lib/admin-gateway/server` barrel'ından gelir; `import "server-only"`
   ile korumalı, client bundle'a sızarsa BUILD HATA.

   PRIVILEGE BOUNDARY:
     - Bu barrel — tip seviyesinde import; hem client hem server
       kullanabilir. Runtime hiçbir şey içermez.
     - `@/lib/admin-gateway/server` — service-role runtime; SADECE
       server-only modüllerden import.

   FAZ 41 → FAZ 2 transition:
     Önceden `@/lib/admin-gateway` barrel'ı RUNTIME export ederdi
     (adminGateway + adminAuditRepository); audit.repository
     server-only olduğu için tüm tüketiciler transitively server-only
     oldu. Server-side service'ler (reservation/status, vb.) artık
     `@/lib/admin-gateway/server`'dan runtime alır; bu barrel sadece
     tip yüzeyini açar (provider-agnostic kontrat).
   =============================================================== */

export type { AdminGateway } from "./admin-gateway.provider";
export type {
  AdminAuditAction,
  AdminAuditEntry,
  AdminGatewayContext,
} from "./admin-gateway.types";
