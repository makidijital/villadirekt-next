import { NextResponse } from "next/server";

import { readAccessClaims } from "@/lib/auth/native/session.service";
import { adminUserServerRepository } from "@/lib/db/admin-user.repository.server";

/* ===============================================================
   🛡️ FAZ 2 (NATIVE AUTH) — GET /api/auth/me
   ===============================================================
   Native access cookie → mevcut admin kaydı (server-side lookup). Client
   `getCurrentAdmin` (native branch) bunu kullanır — tarayıcı DB'ye
   erişmediği için lookup server'a taşınır. YALNIZ AUTH_PROVIDER=native
   iken aktif (yoksa 404).

   200 { ok:true, admin:{ id, email, full_name, sidebar_permissions } }
   401 { ok:false } (oturum yok / geçersiz)
   403 { ok:false, reason:"inactive" }
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await readAccessClaims();
  if (!claims) {
    return NextResponse.json(
      { ok: false, reason: "unauthenticated" },
      { status: 401 }
    );
  }

  const { data: admin, error } =
    await adminUserServerRepository.findByIdForSession(claims.sub);
  if (error || !admin) {
    return NextResponse.json(
      { ok: false, reason: "not_admin" },
      { status: 401 }
    );
  }
  if (!admin.is_active) {
    return NextResponse.json(
      { ok: false, reason: "inactive" },
      { status: 403 }
    );
  }

  const perms = Array.isArray(admin.sidebar_permissions)
    ? (admin.sidebar_permissions as unknown[]).filter(
        (p): p is string => typeof p === "string"
      )
    : [];

  return NextResponse.json({
    ok: true,
    admin: {
      id: admin.id,
      email: (admin.email || "").toLowerCase().trim(),
      full_name: (admin.full_name || "").trim(),
      sidebar_permissions: perms,
      // 🛡️ TOTP 2FA — ADDITIVE. Yalnız boolean durum — secret/encrypted
      // secret/recovery-code hash'i ASLA bu veya başka bir response'a
      // eklenmez (bkz. lib/auth/native/totp.ts, admin-totp.repository).
      totp_enabled: !!admin.totp_enabled,
    },
  });
}
