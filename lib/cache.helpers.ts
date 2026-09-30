import { unstable_cache } from "next/cache";

import { resolveVillaImageUrl } from "@/lib/storage.helpers";
/* 🛡️ Kart "…'den başlayan" fiyatı — TÜM public kartlarda TEK ortak
   mantık: villa_prices içindeki MIN nightly (getStartingPrice). Eskiden
   koleksiyon mapper'ları villa_prices[0] kullanıyordu → tutarsız. */
import { getStartingPrice, type DiscountRange } from "@/lib/price.engine";
import { parseLocalDate, formatLocalDate } from "@/lib/date-format";
/* 🛡️ MÜSAİTLİK — MEVCUT, DOĞRULANMIŞ TOPLU MEKANİZMA.
   `getBlockedVillaIds` → `get_blocked_villa_ids` RPC (migration 039,
   SECURITY DEFINER, PII-safe). /arama (AramaPageBody:885) ve admin
   villa-listesi (availability.action) ile AYNI fonksiyon/RPC. Yeni
   repository/RPC/migration/availability sistemi OLUŞTURULMADI;
   yalnız BURADAN DA çağrılıyor. */
import { getBlockedVillaIds } from "@/lib/availability.helper";
/* 🛡️ MIGRATION 092 — admin küratörlük seçimi (hangi indirim dönemleri
   public'te gösterilecek). Normalize helper'ı servis katmanında TEK
   yerde tanımlı; burada yalnız okunur. */
import { normalizeSelectedDiscountRanges } from "@/app/services/discount-collection.service";
/* 🛡️ Villa Migration S2 + S8L — findActiveLocationIds (S2) +
   findActiveImagesByIds (S8L) native'e taşındı. cache.helpers zaten
   server-only (unstable_cache) → server-only native repo import'u güvenli.
   `villaRepository` alias'ı native villaAdminRepository'ye bağlanır →
   call-site'lar (villaRepository.findActiveImagesByIds /
   villaAdminRepository.findActiveLocationIds) DEĞİŞMEZ. Anon
   villa.repository import'u kaldırıldı (cache.helpers tamamen native). */
import {
  villaAdminRepository,
  villaAdminRepository as villaRepository,
} from "@/lib/db/villa.repository.server";
import { villaTypeRepository } from "@/lib/db/villa-type.repository";
import { villaLocationRepository } from "@/lib/db/villa-location.repository";
import { homepageRepository } from "@/lib/db/homepage.repository";
import { discountRepository } from "@/lib/db/discount.repository";
import { getPublicSettings } from "@/app/services/settings.service";
import { getMenu } from "@/app/services/menu.service";
import { getVillas, type VillaDTO } from "@/app/services/villa.service";
import { getFaqs, type Faq } from "@/app/services/faq.service";
/* 🛡️ PHASE 11 — SSS çevirisi (faq_translations, migration 082). Locale
   BAŞINA AYRI cache key'i kullanılır (aşağıya bkz.) — çapraz-dil
   sızıntısı yapısal olarak imkânsız. */
import { applyFaqTranslations } from "@/lib/i18n/get-faq-translations.server";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import {
  getApprovedVillaReviews,
  getFeaturedHomepageReviews,
  getGlobalReviewStats,
  getVillaReviewStats,
  getVillaReviewStatsBatch,
  type GlobalReviewStats,
  type HomepageReviewItem,
  type VillaReviewPublic,
  type VillaReviewStats,
} from "@/app/services/villa-review.service";

/* ===============================================================
   🛡️ CACHE HELPERS — server-side memoization with tag-based
   invalidation. SSR cost'unu düşürmek için kullanılır.
   ===============================================================
   STRATEGY:
     - getSettings / getMenu: yüksek TTL (1 saat). Admin mutation
       sonrası revalidateTag ile invalidate.
     - getVillas: orta TTL (10 dakika). Villa create/edit/sort/
       toggle/delete sonrası invalidate.
     - villa_locations / villa_types: yüksek TTL (1 saat); rare
       mutations. Standalone invalidate yapılmaz (TTL bekler) —
       admin location/type ekleme rare ve UX-acceptable.

   DYNAMIC ROUTES (dokunulmuyor):
     - reservations / manual_reservations queries (availability)
     - /arama villa inline query (filter-dependent)
     - admin panel queries

   FALLBACK CHAIN (her cached helper aynı pattern):
     await getCached*()      → cache hit (DB hit yok)
       miss/expired          → underlying service çağrısı → cache fill
       service error         → catch downstream'de zaten var
   =============================================================== */

/** Settings — tek satır config (PUBLIC-SAFE). Tag: "settings".
 *  🛡️ getCachedSettings YALNIZ public/root sayfalardan kullanılır
 *  (app/layout, public layout, public pages). 042 admin-only RLS sonrası
 *  server-anon table-select kırılacağı için public-safe RPC path
 *  (getPublicSettings → get_public_settings) kullanır. Bonus: secret
 *  artık server data cache'inde de TUTULMAZ. Admin full settings için
 *  getSettings (authenticated) ayrı kullanılır; bu cache'i çağırmaz. */
export const getCachedSettings = unstable_cache(
  async () => getPublicSettings(),
  ["settings:get"],
  { tags: ["settings"], revalidate: 3600 }
);

/** Menu tree — dynamic 4-source resolver (manual/page/category/region).
    Tag: "menu". Page CRUD + menu CRUD invalidate eder. */
export const getCachedMenu = unstable_cache(
  async () => getMenu(),
  ["menu:get"],
  { tags: ["menu"], revalidate: 3600 }
);

/** Villa public listing — getVillas() (active + not-deleted, sort_order
    ASC). Tag: "villas". Villa CRUD/sort/visibility tüm mutations
    invalidate eder. TTL daha kısa (10 dk) çünkü daha dinamik domain.

    🛡️ FAZ 35 — `villa-reviews` tag eklendi. getVillas artık review
    stats merge eder (review_average / review_count); review CRUD
    (admin approve/delete/feature, public form submit) bu cache'i
    de invalidate etmeli ki card UI'ı taze stat'lerle render olsun.
    Mevcut "villas" semantic'i aynen; ek tag yalnız invalidate yolunu
    genişletir. */
/* 🛡️ 2 MB CACHE LİMİTİ — KART PAYLOAD'I
   ===============================================================
   `getVillas()` 52 alanlı tam `VillaDTO` döndürür (açıklama, harita
   embed'i, SEO, oda düzeni, token…). ~1.400 villada bu, Next data
   cache'in giriş başına 2 MB sınırını aştığı için kayıt HİÇ
   yazılmıyor ve her istek tam listeyi DB'den yeniden çekiyordu
   ("items over 2MB can not be cached").

   Bu cache'in TÜM tüketicileri (`KiralikVillalarPageBody`,
   `VillaList`) yalnız aşağıdaki kart alanlarını okur: `VillaCard`
   prop'ları, `applyPublicSort` (price/currency/guests), JSON-LD
   (slug/title/images[0]), rozet çevirisi (id), sayfalama (length).
   Cache'e YALNIZ bu alanlar yazılır; değerler `getVillas()`'tan
   AYNEN kopyalanır (dönüşüm YOK) → satır kümesi, sıra ve kart
   çıktısı birebir aynı. `getVillas`, `listPublic`, `mapVilla`,
   `VillaDTO` DEĞİŞMEDİ.

   🛡️ "taxonomy" tag'i: kartta görünen bölge adı (`location`)
   villa_locations'tan gelir; bölge adı değişince mevcut
   `revalidateTaxonomy()` bu listeyi de tazelesin diye eklendi.
   TTL (600 sn) ve cache key AYNI. */
