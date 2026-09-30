import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (pilotlar PASS). Method yüzeyi +
   dönüş şekli aynen. Runtime testi yeşil olmadan production'a deploy
   edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ PAGES — SERVER-ONLY REPOSITORY (service-role)
   ===============================================================
   `pages` tablosu admin CRUD I/O. `/api/admin/pages` route handler'ı
   (Bearer + active admin gate) bu repo üzerinden service-role ile
   yazar/okur. Anon repository (`lib/db/pages.repository.ts`) public
   read'leri (is_active=true list, slug detail, footer projection)
   AYNEN sürdürür — bu server repo ONUN DUPLİKASYONU DEĞİL, settings
   konvansiyonundaki (anon + .server) service-role karşılığıdır.

   ⚠️ NEDEN AYRI (anon repo reuse EDİLEMEZ):
     - Anon repo `db` (RLS) kullanır; admin write/draft görünürlüğü
       service-role (`dbAdmin`, RLS bypass) gerektirir.
     - Anon `findActiveList()` `is_active=true` filtreler; admin DRAFT
       (is_active=false) satırları da görmek/publish toggle yapmak
       zorunda → filtre YOK list gerekir.

   GÜVENLİK SINIRI (settings/villa-zip/reservation .server konvansiyonu):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` → service-role (service-role kimlik bilgisi, NEXT_PUBLIC_
       prefix yok) → yalnız server runtime. Çağıran route
       `authorizeAdminCaller` arkasında.

   DAVRANIŞ — BYTE-IDENTICAL eski inline `dbAdmin.from("pages")` çağrıları:
     - Her metod native eski sağlayıcı `{ data, error }` döndürür; repo sessiz
       (throw / console / log YOK). Tüm error-mapping / status / log
       caller (route handler) tarafında AYNEN kalır.
   =============================================================== */

export const pagesServerRepository = {
  /** Admin list — TÜM satırlar (DRAFT dahil), created_at DESC. */
  async listAll() {
    return await dbAdmin
      .from("pages")
      .select("*")
      .order("created_at", { ascending: false });
  },

  /** Insert — eklenen satırı döner (.select().single()). */
  async insert(payload: unknown) {
    return await dbAdmin
      .from("pages")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(payload as any)
      .select()
      .single();
  },

  /** Detail by id — TÜM kolonlar (DRAFT dahil), .maybeSingle() resolver. */
  async findById(id: string) {
    return await dbAdmin
      .from("pages")
      .select("*")
      .eq("id", id)
      .maybeSingle();
  },

  /** Cover image read — delete öncesi orphan cleanup için (.maybeSingle()). */
  async findCoverImage(id: string) {
    return await dbAdmin
      .from("pages")
      .select("cover_image")
      .eq("id", id)
      .maybeSingle();
  },

  /** Delete by id. */
  async deleteById(id: string) {
    return await dbAdmin.from("pages").delete().eq("id", id);
  },

  /** Update by id — menu visibility/order/parent toggle. */
  async updateById(id: string, patch: Record<string, unknown>) {
    return await dbAdmin.from("pages").update(patch).eq("id", id);
  },

  /** Update by id — güncellenen satırı döner (.select().single()).
   *  Resource route (content/SEO/publish) için; `updateById`'den farkı
   *  .select().single() ile updated row dönmesi (slug unique violation
   *  caller'da 409'a map'lenir). */
  async updateReturning(id: string, patch: Record<string, unknown>) {
    return await dbAdmin
      .from("pages")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
  },
};
