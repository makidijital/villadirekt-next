import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 3 — anon repo) — client-sever sonrası native
   provider'a alındı. Admin CRUD artık discount-collection/discount-collection
   .action ("use server") üzerinden; public read cache.helpers/homepage
   (server) üzerinden. eski sağlayıcı importu tamamen kaldırıldı. `server-only`
   defansif sınır. Embed select string'leri (villa:villa_id nested) + SQL
   davranışı AYNEN; embed relation-metadata (discount_collections → villa →
   location/villa_images/villa_prices) kaydından çözülür. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ DISCOUNT COLLECTIONS REPOSITORY (native)
   ===============================================================
   `discount_collections` tablosu — "İndirimli Koleksiyon" curasyon
   master. homepage.repository.ts'in BİREBİR klonu; tek fark tablo
   adı (`discount_collections`). Raw I/O; karar service tarafında.
   `db` = native provider (`dbNative`); tek app rolü → RLS/session-DI YOK.

   ⚠️ KESIN KURAL (homepage paralel):
     - List embed shape (villa:villa_id (..., villa_images (...)))
       AYNEN; sort_order ASC.
     - Add: maxSortOrder + 1; service decision tarafında.
     - Reorder: paralel update'ler service Promise.all'da.
=============================================================== */

const LIST_SELECT = `
      id, villa_id, sort_order, is_active, custom_title,
      custom_cover_image, selected_discount_ranges, created_at,
      villa:villa_id (
        id, slug, title, is_active, deleted_at,
        villa_images ( image_url, is_cover, sort_order ),
        villa_discounts ( end_date )
      )
    `;

export const discountRepository = {
  /** Admin list — aktif + pasif, sort_order ASC. */
  async findAllForAdmin() {
    return await db
      .from("discount_collections")
      .select(LIST_SELECT)
      .order("sort_order", { ascending: true });
  },

  /** PUBLIC CARDS — yalnız aktif (is_active=true); embedded villa +
   *  location + images + prices + discounts; sort_order ASC.
   *  cache.helpers > getCachedDiscountCollectionVillas delege.
   *  homepage public-cards metodunun BİREBİR klonu; tek fark tablo
   *  (`discount_collections`) ve EK `villa_discounts` embed'i.
   *  Embedded select string + .eq + order BİREBİR cache.helpers'tan
   *  kopyalandı; mapping caller'da KALIR.
   *
   *  🛡️ `villa_discounts` embed — villa kartında "aktif indirim" tarih
   *  aralığı + indirimli fiyat göstermek için (relation-metadata.ts'e
   *  `villa_prices`'ın BİREBİR yapısal ikizi olarak eklendi). Tarih
   *  filtresi YOK (tüm kayıtlar gelir) — "aktif" seçimi caller'da
   *  `price.engine > getActiveDiscount` ile yapılır. Yeni bir sorgu
   *  SİSTEMİ değil, mevcut embed altyapısının (villa_prices ile aynı
   *  desen) tekrar kullanımı. */
  async findActivePublicCards() {
    return await db
      .from("discount_collections")
      .select(
        `
        id,
        sort_order,
        is_active,
        custom_title,
        custom_cover_image,
        selected_discount_ranges,
        villa:villa_id (
          id,
          slug,
          title,
          badge,
          bedrooms,
          bathrooms,
          guests,
          is_active,
          deleted_at,
          location:villa_locations(name),
          villa_images (
            image_url,
            is_cover,
            sort_order
          ),
          villa_prices (
            price,
            currency,
            start_date,
            end_date
          ),
          villa_discounts (
            start_date,
            end_date,
            discount_type,
            discount_value,
            currency
          )
        )
      `
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
  },

  /** Add helper'ı için max sort_order. */
  async findMaxSortOrder() {
    return await db
      .from("discount_collections")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
  },

  /** INSERT — service nextOrder + villa_id + is_active default true. */
  async insert(payload: {
    villa_id: string;
    sort_order: number;
    is_active: boolean;
  }) {
    return await db.from("discount_collections").insert(payload);
  },

  /** Hard delete (satır kaldır). */
  async deleteById(id: string) {
    return await db
      .from("discount_collections")
      .delete()
      .eq("id", id);
  },

  /** Generic update by id — toggle / custom fields / reorder. */
  async updateById(id: string, payload: Record<string, unknown>) {
    return await db
      .from("discount_collections")
      .update(payload)
      .eq("id", id);
  },
};
