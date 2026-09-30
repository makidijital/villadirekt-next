import "server-only";

/* ===============================================================
   🛡️ VILLA REVIEWS REPOSITORY — SERVER-ONLY (NATIVE, Migration VR-P5)
   ===============================================================
   Anon `lib/db/villa-review.repository.ts` (dbNative) yerine
   native PostgreSQL karşılığı. Provider `dbAdminNative` (native pg, tek
   app rolü; RLS native'de yok, yetki app-katmanında — villa/payment/
   reservation server repo konvansiyonuyla aynı).

   ⚠️ `import "server-only"`: `pg` yalnız server. Client bundle'a sızarsa
     BUILD HATA.

   ⚠️ Method'lar anon repo ile BYTE-IDENTICAL: SELECT projeksiyonları,
     embed select string'leri, filter/order clause'ları, `maybeSingle`
     AYNEN; tek fark `db` (anon) → `dbAdmin` (native). Return HAM
     (`{ data, error }` / `maybeSingle` zarfı); mapping/clamp/aggregate/
     validation SERVICE'te kalır.

   ⚠️ EMBED (findFeaturedHomepage / findAllForAdmin): VR-P0'da kanıtlanan
     mevcut relation-metadata kullanılır (villa_reviews → villa; villa iç
     içe → location/villa_images). YENİ metadata / query-compiler
     değişikliği YOK. villa_images order paritesi: metadata orderBy
     (is_cover desc, sort_order asc) + service JS re-sort ile nötr.
   =============================================================== */

import { dbAdminNative as dbAdmin } from "@/lib/db/native";

export const villaReviewServerRepository = {
  /** Public villa-detay listesi (6 kolon), featured-first + newest. */
  async findApprovedByVilla(villaId: string, limit: number) {
    return await dbAdmin
      .from<Record<string, unknown>>("villa_reviews")
      .select("id, guest_name, rating, comment, created_at, is_featured")
      .eq("villa_id", villaId)
      .eq("is_approved", true)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
  },

  /** Global stats — yalnız rating (tüm approved). */
  async findAllApprovedRatings() {
    return await dbAdmin
      .from<Record<string, unknown>>("villa_reviews")
      .select("rating")
      .eq("is_approved", true);
  },

  /** Villa-card batch — villa_id + rating (tüm approved). */
  async findApprovedRatingsAllVillas() {
    return await dbAdmin
      .from<Record<string, unknown>>("villa_reviews")
      .select("villa_id, rating")
      .eq("is_approved", true);
  },

  /** Per-villa stats — rating (villa + approved). */
  async findApprovedRatingsByVilla(villaId: string) {
    return await dbAdmin
      .from<Record<string, unknown>>("villa_reviews")
      .select("rating")
      .eq("villa_id", villaId)
      .eq("is_approved", true);
  },

  /** Homepage testimonial — embedded join (villa + images + location).
   *  🛡️ Sıralama: SALT `created_at DESC` (en yeni onaylı yorumlar).
   *  `is_featured` sıralaması homepage'den KALDIRILDI — "öne çıkan"
   *  rozeti villa-detay (`findApprovedByVilla`) ve admin tarafında
   *  AYNEN korunur; yalnız anasayfa sırası etkilenir. */
  async findFeaturedHomepage(limit: number) {
    return await dbAdmin
      .from<Record<string, unknown>>("villa_reviews")
      .select(
        `id, guest_name, rating, comment, created_at, is_featured,
       villa:villa_id (
         id, slug, title, is_active, deleted_at,
         location:villa_locations(name),
         villa_images ( image_url, is_cover, sort_order )
       )`
      )
      .eq("is_approved", true)
      .order("created_at", { ascending: false })
      .limit(limit);
  },

  /** Admin moderation listesi — villa adı join, newest-first. */
  async findAllForAdmin() {
    return await dbAdmin
      .from<Record<string, unknown>>("villa_reviews")
      .select(
        `id, villa_id, guest_name, rating, comment, is_approved, is_featured,
       approved_at, created_at, villa:villa_id ( title )`
      )
      .order("created_at", { ascending: false });
  },

  /** Featured toggle için mevcut state (maybeSingle).
   *  🛡️ VR-P5.5 type bridge: row generic call-site'in okuduğu alanları
   *  (villa_id/is_featured/is_approved) tipler → `unknown` yerine somut
   *  tip. YALNIZ type parameter; runtime SQL (select/eq/maybeSingle)
   *  DEĞİŞMEDİ. Anon repo gevşek (`any`) döndürdüğü için gerekmemişti;
   *  native strict tip zincirinde köprü. */
  async findFeaturedStateById(id: string) {
    return await dbAdmin
      .from<{
        villa_id: string;
        is_featured: boolean;
        is_approved: boolean;
      }>("villa_reviews")
      .select("id, villa_id, is_featured, is_approved")
      .eq("id", id)
      .maybeSingle();
  },

  async insert(payload: Record<string, unknown>) {
    return await dbAdmin.from("villa_reviews").insert(payload);
  },

  async updateById(id: string, payload: Record<string, unknown>) {
    return await dbAdmin.from("villa_reviews").update(payload).eq("id", id);
  },

  /** Aynı villa'daki diğer featured review'ları temizle (defansif). */
  async clearFeaturedByVilla(villaId: string) {
    return await dbAdmin
      .from("villa_reviews")
      .update({ is_featured: false })
      .eq("villa_id", villaId)
      .eq("is_featured", true);
  },

  async deleteById(id: string) {
    return await dbAdmin.from("villa_reviews").delete().eq("id", id);
  },
};
