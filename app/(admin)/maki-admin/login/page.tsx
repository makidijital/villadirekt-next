"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Lock, ArrowRight, ArrowLeft, ShieldCheck } from "lucide-react";

import { authProvider } from "@/lib/auth";
import {
  lookupCurrentAdmin,
  signOutAdmin,
} from "@/lib/admin-auth";

import { getAdminLogoUrl } from "@/lib/admin-branding";
import { useAdminBrandingVersions } from "@/app/components/admin/AdminBrandingVersion";
import { adminFontVariables } from "../admin-fonts";

/* ===============================================================
   🔥 ADMIN LOGIN
   ===============================================================
   - native login
   - admin_users tablosunda email lookup + is_active kontrolü
   - inactive ise: signOut + "Hesabınız pasif durumda"
   - aksi halde: signOut + generic "Giriş bilgileri hatalı"
   - Başarıda: /maki-admin'e yönlendir (AdminSessionGuard kontrol eder)

   ⚠️ Auth/business logic dokunulmadı. Bu dosyada yalnız UI redesign:
   split-screen luxury layout, glassmorphism login card, premium
   typography ve subtle animasyonlar. State, handleSubmit, validation,
   redirect ve helper çağrıları (signInWithPassword, lookupCurrentAdmin,
   signOutAdmin, router.replace) birebir korunur.
   =============================================================== */

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  /* 🛡️ TOTP 2FA — ADDITIVE state. "password" adımı mevcut davranışla
     BİREBİR; "totp" adımına yalnız signIn.code==="totp_required" ile
     geçilir (bkz. handleSubmit). */
  const [step, setStep] = useState<"password" | "totp">("password");
  const [totpCode, setTotpCode] = useState<string>("");
  const [recoveryCode, setRecoveryCode] = useState<string>("");
  const [useRecovery, setUseRecovery] = useState<boolean>(false);

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    if (submitting) return; // duplicate submit guard

    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError("E-posta ve şifre zorunludur.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Geçerli bir e-posta gir.");
      return;
    }

    setSubmitting(true);
    try {
      /* FAZ 39: authProvider.signInWithPassword delege; Result
         envelope (`ok: false`) generic "Giriş bilgileri hatalı"
         mesajına çevrilir — kullanıcı varlığı/şifre bilgisi
         sızdırılmaz (orijinal davranış aynen). */
      const signIn = await authProvider.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (!signIn.ok) {
        /* 🛡️ TOTP 2FA — ADDITIVE. Şifre doğru ama 2FA kodu gerekli;
           HENÜZ session yok (yalnız dar-amaçlı pending cookie
           server'da set edildi). Diğer TÜM hata durumları (yanlış
           şifre, pasif hesap vb.) mevcut generic mesajla AYNEN devam
           eder — router.replace bu adımda ASLA çağrılmaz. */
        if (signIn.code === "totp_required") {
          setStep("totp");
          return;
        }
        setError("Giriş bilgileri hatalı");
        return;
      }

      // 🔥 Authorization — admin_users tablosu lookup
      const result = await lookupCurrentAdmin();
      if (!result.ok) {
        await signOutAdmin();
        if (result.reason === "inactive") {
          setError("Hesabınız pasif durumda");
        } else {
          // not_admin / unauthenticated → generic
          setError("Giriş bilgileri hatalı");
        }
        return;
      }

      // Başarılı — guard yönlendirmeyi yapar; manuel replace
      // hem hızlı hem fail-safe.
      router.replace("/maki-admin");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Bilinmeyen hata";
      console.error("[admin.login] EXCEPTION", { error: msg });
      setError("Giriş bilgileri hatalı");
    } finally {
      setSubmitting(false);
    }
  };

  /* 🛡️ TOTP 2FA — ADDITIVE. Adım 2 submit: pending cookie server'da
     doğrulanır (bu fonksiyon cookie'yi görmez/okumaz — httpOnly).
     Başarılı response mevcut şifre-akışıyla AYNI kuyruğa girer:
     lookupCurrentAdmin() + guard yönlendirmesi. */
  const handleTotpSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    if (submitting) return;

    setError("");

    const trimmedCode = totpCode.trim();
    const trimmedRecovery = recoveryCode.trim();
    if (useRecovery ? !trimmedRecovery : !/^\d{6}$/.test(trimmedCode)) {
      setError(
        useRecovery ? "Kurtarma kodu gerekli." : "6 haneli kodu eksiksiz gir."
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(
          useRecovery
            ? { recoveryCode: trimmedRecovery }
            : { code: trimmedCode }
        ),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok || !json?.ok) {
        setError(json?.error || "Geçersiz doğrulama kodu");
        return;
      }

      const result = await lookupCurrentAdmin();
      if (!result.ok) {
        await signOutAdmin();
        if (result.reason === "inactive") {
          setError("Hesabınız pasif durumda");
        } else {
          setError("Giriş bilgileri hatalı");
        }
        return;
      }

      router.replace("/maki-admin");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      console.error("[admin.login.totp] EXCEPTION", { error: msg });
      setError("Doğrulama başarısız");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackToPassword = (): void => {
    setStep("password");
    setTotpCode("");
    setRecoveryCode("");
    setUseRecovery(false);
    setError("");
  };

  return (
    <div className={`admin-shell min-h-screen flex bg-white ${adminFontVariables}`}>
      {/* ===================================================
          LEFT PANEL — premium branding (desktop only)
          - Admin sidebar palette: deep navy (#0b1220 / #111a2c)
          - Soft mesh blob accents in admin cyan + slate
          - Subtle grid texture
          - Big tracking-tight headline (Türkçe)
         =================================================== */}
      <aside
        className="hidden lg:flex relative w-1/2 xl:w-[55%] overflow-hidden"
        style={{ background: "#070b16" }}
      >
        {/* base gradient — admin sidebar palette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #0b1220 0%, #111a2c 45%, #070b16 100%)",
          }}
        />

        {/* admin cyan mesh blob */}
        <div
          className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full blur-[120px] animate-pulse"
          style={{
            background: "#0ea5e9",
            opacity: 0.16,
            animationDuration: "6s",
          }}
        />

        {/* deep slate mesh blob */}
        <div
          className="absolute -bottom-40 -right-32 w-[600px] h-[600px] rounded-full blur-[140px] animate-pulse"
          style={{
            background: "#1e3a5f",
            opacity: 0.32,
            animationDuration: "8s",
            animationDelay: "1s",
          }}
        />

        {/* Subtle grid texture */}
        <div
          className="absolute inset-0"
          style={{
            opacity: 0.04,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.35) 100%)",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between w-full p-12 xl:p-16 fade-in-up">
          {/* Top: brand mark + eyebrow */}
          <div>
            <DesktopBrandMark />
            <p className="text-[10px] tracking-[0.32em] uppercase text-white/40 mt-7 font-semibold">
              Maki Dijital · Admin · CRM
            </p>
          </div>

          {/* Middle: headline */}
          <div className="max-w-xl">
            <h1
              className="font-display text-white tracking-[-0.025em] leading-[1.05]"
              style={{ fontSize: "clamp(2.75rem, 4.5vw, 4rem)" }}
            >
              Premium Villa
              <br />
              <span style={{ color: "#7dd3fc" }}>Yönetim</span>{" "}
              Platformu
            </h1>
            <p className="text-[15px] text-white/60 mt-7 max-w-md leading-[1.7]">
              Rezervasyon, fiyatlandırma ve operasyon süreçlerini
              tek panelden yönetin.
            </p>
          </div>

          {/* Bottom: footer */}
          <div className="flex items-center justify-between text-[11px] text-white/30 tracking-wide font-medium">
            <span>© {new Date().getFullYear()} Maki Dijital</span>
            <span className="font-mono uppercase">All rights reserved</span>
          </div>
        </div>
      </aside>

      {/* ===================================================
          RIGHT PANEL — glassmorphism login card
         =================================================== */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-12 relative bg-[var(--color-sand-50)] lg:bg-white">
        {/* Mobile decorative background flair */}
        <div
          className="lg:hidden absolute inset-x-0 top-0 h-72 pointer-events-none"
          style={{
            background:
              "radial-gradient(80% 60% at 50% 0%, rgba(15,23,42,0.06), transparent 70%)",
          }}
        />

        <div className="relative w-full max-w-md">
          {/* Mobile-only brand */}
          <div className="lg:hidden flex flex-col items-center gap-3 mb-8">
            <LoginBrandMark />
            <div className="text-center">
              <p className="text-[15px] font-bold text-[var(--color-stone-900)] leading-tight">
                Maki Dijital
              </p>
              <p className="text-[10px] tracking-[0.22em] uppercase text-[var(--color-stone-500)] mt-0.5">
                Admin · CRM
              </p>
            </div>
          </div>

          {/* Login card — glassmorphism */}
          <div
            className="rounded-3xl p-8 md:p-10 fade-in-up"
            style={{
              background: "rgba(255, 255, 255, 0.92)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid var(--color-stone-100)",
              boxShadow:
                "0 24px 64px -24px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.04)",
            }}
          >
            {step === "password" ? (
              <>
                <p
                  className="text-[11px] tracking-[0.18em] uppercase font-bold"
                  style={{ color: "var(--admin-accent-strong)" }}
                >
                  Giriş
                </p>
                <h2 className="font-display text-3xl md:text-[32px] text-[var(--color-stone-900)] mt-2 tracking-[-0.02em] leading-[1.1]">
                  Admin Girişi
                </h2>
                <p className="text-sm text-[var(--color-stone-500)] mt-2.5 mb-7 leading-relaxed">
                  Devam etmek için hesabınla oturum aç.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Error banner */}
                  {error && (
                    <div
                      role="alert"
                      className="rounded-xl px-3.5 py-2.5 text-[12.5px] leading-relaxed"
                      style={{
                        background: "rgba(254, 242, 242, 0.85)",
                        border: "1px solid rgb(254, 205, 211)",
                        color: "rgb(159, 18, 57)",
                      }}
                    >
                      {error}
                    </div>
                  )}

                  {/* E-posta */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="admin-login-email"
                      className="text-[11px] tracking-[0.12em] uppercase font-semibold text-[var(--color-stone-500)] block"
                    >
                      E-posta
                    </label>
                    <div className="relative">
                      <Mail
                        size={15}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-stone-400)] pointer-events-none"
                      />
                      <input
                        id="admin-login-email"
                        type="email"
                        autoComplete="username"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (error) setError("");
                        }}
                        disabled={submitting}
                        className="input !h-12 !pl-11"
                        placeholder="ornek@maki.com"
                      />
                    </div>
                  </div>

                  {/* Şifre */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="admin-login-password"
                      className="text-[11px] tracking-[0.12em] uppercase font-semibold text-[var(--color-stone-500)] block"
                    >
                      Şifre
                    </label>
                    <div className="relative">
                      <Lock
                        size={15}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-stone-400)] pointer-events-none"
                      />
                      <input
                        id="admin-login-password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) setError("");
                        }}
                        disabled={submitting}
                        className="input !h-12 !pl-11"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary w-full justify-center !h-12 !text-[14px] !rounded-xl mt-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Giriş yapılıyor…
                      </>
                    ) : (
                      <>
                        Giriş Yap
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <>
                {/* ===============================================
                    🛡️ TOTP 2FA — DOĞRULAMA ADIMI (ADDITIVE)
                    ===============================================
                    Şifre zaten doğrulandı (server-side pending cookie
                    kuruldu). Gerçek admin session YALNIZ bu adımdaki
                    doğru kod/kurtarma kodu sonrası /api/auth/2fa/verify
                    tarafından oluşturulur — router.replace buraya kadar
                    HİÇ çağrılmaz.
                   =============================================== */}
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{
                    background: "rgba(14, 165, 233, 0.1)",
                    color: "var(--admin-accent-strong)",
                  }}
                >
                  <ShieldCheck size={20} />
                </div>
                <p
                  className="text-[11px] tracking-[0.18em] uppercase font-bold"
                  style={{ color: "var(--admin-accent-strong)" }}
                >
                  Adım 2 / 2
                </p>
                <h2 className="font-display text-3xl md:text-[32px] text-[var(--color-stone-900)] mt-2 tracking-[-0.02em] leading-[1.1]">
                  İki Adımlı Doğrulama
                </h2>
                <p className="text-sm text-[var(--color-stone-500)] mt-2.5 mb-7 leading-relaxed">
                  {useRecovery
                    ? "Kurtarma kodlarınızdan birini girin."
                    : "Authenticator uygulamanızdaki 6 haneli kodu girin."}
                </p>

                <form onSubmit={handleTotpSubmit} className="space-y-4">
                  {/* Error banner */}
                  {error && (
                    <div
                      role="alert"
                      className="rounded-xl px-3.5 py-2.5 text-[12.5px] leading-relaxed"
                      style={{
                        background: "rgba(254, 242, 242, 0.85)",
                        border: "1px solid rgb(254, 205, 211)",
                        color: "rgb(159, 18, 57)",
                      }}
                    >
                      {error}
                    </div>
                  )}

                  {useRecovery ? (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="admin-login-recovery"
                        className="text-[11px] tracking-[0.12em] uppercase font-semibold text-[var(--color-stone-500)] block"
                      >
                        Kurtarma Kodu
                      </label>
                      <input
                        id="admin-login-recovery"
                        type="text"
                        autoComplete="one-time-code"
                        value={recoveryCode}
                        onChange={(e) => {
                          setRecoveryCode(e.target.value);
                          if (error) setError("");
                        }}
                        disabled={submitting}
                        className="input !h-12 text-center tracking-[0.15em] uppercase"
                        placeholder="XXXXX-XXXXX"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="admin-login-totp"
                        className="text-[11px] tracking-[0.12em] uppercase font-semibold text-[var(--color-stone-500)] block"
                      >
                        Doğrulama Kodu
                      </label>
                      <input
                        id="admin-login-totp"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={totpCode}
                        onChange={(e) => {
                          setTotpCode(
                            e.target.value.replace(/\D/g, "").slice(0, 6)
                          );
                          if (error) setError("");
                        }}
                        disabled={submitting}
                        className="input !h-14 text-center text-2xl tracking-[0.4em] font-semibold"
                        placeholder="000000"
                        autoFocus
                      />
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary w-full justify-center !h-12 !text-[14px] !rounded-xl mt-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Doğrulanıyor…
                      </>
                    ) : (
                      <>
                        Doğrula
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={handleBackToPassword}
                      disabled={submitting}
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-stone-500)] hover:text-[var(--color-stone-700)] transition-colors disabled:opacity-60"
                    >
                      <ArrowLeft size={13} />
                      Geri
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUseRecovery((v) => !v);
                        setError("");
                        setTotpCode("");
                        setRecoveryCode("");
                      }}
                      disabled={submitting}
                      className="text-[12.5px] font-medium underline decoration-dotted underline-offset-4 disabled:opacity-60"
                      style={{ color: "var(--admin-accent-strong)" }}
                    >
                      {useRecovery
                        ? "Authenticator kodu kullan"
                        : "Kurtarma kodu kullan"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>

          {/* Mobile footer */}
          <p className="text-[11px] text-[var(--color-stone-400)] text-center mt-7 lg:hidden">
            © {new Date().getFullYear()} Maki Dijital
          </p>
        </div>
      </main>
    </div>
  );
}

