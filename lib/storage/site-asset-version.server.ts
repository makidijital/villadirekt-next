import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";

import { STORAGE_BUCKETS } from "./storage.constants";
import { headObjectEtag } from "./s3-storage.provider";
import {
  normalizeSiteAssetPath,
  siteAssetVersionTag,
} from "./site-asset-version";

export {
  normalizeSiteAssetPath,
  siteAssetVersionTag,
  versionFor,
} from "./site-asset-version";

/* ===============================================================
   🛡️ SITE-ASSETS GÖRSEL VERSİYONU (server-only)
   ===============================================================
   SORUN: Villa dışı görseller (blog/sayfa kapakları, admin
   branding…) R2'de SABİT path'e overwrite edilir → public URL
   değişmez → tarayıcı, Next Image Optimizer (`/_next/image`, 4 saat)
   ve CDN eski baytı URL'ye göre sunmaya devam eder.

   ÇÖZÜM: R2 path/dosya adı AYNEN kalır; URL'ye `?v=<versiyon>`
   eklenir. Versiyon = R2 nesnesinin ETag'i (içerik hash'i):
     • görsel değişince değişir, değişmezse AYNI kalır
     • render başına üretilmez, DB/migration gerektirmez
     • DB'de `updated_at` olmayan tablolar için de güvenilir

   CACHE: path başına `unstable_cache` (1 saat) + path'e özel tag.
   `/api/admin/storage/{upload,remove}` ve `removeServer` başarıdan
   sonra `siteAssetVersionTag(path)`'i invalidate eder → yeni
   versiyon ANINDA görünür; tag'i kullanan ISR sayfaları da tazelenir.

   GÜVENLİ FALLBACK: path relative değilse (legacy tam URL), nesne
   yoksa ya da R2'ye ulaşılamazsa `null` döner → çağıran versiyonsuz
   (bugünkü) URL'yi kullanır. Hatalar cache'lenmez.
   =============================================================== */

const SITE_ASSETS_BUCKET = STORAGE_BUCKETS.SITE_ASSETS;
const VERSION_TTL_SECONDS = 3600;

/** ETag → kısa, URL-güvenli versiyon (içerik hash'inin ilk 12 hanesi). */
function toVersion(etag: string | null): string | null {
  if (!etag) return null;
  const v = etag.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  return v || null;
}

async function readVersion(path: string): Promise<string | null> {
  return unstable_cache(
    async () => toVersion(await headObjectEtag(SITE_ASSETS_BUCKET, path)),
    ["site-asset-version", path],
    {
      tags: ["site-asset-version", siteAssetVersionTag(path)],
      revalidate: VERSION_TTL_SECONDS,
    }
  )();
}

/** Tek görselin versiyonu (yoksa null). */
export async function getSiteAssetVersion(
  value: string | null | undefined
): Promise<string | null> {
  const path = normalizeSiteAssetPath(value);
  if (!path) return null;
  try {
    return await readVersion(path);
  } catch {
    return null;
  }
}

/** Birden çok görselin versiyonları: `{ [path]: versiyon }`.
 *  Versiyonu bulunamayan path'ler map'e YAZILMAZ. */
export async function getSiteAssetVersions(
  values: ReadonlyArray<string | null | undefined>
): Promise<Record<string, string>> {
  const paths = Array.from(
    new Set(
      values
        .map((v) => normalizeSiteAssetPath(v))
        .filter((p): p is string => p !== null)
    )
  );
  const entries = await Promise.all(
    paths.map(async (p) => [p, await getSiteAssetVersion(p)] as const)
  );
  const out: Record<string, string> = {};
  for (const [p, v] of entries) if (v) out[p] = v;
  return out;
}

/** Upload/remove sonrası: bu path'lerin versiyon cache'ini ANINDA
 *  geçersiz kılar (yalnız site-assets bucket'ı). Asla throw etmez —
 *  upload/remove sonucu ve yanıt formatı ETKİLENMEZ; invalidation
 *  başarısız olursa versiyon en geç VERSION_TTL_SECONDS içinde
 *  kendiliğinden tazelenir. */
export function invalidateSiteAssetVersions(
  bucket: string,
  values: ReadonlyArray<string | null | undefined>
): void {
  if (bucket !== SITE_ASSETS_BUCKET) return;
  for (const value of values) {
    const path = normalizeSiteAssetPath(value);
    if (!path) continue;
    try {
      revalidateTag(siteAssetVersionTag(path), { expire: 0 });
    } catch {
      /* request scope dışı (script/test) → TTL fallback */
    }
  }
}