export type PublicVillaCard = Pick<
  VillaDTO,
  | "id"
  | "slug"
  | "title"
  | "location"
  | "price"
  | "currency"
  | "images"
  | "badge"
  | "bedrooms"
  | "bathrooms"
  | "guests"
  | "review_average"
  | "review_count"
>;

function toPublicVillaCard(v: VillaDTO): PublicVillaCard {
  const card: PublicVillaCard = {
    id: v.id,
    slug: v.slug,
    title: v.title,
    location: v.location,
    price: v.price,
    currency: v.currency,
    images: v.images,
    badge: v.badge,
    bedrooms: v.bedrooms,
    bathrooms: v.bathrooms,
    guests: v.guests,
  };
  /* Review alanları servis tarafında yalnız yorum varken set edilir;
     aynı "anahtar yok" davranışı korunur. */
  if (v.review_average !== undefined) card.review_average = v.review_average;
  if (v.review_count !== undefined) card.review_count = v.review_count;
  return card;
}

export const getCachedVillas = unstable_cache(
  async (): Promise<PublicVillaCard[]> =>
    (await getVillas()).map(toPublicVillaCard),
  ["villas:get"],
  { tags: ["villas", "villa-reviews", "taxonomy"], revalidate: 600 }
);

/* ===============================================================
   🛡️ FAQ — Global Site Frequently Asked Questions (Faz 25)
   ===============================================================
   Homepage'de "Sık Sorulan Sorular" section render etmek için
   cached read. Admin replaceFaqs sonrası revalidateFaqs() tag'i
   invalidate eder.

   TTL: 1 saat — FAQ içeriği rare mutation (admin SSS'leri seyrek
   günceller); 1 saat TTL + tag invalidate (anlık güncellik için)
   premium denge.

   EMPTY STATE: tablo boş → [] döner; homepage caller `if (!faqs.length)`
   ile section'ı hiç render etmez. */
/* 🛡️ PHASE 11 — LOCALE BAŞINA AYRI CACHE (çapraz-dil sızıntısı KORUMASI)
   ===============================================================
   Tek bir `unstable_cache` örneğini locale argümanıyla çağırmak yerine
   HER LOCALE İÇİN AYRI bir örnek kurulur; cache key'e locale AÇIKÇA
   (`["faqs:get", locale]`) gömülür. Böylece EN çevirisi TR isteğine
   (veya tersi) ASLA servis edilemez — bu bir konfigürasyon detayı
   değil, yapısal bir garanti.

   TTL (3600) ve tag ("faqs") DEĞİŞMEDİ: admin `replaceFaqs` sonrası
   `revalidateFaqs()` ÜÇ locale cache'ini birden invalidate eder
   (aynı tag).

   TR yolu: `applyFaqTranslations` `locale === "tr"` iken sorgu HİÇ
   atmaz → TR davranışı ve sorgu sayısı BİREBİR eskisi gibi. */
const CACHED_FAQS_BY_LOCALE: Record<Locale, () => Promise<Faq[]>> =
  Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [
      locale,
      unstable_cache(
        async () => applyFaqTranslations(await getFaqs(), locale),
        ["faqs:get", locale],
        { tags: ["faqs"], revalidate: 3600 }
      ),
    ])
  ) as Record<Locale, () => Promise<Faq[]>>;

/** Locale verilmezse TR — mevcut çağıranlar (`getCachedFaqs()`) DEĞİŞMEDİ. */
export function getCachedFaqs(locale: Locale = DEFAULT_LOCALE): Promise<Faq[]> {
  return CACHED_FAQS_BY_LOCALE[locale]();
}

/* ===============================================================
   🛡️ VILLA REVIEWS (Faz 33) — guest reviews per villa
   ===============================================================
   Public villa detay sayfası için cached read. Yalnız approved
   review'lar dahil edilir; pending/spam yorumlar SEO + UI'a düşmez.

   PARAMETERIZED CACHE:
     unstable_cache argümanı (villaId) cache key'e otomatik dahil
     edilir → her villa için ayrı entry. Toplam admin yorum aktivitesi
     az → hash collision endişesi yok.

   TTL: 1 saat — yorum onayları seyrek; tag invalidate (revalidateTag
   "villa-reviews") admin moderation sonrası anlık güncellik sağlar.

   EMPTY STATE: [] döner; villa detay sayfası `reviews.length === 0`
   ise yorum section'ını HİÇ render etmez (caller guard).

   PARALLEL HELPER:
     `getCachedVillaReviewStats` (count + average) AggregateRating
     JSON-LD ve UI header'ı için. Aynı tag — admin onay flow tek
     invalidate ile her iki helper'ı temizler.
=============================================================== */
export const getCachedVillaReviews = unstable_cache(
  async (villaId: string): Promise<VillaReviewPublic[]> =>
    getApprovedVillaReviews(villaId),
  ["villa-reviews:get"],
  { tags: ["villa-reviews"], revalidate: 3600 }
);

export const getCachedVillaReviewStats = unstable_cache(
  async (villaId: string): Promise<VillaReviewStats> =>
    getVillaReviewStats(villaId),
  ["villa-reviews:stats"],
  { tags: ["villa-reviews"], revalidate: 3600 }
);

/* ===============================================================
   🛡️ FAZ 34 — HOMEPAGE TESTIMONIALS (cached)
   ===============================================================
   Anasayfa "Misafir Deneyimleri" section'ı için.
   - approved-only, featured-first, newest fallback, max 6
   - Villa cover image + slug + title embedded
   - Aynı "villa-reviews" tag altında — admin moderation aksiyonu
     (approve / delete / feature) bu cache'i de invalidate eder.
   - TTL 1 saat (mevcut review cache TTL'i ile parity).

   EMPTY STATE:
     [] döner → homepage caller `reviews.length === 0` ise section'ı
     hiç render etmez (CLS yok). */
export const getCachedHomepageReviews = unstable_cache(
  async (): Promise<HomepageReviewItem[]> => getFeaturedHomepageReviews(),
  ["villa-reviews:homepage"],
  { tags: ["villa-reviews"], revalidate: 3600 }
);

/* 🛡️ FAZ 39F — Site-wide global aggregate (homepage hero floating
   card). Aynı "villa-reviews" tag altında — admin moderation invalidate
   akışı bu cache'i de tazeler. Empty dataset {0,0}; caller koşullu render. */
export const getCachedGlobalReviewStats = unstable_cache(
  async (): Promise<GlobalReviewStats> => getGlobalReviewStats(),
  ["villa-reviews:global-stats"],
  { tags: ["villa-reviews"], revalidate: 3600 }
);

