import "server-only";

import { removeServer } from "@/lib/storage/server";
import {
  parseVillaStorageUrl,
  type StorageRemoveResult,
} from "@/lib/villa-image.helpers";

/* ===============================================================
   🛡️ VILLA IMAGE STORAGE — I/O SEAM (server-only)
   ===============================================================
   Storage remove I/O (deleteVillaImage / deleteAllVillaImages cleanup).
   Tüketicisi `app/services/villa-image/villa-image.delete.ts` → yalnız
   galeri write SERVER ACTION'larından çağrılır (DI sprintinde silme
   server tarafına taşındı). Bu yüzden artık `import "server-only"` +
   `removeServer` (R2/S3 direct).

   ⚠️ STORAGE DAVRANIŞI DEĞİŞMEDİ:
     Sonuç (`R2'den dosya silme`) aynen; yalnız yürütme yolu barrel
     route yerine server-side `removeServer` (mevcut s3 mekanizması).
     Sonuç envelope (`ok/failed/attempts`) birebir korunur.
   =============================================================== */

/**
 * Storage'dan bulk remove (server-side, `removeServer` → R2/S3).
 * `_maxAttempts` YOK SAYILIR (retry provider içinde sabit); geriye
 * uyumluluk için parametre korunur.
 */
export async function removeVillaStorageFiles(
  bucket: string,
  paths: string[],
  _maxAttempts?: number
): Promise<StorageRemoveResult> {
  void _maxAttempts;
  return removeServer(bucket, paths);
}

/**
 * Tek URL/path girdisinden bucket+path parse edip remove eder.
 * Parse `parseVillaStorageUrl` (pure, client-safe helper) ile;
 * cleanup pipeline'ı tek çağrıya iner. Caller başarı / orphan
 * ayrımını boolean/envelope ile alır.
 */
export async function removeVillaImageByUrl(
  urlOrPath: string | null | undefined
): Promise<StorageRemoveResult> {
  const parsed = parseVillaStorageUrl(urlOrPath);
  if (!parsed) {
    console.warn("[villa-image.storage.remove] PATH_PARSE_FAILED", {
      input: urlOrPath,
    });
    return { ok: false, failed: [], attempts: 0 };
  }
  return removeVillaStorageFiles(parsed.bucket, [parsed.path]);
}
