import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 3 — anon repo) — client-sever sonrası native
   provider'a alındı. Admin okuma/yazma artık offer-requests.action ("use
   server") üzerinden; public create route'tan native default ile.
   eski sağlayıcı importu + DB client DI tamamen kaldırıldı. `server-only`
   defansif sınır. Method yüzeyi (create/findAll/findById/updateById/
   deleteById) + dönüş şekli AYNEN. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ OFFER REQUESTS REPOSITORY (native)
   ===============================================================
   `offer-request.service.ts` içindeki inline `db.from(...)`
   çağrılarının BİREBİR taşınmış hali (single table: offer_requests).
   Davranış değişmez:
     - `db` = native provider (`dbNative`); method'lar ham `{ data, error }`
       döner; sanitize / validation / echo-diff / return / log SERVICE'te.
     - Tek app rolü → RLS/session-DI YOK (public create native default ile;
       admin okuma/yazma server action arkasında). select("...") echo
       projeksiyonu ve `.single()` AYNEN.
=============================================================== */

export const offerRequestRepository = {
  /** Public insert + canonical echo SELECT (.single()) — native. */
  async create(payload: Record<string, unknown>) {
    return await db
      .from("offer_requests")
      .insert(payload)
      .select(
        "id, adults, children, region_tokens, villa_type_tokens, feature_tokens, budget_min, budget_max"
      )
      .single();
  },

  /** Admin listing — tümü, created_at DESC. */
  async findAll() {
    return await db
      .from("offer_requests")
      .select("*")
      .order("created_at", { ascending: false });
  },

  async findById(id: string) {
    return await db
      .from("offer_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
  },

  async updateById(id: string, payload: Record<string, unknown>) {
    return await db.from("offer_requests").update(payload).eq("id", id);
  },

  async deleteById(id: string) {
    return await db.from("offer_requests").delete().eq("id", id);
  },
};