/* ===============================================================
   🛡️ HOMEPAGE COLLECTION (manuel curasyon, migration 012)
   ===============================================================
   Admin tarafından seçilmiş villaların VillaCard render'ı için
   hazır shape'i. Sadece is_active=true + villa.is_active=true +
   villa.deleted_at IS NULL kayıtlar dönüyor. sort_order ASC.

   Tek embedded JOIN ile villa + location + images + prices çekiyor
   (getVillas pattern'iyle paralel) → N+1 yok.

   Tag: "homepage". Admin homepage CRUD sonrası revalidateHomepage()
   invalidate eder. Villa CRUD homepage'i otomatik invalidate
   ETMEZ (intentional: villa field değişimi koleksiyon sıralamasını
   bozmasın; bir sonraki TTL cycle'da yenilenir).
=============================================================== */
export type HomepageCollectionVilla = {
  id: string;
  slug: string;
  title: string;
  /* custom_title varsa override edilmiş ad, yoksa villa.title */
  display_title: string;
  location: string;
  price: number | null;
  currency: string;
  badge: string | null;
  bedrooms: number;
  bathrooms: number;
  guests: number;
  images: string[];
  /* Custom cover override URL (storage path resolve edilmiş) veya
     villa'nın kendi cover'ı varsa images[0]. */
  cover_override_path: string | null;
  /* 🛡️ FAZ 35 — Review aggregate (card UI). count === 0 ise opsiyonel
     alanlar undefined döner; VillaCard koşullu render eder. */
  review_average?: number;
  review_count?: number;
  /* 🛡️ AKTİF İNDİRİM (yalnız discount-collection tüketicisi doldurur —
     getCachedHomepageCollectionVillas bu alanı HİÇ set etmez, undefined
     kalır, homepage-collection kartları ETKİLENMEZ). Ham villa_discounts
     satırı (price.engine > getActiveDiscount ile SEÇİLMİŞ, "aktif" =
     bugün start_date..end_date arasında); nihai indirimli fiyat hesabı
     (currency-aware) VillaCard'da (client, useCurrency rates ile)
     price.engine > applyDiscountToDailyPrice reuse edilerek yapılır —
     burada yeni bir fiyat hesabı YAPILMAZ, yalnız ham kayıt taşınır. */
  discount?: {
    start_date: string;
    end_date: string;
    discount_type: "percent" | "fixed";
    discount_value: number;
    currency: string | null;
  } | null;
  /* 🛡️ İNDİRİM PENCERESİ MÜSAİTLİĞİ (yalnız discount-collection
     tüketicisi doldurur; getCachedHomepageCollectionVillas bu alanı
     HİÇ set etmez → homepage-collection kartları ETKİLENMEZ).

     ANLAMI: `discount.start_date` → `discount.end_date` aralığının
     TAMAMI boş mu? Aralıkta TEK BİR GECE bile dolu ise `false`.
     Kaynak: get_blocked_villa_ids RPC (half-open [start,end) overlap:
     `existing.start_date < end AND existing.end_date > start`) —
     reservations(pending/confirmed) + manual_reservations + aktif
     external_calendar_events. Yeni tarih matematiği İCAT EDİLMEDİ.

     `undefined` = kontrol uygulanmadı/uygulanamadı → tüketici MEVCUT
     davranışı korur (geriye dönük uyumlu, fail-soft). */
  discount_available?: boolean;
  /* 🛡️ P3 (MIGRATION 092) — KART ANAHTARI. Bir villa, admin'in seçtiği
     her indirim dönemi için AYRI bir kayıt (=kart) üretir; bu yüzden
     villa id/slug tek başına React key olarak BENZERSİZ DEĞİLDİR.
     Format: `${villa_id}|${start_date}|${end_date}` — `(villa_id,
     start_date, end_date)` villa içinde `villa_discounts_no_overlap`
     EXCLUDE constraint'i (migration 079) sayesinde benzersiz, villalar
     arası da villa_id ile ayrışır ⇒ GLOBAL BENZERSİZ ve deterministik
     (index tabanlı key KULLANILMAZ).
     `getCachedHomepageCollectionVillas` bu alanı HİÇ set etmez →
     homepage-collection kartları ETKİLENMEZ. */
  card_key?: string;
};

export const getCachedHomepageCollectionVillas = unstable_cache(
  async (): Promise<HomepageCollectionVilla[]> => {
    /* Tek query: homepage_collections + embedded villa + images.
       villa.is_active + deleted_at filter'ı JS-side (embedded query'de
       not-IS-NULL chain'i karmaşık; sonuç küçük olduğu için JS filter
       maliyetsiz). */
    /* 🛡️ Villa price/currency artık villa kolonu DEĞİL — villa_prices
       relation'ından gelir (legacy migration). villa.service.ts >
       getVillas + mapVilla pattern'iyle birebir aynı: ilk villa_prices
       satırı price/currency için kullanılır (firstPrice). */
    /* 🛡️ FAZ 35 — Review stats batch paralel fetch + merge.
       N+1 yok: tek SQL'de tüm villa review aggregate'i toplanır;
       villa listesi ile Promise.all içinde çalıştırılır → net latency
       max(collectionQuery, statsQuery). */
    const statsPromise = getVillaReviewStatsBatch();
    const { data, error } = await homepageRepository.findActivePublicCards();

    if (error) {
      console.error(
        "[cache.homepageCollection] FAILED",
        error.message
      );
      return [];
    }

    type Row = {
      id: string;
      sort_order: number;
      is_active: boolean;
      custom_title: string | null;
      custom_cover_image: string | null;
      villa: {
        id: string;
        slug: string | null;
        title: string | null;
        badge: string | null;
        bedrooms: number | null;
        bathrooms: number | null;
        guests: number | null;
        is_active: boolean | null;
        deleted_at: string | null;
        location: { name: string } | null;
        villa_images: Array<{
          image_url: string | null;
          is_cover: boolean | null;
          sort_order: number | null;
        }> | null;
        villa_prices: Array<{
          price: number | null;
          currency: string | null;
          start_date: string | null;
        }> | null;
      } | null;
    };

    const rows = (data || []) as unknown as Row[];
    /* 🛡️ FAZ 35 — Stats batch await (paralel başlatılmıştı). */
    const statsMap = await statsPromise;

    const result: HomepageCollectionVilla[] = [];
    for (const r of rows) {
      const v = r.villa;
      if (!v || !v.id) continue;
      /* Public visibility: pasif veya silinmiş villayı homepage'de
         gösterme (admin koleksiyonda bıraksa bile defensive). */
      if (v.is_active === false || v.deleted_at != null) continue;

      const rawImages = Array.isArray(v.villa_images) ? v.villa_images : [];
      const sortedImages = [...rawImages].sort((a, b) => {
        if (a?.is_cover) return -1;
        if (b?.is_cover) return 1;
        return (a?.sort_order ?? 0) - (b?.sort_order ?? 0);
      });
      /* 🛡️ Aşama A + bucket-fix — resolveVillaImageUrl: image_url HEM
         FULL URL (legacy) HEM relative path (yeni) olabilir; relative
         path için doğru bucket (villa-images). */
      const images = sortedImages
        .map((i) => resolveVillaImageUrl(i?.image_url))
        .filter(
          (u): u is string =>
            typeof u === "string" && u.trim().length > 0
        );

      /* 🛡️ price/currency mapVilla pattern'i (villa.service.ts):
         villa_prices içindeki MIN nightly (getStartingPrice — ortak
         mantık). Boş ise price null, currency "TRY" fallback. */
      const rawPrices = Array.isArray(v.villa_prices) ? v.villa_prices : [];
      const firstPrice = getStartingPrice(rawPrices);

      /* 🛡️ FAZ 35 — Review aggregate inject; count===0 ise alanlar
         undefined kalır → VillaCard meta satırını render etmez. */
      const s = statsMap[v.id];
      const hasReviews = !!s && s.count > 0;

      result.push({
        id: v.id,
        slug: String(v.slug || ""),
        title: String(v.title || ""),
        display_title:
          (r.custom_title && r.custom_title.trim()) ||
          String(v.title || ""),
        location: v.location?.name || "",
        price:
          firstPrice && firstPrice.price !== null
            ? Number(firstPrice.price)
            : null,
        currency: firstPrice?.currency || "TRY",
        badge: v.badge,
        bedrooms: v.bedrooms ?? 1,
        bathrooms: v.bathrooms ?? 1,
        guests: v.guests ?? 2,
        images,
        cover_override_path: r.custom_cover_image,
        review_average: hasReviews ? s.average : undefined,
        review_count: hasReviews ? s.count : undefined,
      });
    }
    return result;
  },
  ["homepage-collection:get"],
  /* 🛡️ FAZ 35 — "villa-reviews" tag eklendi (getCachedVillas ile parity);
     admin review CRUD (approve/feature/delete) bu cache'i de invalidate
     etmeli ki card meta'sı taze stat'lerle render olsun. Mevcut
     "homepage" semantic'i aynen korunur. */
  { tags: ["homepage", "villa-reviews"], revalidate: 600 }
);

