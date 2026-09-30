import "server-only";

import { adminUserServerRepository } from "@/lib/db/admin-user.repository.server";
import {
  verifyPassword,
  hashPassword,
  timingSafeDummyVerify,
} from "./password";
import { issueSession } from "./session.service";
import { setMarkerCookie, setPendingTotpCookie } from "./cookies";
import { signTotpPendingToken } from "./jwt";

/* ===============================================================
   🛡️ FAZ 2 (NATIVE AUTH) — LOGIN SERVICE (server-only)
   ===============================================================
   Native login orkestrasyonu (yalnız /api/auth/login route'undan
   çağrılır; native flag arkasında). Adımlar:
     1) findCredentialsByEmail
     2) locked_until / is_active / password_hash guard
     3) verifyPassword (bcrypt legacy | argon2 native)
     4) fail → failed_attempts++ (+ locked_until) → generic hata
     5) success → upgrade-on-login (bcrypt → argon2id) + login state reset
     6) 🛡️ TOTP GATE (2FA) — totp_enabled=false → issueSession (native
        cookie) + marker cookie (MEVCUT DAVRANIŞ, AYNEN). totp_enabled=true
        → issueSession ÇAĞRILMAZ; onun yerine kısa ömürlü pending-auth
        token (__Host-admin_2fa_pending) set edilir, code:"totp_required"
        döner. Gerçek session yalnız /api/auth/2fa/verify başarılı
        TOTP/recovery-code sonrası issueSession'ı ÇAĞIRDIĞINDA kurulur.
   Audit çağrısı route'ta (context req'den derlenir).
   =============================================================== */

const MAX_ATTEMPTS = (() => {
  const n = Number(process.env.AUTH_LOGIN_MAX_ATTEMPTS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
})();
const LOCK_MINUTES = (() => {
  const n = Number(process.env.AUTH_LOGIN_LOCK_MINUTES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 15;
})();

export type LoginAdmin = {
  id: string;
  email: string;
  full_name: string;
  sidebar_permissions: string[];
};

export type LoginResult =
  | { ok: true; admin: LoginAdmin }
  // "invalid" → generic (kullanıcı varlığı/şifre sızdırılmaz)
  // "totp_required" → şifre DOĞRU ama 2FA kodu gerekli (henüz session YOK)
  | {
      ok: false;
      code: "invalid" | "inactive" | "locked" | "totp_required";
      error: string;
    };

function normalizePerms(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((p): p is string => typeof p === "string")
    : [];
}

export async function loginNative(
  emailRaw: string,
  password: string,
  opts: { remember: boolean; ip: string | null; userAgent: string | null }
): Promise<LoginResult> {
  const email = (emailRaw || "").toLowerCase().trim();
  if (!email || !password) {
    return { ok: false, code: "invalid", error: "Giriş bilgileri hatalı" };
  }

  const { data: creds } =
    await adminUserServerRepository.findCredentialsByEmail(email);

  // Kullanıcı yok → gerçek verify maliyetini öde (timing-parity) → generic.
  if (!creds || !creds.id) {
    await timingSafeDummyVerify(password);
    return { ok: false, code: "invalid", error: "Giriş bilgileri hatalı" };
  }

  const now = Date.now();

  // Kilit kontrolü.
  if (creds.locked_until && new Date(creds.locked_until).getTime() > now) {
    return {
      ok: false,
      code: "locked",
      error: "Çok fazla başarısız deneme — bir süre sonra tekrar deneyin",
    };
  }

  if (!creds.is_active) {
    await timingSafeDummyVerify(password);
    return { ok: false, code: "inactive", error: "Hesabınız pasif durumda" };
  }

  // Native şifre atanmamış (import edilmemiş) → generic.
  if (!creds.password_hash) {
    await timingSafeDummyVerify(password);
    return { ok: false, code: "invalid", error: "Giriş bilgileri hatalı" };
  }

  const verify = await verifyPassword(creds.password_hash, password);
  if (!verify.ok) {
    const attempts = (creds.failed_attempts ?? 0) + 1;
    const lockedUntil =
      attempts >= MAX_ATTEMPTS
        ? new Date(now + LOCK_MINUTES * 60_000).toISOString()
        : null;
    await adminUserServerRepository.recordLoginFailure(
      creds.id,
      attempts,
      lockedUntil
    );
    return { ok: false, code: "invalid", error: "Giriş bilgileri hatalı" };
  }

  // ---- BAŞARILI ----
  const nowIso = new Date(now).toISOString();

  // Upgrade-on-login: bcrypt (legacy) → Argon2id.
  if (verify.needsRehash) {
    try {
      const newHash = await hashPassword(password);
      await adminUserServerRepository.updatePasswordHash(
        creds.id,
        newHash,
        nowIso
      );
    } catch {
      /* rehash başarısızlığı login'i bozmaz (bir sonraki girişte tekrar denenir). */
    }
  }

  await adminUserServerRepository.recordLoginSuccess(creds.id, nowIso);

  /* ---------------------------------------------------------------
     🛡️ TOTP GATE — EN KRİTİK KISIM
     ---------------------------------------------------------------
     Şifre doğrulandı. `totp_enabled=false` → AŞAĞIDAKİ issueSession
     yolu MEVCUT DAVRANIŞLA BİREBİR (2FA'sız adminler için sıfır fark).
     `totp_enabled=true` → issueSession HİÇ ÇAĞRILMAZ; gerçek admin
     session (admin_sessions satırı + __Host-admin_at/__Host-admin_rt)
     yalnız /api/auth/2fa/verify'de doğru TOTP/recovery kod sonrası
     kurulur. Burada yalnız kısa ömürlü, dar-amaçlı bir pending-auth
     cookie set edilir (bkz. jwt.ts TotpPendingClaims doc).
  --------------------------------------------------------------- */
  if (creds.totp_enabled) {
    const pendingToken = await signTotpPendingToken(creds.id);
    await setPendingTotpCookie(pendingToken);
    return {
      ok: false,
      code: "totp_required",
      error: "Doğrulama kodu gerekli",
    };
  }

  const perms = normalizePerms(creds.sidebar_permissions);
  const session = await issueSession(
    { id: creds.id, email: (creds.email || email).toLowerCase(), perms },
    opts
  );
  if (!session.ok) {
    return { ok: false, code: "invalid", error: "Oturum oluşturulamadı" };
  }

  await setMarkerCookie();

  return {
    ok: true,
    admin: {
      id: creds.id,
      email: (creds.email || email).toLowerCase(),
      full_name: (creds.full_name || "").trim(),
      sidebar_permissions: perms,
    },
  };
}
