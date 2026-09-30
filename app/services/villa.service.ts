/* ===============================================================
   🛡️ FAZ 32 — REPOSITORY-DRIVEN VILLA SERVICE
   ===============================================================
   Bu dosya artık doğrudan `db.from("villa")` çağırmaz.
   Tüm read-side query'ler `lib/db/villa.repository.ts` üzerinden
   geçer. Service katmanı şu sorumlulukları korur:
     - Raw row → VillaDTO mapping (mapVilla)
     - Repository sonucunu UI-friendly hale getirme
     - Defansif normalize (mevcut davranış aynen)

   DAVRANIŞ BYTE-IDENTICAL:
     - VillaDTO shape: değişmedi
     - mapVilla: değişmedi
     - is_active / deleted_at / sort_order kuralları: değişmedi
     - private_access_token semantic'i: değişmedi
     - getVillaByPrivateToken null-on-empty: değişmedi
     - Public listing visibility: değişmedi

   IMPORT GRAFIĞI:
     Önce:  villa.service → @/lib/db
     Sonra: villa.service → @/lib/db/villa.repository → @/lib/db
   =============================================================== */

/* 🛡️ Villa Migration S4A–S8P — villa.service'in TÜM villa read'leri native'e
   taşındı (findBySlug/findById/listPublic/listForAdmin/countForAdmin/
   listTrashed/findByPrivateToken + S8P findByIds). S1 sonrası hiçbir client
   import etmiyor → server-only native repo güvenli. `villaRepository` alias'ı
   native villaAdminRepository'ye bağlanır → call-site'lar
   (villaRepository.findByIds / villaAdminRepository.X) DEĞİŞMEZ. Anon
   villa.repository import'u kaldırıldı. */
import { cache } from "react";
import {
  villaAdminRepository,
  villaAdminRepository as villaRepository,
} from "@/lib/db/villa.repository.server";
import { getVillaReviewStatsBatch } from "./villa-review.service";
import type { NotFoundSuggestionVilla } from "@/app/components/not-found/NotFoundContent";
import { normalizeYouTubeVideos } from "@/lib/youtube.helper";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";
/* 🛡️ Kart "…'den başlayan" fiyatı — villa_prices içindeki MIN nightly
   (getStartingPrice mevcut, min hesaplar). Eskiden villa_prices[0]
   (embed sırasındaki ilk satır) kullanılıyordu → yanlış "başlangıç". */
import { getStartingPrice } from "@/lib/price.engine";
import {
  normalizeBedroomLayout,
  normalizeBathroomLayout,
  type BedroomLayoutItem,
  type BathroomLayoutItem,
} from "@/lib/villa-layout.helper";

