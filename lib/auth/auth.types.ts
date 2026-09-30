/* ===============================================================
   🛡️ FAZ 39 — AUTH PROVIDER TYPES
   ===============================================================
   Provider-agnostic shape'ler. native auth'a özgü hiçbir field
   yok; gelecekteki adapter'lar (NextAuth, Clerk, Better Auth,
   custom JWT) aynı kontratı uygular.
   =============================================================== */

/** Provider-agnostic kullanıcı temsil. id + email yeterli minimum;
 *  diğer profile data (full_name, avatar) provider'a göre differ
 *  ediyorsa caller kendi domain repo'sundan çeker (örn.
 *  admin_users tablosu). */
export type AuthUser = {
  id: string;
  email: string | null;
};

/** Provider-agnostic session temsil. accessToken Bearer auth için
 *  kullanılır (`adminFetch` Authorization header). refreshToken
 *  provider içinde gizli kalır — caller dokunmaz. */
export type AuthSession = {
  user: AuthUser;
  accessToken: string;
  /** Optional — provider'a göre var/yok. */
  expiresAt?: number;
};

/** Sign-in input — şimdilik email/password; OAuth/passwordless
 *  gelecek cycle'da union ile genişletilebilir. */
export type SignInWithPasswordInput = {
  email: string;
  password: string;
};

/** Result envelope — caller throw etmez; result.ok ile branch'ler.
 *  `code` — OPTIONAL, ADDITIVE (🛡️ TOTP 2FA). Yalnız native
 *  `signInWithPassword`'un "şifre doğru ama 2FA kodu gerekli" durumu
 *  için (`code:"totp_required"`) kullanılır; mevcut caller'lar bu
 *  alanı YOK SAYAR (backward-compatible — hiçbir mevcut branch
 *  bozulmaz), yalnız login/page.tsx bunu explicit kontrol eder. */
export type AuthResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code?: string };

/** onAuthStateChange event — minimum şart: SIGNED_IN / SIGNED_OUT
 *  / TOKEN_REFRESHED. native ek event'ler (USER_UPDATED,
 *  PASSWORD_RECOVERY) string passthrough; caller `event` üzerine
 *  switch yapmıyor (sadece "var/yok" semantic'ine bakıyor). */
export type AuthStateEvent =
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY"
  | "INITIAL_SESSION"
  | string;

/** Listener callback signature. */
export type AuthStateChangeCallback = (
  event: AuthStateEvent,
  session: AuthSession | null
) => void;

/** Listener subscription handle. */
export type AuthStateSubscription = {
  unsubscribe: () => void;
};

/** Server-only — admin (service-role) operations. Provider içinde
 *  ayrı interface (`AdminAuthProvider`); ana `AuthProvider`'a
 *  karıştırılmaz (privilege boundary). */
export type CreateAdminUserInput = {
  email: string;
  password: string;
  emailConfirm?: boolean;
  /* 🛡️ FAZ 1 (NATIVE AUTH) — ADDITIVE optional alanlar. eski sağlayıcı
     provider bunları YOK SAYAR (yalnız email/password/emailConfirm
     kullanır) → mevcut davranış birebir korunur. Native provider,
     admin_users satırını tek adımda kurarken kullanır (native'de
     "auth user" ile "admin_users" aynı tablodur). */
  fullName?: string;
  sidebarPermissions?: string[];
  /* 🛡️ FAZ 4 — is_active (native admin_users). eski sağlayıcı provider silindi;
     native provider bunu insertNative'e geçirir (default true). */
  isActive?: boolean;
};

export type CreatedAdminUser = {
  id: string;
  email: string;
};
