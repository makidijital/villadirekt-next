import "server-only";

import type { QueryResultRow } from "pg";

import { getPgPool } from "./pg.client";
import { getRpcReturnKind, isJsonbRpcArg } from "./rpc-metadata";

/* ===============================================================
   🛡️ POSTGRESQL DB PROVIDER (server-only)
   ===============================================================
   PostgreSQL veri erişim implementasyonu (tek sürücü: pg). Builder
   emülasyonu YOK, embed motoru YOK, ORM YOK — tek yol: parametreli
   ham SQL + fonksiyon çağrısı (RPC).

   KONTRAT:
     query          → çok satır; `{ data: rows, error }`
     queryOne       → tam 1 satır (0 veya >1 → error)
     queryMaybeOne  → 0 veya 1 satır (0 → data:null, >1 → error)
     rpc            → PostgreSQL fonksiyonu çağırır
                      (`SELECT * FROM fn(key => $n, ...)`).

   ⚠️ SONUÇ ZARFI: `{ data, error }` — kararlı sözleşme. Provider
     THROW ETMEZ; hatayı `error` alanına koyar.

   ⚠️ `import "server-only"`: `pg` yalnız server. Client bundle'a
     sızarsa BUILD HATA.

   ⚠️ TEK ROL — RLS YOK:
     Tek app rolüyle konuşur; ayrı yetki-rolü ayrımı ve RLS burada
     YOKTUR. Yetkilendirme uygulama katmanında yapılır — bu provider'ın
     sorumluluğu değil.
   =============================================================== */

/** DB hata zarfı. Standart PostgreSQL hata alanları (`code` = SQLSTATE,
 *  `details` = pg `detail`, `hint`) `Error`'a eklenir → caller'lar
 *  (ör. `error.code === "23505"`) değişmeden çalışır. */
export type DbError = Error & {
  code?: string;
  details?: string | null;
  hint?: string | null;
};

/** Çok-satır sonuç zarfı `{ data, error }`. `count` yalnız sayım
 *  istendiğinde, `status` diagnostic amaçlı doldurulur. */
export type DbResult<T> = {
  data: T[] | null;
  error: DbError | null;
  count?: number | null;
  status?: number;
};

/** Tek-satır sonuç zarfı. `.maybeSingle()` semantiği: 0 satır →
 *  `{ data: null, error: null }` GEÇERLİDİR (yokluk hata değildir).
 *  Bu yüzden `data` ile `error` bağımsız nullable'dır. */
export type DbSingleResult<T> = {
  data: T | null;
  error: DbError | null;
  status?: number;
};

/** Tek-satır KESİN sonuç zarfı (`queryOne` / `.single()`): satır ya
 *  VARDIR (`data: T`, `error: null`) ya da HATA döner (`data: null`,
 *  `error`). 0 veya >1 satır burada hatadır (yokluk tolere edilmez).
 *  Discriminated union olduğundan `error` guard'ından sonra `data`
 *  non-null'a DARALIR — bu, tek-satır sorgusunun doğal değişmezidir
 *  (vendor-bağımsız `Result<T, E>` modeli; PostgREST/eski sağlayıcı alanı YOK). */
export type DbEnforcedSingleResult<T> =
  | { data: T; error: null; status?: number }
  | { data: null; error: DbError; status?: number };

/** RPC sonuç zarfı — eski sağlayıcı `.rpc()` parity'si. `data` fonksiyonun
 *  RETURNS türüne göre şekillenir (scalar→değer, setof→dizi,
 *  table→satır dizisi, void→null); satır-dizisi DEĞİL. `T` çağıranın
 *  beklediği tam dönüş tipidir (ör. `boolean`, `string[]`, `Row[]`). */
export type DbRpcResult<T> = {
  data: T | null;
  error: DbError | null;
  status?: number;
};

/** DB seam kontratı — veri erişim yüzeyi. */
export interface NativeDbProvider {
  /** Parametreli ham SQL → çok satır. */
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<DbResult<T>>;

  /** Tam 1 satır bekler (0 veya >1 → error). Discriminated union:
   *  error yoksa `data` non-null garantidir. */
  queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<DbEnforcedSingleResult<T>>;

  /** 0 veya 1 satır (0 → data:null; >1 → error). */
  queryMaybeOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<DbSingleResult<T>>;

  /** PostgreSQL fonksiyon çağrısı (named-arg). Sonuç, fonksiyonun
   *  RETURNS türüne göre eski sağlayıcı `.rpc()` ile aynı şekle sokulur
   *  (scalar→değer, setof→dizi, table→satır dizisi, void→null). */
  rpc<T = unknown>(
    fn: string,
    args?: Record<string, unknown>
  ): Promise<DbRpcResult<T>>;