/* ---------------------------------------------
   🔥 LoginBrandMark — admin-logo.webp varsa render eder;
   <img onError> → mevcut "M" hardcoded fallback'a düşer
   (UI bozulmaz; storage'a logo yüklenmemişse eski rozet kalır).

   Mobil header'da kullanılır. Önceki w-12 h-12 (48px) yerine
   w-14 h-14 (56px) — daha güçlü branding hissiyatı için ~%17
   büyüdü. Premium polish: layered shadow + soft cyan ring.
---------------------------------------------- */
function LoginBrandMark() {
  const [imgFailed, setImgFailed] = useState<boolean>(false);
  /* 🛡️ Admin logo R2 versiyonu (server layout) → değişince URL değişir. */
  const { logo: logoVersion } = useAdminBrandingVersions();

  if (imgFailed) {
    return (
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl bg-[#0b1220]"
        style={{
          boxShadow:
            "0 12px 32px -12px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.08)",
        }}
      >
        M
      </div>
    );
  }

  return (
    <div
      className="w-14 h-14 rounded-2xl overflow-hidden bg-white flex items-center justify-center"
      style={{
        boxShadow:
          "0 12px 32px -12px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.06)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getAdminLogoUrl(logoVersion)}
        alt="Admin"
        onError={() => setImgFailed(true)}
        className="w-full h-full object-contain"
      />
    </div>
  );
}

/* ---------------------------------------------
   🔥 DesktopBrandMark — sol premium panel için BÜYÜK rozet.
   Önceki w-14 h-14 (56px) yerine w-[72px] h-[72px] —
   ~%29 daha büyük; ilk bakışta marka daha güçlü hissedilir.
   Premium polish: yumuşak sky/cyan glow halkası + layered shadow,
   white surface; dark panel üzerinde belirgin durur.
   Aynı fallback semantiği; storage'da admin-logo.webp yoksa
   "M" mark'a düşer (dark panel için glassy varyant).
---------------------------------------------- */
function DesktopBrandMark() {
  const [imgFailed, setImgFailed] = useState<boolean>(false);
  /* 🛡️ Admin logo R2 versiyonu (server layout) → değişince URL değişir. */
  const { logo: logoVersion } = useAdminBrandingVersions();

  if (imgFailed) {
    return (
      <div
        className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center text-white font-bold text-3xl"
        style={{
          background: "rgba(255, 255, 255, 0.06)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "1px solid rgba(255, 255, 255, 0.14)",
          boxShadow:
            "0 24px 48px -16px rgba(2, 6, 23, 0.6), 0 0 0 1px rgba(125, 211, 252, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        }}
      >
        M
      </div>
    );
  }

  return (
    <div
      className="w-[72px] h-[72px] rounded-2xl overflow-hidden flex items-center justify-center"
      style={{
        background: "rgba(255, 255, 255, 0.98)",
        boxShadow:
          "0 24px 48px -16px rgba(2, 6, 23, 0.6), 0 0 0 1px rgba(125, 211, 252, 0.18), 0 0 32px -4px rgba(125, 211, 252, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getAdminLogoUrl(logoVersion)}
        alt="Admin"
        onError={() => setImgFailed(true)}
        className="w-full h-full object-contain"
      />
    </div>
  );
}
