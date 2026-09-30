import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { menuRepository } from "@/lib/db/menu.repository";
import { menuServerRepository } from "@/lib/db/menu.repository.server";
import { pagesServerRepository } from "@/lib/db/pages.repository.server";

/* ===============================================================
   🛡️ /api/admin/menu — MENU CRUD (admin-only)
   ===============================================================
   POST    { name, href, source_type, source_id, is_active } → insert
   DELETE  ?id=<uuid>                                        → delete

   FAZ 2 frontend purge — daha önce client component'lerden
   doğrudan `db.from("menu").insert/delete` çağrılıyordu;
   Bu route adminFetch (Bearer) + service_role insertion path'i ile
   davranış BYTE-IDENTICAL aynen üretir (row insert/delete; aynı
   audit izi yok — eski path'te de yoktu).

   AUTH: authorizeAdminCaller (Bearer + active admin).
   DB:   dbAdmin (service_role; FAZ 1.1 wrapper).
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET — source picker dropdown options (pages active + villa_types +
   villa_locations). menu/new/page.tsx tarafından useEffect'te tek
   request ile çekilir. Davranış BYTE-IDENTICAL: aynı select shape,
   aynı sıralama (pages title asc; types/locations name asc gerekirse
   client tarafında stabilizasyon zaten var). */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (menu) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "menu"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  /* 4-source paralel fetch (menu list ekleme — admin/menu/page tree
     builder bunu kullanır; menu/new/page yalnız pages/types/locations
     okur ve menu alanını yok sayar). Eski client davranışında 4
     paralel select vardı; tek route response'unda birleştirildi. */
  const [menuRes, pagesRes, typesRes, locsRes] = await Promise.all([
    menuRepository.findAll(),
    menuRepository.findActivePagesForMenu(),
    menuRepository.findAllVillaTypes(),
    menuRepository.findAllVillaLocations(),
  ]);

  return NextResponse.json({
    ok: true,
    menu: menuRes.data || [],
    pages: pagesRes.data || [],
    types: typesRes.data || [],
    locations: locsRes.data || [],
  });
}

type MenuInsertPayload = {
  name: string;
  href: string;
  source_type: string;
  source_id: string | null;
  is_active: boolean;
};

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (menu) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "menu"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Partial<
    MenuInsertPayload
  >;

  const name = (body.name ?? "").toString().trim();
  const href = (body.href ?? "").toString().trim();
  const source_type = (body.source_type ?? "").toString().trim();
  const source_id =
    body.source_id == null
      ? null
      : (body.source_id || "").toString().trim() || null;
  const is_active = body.is_active !== false;

  if (!name || !href || !source_type) {
    return NextResponse.json(
      { ok: false, error: "name, href, source_type zorunlu" },
      { status: 400 }
    );
  }

  const payload = { name, href, source_type, source_id, is_active };

  const { data: inserted, error } = await menuServerRepository.insert(payload);
  if (error) {
    console.error("[admin.menu.insert] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Eklenemedi" },
      { status: 500 }
    );
  }

  /* 🛡️ TEK YÖNLÜ SYNC (explicit add → visibility intent):
     CMS sayfası EXPLICIT menüye eklendiyse → pages.show_in_menu=true.
     YALNIZ source_type='page' && source_id var. Diğer source'larda
     DOKUNMA. Best-effort: sync hatası menü insert'i BOZMAZ.
     Eski client-side davranış BYTE-IDENTICAL — sadece server'a taşındı. */
  if (source_type === "page" && source_id) {
    const { error: syncErr } = await pagesServerRepository.updateById(
      source_id,
      { show_in_menu: true }
    );
    if (syncErr) {
      console.warn(
        "[admin.menu.insert] pages.show_in_menu sync non-fatal:",
        syncErr.message
      );
    }
  }

  /* 🛡️ MIGRATION 086 — yeni satırın id'si döner; admin "Menü ekle"
     formu EN/DE ad çevirilerini bu id ile `menu_translations`'a yazar.
     Mevcut `{ ok: true }` sözleşmesi KORUNDU (alan yalnız EKLENDİ). */
  return NextResponse.json({ ok: true, id: inserted?.id ?? null });
}

/* PATCH — menu satırı order/parent_id güncellemesi (drag/drop persist).
   Eski client davranışı: db.from("menu").update({ order, parent_id })
   .eq("id", id). BYTE-IDENTICAL aynı select/filter şekli route içinde. */
export async function PATCH(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (menu) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "menu"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  let id = "";
  try {
    id = (new URL(req.url).searchParams.get("id") || "").trim();
  } catch {
    /* URL parse hata → boş id */
  }
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id zorunlu" },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    order?: unknown;
    parent_id?: unknown;
  };

  /* Yalnız `order` + `parent_id` desteklenir (drag/drop persist). */
  const patch: Record<string, unknown> = {};
  if (typeof body.order === "number") patch.order = body.order;
  if (body.parent_id === null || typeof body.parent_id === "string") {
    patch.parent_id = body.parent_id;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { ok: false, error: "order veya parent_id gerekli" },
      { status: 400 }
    );
  }

  const { error } = await menuServerRepository.updateById(id, patch);
  if (error) {
    console.error("[admin.menu.patch] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Güncellenemedi" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (menu) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "menu"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  let id = "";
  try {
    id = (new URL(req.url).searchParams.get("id") || "").trim();
  } catch {
    /* URL parse hata → boş id */
  }
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id zorunlu" },
      { status: 400 }
    );
  }

  const { error } = await menuServerRepository.deleteById(id);
  if (error) {
    console.error("[admin.menu.delete] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Silinemedi" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
