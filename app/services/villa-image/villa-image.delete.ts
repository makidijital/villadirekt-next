/* 🛡️ Migration IMG-P3R — anon repo + eski sağlayıcı session client injection yerine
   native `villa-image.repository.server`. Write authz app-layer gate'inde
   (authorizeAdminSession, IMG-P2B); native default (dbAdminNative, RLS-free).
   Storage (R2) akışı + DB-first sıra DEĞİŞMEDİ. */
import { villaImageServerRepository as villaImageRepository } from "@/lib/db/villa-image.repository.server";
import {
  parseVillaStorageUrl,
  VILLA_IMAGES_BUCKET,
} from "@/lib/villa-image.helpers";
import {
  removeVillaImageByUrl,
  removeVillaStorageFiles,
} from "@/lib/villa-image.storage.server";

/* ===============================================================
   🛡️ VILLA IMAGE — DELETE ORCHESTRATION (delete / deleteAll)
   ===============================================================
   SORUMLULUK: DB-first silme + best-effort storage cleanup zinciri.
     Storage I/O `lib/villa-image.storage.server.ts` seam'ine
     delege edilir (retry + idempotent).

   ⚠️ BAĞLAM (server-side, session-aware DI):
     Bu fonksiyonlar artık galeri write SERVER ACTION'larından
     çağrılır (`gallery.action.ts`). Opsiyonel `client` parametresiyle
     server tarafında `session-aware DB client` (session-aware)
     geçilir → admin RLS session'ı server tarafında da taşınır →
     `is_active_admin()` BUGÜNKÜ gibi geçer (yetki aynen). Storage
     temizliği `villa-image.storage.server.ts` (server-only) →
     `removeServer` ile R2'den yapılır. Client-reachable DEĞİL.

   ⚠️ DAVRANIŞ DEĞİŞMEDİ — gövdeler birebir; yalnız client parametresi
     ve execution yeri (server action) eklendi.
   =============================================================== */

/* ===============================================================
   🛡️ DELETE IMAGE — production-hardened lifecycle
   ===============================================================
   GARANTİLER (Faz 8 hardening):

   1) IDEMPOTENT
      - id'ye karşılık DB row YOKSA: zaten silinmiş → true döner.
        İki admin aynı anda silmeye basarsa ikisi de success görür.

   2) DB-FIRST ORDER (defansif)
      - Önce DB delete, sonra storage delete.
      - Eski sıralama: storage → DB. DB fail olursa kırık `<img>` UI'da
        kalıyordu. Yeni sıralama: DB delete OK → UI'dan kayıt anında
        düşer; storage cleanup arka planda retry'li çalışır. Storage
        kalsa bile UX bozulmaz (yalnız orphan dosya).
      - Cache invalidation caller'ın sorumluluğu (eski davranış aynı).

   3) STORAGE RETRY
      - 3 deneme, exponential backoff (200ms, 400ms).
      - "not found" → idempotent başarı kabul edilir.
      - Tüm denemeler başarısız → orphan log yazılır, UX bozulmaz.

   4) PATH PARSING
      - `parseVillaStorageUrl` (lib/villa-image.helpers) merkezi.
      - Eski `.split("/object/public/")[1]` ile byte-identical sonuç;
        ayrıca bucket-relative path'leri de tanır.

   RETURN SEMANTIC:
     true  → DB row removed (UX intact). Storage cleanup ya başarılı
             ya da orphan; her iki durumda UX değişmez.
     false → DB delete başarısız. Kullanıcıya hata gösterilmeli.

   BACKWARD COMPATIBILITY:
     - Eski caller'lar boolean kontrol ediyor: korunur.
     - Eski URL formatları (UUID/UUID.webp) aynen parse edilir.
     - Race koşullarında (zaten silinmiş) eski false → yeni true.
       Bu davranış strict improvement: success/failure ayrımı netleşir.
   =============================================================== */
export async function deleteVillaImage(id: string): Promise<boolean> {
  if (!id) return false;

  /* 1) Fetch — image_url storage cleanup için lazım. */
  const { data: image, error: fetchError } =
    await villaImageRepository.findImageUrlById(id);

  if (fetchError) {
    console.error("[villa-image.delete] FETCH_FAILED", {
      id,
      error: fetchError.message,
    });
    return false;
  }

  /* IDEMPOTENT: row yoksa zaten silinmiş → success. */
  if (!image) {
    console.info("[villa-image.delete] ALREADY_GONE", { id });
    return true;
  }

  /* 2) DB DELETE — defansif önce. */
  const { error: dbError } = await villaImageRepository.deleteById(id);

  if (dbError) {
    console.error("[villa-image.delete] DB_FAILED", {
      id,
      error: dbError.message,
    });
    return false;
  }

  /* 3) STORAGE CLEANUP — best-effort, retry'lı. URL parse veya
        storage remove fail olsa bile DB row gitti → UX intact.
        Orphan dosya log'lanır; arka plan cleanup job'una bırakılır. */
  if (image.image_url) {
    const result = await removeVillaImageByUrl(image.image_url);
    if (!result.ok) {
      console.warn("[villa-image.delete] STORAGE_ORPHAN", {
        id,
        image_url: image.image_url,
        failed: result.failed,
        attempts: result.attempts,
        message:
          "DB row removed; storage file deletion failed after retries. " +
          "Orphan storage file remains — UX not affected.",
      });
      /* DB row gittiği için caller'a success döneriz. */
    }
  }

  return true;
}

