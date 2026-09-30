import { NextResponse } from "next/server";
import QRCode from "qrcode";

import { authorizeAdminSession } from "@/lib/admin-route-auth";
import { adminTotpServerRepository } from "@/lib/db/admin-totp.repository.server";
import {
  generateTotpSecret,
  buildTotpUri,
  encryptTotpSecret,
} from "@/lib/auth/native/totp";

/* ===============================================================
   🛡️ TOTP 2FA — POST /api/admin/2fa/enroll/start
   ===============================================================
   Giriş yapmış admin kendi 2FA'sını enroll etmeye başlar. Yalnız
   `authorizeAdminSession()` (mevcut access cookie) ile korunur — kendi
   hesabı için, başka bir yetki bitine gerek yok.

   Yeni secret üretir, ŞİFRELİ olarak `admin_users.totp_secret`'a yazar,
   `totp_enabled` DEĞİŞTİRİLMEZ (false kalır — ilk doğru kod confirm
   adımında onaylanana kadar). QR data-URL + otpauth URI + manuel-giriş
   secret'ı döner — secret PLAINTEXT olarak YALNIZ BU RESPONSE'TA var.

   Zaten aktif bir 2FA varsa 409 — önce disable edilmeli (aktif bir
   2FA'nın secret'ının sessizce değişmesi + olası kilitlenme riskini
   önler).
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await authorizeAdminSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }
  const caller = auth.caller;

  const { data: state, error: stateErr } =
    await adminTotpServerRepository.getStateById(caller.id);
  if (stateErr) {
    return NextResponse.json(
      { ok: false, error: "Durum okunamadı" },
      { status: 500 }
    );
  }
  if (state?.totp_enabled) {
    return NextResponse.json(
      {
        ok: false,
        error: "2FA zaten aktif. Önce mevcut 2FA'yı kapatmalısınız.",
      },
      { status: 409 }
    );
  }

  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret);

  const { error } = await adminTotpServerRepository.setPendingSecret(
    caller.id,
    encrypted
  );
  if (error) {
    return NextResponse.json(
      { ok: false, error: "Secret kaydedilemedi" },
      { status: 500 }
    );
  }

  const otpauthUri = buildTotpUri({
    secret,
    accountEmail: caller.email,
  });
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
  });

  return NextResponse.json({
    ok: true,
    // ⚠️ Yalnız bu response'ta — sonraki hiçbir endpoint (özellikle
    // /api/auth/me) secret'ı plaintext döndürmez.
    secret,
    otpauthUri,
    qrDataUrl,
  });
}
