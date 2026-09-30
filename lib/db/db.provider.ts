/* ===============================================================
   🛡️ FAZ 1.1 — DB PROVIDER INTERFACE (THIN ABSTRACTION)
   ===============================================================
   AMAÇ:
     Repository pattern'inde tek seam. Repository'ler şu an
     `import { db } from "@/lib/db"` veya
     `import { dbAdmin } from "@/lib/db/server"`
     ile DOĞRUDAN DB client'ına bağlı. Bu interface
     yarın provider switch (Drizzle/raw pg/Prisma/...) yaparken
     repository tarafının değişmemesi için single insertion
     point sağlar.

   ⚠️ FAZ 1.1 BYTE-IDENTICAL:
     • Interface şu an DB client API yüzeyine yaslanmış
       (`from` / `rpc`). Repository'ler bu method'ları aynen
       QueryBuilder şeklinde chain edebilir.
     • Davranış birebir aynı; sadece IMPORT KAYNAĞI seam'in
       arkasına alındı.
     • Repository migration (FAZ 1.2) sonrası, REPO'lar artık
       `db`/`dbAdmin` yerine `db`/`dbAdmin` ile
       konuşacak; davranış yine aynı.
     • İleride (Drizzle/pg/Prisma vb.) bu interface portable
       shape'e tipler revize edilerek geçirilir — repository
       gövdeleri o aşamada güncellenir.

   PRIVILEGE BOUNDARY (kritik):
     • `DbProvider` interface'i hem anon hem service-role
       implementation'lar tarafından kullanılır; SHAPE aynı, ama
       runtime context farklı.
     • Anon (`dbNative` → `@/lib/db`): RLS uygulanır;
       client-safe; browser+server.
     • Service-role (`dbAdminNative` → `@/lib/db/server`):
       RLS bypass; `import "server-only"`; CLIENT bundle'a sızarsa
       BUILD HATA.

   SCOPE — FAZ 1.1 (intentionally minimal):
     • `from(table)`  — query builder (PostgrestQueryBuilder)
     • `rpc(name, args)` — PostgreSQL function call
     • Storage/Auth bu interface DIŞINDA (kendi provider'larında).
     • Transaction / raw SQL escape-hatch ileride eklenebilir.
   =============================================================== */

/** Repository layer tarafından kullanılan DB seam. Şu an eski sağlayıcı
 *  JS API yüzeyinden türetiliyor (FAZ 1.1 — byte-identical wrapper);
 *  portable shape sonraki cycle'da. */
export interface DbProvider {
  /** Tablo erişimi — query-builder chain'ini döner (native from()). */
  from: (table: string) => unknown;

  /** PostgreSQL function call (native rpc()). */
  rpc: (fn: string, args?: Record<string, unknown>) => unknown;
}