/* ===============================================================
   🛡️ DISCOUNT COLLECTION (migration 062) — "İndirimli Koleksiyon"
   ===============================================================
   getCachedHomepageCollectionVillas'ın BİREBİR klonu; tek fark
   tablo (`discount_collections`) ve tag ("discount"). Aynı
   HomepageCollectionVilla shape'i döner → VillaCard/section reuse.
   Admin discount CRUD sonrası revalidateDiscount() invalidate eder.

   🔄 GERİ ALMA NOTU (bu tur): Bir önceki turda bu fonksiyon, ELLE
   küratörlü `discount_collections` yerine doğrudan `villa_discounts`'tan
   (TÜM aktif indirimli villalar, otomatik) okuyacak şekilde değiştirilmişti.
   Kullanıcı talebiyle bu TAMAMEN geri alındı: ana veri kaynağı YENİDEN
   `discount_collections` (admin'in `/maki-admin/discount-collection`
   sayfasında elle seçtiği villalar, `sort_order ASC`). `villa_discounts`
   hâlâ villa PICKER'ının seçilebilir havuzunu filtrelemek için kullanılıyor
   (bkz. /api/admin/villas?hasDiscount=1 → villaDiscountRepository.
   findDistinctVillaIdsWithDiscounts) — ama bu, BU fonksiyondan tamamen
   ayrı, dokunulmamış bir akış. "Yalnız bugün aktif indirimi olan villa
   görünsün" davranışı (aşağıdaki `if (!activeDiscount) continue`) AYNEN
   korunuyor — bu turda bu konuda yeni bir karar alınmadı. */
/* 🛡️ KÖK NEDEN DÜZELTMESİ (bu tur) — homepage indirim kartında üstü
   çizili "normal fiyat", şimdiye kadar villanın TÜM villa_prices satırları
   arasındaki EN DÜŞÜK gecelik fiyattı (getStartingPrice / firstPrice) — bu YANLIŞ:
   karşılaştırma fiyatı, indirimin GERÇEKTEN uygulandığı tarih aralığının
   (villa_discounts.start_date) içinde bulunduğu sezonun normal gecelik fiyatı
   OLMALI (örn. 1–7 Ekim 5.000₺ / 8–31 Ekim 6.000₺ sezonları + 8–15 Ekim 3.000₺
   indirimi → karşılaştırma fiyatı 6.000₺ olmalı, 5.000₺ YANLIŞ).

   Bu fonksiyon price.engine.ts > getDailyPrice ile AYNI eşleşme mantığını
   (`d >= start && d <= end`, kapalı interval) kullanır — ANCAK getDailyPrice
   currency dönüşümü de yapıyor (client rate'lerine ihtiyaç duyar); bu dosya
   SUNUCU tarafında cache'lenen HAM (dönüştürülmemiş) price/currency değerleri
   üretiyor (firstPrice'ın zaten yaptığı gibi) — aslı dönüşüm VillaCard'da
   client-side useCurrency() ile yapılıyor, DEĞİŞTİRİLMEDİ. Bu yüzden
   price.engine.ts'e DOKUNULMADI — yalnız bu dosyaya özel, küçük, saf bir
   eşleştirme yardımcısı. Sezon bulunamazsa (tarih hiçbir villa_prices
   aralığına denk gelmiyorsa) null döner — caller firstPrice'a fallback yapar,
   kart eskisi gibi (min fiyat) gösterilir; hiçbir villa "fiyatsız" kalmaz. */
function getSeasonPriceForDiscountStart(
  prices: Array<{
    price: number | null;
    currency: string | null;
    start_date: string | null;
    end_date: string | null;
  }>,
  discountStartDate: string
): { price: number; currency: string } | null {
  const target = parseLocalDate(discountStartDate);
  if (Number.isNaN(target.getTime())) return null;

  for (const p of prices) {
    if (p.price == null || !p.start_date || !p.end_date) continue;
    const s = parseLocalDate(p.start_date);
    const e = parseLocalDate(p.end_date);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
    if (target >= s && target <= e) {
      const v = Number(p.price);
      if (Number.isFinite(v) && v > 0) {
        return { price: v, currency: p.currency || "TRY" };
      }
    }
  }
  return null;
}

