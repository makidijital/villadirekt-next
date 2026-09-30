import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { blogServerRepository } from "@/lib/db/blog.repository.server";
import { sanitizeHtml } from "@/lib/html-sanitize";
import { removeServer } from "@/lib/storage/server";
import { STORAGE_BUCKETS } from "@/lib/storage";

/* ===============================================================
   🛡️ /api/admin/blog/[id] — tek blog (admin-only)
   ===============================================================
   GET    → tek kayıt (draft dahil)
   PATCH  → partial update (body sanitize; is_active→published_at)
   DELETE → sil + kapak orphan temizliği (R2 removeServer, reuse)

   Pages [id] route + pages DELETE cover-cleanup deseninin aynası.
   dbAdmin service-role + authorizeAdminCaller gate. R2 altyapısına
   DOKUNMAZ (yalnız mevcut removeServer çağrılır).
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (blog) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "blog"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }
  const { id } = await params;
  const { data, error } = await blogServerRepository.findById(id);

  if (error) {
    console.error("[admin.blog.get] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Bulunamadı" },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Kayıt bulunamadı" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, data });
}

type BlogPatchInput = {
  title?: unknown;
  slug?: unknown;
  excerpt?: unknown;
  body?: unknown;
  cover_image?: unknown;
  category?: unknown;
  author?: unknown;
  seo_title?: unknown;
  seo_description?: unknown;
  og_image?: unknown;
  is_active?: unknown;
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (blog) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "blog"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }
  const { id } = await params;

  let body: BlogPatchInput;
  try {
    body = (await req.json()) as BlogPatchInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (typeof body.slug === "string") patch.slug = body.slug.trim();
  if (body.excerpt !== undefined) patch.excerpt = str(body.excerpt);
  if (typeof body.body === "string") patch.body = sanitizeHtml(body.body);
  if (body.cover_image !== undefined)
    patch.cover_image = str(body.cover_image);
  if (body.category !== undefined) patch.category = str(body.category);
  if (body.author !== undefined) patch.author = str(body.author);
  if (body.seo_title !== undefined) patch.seo_title = str(body.seo_title);
  if (body.seo_description !== undefined)
    patch.seo_description = str(body.seo_description);
  if (body.og_image !== undefined) patch.og_image = str(body.og_image);

  /* Yayın durumu — true olunca published_at yoksa set et; false olunca
     published_at korunur (tekrar yayında eski tarih kalsın istenirse;
     basit semantik: sadece ilk yayında set). */
  if (typeof body.is_active === "boolean") {
    patch.is_active = body.is_active;
    if (body.is_active) {
      const { data: existing } = await blogServerRepository.findPublishedAt(
        id
      );
      if (existing && !existing.published_at) {
        patch.published_at = new Date().toISOString();
      }
    }
  }

  patch.updated_at = new Date().toISOString();

  if (Object.keys(patch).length === 1) {
    /* yalnız updated_at → güncellenecek alan yok */
    return NextResponse.json(
      { ok: false, error: "Güncellenecek alan yok" },
      { status: 400 }
    );
  }

  const { error } = await blogServerRepository.updateById(id, patch);

  if (error) {
    console.error("[admin.blog.patch] FAILED", error.message);
    const dup = (error as { code?: string }).code === "23505";
    return NextResponse.json(
      {
        ok: false,
        error: dup
          ? "Bu slug zaten kullanılıyor"
          : error.message || "Güncellenemedi",
      },
      { status: dup ? 409 : 500 }
    );
  }

  /* 🛡️ ON-DEMAND INVALIDATION — güncelleme sonrası statik /blog liste
     Full Route Cache'i temizlenir (kart başlık/özet/kapak taze gelir).
     Detay force-dynamic → zaten taze. Cache mimarisi korunur. */
  revalidatePath("/blog");
  /* 🛡️ EN/DE blog listeleri de ISR — yalnız TR tazeleniyordu; kapak
     (ve `?v=` versiyonu) EN/DE listede de hemen güncel olsun. */
  revalidatePath("/en/blog");
  revalidatePath("/de/blog");

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (blog) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "blog"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }
  const { id } = await params;

  /* 🛡️ ORPHAN COVER CLEANUP — DB silmeden önce cover_image'ı oku;
     varsa R2'den sil (mevcut removeServer; pages DELETE deseni).
     Best-effort: silme hatası blog silmeyi bloklamaz. */
  try {
    const { data: row } = await blogServerRepository.findCoverImage(id);
    const coverPath = str(row?.cover_image);
    if (coverPath) {
      const rm = await removeServer(STORAGE_BUCKETS.SITE_ASSETS, [coverPath]);
      if (!rm.ok) {
        console.warn("[admin.blog.delete] COVER_ORPHAN", { id, coverPath });
      }
    }
  } catch (e) {
    console.warn(
      "[admin.blog.delete] cover cleanup exception",
      e instanceof Error ? e.message : e
    );
  }

  const { error } = await blogServerRepository.deleteById(id);
  if (error) {
    console.error("[admin.blog.delete] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Silinemedi" },
      { status: 500 }
    );
  }

  /* 🛡️ ON-DEMAND INVALIDATION — silme sonrası statik /blog liste Full
     Route Cache'i temizlenir; silinen yazı listeden hemen kalkar.
     Cache mimarisi korunur. */
  revalidatePath("/blog");
  /* 🛡️ EN/DE blog listeleri de ISR — yalnız TR tazeleniyordu; kapak
     (ve `?v=` versiyonu) EN/DE listede de hemen güncel olsun. */
  revalidatePath("/en/blog");
  revalidatePath("/de/blog");

  return NextResponse.json({ ok: true });
}
