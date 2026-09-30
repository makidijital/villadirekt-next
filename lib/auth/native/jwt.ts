import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

/* ===============================================================
   🛡️ NATIVE AUTH — JWT HELPER (jose, HS256) — EDGE-SAFE
   ===============================================================
   AMAÇ:
     Native access token (imzalı JWT) üret/doğrula.

   ⚠️ EDGE-SAFE (FAZ 3):
     Bu modül YALNIZ `jose` (Web Crypto) + `process.env` kullanır — Node
     `crypto` ve `server-only` YOK → Edge middleware DE import edebilir
     (native JWT doğrulaması edge'de yapılır). Opaque refresh token üretimi
     Node crypto gerektirdiğinden `refresh-token.ts` (server-only) modülüne
     AYRILDI.

   ⚠️ Secret client bundle'a sızsa bile değer NEXT_PUBLIC olmadığından
     client'ta `undefined` → `getSecretKey()` throw eder (secret SIZMAZ);
     `server-only` yerine bu env-gating koruma sağlar.

   SECRET:
     `AUTH_JWT_SECRET` (min 32 char) HS256 simetrik anahtar. LAZY okunur
     (import-time throw YOK). `kid` rotation için `AUTH_JWT_KID`.
   =============================================================== */

const ALG = "HS256";

/** Access token claim'leri (native session). */
export interface AccessTokenClaims {
  /** admin_users.id (uuid) */
  sub: string;
  email: string;
  /** admin_sessions.id (uuid) — hedefli revocation için. */
  sid: string;
  /** UI ipucu; yetki kararı DB'den doğrulanır. */
  perms: string[];
  typ: "access";
}

export type VerifyResult =
  | { ok: true; claims: AccessTokenClaims }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "bad_alg" };

/* ---------------------------------------------------------------
   ENV (lazy)
--------------------------------------------------------------- */
function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_JWT_SECRET tanımlı değil veya <32 karakter — native JWT imzası için zorunlu (server-only)."
    );
  }
  return new TextEncoder().encode(secret);
}

function getKid(): string {
  return (process.env.AUTH_JWT_KID || "v1").trim();
}

/** Access token ömrü (saniye). Default 900 (15 dk). */
export function getAccessTtlSeconds(): number {
  const n = Number(process.env.AUTH_ACCESS_TTL);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 900;
}

/** Refresh token ömrü (saniye). Default 2592000 (30 gün). */
export function getRefreshTtlSeconds(): number {
  const n = Number(process.env.AUTH_REFRESH_TTL);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2_592_000;
}

/* ---------------------------------------------------------------
   ACCESS TOKEN — sign / verify (jose)
--------------------------------------------------------------- */
export async function signAccessToken(
  claims: AccessTokenClaims
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    email: claims.email,
    sid: claims.sid,
    perms: claims.perms,
    typ: "access",
  })
    .setProtectedHeader({ alg: ALG, kid: getKid() })
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + getAccessTtlSeconds())
    .sign(getSecretKey());
}

export async function verifyAccessToken(token: string): Promise<VerifyResult> {
  if (!token) return { ok: false, reason: "malformed" };
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: [ALG],
    });
    /* 🛡️ H-1 SECURITY FIX — `typ` claim ZORUNLU kontrol.
       ⚠️ ÖNCEDEN: yalnız imza + `sub` kontrol ediliyordu → AYNI
       AUTH_JWT_SECRET ile imzalanan `totp_pending` token'ı (bkz.
       `signTotpPendingToken` aşağıda) da imza+sub açısından "geçerli"
       olduğundan burada YANLIŞLIKLA kabul ediliyordu (type confusion).
       Bu satır olmadan: middleware.ts / readAccessClaims (session.
       service.ts) / native-auth.server.ts → authorizeAdminToken zinciri
       pending token'ı gerçek access token sanabiliyordu. ŞİMDİ: yalnız
       `typ==="access"` olan token'lar kabul edilir; `totp_pending`,
       başka herhangi bir değer veya eksik `typ` → "malformed" (kesin
       red). Normal access token formatı/claim yükü DEĞİŞMEDİ — bu
       yalnız DOĞRULAMA sıkılaştırması. */
    const typ = typeof payload.typ === "string" ? payload.typ : "";
    if (typ !== "access") {
      return { ok: false, reason: "malformed" };
    }
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    const sid = typeof payload.sid === "string" ? payload.sid : "";
    const perms = Array.isArray(payload.perms)
      ? (payload.perms as unknown[]).filter(
          (p): p is string => typeof p === "string"
        )
      : [];
    if (!sub) return { ok: false, reason: "malformed" };
    return { ok: true, claims: { sub, email, sid, perms, typ: "access" } };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return { ok: false, reason: "expired" };
    }
    if (err instanceof joseErrors.JOSEAlgNotAllowed) {
      return { ok: false, reason: "bad_alg" };
    }
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
      return { ok: false, reason: "bad_signature" };
    }
    return { ok: false, reason: "malformed" };
  }
}

