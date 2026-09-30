import { NextResponse } from "next/server";
import { adminUserServerRepository } from "@/lib/db/admin-user.repository.server";
import { adminUserPanelServerRepository } from "@/lib/db/admin-user-panel.repository.server";
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
   🔥 DELETE /api/admin-users/[id]
   ===============================================================
   Authenticated admin → bir admin_users kaydını siler.

   FLOW:
     1. authorizeAdminCaller(req) → caller doğrula (active admin)
     2. Self-delete guard → caller.id !== target.id
     3. admin_users target row fetch (auth_user_id, email)
     4. bağlı auth kaydının temizliği (auth_user_id varsa)
        - "user not found" gibi orphan durum: tolerate edilir
     5. admin_users row delete
     6. Auth delete fail ise admin_users delete EDİLMEZ → consistency

   Yalnız sunucu — service role client (dbAdmin) burada,
   ASLA client component'lerde import edilmez.
   =============================================================== */

/* ===============================================================
   🔥 PATCH /api/admin-users/[id]  (Migration AU-P1 — panel UPDATE boundary)
   ===============================================================
   Authenticated admin → admin_users kaydını günceller. `updateAdminUser`
   (full patch) VE `setAdminUserActive` ({ is_active }) İKİSİ de bu tek
   endpoint (aynı query shape; partial payload).

   NEDEN ROUTE HANDLER + NATIVE:
     admin_users RLS (mig 038) authenticated-only; anon `db` server-side
     silent-anon → reddeder. Native `dbAdmin` (RLS-free) + authz
     `authorizeAdminCaller` (aktif admin) ile server boundary.

   ⚠️ PAYLOAD NORMALIZE — service `updateAdminUser` ile BYTE-IDENTICAL
     (trim / lowercase email / password yalnız doluysa / sidebar_permissions
     array / is_active bool; alan yalnız `!== undefined` ise eklenir). Bu
     GEÇİCİ duplikasyondur: service mixed client/server olduğundan (client-
     safe SIDEBAR_PERMISSIONS value export'u → server-only taint) bu sprintte
     import edilemez; ayrı service-split cleanup sprintinde route buradan
     saf normalize helper'ına repoint edilecek.
   =============================================================== */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await ctx.params;

  try {
    /* ---------- CALLER AUTH ---------- */
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      console.error("[admin-users.update] UNAUTHORIZED", {
        status: auth.status,
        error: auth.error,
      });
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    /* 🛡️ SEC-03 (Faz 1) — admin kaydı yönetimi `users` izni ister.
       Auth → İZİN → input/DB sırası: izin yoksa hiçbir admin verisi
       okunmaz/değiştirilmez. */
    if (!(await callerHasPermission(auth.caller.id, "users"))) {
      console.error("[admin-users.update] FORBIDDEN", {
        callerId: auth.caller.id,
      });
      return NextResponse.json(
        { ok: false, error: FORBIDDEN_MESSAGE },
        { status: 403 }
      );
    }

    /* ---------- INPUT ---------- */
    const targetId = (id || "").toString().trim();
    if (!targetId) {
      return NextResponse.json(
        { ok: false, error: "id gerekli" },
        { status: 400 }
      );
    }

    const input = (await req.json().catch(() => ({}))) as {
      full_name?: string;
      email?: string;
      password?: string;
      sidebar_permissions?: string[];
      is_active?: boolean;
    };

    /* ---------- PAYLOAD (service `updateAdminUser` BYTE-IDENTICAL) ---------- */
    type AdminUserUpdatePayload = {
      full_name?: string;
      email?: string;
      password?: string;
      sidebar_permissions?: string[];
      is_active?: boolean;
    };
    const payload: AdminUserUpdatePayload = {};
    if (input.full_name !== undefined)
      payload.full_name = (input.full_name || "").trim();
    if (input.email !== undefined)
      payload.email = (input.email || "").trim().toLowerCase();
    if (input.password !== undefined && input.password.trim().length > 0) {
      // password sadece doluysa update edilir
      payload.password = input.password.trim();
    }
    if (input.sidebar_permissions !== undefined)
      payload.sidebar_permissions = Array.isArray(input.sidebar_permissions)
        ? input.sidebar_permissions
        : [];
    if (input.is_active !== undefined)
      payload.is_active = !!input.is_active;

    /* ---------- UPDATE (native, RLS-free) ---------- */
    const { error } = await adminUserPanelServerRepository.updateById(
      targetId,
      payload
    );

    if (error) {
      console.error("[admin-users.update] FAILED", error.message);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[admin-users.update] EXCEPTION", { error: message });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await ctx.params;
  console.log("[admin-users.delete] DELETE", { id });

  try {
    /* ---------- CALLER AUTH ---------- */
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      console.error("[admin-users.delete] UNAUTHORIZED", {
        status: auth.status,
        error: auth.error,
      });
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }
    const caller = auth.caller;

    /* 🛡️ Admin yetki — başka admini silmek `users` izni ister (PATCH ile
       aynı SEC-03 deseni). İzin yoksa 403; hedef admin okunmaz/silinmez. */
    if (!(await callerHasPermission(caller.id, "users"))) {
      console.error("[admin-users.delete] FORBIDDEN", { callerId: caller.id });
      return NextResponse.json(
        { ok: false, error: FORBIDDEN_MESSAGE },
        { status: 403 }
      );
    }

    /* ---------- INPUT ---------- */
    const targetId = (id || "").toString().trim();
    if (!targetId) {
      return NextResponse.json(
        { ok: false, error: "ID gerekli" },
        { status: 400 }
      );
    }

    /* ---------- SELF-DELETE GUARD ---------- */
    if (caller.id === targetId) {
      console.warn("[admin-users.delete] SELF_DELETE_BLOCKED", {
        callerId: caller.id,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Kendi hesabınızı silemezsiniz",
        },
        { status: 403 }
      );
    }

    /* ---------- TARGET FETCH ---------- */
    const { data: target, error: fetchErr } =
      await adminUserServerRepository.findByIdForDelete(targetId);
    if (fetchErr) {
      console.error("[admin-users.delete] FETCH_FAILED", {
        targetId,
        error: fetchErr.message,
      });
      return NextResponse.json(
        { ok: false, error: "Kullanıcı bulunamadı" },
        { status: 500 }
      );
    }
    if (!target) {
      return NextResponse.json(
        { ok: false, error: "Kullanıcı bulunamadı" },
        { status: 404 }
      );
    }

    const targetAuthUserId =
      typeof target.auth_user_id === "string"
        ? target.auth_user_id
        : null;

    /* ---------- ADMIN_USERS DELETE (FAZ 4 — NATIVE) ----------
       eski sağlayıcı auth.admin.deleteUser YOK. Native'de "auth user" = admin_users
       satırı → tek delete. İlişkili `admin_sessions` FK `ON DELETE CASCADE`
       ile otomatik temizlenir (aktif oturumlar düşer). */
    const { error: rowDelErr } =
      await adminUserServerRepository.deleteById(targetId);
    if (rowDelErr) {
      console.error(
        "[admin-users.delete] ROW_DELETE_FAILED",
        {
          targetId,
          error: rowDelErr.message,
        }
      );
      // ⚠️ Bu noktada auth user silinmiş ama admin_users hala duruyor.
      // Manuel müdahale gerekebilir; caller'a bildiriyoruz.
      return NextResponse.json(
        {
          ok: false,
          error:
            "Auth silindi ancak admin_users kaydı silinemedi: " +
            rowDelErr.message,
        },
        { status: 500 }
      );
    }

    console.info("[admin-users.delete] DELETED", {
      callerId: caller.id,
      targetId,
      authUserIdRemoved: targetAuthUserId,
    });

    /* 🛡️ FAZ 55I — AUDIT LOG (additive, fail-safe). */
    const ctx = extractAdminContextFromRequest(req, caller);
    await insertAdminActivityLog(ctx, {
      action: "admin.deleted",
      entity_type: "admin_user",
      entity_id: targetId,
      entity_title: target.email || targetId,
      before_data: {
        id: targetId,
        email: target.email,
        auth_user_id: targetAuthUserId,
      },
    });

    return NextResponse.json({
      ok: true,
      id: targetId,
      authUserId: targetAuthUserId,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[admin-users.delete] EXCEPTION", {
      error: message,
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
