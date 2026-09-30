import { NextResponse } from "next/server";

import { isSameOrigin } from "@/lib/auth/native/origin-guard";
import { readPendingTotpCookie } from "@/lib/auth/native/cookies";
import { verifyTotpPendingToken } from "@/lib/auth/native/jwt";
import { verifyTotpLogin } from "@/lib/auth/native/totp-verify.service";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";

/* ===============================================================
   🛡️ TOTP 2FA — POST /api/auth/2fa/verify
   ===============================================================
   Akış: pending cookie (__Host-admin_2fa_pending) → pending token
   verify (jose, ayrı `typ:"totp_pending"`) → admin lookup → TOTP lock
   kontrolü → kod/kurtarma-kodu doğrulama → BAŞARILIYSA mevcut
   `issueSession()` (login.service.ts ile AYNI fonksiyon, AYNI
   admin_sessions/cookie mekanizması) → pending cookie temizlenir.

   Başarısız/eksik pending token → HİÇBİR ZAMAN access/refresh cookie
   oluşturulmaz, admin_sessions'a satır YAZILMAZ.

   Body: { code?: string, recoveryCode?: string, remember?: boolean }
     - code: 6 haneli authenticator kodu
     - recoveryCode: kurtarma kodu (code yerine)
     - remember: /api/auth/login'deki "remember" değeri — pending token
       KASITLI OLARAK bunu taşımaz (minimal claim yükü); client bu
       ekranda kullanıcının orijinal seçimini tekrar gönderir.

   Başarılı response mevcut /api/auth/login response'u İLE AYNI ŞEKİL:
   { ok:true, admin:{ id, email, full_name, sidebar_permissions } }.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // 🛡️ Rate-limit — dedicated "totp" bucket (IP-bazlı, brute-force koruması).
  const limited = await applyRateLimit(req, "totp");
  if (limited) return limited;

  // 🛡️ CSRF sertleştirme — login/logout ile aynı desen.
  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz origin" },
      { status: 403 }
    );
  }

  const pendingToken = await readPendingTotpCookie();
  const pending = await verifyTotpPendingToken(pendingToken || "");
  if (!pending.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Doğrulama oturumu süresi doldu — tekrar giriş yapın",
      },
      { status: 401 }
    );
  }

  let body: { code?: string; recoveryCode?: string; remember?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  const adminId = pending.claims.sub;
  const ipUa = extractAdminContextFromRequest(req, { id: adminId, email: "" });

  const result = await verifyTotpLogin(adminId, {
    code: body.code,
    recoveryCode: body.recoveryCode,
    remember: body.remember === true,
    ip: ipUa.ip_address ?? null,
    userAgent: ipUa.user_agent ?? null,
  });

  if (!result.ok) {
    try {
      const ctx = extractAdminContextFromRequest(req, {
        id: adminId,
        email: "",
      });
      await insertAdminActivityLog(ctx, {
        action: "admin.login_totp_failed",
        entity_type: "admin_user",
        entity_id: adminId,
      });
    } catch {
      /* audit hatası login akışını bozmaz. */
    }
    const status = result.code === "inactive" ? 403 : 401;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  try {
    const ctx = extractAdminContextFromRequest(req, {
      id: result.admin.id,
      email: result.admin.email,
    });
    await insertAdminActivityLog(ctx, {
      action: result.usedRecoveryCode
        ? "admin.login_recovery_code"
        : "admin.login_totp_verified",
      entity_type: "admin_user",
      entity_id: result.admin.id,
    });
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true, admin: result.admin });
}