// 🔹 DB tipi (JOIN'li)
export type Villa = {
  id: string;

  title: string;

  description: string;

  badge?: string;

  location?: {
    name: string;
  };

  /* 🛡️ Benzer villa (aynı bölge) eşleştirmesi için FK. `select *` ile
     zaten gelir; additive — mevcut davranış/sorgu değişmez. */
  location_id?: string | null;

  // 🔥 FİYAT
  price?: number;

  currency?: string;

  guests: number;

  bedrooms: number;

  bathrooms: number;

  deposit?: number;

  cleaning_fee?: number;

  cleaning_currency?: string;

  cleaning_limit?: number;

  /* 🛡️ Migration 074 — Havuz Isıtma (5. adım, public villa detail UI
   *  entegrasyonu). NULL/0 → hizmet yok. `select *` ile zaten geliyordu
   *  (repository katmanı değişmedi); bu raw type'a eklenmesi sadece
   *  TS-level passthrough sağlıyor. */
  pool_heating_fee?: number | null;

  pool_heating_currency?: string | null;

  /* 🛡️ Migration 076 — sezonluk ay kısıtı. `select *` ile zaten
   *  geliyor (repository katmanı değişmedi); TS-level passthrough. */
  pool_heating_months?: number[] | null;

  slug?: string;

  created_at?: string | null;

  // 🔥 HAVUZ
  pool_type?: string;

  pool_depth?: string;

  pool_width?: string;

  pool_length?: string;

  indoor_pool?: boolean;

  indoor_pool_depth?: string;

  indoor_pool_width?: string;

  indoor_pool_length?: string;

  child_pool?: boolean;

  child_pool_depth?: string;

  child_pool_width?: string;

  child_pool_length?: string;

  pool_sheltered?: boolean;

  // 🔥 MAP
  map_type?: string;

  latitude?: number;

  longitude?: number;

  map_embed?: string;

  // 🔥 SEO
  seo_title?: string | null;

  seo_description?: string | null;

  noindex?: boolean | null;

  // 🔥 CUSTOM PREPAYMENT
  custom_prepayment_rate?: number | null;

  // 🛡️ VISIBILITY (db/migrations/003)
  is_active?: boolean | null;
  deleted_at?: string | null;

  /* 🛡️ TOURISM DOCUMENT NO (db/migrations/017 — Faz 22).
   *  T.C. Kültür ve Turizm Bakanlığı belge no, opsiyonel ham text.
   *  Eski kayıtlarda null; UI ekleme bu fazda yapılmadı (sadece pipeline). */
  tourism_document_number?: string | null;

  /* 🛡️ MINIMUM STAY NIGHTS (Faz 26B).
   *  Opsiyonel; null/<=1 → enforcement yok. */
  minimum_stay_nights?: number | null;

  /* 🛡️ YOUTUBE VIDEOS (db/migrations/033 — JSONB).
   *  Raw row passthrough. DB null veya array; application layer
   *  normalize/validate eder (lib/youtube.helper). */
  youtube_videos?: unknown;

  /* 🛡️ KONAKLAMA DÜZENİ (db/migrations/047 — JSONB).
   *  Raw row passthrough; null veya array. Application layer
   *  normalize eder (lib/villa-layout.helper). Eski villalar null. */
  bedroom_layout?: unknown;
  bathroom_layout?: unknown;

  /* 🛡️ COMMISSION RATE (% — accounting foundation).
   *  DB kolonu villa.commission_rate (numeric); admin form edit
   *  sayfası hidrate için raw passthrough. */
  commission_rate?: number | null;

  /* 🛡️ FAZ 31 — Private / Temporary Villa URL token.
   *  Off-market preview için unguessable secret. Public listelerde
   *  zaten görünmüyor (is_active=false villalar filter'lanıyor); bu
   *  alan yalnızca `/p/[token]` route'unda fetch path'inde kullanılır.
   *  Eski kayıtlarda null; UI sadece admin grid'inde butona reflect olur. */
  private_access_token?: string | null;

  villa_images?: {
    image_url: string;

    is_cover: boolean;

    sort_order: number;
  }[];
  villa_prices?: {
    price: number;
    currency: string;
    start_date: string;
  }[];
};

