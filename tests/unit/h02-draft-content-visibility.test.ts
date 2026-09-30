/* ===============================================================
   🛡️ H-02 — TASLAK BLOG / PASİF CMS SAYFASI PUBLIC GÖRÜNÜRLÜK KİLİDİ
   ===============================================================
   Kök neden: Supabase döneminde `blog_posts` / `pages` için RLS,
   anon okumada yalnız `is_active=true` satırları döndürüyordu.
   Native PostgreSQL'e geçişte RLS devre dışı kaldı; public slug
   okuması (`findBySlug`) `is_active` filtresi taşımadığı için
   taslak/pasif içerik public URL'den okunabilir hale geldi.

   Bu test, EN ALT katmanı (`dbNative`) in-memory bir tabloyla
   taklit ederek GERÇEK repository + service kodunu çalıştırır:
     getBlogPostBySlug → blogRepository.findBySlug → db.from(...)
     getPageBySlug     → pagesRepository.findBySlug → db.from(...)
   Fake builder `.eq()` filtrelerini gerçekten uygular ve `.single()`
   0 satırda PGRST116 hatası döner (native builder ile aynı sözleşme).
   =============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;
const TABLES: Record<string, Row[]> = { blog_posts: [], pages: [] };
const calls: Array<{ table: string; op: string; args: unknown[] }> = [];

function builder(table: string) {
  let rows = [...(TABLES[table] || [])];
  const chain: Record<string, unknown> = {};
  chain.select = (...a: unknown[]) => {
    calls.push({ table, op: "select", args: a });
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    calls.push({ table, op: "eq", args: [col, val] });
    rows = rows.filter((r) => r[col] === val);
    return chain;
  };
  chain.order = (...a: unknown[]) => {
    calls.push({ table, op: "order", args: a });
    return chain;
  };
  chain.single = () =>
    Promise.resolve(
      rows.length === 1
        ? { data: rows[0], error: null }
        : {
            data: null,
            error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
          }
    );
  chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(res, rej);
  return chain;
}

vi.mock("@/lib/db/native", () => ({
  dbNative: { from: (t: string) => builder(t) },
  dbAdminNative: { from: (t: string) => builder(t) },
}));

import { getBlogPostBySlug, getBlogPosts } from "@/app/services/blog.service";
import { getPageBySlug, getPages } from "@/app/services/page.service";
import { blogRepository } from "@/lib/db/blog.repository";
import { pagesRepository } from "@/lib/db/pages.repository";

beforeEach(() => {
  calls.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  TABLES.blog_posts = [
    { id: "b1", slug: "yayinda-yazi", title: "Yayında", is_active: true, published_at: "2026-09-01T00:00:00Z", updated_at: null },
    { id: "b2", slug: "taslak-yazi", title: "GİZLİ TASLAK", is_active: false, published_at: null, updated_at: null },
  ];
  TABLES.pages = [
    { id: "p1", slug: "hakkimizda", title: "Hakkımızda", is_active: true, menu_order: 1, created_at: "2026-01-01" },
    { id: "p2", slug: "gizli-sayfa", title: "GİZLİ PASİF", is_active: false, menu_order: 2, created_at: "2026-01-02" },
  ];
});

describe("H-02 — blog detay (public slug)", () => {
  it("yayınlanmış yazı → döner (değişmedi)", async () => {
    const post = await getBlogPostBySlug("yayinda-yazi");
    expect(post?.id).toBe("b1");
  });

  it("taslak yazı → null (sayfa notFound() / metadata noindex yoluna düşer)", async () => {
    expect(await getBlogPostBySlug("taslak-yazi")).toBeNull();
  });

  it("olmayan slug → null (değişmedi)", async () => {
    expect(await getBlogPostBySlug("yok-boyle-bir-yazi")).toBeNull();
    expect(await getBlogPostBySlug("")).toBeNull();
  });

  it("findBySlug sorgusu is_active=true filtresi taşır", async () => {
    await blogRepository.findBySlug("taslak-yazi");
    const eqs = calls.filter((c) => c.table === "blog_posts" && c.op === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["slug", "taslak-yazi"]);
    expect(eqs).toContainEqual(["is_active", true]);
  });

  it("liste yalnız yayındakileri döner (değişmedi)", async () => {
    const list = await getBlogPosts();
    expect(list.map((p) => p.id)).toEqual(["b1"]);
  });
});

describe("H-02 — CMS sayfa detay (public slug)", () => {
  it("aktif sayfa → döner (değişmedi)", async () => {
    const page = (await getPageBySlug("hakkimizda")) as Row | null;
    expect(page?.id).toBe("p1");
  });

  it("pasif sayfa → null (TR inline 404 bloğu / EN-DE notFound() yolu)", async () => {
    expect(await getPageBySlug("gizli-sayfa")).toBeNull();
  });

  it("olmayan slug → null (değişmedi)", async () => {
    expect(await getPageBySlug("yok")).toBeNull();
    expect(await getPageBySlug("")).toBeNull();
  });

  it("findBySlug sorgusu is_active=true filtresi taşır", async () => {
    await pagesRepository.findBySlug("gizli-sayfa");
    const eqs = calls.filter((c) => c.table === "pages" && c.op === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["slug", "gizli-sayfa"]);
    expect(eqs).toContainEqual(["is_active", true]);
  });

  it("public liste ve footer/sitemap kaynağı yalnız aktifleri döner (değişmedi)", async () => {
    const list = (await getPages()) as Row[];
    expect(list.map((p) => p.id)).toEqual(["p1"]);
    const { data } = await pagesRepository.findActivePages();
    expect((data as Row[]).map((p) => p.id)).toEqual(["p1"]);
  });

  it("sitemap blog kaynağı yalnız yayındakileri döner (değişmedi)", async () => {
    const { data } = await blogRepository.findActiveSlugs();
    expect((data as Row[]).map((p) => p.slug)).toEqual(["yayinda-yazi"]);
  });
});

describe("H-02 — metadata/JSON-LD taslak içerik sızdırmaz", () => {
  it("blog metadata: taslak → yalnız 'bulunamadı' başlığı + noindex (taslak başlığı YOK)", async () => {
    vi.doMock("@/lib/cache.helpers", () => ({ getCachedSettings: async () => null }));
    const { buildBlogDetailMetadata } = await import("@/app/components/blog/blog-metadata");
    for (const locale of ["tr", "en", "de"] as const) {
      const md = await buildBlogDetailMetadata(Promise.resolve({ slug: "taslak-yazi" }), locale);
      expect(md.robots).toEqual({ index: false, follow: false });
      expect(JSON.stringify(md)).not.toContain("GİZLİ TASLAK");
    }
  });

  it("CMS metadata: pasif → yalnız 'bulunamadı' başlığı + noindex (pasif başlığı YOK)", async () => {
    vi.doMock("@/lib/cache.helpers", () => ({ getCachedSettings: async () => null }));
    const { buildCmsPageMetadata } = await import("@/app/components/cms/cms-page-metadata");
    for (const locale of ["tr", "en", "de"] as const) {
      const md = await buildCmsPageMetadata("gizli-sayfa", locale);
      expect(md.robots).toEqual({ index: false, follow: false });
      expect(JSON.stringify(md)).not.toContain("GİZLİ PASİF");
    }
  });
});
