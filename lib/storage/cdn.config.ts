import { STORAGE_BUCKETS, type StorageBucket } from "./storage.constants";

/* ===============================================================
   🛡️ STORAGE READ LAYER — CDN CONFIG (client-safe) — R2
   ===============================================================
   AMAÇ:
     Read (public URL) tarafı. `getPublicUrl` bucket başına CDN base
     URL'inden absolute R2 URL üretir:
       villa-images → NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES
       site-assets  → NEXT_PUBLIC_CDN_BASE_SITE_ASSETS

   ⚠️ KAPSAM — yalnız READ (public URL üretimi):
     upload / remove bu dosyaya dokunmaz.

   ⚠️ TEK YOL — FALLBACK YOK:
     CDN base tanımlıysa absolute R2 URL; tanımlı değilse `null`.
     Başka bir provider'a düşme yoktur. Üretimde CDN base env'leri
     tanımlı olmalıdır.

   ⚠️ CLIENT-SAFE:
     `import "server-only"` YOK — getPublicUrl hem RSC hem browser
     (VillaCard vs.) bağlamında çalışır. Env'ler `NEXT_PUBLIC_`
     prefix'li (secret değil; yalnız public CDN host).
   =============================================================== */

/* Bucket → CDN base URL (trailing slash temizlenir; boş → undefined). */
const CDN_BASES: Record<string, string | undefined> = {
  [STORAGE_BUCKETS.VILLA_IMAGES]:
    (process.env.NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES || "").replace(
      /\/+$/,
      ""
    ) || undefined,
  [STORAGE_BUCKETS.SITE_ASSETS]:
    (process.env.NEXT_PUBLIC_CDN_BASE_SITE_ASSETS || "").replace(
      /\/+$/,
      ""
    ) || undefined,
};

/** Verilen bucket için CDN base URL (yoksa null). */
export function getCdnBaseForBucket(bucket: string): string | null {
  return CDN_BASES[bucket] ?? null;
}

/**
 * Bucket için CDN base tanımlıysa absolute R2 URL döner; aksi halde null.
 *   resolveCdnPublicUrl("tatilinyeri-villa-images", "villas/x/y.webp")
 *     → "<NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES>/villas/x/y.webp"
 */
export function resolveCdnPublicUrl(
  bucket: string,
  path: string
): string | null {
  if (!path || typeof path !== "string") return null;
  const trimmed = path.trim().replace(/^\/+/, "");
  if (!trimmed) return null;
  const base = getCdnBaseForBucket(bucket);
  if (!base) return null;
  return `${base}/${trimmed}`;
}

/**
 * CDN host → bucket eşlemesi (parseVillaStorageUrl remove yolu için).
 * Bir CDN URL'inin (NEXT_PUBLIC_CDN_BASE_* host'ları) hangi bucket'a ait
 * olduğunu, env'deki CDN base host'larıyla eşleştirerek bulur.
 * Eşleşme yoksa null.
 */
export function bucketFromCdnHost(host: string): StorageBucket | null {
  const h = (host || "").toLowerCase();
  const candidates: StorageBucket[] = [
    STORAGE_BUCKETS.VILLA_IMAGES,
    STORAGE_BUCKETS.SITE_ASSETS,
  ];
  for (const bucket of candidates) {
    const base = getCdnBaseForBucket(bucket);
    if (!base) continue;
    try {
      if (new URL(base).host.toLowerCase() === h) return bucket;
    } catch {
      /* malformed base → atla */
    }
  }
  return null;
}