// 🔹 UI tipi
export type VillaDTO = {
  id: string;

  title: string;

  description: string;

  location: string;

  /* 🛡️ Benzer villa eşleştirmesi için FK (additive, opsiyonel). */
  location_id?: string | null;

  badge?: string;

  // 🔥 FİYAT
  price: number;

  currency: string;

  guests: number;

  bedrooms: number;

  bathrooms: number;

  deposit: number;

  cleaning_fee: number;

  cleaning_currency: string;

  cleaning_limit: number;

  /* 🛡️ Migration 074 — Havuz Isıtma (5. adım, public villa detail UI).
   *  NULL/0 → BookingSidebar seçeneği göstermez (useBookingEngine
   *  calculatePoolHeatingFee ile aynı semantik). Hesaplama burada
   *  YAPILMAZ — yalnız raw passthrough (cleaning_fee ile aynı desen,
   *  ancak nullable — pool_heating_fee=0 fallback DEĞİL, gerçek NULL
   *  "hizmet yok" anlamına geliyor, admin formu da bu semantiği kullanıyor). */
  pool_heating_fee: number | null;

  pool_heating_currency: string | null;

  /* 🛡️ Migration 076 — sezonluk ay kısıtı. NULL passthrough KORUNUR
   *  (pool_heating_fee ile aynı desen) — NULL "ay kısıtlaması yok,
   *  12 ay aktif" anlamına geliyor (isPoolHeatingActiveForRange bu
   *  semantiği uygular). */
  pool_heating_months: number[] | null;

  slug: string;

  images: string[];

  // 🔥 HAVUZ DTO
  pool_type?: string;

  pool_depth?: string;

  pool_width?: string;

  pool_length?: string;

  indoor_pool?: boolean;

  indoor_pool_depth?: string;

  indoor_pool_width?: string;

  indoor_pool_length?: string;

  child_pool?: boolean;

  child_pool_depth?: string;

  child_pool_width?: string;

  child_pool_length?: string;

  pool_sheltered?: boolean;

  // 🔥 MAP DTO
  map_type?: string;

  latitude?: number;

  longitude?: number;

  map_embed?: string;

  // 🔥 SEO DTO
  seo_title?: string;

  seo_description?: string;

  noindex?: boolean;

  // 🔥 CUSTOM PREPAYMENT DTO (null = global fallback)
  custom_prepayment_rate?: number | null;

  // 🛡️ VISIBILITY DTO (db/migrations/003)
  is_active?: boolean;
  deleted_at?: string | null;

  /* 🛡️ TOURISM DOCUMENT NO DTO (db/migrations/017 — Faz 22).
   *  Eski villalarda null/undefined. Henüz frontend render edilmiyor;
   *  pipeline through. */
  tourism_document_number?: string | null;

  /* 🛡️ MINIMUM STAY NIGHTS DTO (Faz 26B).
   *  BookingSidebar bunu kullanarak selection validation yapar.
   *  null / <=1 → enforcement yok (eski davranış). */
  minimum_stay_nights?: number | null;

  /* 🛡️ YOUTUBE VIDEOS DTO (db/migrations/033 — JSONB).
   *  Normalize edilmiş video listesi (id + url). Boş array / null →
   *  frontend section render etmez. Eski villalarda DB NULL → []. */
  youtube_videos?: { id: string; url: string }[];

  /* 🛡️ KONAKLAMA DÜZENİ DTO (db/migrations/047).
   *  Normalize edilmiş oda düzeni. Boş array → public detay section
   *  render etmez (geriye dönük uyum; eski villalar []). */
  bedroom_layout?: BedroomLayoutItem[];
  bathroom_layout?: BathroomLayoutItem[];

  /* 🛡️ COMMISSION RATE DTO — admin form edit hidrasyon için.
   *  null/undefined → null (admin form 15 default'a düşer). */
  commission_rate?: number | null;

  /* 🛡️ FAZ 31 — Private access token DTO.
   *  Admin grid'inde "Temporary URL" button'unda var/yok kontrolü için
   *  expose edilir. Public/SEO yüzeylere asla render edilmez.
   *  null = henüz token üretilmedi; string = mevcut token (reuse). */
  private_access_token?: string | null;

  /* 🛡️ FAZ 35 — Review aggregate stats (villa card UI).
   *  Approved-only; getVillaReviewStatsBatch ile listede paralel
   *  fetch + merge edilir. Eski caller'lar undefined geçer; VillaCard
   *  prop seviyesinde conditional render → eski davranış aynen.
   *  review_count === 0 veya undefined → meta satırı render edilmez. */
  review_average?: number;
  review_count?: number;
};

