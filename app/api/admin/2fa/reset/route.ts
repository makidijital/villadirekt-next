import { NextResponse } from "next/server";

import { authorizeAdminSession } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { adminUserServerRepository } from "@/lib/db/admin-user.repository.server";
import { adminTotpServerRepository } from "@/lib/db/admin-totp.repository.server";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";

/* ===============================================================
   🛡️ TOTP 2FA — POST /api/admin/2fa/reset (admin-to-admin)
   ===============================================================
   Bir admin, BAŞKA bir admin'in kilitlendiği/kurtarma kodlarını
   kaybettiği 2FA'sını sıfırlar (totp_enabled=false, secret silinir,
   kurtarma kodları silinir — hedef admin bir sonraki girişte normal
   şifre akışına döner, isterse yeniden enroll eder).

   YETKİLENDİRME: `authorizeAdminSession()` — mevcut admin_users
   YÖNETİM sınırıyla (create-user / admin-users PATCH-DELETE) AYNI:
   herhangi bir AKTİF admin, başka bir admin_users kaydını yönetebilir
   (bu codebase'in ZATEN KURULU yetki modeli — yeni bir permission biti
   İCAT EDİLMEDİ, "gereksiz refactor yapma" kuralına uyulur). Daha sıkı
   bir kontrol istenirse (örn. yalnız belirli bir sidebar_permissions
   biti olan adminler) bu AYRI bir karardır — bkz. final rapor.

   SELF-TARGET GUARD: kendi 2FA'nı bu endpoint'le kapatamazsın —
   `/api/admin/2fa/disable` kullanılmalı (re-auth zorunlu). Bu, "hiçbir
   admin keyfi/kontrolsüz şekilde bir 2FA'yı kapatamaz" kuralını kendi
   hesabına karşı da tutarlı kılar (disable'ın kendi re-auth şartını
   bypass etmeyi engeller).
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

  /* 🛡️ SEC-03 (Faz 1) — BAŞKA bir adminin 2FA'sını sıfırlamak admin
     yönetimidir → `users` izni. Adminin KENDİ 2FA işlemleri
     (enroll/disable/recovery-codes) bu route değildir; onlar login-only
     kalır. İzin yoksa hedef admin okunmaz/değiştirilmez. */
  if (!(await callerHasPermission(auth.caller.id, "users"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }
  const caller = auth.caller;

  let body: { adminId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  const targetId = (body.adminId || "").toString().trim();
  if (!targetId) {
    return NextResponse.json(
      { ok: false, error: "adminId gerekli" },
      { status: 400 }
    );
  }

  if (caller.id === targetId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Kendi 2FA'nızı bu şekilde kapatamazsınız — 'Kullanıcılar' sayfasından kendi satırınızdan kapatın",
      },
      { status: 403 }
    );
  }

  const { data: target, error: targetErr } =
    await adminUserServerRepository.findByIdForSession(targetId);
  if (targetErr) {
    return NextResponse.json(
      { ok: false, error: "Kullanıcı okunamadı" },
      { status: 500 }
    );
  }
  if (!target) {
    return NextResponse.json(
      { ok: false, error: "Kullanıcı bulunamadı" },
      { status: 404 }
    );
  }

  await adminTotpServerRepository.deleteAllRecoveryCodes(targetId);
  const { error } = await adminTotpServerRepository.disable(targetId);
  if (error) {
    return NextResponse.json(
      { ok: false, error: "2FA sıfırlanamadı" },
      { status: 500 }
    );
  }

  try {
    const ctx = extractAdminContextFromRequest(req, {
      id: caller.id,
      email: caller.email,
    });
    await insertAdminActivityLog(ctx, {
      action: "admin.2fa_reset_by_admin",
      entity_type: "admin_user",
      entity_id: targetId,
      entity_title: target.email || targetId,
    });
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true, id: targetId });
}
