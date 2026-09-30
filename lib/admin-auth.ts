import { authProvider } from "@/lib/auth";

/* ===============================================================
   🔥 ADMIN AUTH — TEK SOURCE-OF-TRUTH
   ===============================================================
   Authentication: native auth — şifre `admin_users`, oturum `admin_sessions`.
   Authorization:  public.admin_users — is_active + permissions.

   Flow:
     native oturum doğrulama()
       ↓
     admin_users lookup (email match, lowercased)
       ↓
     is_active = true kontrolü
       ↓
     permissions normalize edilir (string[] olarak garanti)

   Eğer herhangi bir adımda kullanıcı geçersiz/pasif/yok ise:
   getCurrentAdmin() null döner. Çağıran taraf logout + redirect
   yapar. Tek source-of-truth burada.
   =============================================================== */

export type AdminAuthRecord = {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  sidebar_permissions: string[];
  /* 🛡️ TOTP 2FA — ADDITIVE. Yalnız boolean durum ("Hesabım" ekranı +
     ileride sidebar rozet vb. için) — secret İÇERMEZ. */
  totp_enabled: boolean;
};

export type AdminLookupResult =
  | { ok: true; admin: AdminAuthRecord }
  | { ok: false; reason: "unauthenticated" | "not_admin" | "inactive" };

/* ---------------------------------------------
   getCurrentAdmin — basit API
   - geçerli admin döner veya null
---------------------------------------------- */
export async function getCurrentAdmin(): Promise<AdminAuthRecord | null> {
  const result = await lookupCurrentAdmin();
  return result.ok ? result.admin : null;
}

/* ---------------------------------------------
   🛡️ NATIVE lookup (server /api/auth/me)
   Native modda admin lookup server-side; client yalnız endpoint çağırır.
---------------------------------------------- */
async function fetchMeOnce(): Promise<AdminLookupResult> {
  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "same-origin",
    });
    if (res.status === 401) {
      return { ok: false, reason: "unauthenticated" };
    }
    if (res.status === 403) {
      return { ok: false, reason: "inactive" };
    }
    if (!res.ok) {
      return { ok: false, reason: "not_admin" };
    }
    const json = (await res.json()) as {
      ok?: boolean;
      admin?: {
        id?: string;
        email?: string;
        full_name?: string;
        sidebar_permissions?: unknown;
        totp_enabled?: boolean;
      };
    };
    if (!json?.ok || !json.admin?.id) {
      return { ok: false, reason: "not_admin" };
    }
    return {
      ok: true,
      admin: {
        id: json.admin.id,
        full_name: (json.admin.full_name || "").trim(),
        email: (json.admin.email || "").toLowerCase().trim(),
        is_active: true,
        sidebar_permissions: Array.isArray(json.admin.sidebar_permissions)
          ? (json.admin.sidebar_permissions as unknown[]).filter(
              (p): p is string => typeof p === "string"
            )
          : [],
        totp_enabled: json.admin.totp_enabled === true,
      },
    };
  } catch {
    return { ok: false, reason: "unauthenticated" };
  }
}

/* ---------------------------------------------
   🛡️ AUTH HARDENING (Fix 1) — refresh-then-retry.
   `/api/auth/me` "unauthenticated" (401) dönerse access token süresi
   dolmuş olabilir; önce `/api/auth/refresh` (rotation) denenir, başarılıysa
   `/me` bir kez daha çağrılır. Yalnız refresh de başarısızsa unauthenticated
   döner (→ caller logout). 403 "inactive" / not_admin refresh DENEMEZ
   (kesin durumlar; refresh zaten is_active'i doğrular). Additive: mevcut
   /me davranışı korunur, üzerine tek retry eklenir.
---------------------------------------------- */
async function tryRefreshAccess(): Promise<boolean> {
  try {
    const r = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function lookupCurrentAdminNative(): Promise<AdminLookupResult> {
  const first = await fetchMeOnce();
  if (first.ok || first.reason !== "unauthenticated") {
    return first;
  }
  // Access expired olabilir → refresh dene, başarılıysa /me tekrar.
  const refreshed = await tryRefreshAccess();
  if (!refreshed) {
    return first; // refresh de başarısız → gerçekten oturum yok.
  }
  return fetchMeOnce();
}

/* ---------------------------------------------
   lookupCurrentAdmin — neden başarısız olduğunu da döner
   (login flow inactive vs not-found ayrımı için)
---------------------------------------------- */
export async function lookupCurrentAdmin(): Promise<AdminLookupResult> {
  /* 🛡️ FAZ 4 — Native tek yol. Tarayıcı DB'ye erişmez → admin lookup
     server'da (`/api/auth/me`); native access cookie doğrulanır. */
  return lookupCurrentAdminNative();
}

/* ---------------------------------------------
   requireAdmin — yetkisizse throw eder
---------------------------------------------- */
export async function requireAdmin(): Promise<AdminAuthRecord> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    throw new Error("Yetki gerekli");
  }
  return admin;
}

/* ---------------------------------------------
   signOutAdmin — eski sağlayıcı signOut wrapper
---------------------------------------------- */
export async function signOutAdmin(): Promise<void> {
  /* FAZ 39: authProvider.signOut delege; idempotent. Result envelope
     yüzeye taşınmaz (caller mevcut signature `Promise<void>` bekliyor). */
  await authProvider.signOut();
}
