import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { villaZipRepository } from "@/lib/db/villa-zip.repository.server";

/* ===============================================================
   🛡️ POST /api/admin/villa-zip/[id]/revoke — ZIP link REVOKE (admin)
   ===============================================================
   Soft revoke (revoked_at = now()). Sonrası public download route
   token'ı 404 verir. AUTH: authorizeAdminCaller. DB: service_role.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (villas) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { ok: false, error: "id gerekli" },
      { status: 400 }
    );
  }

  const { error } = await villaZipRepository.revoke(id);
  if (error) {
    console.error("[admin.villa-zip.revoke] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: "İptal edilemedi" },
      { status: 500 }
    );
  }

  /* 🛡️ OPPORTUNISTIC GLOBAL CLEANUP (fire-and-forget) — revoke edilen
     satır artık revoked_at IS NOT NULL koşuluyla stale; aynı batch'te
     diğer EXPIRED/REVOKED satırlarla birlikte (bounded LIMIT 200)
     fiziksel silinir. AKTİF satır WHERE'e girmez. Bloklamaz: hata
     yutulur (.catch); revoke response'u her halükarda 200 döner. */
  villaZipRepository.purgeStaleGlobal(200).catch(() => {});

  return NextResponse.json({ ok: true });
}
