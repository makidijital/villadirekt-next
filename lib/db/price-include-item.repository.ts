import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 3 — anon repo) — client-sever sonrası native
   provider'a alındı. Admin CRUD artık price-includes/price-includes.action
   ("use server") üzerinden; villa edit read'leri villa-edit.action ("use
   server") üzerinden; public villa embed read'i server component'ten.
   eski sağlayıcı importu tamamen kaldırıldı. `server-only` defansif sınır. Method
   yüzeyi + embed select string'leri + dönüş şekli AYNEN. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ PRICE INCLUDE ITEMS REPOSITORY (native)
   ===============================================================
   `price-include-item.service.ts` içindeki inline `db.from(...)`
   çağrılarının BİREBİR taşınmış hali. Davranış değişmez:
     - `db` = native provider (`dbNative`); tek app rolü → RLS/session-DI
       YOK. Method'lar ham `{ data, error }` döner; embed-map /
       trim-validation / return / log SERVICE'te.
     - `findIncludesByVilla` embed (`price_include_items(...)`) relation-
       metadata'daki `villa_price_include_relations → price_include_items`
       kaydından çözülür.

   ⚠️ DB kolonu "title"; relation kolonu "include_id".
   ⚠️ M:N — villa_price_include_relations read/write'ları DISCRETE
       method; relation logic merge EDİLMEZ. NOT: relation-delete
       hatasında SERVICE `return false` yapar (feature/rule'dan farklı)
       — bu karar SERVICE'te kalır. Embedded select string AYNEN.
=============================================================== */

export const priceIncludeItemRepository = {
  /** Admin — tüm price include'lar (id, title), created_at DESC. */
  async findAll() {
    return await db
      .from("price_include_items")
      .select("id, title")
      .order("created_at", { ascending: false });
  },

  /** GET — (id, title), created_at ASC. Admin villa edit page fiyata-dahil
   *  listesi. ⚠️ `findAll`'dan farkı: order ASC (DESC DEĞİL). BİREBİR. */
  async findAllOrderedAsc() {
    /* Native `.from<T>()` — tüketici (villa-edit.action → villas/[id]
       page) `{ id, title }` (VillaPriceIncludeItemRowLite) bekliyor;
       cast'siz tip-parity için satır tipi burada verilir. */
    return await db
      .from<{ id: string; title: string }>("price_include_items")
      .select("id, title")
      .order("created_at", { ascending: true });
  },

  /** GET — villa'nın seçili include_id'leri (villa_price_include_relations).
   *  Admin villa edit page selected-includes. ⚠️ Relation kolonu
   *  "include_id". `.select("include_id").eq("villa_id")` BİREBİR; map
   *  caller'da. */
  async findIncludeIdsByVilla(villaId: string) {
    return await db
      .from("villa_price_include_relations")
      .select("include_id")
      .eq("villa_id", villaId);
  },

  /** Front — villaya ait price includes (relation embed). */
  async findIncludesByVilla(villaId: string) {
    return await db
      .from("villa_price_include_relations")
      .select(`
      price_include_items (
        id,
        title
      )
    `)
      .eq("villa_id", villaId);
  },

  async insert(payload: Record<string, unknown>) {
    return await db.from("price_include_items").insert(payload);
  },

  async updateById(id: string, payload: Record<string, unknown>) {
    return await db.from("price_include_items").update(payload).eq("id", id);
  },

  /** M:N — include'a bağlı tüm relation'ları sil (include_id ile). */
  async deleteRelationsByIncludeId(id: string) {
    return await db
      .from("villa_price_include_relations")
      .delete()
      .eq("include_id", id);
  },

  async deleteById(id: string) {
    return await db.from("price_include_items").delete().eq("id", id);
  },
};
