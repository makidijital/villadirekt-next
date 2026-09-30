import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (pilotlar PASS). Method yüzeyi +
   dönüş şekli aynen. Runtime testi yeşil olmadan production'a deploy
   edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ BLOG — SERVER-ONLY REPOSITORY (service-role)
   ===============================================================
   `blog_posts` tablosu admin WRITE/admin-READ I/O. `/api/admin/blog`
   route handler'ı (Bearer + active admin gate) bu repo üzerinden
   service-role ile listeler/yazar. Anon repository
   (`lib/db/blog.repository.ts`) public read'leri (is_active=true list,
   slug detail, sitemap slug projection) AYNEN sürdürür — bu server
   repo ONUN DUPLİKASYONU DEĞİL, anon repo'nun kendi yorumunda
   ("Admin yazma FAZ 2'de API route'unda dbAdmin ile") öngörülen
   pages/menu/settings konvansiyonundaki service-role karşılığıdır.

   ⚠️ NEDEN AYRI (anon repo reuse EDİLEMEZ):
     - Anon `findActiveList()` `is_active=true` filtreler + `select *`;
       admin list DRAFT (is_active=false) dahil TÜM satırları + slim
       projeksiyon (`id, title, slug, is_active, published_at, category,
       created_at, updated_at`) ile çeker, created_at DESC sıralar.
     - Insert service-role (`dbAdmin`, RLS bypass) gerektirir.

   GÜVENLİK SINIRI (pages/menu/settings .server konvansiyonu):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` → service-role (service-role kimlik bilgisi, NEXT_PUBLIC_
       prefix yok) → yalnız server runtime. Çağıran route
       `authorizeAdminCaller` arkasında.

   DAVRANIŞ — BYTE-IDENTICAL eski inline `dbAdmin.from("blog_posts")`
   çağrıları:
     - Her metod native eski sağlayıcı `{ data, error }` döndürür; repo sessiz
       (throw / console / log YOK). sanitizeHtml / published_at /
       error-mapping / status / log caller (route handler) tarafında
       AYNEN kalır.
   =============================================================== */

export const blogServerRepository = {
  /** Admin list — DRAFT dahil slim projeksiyon, created_at DESC. */
  async listAll() {
    return await dbAdmin
      .from("blog_posts")
      .select(
        "id, title, slug, is_active, published_at, category, created_at, updated_at"
      )
      .order("created_at", { ascending: false });
  },

  /** Insert — eklenen satırın id'sini döner (.select("id").single()). */
  async insert(payload: {
    title: string;
    slug: string;
    excerpt: string | null;
    body: string | null;
    cover_image: string | null;
    category: string | null;
    author: string | null;
    seo_title: string | null;
    seo_description: string | null;
    og_image: string | null;
    is_active: boolean;
    published_at: string | null;
  }) {
    return await dbAdmin
      .from("blog_posts")
      .insert(payload)
      .select("id")
      .single();
  },

  /** Detail by id — TÜM kolonlar (DRAFT dahil), .maybeSingle() resolver. */
  async findById(id: string) {
    return await dbAdmin
      .from("blog_posts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
  },

  /** published_at lookup — PATCH ilk-yayın set kararı için (.maybeSingle()). */
  async findPublishedAt(id: string) {
    return await dbAdmin
      .from("blog_posts")
      .select("published_at")
      .eq("id", id)
      .maybeSingle();
  },

  /** Update by id — partial patch (row dönmez; yalnız { error }). */
  async updateById(id: string, patch: Record<string, unknown>) {
    return await dbAdmin.from("blog_posts").update(patch).eq("id", id);
  },

  /** Cover image read — delete öncesi orphan cleanup için (.maybeSingle()). */
  async findCoverImage(id: string) {
    return await dbAdmin
      .from("blog_posts")
      .select("cover_image")
      .eq("id", id)
      .maybeSingle();
  },

  /** Delete by id. */
  async deleteById(id: string) {
    return await dbAdmin.from("blog_posts").delete().eq("id", id);
  },
};
