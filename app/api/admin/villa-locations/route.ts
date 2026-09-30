import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { villaLocationServerRepository } from "@/lib/db/villa-location.repository.server";

/* ===============================================================
   🛡️ /api/admin/villa-locations — VILLA LOCATIONS CRUD (admin-only)
   ===============================================================
   GET                                  → liste (* + created_at desc)
   POST   { name, slug }                → insert
   PATCH  ?id=<uuid> { cover_image }    → update cover_image
   DELETE ?id=<uuid>                    → silme

   FAZ 2 frontend purge — admin/locations/page.tsx daha önce direkt
   anon DB client ile CRUD yapıyordu. Bu route adminFetch (Bearer) +
   service_role ile davranış BYTE-IDENTICAL üretir. Slug üretimi
   client'ta `slugifyTr(name)` ile yapılıyor (mevcut davranış); payload
   route'a gönderilirken slug zaten içinde olur. Unique slug constraint
   varsa DB-level enforcement aynen tetiklenir.
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

  /* 🛡️ Admin yetki (locations) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "locations"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  const { data, error } = await villaLocationServerRepository.listAll();

  if (error) {
    console.error("[admin.villa-locations.list] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Liste alınamadı" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, locations: data || [] });
}

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (locations) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "locations"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    slug?: unknown;
  };
  const name = (body.name ?? "").toString().trim();
  const slug = (body.slug ?? "").toString().trim();
  if (!name || !slug) {
    return NextResponse.json(
      { ok: false, error: "name ve slug zorunlu" },
      { status: 400 }
    );
  }

  const { error } = await villaLocationServerRepository.insert({ name, slug });

  if (error) {
    console.error("[admin.villa-locations.insert] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Eklenemedi" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (locations) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "locations"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  let id = "";
  try {
    id = (new URL(req.url).searchParams.get("id") || "").trim();
  } catch {
    /* URL parse hata → boş */
  }
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id zorunlu" },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    slug?: unknown;
    cover_image?: unknown;
    show_in_filter?: unknown;
    filter_group_name?: unknown;
  };

  /* PARTIAL UPDATE — yalnız gönderilen alanlar güncellenir.
       • cover_image: mevcut caller (kapak yükleme) — davranış AYNEN.
       • name / slug: yeni edit caller (admin inline düzenleme).
     Sağlanmayan alanlara DOKUNULMAZ → villa ilişkilendirmeleri
     (location_id), URL/SEO ve arama sistemi korunur. Slug unique
     constraint DB-level AYNEN tetiklenir. */
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = (body.name ?? "").toString().trim();
    if (!name) {
      return NextResponse.json(
        { ok: false, error: "name boş olamaz" },
        { status: 400 }
      );
    }
    updates.name = name;
  }

  if (body.slug !== undefined) {
    const slug = (body.slug ?? "").toString().trim();
    if (!slug) {
      return NextResponse.json(
        { ok: false, error: "slug boş olamaz" },
        { status: 400 }
      );
    }
    updates.slug = slug;
  }

  if (body.cover_image !== undefined) {
    if (body.cover_image !== null && typeof body.cover_image !== "string") {
      return NextResponse.json(
        { ok: false, error: "cover_image (string|null) zorunlu" },
        { status: 400 }
      );
    }
    updates.cover_image = body.cover_image;
  }

  /* Migration 050 — filtre kürasyonu (yalnız gönderilirse). */
  if (body.show_in_filter !== undefined) {
    updates.show_in_filter = Boolean(body.show_in_filter);
  }

  if (body.filter_group_name !== undefined) {
    const g = (body.filter_group_name ?? "").toString().trim();
    /* Boş string → NULL (gruptan çıkar). */
    updates.filter_group_name = g.length > 0 ? g : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { ok: false, error: "Güncellenecek alan yok" },
      { status: 400 }
    );
  }

  const { error } = await villaLocationServerRepository.updateById(id, updates);

  if (error) {
    console.error("[admin.villa-locations.patch] FAILED", error.message);
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

  /* 🛡️ Admin yetki (locations) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "locations"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  let id = "";
  try {
    id = (new URL(req.url).searchParams.get("id") || "").trim();
  } catch {
    /* URL parse hata → boş */
  }
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id zorunlu" },
      { status: 400 }
    );
  }

  const { error } = await villaLocationServerRepository.deleteById(id);

  if (error) {
    console.error("[admin.villa-locations.delete] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Silinemedi" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
