"use server";

import { callerHasPermission } from "@/lib/auth/action-authz";
import {
  updateImageOrder,
  setCoverImage,
} from "@/app/services/villa-image/villa-image.mutations";
/* 🛡️ IMG-P2B/P3R — app-layer admin gate (native RLS-free write authz).
   Yalnız gate; auth.caller kullanılmaz. Service'ler native (dbAdminNative);
   eski sağlayıcı session client injection IMG-P3R'de kaldırıldı. */
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import { invalidateVillasCache } from "@/lib/villas-cache-invalidation.server";

/* ===============================================================
   🛡️ ADMIN GALLERY — WRITE ORCHESTRATION (SERVER ACTIONS)
   ===============================================================
   AdminGallery (client) sıralama + kapak yazmalarını artık doğrudan
   service yerine bu server action'lar üzerinden yapar → `villa-image.
   mutations` / `@/lib/db` client bundle'a girmez.

   ⚠️ ORCHESTRATION-ONLY: mevcut `updateImageOrder` / `setCoverImage`
   fonksiyonları tek gerçek kaynak; session-aware client geçilir →
   admin write RLS'i BUGÜNKÜ eski sağlayıcı session ile birebir korunur.
   =============================================================== */

export async function reorderGalleryImages(
  updates: { id: string; sort_order: number }[]
): Promise<void> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return;
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return;
  }

  await updateImageOrder(updates);
  /* 🛡️ Sıralama → kart kapak görseli (is_cover yoksa ilk sort_order)
     değişebilir. `updateImageOrder` hata durumunda throw etmez (yalnız
     loglar) → invalidation yetkili yazma denemesinden sonra yapılır;
     başarısız yazmada cache yalnız değişmemiş DB verisiyle yeniden kurulur. */
  invalidateVillasCache("admin.gallery.reorder");
}

export async function setGalleryCover(
  id: string,
  villaId: string
): Promise<void> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return;
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return;
  }

  await setCoverImage(id, villaId);
  /* 🛡️ Kapak değişimi → kart görseli değişir (aynı hata notu: servis
     throw etmez; bkz. reorderGalleryImages). */
  invalidateVillasCache("admin.gallery.cover");
}
