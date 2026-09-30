import "server-only";

import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { authorizeAdminSession } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  getCallerPermissions,
  type PermissionRequirement,
} from "@/lib/auth/action-authz";
import { firstAllowedAdminHref } from "@/lib/auth/admin-permission-map";
import AdminPageSessionRefresh from "@/app/components/admin/AdminPageSessionRefresh";

/* ===============================================================
   🛡️ ADMIN SAYFA YETKİ KAPISI (server) — URL ile doğrudan erişim
   ===============================================================
   Mevcut altyapı AYNEN kullanılır, yeni auth/permission sistemi YOK:
     1) Oturum: `authorizeAdminSession()` (SEC-01 ile aynı; doğrulanamazsa
        mevcut `AdminPageSessionRefresh` fallback'i — veri üretilmez).
     2) Yetki:  `callerHasPermission()` (DB `sidebar_permissions`,
        fail-closed). JWT `perms` claim'i KULLANILMAZ.
     3) Yetkisiz: menü sırasındaki ilk izinli bölüme `redirect()`
        (Next 307); hiç izinli bölüm yoksa yalnız bilgi kartı —
        bölümün içeriği / verisi render EDİLMEZ.

   Kullanım:
     • Bölüm layout'u:  <AdminSectionGuard need="villas">{children}</…>
       (bölüme her girişte server'da çalışır; client sayfa kabukları
       hiç mount olmaz → API/action çağrısı da yapılmaz).
     • Veri çeken Server Component sayfası: layout sayfanın render'ını
       DURDURMAZ (Next dokümanı: "a layout does not control whether the
       rest of the route renders") → bu sayfalar ayrıca veri çekmeden
       ÖNCE `adminPermissionGate(auth.caller.id, need)` çağırır.
   =============================================================== */

function AdminNoAccess() {
  return (
    <div className="card-premium p-6 md:p-8 max-w-xl">
      <p className="eyebrow">Yetki</p>
      <h1 className="font-display text-2xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
        Bu bölüme erişim yetkiniz yok
      </h1>
      <p className="text-sm text-[var(--color-stone-500)] mt-2">
        Hesabınıza tanımlı bir yönetim bölümü bulunmuyor. Yetki için yöneticinizle
        iletişime geçin.
      </p>
    </div>
  );
}

/**
 * Oturumu ZATEN doğrulanmış admin için yetki kapısı.
 * İzin varsa `null` döner (sayfa devam eder); yoksa ilk izinli bölüme
 * yönlendirir (throw) veya bilgi kartını döndürür.
 */
export async function adminPermissionGate(
  adminId: string,
  need: PermissionRequirement
): Promise<ReactNode | null> {
  if (await callerHasPermission(adminId, need)) return null;
  const fallback = firstAllowedAdminHref(await getCallerPermissions(adminId));
  if (fallback) redirect(fallback);
  return <AdminNoAccess />;
}

/** Bölüm layout'u için: önce oturum, sonra yetki, sonra içerik. */
export default async function AdminSectionGuard({
  need,
  children,
}: {
  need: PermissionRequirement;
  children: ReactNode;
}) {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return <AdminPageSessionRefresh />;
  const denied = await adminPermissionGate(auth.caller.id, need);
  if (denied) return denied;
  return <>{children}</>;
}
