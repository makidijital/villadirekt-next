import { villaTypeRepository } from "@/lib/db/villa-type.repository";
import { slugifyTr } from "@/lib/slug";

/* ===============================================================
   🛡️ VILLA TYPES — public taxonomy CRUD
   ===============================================================
   Migration 008 sonrası `villa_types.slug` SEO-friendly URL
   üretimi için kullanılır. Burada slug:
     - INSERT'te `name`'den otomatik üretilir (caller override
       edebilir → manuel slug desteklenir).
     - UPDATE'te name değişirse slug yeniden üretilir; caller
       explicit `slug` geçtiyse o öncelikli (admin manual edit).
     - Boş veya çakışan slug'lar admin tarafında düzeltilebilir
       (uniqueness DB tarafında PARTIAL UNIQUE INDEX ile korunur).
   =============================================================== */

// 📦 GET — sort_order ASC (migration 066); admin /types + public ortak sıra.
export async function getVillaTypes() {
  const { data, error } = await villaTypeRepository.findAllBySortOrder();

  if (error) {
    console.error("❌ getVillaTypes error:", error.message);
    return [];
  }

  return data || [];
}

// ➕ ADD — yeni tip HER ZAMAN en sona: sort_order = MAX(sort_order)+1.
export async function addVillaType(name: string, slug?: string | null) {
  const finalSlug = (slug && slug.trim()) || slugifyTr(name) || null;

  /* 🛡️ Migration 066 — en sona ekle. Boş tabloda maybeSingle data=null
     → -1 fallback → ilk tip sort_order=0. Hata durumunda 0'a düş
     (insert yine de çalışır; sıralama admin tarafından düzeltilebilir). */
  const { data: maxRow } = await villaTypeRepository.findMaxSortOrder();
  const nextSortOrder =
    (typeof maxRow?.sort_order === "number" ? maxRow.sort_order : -1) + 1;

  const { error } = await villaTypeRepository.insert({
    name,
    slug: finalSlug,
    sort_order: nextSortOrder,
  });

  if (error) {
    console.error("❌ addVillaType error:", error.message);
    return false;
  }

  return true;
}

/* 🔀 SORT — toplu sıralama persist (migration 066 RPC). FAZ 3 "Sıralama
   Modu" Kaydet'i çağırır; caller başarı sonrası revalidateTaxonomy() yapar
   (separation of concerns: service DB, caller UI/cache). */
export async function setVillaTypeSortOrders(
  updates: Array<{ id: string; sort_order: number }>
): Promise<boolean> {
  const { error } = await villaTypeRepository.rpcSetVillaTypeSortOrders(updates);

  if (error) {
    console.error("❌ setVillaTypeSortOrders error:", error.message);
    return false;
  }

  return true;
}

// ✏️ UPDATE
export async function updateVillaType(
  id: string,
  name: string,
  slug?: string | null
) {
  /* Caller explicit slug verdiyse onu kullan; yoksa name'den
     yeniden üret. Boş üretim olursa null bırak (FE UUID fallback). */
  const finalSlug =
    slug !== undefined && slug !== null
      ? slug.trim() || null
      : slugifyTr(name) || null;

  const { error } = await villaTypeRepository.updateById(id, {
    name,
    slug: finalSlug,
  });

  if (error) {
    console.error("❌ updateVillaType error:", error.message);
    return false;
  }

  return true;
}

/* ===============================================================
   🛡️ COVER IMAGE — villa_types.cover_image (migration 010)
   ===============================================================
   `path` parametresi R2 storage bucket-relative path
   (örn. "category-covers/balayi-villalari.webp"). Full public URL
   DEĞİL — bucket/domain değişimine immune. NULL geçilirse cover
   kaldırılır (DB NULL). Caller başarı sonrası revalidateTaxonomy()
   çağırmalı; bu fonksiyon cache invalidation yapmaz (separation
   of concerns: service DB, caller UI/cache).
=============================================================== */
export async function setVillaTypeCover(
  id: string,
  path: string | null
): Promise<boolean> {
  const { error } = await villaTypeRepository.updateById(id, {
    cover_image: path,
  });

  if (error) {
    console.error("❌ setVillaTypeCover error:", error.message);
    return false;
  }
  return true;
}

/* 🛡️ Migration 061 — "Anasayfada Göster" toggle persist (additive).
   show_in_filter pattern'inin kategori karşılığı; yalnız bu kolonu update
   eder, diğer alanlara (name/slug/cover) dokunmaz. */
export async function setVillaTypeHomepage(
  id: string,
  show: boolean
): Promise<boolean> {
  const { error } = await villaTypeRepository.updateById(id, {
    show_on_homepage: show,
  });

  if (error) {
    console.error("❌ setVillaTypeHomepage error:", error.message);
    return false;
  }
  return true;
}

// ❌ DELETE (relation varsa önce temizler)
export async function deleteVillaType(id: string) {
  // 🔥 önce relation sil (çok önemli)
  await villaTypeRepository.deleteRelationsByTypeId(id);

  const { error } = await villaTypeRepository.deleteById(id);

  if (error) {
    console.error("❌ deleteVillaType error:", error.message);
    return false;
  }

  return true;
}
