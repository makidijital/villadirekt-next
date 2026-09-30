import type {
  AuthResult,
  AuthSession,
  AuthStateChangeCallback,
  AuthStateSubscription,
  AuthUser,
  CreateAdminUserInput,
  CreatedAdminUser,
  SignInWithPasswordInput,
} from "./auth.types";

/* ===============================================================
   🛡️ FAZ 39 — AUTH PROVIDER INTERFACE
   ===============================================================
   Auth provider için minimum kontrat. native auth / NextAuth /
   Clerk / Better Auth / custom JWT aynı interface'i uygular.

   ⚠️ KESIN KURAL — METHOD SEMANTIK:
     getCurrentUser     → şu anki oturum kullanıcısı (anon client
                          context). Yoksa null.
     getSession         → session + accessToken; yoksa null.
                          Caller Bearer auth için kullanır.
     signInWithPassword → email/password ile giriş; Result envelope.
                          Cookie/storage davranışı provider'a özel
                          ama caller bunu görmez.
     signOut            → session sil; idempotent.
     refreshSession     → token yenile; çoğu provider otomatik
                          yapıyor, ama explicit trigger için.
     onAuthStateChange  → state change listener; unsubscribe handle.
     verifyToken        → server-side: Bearer token doğrula + user
                          döner. Service-role context (admin client).

   ⚠️ Provider sessiz hata yönetir; throw etmez (UI'da exception
   storm önlenir). Caller branch'leyerek mesaj/redirect yapar.

   PRIVILEGE BOUNDARY:
     - AuthProvider: anon client (browser + server). RLS uygulanır.
     - AdminAuthProvider: service-role client. RLS bypass; YALNIZ
       server-only modüllerde kullanılır.
   =============================================================== */

export interface AuthProvider {
  /** Current user from session (anon client context). */
  getCurrentUser(): Promise<AuthUser | null>;

  /** Current session + accessToken. Yoksa null. */
  getSession(): Promise<AuthSession | null>;

  /** Email/password sign-in. */
  signInWithPassword(
    input: SignInWithPasswordInput
  ): Promise<AuthResult<AuthSession>>;

  /** Sign out — idempotent. */
  signOut(): Promise<AuthResult<void>>;

  /** Manuel token refresh (çoğu provider otomatik yapar). */
  refreshSession?(): Promise<AuthResult<AuthSession>>;

  /** Auth state listener. Subscription handle ile unsubscribe. */
  onAuthStateChange(
    callback: AuthStateChangeCallback
  ): AuthStateSubscription;
}

/** Server-side Bearer token doğrulama için AYRI interface — ana
 *  `AuthProvider`'a karıştırılmaz. `verifyToken` service-role
 *  context gerektirir (admin client; herhangi bir kullanıcının
 *  token'ını decode edebilmek için). CLIENT bundle'a sızmaması
 *  için implementation'ı `import "server-only"` ile korunur
 *  (`lib/auth/native/native-auth.server.ts`). authorizeAdminToken/
 *  Caller'da yalnız server-only path'ten kullanılır. */
export interface AuthTokenVerifier {
  /** Server-side Bearer token doğrula → AuthUser veya error. */
  verifyToken(token: string): Promise<AuthResult<AuthUser>>;
}

/** Service-role privilege için ayrı interface — accident-proof
 *  boundary. Sadece server-only modüllerden tüketilir. */
export interface AdminAuthProvider {
  /** Create user via service-role (email_confirm flag dahil). */
  createUser(
    input: CreateAdminUserInput
  ): Promise<AuthResult<CreatedAdminUser>>;
}
