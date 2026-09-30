import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 3 — anon repo) — client-sever sonrası native
   provider'a alındı. Admin okuma/yazma artık property-owner.action ("use
   server") üzerinden. eski sağlayıcı importu tamamen kaldırıldı. `server-only`
   defansif sınır. Method yüzeyi (findAll/findLinkedVillaOwnerIds/
   findAllForSelect/insert/updateById/deleteById) + dönüş şekli AYNEN. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ PROPERTY OWNERS REPOSITORY (native)
   ===============================================================
   `property-owner.service.ts` içindeki inline `db.from(...)`
   çağrılarının BİREBİR taşınmış hali. Davranış değişmez:
     - `db` = native provider (`dbNative`); method'lar ham `{ data, error }`
       döner; mapping / count / business logic SERVICE'te kalır. Tek app
       rolü → RLS/session-DI YOK.
   Select projeksiyonları, order, filter clause'ları (`.not(...,"is",null)`)
   AYNEN.
=============================================================== */

type PropertyOwnerWritePayload = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  iban: string | null;
};

export const propertyOwnerRepository = {
  /** Liste — full projeksiyon, created_at DESC. */
  async findAll() {
    return await db
      .from("property_owners")
      .select("id, first_name, last_name, phone, email, iban, created_at")
      .order("created_at", { ascending: false });
  },

  /** Villa sayımı için: yalnız owner_id (NULL hariç). villa public-read. */
  async findLinkedVillaOwnerIds() {
    return await db
      .from("villa")
      .select("owner_id")
      .not("owner_id", "is", null);
  },

  /** SELECT dropdown — hafif projeksiyon, first_name ASC. */
  async findAllForSelect() {
    return await db
      .from("property_owners")
      .select("id, first_name, last_name, phone, email, iban")
      .order("first_name", { ascending: true });
  },

  async insert(payload: PropertyOwnerWritePayload) {
    return await db.from("property_owners").insert(payload);
  },

  async updateById(id: string, payload: PropertyOwnerWritePayload) {
    return await db.from("property_owners").update(payload).eq("id", id);
  },

  async deleteById(id: string) {
    return await db.from("property_owners").delete().eq("id", id);
  },
};
