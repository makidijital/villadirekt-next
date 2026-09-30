import {
  blogRepository,
  type BlogPost,
} from "@/lib/db/blog.repository";

/* ===============================================================
   🛡️ BLOG SERVICE (FAZ 1) — public read-side
   ===============================================================
   CMS `page.service` desenini AYNALAR. Repository delege; hata
   durumunda fail-soft (liste [] / detay null). Admin yazma akışı
   FAZ 2'de (API route). pages/villa/reservation'a dokunmaz.
=============================================================== */

/** Yayında olan tüm blog yazıları (published_at DESC). */
export async function getBlogPosts(): Promise<BlogPost[]> {
  const { data, error } = await blogRepository.findActiveList();
  if (error) {
    console.error("❌ getBlogPosts error:", error.message);
    return [];
  }
  return (data as BlogPost[] | null) || [];
}

/** Slug ile tek blog yazısı (yayında değilse repository `is_active` filtresi → null). */
export async function getBlogPostBySlug(
  slug: string
): Promise<BlogPost | null> {
  if (!slug) return null;
  const { data, error } = await blogRepository.findBySlug(slug);
  if (error) {
    /* PGRST116 (row yok) dahil tüm hatalar → null (pages deseni). */
    console.error("❌ getBlogPostBySlug error:", error.message);
    return null;
  }
  return (data as BlogPost | null) ?? null;
}
