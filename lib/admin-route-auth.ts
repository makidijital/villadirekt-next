import "server-only";

import { authVerifier } from "@/lib/auth/server";
/* 🛡️ Native auth: access JWT httpOnly
   cookie'den okunur, `authorizeAdminToken` (native jose verify) doğrular. */
import { readAccessCookie } from "@/lib/auth/native/cookies";
/* 🛡️ AR-P2 — admin_users lookup native repo'ya repoint (dbAdmin
   service-role SELECT yerine dbAdminNative). verifyToken (native auth)
   DEĞİŞMEDİ; yalnız DB lookup native. */
import { adminUserServerRepository } from "@/lib/db/admin-user.repository.server";

/* ===============================================================
   🔥 ADMIN ROUTE AUTHORIZER — TEK HELPER
   ===============================================================
   Server-side route'larda caller'ın admin olup olmadığını
   doğrular. Authorization: Bearer <access_token> header'ı bekler.

   Flow:
     1. Bearer token parse
     2. native oturum doğrulama(token) → auth user
     3. admin_users lookup:
          - önce auth_user_id ile (yeni kayıtlar)
          - bulunamazsa email ile (eski kayıtlar — backward compat)
     4. is_active kontrolü
     5. Caller record döner

   Sadece sunucu (route handler) tarafından kullanılır;
   client component'lere import edilmez.
   =============================================================== */

export type AuthorizedAdminCaller = {
  /** admin_users.id (uuid) */
  id: string;
  /** admin_users.auth_user_id (uuid) */
  authUserId: string;
  email: string;
  is_active: boolean;
};

export type AuthorizeResult =
  | { ok: true; caller: AuthorizedAdminCaller }
  | { ok: false; status: number; error: string };

/* ---------------------------------------------
   🔥 CORE — authorizeAdminToken(token)
   - Token doğrulama + admin_users lookup
   - Bearer header, query param, ya da başka bir kaynaktan
     gelen ham token string'i ile kullanılabilir.
---------------------------------------------- */
export async function authorizeAdminToken(
  rawToken: string | null | undefined
): Promise<AuthorizeResult> {
  const token = (rawToken || "").toString().trim();
  if (!token) {
    return { ok: false, status: 401, error: "Geçersiz token" };
  }

  /* FAZ 39: authVerifier.verifyToken delege; service-role context
     provider içinde (dbAdmin); "Oturum doğrulanamadı"
     mesajı route-edge'de aynen. authVerifier `@/lib/auth/server`
     barrel'ından gelir; `import "server-only"` chain'i ile korunur. */
  const verify = await authVerifier.verifyToken(token);
  if (!verify.ok) {
    return {
      ok: false,
      status: 401,
      error: "Oturum doğrulanamadı",
    };
  }

  const authUserId = verify.value.id;
  const email = (verify.value.email || "")
    .toLowerCase()
    .trim();

  /* ---------- LOOKUP ---------- */
  // 1) Yeni kayıtlar: auth_user_id öncelikli
  let row: {
    id: string;
    email: string | null;
    is_active: boolean | null;
  } | null = null;

  if (authUserId) {
    const { data, error } =
      await adminUserServerRepository.findAuthByAuthUserId(authUserId);
    if (error) {
      console.error(
        "[admin-route-auth.lookup] auth_user_id FAILED",
        error.message
      );
      // continue to email fallback
    } else {
      row = data;
    }
  }

  // 2) Eski kayıtlar: email fallback
  if (!row && email) {
    const { data, error } =
      await adminUserServerRepository.findAuthByEmail(email);
    if (error) {
      return {
        ok: false,
        status: 500,
        error: "admin_users lookup hatası",
      };
    }
    row = data;
  }

  if (!row) {
    return { ok: false, status: 403, error: "Yetkisiz" };
  }
  if (!row.is_active) {
    return {
      ok: false,
      status: 403,
      error: "Hesabınız pasif durumda",
    };
  }

  return {
    ok: true,
    caller: {
      id: row.id,
      authUserId,
      email: (row.email || email).toLowerCase().trim(),
      is_active: !!row.is_active,
    },
  };
}

/* ---------------------------------------------
   🔥 authorizeAdminCaller(req) — FAZ 4 NATIVE
   POST/JSON route'ları. Access JWT httpOnly cookie'den okunur (adminFetch
   native modda Bearer eklemez; cookie same-origin otomatik gider).
---------------------------------------------- */
export async function authorizeAdminCaller(
  req: Request
): Promise<AuthorizeResult> {
  void req; // cookie-based; req gövdesi kullanılmıyor.
  const token = await readAccessCookie();
  if (!token) {
    return { ok: false, status: 401, error: "Oturum bulunamadı" };
  }
  return authorizeAdminToken(token);
}

/* ---------------------------------------------
   🔥 authorizeAdminSession() — FAZ 4 NATIVE
   Server Action path'i. Native access cookie → authorizeAdminToken.
--------------------------------------------- */
export async function authorizeAdminSession(): Promise<AuthorizeResult> {
  const token = await readAccessCookie();
  if (!token) {
    return { ok: false, status: 401, error: "Oturum bulunamadı" };
  }
  return authorizeAdminToken(token);
}

/* ---------------------------------------------
   🔥 authorizeAdminCallerFlex(req) — FAZ 4 NATIVE
   GET-and-open-new-tab (voucher PDF): same-origin GET'te httpOnly cookie
   otomatik gider → cookie öncelikli; yoksa ?token fallback (edge-case).
---------------------------------------------- */
export async function authorizeAdminCallerFlex(
  req: Request
): Promise<AuthorizeResult> {
  let token: string | null = await readAccessCookie();
  if (!token) {
    try {
      const url = new URL(req.url);
      const q = url.searchParams.get("token");
      if (q && q.trim()) token = q.trim();
    } catch {
      // URL parse error → token yok kabul et
    }
  }
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Yetkilendirme tokenı eksik",
    };
  }
  return authorizeAdminToken(token);
}