/* Refresh token üretimi/hash'i (Node crypto) → `refresh-token.ts`
   (server-only, edge-dışı). Bu modül edge-safe kalır. */

/* ===============================================================
   🛡️ TOTP 2FA — PENDING-AUTH TOKEN (edge-safe, jose)
   ===============================================================
   AMAÇ:
     Şifre doğrulandı AMA totp_enabled=true olduğu için gerçek admin
     session'ı (issueSession/access+refresh cookie) HENÜZ kurulamaz.
     Bu ayrı, kısa ömürlü, ayrı `typ` claim'li token bunun yerini
     tutar — GERÇEK ACCESS TOKEN DEĞİL.

   ⚠️ İZOLASYON (kritik):
     - Ayrı fonksiyon (`signTotpPendingToken`/`verifyTotpPendingToken`),
       `signAccessToken`/`verifyAccessToken` İLE KARIŞTIRILMAZ.
     - Ayrı `typ:"totp_pending"` claim'i — `verifyAccessToken` bu
       token'ı artık asla "access" olarak kabul ETMEZ (🛡️ H-1 FIX:
       explicit `typ==="access"` kontrolü var — bkz. yukarıda
       `verifyAccessToken` içindeki kontrol). Ayrıca pending token
       ayrı cookie'de taşındığından (`PENDING_2FA_COOKIE` vs
       `ACCESS_COOKIE`, bkz. `cookies.ts`) normal akışta
       `verifyAccessToken`'a hiç girmez — bu iki bağımsız katman
       (typ kontrolü + cookie izolasyonu) birbirini tamamlar.
     - Ayrı, dar cookie'de taşınır (`__Host-admin_2fa_pending`) —
       middleware/authorizeAdminCaller bu cookie'yi OKUMAZ (yalnız
       ACCESS_COOKIE/REFRESH_COOKIE adlarını bilirler) → pending
       token hiçbir korumalı route'ta gerçek session yerine geçemez.
     - Claim yükü MİNİMAL: yalnız `sub` (admin id) + `typ`. perms/email
       YOK — gerçek session açılana kadar hiçbir yetki taşımaz.

   TTL: `AUTH_TOTP_PENDING_TTL` env (sn, default 300 = 5 dk).
   =============================================================== */

export interface TotpPendingClaims {
  /** admin_users.id (uuid) — şifresi doğrulanmış admin. */
  sub: string;
  typ: "totp_pending";
}

export type VerifyPendingResult =
  | { ok: true; claims: TotpPendingClaims }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "bad_alg" };

/** Pending-auth token ömrü (saniye). Default 300 (5 dk). */
export function getTotpPendingTtlSeconds(): number {
  const n = Number(process.env.AUTH_TOTP_PENDING_TTL);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 300;
}

export async function signTotpPendingToken(adminId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ typ: "totp_pending" })
    .setProtectedHeader({ alg: ALG, kid: getKid() })
    .setSubject(adminId)
    .setIssuedAt(now)
    .setExpirationTime(now + getTotpPendingTtlSeconds())
    .sign(getSecretKey());
}

export async function verifyTotpPendingToken(
  token: string
): Promise<VerifyPendingResult> {
  if (!token) return { ok: false, reason: "malformed" };
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: [ALG],
    });
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const typ = typeof payload.typ === "string" ? payload.typ : "";
    if (!sub || typ !== "totp_pending") {
      return { ok: false, reason: "malformed" };
    }
    return { ok: true, claims: { sub, typ: "totp_pending" } };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return { ok: false, reason: "expired" };
    }
    if (err instanceof joseErrors.JOSEAlgNotAllowed) {
      return { ok: false, reason: "bad_alg" };
    }
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
      return { ok: false, reason: "bad_signature" };
    }
    return { ok: false, reason: "malformed" };
  }
}
