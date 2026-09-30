import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { pagesServerRepository } from "@/lib/db/pages.repository.server";

/* ===============================================================
   🛡️ /api/admin/pages/[id] — PAGE DETAIL (admin-only)
   ===============================================================
   GET   /api/admin/pages/<id>   → tek sayfa (DRAFT dahil)
   PATCH /api/admin/pages/<id>   → safe-field partial update

   NEDEN AYRI ROUTE:
     Collection route (`app/api/admin/pages/route.ts`) menu-only
     PATCH semantic'i tutuyordu (show_in_menu, menu_order,
     menu_parent_id). Bu resource route content + SEO + publish
     state alanlarını yönetir; iki PATCH endpoint'i ayrı kalır
     (BYTE-IDENTICAL davranış mevcut menu drag-drop ve toggle
     için).

   ALLOWED PATCH FIELDS:
     title, slug, body, content (mirror), excerpt,
     seo_title, seo_description, noindex, is_active, show_in_menu,
     cover_image (relative path; null = kapağı kaldır)
   PRESERVED (route HİÇ dokunmaz):
     sections, menu_parent_id, menu_order, created_at,
     id, updated_at
   Public consumer (/p/[slug]) ve mevcut "yeni sayfa" akışı bu
   route'tan ETKİLENMEZ.

   RLS:
     mig 026 — anon: SELECT is_active=true; authenticated: full CRUD.
     dbAdmin service-role her durumda RLS bypass; admin Bearer gate
     public erişimi engeller (authorizeAdminCaller).
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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

  /* 🛡️ Admin yetki (pages) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "pages"))) {
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

  const { data, error } = await pagesServerRepository.findById(id);

  if (error) {
    console.error("[admin.pages.detail.get] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Getirilemedi" },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Sayfa bulunamadı" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, data });
}

/* ---------------- PATCH input shape ----------------
   Tüm alanlar OPTIONAL — sadece gönderilenler update edilir.
   "trim → empty string ⇒ null" normalizasyonu admin "alan
   temizleme" intent'ini karşılar. is_active / noindex /
   show_in_menu strict boolean. title ve slug GÖNDERİLİRSE
   non-empty olmak ZORUNDA (UI'da required; runtime guard).
---------------------------------------------------- */
type PatchBody = {
  title?: unknown;
  slug?: unknown;
  body?: unknown;
  content?: unknown;
  excerpt?: unknown;
  seo_title?: unknown;
  seo_description?: unknown;
  noindex?: unknown;
  is_active?: unknown;
  show_in_menu?: unknown;
  cover_image?: unknown;
};

function normString(v: unknown): string | null | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export async function PATCH(
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

  /* 🛡️ Admin yetki (pages) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "pages"))) {
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

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = {};

  /* title / slug — gönderilirse non-empty zorunlu. */
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Başlık boş olamaz" },
        { status: 400 }
      );
    }
    patch.title = body.title.trim();
  }
  if (body.slug !== undefined) {
    if (typeof body.slug !== "string" || body.slug.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Slug boş olamaz" },
        { status: 400 }
      );
    }
    patch.slug = body.slug.trim();
  }

  /* String alanlar — empty → null. */
  if (body.body !== undefined) patch.body = normString(body.body) ?? null;
  if (body.content !== undefined)
    patch.content = normString(body.content) ?? null;
  if (body.excerpt !== undefined)
    patch.excerpt = normString(body.excerpt) ?? null;
  if (body.seo_title !== undefined)
    patch.seo_title = normString(body.seo_title) ?? null;
  if (body.seo_description !== undefined)
    patch.seo_description = normString(body.seo_description) ?? null;

  /* Boolean alanlar — strict tip. */
  if (typeof body.noindex === "boolean") patch.noindex = body.noindex;
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.show_in_menu === "boolean")
    patch.show_in_menu = body.show_in_menu;

  /* Cover image — relative path (string) veya null (kapağı kaldır).
     Storage/upload akışı edit ekranında; route yalnız DB alanını yazar. */
  if (body.cover_image !== undefined)
    patch.cover_image = normString(body.cover_image) ?? null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { ok: false, error: "Güncellenecek alan yok" },
      { status: 400 }
    );
  }

  const { data, error } = await pagesServerRepository.updateReturning(
    id,
    patch
  );

  if (error) {
    console.error("[admin.pages.detail.patch] FAILED", error.message);
    /* Slug unique violation → 409 net; diğer hatalar 500. */
    const isUnique =
      error.code === "23505" ||
      /duplicate|unique/i.test(error.message || "");
    return NextResponse.json(
      {
        ok: false,
        error: isUnique
          ? "Bu slug zaten kullanılıyor"
          : error.message || "Güncellenemedi",
      },
      { status: isUnique ? 409 : 500 }
    );
  }

  return NextResponse.json({ ok: true, data });
}