export const getCachedDiscountCollectionVillas = unstable_cache(
  async (): Promise<HomepageCollectionVilla[]> => {
    const statsPromise = getVillaReviewStatsBatch();
    const { data, error } = await discountRepository.findActivePublicCards();

    if (error) {
      console.error("[cache.discountCollection] FAILED", error.message);
      return [];
    }

    type Row = {
      id: string;
      sort_order: number;
      is_active: boolean;
      custom_title: string | null;
      custom_cover_image: string | null;
      /* 🛡️ MIGRATION 092 — ham jsonb küratörlük seçimi. */
      selected_discount_ranges: unknown;
      villa: {
        id: string;
        slug: string | null;
        title: string | null;
        badge: string | null;
        bedrooms: number | null;
        bathrooms: number | null;
        guests: number | null;
        is_active: boolean | null;
        deleted_at: string | null;
        location: { name: string } | null;
        villa_images: Array<{
          image_url: string | null;
          is_cover: boolean | null;
          sort_order: number | null;
        }> | null;
        villa_prices: Array<{
          price: number | null;
          currency: string | null;
          start_date: string | null;
          end_date: string | null;
        }> | null;
        /* 🛡️ EK embed (villa_prices'ın yapısal ikizi) — bkz.
           discount.repository.ts > findActivePublicCards. */
        villa_discounts: Array<{
          start_date: string | null;
          end_date: string | null;
          discount_type: "percent" | "fixed" | null;
          discount_value: number | null;
          currency: string | null;
        }> | null;
      } | null;
    };

    const rows = (data || []) as unknown as Row[];
    const statsMap = await statsPromise;

    /* Bugün — LOCAL tarih; `discount-collection.service.ts >
       listDiscountCollection` ile BİREBİR AYNI formatLocalDate →
       parseLocalDate round-trip'i (villa_discounts.end_date'in
       "YYYY-MM-DD" local semantiğiyle karşılaştırılabilir). Döngü
       DIŞINDA bir kez hesaplanır (cache build başına tek Date). */
    const today = parseLocalDate(formatLocalDate(new Date()));

    const result: HomepageCollectionVilla[] = [];
    /* 🛡️ TAM DOLULUK POST-PASS — villa başına aday indirim dönemleri
       (start_date ASC) + fiyat türetici. Yalnız aşağıdaki availability
       bloğu doldurur/okur. */
    const discountCandidates = new Map<
      string,
      {
        periods: DiscountRange[];
        priceForDiscount: (d: DiscountRange | null) => {
          price: number | null;
          currency: string;
        };
      }
    >();
    for (const r of rows) {
      const v = r.villa;
      if (!v || !v.id) continue;
      if (v.is_active === false || v.deleted_at != null) continue;

      const rawImages = Array.isArray(v.villa_images) ? v.villa_images : [];
      const sortedImages = [...rawImages].sort((a, b) => {
        if (a?.is_cover) return -1;
        if (b?.is_cover) return 1;
        return (a?.sort_order ?? 0) - (b?.sort_order ?? 0);
      });
      const images = sortedImages
        .map((i) => resolveVillaImageUrl(i?.image_url))
        .filter(
          (u): u is string =>
            typeof u === "string" && u.trim().length > 0
        );

      const rawPrices = Array.isArray(v.villa_prices) ? v.villa_prices : [];
      const firstPrice = getStartingPrice(rawPrices);

      /* 🛡️ GÖSTERİLECEK İNDİRİM — ham villa_discounts satırları
         normalize edilip (null-safe) DiscountRange şekline getirilir.
         Tarih doğrulaması YOK — yalnız alan bütünlüğü kontrol edilir
         (price.engine > getActiveDiscount'ın kullandığı AYNI DiscountRange
         şekli, o fonksiyona DOKUNULMADI — bu yalnızca bu dosyadaki
         normalize adımı). */
      const rawDiscounts = Array.isArray(v.villa_discounts)
        ? v.villa_discounts
        : [];
      const normalizedDiscounts: DiscountRange[] = rawDiscounts
        .filter(
          (d): d is typeof d & {
            start_date: string;
            end_date: string;
            discount_type: "percent" | "fixed";
          } =>
            !!d &&
            !!d.start_date &&
            !!d.end_date &&
            (d.discount_type === "percent" || d.discount_type === "fixed")
        )
        .map((d) => ({
          start_date: d.start_date,
          end_date: d.end_date,
          discount_type: d.discount_type,
          discount_value: Number(d.discount_value) || 0,
          currency: d.currency,
        }));

      /* 🔄 KÖK NEDEN DÜZELTMESİ (bu tur): Bu bölümde ÖNCEDEN
         `getActiveDiscount(today, normalizedDiscounts)` çağrılıyordu —
         bu, villanın villa_discounts kaydı BUGÜNÜ kapsamıyorsa (geçmiş/
         gelecek tarihli) `discount: null` üretiyordu (villa listede
         kalsa bile kartında indirim bilgisi hiç gösterilmiyordu). İş
         kuralı KESİNLEŞTİ: `discount_collections`'ta seçili bir villanın
         villa_discounts kaydı varsa, tarihi (bugün/gelecek/geçmiş) HİÇBİR
         ŞEKİLDE filtre kriteri OLMAYACAK — kayıt varsa kartta gösterilir.
         Bu yüzden tarihe bakan `getActiveDiscount` BURADA ARTIK
         ÇAĞRILMIYOR (fonksiyonun kendisi price.engine.ts'te DEĞİŞMEDİ —
         rezervasyon/fiyat hesaplama akışlarında "bugün aktif mi" anlamıyla
         AYNEN kullanılmaya devam ediyor; yalnızca BU dosyanın BU çağrı
         noktası kaldırıldı). Yerine deterministik seçim: normalizedDiscounts
         `start_date` ASC sıralanır, İLK kayıt gösterilecek indirim olarak
         seçilir (villa_discounts admin akışında normalde tek kayıt olur;
         birden fazlaysa en erken başlayan, ekstra bir "aktiflik/öncelik"
         iş kuralı İCAT EDİLMEDEN, en basit deterministik seçimdir).
         Seçim, aşağıdaki görünürlük filtresinden GEÇEN kayıtlar
         üzerinden yapılır (bkz. bir sonraki blok). */

      /* 🔄 KÖK NEDEN DÜZELTMESİ — ADMIN İLE FİLTRE SİMETRİSİ
         ------------------------------------------------------------
         SORUN: `villa_discounts` kaydı admin'den silindiğinde
         `discount_collections` satırı (kasıtlı olarak) SİLİNMEZ. Admin
         listesi (app/services/discount-collection.service.ts >
         listDiscountCollection) bu durumda item'ı tarih-bazlı filtreyle
         eliyordu; BU okuma yolunda ise hiçbir `villa_discounts` koşulu
         yoktu → villa admin'de kaybolurken ana sayfada `discount: null`
         ile kart olarak kalmaya devam ediyordu.

         DÜZELTME: admin'deki kuralın BİREBİR AYNISI burada da uygulanır —
         bir villa yalnızca EN AZ BİR `villa_discounts` kaydı `end_date >=
         bugün` ise koleksiyonda kalır. `discount_collections` satırına,
         `villa_discounts` kayıtlarına, şemaya veya sorguya DOKUNULMAZ;
         yalnız bu mapper'ın görünürlük kararı düzeltilir (villa'ya yeni
         gelecek-tarihli indirim eklenirse otomatik geri görünür).

         ⚠️ Gelecek tarihli indirimler ETKİLENMEZ (end_date de gelecekte
         → koşulu geçer) — "kayıt varsa kartta gösterilir" iş kuralı
         korunur; yalnızca SÜRESİ GEÇMİŞ / HİÇ OLMAYAN kayıt elenir. */
      const visibleDiscounts = normalizedDiscounts.filter((d) => {
        const end = parseLocalDate(d.end_date);
        /* parseLocalDate throw etmez; Invalid Date → geçerli SAYILMAZ
           (admin filtresiyle birebir aynı defansif davranış). */
        if (Number.isNaN(end.getTime())) return false;
        return end >= today;
      });
      if (visibleDiscounts.length === 0) continue;

      /* Buraya gelindiğinde visibleDiscounts GARANTİLİ boş değil
         (yukarıdaki `continue`), ama alanın tipi nullable kalır —
         `HomepageCollectionVilla.discount` homepage-collection
         kartlarında null olmaya devam ediyor. */
      const selectedDiscount: DiscountRange | null =
        [...visibleDiscounts].sort((a, b) =>
          a.start_date.localeCompare(b.start_date)
        )[0] ?? null;

      /* 🛡️ TAM DOLULUK POST-PASS BAĞLAMI (aşağıdaki availability bloğu
         için). Yukarıdaki `selectedDiscount` seçimi (start_date ASC, ilk)
         DEĞİŞTİRİLMEDİ — bu yalnız EK bir kayıt: aynı sırada TÜM aday
         dönemler + o villanın fiyat bağlamı. Post-pass, TAMAMEN DOLU
         dönemleri eleyip aynı sıradan bir SONRAKİ uygun dönemi seçebilsin
         diye. Tek dönem varsa davranış BİREBİR aynı kalır. */
      const sortedVisibleDiscounts = [...visibleDiscounts].sort((a, b) =>
        a.start_date.localeCompare(b.start_date)
      );
      /* Fiyat türetimi — aşağıdaki `result.push` ile BİREBİR aynı ifade
         (`seasonPriceAtDiscountStart || firstPrice`). Yeni bir fiyat
         mantığı DEĞİL; dönem değişirse AYNI kural yeniden uygulanır. */
      const priceForDiscount = (d: DiscountRange | null) => {
        const seasonal = d
          ? getSeasonPriceForDiscountStart(rawPrices, d.start_date)
          : null;
        const ref = seasonal || firstPrice;
        return {
          price: ref && ref.price !== null ? Number(ref.price) : null,
          currency: ref?.currency || "TRY",
        };
      };
      /* ═══════════════════════════════════════════════════════
         🛡️ FAZ 3 — ADMIN KÜRATÖRLÜK SEÇİMİ (MIGRATION 092)
         ═══════════════════════════════════════════════════════
         `discount_collections.selected_discount_ranges` doluysa YALNIZ
         seçilen dönemler aday olur. Seçim TARİH ÇİFTİ ile eşleşir
         (`villa_discounts.id` DEĞİL) — `replace_villa_discounts`
         DELETE+INSERT ile id'leri değiştirdiği için id tabanlı eşleşme
         sessizce kaybolurdu; `(start_date, end_date)` ise
         `villa_discounts_no_overlap` EXCLUDE constraint'i sayesinde
         villa içinde KARARLI ve BENZERSİZDİR.

         FAIL-SAFE (üç yol da AYNI güvenli noktaya düşer):
           • NULL          → seçim yok (legacy)      → TÜM dönemler
           • []            → admin hepsini kaldırdı  → TÜM dönemler
           • hiç eşleşmedi → orphan (cleanup/replace)→ TÜM dönemler
         Böylece kart hiçbir koşulda SESSİZCE kaybolmaz; "gösterme"
         isteği zaten `is_active = false` ile karşılanıyor.

         ⚠️ Seçilmeyen dönem availability sorgusuna HİÇ GİRMEZ (aday
         havuzu burada daraldığı için pencere grupları da daralır). */
      const selectedRanges = normalizeSelectedDiscountRanges(
        r.selected_discount_ranges
      );
      let candidatePeriods = sortedVisibleDiscounts;
      if (selectedRanges) {
        const selectedKeys = new Set(
          selectedRanges.map((x) => `${x.start}|${x.end}`)
        );
        const narrowed = sortedVisibleDiscounts.filter((d) =>
          selectedKeys.has(`${d.start_date}|${d.end_date}`)
        );
        if (narrowed.length > 0) candidatePeriods = narrowed;
      }

      discountCandidates.set(v.id, {
        periods: candidatePeriods,
        priceForDiscount,
      });

      const s = statsMap[v.id];
      const hasReviews = !!s && s.count > 0;

      /* 🛡️ Karşılaştırma/üstü çizili fiyat kaynağı (bu tur) — selectedDiscount
         varsa, o indirimin start_date'ine denk gelen SEZON fiyatı kullanılır
         (getSeasonPriceForDiscountStart, yukarıda). Sezon bulunamazsa (edge
         case — tutarsız veri) firstPrice'a (mevcut min-fiyat davranışı)
         fallback yapılır; indirim yoksa (selectedDiscount null) davranış
         BİREBİR ESKİSİ gibi firstPrice kullanılır — bu değişiklik SADECE
         indirimli kartın karşılaştırma fiyatını etkiler. */
      const seasonPriceAtDiscountStart = selectedDiscount
        ? getSeasonPriceForDiscountStart(rawPrices, selectedDiscount.start_date)
        : null;
      const referencePrice = seasonPriceAtDiscountStart || firstPrice;

      result.push({
        id: v.id,
        slug: String(v.slug || ""),
        title: String(v.title || ""),
        display_title:
          (r.custom_title && r.custom_title.trim()) ||
          String(v.title || ""),
        location: v.location?.name || "",
        price:
          referencePrice && referencePrice.price !== null
            ? Number(referencePrice.price)
            : null,
        currency: referencePrice?.currency || "TRY",
        badge: v.badge,
        bedrooms: v.bedrooms ?? 1,
        bathrooms: v.bathrooms ?? 1,
        guests: v.guests ?? 2,
        images,
        cover_override_path: r.custom_cover_image,
        review_average: hasReviews ? s.average : undefined,
        review_count: hasReviews ? s.count : undefined,
        discount: selectedDiscount
          ? {
              start_date: selectedDiscount.start_date,
              end_date: selectedDiscount.end_date,
              discount_type: selectedDiscount.discount_type,
              discount_value: selectedDiscount.discount_value,
              currency: selectedDiscount.currency ?? null,
            }
          : null,
      });
    }

    /* ===============================================================
       🛡️ İNDİRİM PENCERESİ MÜSAİTLİK — 3 DURUM, TOPLU, N+1 YOK
       ===============================================================
       KURALLAR (tek yerde):
         0/N gece dolu      → TAMAMEN MÜSAİT → kart var, CTA rezervasyon
         1..N-1 gece dolu   → KISMEN DOLU    → kart var, CTA villa detay
         N/N gece dolu      → TAMAMEN DOLU   → o DÖNEM elenir; villanın
                              başka uygun dönemi yoksa KART HİÇ ÜRETİLMEZ

       ÇOKLU DÖNEM: mevcut `start_date` ASC sırası KORUNUR; yalnız
       TAMAMEN DOLU dönemler atlanır, kalan EN ERKEN dönem seçilir.

       AVAILABILITY KAYNAĞI: yalnız MEVCUT `getBlockedVillaIds` →
       `get_blocked_villa_ids` RPC (migration 039). Yeni RPC/migration/
       repository YOK. RPC kapsamı: reservations(pending|confirmed) +
       manual_reservations(tümü) + external_calendar_events(is_active).
       Half-open [) overlap (`existing.start < end AND existing.end >
       start`) RPC'nin İÇİNDE — burada tarih matematiği İCAT EDİLMEZ.

       SORGU SAYISI (villa sayısından BAĞIMSIZ):
         Kademe 1 — her DISTINCT pencere için 1 sorgu (villalar gruplu).
                    Pencerede hiç blocked villa yoksa gece taraması YOK.
         Kademe 2 — yalnız blocked ALT KÜME için gece gece tarama; her
                    gecede aday kümesi daralır, küme boşalınca ERKEN ÇIKIŞ.
         ⇒ Sorgu = W + Σ(yalnız blocked pencereler) N_w
           1500 villa aynı pencerede → yine 1..N_w+1 sorgu.

       GUARD: `MAX_NIGHT_SWEEP_NIGHTS` geceden uzun dönemlerde gece
       taraması HİÇ çalışmaz → o dönem "tamamen dolu" SAYILMAZ (villa
       ASLA yanlışlıkla gizlenmez); kademe 1 sonucuna göre kart kalır ve
       gerekirse CTA villa detayına düşer — GÜVENLİ taraf.

       FAIL-SOFT: `getBlockedVillaIds` hata durumunda boş Set döner →
       (a) overlap yok sayılır, (b) gece taramasında aday kümesi boşalır
       → villa gizlenmez. Overbooking koruması bu katmanda DEĞİL; DB
       EXCLUDE constraint `reservations_no_overlap` (migration 001).

       TEK GÜNLÜK İNDİRİM (start === end): 0 gecelik dönem — sorgu
       ÜRETİLMEZ, tamamen dolu SAYILMAZ, `discount_available` undefined
       kalır → VillaCard MEVCUT davranışını korur (ÖNCEKİ tur ile birebir).

       ⚠️ Envelope (min(start)…max(end)) tek sorgu BİLİNÇLİ REDDEDİLDİ:
       Kasım'da dolu bir villa Ekim indirimi için yanlış işaretlenirdi. */

    /** Gece bazlı taramanın çalışacağı en uzun dönem (gece). Üstündeki
     *  dönemlerde tarama atlanır — villa ASLA gizlenmez (güvenli taraf). */
    const MAX_NIGHT_SWEEP_NIGHTS = 31;

    /** "YYYY-MM-DD" + 1 gün. `lib/date-format` helper'ları (LOCAL
     *  midnight, UTC parse YOK) — `stay-rules.helper > shiftKey` ile aynı
     *  desen. YALNIZ iç hesapta kullanılır; indirim tarihlerine veya
     *  URL'ye ASLA yazılmaz (+1 gün eklenmez). */
    const nextDayKey = (key: string): string => {
      const d = parseLocalDate(key);
      d.setDate(d.getDate() + 1);
      return formatLocalDate(d);
    };

    const nightsIn = (start: string, end: string): number => {
      const sD = parseLocalDate(start);
      const eD = parseLocalDate(end);
      if (Number.isNaN(sD.getTime()) || Number.isNaN(eD.getTime())) return 0;
      return Math.max(
        0,
        Math.round((eD.getTime() - sD.getTime()) / 86400000)
      );
    };

    /* ---- Aday pencereler: TÜM görünür dönemler (yalnız start < end) ---- */
    type WindowGroup = { start: string; end: string; ids: string[] };
    const windowGroups = new Map<string, WindowGroup>();
    for (const [villaId, ctx] of discountCandidates) {
      for (const d of ctx.periods) {
        if (!d.start_date || !d.end_date) continue;
        if (!(d.start_date < d.end_date)) continue; // 0 gecelik → sorgu yok
        const key = `${d.start_date}|${d.end_date}`;
        const g = windowGroups.get(key);
        if (g) {
          if (!g.ids.includes(villaId)) g.ids.push(villaId);
        } else {
          windowGroups.set(key, {
            start: d.start_date,
            end: d.end_date,
            ids: [villaId],
          });
        }
      }
    }

    /** `${villaId}|${start}|${end}` → o pencerede EN AZ BİR gece dolu mu. */
    const overlapKeys = new Set<string>();
    /** `${villaId}|${start}|${end}` → o pencerenin TÜM geceleri dolu mu. */
    const fullyBlockedKeys = new Set<string>();

    if (windowGroups.size > 0) {
      const groups = [...windowGroups.values()];

      /* ---- KADEME 1 — pencere bazlı overlap (mevcut davranış) ---- */
      const overlapSets = await Promise.all(
        groups.map((g) => getBlockedVillaIds(g.start, g.end, g.ids))
      );
      groups.forEach((g, i) => {
        for (const id of g.ids) {
          if (overlapSets[i].has(id)) {
            overlapKeys.add(`${id}|${g.start}|${g.end}`);
          }
        }
      });

      /* ---- KADEME 2 — yalnız blocked alt küme için gece taraması ---- */
      const sweepTargets = groups
        .map((g, i) => ({
          g,
          candidates: g.ids.filter((id) => overlapSets[i].has(id)),
        }))
        .filter(
          (t) =>
            t.candidates.length > 0 &&
            nightsIn(t.g.start, t.g.end) <= MAX_NIGHT_SWEEP_NIGHTS
        );

      const sweepResults = await Promise.all(
        sweepTargets.map(async ({ g, candidates }) => {
          /* Her gece aday kümesi daralır; boşalınca ERKEN ÇIKIŞ. */
          let alive = candidates;
          let cursor = g.start;
          let guard = 0;
          while (
            cursor < g.end &&
            alive.length > 0 &&
            guard < MAX_NIGHT_SWEEP_NIGHTS
          ) {
            const next = nextDayKey(cursor);
            if (!(cursor < next)) break; // defansif: tarih ilerlemiyorsa dur
            const blockedThisNight = await getBlockedVillaIds(
              cursor,
              next,
              alive
            );
            alive = alive.filter((id) => blockedThisNight.has(id));
            cursor = next;
            guard += 1;
          }
          /* Döngü gece sayısını tüketmeden bittiyse (guard) TAMAMEN DOLU
             DEMEK DEĞİLDİR — yalnız tüm geceler taranmışsa karar verilir. */
          const fullySwept = !(cursor < g.end);
          return { g, fullyBlocked: fullySwept ? alive : [] };
        })
      );

      for (const { g, fullyBlocked } of sweepResults) {
        for (const id of fullyBlocked) {
          fullyBlockedKeys.add(`${id}|${g.start}|${g.end}`);
        }
      }
    }

    /* ═══════════════════════════════════════════════════════════
       🛡️ FAZ 4 — P3: DÖNEM BAŞINA AYRI KART
       ═══════════════════════════════════════════════════════════
       Admin'in seçtiği (ya da seçim yoksa tüm görünür) dönemlerden
       TAMAMEN DOLU olanlar elenir; KALAN HER DÖNEM için AYRI bir kayıt
       üretilir. `HomepageCollectionVilla` zaten "tek kartlık veri"
       taşıdığı için (tekil `discount`, tekil `discount_available`,
       tekil `price`/`currency`) tip DEĞİŞMEDİ ve `VillaCard`'a
       DOKUNULMADI — yalnız aynı tipten N adet üretiliyor.

       ÜÇ DAVRANIŞ (hepsi korunur):
         0/N gece dolu    → kart var · discount_available = true  → rezervasyon CTA
         1..N-1 gece dolu → kart var · discount_available = false → villa detay CTA
         N/N gece dolu    → O DÖNEM için kart ÜRETİLMEZ
       Villanın başka uygun dönemi varsa o dönem(ler) normal gösterilir;
       hiç uygun dönem kalmazsa o villadan HİÇ kart üretilmez.

       SIRALAMA: `result` zaten `sort_order` ASC (repository `.order`),
       `ctx.periods` zaten `start_date` ASC ⇒ nihai sıra
       `(sort_order ASC, start_date ASC)` — tamamen deterministik.
       Villa içinde eşit `start_date` İMKÂNSIZ (EXCLUDE no_overlap) →
       ek tie-break gerekmez.

       Availability post-pass (Kademe 1/2, guard, anahtar şeması)
       DEĞİŞMEDİ — anahtarlar zaten `villaId|start|end`, yani
       (villa, dönem) çifti başına karar üretiyordu. */
    const expanded: HomepageCollectionVilla[] = [];
    for (const c of result) {
      const ctx = discountCandidates.get(c.id);
      if (!ctx || ctx.periods.length === 0) {
        /* Aday dönem yok (indirim kaydı olmayan kayıt) → mevcut
           davranış: kaydı olduğu gibi bırak. */
        expanded.push(c);
        continue;
      }

      const isFullyBlocked = (d: DiscountRange) =>
        fullyBlockedKeys.has(`${c.id}|${d.start_date}|${d.end_date}`);

      const usableList = ctx.periods.filter((d) => !isFullyBlocked(d));

      /* TÜM (seçili) dönemler tamamen dolu → bu villadan hiç kart yok. */
      if (usableList.length === 0) continue;

      for (const d of usableList) {
        const pr = ctx.priceForDiscount(d);
        expanded.push({
          ...c,
          card_key: `${c.id}|${d.start_date}|${d.end_date}`,
          price: pr.price,
          currency: pr.currency,
          discount: {
            start_date: d.start_date,
            end_date: d.end_date,
            discount_type: d.discount_type,
            discount_value: d.discount_value,
            currency: d.currency ?? null,
          },
          /* 0 gecelik dönemde alan undefined bırakılır (mevcut davranış). */
          discount_available:
            d.start_date < d.end_date
              ? !overlapKeys.has(`${c.id}|${d.start_date}|${d.end_date}`)
              : undefined,
        });
      }
    }

    return expanded;
  },
  ["discount-collection:get"],
  { tags: ["discount", "villa-reviews"], revalidate: 600 }
);

