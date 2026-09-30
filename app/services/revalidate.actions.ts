"use server";

import { requireAdminAction } from "@/lib/auth/action-authz";
import { revalidateTag } from "next/cache";

/* ===============================================================
   🛡️ REVALIDATE ACTIONS — admin mutation sonrası cache invalidation
   ===============================================================
   Admin client component'lerinden çağrılan server action'lar.
   "use server" directive ile tüm export'lar RPC haline gelir.

   ⚠️ API: `revalidateTag(tag, { expire: 0 })` KULLANILIR.
     lib/cache.helpers.ts'teki cached helper'lar `unstable_cache(...,
     { tags: [...] })` ile kuruluyor; bu kayıtlar `revalidateTag` ile
     invalidate olur.

     🔄 İKİNCİ ARGÜMAN NEDEN `{ expire: 0 }` (Next 16.2.4 kaynak kanıtı):
       • `"max"` geçilirse → `revalidation-utils.js:119-123` cacheLife
         profilini okur (`config-shared.js:167` → `max.expire = 31536000`)
         → `file-system-cache.js:63-65` `expired = now + 31536000*1000`
         (1 YIL SONRASI) yazar → `tags-manifest.external.js` içindeki
         `areTagsExpired` koşulu `expiredAt <= now` FALSE döner →
         **entry geçersiz SAYILMAZ**. Yalnız `stale` işaretlenir, eski
         değer servis edilir (stale-while-revalidate).
       • `{ expire: 0 }` geçilirse → aynı satır `expired = now + 0 = now`
         yazar → `areTagsExpired` TRUE → **anında purge**. Next'in
         argümansız (deprecated) çağrıdaki `expired = now` davranışıyla
         BİREBİR aynı son durum, artı `stale = now` de set edilir.
       • Argümansız `revalidateTag(tag)` de doğru çalışırdı ama Next 16
         deprecation uyarısı basar (`revalidate.js:40-42`).

     `updateTag` BİLİNÇLİ OLARAK KULLANILMADI: `revalidate.js:48-52`
     route handler bağlamında THROW eder. Bu action'lar çağıranlarda
     `.catch(() => {})` ile fire-and-forget çağrılıyor → throw sessizce
     yutulur ve invalidation hiç olmaz. `revalidateTag` her bağlamda
     güvenlidir.

   TAGS ↔ CACHED HELPERS (lib/cache.helpers.ts):
     "settings"  → getCachedSettings
     "menu"      → getCachedMenu (CMS page değişikliği de etkiler;
                   menu auto-include pages)
     "villas"    → getCachedVillas
     "taxonomy"  → getCachedVillaLocations / getCachedVillaTypes
     "homepage"  → getCachedHomepageCollectionVillas (migration 012)

   Bu action'lar idempotent. Birden fazla çağrı side-effect üretmez.
   =============================================================== */

export async function revalidateSettings(): Promise<void> {
  await requireAdminAction();
  revalidateTag("settings", { expire: 0 });
}

export async function revalidateMenu(): Promise<void> {
  await requireAdminAction();
  revalidateTag("menu", { expire: 0 });
}

export async function revalidateVillas(): Promise<void> {
  await requireAdminAction();
  revalidateTag("villas", { expire: 0 });
}

export async function revalidateTaxonomy(): Promise<void> {
  await requireAdminAction();
  revalidateTag("taxonomy", { expire: 0 });
}

/* 🛡️ Anasayfa manuel koleksiyon (migration 012).
   Admin homepage_collections CRUD sonrası çağrılır. VillaList
   bu tag'i kullanır. "villas" tag'inden AYRI çünkü villa CRUD
   homepage curasyonunu invalidate etmesin (admin sıra değişmemiş
   ama bir villa edit'lendi → koleksiyon cache'i gereksizyere
   temizlenmesin). */
export async function revalidateHomepage(): Promise<void> {
  await requireAdminAction();
  revalidateTag("homepage", { expire: 0 });
}

/* 🛡️ İndirimli Koleksiyon (migration 062). Admin discount_collections
   CRUD sonrası çağrılır. DiscountCollection section'ı getCachedDiscount
   CollectionVillas (tag "discount") ile beslenir. "homepage"den AYRI. */
export async function revalidateDiscount(): Promise<void> {
  await requireAdminAction();
  revalidateTag("discount", { expire: 0 });
}

/* 🛡️ Global SSS (Faz 25). Admin /maki-admin/faqs sayfasında
   replaceFaqs sonrası çağrılır. Homepage FAQ section'ı bu tag'i
   kullanan getCachedFaqs ile beslenir. */
export async function revalidateFaqs(): Promise<void> {
  await requireAdminAction();
  revalidateTag("faqs", { expire: 0 });
}

/* 🛡️ Villa Reviews (Faz 33). Admin /maki-admin/reviews ekranında
   approve / unapprove / delete / toggleFeatured sonrası ve public
   tarafında createVillaReview sonrası çağrılır.
   Tag: "villa-reviews" — getCachedVillaReviews + getCachedVillaReviewStats
   her iki helper bu tag altında — tek invalidate her ikisini temizler. */
export async function revalidateVillaReviews(): Promise<void> {
  await requireAdminAction();
  revalidateTag("villa-reviews", { expire: 0 });
}
