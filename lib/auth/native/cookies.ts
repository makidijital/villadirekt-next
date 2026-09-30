import "server-only";

import { cookies } from "next/headers";

import {
  getAccessTtlSeconds,
  getRefreshTtlSeconds,
  getTotpPendingTtlSeconds,
} from "./jwt";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  MARKER_COOKIE,
  PENDING_2FA_COOKIE,
  COOKIE_SECURE as SECURE,
} from "./cookie-names";

/* ===============================================================
   🛡️ FAZ 1 (NATIVE AUTH) — COOKIE HELPER (server-only)
   ===============================================================
   AMAÇ:
     Native session cookie'lerini yaz/oku/sil. HttpOnly + Secure +
     SameSite + `__Host-` prefix (host-kilidi). Yalnız Route Handler /
     Server Action context'inde yazılabilir (Next `cookies()` mutasyonu).

   ⚠️ HENÜZ WIRE EDİLMEDİ — kimse çağırmıyor. Altyapı hazır bekliyor.

   COOKIE'LER:
     __Host-admin_at  → access JWT.  HttpOnly, Secure, SameSite=Lax,
                        Path=/, Domain YOK (__Host- kuralı), Max-Age=access TTL.
     __Host-admin_rt  → opaque refresh. HttpOnly, Secure, SameSite=Strict,
                        Path=/, Domain YOK. remember=true → Max-Age=refresh TTL;
                        false → session cookie (Max-Age YOK → tarayıcı kapanınca uçar).

   ⚠️ `__Host-` gereği: Secure + Path=/ + Domain YOK. Bu yüzden refresh
     cookie'si de Path=/ (dar path yerine). httpOnly olduğu ve yalnız
     server okuduğu için bu güvenliği düşürmez.

   ⚠️ Secure: AUTH_COOKIE_SECURE=false ile yalnız LOCAL http-dev'de
     kapatılabilir (o durumda `__Host-` prefix'i düşürülür, çünkü
     Secure'suz `__Host-` tarayıcıda reddedilir). Production'da default true.
   =============================================================== */

/* Cookie İSİMLERİ + SECURE → edge-safe `./cookie-names` tek kaynağından
   (yukarıda import edildi) — middleware ile ortak. */

export const NATIVE_COOKIE_NAMES = {
  access: ACCESS_COOKIE,
  refresh: REFRESH_COOKIE,
} as const;

/* ---------------------------------------------------------------
   WRITE
--------------------------------------------------------------- */
export async function setAuthCookies(
  accessToken: string,
  refreshToken: string,
  remember: boolean
): Promise<void> {
  const jar = await cookies();

  jar.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: getAccessTtlSeconds(),
  });

  jar.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: SECURE,
    sameSite: "strict",
    path: "/",
    // remember=false → session cookie (maxAge verilmez).
    ...(remember ? { maxAge: getRefreshTtlSeconds() } : {}),
  });
}

/** Access cookie'yi tek başına tazele (refresh rotation sırasında). */
export async function setAccessCookie(accessToken: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: getAccessTtlSeconds(),
  });
}

/* ---------------------------------------------------------------
   READ
--------------------------------------------------------------- */
export async function readAccessCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACCESS_COOKIE)?.value ?? null;
}

export async function readRefreshCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(REFRESH_COOKIE)?.value ?? null;
}

/* ---------------------------------------------------------------
   CLEAR — logout. Aynı path/secure ile silinmeli, yoksa kalır.
--------------------------------------------------------------- */
export async function clearAuthCookies(): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, "", {
    httpOnly: true,
    secure: SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  jar.set(REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: SECURE,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

/* ---------------------------------------------------------------
   MARKER COOKIE — middleware redirect hint (`admin-session=1`)
   ---------------------------------------------------------------
   Mevcut `AdminSessionGuard` client-side `document.cookie` ile set/clear
   ediyor; middleware yalnız value==="1" okur. Native login SERVER-side
   aynı marker'ı set eder → değişmemiş middleware redirect gate'i ilk
   navigasyonda (AdminSessionGuard mount olmadan) da geçer. non-httpOnly
   (client'ın da temizleyebilmesi için — mevcut davranışla uyumlu).
   ⚠️ FAZ 3: native middleware marker'a BAĞLI DEĞİL (native cookie'leri
   doğrular); marker yalnız eski sağlayıcı-mode middleware için. Tam kaldırma FAZ 4. */

export async function setMarkerCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(MARKER_COOKIE, "1", {
    httpOnly: false,
    secure: SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: 86_400,
  });
}

export async function clearMarkerCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(MARKER_COOKIE, "", {
    httpOnly: false,
    secure: SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/* ---------------------------------------------------------------
   🛡️ TOTP 2FA — PENDING COOKIE
   ---------------------------------------------------------------
   Şifre doğrulandı, TOTP kodu bekleniyor durumunda kullanılan ayrı,
   dar-amaçlı cookie. HttpOnly (client JS okuyamaz) ama `__Host-admin_at`
   İLE ASLA KARIŞTIRILMAZ — ayrı isim, ayrı kısa TTL, ayrı claim tipi
   (`TotpPendingClaims`, bkz. `jwt.ts`). Middleware ve
   `authorizeAdminCaller`/`authorizeAdminSession` bu cookie'yi
   TANIMAZ — yalnız `/api/auth/2fa/verify` okur.
--------------------------------------------------------------- */
export async function setPendingTotpCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    secure: SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: getTotpPendingTtlSeconds(),
  });
}

export async function readPendingTotpCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(PENDING_2FA_COOKIE)?.value ?? null;
}

export async function clearPendingTotpCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(PENDING_2FA_COOKIE, "", {
    httpOnly: true,
    secure: SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