/** Villa locations — read-only taxonomy. Tag: "taxonomy". Admin
    location ekle/sil az sıklıkta; TTL ile kendiliğinden eskirme OK.
    🛡️ slug field (migration 009): SEO-friendly URL kontratı için
    hem id hem slug seçiyoruz. Eski kayıtlarda slug NULL olabilir
    (FE/URL layer slug NULL'sa UUID'ye düşer).
    🛡️ cover_image (migration 011): R2 storage bucket-relative
    path. Public URL runtime'da lib/storage.helpers >
    getLocationCoverPublicUrl ile üretilir. */
export const getCachedVillaLocations = unstable_cache(
  async () => {
    const { data, error } = await villaLocationRepository.findAllForTaxonomy();
    if (error) {
      console.error("[cache.villaLocations] FAILED", error.message);
      return [];
    }
    /* 🛡️ cover_v — bkz. getCachedVillaTypes; cover URL cache-bust token'ı
       (deterministik path overwrite → URL değişmez → CDN stale fix). */
    const coverV = Date.now();
    return ((data || []) as Array<{
      id: string;
      name: string;
      slug: string | null;
      /** Relative storage path (migration 011). NULL → görseli yok. */
      cover_image: string | null;
      /** Migration 050 — arama filtresinde görünsün mü? */
      show_in_filter?: boolean | null;
      /** Migration 050 — filtrede listeleneceği grup başlığı. */
      filter_group_name?: string | null;
    }>).map((r) => ({ ...r, cover_v: coverV }));
  },
  ["villa-locations:get"],
  { tags: ["taxonomy"], revalidate: 3600 }
);

