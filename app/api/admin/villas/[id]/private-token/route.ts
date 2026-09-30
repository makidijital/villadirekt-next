import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { generatePrivateAccessToken } from "@/app/services/villa-admin.service";

/* ===============================================================
   🛡️ /api/admin/villas/[id]/private-token — PRIVATE URL TOKEN (admin-only)
   ===============================================================
   POST → `generatePrivateAccessToken(villaId)` service delege.
     - Mevcut token reuse + yeni token üretimi service tarafında
     - Audit log (`adminGateway`) service içinde
     - villaAdminRepository.findForPrivateTokenLookup + update aynen
     - PrivateTokenResult `{ ok: true; token }` veya `{ ok: false; error }`

   FAZ 2 frontend purge — VillaTemporaryUrlButton (CLIENT) daha önce
   service'i DİREKT import ediyordu; `villa-admin.service` barrel'ı
   `hard-delete.service` + `private-token.service` (her ikisi de
   `admin-gateway/server` server-only chain) re-export ediyor → client
   bundle'a server-only sızıyordu. Bu route adminFetch (Bearer)
   arkasında SAME service delege; davranış BYTE-IDENTICAL.

   AUTH: authorizeAdminCaller.
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
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id gerekli" },
      { status: 400 }
    );
  }

  /* Service result shape `{ ok, token | error }` aynen route response'una
     iletilir; caller `res.ok` ile branch'ler (eski semantic). */
  const result = await generatePrivateAccessToken(id);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
