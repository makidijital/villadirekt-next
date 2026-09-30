import { NextResponse } from "next/server";
import { adminUserPanelServerRepository } from "@/lib/db/admin-user-panel.repository.server";
import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";

/* ===============================================================
   🔥 GET /api/admin-users  (Migration AU-P1 — panel LIST boundary)
   ===============================================================
   Authenticated admin → admin_users listesi (password hariç).

   NEDEN ROUTE HANDLER:
     admin_users RLS (mig 038) `authenticated + is_active_admin()`;
     anon erişim yok. Anon `db` server-side SILENT-ANON (lib/db/index.ts
     FAZ 4 notu) → RLS reddeder. Bu yüzden panel list/update işlemleri
     server boundary'ye taşınır ve native (RLS-free) `dbAdmin` üzerinden
     yürür; authz `authorizeAdminCaller` ile (RLS `is_active_admin()`
     ile aynı yetki kümesi = aktif admin).

   BYTE-IDENTICAL (service `getAdminUsers`):
     error → log + boş liste (throw YOK); aksi halde `data || []`.
     Response zarfı: `{ ok: true, users }`.

   ⚠️ Bu sprint (AU-P1) client'ı wire ETMEZ (import graph dokunulmaz);
     route handler + native twin ile sınırlı. Client fetch repoint'i
     ayrı sprintte.
   =============================================================== */

export async function GET(req: Request): Promise<NextResponse> {
  /* ---------- CALLER AUTH ---------- */
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    console.error("[admin-users.list] UNAUTHORIZED", {
      status: auth.status,
      error: auth.error,
    });
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (users) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "users"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  /* ---------- LIST (native, RLS-free) ---------- */
  const { data, error } =
    await adminUserPanelServerRepository.findAllForList();

  if (error) {
    /* Service `getAdminUsers` davranışı: hata fırlatılmaz, boş liste. */
    console.error("[admin-users.list] FAILED", error.message);
    return NextResponse.json({ ok: true, users: [] });
  }

  return NextResponse.json({ ok: true, users: data || [] });
}
