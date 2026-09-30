/* ===============================================================
   🛡️ NATIVE AUTH — COOKIE NAMES (EDGE-SAFE, saf)
   ===============================================================
   Cookie İSİM türetimi (Node crypto / next/headers / server-only YOK) →
   hem Edge middleware hem server route/action import edebilir. Değerler
   `cookies.ts` (server yazma/okuma) ile ortak tek kaynak.

   `__Host-` prefix yalnız Secure iken geçerli; AUTH_COOKIE_SECURE=false
   (yalnız local http-dev) → prefix'siz düz isim.
   =============================================================== */

export const COOKIE_SECURE =
  (process.env.AUTH_COOKIE_SECURE ?? "true").toLowerCase() !== "false";

export const ACCESS_COOKIE = COOKIE_SECURE ? "__Host-admin_at" : "admin_at";
export const REFRESH_COOKIE = COOKIE_SECURE ? "__Host-admin_rt" : "admin_rt";

/** Middleware redirect-hint marker (eski sağlayıcı modunda kullanılır; native
 *  middleware buna bağlı DEĞİL — native cookie'leri doğrular). */
export const MARKER_COOKIE = "admin-session";

/** 🛡️ TOTP 2FA — pending-auth cookie (şifre doğrulandı, TOTP kodu
 *  bekleniyor). GERÇEK SESSION COOKIE'Sİ DEĞİL — middleware/
 *  authorizeAdminCaller bu ismi TANIMAZ (yalnız ACCESS_COOKIE/
 *  REFRESH_COOKIE bilirler) → hiçbir korumalı route'ta gerçek
 *  session yerine geçemez. */
export const PENDING_2FA_COOKIE = COOKIE_SECURE
  ? "__Host-admin_2fa_pending"
  : "admin_2fa_pending";
