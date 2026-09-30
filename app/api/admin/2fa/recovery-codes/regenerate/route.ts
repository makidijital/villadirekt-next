import { NextResponse } from "next/server";

import { authorizeAdminSession } from "@/lib/admin-route-auth";
import { adminUserServerRepository } from "@/lib/db/admin-user.repository.server";
import { adminTotpServerRepository } from "@/lib/db/admin-totp.repository.server";
import { verifyPassword } from "@/lib/auth/native/password";
import {
  decryptTotpSecret,
  verifyTotpCode,
  generateRecoveryCodes,
} from "@/lib/auth/native/totp";
import { hashPassword } from "@/lib/auth/native/password";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";

/* ===============================================================
   🛡️ TOTP 2FA — POST /api/admin/2fa/recovery-codes/regenerate
   ===============================================================
   Admin KENDİ kurtarma kodlarını yeniler (eskiler tümüyle geçersiz
   olur). `disable` ile AYNI re-auth gerekliliği — password VEYA
   mevcut TOTP kodu zorunlu (bir çalınmış oturum tek başına kodları
   yenileyip eskilerini geçersiz kılamamalı).

   🛡️ M-1 SECURITY FIX: re-auth kontrolünden ÖNCE IP-bazlı rate-limit
   ("totp-recovery-regenerate", 5 req/10dk) — ele geçirilmiş bir
   session üzerinden password/TOTP kodunu sınırsız denemeyi engeller.
   Mevcut authorizeAdminSession() + password/code re-auth şartı
   DEĞİŞMEDİ.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // 🛡️ M-1 — Rate-limit authorization'dan ÖNCE (IP-bazlı; /api/auth/2fa/verify
  // ile aynı desen). Mevcut session/re-auth gerekliliğini KALDIRMAZ.
  const limited = await applyRateLimit(req, "totp-recovery-regenerate");
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
      { ok: false, error: "2FA aktif değil" },
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
  const plainCodes = generateRecoveryCodes();
  const hashes = await Promise.all(plainCodes.map((c) => hashPassword(c)));
  const { error: codesErr } =
    await adminTotpServerRepository.insertRecoveryCodes(caller.id, hashes);
  if (codesErr) {
    return NextResponse.json(
      { ok: false, error: "Kurtarma kodları oluşturulamadı" },
      { status: 500 }
    );
  }

  try {
    const ctx = extractAdminContextFromRequest(req, {
      id: caller.id,
      email: caller.email,
    });
    await insertAdminActivityLog(ctx, {
      action: "admin.2fa_recovery_codes_regenerated",
      entity_type: "admin_user",
      entity_id: caller.id,
    });
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true, recoveryCodes: plainCodes });
}
