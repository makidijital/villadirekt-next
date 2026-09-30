import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import {
  VILLA_SELECT_LIST_READERS,
} from "@/lib/auth/admin-permission-map";
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { villaDiscountRepository } from "@/lib/db/villa-discount.repository.server";
import { createVillaFull } from "@/app/services/villa-admin.service";
import { invalidateVillasCache } from "@/lib/villas-cache-invalidation.server";
import type { VillaFormPayload } from "@/app/services/villa-admin/types";

/* ===============================================================
   🛡️ /api/admin/villas — VILLA LIST (admin-only)
   ===============================================================
   GET → minimal villa list { id, title } admin dropdown'ları için
         (reservation detail villa selector, vb.).

   FAZ 2 frontend purge — daha önce client component'ler
   `db.from("villa").select("id, title")` ile anon read
   yapıyordu. Bu route adminFetch (Bearer) + service-role ile
   davranış BYTE-IDENTICAL.
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

  /* 🛡️ Admin yetki (VILLA_SELECT_LIST_READERS) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, VILLA_SELECT_LIST_READERS))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  /* Query params:
       - activeOnly=1 → `.eq("is_active", true).is("deleted_at", null)
                         .order("title", asc)` (homepage-collection consumer)
       - hasDiscount=1 → 🛡️ YENİ (opt-in, /maki-admin/discount-collection
         "Villa Ekle" seçici) — yalnızca `villa_discounts` tablosunda EN
         AZ 1 kaydı olan villaları döner (tarih filtresi YOK). Parametre
         GEÇİLMEZSE davranış BYTE-IDENTICAL (ek sorgu hiç çalışmaz) —
         diğer consumer'lar (homepage-collection, reservation formları,
         villas/ekle) ETKİLENMEZ.
     Default: no filter, no order (eski reservation form consumer'ları).
     `select` her zaman `id, title, slug, is_active, deleted_at` döner;
     ek field'lar mevcut consumer'lar için harmless (type ignore). */
  let activeOnly = false;
  let hasDiscount = false;
  try {
    const params = new URL(req.url).searchParams;
    activeOnly = (params.get("activeOnly") || "") === "1";
    hasDiscount = (params.get("hasDiscount") || "") === "1";
  } catch {
    /* URL parse hata → default */
  }

  const { data, error } =
    await villaAdminRepository.findAdminSelectList(activeOnly);

  if (error) {
    console.error("[admin.villas.list] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Liste alınamadı" },
      { status: 500 }
    );
  }

  let villas = data || [];

  /* 🛡️ hasDiscount=1: TEK ek sorgu (villa_discounts.villa_id kolonu,
     tüm kayıtlar) → Set'e çevrilip in-memory filtre. Villa sayısından
     BAĞIMSIZ tek query — N+1 YOK. */
  if (hasDiscount) {
    const { data: discountRows, error: discountError } =
      await villaDiscountRepository.findDistinctVillaIdsWithDiscounts();

    if (discountError) {
      console.error(
        "[admin.villas.list] hasDiscount filter FAILED",
        discountError.message
      );
      return NextResponse.json(
        { ok: false, error: discountError.message || "Liste alınamadı" },
        { status: 500 }
      );
    }

    const villaIdsWithDiscount = new Set(
      (discountRows || []).map((r) => r.villa_id)
    );
    villas = villas.filter((v) => villaIdsWithDiscount.has(v.id));
  }

  return NextResponse.json({ ok: true, villas });
}

/* POST — yeni villa create. createVillaFull service delege. Service
   orchestration (validate → slug → INSERT → 4 conditional relation INSERT
   → setVillaDistances → setVillaPrices) BYTE-IDENTICAL. Service return
   yeni villa id (string); route `{ ok, id }` döner.
   FAZ 2 frontend purge — villas/ekle/page.tsx (CLIENT) artık adminFetch
   POST kullanır; villa-admin.service barrel runtime import'u kaldırılır
   → server-only chain leak yok. */
export async function POST(req: Request): Promise<NextResponse> {
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

  let body: VillaFormPayload;
  try {
    body = (await req.json()) as VillaFormPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  try {
    const newId = await createVillaFull(body);
    /* 🛡️ Başarılı oluşturma → public villa listesi cache'i tazelenir. */
    invalidateVillasCache("admin.villas.create");
    return NextResponse.json({ ok: true, id: newId });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Oluşturulamadı";
    console.error("[admin.villas.create] FAILED", msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 400 }
    );
  }
}
