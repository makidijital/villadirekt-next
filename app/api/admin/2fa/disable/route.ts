import { NextResponse } from "next/server";

import { authorizeAdminSession } from "@/lib/admin-route-auth";
import { adminUserServerRepository } from "@/lib/db/admin-user.repository.server";
import { adminTotpServerRepository } from "@/lib/db/admin-totp.repository.server";
import { verifyPassword } from "@/lib/auth/native/password";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/auth/native/totp";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";

/* ===============================================================
   🛡️ TOTP 2FA — POST /api/admin/2fa/disable
   ===============================================================
   Admin KENDİ 2FA'sını kapatır. Ek doğrulama ZORUNLU — yalnız
   `authorizeAdminSession()` (mevcut access cookie geçerli) yeterli
   DEĞİL, çünkü bir çalınmış/ele geçirilmiş oturum tek başına 2FA'yı
   kapatabilir olmamalı. Body'de İKİSİNDEN BİRİ zorunlu:
     - password: mevcut hesap şifresi (Argon2id/bcrypt verifyPassword)
     - code:     hâlâ geçerli olan mevcut TOTP kodu

   Başarıda: secret + enabled=false + tüm kurtarma kodları silinir.

   🛡️ M-1 SECURITY FIX: re-auth kontrolünden ÖNCE IP-bazlı rate-limit
   ("totp-disable", 5 req/10dk) — ele geçirilmiş bir session üzerinden
   password/TOTP kodunu sınırsız denemeyi engeller. Mevcut
   authorizeAdminSession() + password/code re-auth şartı DEĞİŞMEDİ.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // 🛡️ M-1 — Rate-limit authorization'dan ÖNCE (IP-bazlı; /api/auth/2fa/verify
  // ile aynı desen). Mevcut session/re-auth gerekliliğini KALDIRMAZ.
  const limited = await applyRateLimit(req, "totp-disable");
  if (limited) return limited;

  const auth = await authorizeAdminSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }
  const caller = auth.caller;

  let body: { password?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  const { data: state, error: stateErr } =
    await adminTotpServerRepository.getStateById(caller.id);
  if (stateErr) {
    return NextResponse.json(
      { ok: false, error: "Durum okunamadı" },
      { status: 500 }
    );
  }
  if (!state?.totp_enabled) {
    return NextResponse.json(
      { ok: false, error: "2FA zaten kapalı" },
      { status: 409 }
    );
  }

  const password = (body.password || "").trim();
  const code = (body.code || "").trim();
  let reauthOk = false;

  if (password) {
    const { data: creds } =
      await adminUserServerRepository.findCredentialsByEmail(caller.email);
    if (creds?.password_hash) {
      const verify = await verifyPassword(creds.password_hash, password);
      reauthOk = verify.ok;
    }
  } else if (code && state.totp_secret) {
    try {
      const secret = decryptTotpSecret(state.totp_secret);
      reauthOk = await verifyTotpCode(code, secret);
    } catch {
      reauthOk = false;
    }
  }

  if (!reauthOk) {
    return NextResponse.json(
      { ok: false, error: "Şifre veya doğrulama kodu hatalı" },
      { status: 401 }
    );
  }

  await adminTotpServerRepository.deleteAllRecoveryCodes(caller.id);
  const { error } = await adminTotpServerRepository.disable(caller.id);
  if (error) {
    return NextResponse.json(
      { ok: false, error: "2FA kapatılamadı" },
      { status: 500 }
    );
  }

  try {
    const ctx = extractAdminContextFromRequest(req, {
      id: caller.id,
      email: caller.email,
    });
    await insertAdminActivityLog(ctx, {
      action: "admin.2fa_disabled",
      entity_type: "admin_user",
      entity_id: caller.id,
    });
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true });
}
