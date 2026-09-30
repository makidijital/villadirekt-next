import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (pilotlar PASS). Method yüzeyi +
   dönüş şekli aynen. Runtime testi yeşil olmadan production'a deploy
   edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ MENU — SERVER-ONLY REPOSITORY (service-role)
   ===============================================================
   `menu` tablosu admin WRITE I/O (insert / update / delete).
   `/api/admin/menu` route handler'ı (Bearer + active admin gate) bu
   repo üzerinden service-role ile yazar. Anon repository
   (`lib/db/menu.repository.ts`) read-side aggregator'ı (menu tree +
   pages/villa_types/villa_locations source picker) AYNEN sürdürür —
   bu server repo ONUN DUPLİKASYONU DEĞİL, pages/settings
   konvansiyonundaki (anon + .server) service-role write karşılığıdır.

   ⚠️ NEDEN AYRI (anon repo reuse EDİLEMEZ):
     - Anon repo `db` (RLS) yalnız read sunar; menu satırı insert/
       update/delete service-role (`dbAdmin`, RLS bypass) gerektirir
       (eski client-direct `db.from("menu").insert/delete`
       path'inin BYTE-IDENTICAL sunucu karşılığı).

   ⚠️ CROSS-TABLE SYNC NOT BURADA:
     Menu insert sonrası `pages.show_in_menu=true` senkronu route
     içinde `pagesServerRepository.updateById` ile yapılır (pages
     write → pages repo). Menu repo yalnız `menu` tablosuna dokunur.

   GÜVENLİK SINIRI (pages/settings/villa-zip .server konvansiyonu):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` → service-role (service-role kimlik bilgisi, NEXT_PUBLIC_
       prefix yok) → yalnız server runtime. Çağıran route
       `authorizeAdminCaller` arkasında.

   DAVRANIŞ — BYTE-IDENTICAL eski inline `dbAdmin.from("menu")` çağrıları:
     - Her metod native eski sağlayıcı `{ data, error }` döndürür; repo sessiz
       (throw / console / log YOK). Error-mapping / status / log caller
       (route handler) tarafında AYNEN kalır.
   =============================================================== */

export const menuServerRepository = {
  /** Insert — tekil satır array-wrap (.insert([payload])).
   *  🛡️ MIGRATION 086 — `.select("id").single()` EKLENDİ: yeni menü
   *  satırının id'si, EN/DE ad çevirilerini (`menu_translations`)
   *  aynı akışta yazabilmek için caller'a döner. Yazılan satır,
   *  kolonlar ve `{ data, error }` zarfı DEĞİŞMEDİ — yalnız dönen
   *  `data` artık `null` yerine `{ id }`. Aynı desen zaten projede
   *  kanıtlı (external-calendar-source.repository.ts > insert). */
  async insert(payload: {
    name: string;
    href: string;
    source_type: string;
    source_id: string | null;
    is_active: boolean;
  }) {
    return await dbAdmin
      .from<{ id: string }>("menu")
      .insert([payload])
      .select("id")
      .single();
  },

  /** 🛡️ MIGRATION 086 — tek satırın `source_type`'ı (çeviri yazma
   *  ön-kontrolü). `menu_translations` YALNIZ `manual` satırlar için
   *  tutulur; page/category/region'ın kendi çeviri kaynakları vardır.
   *  `pages.repository.server.ts > findById` ile AYNI "parent
   *  pre-check" deseni (bkz. page-translation.service.ts). */
  async findSourceTypeById(id: string) {
    return await dbAdmin
      .from<{ id: string; source_type: string | null }>("menu")
      .select("id, source_type")
      .eq("id", id)
      .maybeSingle();
  },

  /** Update by id — order/parent_id drag-drop persist. */
  async updateById(id: string, patch: Record<string, unknown>) {
    return await dbAdmin.from("menu").update(patch).eq("id", id);
  },

  /** Delete by id. */
  async deleteById(id: string) {
    return await dbAdmin.from("menu").delete().eq("id", id);
  },
};