/* ===============================================================
   🛡️ CATEGORY COVER MAP — homepage "Kategori Keşfet" section için
   ===============================================================
   Her villa type için: bir cover image + o type'taki aktif villa
   sayısı. TEK round-trip (villa_type_relations + villa + villa_images
   embedded join). N+1 yok.

   Caller (CategoryCollection):
     - getCachedVillaTypes() → kategoriler
     - getCachedCategoryCovers() → cover image + villa count
   İki cached helper paralel; toplam 2 round-trip SSR'da.

   Tags: ["villas", "taxonomy"] — herhangi bir villa CRUD veya type
   CRUD invalidate eder. TTL 10 dakika (villas tag'iyle aynı).

   Serialization: Map değil Record (JSON-safe). Caller Record →
   lookup via key access.
=============================================================== */
type CategoryCover = {
  coverImageUrl: string | null;
  villaCount: number;
};

export const getCachedCategoryCovers = unstable_cache(
  async (): Promise<Record<string, CategoryCover>> => {
    /* 🛡️ 2-STEP JOIN (embed yerine):
       Önceki implementasyon `villa:villa_id (...)` embedded join'i
       kullanıyordu. PostgREST FK auto-resolve villa_type_relations
       junction tablosundan resolve edemediği için her satırda
       `villa: null` dönüyordu → covers map kalıcı boş → kategori
       chips render edilmiyordu.

       Yeni pattern: getVillas ile aynı yaklaşım — 2 ayrı query,
       JS-side join. `.from("villa")` singular tablo zaten anasayfada
       çalışıyor; embed sürprizine bağımlı değiliz. */

    // 1) Tüm (type_id, villa_id) eşleşmeleri
    const { data: rels, error: relsErr } =
      await villaTypeRepository.findAllRelations();
    if (relsErr) {
      console.error("[cache.categoryCovers] rels FAILED", relsErr.message);
      return {};
    }
    if (!rels || rels.length === 0) return {};

    // 2) Aktif + silinmemiş villalar + image'leri (TEK round-trip)
    const villaIds = Array.from(
      new Set(
        (rels as Array<{ villa_id: string | null }>)
          .map((r) => r.villa_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    );
    if (villaIds.length === 0) return {};

    const { data: villas, error: vErr } =
      await villaRepository.findActiveImagesByIds(villaIds);
    if (vErr) {
      console.error("[cache.categoryCovers] villas FAILED", vErr.message);
      return {};
    }

    type VillaRow = {
      id: string;
      villa_images?: Array<{
        image_url?: string | null;
        is_cover?: boolean | null;
        sort_order?: number | null;
      }> | null;
    };
    const villaMap = new Map<string, VillaRow>();
    for (const v of (villas as VillaRow[]) || []) {
      if (v?.id) villaMap.set(String(v.id), v);
    }

    /* Type'a göre aggregate. Cover seçimi mapVilla ile aynı kural:
       is_cover önce → sort_order ASC fallback. İlk valid image URL'i
       kullan. Aynı type'a düşen sonraki villalar count'u artırır ama
       cover'ı override etmez (deterministik). */
    const result: Record<string, CategoryCover> = {};
    for (const rel of rels as Array<{
      type_id: string | null;
      villa_id: string | null;
    }>) {
      const typeId = rel?.type_id;
      const vid = rel?.villa_id;
      if (!typeId || !vid) continue;
      const v = villaMap.get(String(vid));
      if (!v) continue; // inactive or soft-deleted villa → atla

      const images = Array.isArray(v.villa_images) ? v.villa_images : [];
      const sorted = [...images].sort((a, b) => {
        if (a?.is_cover) return -1;
        if (b?.is_cover) return 1;
        return (a?.sort_order ?? 0) - (b?.sort_order ?? 0);
      });
      /* 🛡️ Aşama A + bucket-fix — resolveVillaImageUrl: image_url
         FULL URL/relative path dual-format desteği; villa-images bucket.
         coverImageUrl her zaman render-edilebilir URL string'i veya
         null. */
      const firstRaw = sorted.find(
        (i) => typeof i?.image_url === "string" && i.image_url.trim().length > 0
      )?.image_url as string | undefined;
      const firstUrl = resolveVillaImageUrl(firstRaw) ?? undefined;

      const key = String(typeId);
      const existing = result[key];
      if (!existing) {
        result[key] = {
          coverImageUrl: firstUrl ?? null,
          villaCount: 1,
        };
      } else {
        result[key] = {
          coverImageUrl: existing.coverImageUrl || firstUrl || null,
          villaCount: existing.villaCount + 1,
        };
      }
    }
    return result;
  },
  ["category-covers:get"],
  { tags: ["villas", "taxonomy"], revalidate: 600 }
);

/* ===============================================================
   🛡️ LOCATION VILLA COUNTS — homepage "Bölgeler" navigation için
   ===============================================================
   Her location_id için aktif villa sayısı. Tek SELECT:
     villa where is_active=true AND deleted_at IS NULL → location_id
   JS-side aggregate. Junction tablo yok (CategoryCovers'tan farklı).
   N+1 yok; tek round-trip.

   Tags: ["villas", "taxonomy"] — villa CRUD veya location CRUD
   invalidate eder. TTL 10 dakika (CategoryCovers ile aynı).

   Serialization: Record<locationId, count> (JSON-safe Map değil).
=============================================================== */
export const getCachedLocationVillaCounts = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const { data, error } = await villaAdminRepository.findActiveLocationIds();

    if (error || !data) {
      if (error) {
        console.error(
          "[cache.locationVillaCounts] FAILED",
          error.message
        );
      }
      return {};
    }

    const result: Record<string, number> = {};
    for (const row of data as Array<{ location_id: string | null }>) {
      const lid = row?.location_id;
      if (!lid) continue;
      const key = String(lid);
      result[key] = (result[key] ?? 0) + 1;
    }
    return result;
  },
  ["location-villa-counts:get"],
  { tags: ["villas", "taxonomy"], revalidate: 600 }
);

