import "server-only";

import { s3StorageProvider } from "./s3-storage.provider";
import { invalidateSiteAssetVersions } from "./site-asset-version.server";
import type { StorageRemoveResult } from "./storage.types";

/* ===============================================================
   🛡️ SERVER-SIDE STORAGE REMOVE (server-only) — R2
   ===============================================================
   AMAÇ:
     Server bağlamındaki remove (özellikle hardDeleteVilla cleanup)
     doğrudan R2'ye gider. Client seam (index.ts) HTTP route kullanır;
     server route HTTP kullanamaz (Bearer yok) → burada
     `s3StorageProvider`'ı DOĞRUDAN çağırır.

   ⚠️ `import "server-only"`: s3StorageProvider (AWS SDK) yalnız server.
     Bu modül client bundle'a sızarsa BUILD HATA.

   ⚠️ Dönüş tipi StorageRemoveResult → caller (storage-cleanup)
     `result.ok` kontrolü değişmeden çalışır.
   =============================================================== */

export async function removeServer(
  bucket: string,
  paths: string[]
): Promise<StorageRemoveResult> {
  const result = await s3StorageProvider.remove(bucket, paths);
  /* 🛡️ Görsel URL versiyonu — silinen site-assets path'lerinin versiyon
     cache'i geçersiz (sonuç/dönüş tipi DEĞİŞMEDİ). */
  invalidateSiteAssetVersions(bucket, paths);
  return result;
}
