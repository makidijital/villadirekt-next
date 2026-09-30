import "server-only";

/* ===============================================================
   🛡️ VILLA IMAGES REPOSITORY — SERVER-ONLY NATIVE TWIN (Migration IMG-P1)
   ===============================================================
   Anon `lib/db/villa-image.repository.ts` (`villaImageRepository`;
   dbNative + DI eski sağlayıcı client) yerine native PostgreSQL
   karşılığı. Provider `dbAdminNative` (native pg, tek privileged rol;
   RLS native'de yok → write authz app-layer'a taşınır — IMG-P2 auth
   gate + IMG-P3 repoint).

   ⚠️ ADDITIVE — bu sprintte REPOINT YOK: eski repo aynen kullanılır;
     bu twin henüz hiçbir importer tarafından tüketilmez.

   ⚠️ STORAGE BURADA DEĞİL (R2, migration dışı): repo yalnız `villa_images`
     satır I/O'su. parseVillaStorageUrl/removeVilla* SERVICE'te.

   ⚠️ Method isimleri + SQL + return (`{ data, error }` / maybeSingle) anon
     repo ile BYTE-IDENTICAL; tek fark provider (`db` → `dbAdminNative`) ve
     DI tipi (`DB client` → native-agnostik `NativeFromClient`). Row
     generic yalnız service field-access'i tiplenmesi gereken maybeSingle
     method'larında (sort_order aritmetiği, image_url arg) — VR-P5.5 deseni.
   =============================================================== */

import { dbAdminNative } from "@/lib/db/native";
import type { VillaImage } from "@/app/services/villa-image/villa-image.types";

/** Provider-agnostik DI tipi (native `.from`). Eski repo'nun
 *  `Pick<DB client,"from">`'unun native karşılığı; DB client
 *  bağımlılığı twin'e taşınmaz. Default privileged native. */
type NativeFromClient = Pick<typeof dbAdminNative, "from">;

export const villaImageServerRepository = {
  /** #1 — gallery read, sort_order ASC. */
  async findByVillaIdOrdered(
    villaId: string,
    client: NativeFromClient = dbAdminNative
  ) {
    return await client
      .from<VillaImage>("villa_images")
      .select("*")
      .eq("villa_id", villaId)
      .order("sort_order", { ascending: true });
  },

  /** #2 — max sort_order (limit 1, DESC, maybeSingle).
   *  🛡️ row generic: service `last.sort_order + 1` (aritmetik) → number. */
  async findMaxSortOrder(
    villaId: string,
    client: NativeFromClient = dbAdminNative
  ) {
    return await client
      .from<{ sort_order: number }>("villa_images")
      .select("sort_order")
      .eq("villa_id", villaId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
  },

  /** #3 — mevcut cover var mı (id, is_cover=true, maybeSingle).
   *  Service yalnız `!cover` (varlık) → row generic gerekmez. */
  async findCoverId(
    villaId: string,
    client: NativeFromClient = dbAdminNative
  ) {
    return await client
      .from<Record<string, unknown>>("villa_images")
      .select("id")
      .eq("villa_id", villaId)
      .eq("is_cover", true)
      .maybeSingle();
  },

  /** #4 — image insert (payload service'te kurulur). */
  async insert(
    payload: Record<string, unknown>,
    client: NativeFromClient = dbAdminNative
  ) {
    return await client.from("villa_images").insert(payload);
  },

  /** #5 — tek satır sort_order update (service Promise.all map'ler). */
  async updateSortOrderById(
    id: string,
    sortOrder: number,
    client: NativeFromClient = dbAdminNative
  ) {
    return await client
      .from("villa_images")
      .update({ sort_order: sortOrder })
      .eq("id", id);
  },

  /** #6 — villa'daki tüm cover'ları temizle (clear adımı). */
  async clearCoverByVilla(
    villaId: string,
    client: NativeFromClient = dbAdminNative
  ) {
    return await client
      .from("villa_images")
      .update({ is_cover: false })
      .eq("villa_id", villaId);
  },

  /** #7 — seçileni cover yap (set adımı). */
  async setCoverById(
    id: string,
    client: NativeFromClient = dbAdminNative
  ) {
    return await client
      .from("villa_images")
      .update({ is_cover: true })
      .eq("id", id);
  },

  /** #8 — delete öncesi image_url fetch (storage cleanup için).
   *  🛡️ row generic: service `removeVillaImageByUrl(image.image_url)` (arg). */
  async findImageUrlById(
    id: string,
    client: NativeFromClient = dbAdminNative
  ) {
    return await client
      .from<{ image_url: string | null }>("villa_images")
      .select("image_url")
      .eq("id", id)
      .maybeSingle();
  },

  /** #9 — tekil DB delete. */
  async deleteById(id: string, client: NativeFromClient = dbAdminNative) {
    return await client.from("villa_images").delete().eq("id", id);
  },

  /** #10 — bulk delete öncesi tüm image_url'ler.
   *  Service `i?.image_url as string|null|undefined` cast'liyor → generik gerekmez. */
  async findImageUrlsByVilla(
    villaId: string,
    client: NativeFromClient = dbAdminNative
  ) {
    return await client
      .from<Record<string, unknown>>("villa_images")
      .select("image_url")
      .eq("villa_id", villaId);
  },

  /** #11 — villa-scoped batch DB delete. */
  async deleteByVilla(
    villaId: string,
    client: NativeFromClient = dbAdminNative
  ) {
    return await client
      .from("villa_images")
      .delete()
      .eq("villa_id", villaId);
  },
};
