import type { AuthProvider } from "../auth.provider";
import type {
  AuthResult,
  AuthSession,
  AuthStateChangeCallback,
  AuthStateSubscription,
  AuthUser,
  SignInWithPasswordInput,
} from "../auth.types";

/* ===============================================================
   🛡️ FAZ 2 (NATIVE AUTH) — NATIVE CLIENT AUTH PROVIDER (client-safe)
   ===============================================================
   `AuthProvider` interface'inin native implementasyonu. DB client
   client YERİNE native `/api/auth/*` endpoint'lerine `fetch` atar. Token'lar
   httpOnly cookie'de → JS erişmez; bu yüzden `accessToken` boş string
   döner (Bearer değil, cookie-session kullanılır — Bearer/adminFetch
   cutover'ı FAZ 3).

   ⚠️ SADECE `NEXT_PUBLIC_AUTH_PROVIDER=native` iken `lib/auth/index.ts`
   switch'i bunu seçer. Default eski sağlayıcı → bu dosya kullanılmaz.

   ⚠️ onAuthStateChange: native'de client push-event yok → no-op
   subscription. `AdminSessionGuard` mount'ta `getCurrentAdmin` ile
   durumu zaten çeker; marker cookie native login'de server-side set edilir.
   =============================================================== */

async function postJson(
  url: string,
  body?: unknown
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function readMeUser(json: unknown): AuthUser | null {
  const j = json as { ok?: boolean; admin?: { id?: string; email?: string } };
  if (!j || j.ok !== true || !j.admin?.id) return null;
  return { id: j.admin.id, email: j.admin.email ?? null };
}

export const nativeAuthProvider: AuthProvider = {
  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const res = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "same-origin",
      });
      if (!res.ok) return null;
      return readMeUser(await res.json());
    } catch {
      return null;
    }
  },

  async getSession(): Promise<AuthSession | null> {
    const user = await this.getCurrentUser();
    if (!user) return null;
    // Native: token httpOnly cookie'de → JS'e verilmez. accessToken boş
    // (cookie-session). Bearer akışı FAZ 3'te cutover edilir.
    return { user, accessToken: "" };
  },

  async signInWithPassword(
    input: SignInWithPasswordInput
  ): Promise<AuthResult<AuthSession>> {
    try {
      const { status, json } = await postJson("/api/auth/login", {
        email: input.email,
        password: input.password,
      });
      const body = json as { ok?: boolean; error?: string; code?: string };
      /* 🛡️ TOTP 2FA — ADDITIVE. Şifre doğru ama 2FA kodu gerekli; henüz
         HİÇBİR session yok (yalnız dar-amaçlı pending cookie server'da
         set edildi). `code` alanı caller'a (login/page.tsx) geçirilir;
         status 200 olsa da bu bir "başarı" DEĞİL — `ok:false` kalır. */
      if (body?.code === "totp_required") {
        return {
          ok: false,
          error: body.error || "Doğrulama kodu gerekli",
          code: "totp_required",
        };
      }
      if (status !== 200) {
        const err = body?.error || "Oturum açılamadı";
        return { ok: false, error: err };
      }
      const user = readMeUser(json);
      if (!user) return { ok: false, error: "Oturum okunamadı" };
      return { ok: true, value: { user, accessToken: "" } };
    } catch {
      return { ok: false, error: "Sunucuya ulaşılamadı" };
    }
  },

  async signOut(): Promise<AuthResult<void>> {
    try {
      await postJson("/api/auth/logout");
      return { ok: true, value: undefined };
    } catch {
      return { ok: false, error: "Çıkış yapılamadı" };
    }
  },

  async refreshSession(): Promise<AuthResult<AuthSession>> {
    try {
      const { status } = await postJson("/api/auth/refresh");
      if (status !== 200) return { ok: false, error: "Token yenilenemedi" };
      const user = await this.getCurrentUser();
      if (!user) return { ok: false, error: "Oturum okunamadı" };
      return { ok: true, value: { user, accessToken: "" } };
    } catch {
      return { ok: false, error: "Token yenilenemedi" };
    }
  },

  onAuthStateChange(
    callback: AuthStateChangeCallback
  ): AuthStateSubscription {
    // Native'de client push-event yok → no-op subscription.
    void callback;
    return { unsubscribe: () => {} };
  },
};
