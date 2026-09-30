import { pagesRepository } from "@/lib/db/pages.repository";

// 🔹 Tüm sayfaları getir
export async function getPages() {
  /* FAZ 40: pagesRepository delege. */
  const { data, error } = await pagesRepository.findActiveList();

  if (error) {
    console.error("❌ getPages error:", error.message);
    return [];
  }

  return data || [];
}

// 🔹 slug ile tek sayfa getir (EN ÖNEMLİ)
export async function getPageBySlug(slug: string) {
  if (!slug) return null;

  /* FAZ 40: pagesRepository delege; .single() resolver aynen. */
  const { data, error } = await pagesRepository.findBySlug(slug);

  if (error) {
    console.error("❌ getPageBySlug error:", error.message);
    return null;
  }

  return data;
}