import { priceIncludeItemRepository } from "@/lib/db/price-include-item.repository";

/* ===============================================================
   🔥 PRICE INCLUDE ITEMS — MASTER CRUD
   ===============================================================
   MASTER:
   price_include_items
   - id
   - title
   - created_at

   RELATION:
   villa_price_include_relations
   - villa_id
   - include_id

   ⚠️ DB kolonu "title"
   ⚠️ Relation kolonu "include_id"
   =============================================================== */

export type PriceIncludeItem = {
  id: string;
  title: string;
};

/* ================= ADMIN ================= */

// 📦 TÜM PRICE INCLUDE'LAR
export async function getPriceIncludeItems(): Promise<
  PriceIncludeItem[]
> {
  const { data, error } = await priceIncludeItemRepository.findAll();

  if (error) {
    console.error(
      "❌ getPriceIncludeItems:",
      error.message
    );

    return [];
  }

  return (data || []) as PriceIncludeItem[];
}

/* ================= FRONT ================= */

// 📦 SADECE O VILLAYA AİT PRICE INCLUDES
export async function getPriceIncludeItemsByVilla(
  villaId: string
): Promise<PriceIncludeItem[]> {
  if (!villaId) return [];

  const { data, error } =
    await priceIncludeItemRepository.findIncludesByVilla(villaId);

  if (error) {
    console.error(
      "❌ getPriceIncludeItemsByVilla:",
      error.message
    );

    return [];
  }

  /* Faz 9 hardening: embed-select inference fallback. */
  type Row = { price_include_items: PriceIncludeItem | null };
  const rows = (data || []) as unknown as Row[];
  const items: PriceIncludeItem[] = rows
    .map((x) => x.price_include_items)
    .filter((p): p is PriceIncludeItem => p !== null);

  return items;
}

/* ================= CRUD ================= */

// ➕ ADD
export async function addPriceIncludeItem(
  title: string
): Promise<boolean> {
  const trimmed = (title || "").trim();

  if (!trimmed) return false;

  const { error } = await priceIncludeItemRepository.insert({
    title: trimmed,
  });

  if (error) {
    console.error(
      "❌ addPriceIncludeItem:",
      error.message
    );

    return false;
  }

  return true;
}

// ✏️ UPDATE
export async function updatePriceIncludeItem(
  id: string,
  title: string
): Promise<boolean> {
  const trimmed = (title || "").trim();

  if (!id || !trimmed) return false;

  const { error } = await priceIncludeItemRepository.updateById(id, {
    title: trimmed,
  });

  if (error) {
    console.error(
      "❌ updatePriceIncludeItem:",
      error.message
    );

    return false;
  }

  return true;
}

// ❌ DELETE
export async function deletePriceIncludeItem(
  id: string
): Promise<boolean> {
  if (!id) return false;

  // 🔥 önce relation temizle
  const { error: relErr } =
    await priceIncludeItemRepository.deleteRelationsByIncludeId(id);

  if (relErr) {
    console.error(
      "❌ price-include relation delete:",
      relErr.message
    );

    return false;
  }

  // 🔥 sonra master kaydı sil
  const { error } = await priceIncludeItemRepository.deleteById(id);

  if (error) {
    console.error(
      "❌ deletePriceIncludeItem:",
      error.message
    );

    return false;
  }

  return true;
}