import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 3 — anon repo) — client-sever sonrası native
   provider'a alındı. Admin create artık villa-listesi/_components/
   shared-villa-list.action ("use server") üzerinden; token read server
   component'ten. eski sağlayıcı importu tamamen kaldırıldı. `server-only`
   defansif sınır. Method yüzeyi (create/findByToken) + dönüş şekli AYNEN. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ SHARED VILLA LISTS REPOSITORY (native)
   ===============================================================
   `shared-villa-list.service.ts` içindeki inline
   `db.from("shared_villa_lists")...` çağrılarının BİREBİR
   taşınmış hali. Davranış değişmez:
     - `db` = native provider (`dbNative`); method'lar ham `{ data, error }`
       döner. Tek app rolü → RLS/session-DI YOK.

   TOKEN / EXPIRY KORUNUR:
     - token üretimi, ~48-bit entropy, collision retry (23505 kontrolü),
       expires_at ISO hesabı, allow-list TTL — hepsi SERVICE'te kalır.
     - Bu repo yalnız hazır payload'ı insert eder ve token ile select
       yapar. `expires_at` payload'ın parçası; expiry guard SERVICE'te.
     - cleanup (`expires_at < now()`) pg_cron (migration 036) tarafında;
       bu dosyada YOK → repo'ya eklenmedi.

   SELECT projeksiyonu, `.eq("token", ...)`, `.maybeSingle()` AYNEN.
=============================================================== */

export const sharedVillaListRepository = {
  async create(payload: Record<string, unknown>) {
    return await db.from("shared_villa_lists").insert(payload);
  },

  async findByToken(token: string) {
    return await db
      .from("shared_villa_lists")
      .select(
        "token, villa_ids, search_params, title, note, created_at, expires_at, revoked_at"
      )
      .eq("token", token)
      .maybeSingle();
  },
};
