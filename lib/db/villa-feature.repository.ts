import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 3 — anon repo) — client-sever sonrası native
   provider'a alındı. Admin CRUD artık features/features.action ("use
   server") üzerinden; villa edit read'leri villa-edit.action ("use server")
   üzerinden; public taxonomy read'i api/public/taxonomies route'tan; public
   villa embed read'i server component'ten. eski sağlayıcı importu tamamen
   kaldırıldı. `server-only` defansif sınır. Method yüzeyi + embed select
   string'leri + SQL davranışı AYNEN. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ VILLA FEATURES REPOSITORY (native)
   ===============================================================
   `villa-feature.service.ts` içindeki inline `db.from(...)`
   çağrılarının BİREBİR taşınmış hali. Davranış değişmez:
     - `db` = native provider (`dbNative`); tek app rolü → RLS/session-DI
       YOK. Method'lar ham `{ data, error }` döner; embed-map / validation /
       return / log SERVICE'te.
     - `findFeaturesByVilla` embed (`villa_features(...)`) relation-metadata'
       daki `villa_feature_relations → villa_features` kaydından çözülür.

   ⚠️ M:N — villa_feature_relations write/read'leri DISCRETE method:
       relation logic merge EDİLMEZ. Relation-delete-first ordering
       SERVICE'te korunur. Embedded select string AYNEN (byte-identical).
=============================================================== */

export const villaFeatureRepository = {
  /** Admin — tüm feature'lar (id, name), created_at DESC. */
  async findAll() {
    /* Native `.from<T>()` — service.getVillaFeatures cast'siz `data`'yı
       `Feature[]` ({id,name}) döndürüyor; tip-parity için satır tipi burada. */
    return await db
      .from<{ id: string; name: string }>("villa_features")
      .select("id, name")
      .order("created_at", { ascending: false });
  },

  /** GET — public taxonomy slim projeksiyon (id, name); order YOK.
   *  app/api/public/taxonomies route için BİREBİR. `findAll`'dan farkı:
   *  order YOK (public form dropdown; sıra caller/DB natural). */
  async findAllForPublicTaxonomy() {
    return await db.from("villa_features").select("id, name");
  },

  /** GET — `select("*")` (order YOK). Admin villa edit page olanak listesi.
   *  `findAll` (id,name + order created_at DESC) DEĞİL — bu `*` order-suz.
   *  BİREBİR. */
  async findAllStar() {
    /* Native `.from<T>()` — tüketici (villa-edit.action → villas/[id]
       page) `{ id, name }` (VillaFeatureRowLite) bekliyor; cast'siz
       tip-parity için satır tipi burada verilir (SQL yine `select *`). */
    return await db.from<{ id: string; name: string }>("villa_features").select("*");
  },

  /** GET — villa'nın seçili feature_id'leri (villa_feature_relations).
   *  Admin villa edit page selected-features. `.select("feature_id")
   *  .eq("villa_id")` BİREBİR; map caller'da. */
  async findFeatureIdsByVilla(villaId: string) {
    return await db
      .from("villa_feature_relations")
      .select("feature_id")
      .eq("villa_id", villaId);
  },

  /* ===============================================================
     GET — seçili feature'lara ait villa_id ↔ feature_id satırları
     ===============================================================
     `villaTypeRepository.findVillaTypeRelationsByTypeIds`
     (lib/db/villa-type.repository.ts) ile BİREBİR AYNI desen ve AYNI
     dönüş şekli. /arama "Villa Özellikleri" filtresinin AND semantiği
     caller'da (AramaPageBody) Map<villa_id, Set<feature_id>> ile
     hesaplanır — burada SADECE ham satırlar döner.

     ⚠️ Boş `featureIds`: caller zaten guard'lıyor (length > 0);
        yine de native `.in(col, [])` compiler'da `FALSE` emit eder
        (query-compiler:211-213) → boş sonuç, SQL hatası YOK.
     ⚠️ Yeni tablo/kolon/migration YOK; mevcut `villa_feature_relations`
        junction'ı okunur (db/migrations/002 replace_villa_feature_
        relations ile yazılan tablo).
  =============================================================== */
  async findVillaFeatureRelationsByFeatureIds(featureIds: string[]) {
    return await db
      .from<{ villa_id: string; feature_id: string }>("villa_feature_relations")
      .select("villa_id, feature_id")
      .in("feature_id", featureIds);
  },

  /** Front — villaya ait feature'lar (villa_feature_relations embed). */
  async findFeaturesByVilla(villaId: string) {
    return await db
      .from("villa_feature_relations")
      .select(`
      villa_features (
        id,
        name
      )
    `)
      .eq("villa_id", villaId);
  },

  async insert(payload: Record<string, unknown>) {
    return await db.from("villa_features").insert(payload);
  },

  async updateById(id: string, payload: Record<string, unknown>) {
    return await db.from("villa_features").update(payload).eq("id", id);
  },

  /** M:N — feature'a bağlı tüm relation'ları sil (feature_id ile). */
  async deleteRelationsByFeatureId(id: string) {
    return await db
      .from("villa_feature_relations")
      .delete()
      .eq("feature_id", id);
  },

  async deleteById(id: string) {
    return await db.from("villa_features").delete().eq("id", id);
  },
};
