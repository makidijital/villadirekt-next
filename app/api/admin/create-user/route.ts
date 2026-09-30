import { NextResponse } from "next/server";
import { adminAuthProvider } from "@/lib/auth/server";
import { adminUserServerRepository } from "@/lib/db/admin-user.repository.server";
import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";

/* ===============================================================
   🔥 POST /api/admin/create-user
   ===============================================================
   Authenticated admin → yeni admin user oluşturur.

   Authentication:
   - Caller Authorization: Bearer <access_token> header'ı yollar.
   - Service role client ile getUser(token) → caller user'ı.
   - admin_users lookup → caller'ın is_active + admin olduğu doğrulanır.

   Flow:
     1. Caller validation
     2. Input validation
     3. Email duplicate check (admin_users)
     4. admin kullanıcı oluşturma(email, password, email_confirm: true)
     5. admin_users insert (auth user id ile)
     6. Insert fail ise: rollback — auth user delete
     7. Structured logging — silent fail YOK

   ⚠️ Service role key ASLA browser'a sızmaz; sadece bu route
   sunucu tarafında dbAdmin çağırır.
   =============================================================== */

type CreateUserBody = {
  email?: unknown;
  password?: unknown;
  full_name?: unknown;
  permissions?: unknown;
  is_active?: unknown;
};

const trim = (v: unknown): string => (v ?? "").toString().trim();

export async function POST(req: Request): Promise<NextResponse> {
  console.log("[admin.create_user] POST");

  try {
    /* ---------- CALLER AUTH ---------- */
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      console.error("[admin.create_user] UNAUTHORIZED", {
        status: auth.status,
        error: auth.error,
      });
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    /* 🛡️ SEC-03 (Faz 1) — admin oluşturma `users` izni ister.
       İzin yoksa input okunmaz, DB'ye hiçbir şey yazılmaz. */
    if (!(await callerHasPermission(auth.caller.id, "users"))) {
      console.error("[admin.create_user] FORBIDDEN", {
        callerId: auth.caller.id,
      });
      return NextResponse.json(
        { ok: false, error: FORBIDDEN_MESSAGE },
        { status: 403 }
      );
    }
    const caller = auth.caller;

    /* ---------- INPUT ---------- */
    const body = (await req.json().catch(() => ({}))) as CreateUserBody;
    const email = trim(body.email).toLowerCase();
    const password = trim(body.password);
    const fullName = trim(body.full_name);
    const permissions: string[] = Array.isArray(body.permissions)
      ? body.permissions.filter(
          (p): p is string => typeof p === "string"
        )
      : [];
    const isActive =
      typeof body.is_active === "boolean" ? body.is_active : true;

    if (!email) {
      return NextResponse.json(
        { ok: false, error: "E-posta gerekli" },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Geçerli e-posta gir" },
        { status: 400 }
      );
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { ok: false, error: "Şifre en az 6 karakter olmalı" },
        { status: 400 }
      );
    }
    if (!fullName) {
      return NextResponse.json(
        { ok: false, error: "Ad soyad gerekli" },
        { status: 400 }
      );
    }

    /* ---------- DUPLICATE CHECK (admin_users) ---------- */
    const { data: existing, error: existingErr } =
      await adminUserServerRepository.findIdByEmail(email);
    if (existingErr) {
      console.error("[admin.create_user] DUP_LOOKUP_FAILED", {
        error: existingErr.message,
      });
      return NextResponse.json(
        { ok: false, error: "Doğrulama hatası" },
        { status: 500 }
      );
    }
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "Bu e-posta zaten kayıtlı" },
        { status: 409 }
      );
    }

    /* ---------- NATIVE CREATE (FAZ 4) ----------
       eski sağlayıcı auth.admin.createUser YOK. adminAuthProvider (native) →
       Argon2id password_hash + admin_users tek-adım insert (auth_user_id
       gerekmez). "auth user" ile "admin_users" native'de aynı satırdır. */
    const created = await adminAuthProvider.createUser({
      email,
      password,
      fullName,
      sidebarPermissions: permissions,
      isActive,
    });
    if (!created.ok) {
      const msg = created.error || "Admin oluşturulamadı";
      console.error("[admin.create_user] CREATE_FAILED", { email, error: msg });
      const status = /zaten|exists|duplicate|unique/i.test(msg) ? 409 : 500;
      return NextResponse.json({ ok: false, error: msg }, { status });
    }
    const adminRow = { id: created.value.id };

    console.info("[admin.create_user] CREATED", {
      callerEmail: caller.email,
      newAdminId: adminRow.id,
      newAdminEmail: email,
    });

    /* 🛡️ AUDIT LOG (additive, fail-safe). password ASLA logged değil
       (Argon2id hash; helper sanitizer ek koruma). */
    const ctx = extractAdminContextFromRequest(req, caller);
    await insertAdminActivityLog(ctx, {
      action: "admin.created",
      entity_type: "admin_user",
      entity_id: adminRow.id,
      entity_title: email,
      after_data: {
        id: adminRow.id,
        email,
        full_name: fullName,
        sidebar_permissions: permissions,
        is_active: isActive,
      },
    });

    return NextResponse.json({
      ok: true,
      id: adminRow.id,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[admin.create_user] EXCEPTION", {
      error: message,
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
