import "server-only";

import {
  authorizeAdminSession,
  type AuthorizedAdminCaller,
} from "@/lib/admin-route-auth";
import { adminUserServerRepository } from "@/lib/db/admin-user.repository.server";

/* ===============================================================
   🛡️ SERVER ACTION AUTHORIZATION — ADDITIVE GATE
   ===============================================================
   NEDEN:
     `middleware.ts` yalnız `/maki-admin/:path*` YOL DESENİNİ korur.
     Server Action ise derlenmiş action ID'si ile HERHANGİ bir route'a
     POST edilerek çağrılabilir → admin klasöründe olmak koruma DEĞİL.
     (Aynı tespit: app/services/villa-review.action.ts başlığındaki
     "authz notu — ayrı sprintte eklenmeli" yorumu. Bu modül o gate'tir.)

   MEVCUT SİSTEM KORUNUR — YENİ AUTH SİSTEMİ YOK:
     • Kimlik doğrulama: `authorizeAdminSession()` (lib/admin-route-auth)
       — native access cookie → jose verify → admin_users + is_active.
       DEĞİŞTİRİLMEDİ, yalnız çağrılır.
     • Yetki kaynağı: `admin_users.sidebar_permissions` — projenin TEK
       permission modeli. Key'ler `SIDEBAR_PERMISSIONS` kataloğundan
       (app/services/admin-user.service.ts). YENİ permission ŞEMASI YOK.
     • Okuma: MEVCUT `adminUserServerRepository.findByIdForSession(id)`
       — bu fonksiyon `sidebar_permissions`'ı ZATEN select eder. Yeni
       repository fonksiyonu veya select değişikliği YOK.

   ⚠️ NEDEN JWT `perms` CLAIM'İ KULLANILMIYOR:
     `lib/auth/native/jwt.ts` AccessTokenClaims.perms alanının tanımı
     BİREBİR şöyle: "UI ipucu; yetki kararı DB'den doğrulanır."
     Access token ömrü 15 dk → yetki geri alındıktan sonra claim
     bayatlar. Bu yüzden karar her çağrıda DB'den okunur.

   ⚠️ SUPER-ADMIN / ROL YOK:
     Projede is_super / owner / role / full-access bypass kavramı
     BULUNMUYOR (audit ile doğrulandı). Model düz: is_active +
     sidebar_permissions[]. Burada da yeni rol kavramı ÜRETİLMEZ.

   ⚠️ FAIL-CLOSED:
     DB hatası / satır yok / is_active=false → izin kümesi BOŞ kabul
     edilir → işlem reddedilir. Authorization'da doğru yön budur.

   İKİ KULLANIM KALIBI:
     1) Guard'ı OLMAYAN action'lar → `requirePermission(...)` (throw).
        Dönüş tipi değişmez, tek satır eklenir.
     2) Guard'ı ZATEN OLAN action'lar → mevcut `{ ok:false }` dönüş
        şekli korunsun diye `callerHasPermission(...)` (boolean).
   =============================================================== */

/** `SIDEBAR_PERMISSIONS` kataloğundaki key (örn. "villas", "finance"). */
export type AdminPermissionKey = string;

/** Tek key veya "herhangi biri yeterli" listesi. */
export type PermissionRequirement = AdminPermissionKey | AdminPermissionKey[];

/** Oturum yok / admin değil / pasif. */
export const UNAUTHENTICATED_MESSAGE = "Yetkisiz: oturum bulunamadı";
/** Admin ama gerekli permission yok. */
export const FORBIDDEN_MESSAGE = "Yetkisiz: bu işlem için izniniz yok";

/** Server Action authorization hatası. Next.js bunu client'a reddedilmiş
 *  promise olarak iletir (production'da mesaj digest'e çevrilir). */
export class ServerActionAuthError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ServerActionAuthError";
    this.status = status;
  }
}

/* ---------------------------------------------------------------
   İZİN KÜMESİ — mevcut repository fonksiyonuyla, DB'den.
--------------------------------------------------------------- */
async function loadPermissions(adminId: string): Promise<string[]> {
  try {
    const { data, error } =
      await adminUserServerRepository.findByIdForSession(adminId);
    if (error || !data) return [];
    if (data.is_active === false) return [];
    /* `normalizePerms` (session.service) ile AYNI semantik:
       dizi değilse boş küme. */
    return Array.isArray(data.sidebar_permissions)
      ? (data.sidebar_permissions as unknown[]).filter(
          (p): p is string => typeof p === "string"
        )
      : [];
  } catch {
    return []; // fail-closed
  }
}

function satisfies(granted: string[], need: PermissionRequirement): boolean {
  const owned = new Set(granted);
  const required = Array.isArray(need) ? need : [need];
  /* Dizi = "herhangi biri yeterli" (aynı action'ı iki farklı sidebar
     bölümünden açabilen adminler için). */
  return required.some((k) => owned.has(k));
}

/* ---------------------------------------------------------------
   PUBLIC API
--------------------------------------------------------------- */

/** Yalnız "aktif admin mi?" — permission aranmaz.
 *  Yetkisizse THROW eder; action gövdesi hiç çalışmaz. */
export async function requireAdminAction(): Promise<AuthorizedAdminCaller> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) {
    throw new ServerActionAuthError(UNAUTHENTICATED_MESSAGE, auth.status);
  }
  return auth.caller;
}

/** Aktif admin + gerekli permission. Yetkisizse THROW eder →
 *  action gövdesine (ve dolayısıyla repository/DB mutation'a) HİÇ
 *  ulaşılmaz. */
export async function requirePermission(
  need: PermissionRequirement
): Promise<AuthorizedAdminCaller> {
  const caller = await requireAdminAction();
  const granted = await loadPermissions(caller.id);
  if (!satisfies(granted, need)) {
    throw new ServerActionAuthError(FORBIDDEN_MESSAGE, 403);
  }
  return caller;
}

/** Aktif adminin izin kümesi (DB, fail-closed — `loadPermissions` ile
 *  AYNI kaynak). Yalnız "ilk erişilebilir bölüme yönlendir" gibi karar
 *  DIŞI ihtiyaçlar için; yetki kararı için `requirePermission` /
 *  `callerHasPermission` kullanılır. */
export async function getCallerPermissions(adminId: string): Promise<string[]> {
  if (!adminId) return [];
  return loadPermissions(adminId);
}

/** Throw ETMEYEN varyant — `authorizeAdminSession()` guard'ı ZATEN olan
 *  ve `{ ok:false, error }` döndüren mevcut action'lar için; o
 *  action'ların dönüş şekli korunur. */
export async function callerHasPermission(
  adminId: string,
  need: PermissionRequirement
): Promise<boolean> {
  if (!adminId) return false;
  const granted = await loadPermissions(adminId);
  return satisfies(granted, need);
}
