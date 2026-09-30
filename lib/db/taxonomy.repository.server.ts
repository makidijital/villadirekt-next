import "server-only";

/* 🛡️ NATIVE CUTOVER — villa-location pilotu PASS sonrası taxonomy
   aggregator native provider'a alındı (findLocations/Types/Features/
   RuleItems/PriceIncludeItems). Method yüzeyi + dönüş şekli aynen.
   Runtime testi yeşil olmadan production'a deploy edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ TAXONOMY — SERVER-ONLY READ AGGREGATOR (service-role)
   ===============================================================
   `/api/admin/taxonomies` route handler'ının (Bearer + active admin
   gate) 5 paralel taxonomy lookup'ını service-role ile sunar. menu.
   repository'nin (cross-table read aggregator) service-role
   karşılığı: tek admin route birden çok taxonomy tablosunu tek
   response'da birleştirir → aggregator repo mantıklı.

   ⚠️ NEDEN ANON DOMAIN REPO'LARI REUSE EDİLMEDİ:
     villaLocation/villaType/villaFeature/ruleItem/priceInclude
     repository'leri `db` (anon, RLS) kullanır. Bu route `dbAdmin`
     (service-role, RLS bypass) kullanır; anon'a düşürmek EXECUTION
     PATH / permission semantiğini değiştirir (public.taxonomies
     route'u anon `db` kullanır — O AYRI). Byte-identical korumak için
     service-role method'lar ayrı tutulur.

   GÜVENLİK SINIRI (pages/menu/blog .server konvansiyonu):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` → service-role (service-role kimlik bilgisi, NEXT_PUBLIC_
       prefix yok) → yalnız server runtime. Çağıran route
       `authorizeAdminCaller` arkasında.

   DAVRANIŞ — BYTE-IDENTICAL eski inline `dbAdmin.from(...)` çağrıları:
     - Select shape + order chain AYNEN; native `{ data, error }` döner;
       repo sessiz. `res.data || []` fallback caller (route) tarafında.
   =============================================================== */

export const taxonomyServerRepository = {
  /** villa_locations — slim (id, name, slug, filter_group_name), order YOK. */
  async findLocations() {
    return await dbAdmin
      .from("villa_locations")
      .select("id, name, slug, filter_group_name");
  },

  /** villa_types — slim (id, name, slug), sort_order ASC (tie-break name
   *  ASC). Migration 066: order-suz → sort_order (admin taxonomy dropdown'ları
   *  villa tipi sırasını izler). */
  async findTypes() {
    return await dbAdmin
      .from("villa_types")
      .select("id, name, slug")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
  },

  /** villa_features — slim (id, name), order YOK. */
  async findFeatures() {
    return await dbAdmin.from("villa_features").select("id, name");
  },

  /** rule_items — (id, title), created_at ASC. */
  async findRuleItems() {
    return await dbAdmin
      .from("rule_items")
      .select("id, title")
      .order("created_at", { ascending: true });
  },

  /** price_include_items — (id, title), created_at ASC. */
  async findPriceIncludeItems() {
    return await dbAdmin
      .from("price_include_items")
      .select("id, title")
      .order("created_at", { ascending: true });
  },
};
