import "server-only";

import { Pool, type PoolConfig } from "pg";

import { registerPgTypeParsers } from "./pg-type-parsers";

/* ===============================================================
   🛡️ NATIVE POSTGRESQL — CONNECTION POOL (server-only)
   ===============================================================
   AMAÇ:
     PostgreSQL'e DOĞRUDAN bağlantı (tek sürücü: pg). Tek `pg.Pool`
     singleton; tüm veri erişimi buradan geçer. Tek app rolü
     (bağlantı string'indeki kullanıcı); RLS yok.

   ⚠️ `import "server-only"`:
     `pg` yalnız Node runtime'ında çalışır (browser'da yok). Bu modül
     client bundle'a sızarsa BUILD HATA. Native DB erişimi yalnız
     server (route handler / server component / *.server modülleri).

   ⚠️ LAZY INIT (build/SSR güvenli):
     Pool ilk `getPgPool()` çağrısında kurulur. `DATABASE_URL` eksikse
     YALNIZ çağrı anında throw eder; modül import'u throw ETMEZ →
     build ve import grafiği güvenli (s3StorageProvider ile aynı desen).

   ENV (server-only, runtime):
     DATABASE_URL            postgres://user:pass@host:5432/dbname
     PGSSLMODE               "require" | "verify-full" | (boş = SSL yok)
     PG_POOL_MAX             (default 10)
     PG_IDLE_TIMEOUT_MS      (default 30000)
     PG_CONNECT_TIMEOUT_MS   (default 10000)
   =============================================================== */

/* ⚠️ HMR-SAFE SINGLETON — `pool` modül-değişkeni Next.js dev'de her hot
   reload'da SIFIRLANIR → her reload yeni `Pool` (yeni bağlantı seti) açar
   → eski sağlayıcı Session Pooler'ın client limiti dolar ("max clients reached
   in session mode" / EMAXCONNSESSION). Bu yüzden Pool referansı `globalThis`
   üzerinde tutulur: HMR modülü yeniden yükleyince bile AYNI Pool kullanılır.
   Production'da modül tek kez yüklenir → davranış aynı (tek singleton). */
const globalForPg = globalThis as typeof globalThis & {
  __yazVillamPgPool?: Pool;
};

function resolveSsl(): PoolConfig["ssl"] {
  const mode = (process.env.PGSSLMODE || "").trim().toLowerCase();
  if (mode === "require") return { rejectUnauthorized: false };
  if (mode === "verify-full" || mode === "verify-ca") {
    return { rejectUnauthorized: true };
  }
  return undefined;
}

function buildConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL tanımlı değil — native PostgreSQL bağlantısı için zorunlu (server-only)."
    );
  }
  return {
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30_000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10_000),
    ssl: resolveSsl(),
    /* DETERMİNİSTİK search_path — query-compiler tabloları ŞEMASIZ
       ("villa_locations") üretir; PostgREST/eski sağlayıcı `public` şemasında
       çalışır. Pooler kullanıcısının default search_path'ine bağlı
       kalmadan `public` sabitlenir → şemasız çözümleme eski sağlayıcı ile
       BİREBİR. (Tüm tablo + RPC fonksiyonları public'te.) */
    options: "-c search_path=public",
  };
}

/**
 * Lazy singleton `pg.Pool`. İlk çağrıda kurulur, sonrası cached.
 * Idle client hataları process'i düşürmesin diye pool 'error'
 * event'i yakalanır (loglanır, yeni bağlantı havuzdan alınır).
 */
export function getPgPool(): Pool {
  if (globalForPg.__yazVillamPgPool) return globalForPg.__yazVillamPgPool;
  /* PostgREST/DB clientON-shape parity: numeric→number, tarih/zaman
     tipleri → string (Date DEĞİL). Pool kurulmadan ÖNCE register. */
  registerPgTypeParsers();
  const created = new Pool(buildConfig());
  created.on("error", (err: Error) => {
    console.error("[pg.pool] idle client error", err);
  });
  globalForPg.__yazVillamPgPool = created;
  return created;
}

/**
 * Pool'u kapat (graceful shutdown / test teardown). Tekrar
 * `getPgPool()` çağrılırsa yeni pool kurulur.
 */
export async function closePgPool(): Promise<void> {
  const current = globalForPg.__yazVillamPgPool;
  if (!current) return;
  globalForPg.__yazVillamPgPool = undefined;
  await current.end();
}
