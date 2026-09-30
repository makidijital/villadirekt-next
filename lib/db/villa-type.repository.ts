import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 3 — anon repo) — client-sever sonrası native
   provider'a alındı. Admin CRUD artık types/types.action ("use server")
   üzerinden; villa edit + villa-listesi + public taxonomy/arama/kısa-gap +
   cache.helpers read'leri server modüllerinden. eski sağlayıcı importu tamamen
   kaldırıldı. `server-only` defansif sınır. Method yüzeyi + SQL davranışı +
   RPC (`set_villa_type_sort_orders`) AYNEN. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ VILLA TYPES REPOSITORY (native)
   ===============================================================
   `villa-type.service.ts` içindeki inline `db.from(...)`
   çağrılarının BİREBİR taşınmış hali. Davranış değişmez:
     - `db` = native provider (`dbNative`); tek app rolü → RLS/session-DI
       YOK. Method'lar ham `{ data, error }` döner.
     - slug üretimi (slugifyTr), validation, return/log SERVICE'te.
     - `updateById` generic'tir: updateVillaType / setVillaTypeCover /
       setVillaTypeHomepage HEPSİ `villa_types.update(payload).eq("id")`
       AYNI query shape'idir → tek thin method (payload'lar service'te
       ayrı kurulur; logic merge YOK).
=============================================================== */

export const villaTypeRepository = {
  /** GET — tümü, sort_order ASC (tie-break name ASC). Migration 066.
   *  Admin /types listesi (getVillaTypes) VE public getCachedVillaTypes'ın
   *  ORTAK kaynağı → tek source-of-truth. select("*") AYNEN (migration 061
   *  show_on_homepage deploy-safe). Mapping/cover_v caller'da kalır. */
  async findAllBySortOrder() {
    return await db
      .from("villa_types")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
  },

  /** GET — en yüksek sort_order (yeni tip = max+1 hesabı için). sort_order
   *  DESC + limit(1) + maybeSingle → boş tabloda data=null (caller -1
   *  fallback ile 0'dan başlatır). */
  async findMaxSortOrder() {
    return await db
      .from("villa_types")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
  },

  /** GET — public taxonomy slim projeksiyon (id, name, slug), sort_order ASC
   *  (tie-break name ASC). Migration 066: order-suz → sort_order. app/api/
   *  public/taxonomies route için (public form dropdown'ları). */
  async findAllForPublicTaxonomy() {
    /* Native `.from<T>()` — tüketici (hero-filters.action → HeroSearchPanel
       FilterOption) `{ id, name, slug }` bekliyor; cast'siz tip-parity. */
    return await db
      .from<{ id: string; name: string; slug: string | null }>("villa_types")
      .select("id, name, slug")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
  },

  /** GET — `select("*")` (order YOK). Admin villa edit page tip listesi.
   *  `findAll` (order created_at DESC) DEĞİL — bu order-suz. BİREBİR. */
  async findAllStarUnordered() {
    /* Native `.from<T>()` — tüketici (villa-edit.action → villas/[id]
       page) `{ id, name }` (VillaTypeRowLite) bekliyor; cast'siz tip-parity
       (SQL yine `select *`). */
    return await db.from<{ id: string; name: string }>("villa_types").select("*");
  },

  /** GET — slim (id, name), sort_order ASC (tie-break name ASC). Migration
   *  066: name ASC → sort_order. Admin villa-listesi (concierge curator)
   *  kategori dropdown'u. Native `{ data, error }` döner. */
  async findAllIdNameBySortOrder() {
    return await db
      .from("villa_types")
      .select("id, name")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
  },

  /** GET — villa'nın seçili type_id'leri (villa_type_relations). Admin
   *  villa edit page selected-types. `.select("type_id").eq("villa_id")`
   *  BİREBİR; map caller'da. */
  async findTypeIdsByVilla(villaId: string) {
    return await db
      .from("villa_type_relations")
      .select("type_id")
      .eq("villa_id", villaId);
  },

  /** GET — seçili type_id'lere sahip (villa_id, type_id) satırları.
   *  Public /arama kategori resolver (AND-match Map caller'da).
   *  `.select("villa_id, type_id").in("type_id", typeIds)` BİREBİR. */
  async findVillaTypeRelationsByTypeIds(typeIds: string[]) {
    return await db
      .from("villa_type_relations")
      .select("villa_id, type_id")
      .in("type_id", typeIds);
  },

  /** GET — (villa_id, type_id) satırları, type_id VE villa_id ile scope'lu.
   *  /kisa-sureli-tarihler kısa-gap sayfası tip-kesişimi: gap villa
   *  havuzuyla (`villaIds`) sınırlı AND-match resolver (Map caller'da).
   *  `findVillaTypeRelationsByTypeIds`'ten TEK farkı ek `.in("villa_id")`
   *  scope'u. Select BİREBİR. */
  async findVillaTypeRelationsByTypeAndVillaIds(
    typeIds: string[],
    villaIds: string[]
  ) {
    return await db
      .from("villa_type_relations")
      .select("villa_id, type_id")
      .in("type_id", typeIds)
      .in("villa_id", villaIds);
  },

  async insert(payload: Record<string, unknown>) {
    return await db.from("villa_types").insert(payload);
  },

  /** RPC — toplu sort_order güncelleme (migration 066). villa
   *  `rpcSetVillaSortOrders` deseninin BİREBİR karşılığı; tek transaction.
   *  Input: [{ id, sort_order }, ...]. */
  async rpcSetVillaTypeSortOrders(
    payload: Array<{ id: string; sort_order: number }>
  ) {
    return await db.rpc("set_villa_type_sort_orders", {
      p_updates: payload,
    });
  },

  /** UPDATE by id — name/slug, cover_image, show_on_homepage hepsi buradan. */
  async updateById(id: string, payload: Record<string, unknown>) {
    return await db.from("villa_types").update(payload).eq("id", id);
  },

  /** GET — tüm (type_id, villa_id) eşleşmeleri. cache.helpers >
   *  getCachedCategoryCovers 2-step JS-join'inin 1. adımı. Select
   *  shape BİREBİR ("type_id, villa_id"); filter/order YOK. Aggregate
   *  (cover seçimi + count) caller'da KALIR. */
  async findAllRelations() {
    return await db
      .from("villa_type_relations")
      .select("type_id, villa_id");
  },

  /** DELETE — villa_type_relations (type_id ile) önce temizlenir. */
  async deleteRelationsByTypeId(id: string) {
    return await db
      .from("villa_type_relations")
      .delete()
      .eq("type_id", id);
  },

  async deleteById(id: string) {
    return await db.from("villa_types").delete().eq("id", id);
  },
};
