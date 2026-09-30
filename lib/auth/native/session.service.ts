import "server-only";

import {
  signAccessToken,
  getRefreshTtlSeconds,
  verifyAccessToken,
  type AccessTokenClaims,
} from "./jwt";
import { generateRefreshToken, hashRefreshToken } from "./refresh-token";
import {
  setAuthCookies,
  clearAuthCookies,
  readAccessCookie,
  readRefreshCookie,
} from "./cookies";
import { adminSessionServerRepository } from "@/lib/db/admin-session.repository.server";
import { adminUserServerRepository } from "@/lib/db/admin-user.repository.server";

/* ===============================================================
   🛡️ FAZ 1 (NATIVE AUTH) — SESSION SERVICE (server-only)
   ===============================================================
   Native session yaşam döngüsü orkestrasyonu: JWT + cookie + DB
   session repo'yu birleştirir. Yalnız mevcut native repo/provider
   mimarisini kullanır; YENİ abstraction yok.

   ⚠️ HENÜZ WIRE EDİLMEDİ — middleware/route/login bunu çağırmıyor.
     Altyapı hazır bekliyor (FAZ 2/3'te tüketilecek).

   FONKSİYONLAR:
     issueSession   → login başarısında access+refresh üret, DB'ye yaz,
                      cookie set.
     readAccessClaims → access cookie doğrula (DB'siz, hızlı).
     refreshSession → refresh cookie ile rotation + yeni access.
     revokeCurrent  → logout: session iptal + cookie temizle.
   =============================================================== */

export interface SessionAdmin {
  id: string;
  email: string;
  perms: string[];
}

export interface IssueSessionOptions {
  remember: boolean;
  ip: string | null;
  userAgent: string | null;
}

export type SessionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function normalizePerms(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((p): p is string => typeof p === "string")
    : [];
}

/* ---------------------------------------------------------------
   ISSUE — login başarısında
--------------------------------------------------------------- */
export async function issueSession(
  admin: SessionAdmin,
  opts: IssueSessionOptions
): Promise<SessionResult<{ sessionId: string }>> {
  const refreshToken = generateRefreshToken();
  const refreshHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(
    Date.now() + getRefreshTtlSeconds() * 1000
  ).toISOString();

  const { data, error } = await adminSessionServerRepository.create({
    admin_id: admin.id,
    refresh_token_hash: refreshHash,
    user_agent: opts.userAgent,
    ip: opts.ip,
    remember: opts.remember,
    expires_at: expiresAt,
  });
  if (error || !data) {
    return { ok: false, error: error?.message || "Oturum oluşturulamadı" };
  }

  const claims: AccessTokenClaims = {
    sub: admin.id,
    email: admin.email,
    sid: data.id,
    perms: admin.perms,
    typ: "access",
  };
  const accessToken = await signAccessToken(claims);
  await setAuthCookies(accessToken, refreshToken, opts.remember);

  return { ok: true, value: { sessionId: data.id } };
}

/* ---------------------------------------------------------------
   READ — access cookie doğrula (DB'siz)
--------------------------------------------------------------- */
export async function readAccessClaims(): Promise<AccessTokenClaims | null> {
  const token = await readAccessCookie();
  if (!token) return null;
  const result = await verifyAccessToken(token);
  return result.ok ? result.claims : null;
}

/* ---------------------------------------------------------------
   REFRESH — rotation + yeni access
--------------------------------------------------------------- */
export async function refreshSession(): Promise<
  SessionResult<{ sessionId: string; adminId: string }>
> {
  const refreshToken = await readRefreshCookie();
  if (!refreshToken) {
    return { ok: false, error: "Refresh token yok" };
  }
  const refreshHash = hashRefreshToken(refreshToken);
  const nowIso = new Date().toISOString();

  const { data: session, error } =
    await adminSessionServerRepository.findActiveByRefreshHash(
      refreshHash,
      nowIso
    );
  if (error) {
    return { ok: false, error: "Oturum doğrulanamadı" };
  }
  if (!session) {
    return { ok: false, error: "Oturum bulunamadı veya süresi doldu" };
  }

  // Admin hâlâ aktif mi + güncel claim'ler.
  const { data: admin } =
    await adminUserServerRepository.findByIdForSession(session.admin_id);
  if (!admin || !admin.is_active) {
    // Admin pasif → session'ı iptal et, cookie temizle.
    await adminSessionServerRepository.revokeById(session.id, nowIso);
    await clearAuthCookies();
    return { ok: false, error: "Hesap pasif" };
  }

  // Refresh rotation — yeni token, eski hash geçersiz.
  const newRefresh = generateRefreshToken();
  const newHash = hashRefreshToken(newRefresh);
  const { error: rotErr } = await adminSessionServerRepository.rotate(
    session.id,
    { refresh_token_hash: newHash, last_used_at: nowIso }
  );
  if (rotErr) {
    return { ok: false, error: "Oturum yenilenemedi" };
  }

  const claims: AccessTokenClaims = {
    sub: admin.id,
    email: (admin.email || "").toLowerCase(),
    sid: session.id,
    perms: normalizePerms(admin.sidebar_permissions),
    typ: "access",
  };
  const accessToken = await signAccessToken(claims);
  await setAuthCookies(accessToken, newRefresh, session.remember);

  return { ok: true, value: { sessionId: session.id, adminId: admin.id } };
}

/* ---------------------------------------------------------------
   REVOKE — logout
--------------------------------------------------------------- */
export async function revokeCurrentSession(): Promise<void> {
  const refreshToken = await readRefreshCookie();
  if (refreshToken) {
    const nowIso = new Date().toISOString();
    const { data: session } =
      await adminSessionServerRepository.findActiveByRefreshHash(
        hashRefreshToken(refreshToken),
        nowIso
      );
    if (session) {
      await adminSessionServerRepository.revokeById(session.id, nowIso);
    }
  }
  await clearAuthCookies();
}
