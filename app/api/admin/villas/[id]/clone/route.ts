import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { cloneVilla } from "@/app/services/villa-admin/clone.service";

/* ===============================================================
   🛡️ /api/admin/villas/[id]/clone — VILLA CLONE
   ===============================================================
   POST → cloneVilla(sourceId) orchestrator delege.
     - Master row 40+ alan kopyalanır (title "{orig} - Kopya",
       is_active=false, slug benzersiz)
     - villa_type_relations, villa_feature_relations,
       villa_rule_relations, villa_price_include_relations,
       villa_prices, villa_distances replicate edilir
     - villa_images KOPYALANMAZ (kullanıcı kuralı; galeri boş)

   Mevcut create/update flow'una dokunulmaz; aynı insertV* +
   setV*Server helper'ları paylaşılır → DRY.

   PATTERN PARITY:
     - authorizeAdminCaller (active`/soft-delete route'ları ile aynı)
     - runtime nodejs + force-dynamic
     - Response shape { ok: true, id } / { ok: false, error }
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

  const result = await cloneVilla(id);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error || "Kopyalanamadı" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, id: result.id });
}
