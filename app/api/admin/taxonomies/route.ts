import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import {
  TAXONOMY_READERS,
} from "@/lib/auth/admin-permission-map";
import { taxonomyServerRepository } from "@/lib/db/taxonomy.repository.server";

/* ===============================================================
   🛡️ /api/admin/taxonomies — TAXONOMY LOOKUPS (admin-only)
   ===============================================================
   GET → 5 paralel taxonomy fetch:
     - villa_locations    { id, name, slug }
     - villa_types        { id, name, slug }
     - villa_features     { id, name }
     - rule_items         { id, title }          (ORDER created_at asc)
     - price_include_items{ id, title }          (ORDER created_at asc)

   FAZ 2 frontend purge — daha önce admin client component'ler bu
   query'leri DOĞRUDAN anon DB client ile çekiyordu (RLS-public read).
   Bu route adminFetch (Bearer) + service-role ile davranış
   BYTE-IDENTICAL: aynı select shape'leri tek route response'unda
   birleştirilir. UI tarafı taxonomy label map'ini build eder.

   🛡️ ADDITIVE EXTEND — locations/types/features field'ları AYNEN.
   ruleItems + priceIncludeItems eklendi (yeni consumer:
   villas/ekle/page.tsx dropdown init). Mevcut consumer'lar (henüz
   yok) için ek field'lar harmless (extra key'leri ignore eder).
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (TAXONOMY_READERS) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, TAXONOMY_READERS))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  /* 🛡️ FAZ 2 — rule_items + price_include_items query shape'i
     villas/ekle/page.tsx legacy eski sağlayıcı çağrılarıyla BYTE-IDENTICAL:
       .select("id, title").order("created_at", { ascending: true })
     Master fetch (admin dropdown). RLS-public read aynı semantic. */
  const [locsRes, typesRes, featsRes, rulesRes, includesRes] =
    await Promise.all([
      taxonomyServerRepository.findLocations(),
      taxonomyServerRepository.findTypes(),
      taxonomyServerRepository.findFeatures(),
      taxonomyServerRepository.findRuleItems(),
      taxonomyServerRepository.findPriceIncludeItems(),
    ]);

  return NextResponse.json({
    ok: true,
    locations: locsRes.data || [],
    types: typesRes.data || [],
    features: featsRes.data || [],
    ruleItems: rulesRes.data || [],
    priceIncludeItems: includesRes.data || [],
  });
}
