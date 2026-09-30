/* ===============================================================
   🛡️ FAZ 1.1 — DB BARREL (CLIENT-SAFE)
   ===============================================================
   Tek import path: `import { db } from "@/lib/db"`.

   ⚠️ BU BARREL CLIENT-SAFE — server-only chain (dbAdmin)
   içermez. Hem CLIENT hem SERVER tüketicileri tarafından sorunsuz
   import edilebilir. RLS uygulanır (anon context).

   PRIVILEGE BOUNDARY:
     - `db` (BU BARREL) — anon client; browser + server. RLS aktif.
     - `dbAdmin` — `@/lib/db/server` barrel'ından import edilir.
       `import "server-only"` ile korunur; client bundle'a sızarsa
       BUILD HATA. RLS bypass (service-role).

   Provider seçimi tek noktada — gelecekte eski sağlayıcı yerine Drizzle/
   Prisma/raw pg eklenirse burada switch:
     export const db: DbProvider = isDrizzleEnabled
       ? drizzleDbProvider
       : dbNative;

   FAZ 1.1 SCOPE:
     • Sadece foundation: interface + eski sağlayıcı implementation + barrel.
     • Repository migration FAZ 1.2'de (her repo per-PR).
     • Mevcut repository'ler hâlâ `@/lib/db` / `@/lib/db/server`
       kullanıyor; davranış değişmedi.
   =============================================================== */

export type { DbProvider } from "./db.provider";
