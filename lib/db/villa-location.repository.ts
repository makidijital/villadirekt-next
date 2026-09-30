import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 2 — anon repo) — importer zinciri KANITLI
   client-safe (yalnız route/RSC/server-only/server-action; hiçbir
   "use client" yok). Düz okuma; embed/rpc/write yok → provider
   değişmedi. `server-only` defansif sınır (client bundle'a sızarsa
   BUILD HATA). Method yüzeyi + dönüş şekli aynen. */
import { dbNative as db } from "@/lib/db/native";

/* Native `from()` varsayılan `QueryResultRow` döndürür; anon DB client
   `Database` generic'iyle `VillaLocationRow` tipliyordu. Tüketiciler
   (ör. villa-edit action → client setLocations) bu tipi bekliyor →
   sorgular domain row tipiyle parametrelenir (davranış değişmez). */
import type { VillaLocationRow } from "@/types/database";

/* ===============================================================
   🛡️ VILLA LOCATIONS REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `villa_locations` tablosu — read-side taxonomy. cache.helpers >
   getCachedVillaLocations'ın inline `db.from<VillaLocationRow>("villa_locations")`
   sorgusunun BİREBİR taşınmış hali.

   ⚠️ NEDEN AYRI REPO:
     Mevcut `menu.repository.ts > findAllVillaLocations` FARKLI bir
     projeksiyon kullanır (`id, name, slug, filter_group_name`); bu
     taxonomy cache zengin projeksiyon (`+ cover_image, show_in_filter`)
     ve `name ASC` order ister. Reuse byte-identical OLMAZDI → ayrı
     dedicated repo (villa_locations için ilk repo).

   DAVRANIŞ (villa-type.repository konvansiyonu):
     - `db` = dbNative (anon, RLS) → cache.helpers'ın kullandığı
       `@/lib/db` ile aynı PostgrestQueryBuilder → byte-identical.
     - Native `{ data, error }` döner; repo sessiz.
     - cover_v cache-bust timestamp + mapping cache.helpers'ta KALIR.
=============================================================== */

export const villaLocationRepository = {
  /** GET — taxonomy projeksiyon, name ASC. cache.helpers >
   *  getCachedVillaLocations için BİREBİR (select + order). */
  async findAllForTaxonomy() {
    return await db
      .from<VillaLocationRow>("villa_locations")
      .select(
        "id, name, slug, cover_image, show_in_filter, filter_group_name"
      )
      .order("name", { ascending: true });
  },

  /** GET — public taxonomy slim projeksiyon (id, name, slug,
   *  filter_group_name); order YOK. app/api/public/taxonomies route
   *  için BİREBİR. `findAllForTaxonomy`'den farkı: cover_image/
   *  show_in_filter YOK + order YOK (public form dropdown'ları). */
  async findAllForPublicTaxonomy() {
    return await db
      .from<VillaLocationRow>("villa_locations")
      .select("id, name, slug, filter_group_name");
  },

  /** GET — `select("*")` (filter/order YOK). Admin villa edit page
   *  location seçici (grup-kök filtresi caller'da). BİREBİR. */
  async findAllStar() {
    return await db.from<VillaLocationRow>("villa_locations").select("*");
  },

  /** GET — slim (id, name, filter_group_name), name ASC. Admin
   *  villa-listesi (concierge curator) bölge dropdown'u + grup-kök
   *  genişletme. `findAllForPublicTaxonomy` (slug DAHİL, order YOK) ve
   *  `findAllForTaxonomy` (cover_image/show_in_filter DAHİL) DEĞİL — bu
   *  slim + name ASC. Native `{ data, error }` döner. */
  async findAllForFilter() {
    return await db
      .from<VillaLocationRow>("villa_locations")
      .select("id, name, filter_group_name")
      .order("name", { ascending: true });
  },
};
