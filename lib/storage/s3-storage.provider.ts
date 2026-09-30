import "server-only";

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

import type { StorageProvider } from "./storage.provider";
import type {
  StorageRemoveResult,
  StorageUploadOptions,
  StorageUploadResult,
} from "./storage.types";
import { resolveCdnPublicUrl } from "./cdn.config";

/* ===============================================================
   🛡️ S3-COMPATIBLE STORAGE PROVIDER (server-only) — CLOUDFLARE R2
   ===============================================================
   AMAÇ:
     Storage WRITE/REMOVE katmanı (R2; aynı S3 API B2/MinIO/Hetzner
     ile de uyumlu). YALNIZ server tarafında kullanılır. Secret
     (`S3_SECRET_ACCESS_KEY`) NEXT_PUBLIC DEĞİL → client bundle'a
     sızmaz; `import "server-only"` ile build-time guard.

   ⚠️ BAĞLANTI (TEK YOL):
     - Server remove: `lib/storage/server.ts > removeServer` bu
       provider'ı DOĞRUDAN çağırır (hardDelete cleanup).
     - Browser upload/remove: barrel (index.ts) →
       `/api/admin/storage/{upload,remove}` route → bu provider.

   ⚠️ LAZY INIT:
     S3Client yalnız ilk gerçek upload/remove çağrısında kurulur
     (getClient). Env eksikse YALNIZ çağrı anında throw eder; modül
     yüklenmesi (import) throw ETMEZ → build/SSR güvenli.

   ENV (server-only, runtime):
     S3_ENDPOINT           (R2: https://<acct>.r2.cloudflarestorage.com)
     S3_REGION             (R2: "auto")
     S3_ACCESS_KEY_ID
     S3_SECRET_ACCESS_KEY

   ⚠️ DAVRANIŞ:
     remove → bulk + 3 attempt + exponential backoff (200ms/400ms) +
              idempotent ("not found" / eksik key success sayılır).
     upload → result envelope; throw etmez.
   =============================================================== */

const REMOVE_MAX_ATTEMPTS = 3;
const REMOVE_BASE_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;

  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || "auto";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint) {
    throw new Error("S3_ENDPOINT env değişkeni tanımlı değil (server-only)");
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY env değişkenleri tanımlı değil (server-only)"
    );
  }

  cachedClient = new S3Client({
    region,
    endpoint,
    /* R2 + custom endpoint → path-style en güvenli. */
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

/* Body'yi S3 SDK'nın güvenle kabul ettiği Uint8Array'e normalize et.
   Interface body tipi: Blob | ArrayBuffer | Uint8Array. */
async function toUint8Array(
  body: Blob | ArrayBuffer | Uint8Array
): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  /* Blob (veya arrayBuffer() destekleyen herhangi bir nesne). */
  const ab = await (body as Blob).arrayBuffer();
  return new Uint8Array(ab);
}

export const s3StorageProvider: StorageProvider = {
  /* ===============================================================
     UPLOAD — tek obje PUT
     ===============================================================
     ⚠️ upsert NOTU: S3 PUT default overwrite'tır (= upsert:true).
     `upsert:false` (galeri) için S3'te native fail-if-exists yok;
     galeri path'leri rand4 suffix taşıdığından collision ~1/65536 →
     overwrite-on-collision kabul edilebilir (audit'te MEDIUM olarak
     işaretliydi). ContentType + CacheControl iletilir.
  =============================================================== */
  async upload(
    bucket: string,
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    options?: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    try {
      const client = getClient();
      const Body = await toUint8Array(body);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: path,
          Body,
          ContentType: options?.contentType,
          CacheControl: options?.cacheControl,
        })
      );
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "S3 upload hatası";
      return { ok: false, error: msg };
    }
  },

  /* ===============================================================
     REMOVE — bulk delete + retry + idempotent
     ===============================================================
     S3 DeleteObjects eksik key'de hata vermez (idempotent). Kısmi
     hata `res.Errors` ile gelir; başarısız key'ler retry edilir.
  =============================================================== */
  async remove(
    bucket: string,
    paths: string[]
  ): Promise<StorageRemoveResult> {
    if (!paths || paths.length === 0) {
      return { ok: true, failed: [], attempts: 0 };
    }
    const uniquePaths = Array.from(
      new Set(
        paths.filter((p) => typeof p === "string" && p.trim().length > 0)
      )
    );
    if (uniquePaths.length === 0) {
      return { ok: true, failed: [], attempts: 0 };
    }

    let pending = uniquePaths;
    let attempt = 0;
    let lastErrorMsg = "";

    while (attempt < REMOVE_MAX_ATTEMPTS && pending.length > 0) {
      attempt++;
      try {
        const client = getClient();
        const res = await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: pending.map((Key) => ({ Key })),
              Quiet: true,
            },
          })
        );
        const errors = res.Errors ?? [];
        if (errors.length === 0) {
          return { ok: true, failed: [], attempts: attempt };
        }
        /* Yalnız hatalı key'leri tekrar dene. */
        pending = errors
          .map((e) => e.Key)
          .filter((k): k is string => typeof k === "string");
        lastErrorMsg =
          errors[0]?.Message || errors[0]?.Code || "S3 delete partial fail";
      } catch (err) {
        lastErrorMsg = err instanceof Error ? err.message : "S3 delete hatası";
      }
      if (attempt < REMOVE_MAX_ATTEMPTS && pending.length > 0) {
        await sleep(REMOVE_BASE_DELAY_MS * Math.pow(2, attempt - 1));
      }
    }

    if (pending.length === 0) {
      return { ok: true, failed: [], attempts: attempt };
    }

    console.error("[storage.s3.remove] FAILED_AFTER_RETRY", {
      bucket,
      paths: pending,
      attempts: attempt,
      lastError: lastErrorMsg,
    });
    return { ok: false, failed: pending, attempts: attempt };
  },

  /* ===============================================================
     PUBLIC URL — read CDN (Faz B) ile aynı formül
     ===============================================================
     Bu provider read için birincil değil (barrel getPublicUrl CDN
     base'inden üretir); yine de interface bütünlüğü için aynı CDN
     base'e delege eder. CDN base yoksa null döner.
  =============================================================== */
  getPublicUrl(bucket: string, path: string): string | null {
    return resolveCdnPublicUrl(bucket, path);
  },
};

/* ===============================================================
   🛡️ HEAD — nesnenin güncel ETag'i (salt okuma, server-only)
   ===============================================================
   Görsel URL versiyonlaması için (lib/storage/site-asset-version
   .server.ts). Nesne İÇERİĞİ değişince ETag değişir, değişmezse
   aynı kalır → `?v=` yalnız görsel değişince değişir.
     - Nesne yok (404/NotFound) → null
     - Diğer hatalar (ağ, env eksik) → THROW (çağıran cache'lemesin)
   Upload/remove davranışına DOKUNMAZ.
   =============================================================== */
export async function headObjectEtag(
  bucket: string,
  key: string
): Promise<string | null> {
  try {
    const res = await getClient().send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );
    return res.ETag ?? null;
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}