// 🔄 MAP
function mapVilla(
  villa: Villa
): VillaDTO {

  let images: string[] = [];

  if (
    villa.villa_images &&
    villa.villa_images.length > 0
  ) {

    const sorted =
      villa.villa_images.sort(
        (a, b) => {

          if (a.is_cover) {
            return -1;
          }

          if (b.is_cover) {
            return 1;
          }

          return (
            a.sort_order -
            b.sort_order
          );
        }
      );

    images =
      sorted
        .map(
          (img) =>
            /* 🛡️ Aşama A + bucket-fix — resolveVillaImageUrl:
               image_url HEM FULL URL (legacy) HEM relative path (yeni)
               olabilir; relative path için doğru bucket (villa-images).
               resolveAssetUrl SITE_ASSETS'a sabit olduğu için kullanılamaz. */
            resolveVillaImageUrl(img.image_url)
        )
        .filter(
          (u): u is string =>
            typeof u === "string" && u.length > 0
        );
  }

  /* 🔥 Kart başlangıç fiyatı = villa_prices içindeki MIN nightly.
     getStartingPrice mevcut helper; en düşük fiyatı döndürür. */
  const startingPrice =
    getStartingPrice(villa.villa_prices ?? []);

  return {
    id: villa.id,

    title: villa.title,

    description:
      villa.description,

    location:
      villa.location?.name || "",

    /* 🛡️ FK passthrough — benzer villa (aynı bölge) eşleştirmesi için. */
    location_id: villa.location_id ?? null,

    badge:
      villa.badge || "",

    // 🔥 FİYAT
    price:
      startingPrice?.price ?? 0,

    currency:
      startingPrice?.currency || "TRY",

    guests:
      villa.guests ?? 0,

    bedrooms:
      villa.bedrooms ?? 0,

    bathrooms:
      villa.bathrooms ?? 0,

    deposit:
      villa.deposit ?? 0,

    cleaning_fee:
      villa.cleaning_fee ?? 0,

    cleaning_currency:
      villa.cleaning_currency || "TRY",

    cleaning_limit:
      villa.cleaning_limit ?? 0,

    /* 🛡️ Migration 074 — Havuz Isıtma. NULL passthrough KORUNUR
       (cleaning_fee'nin aksine `?? 0` fallback YOK) — NULL "hizmet yok"
       anlamına geliyor ve BookingSidebar bu ayrımı kullanıyor. */
    pool_heating_fee:
      villa.pool_heating_fee ?? null,

    pool_heating_currency:
      villa.pool_heating_currency || "TRY",

    /* 🛡️ Migration 076 — sezonluk ay kısıtı. NULL passthrough KORUNUR
       (pool_heating_fee ile aynı desen) — NULL "ay kısıtlaması yok"
       anlamına geliyor. */
    pool_heating_months:
      villa.pool_heating_months ?? null,

    slug:
      villa.slug ?? "",

    images,

    // 🔥 HAVUZ
    pool_type:
      villa.pool_type || "",

    pool_depth:
      villa.pool_depth || "",

    pool_width:
      villa.pool_width || "",

    pool_length:
      villa.pool_length || "",

    indoor_pool:
      villa.indoor_pool ?? false,

    indoor_pool_depth:
      villa.indoor_pool_depth || "",

    indoor_pool_width:
      villa.indoor_pool_width || "",

    indoor_pool_length:
      villa.indoor_pool_length || "",

    child_pool:
      villa.child_pool ?? false,

    child_pool_depth:
      villa.child_pool_depth || "",

    child_pool_width:
      villa.child_pool_width || "",

    child_pool_length:
      villa.child_pool_length || "",

    pool_sheltered:
      villa.pool_sheltered ?? false,

    // 🔥 MAP
    map_type:
      villa.map_type || "coords",

    latitude:
      villa.latitude
        ? Number(villa.latitude)
        : undefined,

    longitude:
      villa.longitude
        ? Number(villa.longitude)
        : undefined,

    map_embed:
      villa.map_embed || "",

    // 🔥 SEO
    seo_title:
      villa.seo_title || "",

    seo_description:
      villa.seo_description || "",

    noindex:
      !!villa.noindex,

    // 🔥 CUSTOM PREPAYMENT (NULL = global fallback)
    custom_prepayment_rate:
      villa.custom_prepayment_rate ??
      null,

    // 🛡️ VISIBILITY (DB defaults: is_active=true, deleted_at=null)
    is_active:
      villa.is_active === undefined || villa.is_active === null
        ? true
        : !!villa.is_active,
    deleted_at: villa.deleted_at ?? null,

    // 🛡️ TOURISM DOCUMENT NO (db/migrations/017 — Faz 22).
    // Pure passthrough; undefined/null → null (eski villalar için).
    // Henüz frontend render YOK; bu pipeline yalnız altyapı.
    tourism_document_number: villa.tourism_document_number ?? null,

    // 🛡️ MINIMUM STAY NIGHTS (Faz 26B).
    // Number ise olduğu gibi; undefined/null/0/negative → null
    // (null = "enforcement yok" canonical değer).
    minimum_stay_nights:
      typeof villa.minimum_stay_nights === "number" &&
      Number.isFinite(villa.minimum_stay_nights) &&
      villa.minimum_stay_nights > 0
        ? villa.minimum_stay_nights
        : null,

    // 🛡️ YOUTUBE VIDEOS (db/migrations/033). Raw JSONB → normalize.
    // Empty / invalid / null → []. Frontend section length > 0
    // koşulu ile conditional render eder.
    youtube_videos: normalizeYouTubeVideos(villa.youtube_videos),

    // 🛡️ KONAKLAMA DÜZENİ (db/migrations/047). Raw JSONB → normalize.
    // Eski villalar NULL → []. Public detay length>0 ile conditional
    // render eder; veri yoksa section hiç çizilmez.
    bedroom_layout: normalizeBedroomLayout(villa.bedroom_layout),
    bathroom_layout: normalizeBathroomLayout(villa.bathroom_layout),

    // 🛡️ COMMISSION RATE — raw passthrough; null/undefined → null.
    // Admin edit page'inde 15 default'a fallback eder.
    commission_rate:
      typeof villa.commission_rate === "number" &&
      Number.isFinite(villa.commission_rate)
        ? villa.commission_rate
        : null,

    // 🛡️ FAZ 31 — Private access token passthrough.
    // Boş string / whitespace defensive normalize → null.
    private_access_token:
      typeof villa.private_access_token === "string" &&
      villa.private_access_token.trim().length > 0
        ? villa.private_access_token
        : null,
  };
}

