import "server-only";

/* ===============================================================
   🛡️ FAZ 41 — ADMIN GATEWAY SERVER BARREL (SERVER-ONLY)
   ===============================================================
   Tek import path: `import { adminGateway } from "@/lib/admin-gateway/server"`.

   ⚠️ SERVER-ONLY (`import "server-only"`):
     Bu barrel CLIENT bundle'a sızarsa BUILD HATA. Implementation
     `./audit-admin-gateway` ve `./audit.repository` de
     `import "server-only"` korumalı.

   KULLANIM (yalnız server-side modüller):
     - Route handler'lar (app/api/.../route.ts)
     - Server-only services (`*.server.ts` veya `import "server-only"`
       olan service'ler)
     - Server actions

   ⚠️ PRIVILEGE BOUNDARY:
     Yetkilendirme uygulama katmanındadır; çağıran kod
     `authorizeAdminCaller` arkasında olmalı.

   Implementation seçimi tek noktada — gelecekte farklı bir gateway
   eklenirse burada switch.
   =============================================================== */

import { adminGatewayImpl } from "./audit-admin-gateway";

export { adminAuditRepository } from "./audit.repository";

/** Aktif admin gateway (SERVER-ONLY). */
export const adminGateway = adminGatewayImpl;
