import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { updateVillaFull } from "@/app/services/villa-admin.service";
import { invalidateVillasCache } from "@/lib/villas-cache-invalidation.server";
import type { VillaUpdatePayload } from "@/app/services/villa-admin/types";

/* ===============================================================
   🛡️ /api/admin/villas/[id]/full — VILLA FULL UPDATE (admin-only)
   ===============================================================
   PUT body = VillaUpdatePayload (minus `id` — path param)
     → updateVillaFull({ id, form, selectedLocation, selectedTypes,
        selectedFeatures, mapData, distances, prices, selectedRules,
        selectedPriceIncludes }) service delege.

   Service AST contract BYTE-IDENTICAL (orchestration sırası 1-10):
     1. validate title
     2. generateUniqueSlug
     3. villa UPDATE
     4. replaceVillaTypeRelations (ALWAYS)
     5. replaceVillaFeatureRelations (ALWAYS)
     6. setVillaDistances (ALWAYS)
     7. setVillaPrices (ALWAYS)
     8. replaceVillaRuleRelations (CONDITIONAL)
     9. replaceVillaPriceIncludeRelations (CONDITIONAL)
    10. return true
   Audit/log/revalidate caller (client) tarafında AYNEN; servis throw
   ederse route 400 + error mesajı (caller catch'i tetiklenir).

   FAZ 2 frontend purge — `villas/[id]/page.tsx` (CLIENT) daha önce
   `updateVillaFull` service'ini DİREKT import ediyordu; barrel
   re-export'u `hard-delete.service` (admin-gateway/server) zinciri
   pulluyordu → server-only client leak. Bu route adminFetch (Bearer)
   arkasına alır.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
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

  let body: Omit<VillaUpdatePayload, "id">;
  try {
    body = (await req.json()) as Omit<VillaUpdatePayload, "id">;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  try {
    await updateVillaFull({ id, ...body } as VillaUpdatePayload);
    /* 🛡️ Başarılı güncelleme (başlık/kapasite/bölge/fiyat/rozet…) →
       public villa listesi cache'i tazelenir. */
    invalidateVillasCache("admin.villas.full.update");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Güncellenemedi";
    console.error("[admin.villas.full.update] FAILED", msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 400 }
    );
  }
}
