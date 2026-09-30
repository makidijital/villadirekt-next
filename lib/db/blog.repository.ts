import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 2 — anon repo) — importer zinciri KANITLI
   client-safe (blog.service + sitemap + public blog RSC page'ler; hiçbir
   "use client" yok). Salt-okunur 3 metod; write/insert/update/delete yok
   (server sürümünde, PASS). single()→PGRST116, timestamptz parser hazır;
   jsonb/numeric yok → provider değişmedi. `server-only` defansif sınır.
   Dönüş şekli aynen. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ BLOG REPOSITORY (FAZ 1) — read-side DB I/O
   ===============================================================
   `blog_posts` tablosu (migration 058). CMS `pages.repository`
   desenini AYNALAR; salt-okuma. Admin yazma (insert/update/delete)
   FAZ 2'de API route'unda `dbAdmin` ile yapılır (pages deseni).

   ⚠️ KESIN KURAL (pages ile aynı):
     - Public list: is_active=true + published_at DESC.
     - Slug detail: .eq("slug").single() — missing row → PGRST116
       (service "null" branch'iyle yakalar).
     - findActiveSlugs: sitemap (FAZ 3) için slim projeksiyon.
   pages / villa / reservation sistemlerine DOKUNMAZ.
=============================================================== */

/** blog_posts satır tipi (migration 058 kolonlarıyla birebir). */
export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
  cover_image: string | null;
  is_active: boolean;
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_image: string | null;
  noindex: boolean;
  category: string | null;
  author: string | null;
  created_at: string;
  updated_at: string | null;
};

/** Sitemap (FAZ 3) için slim satır. */
export type BlogPostSlugRow = {
  slug: string | null;
  published_at: string | null;
  updated_at: string | null;
};

export const blogRepository = {
  /** Public list — yayında olan yazılar, published_at DESC. */
  async findActiveList() {
    return await db
      .from("blog_posts")
      .select("*")
      .eq("is_active", true)
      .order("published_at", { ascending: false });
  },

  /** Slug detail — .single() resolver (pages deseni). */
  async findBySlug(slug: string) {
    /* 🛡️ H-02 — PUBLIC detay yalnız YAYINDAKİ yazıyı döndürür.
       Eski sağlayıcıda bu gizlemeyi satır-seviyesi politika yapıyordu;
       native PostgreSQL'de o katman yok → filtre sorguda olmalı.
       Taslak / olmayan slug → 0 satır → PGRST116 → service null →
       sayfa notFound(), metadata noindex. Admin okumaları bu
       repository'yi KULLANMAZ (blog.repository.server.ts, id ile). */
    return await db
      .from("blog_posts")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();
  },

  /** Sitemap — yayında olan slug + tarih (slim projeksiyon, FAZ 3). */
  async findActiveSlugs() {
    return await db
      .from("blog_posts")
      .select("slug, published_at, updated_at")
      .eq("is_active", true);
  },
};
