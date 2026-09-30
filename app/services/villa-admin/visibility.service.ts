/* 🛡️ FAZ 2 STABILIZATION — server-role villaAdminRepository (dbAdmin).
   Mutation service'leri server-side route context'inde anon RLS'in
   yetkilendirme uygulama katmanında yapıldığı için (
   is_active_admin()=false), bu service'ler SAME symbol adıyla ama
   service-role kullanan `villa.repository.server` modülünden import
   eder. Method imzaları + return shape + error shape BYTE-IDENTICAL;
   sadece execution context (RLS bypass) değişti. Service body AST
   intact. */
import { villaAdminRepository } from "@/lib/db/villa.repository.server";

/* ===============================================================
   🛡️ FAZ 3 — VILLA VISIBILITY & SOFT DELETE (FAZ 37 delege)
   ===============================================================
   Eski villa-admin.service.ts'in 3 visibility fonksiyonu BYTE-IDENTICAL
   tek dosyaya:
     - setVillaActive
     - softDeleteVilla
     - restoreVilla

   Hard delete yok: villa.id reservations / villa_images / villa_prices /
   villa_distances / 4 relation tablosu tarafından referans edilir.
   Soft delete reservation history'sini orphan bırakmaz.

   Hard delete ayrı dosyada: hard-delete.service.ts (trash bin'den
   erişilebilir, destructive modal arkasında).
=============================================================== */

/* setVillaActive — pasif/aktif toggle (public visibility).
   - is_active=false → public görünmez, admin görür/düzenler.
   - is_active=true  → herkese görünür.
   Slug, id, ilişkiler dokunulmaz. */
export async function setVillaActive(
  id: string,
  isActive: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "ID gerekli" };
  /* FAZ 37: DB I/O villaAdminRepository.updateVillaActiveById delege.
     deleted_at IS NULL predicate repo içinde aynen. */
  const { error } = await villaAdminRepository.updateVillaActiveById(
    id,
    isActive
  );
  if (error) {
    console.error("[villa.setActive] FAILED", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/* softDeleteVilla — admin'den de gizler.
   - deleted_at: now()
   - Reservations FK'leri etkilenmez; geçmiş kayıtlar korunur.
   - Trash recovery için /maki-admin/villas/trash ekranı kullanılır.
     Yanlışlıkla soft delete edilen kayıt buradan tek tıkla geri
     yüklenebilir (deleted_at=null, is_active=true). */
export async function softDeleteVilla(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "ID gerekli" };
  /* FAZ 37: DB I/O villaAdminRepository.softDeleteVillaById delege.
     ISO timestamp service edge'de generate edilir (caller geçer);
     deleted_at IS NULL predicate repo içinde aynen. */
  const { error } = await villaAdminRepository.softDeleteVillaById(
    id,
    new Date().toISOString()
  );
  if (error) {
    console.error("[villa.softDelete] FAILED", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/* ===============================================================
   🛡️ TRASH RECOVERY — restoreVilla
   ===============================================================
   Soft-deleted villayı tekrar canlı listeye alır:
     deleted_at = NULL
     is_active  = true
   Slug değişmez; eski reservations bağı korunur; SEO route aynı
   şekilde tekrar erişilebilir olur.
   Yalnız zaten deleted_at IS NOT NULL olan kayıtlara uygulanır
   (idempotent; canlı bir kaydı bozmaz). */
export async function restoreVilla(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "ID gerekli" };
  /* FAZ 37: DB I/O villaAdminRepository.restoreVillaById delege.
     deleted_at IS NOT NULL predicate (idempotent guard) repo içinde
     aynen. */
  const { error } = await villaAdminRepository.restoreVillaById(id);
  if (error) {
    console.error("[villa.restore] FAILED", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
