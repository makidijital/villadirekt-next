/* 🛡️ FAZ 2 STABILIZATION — server-role repo (RLS bypass) for the
   findImageUrlsByVillaId READ within hard-delete mutation flow. */
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { parseVillaStorageUrl } from "@/lib/villa-image.helpers";
/* 🛡️ FAZ C / ADIM 3 — server remove write-driver-aware (write=r2→S3,
   write=eski sağlayıcı→eski sağlayıcı bugünküyle aynı). HTTP route değil, server
   provider doğrudan; hard delete zinciri korunur. */
import { removeServer } from "@/lib/storage/server";

/* ===============================================================
   🛡️ FAZ 2 — VILLA STORAGE CLEANUP (for hardDeleteVilla)
   ===============================================================
   Eski hardDeleteVilla içinde inline yazılı storage cleanup
   bloğunun birebir kopyası. Best-effort, hardened (Faz 8):
     - villa_images.image_url'lerini fetch
     - `parseVillaStorageUrl` ile bucket+path ayrıştırma (TEK merkez)
     - Bucket bazında gruplama (eski legacy + yeni dosyalar
       teknik olarak aynı bucket'ta ama defansif gruplama bırakıldı)
     - `removeVillaStorageFiles` bulk + retry + idempotent
     - Tüm cleanup başarısız olsa bile orchestrator devam eder
       (orphan storage file → cost; orphan DB row → UX bozar; ikincisi
       öncelik)

   ⚠️ KESIN KURAL: try/catch boundary BYTE-IDENTICAL. Helper kendisi
   throw etmez (best-effort); console.warn / console.error pattern'i
   eski koddaki ile aynı tag'lerle.

   ÇAĞIRAN: hard-delete.service.ts > hardDeleteVilla orchestrator'ı.
=============================================================== */

export async function cleanupVillaStorageForHardDelete(
  villaId: string
): Promise<void> {
  try {
    /* FAZ 37: DB I/O villaAdminRepository.findImageUrlsByVillaId
       üzerinden delege. SELECT + predicate repo içinde aynen;
       best-effort try/catch + warn pattern helper'da. */
    const { data: images } =
      await villaAdminRepository.findImageUrlsByVillaId(villaId);

    if (images && images.length > 0) {
      const byBucket = new Map<string, string[]>();
      /* 🛡️ Faz 9 hardening: narrow type. */
      type ImageRow = { image_url: string | null };
      for (const img of images as ImageRow[]) {
        const url = img?.image_url || "";
        const parsed = parseVillaStorageUrl(url);
        if (!parsed) continue;
        const list = byBucket.get(parsed.bucket) || [];
        list.push(parsed.path);
        byBucket.set(parsed.bucket, list);
      }
      for (const [bucket, paths] of byBucket) {
        const result = await removeServer(bucket, paths);
        if (!result.ok) {
          console.warn("[villa.hardDelete] STORAGE_ORPHAN_AFTER_RETRY", {
            villaId,
            bucket,
            failedPaths: result.failed,
            attempts: result.attempts,
            message:
              "Storage cleanup partial fail after retry. DB hard delete " +
              "will proceed; orphan files remain — UX not affected.",
          });
        }
      }
    }
  } catch (storageErr) {
    console.error("[villa.hardDelete] storage cleanup exception:", storageErr);
  }
}
