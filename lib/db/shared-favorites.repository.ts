import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 3 — anon repo) — client-sever sonrası native
   provider'a alındı. Public create artık favoriler/shared-favorites.action
   ("use server") üzerinden; token read server component'ten. eski sağlayıcı
   importu tamamen kaldırıldı. `server-only` defansif sınır. Method yüzeyi
   (create/findByToken) + dönüş şekli AYNEN. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ SHARED FAVORITES REPOSITORY (native)
   ===============================================================
   `shared-favorites.service.ts` içindeki inline `db.from(...)`
   çağrılarının BİREBİR taşınmış hali (single table:
   shared_favorite_lists). Davranış değişmez:
     - `db` = native provider (`dbNative`); method'lar ham `{ data, error }`
       / maybeSingle döner. Tek app rolü → RLS/session-DI YOK.

   TOKEN / EXPIRY KORUNUR:
     - token üretimi (~48-bit), collision retry (23505 kontrolü),
       expires_at ISO hesabı, expiry guard — hepsi SERVICE'te kalır.
     - revoked_at YOK (bu tabloda kolon yok); guard eklenmez.
     - cleanup pg_cron (migration 057) tarafında.
   SELECT projeksiyonu, `.eq("token", ...)`, `.maybeSingle()` AYNEN.
=============================================================== */

export const sharedFavoritesRepository = {
  async create(payload: Record<string, unknown>) {
    return await db.from("shared_favorite_lists").insert(payload);
  },

  async findByToken(token: string) {
    return await db
      .from("shared_favorite_lists")
      .select("token, villa_ids, created_at, expires_at")
      .eq("token", token)
      .maybeSingle();
  },
};
