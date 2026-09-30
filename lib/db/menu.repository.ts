import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 2 — anon repo) — importer zinciri KANITLI
   client-safe (Header/Footer RSC + menu.service + hero-filters.action
   [server-action] + RSC page'ler + cache.helpers; hiçbir "use client"
   yok). 4 düz okuma; embed/rpc/write yok. `order` rezerve kelime →
   compiler tırnaklıyor. Provider değişmedi. `server-only` defansif
   sınır. Dönüş şekli aynen. */
import { dbNative as db } from "@/lib/db/native";

/* Native `from()` varsayılan `QueryResultRow`; anon DB client `Database`
   generic'iyle domain row tipliyordu. Tüketiciler (hero-filters.action →
   HeroSearchPanel) alan-tipli erişir → sorgular domain row tipiyle
   parametrelenir (davranış değişmez). */
import type {
  MenuRow,
  PageRow,
  VillaTypeRow,
  VillaLocationRow,
} from "@/types/database";

/* villa_locations projeksiyonu: VillaLocationRow mirror'ı `filter_group_name`
   (migration 050 additive) içermiyor; menu/hero bu alanı kullanır. Sorgu
   onu seçtiği için tip tamamlanır (types/database.ts'e dokunmadan, repo-lokal). */
type MenuVillaLocationRow = VillaLocationRow & {
  filter_group_name: string | null;
};

/* ===============================================================
   🛡️ FAZ 40 — MENU REPOSITORY
   ===============================================================
   `menu` + cross-table sources (`pages`, `villa_types`,
   `villa_locations`) için read-side aggregator. Service `getMenu`
   tree-builder + resolver business logic'i kapsar; repository
   sadece 4 paralel fetch'i sunar.

   ⚠️ KESIN KURAL:
     - Select shape'leri AYNEN (id, name, href, order, parent_id,
       source_type, source_id / id, title, slug, menu_order,
       menu_parent_id, is_active / id, name, slug).
     - is_active=true filtre pages için aynen.
     - Promise.all paralel pattern service'te kalır; repository
       tekil metodlar sunar.

   ⚠️ Component-direct eski sağlayıcı çağrıları (admin menu/page +
   menu/new/page) bu cycle scope'unda — `pages.repository`'ye
   benzer şekilde ele alınacak; menu CRUD repo metodları aşağıda.
=============================================================== */

export const menuRepository = {
  /** menu satırları — tree builder ham input. */
  async findAll() {
    return await db
      .from<MenuRow>("menu")
      .select(
        "id, name, href, order, parent_id, source_type, source_id"
      );
  },

  /** Active pages — menu resolver lookup map'i + auto-include. */
  async findActivePagesForMenu() {
    return await db
      .from<PageRow>("pages")
      .select(
        "id, title, slug, menu_order, menu_parent_id, is_active, show_in_menu"
      )
      .eq("is_active", true);
  },

  /** Villa types — category source lookup. */
  async findAllVillaTypes() {
    return await db
      .from<VillaTypeRow>("villa_types")
      .select("id, name, slug");
  },

  /** Villa locations — region source lookup.
      🛡️ Migration 050: filter_group_name additive (Hero ana-bölge
      süzme için tüketilir; menu/footer consumer'ları extra key'i
      yok sayar — davranış değişmez). */
  async findAllVillaLocations() {
    return await db
      .from<MenuVillaLocationRow>("villa_locations")
      .select("id, name, slug, filter_group_name");
  },
};
