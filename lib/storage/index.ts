/* ===============================================================
   🛡️ STORAGE BARREL — TEK PROVIDER: CLOUDFLARE R2
   ===============================================================
   Tek import path: `import { storageProvider, STORAGE_BUCKETS }
   from "@/lib/storage"`.

   TEK KOD YOLU — FALLBACK YOK:
     - upload / remove : browser → `/api/admin/storage/{upload,remove}`
       route'una gider; route server tarafında `s3StorageProvider`
       (R2) çağırır. (S3 secret'ı server-only kalır.)
     - getPublicUrl    : bucket başına CDN base'inden absolute R2 URL
       üretir (senkron, pure). Client + server (SSR) aynı sonucu verir.

   ⚠️ Bu barrel CLIENT-SAFE'tir; `s3StorageProvider` (server-only)
     BURADAN import EDİLMEZ — R2 yazımı yalnız server route üzerinden.
     Server bağlamındaki doğrudan R2 remove (hardDelete cleanup) için
     `lib/storage/server.ts > removeServer` kullanılır.
   =============================================================== */

import { resolveCdnPublicUrl } from "./cdn.config";
import type { StorageProvider } from "./storage.provider";
import type {
  StorageUploadOptions,
  StorageUploadResult,
  StorageRemoveResult,
} from "./storage.types";

export { STORAGE_BUCKETS } from "./storage.constants";
export type { StorageBucket } from "./storage.constants";

export type {
  StorageProvider,
} from "./storage.provider";
export type {
  StorageUploadOptions,
  StorageRemoveResult,
  StorageUploadResult,
} from "./storage.types";

/* 🛡️ Read Layer host eşleme — remove yolunda parseVillaStorageUrl
   CDN host'undan bucket türetir (villa-image.helpers tüketir). */
export { bucketFromCdnHost } from "./cdn.config";

/* ===============================================================
   R2 WRITE — route-backed (browser → API → s3StorageProvider)
   ===============================================================
   adminFetch Bearer ekler; FormData → /api/admin/storage/upload,
   JSON → /api/admin/storage/remove. Sonuç envelope byte-identical
   (StorageUploadResult / StorageRemoveResult). adminFetch dinamik
   import (statik import grafiği browser-only kalsın; server bundle
   etkilenmez). */
async function routeUpload(
  bucket: string,
  path: string,
  body: Blob | ArrayBuffer | Uint8Array,
  options?: StorageUploadOptions
): Promise<StorageUploadResult> {
  try {
    const { adminFetch } = await import("@/lib/admin-fetch");
    /* Blob → doğrudan; ArrayBuffer/Uint8Array → Blob'a sar. Cast yalnız
       tip (BlobPart generic strict'i); runtime'da ikisi de geçerli. */
    const blob =
      body instanceof Blob
        ? body
        : new Blob([body as unknown as BlobPart]);
    const form = new FormData();
    form.append("file", blob);
    form.append("bucket", bucket);
    form.append("path", path);
    if (options?.contentType) form.append("contentType", options.contentType);
    if (options?.cacheControl) form.append("cacheControl", options.cacheControl);
    form.append("upsert", String(options?.upsert ?? false));
    const res = await adminFetch("/api/admin/storage/upload", {
      method: "POST",
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "upload route error",
    };
  }
}

async function routeRemove(
  bucket: string,
  paths: string[]
): Promise<StorageRemoveResult> {
  try {
    const { adminFetch } = await import("@/lib/admin-fetch");
    const res = await adminFetch("/api/admin/storage/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket, paths }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      failed?: string[];
      attempts?: number;
    };
    if (!res.ok) {
      return { ok: false, failed: paths, attempts: json.attempts ?? 0 };
    }
    return {
      ok: json.ok ?? false,
      failed: json.failed ?? [],
      attempts: json.attempts ?? 0,
    };
  } catch {
    return { ok: false, failed: paths, attempts: 0 };
  }
}

export const storageProvider: StorageProvider = {
  /* R2 (route-backed). Tek yol. */
  async upload(
    bucket: string,
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    options?: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    return routeUpload(bucket, path, body, options);
  },
  async remove(
    bucket: string,
    paths: string[]
  ): Promise<StorageRemoveResult> {
    return routeRemove(bucket, paths);
  },
  /* READ — bucket CDN base'inden absolute R2 URL. */
  getPublicUrl(bucket: string, path: string): string | null {
    return resolveCdnPublicUrl(bucket, path);
  },
};