/** Villa types — read-only taxonomy. Tag: "taxonomy".
 *  🛡️ slug field (migration 008): SEO-friendly URL kontratı için
 *  hem id hem slug seçiyoruz. Eski kayıtlarda slug NULL olabilir
 *  (FE/URL layer slug NULL'sa UUID'ye düşer). */
export const getCachedVillaTypes = unstable_cache(
  async () => {
    /* 🛡️ select("*") — migration 061 `show_on_homepage` kolonunu da getirir.
       DEPLOY-SAFE: kolon henüz yoksa (migration uygulanmadıysa) explicit
       select hata verirdi; "*" hata vermez, alan undefined gelir →
       CategoryCollection `!== false` ile undefined'ı görünür sayar →
       migration öncesi "hepsi görünür" davranışı korunur. */
    const { data, error } = await villaTypeRepository.findAllBySortOrder();
    if (error) {
      console.error("[cache.villaTypes] FAILED", error.message);
      return [];
    }
    /* 🛡️ cover_v — cache build timestamp. Cover deterministik path'e
       overwrite edildiği için URL değişmez; bu token cover URL'ine
       `?v=` olarak eklenir (appendAssetVersion). revalidateTaxonomy
       (admin cover upload sonrası) bu cache'i invalidate → rebuild →
       yeni cover_v → public cover anında fresh. Cache hit'te sabit
       (gereksiz refetch yok). */
    const coverV = Date.now();
    return ((data || []) as Array<{
      id: string;
      name: string;
      slug: string | null;
      /** Relative storage path (migration 010). NULL → görseli yok.
       *  Public URL üretimi için: lib/storage.helpers > getCategoryCoverPublicUrl */
      cover_image: string | null;
      /** Migration 061 — homepage kategori slider gösterimi. Migration
       *  öncesi undefined olabilir (deploy-safe); `!== false` → görünür. */
      show_on_homepage?: boolean | null;
    }>).map((r) => ({ ...r, cover_v: coverV }));
  },
  ["villa-types:get"],
  { tags: ["taxonomy"], revalidate: 3600 }
);
