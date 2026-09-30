import "server-only";

import { adminUserServerRepository } from "@/lib/db/admin-user.repository.server";
import { adminTotpServerRepository } from "@/lib/db/admin-totp.repository.server";
import { verifyPassword } from "./password";
import { decryptTotpSecret, verifyTotpCode } from "./totp";
import { issueSession } from "./session.service";
import { setMarkerCookie, clearPendingTotpCookie } from "./cookies";

/* ===============================================================
   🛡️ TOTP 2FA — LOGIN VERIFY SERVICE (server-only)
   ===============================================================
   `login.service.ts`'in TOTP karşılığı — yalnız `/api/auth/2fa/verify`
   route'undan, pending-auth token DOĞRULANDIKTAN SONRA çağrılır (pending
   token doğrulaması route'ta kalır; bu servis yalnız admin id'sinin
   GEÇERLİ olduğunu varsayar).

   Adımlar:
     1) admin + TOTP state fetch (paralel)
     2) is_active / totp_enabled / lock guard
     3) recoveryCode VEYA code doğrulama (biri zorunlu)
     4) fail → totp_failed_attempts++ (+ totp_locked_until) → generic hata
     5) success → totp sayaçları sıfırla → issueSession (login.service.ts
        İLE AYNI fonksiyon, AYNI admin_sessions/cookie mekanizması) →
        marker cookie + pending cookie temizle
   Audit çağrısı route'ta (context req'den derlenir) — login.service.ts
   ile aynı desen.
   =============================================================== */

const MAX_ATTEMPTS = (() => {
  const n = Number(process.env.AUTH_TOTP_MAX_ATTEMPTS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
})();
const LOCK_MINUTES = (() => {
  const n = Number(process.env.AUTH_TOTP_LOCK_MINUTES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 15;
})();

export type TotpLoginAdmin = {
  id: string;
  email: string;
  full_name: string;
  sidebar_permissions: string[];
};

export type TotpVerifyResult =
  | { ok: true; admin: TotpLoginAdmin; usedRecoveryCode: boolean }
  // "invalid" → generic (yanlış kod / geçersiz pending / 2FA artık kapalı)
  | { ok: false; code: "invalid" | "inactive" | "locked"; error: string };

function normalizePerms(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((p): p is string => typeof p === "string")
    : [];
}

export async function verifyTotpLogin(
  adminId: string,
  input: {
    code?: string;
    recoveryCode?: string;
    remember: boolean;
    ip: string | null;
    userAgent: string | null;
  }
): Promise<TotpVerifyResult> {
  const [{ data: admin }, { data: totpState }] = await Promise.all([
    adminUserServerRepository.findByIdForSession(adminId),
    adminTotpServerRepository.getStateById(adminId),
  ]);

  if (!admin || !totpState) {
    await clearPendingTotpCookie();
    return { ok: false, code: "invalid", error: "Oturum bulunamadı" };
  }
  if (!admin.is_active) {
    await clearPendingTotpCookie();
    return { ok: false, code: "inactive", error: "Hesabınız pasif durumda" };
  }
  // 2FA bu sırada başka bir yerden kapatılmış olabilir (disable/reset) —
  // pending token artık anlamsız; yeniden login gerekir.
  if (!totpState.totp_enabled || !totpState.totp_secret) {
    await clearPendingTotpCookie();
    return {
      ok: false,
      code: "invalid",
      error: "Doğrulama oturumu geçersiz — tekrar giriş yapın",
    };
  }

  const now = Date.now();
  if (
    totpState.totp_locked_until &&
    new Date(totpState.totp_locked_until).getTime() > now
  ) {
    return {
      ok: false,
      code: "locked",
      error: "Çok fazla başarısız deneme — bir süre sonra tekrar deneyin",
    };
  }

  const recoveryCode = (input.recoveryCode || "").trim();
  const code = (input.code || "").trim();

  let matched = false;
  let usedRecoveryCode = false;

  if (recoveryCode) {
    const { data: unused } =
      await adminTotpServerRepository.findUnusedRecoveryCodes(adminId);
    if (unused && unused.length > 0) {
      for (const row of unused) {
        const verify = await verifyPassword(row.code_hash, recoveryCode);
        if (!verify.ok) continue;
        /* 🛡️ M-2 SECURITY FIX — ATOMİK tüketim. `markRecoveryCodeUsed`
           artık compare-and-swap (`used_at IS NULL` WHERE + RETURNING):
           `claim.data` null ise bu satırı BAŞKA bir concurrent request
           bizden ÖNCE tüketmiş demektir (TOCTOU penceresi kapatıldı).
           Bu durumda `matched` false KALIR — başka satıra devam ETMEYİZ
           (recoveryCode zaten bu satırla eşleşti; Argon2id hash
           çakışması pratikte imkansız olduğundan başka satır zaten
           verify.ok vermeyecektir) → session AÇILMAZ, normal
           "geçersiz kod" başarısızlık yoluna düşer (totp_failed_attempts
           artar). Sonuç: aynı recovery code için concurrent kullanımda
           yalnız BİR istek gerçek session alabilir. */
        const claim = await adminTotpServerRepository.markRecoveryCodeUsed(
          row.id,
          new Date(now).toISOString()
        );
        if (claim.data) {
          matched = true;
          usedRecoveryCode = true;
        }
        break;
      }
    }
  } else if (code) {
    try {
      const secret = decryptTotpSecret(totpState.totp_secret);
      matched = await verifyTotpCode(code, secret);
    } catch {
      // Şifre çözme hatası (yanlış TOTP_ENCRYPTION_SECRET / bozuk veri)
      // → güvenli taraf: geçersiz kabul et, secret'ı asla sızdırma.
      matched = false;
    }
  } else {
    return { ok: false, code: "invalid", error: "Kod gerekli" };
  }

  if (!matched) {
    const attempts = (totpState.totp_failed_attempts ?? 0) + 1;
    const lockedUntil =
      attempts >= MAX_ATTEMPTS
        ? new Date(now + LOCK_MINUTES * 60_000).toISOString()
        : null;
    await adminTotpServerRepository.recordTotpFailure(
      adminId,
      attempts,
      lockedUntil
    );
    return { ok: false, code: "invalid", error: "Geçersiz doğrulama kodu" };
  }

  await adminTotpServerRepository.recordTotpSuccess(adminId);

  const perms = normalizePerms(admin.sidebar_permissions);
  const session = await issueSession(
    { id: admin.id, email: (admin.email || "").toLowerCase(), perms },
    { remember: input.remember, ip: input.ip, userAgent: input.userAgent }
  );
  if (!session.ok) {
    return { ok: false, code: "invalid", error: "Oturum oluşturulamadı" };
  }

  await setMarkerCookie();
  await clearPendingTotpCookie();

  return {
    ok: true,
    admin: {
      id: admin.id,
      email: (admin.email || "").toLowerCase(),
      full_name: (admin.full_name || "").trim(),
      sidebar_permissions: perms,
    },
    usedRecoveryCode,
  };
}
