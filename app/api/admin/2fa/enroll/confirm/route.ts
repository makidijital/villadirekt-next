import { NextResponse } from "next/server";

import { authorizeAdminSession } from "@/lib/admin-route-auth";
import { adminTotpServerRepository } from "@/lib/db/admin-totp.repository.server";
import {
  decryptTotpSecret,
  verifyTotpCode,
  generateRecoveryCodes,
} from "@/lib/auth/native/totp";
import { hashPassword } from "@/lib/auth/native/password";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";

/* ===============================================================
   🛡️ TOTP 2FA — POST /api/admin/2fa/enroll/confirm
   ===============================================================
   İlk doğru 6 haneli kod ile enrollment'ı onaylar. YALNIZ başarılı
   doğrulama sonrası `totp_enabled=true` olur (kural: "ilk doğrulama
   yapılmadan enabled=true yapılmaz").

   Başarıda: 8-10 kurtarma kodu üretilir, Argon2id hash'lenip DB'ye
   yazılır (mevcut `hashPassword` reuse — yeni hashing primitive yok),
   PLAINTEXT kodlar YALNIZ bu response'ta bir kerelik döner.

   Yetkilendirme: `authorizeAdminSession()` — mevcut admin session
   guard/route-auth ile AYNI, ek bir permission bit'i YOK (kendi 2FA'nı
   enroll etmek her aktif admin'in hakkı).
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authorizeAdminSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }
  const caller = auth.caller;

  let body: { code?: string };
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
  if (!state?.totp_secret) {
    return NextResponse.json(
      { ok: false, error: "Önce 2FA kurulumunu başlatın" },
      { status: 400 }
    );
  }
  if (state.totp_enabled) {
    return NextResponse.json(
      { ok: false, error: "2FA zaten aktif" },
      { status: 409 }
    );
  }

  let secret: string;
  try {
    secret = decryptTotpSecret(state.totp_secret);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Kurulum verisi bozuk — 2FA kurulumunu yeniden başlatın",
      },
      { status: 500 }
    );
  }

  const valid = await verifyTotpCode(body.code || "", secret);
  if (!valid) {
    // ⚠️ enabled=true YAPILMAZ — kural gereği yalnız doğru kod aktive eder.
    return NextResponse.json(
      { ok: false, error: "Geçersiz doğrulama kodu" },
      { status: 401 }
    );
  }

  const nowIso = new Date().toISOString();
  const { error: enableErr } = await adminTotpServerRepository.enable(
    caller.id,
    nowIso
  );
  if (enableErr) {
    return NextResponse.json(
      { ok: false, error: "2FA etkinleştirilemedi" },
      { status: 500 }
    );
  }

  // Olası eski/kalıntı kodları temizle, taze set üret.
  await adminTotpServerRepository.deleteAllRecoveryCodes(caller.id);
  const plainCodes = generateRecoveryCodes();
  const hashes = await Promise.all(plainCodes.map((c) => hashPassword(c)));
  const { error: codesErr } =
    await adminTotpServerRepository.insertRecoveryCodes(caller.id, hashes);

  try {
    const ctx = extractAdminContextFromRequest(req, {
      id: caller.id,
      email: caller.email,
    });
    await insertAdminActivityLog(ctx, {
      action: "admin.2fa_enabled",
      entity_type: "admin_user",
      entity_id: caller.id,
    });
  } catch {
    /* ignore */
  }

  if (codesErr) {
    // 2FA zaten enabled=true oldu; kurtarma kodu yazımı başarısız olsa
    // bile login akışı bozulmaz — admin "Kullanıcılar" sayfasındaki kendi
    // satırından "kodları yenile" ile tekrar üretebilir.
    return NextResponse.json({
      ok: true,
      recoveryCodes: [],
      warning:
        "2FA aktif ancak kurtarma kodları oluşturulamadı — 'Kullanıcılar' sayfasından kendi satırınızdan yenileyin.",
    });
  }

  return NextResponse.json({ ok: true, recoveryCodes: plainCodes });
}
