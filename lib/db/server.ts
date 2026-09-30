import "server-only";

/* ===============================================================
   🛡️ FAZ 1.1 — DB SERVER BARREL (SERVER-ONLY)
   ===============================================================
   Tek import path: `import { dbAdmin } from "@/lib/db/server"`.

   ⚠️ SERVER-ONLY (`import "server-only"`):
     Bu barrel CLIENT bundle'a sızarsa BUILD HATA. Implementation
     `./eski sağlayıcı-db.server` içinde de `import "server-only"` korumalı.
     `dbAdmin` `dbAdmin` arkasındadır — RLS bypass.

   KULLANIM (yalnız server-side modüller):
     - `*.repository.server.ts` dosyaları
     - Route handler'lar (`app/api/.../route.ts`)
     - Server-only services (`*.server.ts`, `import "server-only"` olanlar)
     - AdminGateway (`lib/admin-gateway/*`)

   ⚠️ PRIVILEGE BOUNDARY:
     `dbAdmin` RLS'i atlar — tüm tabloları görür. Çağıran kod
     `authorizeAdminCaller` veya `adminGateway` arkasında olmalı.

   Provider seçimi tek noktada — gelecekte farklı service-role
   client eklenirse burada switch.
   =============================================================== */

export type { DbProvider } from "./db.provider";