  /** Statement'ı çalıştırır, ETKİLENEN satır sayısını döndürür
   *  (DELETE/UPDATE sayımı; RETURNING gerektirmez). */
  affectedCount(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<{ count: number | null; error: Error | null }>;
}

/* SQL identifier guard — fonksiyon/argüman adları koddan gelen sabitler,
   yine de defensive: yalnız [A-Za-z_][A-Za-z0-9_]* kabul edilir
   (parametreler zaten $n ile parametrelenir; identifier'lar quote
   edilemeyeceği için doğrulanır). */
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** pg hatasını `DbError`'a çevirir: PostgreSQL `code`/`detail`/`hint`
 *  alanlarını (varsa) `code`/`details`/`hint` olarak yüzeye taşır. */
function toError(err: unknown): DbError {
  const base = err instanceof Error ? err : new Error(String(err));
  const pg = base as { code?: string; detail?: string; hint?: string };
  const dbErr = base as DbError;
  dbErr.code = pg.code;
  dbErr.details = pg.detail ?? null;
  dbErr.hint = pg.hint ?? null;
  return dbErr;
}

/** eski sağlayıcı `.single()` PARITY: 0 veya >1 satırda PostgREST `PGRST116`
 *  hatası döndürür (`error.code === "PGRST116"`, sabit mesaj). Tüketiciler
 *  (pages/blog/settings/reservation) bu koda/branch'e bağlı → native
 *  `queryOne` de birebir aynı zarfı üretir. */
function pgrst116(details: string): DbError {
  const err = new Error(
    "JSON object requested, multiple (or no) rows returned"
  ) as DbError;
  err.code = "PGRST116";
  err.details = details;
  err.hint = null;
  return err;
}

/** Plain JS objesi mi (jsonb arg adayı; dizi/Date/null hariç). */
function isPlainObjectArg(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

/** RPC ham satırlarını fonksiyonun RETURNS türüne göre eski sağlayıcı
 *  `.rpc()` şekline sokar (rpc-metadata registry'sinden):
 *    void       → null
 *    scalar     → tek satır/tek kolon değeri (yoksa null)
 *    scalar_set → her satırın tek kolonu → değer dizisi
 *    table      → ham satır dizisi (değişmeden)
 *  `SELECT * FROM fn()` scalar fonksiyonlarda kolon adını fonksiyondan
 *  alır; kolon adına bağlı kalmamak için ilk kolonun DEĞERİ okunur. */
function shapeRpcResult<T>(fn: string, rows: QueryResultRow[]): T | null {
  switch (getRpcReturnKind(fn)) {
    case "void":
      return null;
    case "scalar":
      return (rows.length > 0
        ? (Object.values(rows[0])[0] as T)
        : null) as T | null;
    case "scalar_set":
      return rows.map((r) => Object.values(r)[0]) as unknown as T;
    case "table":
    default:
      return rows as unknown as T;
  }
}

async function runQuery<T extends QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>
): Promise<DbResult<T>> {
  try {
    const result = await getPgPool().query<T>(
      text,
      params ? (params as unknown[]) : undefined
    );
    return { data: result.rows, error: null };
  } catch (err) {
    return { data: null, error: toError(err) };
  }
}

export const nativeDbProvider: NativeDbProvider = {
  query: runQuery,

  async queryOne<T extends QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<DbEnforcedSingleResult<T>> {
    const { data, error } = await runQuery<T>(text, params);
    if (error) return { data: null, error };
    const rows = data ?? [];
    if (rows.length === 0) {
      return { data: null, error: pgrst116("The result contains 0 rows") };
    }
    if (rows.length > 1) {
      return {
        data: null,
        error: pgrst116(`The result contains ${rows.length} rows`),
      };
    }
    return { data: rows[0], error: null };
  },

  async queryMaybeOne<T extends QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<DbSingleResult<T>> {
    const { data, error } = await runQuery<T>(text, params);
    if (error) return { data: null, error };
    const rows = data ?? [];
    if (rows.length === 0) return { data: null, error: null };
    if (rows.length > 1) {
      return {
        data: null,
        error: new Error(`queryMaybeOne: birden fazla satır (${rows.length})`),
      };
    }
    return { data: rows[0], error: null };
  },

  async rpc<T = unknown>(
    fn: string,
    args?: Record<string, unknown>
  ): Promise<DbRpcResult<T>> {
    if (!IDENT_RE.test(fn)) {
      return { data: null, error: toError(new Error(`rpc: geçersiz fonksiyon adı "${fn}"`)) };
    }
    const entries = Object.entries(args ?? {});
    const params: unknown[] = [];
    const named: string[] = [];
    for (const [key, value] of entries) {
      if (!IDENT_RE.test(key)) {
        return { data: null, error: toError(new Error(`rpc: geçersiz argüman adı "${key}"`)) };
      }
      /* jsonb argüman parity: `jsonb` tipli arg'a JS dizisi/objesi
         geçilirse node-pg array-literal üretir → "invalid input syntax
         for type json". Registry'deki jsonb arg (veya plain obje) →
         JSON.stringify + `::jsonb`. uuid[]/text[] arg'lar (registry'de
         DEĞİL) → ham (node-pg array-literal, doğru). */
      if (
        value !== null &&
        value !== undefined &&
        (isJsonbRpcArg(fn, key) || isPlainObjectArg(value))
      ) {
        params.push(JSON.stringify(value));
        named.push(`${key} => $${params.length}::jsonb`);
      } else {
        params.push(value);
        named.push(`${key} => $${params.length}`);
      }
    }
    const text = `SELECT * FROM ${fn}(${named.join(", ")})`;
    const { data: rows, error } = await runQuery(text, params);
    if (error) return { data: null, error };
    /* eski sağlayıcı `.rpc()` PARITY: fonksiyonun RETURNS türüne göre şekil.
       scalar→değer, setof→dizi, table→satır dizisi, void→null. */
    return { data: shapeRpcResult<T>(fn, rows ?? []), error: null };
  },

  async affectedCount(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<{ count: number | null; error: Error | null }> {
    try {
      const result = await getPgPool().query(
        text,
        params ? (params as unknown[]) : undefined
      );
      return { count: result.rowCount, error: null };
    } catch (err) {
      return { count: null, error: toError(err) };
    }
  },
};

/** DB provider (tek app rolü). */
export const dbNative = nativeDbProvider;