// 📦 TÜM VİLLALAR — PUBLIC LISTING
// 🛡️ Visibility filter (Faz: villa lifecycle):
//   - is_active=true   → pasif villalar public listede gizlenir
//   - deleted_at IS NULL → soft-deleted villalar tamamen gizlenir
// Admin tarafı bu fonksiyonu kullanmaz; admin için ayrı admin
// listing fonksiyonu (getVillasForAdmin) eklendi.
//
// 🛡️ FAZ 32 — Query repository'ye taşındı; davranış birebir aynı.
//
// 🛡️ FAZ 35 — Review stats (card UI trust meta) listeleme query'sine
// dahil edildi. PARALEL fetch (Promise.all) ile N+1 yok:
//   • villa rows query → mevcut listPublic()
//   • review stats batch → tek SQL, JS group-by
// Iki query paralel; net latency = max(listQuery, statsQuery). Stats
// query mevcut villa rows query'sinden hızlı (yalnız 2 kolon, yalnız
// approved). DTO merge sonrası eski caller'lar shape uyumlu kalır;
// yeni opsiyonel alanlar (review_average / review_count) kullanılır.
export async function getVillas(): Promise<VillaDTO[]> {
  const [rows, statsMap] = await Promise.all([
    villaAdminRepository.listPublic(),
    getVillaReviewStatsBatch(),
  ]);
  return (rows as unknown as Villa[]).map((row) => {
    const dto = mapVilla(row);
    const s = statsMap[dto.id];
    if (s && s.count > 0) {
      dto.review_average = s.average;
      dto.review_count = s.count;
    }
    return dto;
  });
}

