import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 3 — anon repo) — client-sever sonrası native
   provider'a alındı. Admin okuma/yazma artık messages.action ("use
   server") üzerinden; public create route'tan native default ile.
   eski sağlayıcı importu + DB client DI tamamen kaldırıldı. `server-only`
   defansif sınır. Method yüzeyi (create/findAll/updateById) + dönüş şekli
   aynen. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ CONTACT MESSAGES REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `contact-message.service.ts` içindeki inline `db.from(...)`
   çağrılarının BİREBİR taşınmış hali (single table: contact_messages).
   Davranış değişmez:
     - `db` = native provider (`dbNative`); method'lar ham `{ data, error }`
       döner; trim-validation / payload / return / log SERVICE'te.
     - Tek app rolü → RLS/session-DI YOK (public create native default ile;
       admin okuma/yazma server action arkasında).
   ⚠️ `findAll` koşullu `.is("archived_at", null)` chain'i AYNEN
      (includeArchived false → archived hariç).
=============================================================== */

export const contactMessageRepository = {
  /** Public insert (native; tek app rolü — RLS/session DI gerekmez). */
  async create(payload: Record<string, unknown>) {
    return await db.from("contact_messages").insert(payload);
  },

  /** Admin listing — created_at DESC; includeArchived değilse archived hariç. */
  async findAll(includeArchived?: boolean) {
    let q = db
      .from("contact_messages")
      .select("*")
      .order("created_at", { ascending: false });
    if (!includeArchived) {
      q = q.is("archived_at", null);
    }
    return await q;
  },

  /** markAsRead / archiveMessage — payload service'te kurulur. */
  async updateById(id: string, payload: Record<string, unknown>) {
    return await db.from("contact_messages").update(payload).eq("id", id);
  },

  /** Kalıcı silme — RLS "contact_messages_authenticated_delete" policy'si
   *  (migration 015) zaten mevcut; şema değişmiyor. */
  async deleteById(id: string) {
    return await db.from("contact_messages").delete().eq("id", id);
  },
};
