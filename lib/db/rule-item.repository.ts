import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 3 — anon repo) — client-sever sonrası native
   provider'a alındı. Admin CRUD artık rules/rules.action ("use server")
   üzerinden; villa edit read'leri villa-edit.action ("use server")
   üzerinden; public villa embed read'i server component'ten. eski sağlayıcı
   importu tamamen kaldırıldı. `server-only` defansif sınır. Method yüzeyi
   + embed select string'leri + dönüş şekli AYNEN. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ RULE ITEMS REPOSITORY (native)
   ===============================================================
   `rule-item.service.ts` içindeki inline `db.from(...)`
   çağrılarının BİREBİR taşınmış hali. Davranış değişmez:
     - `db` = native provider (`dbNative`); tek app rolü → RLS/session-DI
       YOK. Method'lar ham `{ data, error }` döner; embed-map /
       trim-validation / return / log SERVICE'te.
     - `findRulesByVilla` embed (`rule_items(...)`) relation-metadata'daki
       `villa_rule_relations → rule_items` kaydından çözülür.

   ⚠️ DB kolonu "title" (name DEĞİL).
   ⚠️ M:N — villa_rule_relations read/write'ları DISCRETE method;
       relation logic merge EDİLMEZ; relation-delete-first ordering
       SERVICE'te. Embedded select string AYNEN (byte-identical).
=============================================================== */

export const ruleItemRepository = {
  /** Admin — tüm kurallar (id, title), created_at DESC. */
  async findAll() {
    return await db
      .from("rule_items")
      .select("id, title")
      .order("created_at", { ascending: false });
  },

  /** GET — (id, title), created_at ASC. Admin villa edit page kural
   *  listesi. ⚠️ `findAll`'dan farkı: order ASC (DESC DEĞİL). BİREBİR. */
  async findAllOrderedAsc() {
    /* Native `.from<T>()` — tüketici (villa-edit.action → villas/[id]
       page) `{ id, title }` (VillaRuleItemRowLite) bekliyor; cast'siz
       tip-parity için satır tipi burada verilir. */
    return await db
      .from<{ id: string; title: string }>("rule_items")
      .select("id, title")
      .order("created_at", { ascending: true });
  },

  /** GET — villa'nın seçili rule_id'leri (villa_rule_relations). Admin
   *  villa edit page selected-rules. `.select("rule_id").eq("villa_id")`
   *  BİREBİR; map caller'da. */
  async findRuleIdsByVilla(villaId: string) {
    return await db
      .from("villa_rule_relations")
      .select("rule_id")
      .eq("villa_id", villaId);
  },

  /** Front — villaya ait kurallar (villa_rule_relations embed). */
  async findRulesByVilla(villaId: string) {
    return await db
      .from("villa_rule_relations")
      .select(`
      rule_items (
        id,
        title
      )
    `)
      .eq("villa_id", villaId);
  },

  async insert(payload: Record<string, unknown>) {
    return await db.from("rule_items").insert(payload);
  },

  async updateById(id: string, payload: Record<string, unknown>) {
    return await db.from("rule_items").update(payload).eq("id", id);
  },

  /** M:N — kurala bağlı tüm relation'ları sil (rule_id ile). */
  async deleteRelationsByRuleId(id: string) {
    return await db
      .from("villa_rule_relations")
      .delete()
      .eq("rule_id", id);
  },

  async deleteById(id: string) {
    return await db.from("rule_items").delete().eq("id", id);
  },
};
