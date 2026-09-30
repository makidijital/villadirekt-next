import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import {
  PAGE_LIST_READERS,
} from "@/lib/auth/admin-permission-map";
import { pagesServerRepository } from "@/lib/db/pages.repository.server";
/* 🛡️ Sayfa silmede orphan cover temizliği — server-side storage abstraction
   (removeServer write-driver'a göre R2'ye gider; provider seçme
   mantığı DEĞİŞMEZ). Cover `site-assets` bucket'ında. */
import { removeServer } from "@/lib/storage/server";
import { STORAGE_BUCKETS } from "@/lib/storage";

/* ===============================================================
   🛡️ /api/admin/pages — PAGES CRUD partial (admin-only)
   ===============================================================
   DELETE ?id=<uuid>                 → CMS sayfası sil
   PATCH  ?id=<uuid> { show_in_menu } → menu visibility toggle

   FAZ 2 frontend purge — daha önce `app/(admin)/maki-admin/pages/page.tsx`
   client component'i `db.from("pages").delete()/.update()` ile
   ANON client + RLS path'ini kullanıyordu. Bu route adminFetch (Bearer)
   + service_role path'i ile davranış BYTE-IDENTICAL aynen üretir.

   ⚠️ Slug/path/SEO/sitemap logic: page row silinince /p/{slug} ETKİLENİR
   (mevcut davranış, dokunulmadı). show_in_menu toggle YALNIZ menu
   görünürlüğünü etkiler; /p/{slug} route, sitemap entry, page content
   ETKİLENMEZ. Cache invalidation caller tarafında (`revalidateMenu`,
   server action).
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET — admin list. Anon `pagesRepository.findActiveList()` yalnız
   `is_active=true` filtreliyor; admin'in DRAFT (is_active=false)
   sayfaları görüp publish toggle yapabilmesi için inactive dahil
   tüm satırlar gerekli. dbAdmin service-role bypass + Bearer admin
   gate ile public erişim yok. created_at DESC — mevcut list order
   ile parity. */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (PAGE_LIST_READERS) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, PAGE_LIST_READERS))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  const { data, error } = await pagesServerRepository.listAll();

  if (error) {
    console.error("[admin.pages.list] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Listelenemedi" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data: data || [] });
}

/* POST — pages.insert delegate. Eski client davranışı:
     db.from("pages").insert(payload).select().single()
   BYTE-IDENTICAL: aynı insert + select + single semantic'i; client'a
   inserted row ve error/status field'ları dönülür (eski caller
   `response.data/error/status/statusText` shape'ini kullanıyor;
   route bu shape'i koruyarak `{ ok, data, error }` döner — client
   minimal adapt). Validasyon ve audit/log/slug constraint check'i
   DB tarafında (unique slug constraint vs.) AYNEN tetiklenir. */
export async function POST(req: Request): Promise<NextResponse> {
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

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  const { data, error } = await pagesServerRepository.insert(payload);

  if (error) {
    console.error("[admin.pages.insert] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Eklenemedi" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: Request): Promise<NextResponse> {
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

  /* 🛡️ ORPHAN COVER CLEANUP — DB silmeden ÖNCE cover_image'ı oku;
     varsa storage'dan (R2 abstraction) sil. Best-effort: silme hatası
     sayfa silmeyi BLOKLAMAZ (orphan dosya log'lanır, DB silme öncelikli).
     cover_image yoksa hiçbir storage çağrısı yapılmaz (mevcut davranış). */
  try {
    const { data: pageRow } = await pagesServerRepository.findCoverImage(id);
    const coverPath = (pageRow?.cover_image || "").trim();
    if (coverPath) {
      const rmRes = await removeServer(STORAGE_BUCKETS.SITE_ASSETS, [
        coverPath,
      ]);
      if (!rmRes.ok) {
        console.warn("[admin.pages.delete] COVER_ORPHAN", {
          id,
          coverPath,
          failed: rmRes.failed,
        });
      }
    }
  } catch (cleanupErr) {
    console.warn(
      "[admin.pages.delete] cover cleanup exception",
      cleanupErr instanceof Error ? cleanupErr.message : cleanupErr
    );
  }

  const { error } = await pagesServerRepository.deleteById(id);
  if (error) {
    console.error("[admin.pages.delete] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Silinemedi" },
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

  /* 🛡️ Admin yetki (pages) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "pages"))) {
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
    show_in_menu?: unknown;
    menu_order?: unknown;
    menu_parent_id?: unknown;
  };

  /* Desteklenen alanlar:
       - show_in_menu (boolean)  → menu visibility toggle
       - menu_order   (number)   → drag/drop persist (page-auto satırları)
       - menu_parent_id (string|null) → drag/drop persist
     Caller alanı geçerse update payload'a girer; davranış BYTE-IDENTICAL
     (eski client her field için ayrı db.update yapardı; route
     birleştirir ama runtime semantic aynı). */
  const patch: Record<string, unknown> = {};
  if (typeof body.show_in_menu === "boolean") {
    patch.show_in_menu = body.show_in_menu;
  }
  if (typeof body.menu_order === "number") {
    patch.menu_order = body.menu_order;
  }
  if (body.menu_parent_id === null || typeof body.menu_parent_id === "string") {
    patch.menu_parent_id = body.menu_parent_id;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "show_in_menu, menu_order veya menu_parent_id gerekli",
      },
      { status: 400 }
    );
  }

  const { error } = await pagesServerRepository.updateById(id, patch);
  if (error) {
    console.error("[admin.pages.patch] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Güncellenemedi" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
