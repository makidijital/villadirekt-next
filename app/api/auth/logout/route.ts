import { NextResponse } from "next/server";

import {
  revokeCurrentSession,
  readAccessClaims,
} from "@/lib/auth/native/session.service";
import { clearMarkerCookie } from "@/lib/auth/native/cookies";
import { isSameOrigin } from "@/lib/auth/native/origin-guard";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";

/* ===============================================================
   🛡️ FAZ 2 (NATIVE AUTH) — POST /api/auth/logout
   ===============================================================
   Native logout. Session'ı DB'de iptal + native cookie'leri ve marker
   cookie'yi temizler. YALNIZ AUTH_PROVIDER=native iken aktif (yoksa 404).
   Idempotent — session yoksa da başarılı döner.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // 🛡️ CSRF sertleştirme — cross-origin forced-logout reddedilir.
  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz origin" },
      { status: 403 }
    );
  }

  // Audit için (varsa) mevcut admin kimliği — best-effort.
  let adminId = "";
  let adminEmail = "";
  try {
    const claims = await readAccessClaims();
    if (claims) {
      adminId = claims.sub;
      adminEmail = claims.email;
    }
  } catch {
    /* ignore */
  }

  await revokeCurrentSession();
  await clearMarkerCookie();

  if (adminId) {
    try {
      const ctx = extractAdminContextFromRequest(req, {
        id: adminId,
        email: adminEmail,
      });
      await insertAdminActivityLog(ctx, {
        action: "admin.logout",
        entity_type: "admin_user",
        entity_id: adminId,
      });
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ ok: true });
}