/* ===============================================================
   📦 ROOT 404 ÖNERİ VİLLALARI — yalnız `app/not-found.tsx`
   ===============================================================
   ESKİ: `getCachedVillas()` → tüm public liste (1.417 villa, ~3 MB;
   Next 2 MB data-cache limitini aştığı için HİÇ cache'lenmiyordu) →
   `.slice(0, 3)`. not-found tüm public sayfalarda fallback olarak 2×
   render olduğundan bu iş her istekte 2× koşuyordu.

   YENİ: `findNotFoundSuggestions(3)` — AYNI filtre/sıra/cover-slim,
   yalnız kart kolonları + LIMIT 3.

   PARITY:
     • Satırlar `mapVilla` ile map'lenir → images/price(?? 0)/currency
       (|| "TRY")/location/slug/guests… dönüşümleri BİREBİR aynı helper.
     • Çıktı yalnız `NotFoundSuggestionVilla` alanlarına daraltılır (kartın
       okuduğu alanlar); görünen DOM değişmez, yalnız RSC payload küçülür.
     • Review stats EKLENMEZ: NotFoundContent kartlara review geçirmiyor.

   CACHE: YALNIZ React `cache()` — aynı istek içindeki 2 render tek
   sorguyu paylaşır. İstekler arası cache YOK (unstable_cache/TTL yok) →
   veri her istekte canlı, eski davranışla aynı tazelik.

   ⚠️ getVillas / getCachedVillas / listPublic DEĞİŞMEDİ. */
export const getNotFoundSuggestionVillas = cache(
  async (): Promise<NotFoundSuggestionVilla[]> => {
    const rows = await villaAdminRepository.findNotFoundSuggestions(3);
    return (rows as unknown as Villa[]).map((row) => {
      const dto = mapVilla(row);
      return {
        id: dto.id,
        slug: dto.slug,
        title: dto.title,
        location: dto.location,
        price: dto.price,
        currency: dto.currency,
        images: dto.images,
        bedrooms: dto.bedrooms,
        bathrooms: dto.bathrooms,
        guests: dto.guests,
      };
    });
  }
);

// 📦 ADMIN LISTING — pasif villalar dahil, soft-deleted hariç.
// 🛡️ Sadece deleted_at IS NULL filter; is_active filter YOK
// (admin pasif villaları da liste'de görmeli; toggle ile yönetir).
//
// 🛡️ FAZ 32 — Query repository'ye taşındı; davranış birebir aynı.
export async function getVillasForAdmin(): Promise<VillaDTO[]> {
  const rows = await villaAdminRepository.listForAdmin();
  return (rows as unknown as Villa[]).map(mapVilla);
}

/* ===============================================================
   📦 ADMIN SIRALAMA — minimal projection (yalnız /villas/siralama)
   ===============================================================
   `getVillasForAdmin()` DEĞİŞTİRİLMEDİ (52 alanlı `VillaDTO`
   sözleşmesi ve `mapVilla` aynen duruyor). Bu fonksiyon yalnız
   sıralama ekranı için EK olarak eklendi.

   NEDEN: sıralama paneli AST kanıtıyla sadece `id` ve `title`
   okuyor; 52 alanlık DTO'nun RSC payload'ına serialize edilip
   tarayıcıya taşınması saf israftı.

   DAVRANIŞ: satır KÜMESİ ve SIRASI `listForAdmin()` ile BİREBİR
   aynı (aynı WHERE, aynı ORDER BY, LIMIT yok) — yalnız kolonlar
   daraltıldı. `mapVilla` çağrılmaz; bu yüzden villa başına
   `getStartingPrice` + `villa_images.sort()` maliyeti de kalkar.
   =============================================================== */
export type VillaSortItem = {
  id: string;
  title: string;
  sort_order: number;
};

export async function getVillasForSortOrder(): Promise<VillaSortItem[]> {
  const rows = await villaAdminRepository.listForSortOrder();
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    title: String(r.title ?? ""),
    sort_order: Number(r.sort_order ?? 0),
  }));
}

