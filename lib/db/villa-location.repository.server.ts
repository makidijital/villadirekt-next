import "server-only";

/* 🛡️ NATIVE CUTOVER (PILOT) — native provider parity tamamlandı
   (tip-parser'lar, single/maybeSingle, PGRST116, rpc, search_path).
   Bu repo, native provider'ın gerçek eski sağlayıcı PostgreSQL'e karşı İLK
   doğrulama pilotu. Method yüzeyi + dönüş şekli aynen. Runtime testi
   (Admin Bölgeler + insert/update/delete) yeşil olmadan PRODUCTION'a
   deploy EDİLMEMELİ; sorun çıkarsa yalnız native provider düzeltilir. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ VILLA LOCATIONS — SERVER-ONLY REPOSITORY (service-role)
   ===============================================================
   `villa_locations` tablosu admin CRUD I/O. `/api/admin/villa-locations`
   route handler'ı (Bearer + active admin gate) bu repo üzerinden
   service-role ile listeler/yazar/siler. Anon repository
   (`lib/db/villa-location.repository.ts`) public taxonomy read'lerini
   (getCachedVillaLocations + public/taxonomies) AYNEN sürdürür — bu
   server repo ONUN DUPLİKASYONU DEĞİL, pages/menu/blog
   konvansiyonundaki service-role write karşılığıdır.

   ⚠️ NEDEN AYRI (anon repo + taxonomy aggregator reuse EDİLEMEZ):
     - Anon repo `db` (RLS) read sunar; admin write/list service-role
       (`dbAdmin`, RLS bypass) gerektirir.
     - `taxonomy.repository.server.findLocations()` slim projeksiyon
       (`id, name, slug, filter_group_name`); admin GET `select("*")`
       + created_at DESC ister → farklı.

   GÜVENLİK SINIRI (pages/menu/blog .server konvansiyonu):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` → service-role (service-role kimlik bilgisi, NEXT_PUBLIC_
       prefix yok) → yalnız server runtime. Çağıran route
       `authorizeAdminCaller` arkasında.

   DAVRANIŞ — BYTE-IDENTICAL eski inline `dbAdmin.from("villa_locations")`
   çağrıları:
     - Native `{ data, error }` döner; repo sessiz. Validation /
       partial-update kararı / error-mapping / status / log caller
       (route) tarafında AYNEN kalır.
   =============================================================== */

export const villaLocationServerRepository = {
  /** Admin list — TÜM kolonlar (`*`), created_at DESC. */
  async listAll() {
    return await dbAdmin
      .from("villa_locations")
      .select("*")
      .order("created_at", { ascending: false });
  },

  /** Insert — tekil satır array-wrap (.insert([payload])). */
  async insert(payload: { name: string; slug: string }) {
    return await dbAdmin.from("villa_locations").insert([payload]);
  },

  /** Update by id — partial payload (name/slug/cover_image/
   *  show_in_filter/filter_group_name). */
  async updateById(id: string, updates: Record<string, unknown>) {
    return await dbAdmin
      .from("villa_locations")
      .update(updates)
      .eq("id", id);
  },

  /** Delete by id. */
  async deleteById(id: string) {
    return await dbAdmin.from("villa_locations").delete().eq("id", id);
  },
};
