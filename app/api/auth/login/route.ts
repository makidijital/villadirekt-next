import { NextResponse } from "next/server";

import { loginNative } from "@/lib/auth/native/login.service";
import { isSameOrigin } from "@/lib/auth/native/origin-guard";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";

/* ===============================================================
   🛡️ FAZ 2 (NATIVE AUTH) — POST /api/auth/login
   ===============================================================
   Native login. YALNIZ AUTH_PROVIDER=native iken aktif; aksi halde 404
   → default (eski sağlayıcı) modda bu endpoint YOK gibi davranır, sıfır maruziyet.

   Body: { email, password, remember? }
   Başarı: 200 { ok:true, admin:{ id, email, full_name, sidebar_permissions } }
           + native session cookie'leri + marker cookie set edilir.
   Hata:   401 { ok:false, error } (generic; enumeration önleme).
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // 🛡️ CSRF sertleştirme — cross-origin login-CSRF reddedilir.
  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz origin" },
      { status: 403 }
    );
  }

  let body: { email?: string; password?: string; remember?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  const email = (body.email || "").toString();
  const password = (body.password || "").toString();
  const remember = body.remember === true;

  const ipUa = extractAdminContextFromRequest(req, { id: "", email: "" });

  const result = await loginNative(email, password, {
    remember,
    ip: ipUa.ip_address ?? null,
    userAgent: ipUa.user_agent ?? null,
  });

  if (!result.ok) {
    /* 🛡️ TOTP GATE — şifre DOĞRU, 2FA kodu gerekli. Bu "başarısız giriş"
       DEĞİL (audit'te login_failed olarak sayılmaz — ayrı action) ve
       generic 401/403 hata DEĞİL: status 200 + code:"totp_required" ile
       client (nativeAuthProvider.signInWithPassword) bu durumu diğer
       hatalardan ayırt eder. Henüz HİÇBİR session/cookie oluşmadı (yalnız
       dar-amaçlı pending cookie — loginNative içinde set edildi). */
    if (result.code === "totp_required") {
      try {
        await insertAdminActivityLog(
          {
            admin_user_id: "",
            admin_email: email.toLowerCase().trim(),
            route: "/api/auth/login",
            ip_address: ipUa.ip_address ?? null,
            user_agent: ipUa.user_agent ?? null,
          },
          { action: "admin.login_totp_required", entity_type: "admin_user" }
        );
      } catch {
        /* audit hatası login akışını bozmaz. */
      }
      return NextResponse.json(
        { ok: false, code: "totp_required", error: result.error },
        { status: 200 }
      );
    }

    // Audit — başarısız giriş (best-effort; caller kimliği yok → email hint).
    try {
      await insertAdminActivityLog(
        {
          admin_user_id: "",
          admin_email: email.toLowerCase().trim(),
          route: "/api/auth/login",
          ip_address: ipUa.ip_address ?? null,
          user_agent: ipUa.user_agent ?? null,
        },
        { action: "admin.login_failed", entity_type: "admin_user" }
      );
    } catch {
      /* audit hatası login akışını bozmaz. */
    }
    // "locked"/"inactive" için ayrı mesaj; diğerleri generic.
    const status = result.code === "inactive" ? 403 : 401;
    return NextResponse.json(
      { ok: false, error: result.error },
      { status }
    );
  }

  // Audit — başarılı giriş.
  try {
    await insertAdminActivityLog(
      {
        admin_user_id: result.admin.id,
        admin_email: result.admin.email,
        route: "/api/auth/login",
        ip_address: ipUa.ip_address ?? null,
        user_agent: ipUa.user_agent ?? null,
      },
      { action: "admin.login", entity_type: "admin_user", entity_id: result.admin.id }
    );
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true, admin: result.admin });
}