/* ===============================================================
   📦 ADMIN PAGE — pagination + search (opt-in)
   ===============================================================
   `/maki-admin/villas` operasyon ekranı için. Sıralama paneli
   (`/maki-admin/villas/siralama`) bu fonksiyonu KULLANMAZ —
   `getVillasForAdmin()` (no opts → tam liste) backward-compat
   path'i kullanır. İki ekran ayrı tüketiciler; sözleşmeler ayrı.

   PAYLOAD:
     - items: VillaDTO[]   → render edilecek sayfa
     - total: number       → toplam villa (filtered)
     - page:  number       → 1-based; clamp (>=1)
     - pageSize: number    → caller'ın istediği boyut

   PERFORMANCE:
     listForAdmin + countForAdmin paralel çalışır → net latency
     max(list, count). 1000-2000 villa scale'inde LIMIT/OFFSET
     yeterli; cursor pagination ileride (5000+ ölçek).

   SEARCH:
     q opsiyonel; verilirse repository title/slug ILIKE ile
     filtreler; total da aynı filtreyi uygular → tutarlı sayfa
     hesabı. */
export async function getVillasForAdminPage(opts: {
  page: number;
  pageSize: number;
  q?: string;
  active?: boolean;
  document?: "licensed" | "unlicensed";
}): Promise<{
  items: VillaDTO[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const safePage = Math.max(1, Math.floor(opts.page) || 1);
  const safeSize = Math.max(1, Math.floor(opts.pageSize) || 30);
  const offset = (safePage - 1) * safeSize;
  const q = opts.q && opts.q.trim().length > 0 ? opts.q.trim() : undefined;
  /* active undefined → filtre YOK (tüm villalar; eski davranış). */
  const active = opts.active;
  /* document undefined → filtre YOK (eski davranış). */
  const document = opts.document;

  /* Paralel: liste + count tek round-trip yerine eşzamanlı.
     Sıralama (sort_order ASC, created_at DESC) listForAdmin'in
     mevcut order zincirinden gelir → operasyon ekranı sırası
     sıralama paneli ile birebir aynı. */
  const [rows, total] = await Promise.all([
    villaAdminRepository.listForAdmin({
      limit: safeSize,
      offset,
      q,
      active,
      document,
    }),
    villaAdminRepository.countForAdmin({ q, active, document }),
  ]);

  const items = (rows as unknown as Villa[]).map(mapVilla);

  return {
    items,
    total,
    page: safePage,
    pageSize: safeSize,
  };
}

/* ===============================================================
   📦 TRASHED VILLAS — yalnız soft-deleted (deleted_at IS NOT NULL)
   ===============================================================
   /maki-admin/villas/trash ekranı için. Active listeleme query'leri
   (getVillas, getVillasForAdmin) bu kayıtları zaten görmüyor;
   bu fonksiyon onların TERS aynası. Aynı mapVilla shape'i kullanır
   → trash card'ında VillaCard / cover image / location adı parity'si.
   Sıralama: en son silinen üstte.

   🛡️ FAZ 32 — Query repository'ye taşındı; davranış birebir aynı. */
export async function getTrashedVillas(): Promise<VillaDTO[]> {
  const rows = await villaAdminRepository.listTrashed();
  return (rows as unknown as Villa[]).map(mapVilla);
}

// 📦 ID ile — ADMIN EDIT YOLU
// 🛡️ deleted_at IS NULL filter: soft-deleted villalar admin
// edit sayfasına ulaşamaz (kazara erişim koruması).
// is_active filter YOK — pasif villalar admin tarafında
// edit edilebilir kalır.
//
// 🛡️ FAZ 32 — Query repository'ye taşındı; davranış birebir aynı.
export async function getVillaById(
  id: string
): Promise<VillaDTO | null> {
  const row = await villaAdminRepository.findById(id);
  return row ? mapVilla(row as unknown as Villa) : null;
}

// 🔥 SLUG ile — PUBLIC DETAIL YOLU
// 🛡️ Visibility filter:
//   - is_active=true   → pasif villalar public detay sayfasında gizlenir
//   - deleted_at IS NULL → soft-deleted villalar gizlenir
// Sayfa null döndüğünde [slug] route 404 component'i render eder.
//
// 🛡️ FAZ 32 — Query repository'ye taşındı; davranış birebir aynı.
// Mevcut "not found" diagnostic warn log korunur.
export async function getVillaBySlug(
  slug: string
): Promise<VillaDTO | null> {
  const row = await villaAdminRepository.findBySlug(slug);
  if (!row) {
    console.warn("⚠️ Villa bulunamadı:", slug);
    return null;
  }
  return mapVilla(row as unknown as Villa);
}

/* ===============================================================
   🛡️ FAZ 31 — getVillaByPrivateToken
   ===============================================================
   Off-market / VIP preview erişimi. `/p/[token]` route'undan çağrılır.

   Davranış:
     - Tüm villa raw kolonlarını + location/villa_images SELECT eder
       (getVillaBySlug ile birebir aynı shape; mapVilla reuse).
     - is_active filter UYGULAMAZ → pasif villalar da fetch edilir.
     - deleted_at IS NULL kontrolü KORUNUR → silinmiş villalar
       erişilemez (token leak'i olsa bile geri gelmez).
     - Token boş/whitespace ise erken null dönüş (gereksiz query yok).
     - maybeSingle: token DB unique index (partial, where IS NOT NULL),
       collision yok varsayımı.

   Cache: explicit OLARAK cache'lenmiyor. Private URL'leri kontrol
   altında tutmak ve token rotasyonu / revoke senaryosunda anlık
   yansıma için route segment cache (force-dynamic) tercih edilir.
   =============================================================== */
/* ===============================================================
   🛡️ FAZ 36 — getVillasByIds (guest favorites)
   ===============================================================
   /favoriler sayfasında localStorage'dan okunan villa.id dizisi
   için VillaDTO[] döner.

   Davranış:
     - villaRepository.findByIds → tek SELECT, visibility filter'lı
     - getVillaReviewStatsBatch (paralel) → VillaCard meta için
       review_average / review_count enrichment
     - LocalStorage'da pasif/silinmiş villa id'leri olsa bile
       repository onları döndürmez → kullanıcı görmez (defansif).
     - Boş id dizisi → instant []; tek query bile yapılmaz.

   N+1 ENGEL:
     Paralel fetch (Promise.all); 1 villa query + 1 stats query.
     Favorite sayısı arttıkça ek round-trip yok.

   CACHE:
     Bu fonksiyon HEDEFLEDİĞİ KULLANICIYA ÖZEL veri döner
     (localStorage'a göre filter'lı). Bu yüzden cache wrapper'ı
     yoktur; her çağrıda fresh data. Çağıran tarafta (client) küçük
     debounce/memoization opsiyonel.
=============================================================== */
export async function getVillasByIds(ids: string[]): Promise<VillaDTO[]> {
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const [rows, statsMap] = await Promise.all([
    villaRepository.findByIds(ids),
    getVillaReviewStatsBatch(),
  ]);

  return (rows as unknown as Villa[]).map((row) => {
    const dto = mapVilla(row);
    const s = statsMap[dto.id];
    if (s && s.count > 0) {
      dto.review_average = s.average;
      dto.review_count = s.count;
    }
    return dto;
  });
}

export async function getVillaByPrivateToken(
  token: string
): Promise<VillaDTO | null> {
  /* 🛡️ FAZ 32 — Query repository'ye taşındı; davranış birebir aynı.
     Empty/whitespace guard zaten repository içinde defansif olarak
     duplicate ediliyor; service tarafında ek guard gerek yok. */
  const row = await villaAdminRepository.findByPrivateToken(token);
  return row ? mapVilla(row as unknown as Villa) : null;
}