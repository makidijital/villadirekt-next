import "server-only";

import type { QueryResultRow } from "pg";

import { QueryBuilder } from "./query-builder";
import { nativeDbProvider, type DbRpcResult } from "./native-db.provider";

/* ===============================================================
   🛡️ NATIVE DB PROVIDER — from() + rpc() (server-only)
   ===============================================================
   eski sağlayıcı DbProvider'ının native PostgreSQL karşılığı. Repository'ler
   `db`/`dbAdmin` yerine bunu import ederek native yola geçer:
     from(table)  → QueryBuilder (mevcut repo method yüzeyi: select/eq/
                    order/insert/update/delete/single/maybeSingle/...)
     rpc(fn,args) → PostgreSQL fonksiyon çağrısı
   Repository public API'si DEĞİŞMEZ; yalnız execution native olur.

   ⚠️ `import "server-only"`: `pg` yalnız server. Client bundle'a sızarsa
     BUILD HATA. Bu yüzden YALNIZ server-only (client-erişimi olmayan)
     repository'ler bu provider'a geçirilir.

   ⚠️ Native'de anon/service-role ayrımı YOK (tek app rolü, RLS yok;
     yetki uygulama katmanında). `dbAdminNative` = `dbNative` (geçiş
     döneminde isim ayrımı korunur).
   =============================================================== */

export const dbNative = {
  from<T extends QueryResultRow = QueryResultRow>(
    table: string
  ): QueryBuilder<T> {
    return new QueryBuilder<T>(table);
  },
  rpc<T = unknown>(
    fn: string,
    args?: Record<string, unknown>
  ): Promise<DbRpcResult<T>> {
    return nativeDbProvider.rpc<T>(fn, args);
  },
};

/** Geçiş döneminde service-role isim ayrımı korunur (native'de tek rol). */
export const dbAdminNative = dbNative;