/* ===============================================================
   🛡️ DELETE ALL IMAGES (bulk) — production-hardened lifecycle
   ===============================================================
   `deleteVillaImage` paterninin **batch** karşılığı.
   GARANTİLER:

   1) SADECE İLGİLİ VİLLA — `.eq("villa_id", villaId)` predicate ile
      SQL seviyesinde scope. Yanlış villa silinmesi imkansız.

   2) IDEMPOTENT
      - villaId'ye karşılık DB row YOKSA: { ok:true, removed:0 }.

   3) DB-FIRST ORDER (defansif)
      - Önce single batch DELETE → tek query ile tüm satırlar gider.
      - DB delete başarısız → storage'a HİÇ DOKUNULMAZ (rollback
        garantisi: orphan storage olmaz, çünkü DB hala kayıt tutar).
      - DB delete başarılı → storage cleanup arka planda best-effort.

   4) STORAGE BATCH REMOVE
      - `removeVillaStorageFiles` provider'ın retry'lı batch remove'u.
      - Path parse fail olan URL'ler (legacy/malformed) atlanır;
        DB delete zaten gitti → UX intact.
      - Tüm storage başarısız → orphan log yazılır, return ok=true
        (DB row gittiği için UX bozulmaz).

   RETURN SEMANTIC:
     { ok: true,  removed: N, orphans: [] }      — tam başarı
     { ok: true,  removed: N, orphans: [paths] } — DB OK, bazı storage
                                                   path'ler orphan
     { ok: false, removed: 0, orphans: [] }      — DB delete fail
                                                   (storage'a dokunulmadı)
   =============================================================== */
export async function deleteAllVillaImages(
  villaId: string
): Promise<{
  ok: boolean;
  removed: number;
  orphans: string[];
}> {
  if (!villaId) return { ok: false, removed: 0, orphans: [] };

  /* 1) Fetch — storage cleanup için image_url'ler lazım. */
  const { data: imgs, error: fetchError } =
    await villaImageRepository.findImageUrlsByVilla(villaId);

  if (fetchError) {
    console.error("[villa-image.deleteAll] FETCH_FAILED", {
      villaId,
      error: fetchError.message,
    });
    return { ok: false, removed: 0, orphans: [] };
  }

  /* IDEMPOTENT: kayıt yoksa zaten boş → success. */
  if (!imgs || imgs.length === 0) {
    console.info("[villa-image.deleteAll] EMPTY", { villaId });
    return { ok: true, removed: 0, orphans: [] };
  }

  const count = imgs.length;

  /* 2) DB BATCH DELETE — tek query, sadece bu villa. */
  const { error: dbError } = await villaImageRepository.deleteByVilla(villaId);

  if (dbError) {
    console.error("[villa-image.deleteAll] DB_FAILED", {
      villaId,
      error: dbError.message,
    });
    /* Storage'a DOKUNULMADI — orphan riski yok. */
    return { ok: false, removed: 0, orphans: [] };
  }

  /* 3) STORAGE BULK CLEANUP — best-effort, retry'lı batch remove.
        DB gitti → UX intact. Storage başarısız olsa bile success
        döneriz (orphan path'ler caller'a + log'a yansır). */
  const paths: string[] = [];
  for (const i of imgs) {
    const parsed = parseVillaStorageUrl(
      i?.image_url as string | null | undefined
    );
    if (parsed) paths.push(parsed.path);
  }

  let orphans: string[] = [];
  if (paths.length > 0) {
    const result = await removeVillaStorageFiles(
      VILLA_IMAGES_BUCKET,
      paths
    );
    if (!result.ok) {
      orphans = result.failed;
      console.warn("[villa-image.deleteAll] STORAGE_ORPHAN", {
        villaId,
        removed: count,
        orphans,
        attempts: result.attempts,
        message:
          "DB rows removed; some storage files failed to delete after retries. " +
          "Orphan storage files remain — UX not affected.",
      });
    }
  }

  return { ok: true, removed: count, orphans };
}
