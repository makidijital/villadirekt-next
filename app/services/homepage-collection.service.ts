import { homepageRepository } from "@/lib/db/homepage.repository";

/* ===============================================================
   🛡️ HOMEPAGE COLLECTION SERVICE (migration 012)
   ===============================================================
   Admin "Anasayfa Koleksiyon" sayfası için CRUD. Public read
   yolu `lib/cache.helpers > getCachedHomepageCollectionVillas`
   üzerinden (tag: "homepage").

   Tüm mutation'lar caller tarafında revalidateHomepage() ile
   invalidate edilir (separation of concerns: service DB,
   caller cache).

   Yeni pricing/availability/reservation semantic'i YOK. Bu
   service yalnız manuel curasyon meta-katmanını yönetir.
   =============================================================== */

export type HomepageCollectionItem = {
  id: string;
  villa_id: string;
  sort_order: number;
  is_active: boolean;
  custom_title: string | null;
  custom_cover_image: string | null;
  created_at: string | null;
  /** Admin listesinde göstermek için joined villa basic info. */
  villa?: {
    id: string;
    slug: string | null;
    title: string | null;
    is_active: boolean | null;
    deleted_at: string | null;
    villa_images?: Array<{
      image_url: string | null;
      is_cover: boolean | null;
      sort_order: number | null;
    }> | null;
  } | null;
};

/* ----- LIST (admin) — aktif+pasif tümü, sort_order ASC ----- */
export async function listHomepageCollection(): Promise<
  HomepageCollectionItem[]
> {
  /* FAZ 40: homepageRepository delege; embed shape repo içinde aynen. */
  const { data, error } = await homepageRepository.findAllForAdmin();
  if (error) {
    console.error("❌ listHomepageCollection error:", error.message);
    return [];
  }
  return (data || []) as unknown as HomepageCollectionItem[];
}

/* ----- ADD villa to collection ----- */
export async function addToHomepageCollection(
  villa_id: string
): Promise<boolean> {
  /* Mevcut max sort_order'ı al → yeni kayıt sona eklensin. */
  /* FAZ 40: homepageRepository delege. */
  const { data: maxRow } = await homepageRepository.findMaxSortOrder();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { error } = await homepageRepository.insert({
    villa_id,
    sort_order: nextOrder,
    is_active: true,
  });
  if (error) {
    /* unique_violation: villa zaten koleksiyonda — caller toast ile bildirir. */
    console.error("❌ addToHomepageCollection:", error.message);
    return false;
  }
  return true;
}

/* ----- REMOVE (hard delete satır) ----- */
export async function removeFromHomepageCollection(
  id: string
): Promise<boolean> {
  /* FAZ 40: homepageRepository.deleteById delege. */
  const { error } = await homepageRepository.deleteById(id);
  if (error) {
    console.error("❌ removeFromHomepageCollection:", error.message);
    return false;
  }
  return true;
}

/* ----- TOGGLE is_active ----- */
export async function toggleHomepageCollectionActive(
  id: string,
  is_active: boolean
): Promise<boolean> {
  /* FAZ 40: homepageRepository.updateById delege. */
  const { error } = await homepageRepository.updateById(id, { is_active });
  if (error) {
    console.error("❌ toggleHomepageCollectionActive:", error.message);
    return false;
  }
  return true;
}

/* ----- UPDATE custom fields ----- */
export async function updateHomepageCollectionItem(
  id: string,
  fields: {
    custom_title?: string | null;
    custom_cover_image?: string | null;
  }
): Promise<boolean> {
  const payload: Record<string, unknown> = {};
  if ("custom_title" in fields) {
    payload.custom_title =
      (fields.custom_title ?? null) === null
        ? null
        : (fields.custom_title as string).trim() || null;
  }
  if ("custom_cover_image" in fields) {
    payload.custom_cover_image = fields.custom_cover_image ?? null;
  }
  if (Object.keys(payload).length === 0) return true;
  /* FAZ 40: homepageRepository.updateById delege. */
  const { error } = await homepageRepository.updateById(id, payload);
  if (error) {
    console.error("❌ updateHomepageCollectionItem:", error.message);
    return false;
  }
  return true;
}

/* ----- REORDER — yeni sıraya göre sort_order set et.
   id sırası = yeni sort_order index. Atomik olması ideal ama
   replace-all RPC overkill; Promise.all ile paralel update.
   Race riski admin tek-user senaryoda minimum. ----- */
export async function reorderHomepageCollection(
  orderedIds: string[]
): Promise<boolean> {
  /* FAZ 40: paralel update'ler homepageRepository.updateById üzerinden;
     Promise.all pattern service'te aynen. */
  const ops = orderedIds.map((id, idx) =>
    homepageRepository.updateById(id, { sort_order: idx })
  );
  const results = await Promise.all(ops);
  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) {
    console.error(
      "❌ reorderHomepageCollection:",
      firstErr.error.message
    );
    return false;
  }
  return true;
}
