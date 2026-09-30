/* 🛡️ FAZ 2 STABILIZATION — server-role repo (dbAdmin) RLS bypass.
   storage-cleanup helper'ı da SAME repo'ya yönlendirildi (findImage
   UrlsByVillaId server-role'le çağrılır). */
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { adminGateway } from "@/lib/admin-gateway/server";

import { cleanupVillaStorageForHardDelete } from "./_helpers/storage-cleanup";

/* ===============================================================
   🛡️ FAZ 3 — hardDeleteVilla (ORCHESTRATOR)
   ===============================================================
   Eski villa-admin.service.ts > hardDeleteVilla'nın BYTE-IDENTICAL
   karşılığı; storage cleanup helper'a alındı, orchestrator yalnız:
     1. Storage cleanup (best-effort; helper try/catch sarmalı)
     2. Promise.all parallel DELETE 7 relation table
     3. Final villa DELETE + FK constraint catch (23503)
   sırasını yönetir.

   ⚠️ TEMİZLİK SIRASI (atomik değil; en kötü durum partial-cleanup):
     1) Storage: villa_images.image_url'lerinden eski sağlayıcı storage
        path'lerini parse edip toplu remove. Hata loglanır, devam.
     2) Relation tabloları (presentation): paralel DELETE
          - villa_images
          - villa_feature_relations
          - villa_rule_relations
          - villa_price_include_relations
          - villa_type_relations
          - villa_distances
          - villa_prices
     3) villa satırı DELETE. FK constraint (reservations.villa_id)
        nedeniyle reddedilirse (SQLSTATE 23503) explicit hata
        döner — admin önce rezervasyon geçmişini yönetmeli.

   ⚠️ RESERVATION HISTORY:
     reservations / manual_reservations tablolarına DOKUNULMAZ.
     Aktif veya tarihsel kayıt varsa villa kalıcı silinmez; soft
     delete olarak Çöp Kutusu'nda kalır. Bu kasıtlı.

   ⚠️ Promise.all parallel DELETE sırası eski koddaki ile aynen
     korundu (array order); Postgres tarafında bağımsız delete'ler
     komutatif ama application'da array order'ı stable tutuldu.
=============================================================== */

export async function hardDeleteVilla(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "ID gerekli" };

  /* 1) Storage cleanup — best-effort, hardened (Faz 8).
     - `parseVillaStorageUrl` ile URL parse merkezi.
     - `removeVillaStorageFiles` bulk + retry + idempotent.
     - Bucket bazında gruplama korunur (eski legacy + yeni dosyalar
       teknik olarak aynı bucket'ta ama defansif gruplama bırakıldı).
     - Tüm cleanup başarısız olsa bile hardDelete devam eder (orphan
       storage file → cost; orphan DB row → UX bozar; ikincisi öncelik). */
  await cleanupVillaStorageForHardDelete(id);

  /* 2) Presentation relation tabloları — paralel DELETE.
     reservations / manual_reservations DAHİL DEĞİL (history korunur).
     FAZ 37: DB I/O 7 DELETE villaAdminRepository.* delege; array
     order STABLE aynen. */
  await Promise.all([
    villaAdminRepository.deleteVillaImagesByVillaId(id),
    villaAdminRepository.deleteVillaFeatureRelationsByVillaId(id),
    villaAdminRepository.deleteVillaRuleRelationsByVillaId(id),
    villaAdminRepository.deleteVillaPriceIncludeRelationsByVillaId(id),
    villaAdminRepository.deleteVillaTypeRelationsByVillaId(id),
    villaAdminRepository.deleteVillaDistancesByVillaId(id),
    villaAdminRepository.deleteVillaPricesByVillaId(id),
  ]);

  /* 3) Villa satırı DELETE — FK rezervasyonlardan referans alıyorsa
     Postgres bunu reddeder. Bu kasıtlı: history korunur.
     FAZ 37: DB I/O villaAdminRepository.hardDeleteVillaById delege;
     SQLSTATE 23503 → TR mesaj service edge'de aynen. */
  const { error } = await villaAdminRepository.hardDeleteVillaById(id);

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23503") {
      return {
        ok: false,
        error:
          "Bu villaya bağlı rezervasyon geçmişi mevcut; geçmiş korunduğu için kalıcı olarak silinemez. Önce ilgili rezervasyonları yönetin.",
      };
    }
    console.error("[villa.hardDelete] FAILED", error.message);
    return { ok: false, error: error.message };
  }

  /* FAZ 42: AUDIT (fire-forget). Destructive — heavy snapshot YOK;
     id + cascade hint metadata. */
  void adminGateway.audit("villa.hard_deleted", {
    entityType: "villa",
    entityId: id,
    metadata: {
      source: "hardDeleteVilla",
      cascade: "relations+storage+villa_row",
    },
  });

  return { ok: true };
}
