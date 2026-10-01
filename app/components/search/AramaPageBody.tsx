/* 🛡️ FAZ 4A — SSR-AWARE client (cookies-backed; sunucu tarafında auth
   context taşır). Davranış değişmedi: query'ler, error handling,
   revalidate, cache config AYNEN. Yalnız client kaynağı module-level
   anon singleton'dan request-scoped helper'a geçti. Public-readable
   tablolarda zaten anon allow → runtime farkı yok; gelecekte admin-only
   tabloya yazma/okuma eklenirse session cookies otomatik akar. */
import { cookies } from "next/headers";
/* 🛡️ Villa Migration S5B — findSearchResults native embed'e taşındı. Bu
   sayfa server RSC + villaRepository'yi YALNIZ findSearchResults için
   kullanıyor → server-only native repo import'u güvenli, tek call-site. */
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { villaTypeRepository } from "@/lib/db/villa-type.repository";
import { villaFeatureRepository } from "@/lib/db/villa-feature.repository";
/* 🛡️ Hero ile AYNI özellik kaynağı — yeni action/repository/sorgu
   YAZILMADI. Locale-aware adlar (TR'de ek sorgu yok) buradan gelir. */
import { loadHeroFeatures } from "@/app/components/ui/hero/_components/hero-features.action";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";
import {
  getExchangeRatesMap,
  type ExchangeRatesMap,
} from "@/app/services/exchange-rate.service";
import VillaCard from "@/app/components/villa/VillaCard";
import {
  calculateGrandTotal,
  calculateNights,
  getStartingPrice,
  type DiscountRange,
} from "@/lib/price.engine";
import { Search, Sparkles } from "lucide-react";

import FilterSidebar from "@/app/(public)/arama/FilterSidebar";
import PageHero from "@/app/components/ui/PageHero";

/* 🛡️ PHASE 13 — PUBLIC ARAMA ÇOKLU DİL. Statik UI metinleri MEVCUT
   public dictionary'den (`search` namespace); arama pipeline'ı, URL
   kontratı, availability/fiyat/sort semantiği DEĞİŞMEDİ. `basePath`
   mevcut `buildLocaleAlternates` (Phase 7B) ile türetilir — yeni
   routing sistemi kurulmadı. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
/* 🛡️ NAVIGATION LOCALE PERSISTENCE — iç link aktif locale'i taşır
   (bkz. lib/i18n/locale-href.ts). */
import { localeHref } from "@/lib/i18n/locale-href";
import type { Dictionary } from "@/lib/i18n/dictionaries/types";
/* 🛡️ VİLLA TİPİ ADI (EN/DE) — `loadHeroFilters` (Phase 11 P0) ve
   `VillaTypeCarousel` ile AYNI, ZATEN VAR OLAN iki helper. Yeni
   translation sistemi / DB katmanı YAZILMADI. */
import { getVillaTypeNamesByLocale } from "@/lib/i18n/get-villa-type-translations.server";
import { getVillaBadgesByLocale } from "@/lib/i18n/get-villa-badge-translations.server";
import {
  resolveTaxonomyName,
  type TaxonomyNameByLocale,
} from "@/lib/i18n/taxonomy-name.helper";

type SearchDictionary = Dictionary["search"];

/** `PublicSort` (lib/pagination.ts — DOKUNULMADI) → dictionary key.
 *  TR değerleri `PUBLIC_SORT_LABELS` ile BİREBİR aynıdır. */
const SORT_DICT_KEY: Record<PublicSort, keyof SearchDictionary["sortOptions"]> =
  {
    smart: "smart",
    "price-asc": "priceAsc",
    "price-desc": "priceDesc",
    "capacity-asc": "capacityAsc",
    "capacity-desc": "capacityDesc",
  };

import {
  JsonLd,
  buildBreadcrumb,
  buildItemList,
} from "@/app/components/seo/StructuredData";

import {
  getBlockedVillaIds,
  isValidYmd,
} from "@/lib/availability.helper";

import {
  getCachedVillaLocations,
  getCachedVillaTypes,
} from "@/lib/cache.helpers";
import { isUuid } from "@/lib/slug";
/* 🛡️ FAZ 35 — Review stats batch (no N+1): tek SQL ile tüm villa
   yorumlarının aggregate'i. Filter-dependent main query'den bağımsız;
   tüm villaları kapsar. JS-side merge sonrası VillaCard'a aktarılır. */
import { getVillaReviewStatsBatch } from "@/app/services/villa-review.service";

/* 🛡️ Public pagination helpers — pure functions; admin sözleşmesi
   etkilenmez. Default 12 (URL'e yazılmaz); allowed [12,30,50,100]. */
import {
  ALLOWED_PUBLIC_PAGE_SIZES,
  ALLOWED_PUBLIC_SORTS,
  DEFAULT_PUBLIC_PAGE_SIZE,
  DEFAULT_PUBLIC_SORT,
  applyPublicSort,
  computePageWindow,
  parsePublicPage,
  parsePublicPageSize,
  parsePublicSort,
  type PublicSort,
} from "@/lib/pagination";
import Link from "next/link";
import Script from "next/script";
import { ChevronLeft, ChevronRight } from "lucide-react";

/* 🛡️ KART GÖRSELİ `sizes` — yalnız /arama grid'ine göre (sidebar md+
   260/300px; kart 1 / sm 2 / md 1 / lg 2 / xl 3 sütun). Değerler ölçülen
   kart genişliği × 1.41 güvenlik payı (16:9 cover kırpma × hover 1.06)
   ile hesaplandı; ≤1023px mevcut değer AYNEN korunur. Ana liste ve
   esnek tarih bölümü aynı grid'i kullanır. Grid/padding sınıfları
   değişirse bu değer yeniden hesaplanmalı. */
const ARAMA_CARD_SIZES =
  "(max-width: 640px) 100vw, " +
  "(max-width: 1023px) 50vw, " +
  "(max-width: 1279px) calc(70.5vw - 360px), " +
  "(max-width: 1407px) calc(47vw - 256px), " +
  "406px";

/* 🛡️ Next.js 16: searchParams-bağımlı sayfalar zaten dynamic
   olmalı, ama bir caching / PPR sürprizi olmadığından emin
   olmak için explicit declaration. Bu, build-time pre-render
   veya stale revalidate ihtimalini kategorik olarak siler. */
/* ===============================================================
   🛡️ /arama — SEARCH RESULTS (SERVER COMPONENT)
   ===============================================================
   KORUNAN MEVCUT MANTIK (DEĞİŞMEZ):
     - searchParams shape: { categories, regions, start, end, guests }
     - eski sağlayıcı query: villa where is_active=true & deleted_at IS NULL
       + .in("location", regions) eğer regions varsa
       + .gte("guests", guests) eğer guests varsa
     - JSON-LD: BreadcrumbList + ItemList
     - URL = source-of-truth

   YENİ EKLENENLER (UI-ONLY):
     - villa_locations + villa_types fetch (FilterSidebar için)
     - 2-col layout (sticky sidebar + results grid)
     - <FilterSidebar /> client island (URL push'lar buradan)

   YENİ BUSINESS LOGIC YOK. Sidebar URL'e push eder → bu server
   component aynı eski eski sağlayıcı query'siyle yeniden render olur.
   =============================================================== */

/* ===============================================================
   🛡️ NEXT.JS 16 ASYNC SEARCHPARAMS CONTRACT
   ===============================================================
   Next.js 15+ ile birlikte `searchParams` artık Promise. Sync
   property access (sp.start vb.) Promise object'in kendisinden
   okur — Promise'da `start`/`end`/`regions` property'leri olmadığı
   için sessizce `undefined` döner. Bu da entire availability
   pipeline'ı bypass'lıyordu (filter skip → tüm villalar render).
   Codebase'in geri kalanı zaten doğru pattern'i kullanıyor (örn.
   app/(public)/rezervasyon/[slug]/page.tsx). Burası da hizalandı.
   =============================================================== */
/** 🛡️ URL query kontratı — Phase 13'te DEĞİŞMEDİ; route dosyaları
 *  aynı tipi paylaşsın diye export edildi. */
export type AramaSearchParams = Promise<{
    /** 🛡️ Eski canonical param — backward-compat için accept ediliyor.
     *  Yeni canonical: `villa-turleri`. */
    categories?: string | string[];
    /** 🛡️ Yeni canonical param (SEO-friendly TR). `categories` ile
     *  aynı semantic; ikisi gelirse `villa-turleri` öncelikli. */
    "villa-turleri"?: string | string[];
    /** 🛡️ Eski canonical param — backward-compat için accept ediliyor.
     *  Yeni canonical: `bolgeler`. */
    regions?: string | string[];
    /** 🛡️ Yeni canonical param (SEO-friendly TR). `regions` ile aynı
     *  semantic; ikisi gelirse `bolgeler` öncelikli. */
    bolgeler?: string | string[];
    start?: string | string[];
    end?: string | string[];
    guests?: string | string[];
    /** 🛡️ SCALE HARDENING — pagination (1-based). */
    page?: string | string[];
    /** 🛡️ Public page size selector — allow-list [12,30,50,100].
     *  Default 12 (URL'e yazılmaz, clean URL). */
    pageSize?: string | string[];
    /** 🛡️ Public sort — allow-list:
     *    smart (default, URL'e yazılmaz) | price-asc | price-desc
     *    | capacity-asc | capacity-desc
     *  helpers: lib/pagination.ts (parsePublicSort + applyPublicSort). */
    sort?: string | string[];
    /** 🛡️ ADDITIVE — "Gelişmiş Arama" ±N gün esnek EK sonuç bayrağı.
     *  Yoksa/0 → davranış birebir mevcut. Ana `start`/`end` ASLA
     *  değişmez; bu değer yalnız internal availability tespiti için. */
    flexible?: string | string[];
    /** 🛡️ ADDITIVE — "Gelişmiş Arama" villa özellikleri filtresi (AND).
     *  Virgülle ayrık UUID listesi (`villa_features.id`). `villa_features`
     *  tablosunda `slug` KOLONU YOK → slug token ÜRETİLMEZ. Yoksa/boşsa
     *  arama davranışı BİREBİR mevcut haliyle kalır. Legacy eş adı YOK
     *  (tamamen yeni parametre). */
    ozellikler?: string | string[];
}>;

type Props = {
  /** 🛡️ PHASE 13 — TR/EN/DE ortak gövde. `/arama` → "tr",
   *  `/en/arama` → "en", `/de/arama` → "de". */
  locale?: Locale;
  searchParams: AramaSearchParams;
};

/* 🛡️ YMD +N gün — yalnız INTERNAL esnek availability penceresi üretmek
   için (mevcut getBlockedVillaIds'e argüman). UTC-safe → TZ drift yok.
   Fiyat/availability ALGORİTMASI DEĞİL; salt string kaydırma. Çıktı
   hiçbir zaman ana start/end'e / karta / URL'ye yazılmaz. */
function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/* 🛡️ Public pagination — helpers `lib/pagination.ts`.
   Sayfa boyutu artık URL state'inden geliyor; default 12. */

/** URL'de aynı key birden fazla geçerse Next array verir; ilk
 *  string'i alıyoruz — Hero ve FilterSidebar zaten tek-değerli
 *  yazıyor, bu sadece defensive fallback. */
const firstString = (v: unknown): string | null => {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
};

export default async function AramaPageBody({
  locale = DEFAULT_LOCALE,
  searchParams,
}: Props) {
  const sp = await searchParams;

  /* 🛡️ PHASE 13 — statik UI sözlüğü + locale-aware base path.
     `buildLocaleAlternates("/arama", locale).canonical`:
       tr → "/arama" · en → "/en/arama" · de → "/de/arama"
     Query parametreleri BU DEĞERDEN BAĞIMSIZ, aynen korunur. */
  const dict = getDictionary(locale).search;
  const basePath = buildLocaleAlternates("/arama", locale).canonical;


  /* 🛡️ CATEGORY PARAM EVRIMI:
     Yeni canonical: `villa-turleri` (SEO-friendly TR).
     Eski canonical: `categories` — backward-compat için hâlâ okunuyor.
     Önceliklik: `villa-turleri` varsa onu kullan; yoksa `categories` fallback.
     Internal logic (categoryVillaIds, .in("type_id", categories),
     availability, pricing) DOKUNULMADI. */
  const categoriesRaw =
    firstString(sp["villa-turleri"]) ?? firstString(sp.categories);
  /* 🛡️ REGION PARAM EVRIMI:
     Yeni canonical: `bolgeler` (SEO-friendly TR).
     Eski canonical: `regions` — backward-compat için hâlâ okunuyor.
     Önceliklik: `bolgeler` varsa onu kullan; yoksa `regions` fallback.
     Internal logic (categoryVillaIds, .in("location_id", regions),
     availability, pricing) DOKUNULMADI. */
  const regionsRaw = firstString(sp.bolgeler) ?? firstString(sp.regions);
  const guestsRaw = firstString(sp.guests);

  /* 🛡️ TOKEN PARSE (categories + regions) — hem UUID hem slug accept eder.
     Token UUID ise direkt kullanılır; değilse cached taxonomy lookup'unda
     slug → id resolve edilir. Backward compatibility: eski
     /arama?categories=<uuid> ve /arama?regions=<uuid> linkleri AYNEN çalışır. */
  const categoryTokensRaw = categoriesRaw
    ? categoriesRaw.split(",").filter(Boolean)
    : [];
  const regionTokensRaw = regionsRaw
    ? regionsRaw.split(",").filter(Boolean)
    : [];
  /* 🛡️ ADDITIVE — villa özellikleri (AND). Token formatı YALNIZ UUID
     (`villa_features`'ta slug kolonu yok); `resolveTokens` UUID dalı
     zaten bunu karşılar. Parametre yoksa dizi boş → aşağıdaki tüm
     özellik mantığı KAPALI kalır ve hiç ek sorgu atılmaz. */
  const featureTokensRaw = (firstString(sp.ozellikler) || "")
    .split(",")
    .filter(Boolean);
  const guests = Number(guestsRaw || 0) || 0;

  /* ===============================================================
     📅 AVAILABILITY DATE WINDOW
     ===============================================================
     Hero search'ten URL'e gelen lokal YYYY-MM-DD string'ler.
     - parseLocalDate / Date object kullanmıyoruz — string-level
       lexicographic ISO 8601 sort guarantee'si sayesinde tüm
       comparison drift-free.
     - Sadece ikisi de valid VE start < end ise availability
       filter aktive olur. Aksi halde tarihsiz arama davranışı.
     - Spec: lib/availability.helper.ts (reservation.service.ts'in
       Faz 2B overlap clause'larıyla byte-identical).
     =============================================================== */
  const rawStart = firstString(sp.start);
  const rawEnd = firstString(sp.end);
  const start = isValidYmd(rawStart) ? rawStart : null;
  const end = isValidYmd(rawEnd) ? rawEnd : null;
  const hasDateRange = !!(start && end && start < end);

  /* ===============================================================
     🛡️ TAXONOMY PRE-FETCH (cached) — sidebar opsiyonları + slug resolve
     ===============================================================
     getCachedVillaTypes / getCachedVillaLocations: tag "taxonomy",
     TTL 1 saat. Cache hit'te ~0ms; admin location/type CRUD sonrası
     revalidateTaxonomy() invalidate eder. Category slug→id resolver
     için types listesi bu noktada lazım.
     =============================================================== */
  /* 🛡️ Villa özellikleri — sidebar'daki "Villa Özellikleri" bölümü
     ve `ozellikler` token resolve'u için TEK liste. Hata durumunda
     boş liste → bölüm boş metin gösterir, arama ETKİLENMEZ.

     🛡️ PERF (O4) — Sorgu ESKİSİ GİBİ taxonomy okumalarıyla AYNI ANDA
     başlar; ancak artık villa akışını BLOKLAMAZ. Liste yalnız iki yerde
     kullanılır: (1) `ozellikler` token'larının UUID doğrulaması — URL'de
     token VARSA aşağıda, çözümden ÖNCE await edilir (davranış birebir);
     token YOKSA `resolveTokens([], …)` listeden bağımsız olarak `[]` döner,
     (2) sidebar prop'u — render'dan ÖNCE await edilir. `.catch(() => [])`
     fallback'i BİREBİR aynı ve oluşturma anında bağlı (reject etmez). */
  const featureOptionsPromise = loadHeroFeatures(locale).catch(() => []);
  const [regionOptions, categoryOptions] = await Promise.all([
    getCachedVillaLocations(),
    getCachedVillaTypes(),
  ]);

  /* 🛡️ PERF (O3) — EN/DE sidebar tip adı çevirisi YALNIZ `categoryOptions`
     (cached taxonomy) listesine bağlıdır; arama sonucuna/URL filtresine
     bağlı DEĞİLDİR. Bu yüzden burada, villa akışıyla EŞZAMANLI başlatılır
     ve ESKİSİ GİBİ aşağıdaki sidebar bloğunda await edilir. Koşul, argüman
     ve `.catch(() => ({}))` fallback'i BİREBİR aynı; TR'de sorgu HİÇ
     başlatılmaz (null). `.catch` oluşturma anında bağlı → erken bir hata
     sayfayı düşürürse unhandled rejection oluşmaz. */
  const typeNamesPromise: Promise<Record<string, TaxonomyNameByLocale>> | null =
    locale !== DEFAULT_LOCALE && categoryOptions.length > 0
      ? getVillaTypeNamesByLocale(
          categoryOptions.map((t) => String(t.id))
        ).catch(() => ({}))
      : null;

  /* ===============================================================
     🛡️ CATEGORY + REGION TOKEN → UUID RESOLVE
     ===============================================================
     URL'de gelen tokenlar 3 formatın biri olabilir:
       - UUID (eski linkler — backward-compat)
       - slug (yeni canonical — SEO-friendly)
       - geçersiz (silinmiş kayıt) → düşür
     Resolve sonrası `categories` ve `regions` array'leri SADECE
     UUID içerir — downstream query'ler (.in("type_id", categories),
     .in("location_id", regions)) ve sidebarInitial yapısı eski
     kontratı korur.
     =============================================================== */
  function resolveTokens(
    tokens: string[],
    options: Array<{ id: string; slug: string | null }>
  ): string[] {
    const slugIdx = new Map<string, string>();
    const validIds = new Set<string>();
    for (const o of options) {
      validIds.add(o.id);
      if (o.slug) slugIdx.set(o.slug, o.id);
    }
    const out: string[] = [];
    for (const tok of tokens) {
      if (isUuid(tok)) {
        if (validIds.has(tok)) out.push(tok);
        // bilinmeyen UUID → düşür (silinmiş kayıt)
      } else {
        const id = slugIdx.get(tok);
        if (id) out.push(id);
      }
    }
    return out;
  }

  const categories = resolveTokens(categoryTokensRaw, categoryOptions);
  const regions = resolveTokens(regionTokensRaw, regionOptions);

  /* ===============================================================
     🛡️ VİLLA ÖZELLİĞİ TOKEN → UUID RESOLVE (ADDITIVE)
     ===============================================================
     Seçenek listesi YALNIZ `ozellikler` parametresi varsa çekilir →
     filtre kullanılmadığında /arama'nın sorgu sayısı DEĞİŞMEZ.
     Cache helper EKLENMEDİ (admin feature CRUD'u taxonomy tag'ini
     invalidate etmiyor; stale liste riski alınmadı).

     `slug: null` verilir → `resolveTokens` yalnız UUID dalını kullanır:
     geçersiz/silinmiş token sessizce DÜŞER (tip/bölge ile aynı kontrat)
     ve `.in("feature_id", …)` ASLA uuid-cast hatası alamaz.

     DEDUPE: aynı özellik iki kez gelirse (`ozellikler=a,a`) AND eşiği
     şişip yanlışlıkla 0 sonuç üretmesin diye tekilleştirilir. */
  /* O4 — token varsa liste ÇÖZÜMDEN ÖNCE beklenir (eski davranış);
     token yoksa sonuç listeden bağımsız `[]` olduğundan beklenmez. */
  const featureOptionsForTokens =
    featureTokensRaw.length > 0 ? await featureOptionsPromise : [];
  const featureIds = Array.from(
    new Set(
      resolveTokens(
        featureTokensRaw,
        featureOptionsForTokens.map((f) => ({ id: String(f.id), slug: null }))
      )
    )
  );

  /* ===============================================================
     🛡️ CATEGORY (Villa Tipi) PRE-RESOLVE — DB-LEVEL FILTER (AND)
     ===============================================================
     Villa ↔ villa_types M:N junction üzerinden ilişkili
     (villa_type_relations: { villa_id, type_id }). Kullanıcı 1+
     tip seçtiyse, önce junction'dan type_id ∈ categories olan
     SATIRLARI çek; sonra villa_id başına UNIQUE type_id sayısı
     === categories.length olanları seç (AND semantiği); ve son
     olarak main villa query'sine `.in("id", typeMatchedVillaIds)`
     ekle.

     SEMANTIC (ÜRÜN KARARI — OR → AND):
       - Tip içi: AND (TÜM seçili tiplere sahip villa eşleşir)
           "Balayı + Deniz Manzaralı" → villa hem Balayı'ya hem
           Deniz Manzaralı'ya AYNI ANDA sahip olmalı.
       - Diğer filtrelerle: AND (region/guest/availability ile birlikte)
       - Tek kategori seçildiğinde AND === OR (matematiksel olarak
         aynı sonuç); semantic-only değişiklik 2+ kategori için
         devreye girer.

     PERFORMANS:
       - Tek extra SELECT (villa_type_relations); junction tablosu
         küçük olur, çoğu zaman index hit. N+1 yok.
       - Mevcut OR'a göre dönen satır sayısı ~aynı (DISTINCT yerine
         tüm match satırları); JS-side Map<vid, Set<tid>> ile
         O(N) sayım. Yeni index gerekmez.
       - Sıfır match olursa main query'ye `.in("id", [])` koyup
         eski sağlayıcının boş set döndürmesini bekleme yerine kısa-devre:
         hiç villa yok → erken empty list, downstream pipeline
         doğru biçimde 0 sonuç render eder.

     UX REGRESYONU:
       - 3+ kategori seçimlerinde empty-state olasılığı yüksek;
         ürün kararı gereği kabul edildi (filtre = daraltma).
     =============================================================== */
  /* 🛡️ PERF — İKİ JUNCTION SORGUSU PARALEL BAŞLATILIR.
     ÖNCE: tip sorgusu `await` edilir, BİTTİKTEN SONRA özellik sorgusu
     başlardı (iki SIRALI RTT). Bu iki sorgu birbirinin çıktısını
     KULLANMAZ; kesişim (`matchVillaIds`) zaten ikisi de geldikten
     sonra alınır → eager başlatmak sonucu DEĞİŞTİREMEZ.
     GÜVENLİ ÇÜNKÜ:
       • Repository metodları REJECT ETMEZ — native provider hatayı
         yakalayıp `{ data: null, error }` döndürür
         (lib/db/native-db.provider.ts). Dolayısıyla "unhandled
         rejection" riski YOK.
       • Guard'lar (`categories.length > 0` / `featureIds.length > 0`)
         AYNEN korundu → filtre seçili değilse sorgu HİÇ kurulmaz
         (ek sorgu YOK; mevcut davranış birebir).
       • Her bloğun defansif hata tutumu (`error` → filtre atlanır)
         ve tüm AND/Set mantığı DEĞİŞMEDİ. */
  const categoryRelsPromise =
    categories.length > 0
      ? villaTypeRepository.findVillaTypeRelationsByTypeIds(categories)
      : null;
  const featureRelsPromise =
    featureIds.length > 0
      ? villaFeatureRepository.findVillaFeatureRelationsByFeatureIds(featureIds)
      : null;

  let categoryVillaIds: string[] | null = null;
  if (categories.length > 0) {
    const { data: rels, error: relsErr } = await categoryRelsPromise!;

    if (relsErr) {
      console.error(
        "[arama] villa_type_relations fetch error:",
        relsErr.message
      );
      // Defensive: hata varsa kategori filtresi atlanır (eski davranış);
      // diğer filtreler etkilenmez.
      categoryVillaIds = null;
    } else {
      // villa_id → seçili kategorilerin hangilerine sahip olduğunu
      // tutan Set. Bir villa SADECE Set.size === categories.length
      // olduğunda "tüm seçili kategorilere sahip" sayılır → AND.
      const typeIdsByVilla = new Map<string, Set<string>>();
      for (const r of rels || []) {
        const vid = r?.villa_id ? String(r.villa_id) : null;
        const tid = r?.type_id ? String(r.type_id) : null;
        if (!vid || !tid) continue;
        let bucket = typeIdsByVilla.get(vid);
        if (!bucket) {
          bucket = new Set<string>();
          typeIdsByVilla.set(vid, bucket);
        }
        bucket.add(tid);
      }
      const required = categories.length;
      const matched: string[] = [];
      for (const [vid, typeSet] of typeIdsByVilla) {
        if (typeSet.size === required) matched.push(vid);
      }
      categoryVillaIds = matched;
    }
  }

  // 🛡️ Visibility filter (db/migrations/003): pasif ve soft-deleted
  // villalar public arama sonuçlarında gizlenir.
  //
  // 🛡️ IMAGE FIX: select("*") yetmez — VillaCard `images: string[]`
  // bekliyor; bunlar `villa_images` JOIN tablosunda. Aynı şekilde
  // VillaCard `location: string` bekliyor; raw `villa.location` UUID
  // FK olduğu için `location:villa_locations(name)` aliasıyla joinli
  // okuyoruz. JOIN aliasing FK kolonunu filtre amacıyla bozmaz
  // (.in("location", regions) hâlâ doğrudan FK üzerinden çalışır).
  /* 🏷️ VİLLA TİPİ (categories) — DB-level filter via pre-resolved IDs.
     🛡️ FIX: önceden `__no_match__` literal'i ile boş match'e
     zorluyorduk; villa.id UUID kolonu olduğu için Postgres
     `invalid input syntax for type uuid` ile fail ediyor ve tüm
     sayfa "Arama yüklenemedi" error state'ine düşüyordu. Doğru
     yaklaşım: hiç eşleşen tip yoksa query'yi büyütmeden devam et,
     normalize aşamasında `forceEmpty` ile sonuç listesini boşalt
     → 0-sonuç empty state'i layout içinde sakince render edilir. */
  /* ===============================================================
     🛡️ VİLLA ÖZELLİKLERİ (features) — DB-LEVEL FILTER (AND)
     ===============================================================
     Villa tipi filtresiyle BİREBİR AYNI mimari (yukarıdaki blok):
     junction'dan (`villa_feature_relations`) seçili feature_id satırları
     çekilir; villa başına UNIQUE feature_id sayısı === seçim sayısı
     olanlar eşleşir (AND). `Set` kullanıldığı için junction'daki olası
     YİNELENEN satırlar sayımı BOZMAZ.

     Hata → `featureVillaIds = null` (filtre atlanır, sayfa çalışmaya
     devam eder) — tip filtresindeki defansif tutumun aynısı.
     =============================================================== */
  let featureVillaIds: string[] | null = null;
  if (featureIds.length > 0) {
    const { data: featureRels, error: featureRelsErr } =
      await featureRelsPromise!;

    if (featureRelsErr) {
      console.error(
        "[arama] villa_feature_relations fetch error:",
        featureRelsErr.message
      );
      featureVillaIds = null;
    } else {
      const featureIdsByVilla = new Map<string, Set<string>>();
      for (const r of featureRels || []) {
        const vid = r?.villa_id ? String(r.villa_id) : null;
        const fid = r?.feature_id ? String(r.feature_id) : null;
        if (!vid || !fid) continue;
        let bucket = featureIdsByVilla.get(vid);
        if (!bucket) {
          bucket = new Set<string>();
          featureIdsByVilla.set(vid, bucket);
        }
        bucket.add(fid);
      }
      const requiredFeatures = featureIds.length;
      const matchedByFeature: string[] = [];
      for (const [vid, featureSet] of featureIdsByVilla) {
        if (featureSet.size === requiredFeatures) matchedByFeature.push(vid);
      }
      featureVillaIds = matchedByFeature;
    }
  }

  /* 🛡️ KESİŞİM — tip filtresi VE özellik filtresi birlikte seçilmişse
     iki id kümesinin KESİŞİMİ alınır (her iki filtre de daraltmadır).
     Yalnız biri aktifse o kümenin kendisi, hiçbiri aktif değilse `null`
     (= filtre yok) kullanılır → `findSearchResults` SQL'i ve imzası
     DEĞİŞMEDEN eski davranışını sürdürür. */
  let matchVillaIds: string[] | null = categoryVillaIds;
  if (featureVillaIds !== null) {
    if (matchVillaIds === null) {
      matchVillaIds = featureVillaIds;
    } else {
      const featureIdSet = new Set(featureVillaIds);
      matchVillaIds = matchVillaIds.filter((id) => featureIdSet.has(id));
    }
  }

  /* ⚠️ KRİTİK: `findSearchResults` BOŞ diziyi "filtre yok" sayar
     (villa.repository.server.ts — `categoryVillaIds.length > 0` guard'ı).
     Bu yüzden eşleşme kümesi BOŞSA sorgu değil, `forceEmpty` devreye
     girer; aksi halde 0 sonuç yerine TÜM villalar render edilirdi.
     Artık kontrol `categoryVillaIds` yerine KESİŞİM üzerinden yapılır. */
  const forceEmpty = matchVillaIds !== null && matchVillaIds.length === 0;

  /* 📍 BÖLGE
     🛡️ DB SCHEMA: villa tablosunda `location` kolonu YOK; gerçek
     FK kolonu `location_id`. Select içindeki `location:villa_locations(name)`
     yalnız **response alias'ı** (joined nested objesi `villa.location`
     adıyla döndürür); filter kolonu DEĞİL. Postgres `column villa.location
     does not exist` hatasını bu yüzden veriyordu. Doğru filter:
     `location_id IN (regions)`. */
  /* ===============================================================
     🛡️ GRUP-KÖKÜ GENİŞLETME (Migration 050 — yalnız resolver mantığı)
     ===============================================================
     "Tüm Kalkan" = grup kökü lokasyonu (name === filter_group_name).
     Seçilirse, o gruba ait TÜM lokasyonlar (alt bölgeler dahil; show_in_
     filter=false olsalar bile) sonuçlara katılır. Alt bölge tek
     seçilirse (İslamlar) yalnız kendisi gelir.

     - URL DEĞİŞMEZ: kullanıcı yine `?bolgeler=kalkan` görür; genişletme
       sadece DB `location_id IN (...)` setine uygulanır.
     - regionOptions = getCachedVillaLocations (TAM liste) → gizli alt
       bölge id'leri de bulunur.
     - sidebarInitial / heroPills hâlâ `regions` (seçim) kullanır;
       genişletilmiş set yalnız bu query filtresine özeldir. */
  const expandedRegions = (() => {
    if (regions.length === 0) return regions;
    const byId = new Map(regionOptions.map((o) => [o.id, o]));
    const out = new Set<string>();
    for (const id of regions) {
      const loc = byId.get(id);
      const group = (loc?.filter_group_name || "").trim();
      const isGroupRoot = !!loc && !!group && loc.name === group;
      if (isGroupRoot) {
        for (const o of regionOptions) {
          if ((o.filter_group_name || "").trim() === group) out.add(o.id);
        }
      } else {
        out.add(id);
      }
    }
    return Array.from(out);
  })();

  /* Adım 1 — villa listesi.
     Taxonomy opsiyonları (regions/categories) zaten yukarıda
     cached helper'larla çekildi (slug resolver için lazımdı).
     Villa query: filter-dependent, cache'lenmez (her URL kombinasyonu
     için ayrı sonuç).
     Availability helper bunun ardından çağrılır çünkü artık
     `villaIds` argümanıyla kısa-liste'ye scope ediyor.

     🛡️ FAZ 35 — Review stats batch paralel fetch: tek SQL ile
     tüm villa yorumlarının aggregate'i. main villa query ile
     Promise.all → ek RTT yok (net latency = max of two). */
  /* 🛡️ PERF (O1) — kur haritası YALNIZ fiyat sıralamasında okunur.
     `rates` bu gövdede yalnız iki yerde kullanılır: `needsStayTotalSort`
     dalındaki `calculateGrandTotal` (yalnız price-asc/desc) ve
     `applyPublicSort`'un `priceOpts`'u (yalnız price-asc/desc'te okunur —
     lib/pagination.ts priceKey). smart/capacity'de değer HİÇBİR çıktıya
     ulaşmaz → sorgu atlanır; boş harita, servisin hata dalıyla AYNI şekil.
     Kart fiyat gösterimi client kurlarıyla yapılır; bu değerden bağımsız.

     🛡️ PERF (O2) — kur okuması villa/müsaitlik akışının HİÇBİR çıktısına
     bağlı değildir → villa sorgusuyla EŞZAMANLI başlatılır; değer ESKİSİ
     GİBİ sıralamadan hemen önce (aşağıda, `cookies()` ile birlikte) await
     edilir. Değer, argüman ve kullanım noktası DEĞİŞMEDİ; yalnız başlama
     anı erkene alındı. `.catch` yan-dalı: aradaki bir await hata fırlatıp
     sayfa bu promise'e hiç ulaşmazsa "unhandled rejection" oluşmasın diye
     (asıl await hatayı ESKİSİ GİBİ görür; servis zaten reject etmez). */
  const sort: PublicSort = parsePublicSort(sp.sort);
  const isPriceSort = sort === "price-asc" || sort === "price-desc";
  const ratesMapPromise: Promise<ExchangeRatesMap> = isPriceSort
    ? getExchangeRatesMap()
    : Promise.resolve({ rates: {}, updatedAt: null });
  ratesMapPromise.catch(() => undefined);

  const [villaRes, reviewStatsMap] = await Promise.all([
    villaAdminRepository.findSearchResults({
      /* Tip + özellik kesişimi. Repository imzası/SQL'i DEĞİŞMEDİ. */
      categoryVillaIds: matchVillaIds,
      expandedRegions,
      guests,
    }),
    getVillaReviewStatsBatch(),
  ]);
  const { data: villasRaw, error } = villaRes;

  /* 🛡️ Error TUTUMU (UX FIX):
     Gerçek query exception (eski sağlayıcı/network/runtime) tek başına
     **layout'u parçalamaz**. Daha önce buradaki `return <section>...`
     full-page error full sayfayı kaplıyor ve sidebar tamamen
     kayboluyordu → kullanıcı filtreyi değiştiremiyordu. Şimdi
     hata sadece **sağ kolonda** ErrorState olarak gösteriliyor;
     sol sidebar her zaman mounted kalıyor.

     "0 sonuç" ile "query failed" KESİNLİKLE ayrı state'ler:
       - queryFailed === true  → exception → ErrorState (sağda)
       - queryFailed === false && total === 0 → EmptyState (sağda)
       - queryFailed === false && total > 0 → villa grid (sağda)
  */
  const queryFailed = !!error;
  if (queryFailed) {
    console.error("[arama] villa query error:", error?.message);
  }

  /* ===============================================================
     NORMALIZE — JOIN sonrası raw rows'u VillaCard prop shape'ine
     dönüştür. Aynı sort kuralı `mapVilla` ile birebir aynı:
       1) is_cover === true önce
       2) sonra sort_order artan
     `villa.location` JOIN'le artık `{ name }` objesi → name'i çek.
     Boş/null image_url'leri filter et.
     =============================================================== */
  /* forceEmpty = categoryFilter eşleşmesi sıfır → main query'yi
     hiç koşturmadık; sonuç boş kabul edilir.
     queryFailed = exception → sonuç boş; ErrorState gösterilecek. */

  /* AramaVillaRaw: eski sağlayıcı embed select sonucunda dönen shape'in
     minimum tip karşılığı. v2.105+ embed inference gevşek olduğu için
     explicit local type ile narrow ediliyor. */
  type AramaVillaRaw = {
    id: string;
    slug: string | null;
    title: string | null;
    price: number | null;
    currency: string | null;
    badge: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    guests: number | null;
    /* 🛡️ Cleaning fee fields (villa kolonları — select("*") ile geliyor).
       calculateGrandTotal `cleaning_fee + cleaning_currency + cleaning_limit`
       parametrelerine map'lenir. VillaDetail/BookingSidebar/reservation
       create ile aynı semantic. */
    cleaning_fee: number | null;
    cleaning_currency: string | null;
    cleaning_limit: number | null;
    location: { name: string } | null;
    villa_images: Array<{
      image_url: string | null;
      is_cover: boolean | null;
      sort_order: number | null;
    }> | null;
    /* 🛡️ villa_prices — calculateStayTotal için tarih-bazlı
       günlük fiyat aralıkları. price.engine ile birebir aynı semantic
       (VillaDetail/BookingSidebar/reservation create ile aynı).
       Tarih seçilmeyen kullanıcılar için kullanılmaz (eski davranış). */
    villa_prices: Array<{
      price: number | null;
      currency: string | null;
      start_date: string | null;
      end_date: string | null;
    }> | null;
    /* 🛡️ villa_discounts — villa detay (`getVillaDiscounts`) ile AYNI
       kayıtlar. `calculateGrandTotal`'ın ZATEN var olan opsiyonel
       `discounts` parametresine geçirilir; fiyat motoru DEĞİŞMEDİ.
       Tarih seçilmeyen kullanıcılar için kullanılmaz (eski davranış). */
    villa_discounts: Array<{
      start_date: string | null;
      end_date: string | null;
      discount_type: string | null;
      discount_value: number | null;
      currency: string | null;
    }> | null;
  };
  type StayPrice = {
    price: number;
    currency: string;
    start_date: string;
    end_date: string;
  };
  type AramaVillaNormalized = {
    id: string;
    slug: string | null;
    title: string | null;
    location: string;
    price: number | null;
    currency: string | null;
    images: string[];
    badge: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    guests: number | null;
    /** Tarih-bazlı fiyat aralıkları — VillaCard client-side
     *  calculateGrandTotal için kullanır. Tarih yoksa görmezden gelinir. */
    prices: StayPrice[];
    /** 🛡️ Aktif indirim aralıkları — `calculateGrandTotal`'ın MEVCUT
     *  opsiyonel `discounts` parametresine geçer. Boş dizi = "indirim
     *  yok" (getActiveDiscount boş diziyi zaten null sayar) → eski
     *  davranış birebir korunur. */
    discounts: DiscountRange[];
    /** Temizlik ücreti (orijinal currency) — calculateGrandTotal ile
     *  birlikte stayTotal'a eklenir. cleaning_limit > nights ise
     *  ücret muaftır (price.engine semantic). */
    cleaning_fee: number;
    cleaning_currency: string;
    cleaning_limit: number;
    /* 🛡️ FAZ 35 — Review aggregate (card UI trust meta).
     *  reviewStatsMap'ten merge; count===0 → undefined kalır. */
    review_average?: number;
    review_count?: number;
    /* 🛡️ STAY-TOTAL SORT OVERRIDE — yalnız hasDateRange + price-asc/desc
     *  durumunda set edilir. calculateGrandTotal().total (user currency
     *  total). VillaCard prop'larına AKMAZ; sadece applyPublicSort
     *  priceKey shortcut'ı için. */
    _sortPrice?: number | null;
    /** 🛡️ ADDITIVE — esnek EK sonuç işareti (yalnız UI). Normal
     *  villalarda undefined/false → mevcut kart davranışı birebir.
     *  Ana tarih/fiyat/href AKIŞI DEĞİŞMEZ; VillaCard yalnız fiyat
     *  yerine "±3 gün içinde müsait" gösterir. */
    isFlexible?: boolean;
  };

  const villasSource: AramaVillaRaw[] =
    queryFailed || forceEmpty
      ? []
      : ((villasRaw || []) as unknown as AramaVillaRaw[]);

  type VillaImageEmbed = {
    image_url: string | null;
    is_cover: boolean | null;
    sort_order: number | null;
  };

  const villas: AramaVillaNormalized[] = villasSource.map((v) => {
    let images: string[] = [];
    const raw: VillaImageEmbed[] = Array.isArray(v.villa_images)
      ? v.villa_images
      : [];
    if (raw.length > 0) {
      const sorted = [...raw].sort((a, b) => {
        if (a?.is_cover) return -1;
        if (b?.is_cover) return 1;
        return (a?.sort_order ?? 0) - (b?.sort_order ?? 0);
      });
      /* 🛡️ Bucket-fix — resolveVillaImageUrl: villa-images bucket'ından
         URL üretir; legacy FULL URL pass-through, Phase B path → URL. */
      images = sorted
        .map((i) => resolveVillaImageUrl(i?.image_url))
        .filter(
          (u): u is string =>
            typeof u === "string" && u.trim().length > 0
        );
    }

    const locName =
      v?.location && typeof v.location === "object" && "name" in v.location
        ? String(v.location.name || "")
        : "";

    /* Tarih-bazlı fiyatlar — null alanları filtrele, VillaCard'ın
       beklediği StayPrice shape'ine narrow et. Sıralama önemli değil
       (price.engine her tarih için kapsayıcı aralığı find ediyor). */
    const rawPrices = Array.isArray(v.villa_prices) ? v.villa_prices : [];
    const prices: StayPrice[] = rawPrices
      .filter(
        (p): p is {
          price: number | null;
          currency: string | null;
          start_date: string;
          end_date: string;
        } =>
          !!p &&
          typeof p.start_date === "string" &&
          typeof p.end_date === "string" &&
          p.start_date.length > 0 &&
          p.end_date.length > 0
      )
      .map((p) => ({
        price: Number(p.price || 0),
        currency: p.currency || "TRY",
        start_date: p.start_date,
        end_date: p.end_date,
      }));

    /* 🛡️ FAZ 35 — review aggregate merge (approved-only).
       reviewStatsMap tek SQL'den geldi; lookup O(1). count===0 ise
       undefined kalır → VillaCard meta satırını render etmez. */
    const stats = reviewStatsMap[String(v.id)];
    const hasReviews = !!stats && stats.count > 0;

    /* 🛡️ STARTING PRICE — listing kart "gecelik başlangıç" gösterimi.
       DAİMA villa_prices içindeki MIN nightly (getStartingPrice); artık
       `villa.price` kolonu ÖNCELENMEZ → mapVilla (homepage/kategori/bölge)
       ile birebir aynı minimum fiyat semantiği. Date search VAR iken caller
       stayStart/stayEnd/prices üçlüsünü ayrıca pass eder; VillaCard
       `calculateGrandTotal` ile total hesaplar — bu değerin etkisi YOK.
       Conversion VillaCard seviyesinde convertPrice(...) ile yapılır. */
    /* 🛡️ İNDİRİMLER — `app/services/villa-discount.service.ts`'teki
       `getVillaDiscounts` map'i ile BİREBİR aynı normalizasyon
       (start/end zorunlu string, discount_value Number()||0, currency
       aynen). Yeni bir indirim mantığı YOK; yalnız motorun beklediği
       `DiscountRange[]` şekline daraltma. Geçersiz/eksik satır elenir
       → dizi boş kalırsa davranış eskisiyle birebir aynı. */
    const rawDiscounts = Array.isArray(v.villa_discounts)
      ? v.villa_discounts
      : [];
    const discounts: DiscountRange[] = rawDiscounts
      .filter(
        (d): d is {
          start_date: string;
          end_date: string;
          discount_type: "percent" | "fixed";
          discount_value: number | null;
          currency: string | null;
        } =>
          !!d &&
          typeof d.start_date === "string" &&
          d.start_date.length > 0 &&
          typeof d.end_date === "string" &&
          d.end_date.length > 0 &&
          (d.discount_type === "percent" || d.discount_type === "fixed")
      )
      .map((d) => ({
        start_date: d.start_date,
        end_date: d.end_date,
        discount_type: d.discount_type,
        discount_value: Number(d.discount_value) || 0,
        currency: d.currency,
      }));

    const startingFallback = getStartingPrice(prices);
    const villaPrice: number | null = startingFallback?.price ?? null;
    const villaCurrency: string | null =
      startingFallback?.currency ?? v.currency ?? null;

    return {
      id: v.id,
      slug: v.slug,
      title: v.title,
      location: locName,
      price: villaPrice,
      currency: villaCurrency,
      images,
      badge: v.badge,
      bedrooms: v.bedrooms,
      bathrooms: v.bathrooms,
      guests: v.guests,
      prices,
      discounts,
      cleaning_fee: Number(v.cleaning_fee || 0),
      cleaning_currency: v.cleaning_currency || "TRY",
      cleaning_limit: Number(v.cleaning_limit || 0),
      review_average: hasReviews ? stats!.average : undefined,
      review_count: hasReviews ? stats!.count : undefined,
    };
  });

  /* ===============================================================
     🛡️ AVAILABILITY FILTER — UNIFIED SEMANTIC
     ===============================================================
     Adım 2: artık elimizde candidate villa listesi var
     (region/guest filtrelenmiş). Helper'a SADECE bu villaların
     ID'lerini geçiyoruz → reservations + manual_reservations
     iki tablosunda da `.in("villa_id", ...)` ile scope eklenir.

     Faydaları:
       1) RLS parity: calendar `.eq("villa_id", id)` ile çalışıyor;
          helper artık `.in("villa_id", [ids])` ile aynı erişim
          desenini kullanıyor → manual_reservations'a anon erişim
          farklı davranıyorsa (RLS policy filtered SELECT'i kabul
          ederken global'i etmiyorsa) bu nokta'da semantic drift
          eliminate olur.
       2) Performans: blocked check sadece görünür adaylar için;
          binlerce eski reservation/manual_blok row'u taranmaz.
       3) Half-open [) ve status allow-list helper'da byte-identical
          korunur — sadece scope eklendi, predicate dokunulmadı.

     hasDateRange false ise helper hiç çağrılmaz; visible = all.
     =============================================================== */
  const candidateIds = villas.map((v) => String(v.id)).filter(Boolean);
  const blockedSet = hasDateRange
    ? await getBlockedVillaIds(start, end, candidateIds)
    : new Set<string>();

  /* 🛡️ FİYAT KAPSAMI — tarihli aramada, seçilen aralığın TÜM
     konaklama gecelerinde fiyatı olmayan villa (hiç fiyat yok, eksik
     gece, 0/NULL fiyat) listelenmez; rezervasyon zaten reddederdi.
     Ölçüt fiyat motorunun MEVCUT `priceAvailable`'ı (booking/price-verify
     ile aynı). Kapsam `daily.original > 0` ile ölçülür → kur/indirimden
     bağımsız; TRY + {TRY:1} yalnız zorunlu parametre. Tarihsiz arama ve
     esnek havuz (`villas` + `blockedSet`) etkilenmez. */
  const visibleVillas: AramaVillaNormalized[] = hasDateRange
    ? villas.filter(
        (v) =>
          !blockedSet.has(String(v.id)) &&
          calculateGrandTotal({
            start: start!,
            end: end!,
            prices: v.prices,
            currency: "TRY",
            rates: { TRY: 1 },
            discounts: v.discounts,
          }).priceAvailable
      )
    : villas;

  const total = visibleVillas.length;

  /* ===============================================================
     🛡️ GELİŞMİŞ ARAMA — ±N gün ESNEK EK SONUÇ (ADDITIVE)
     ===============================================================
     INVARIANT: ana start/end HER YERDE (URL/kart/fiyat/detay/rezervasyon)
     SABİT kalır. Kaydırılmış pencereler YALNIZ internal availability
     tespiti içindir; karta/URL/fiyat/rezervasyona ASLA yazılmaz. Mevcut
     `getBlockedVillaIds` helper'ı N kez yeniden kullanılır — yeni
     algoritma / backend / RPC YOK.

     Aday havuzu = ana tarihte DOLU villalar (normal sonuçta olmayanlar →
     DUPLICATE imkânsız). Bir aday, ±N içindeki kaydırılmış bir pencerede
     (süre sabit) ≥1 kez müsaitse `isFlexible` olarak işaretlenip normal
     listenin SONUNA eklenir. `flexible` yok/0 → blok hiç çalışmaz →
     davranış birebir mevcut (byte-identical). */
  const flexRaw = firstString(sp.flexible);
  const flexDays = Math.min(
    3,
    Math.max(0, Math.trunc(Number(flexRaw || 0)) || 0)
  );
  const flexActive = flexDays > 0 && hasDateRange;

  let flexibleVillas: AramaVillaNormalized[] = [];
  if (flexActive) {
    const flexPool = villas.filter((v) => blockedSet.has(String(v.id)));
    const poolIds = flexPool.map((v) => String(v.id));
    if (poolIds.length > 0) {
      const shifts = [-3, -2, -1, 1, 2, 3].filter(
        (s) => Math.abs(s) <= flexDays
      );
      const windows = shifts
        .map((s) => ({ s: shiftYmd(start!, s), e: shiftYmd(end!, s) }))
        .filter((w) => w.s < w.e);
      const blockedSets = await Promise.all(
        windows.map((w) => getBlockedVillaIds(w.s, w.e, poolIds))
      );
      const availableInAny = new Set<string>();
      for (const id of poolIds) {
        if (blockedSets.some((bs) => !bs.has(id))) availableInAny.add(id);
      }
      flexibleVillas = flexPool
        .filter((v) => availableInAny.has(String(v.id)))
        .map((v) => ({ ...v, isFlexible: true }));
    }
  }

  /* 🛡️ SCALE HARDENING — pagination. `?page=N` + `?pageSize=M`
     searchParams. Filter + availability semantic'i AYNEN; sadece
     görünür dilim `villasOnPage` değişir. SEO `ItemList` da yine
     SADECE bu sayfanın entry'lerini yayınlar (Google paginated
     pages için sayfa-başı ItemList önerir).

     PAGE SIZE — public allow-list [12,30,50,100]; default 12.
     pageSize URL state'inde tutulur; default URL'e yazılmaz
     (clean URL). Helpers: lib/pagination.ts. */
  const pageSize = parsePublicPageSize(sp.pageSize);
  const pageRaw = parsePublicPage(sp.page);

  /* 🛡️ SORT — URL state ile JS-side post-filter sıralama.
     `smart` (default) → mevcut DB order (sort_order ASC, created_at
     DESC) AYNEN korunur (applyPublicSort smart için no-op).
     Diğer modlar yeni array döndürür (input mutate edilmez).
     Sıralama AVAILABILITY filtresinden SONRA + SLICE'tan ÖNCE
     uygulanır → pagination ve toplam doğru. Repository/service/
     cache/availability'e SIFIR dokunma.

     🛡️ CURRENCY-AWARE PRICE SORT — kullanıcının seçtiği para
     birimine göre normalize:
       1) cookie'den `currency` oku (CurrencyContext dual-write).
          Yoksa "TRY" varsayılır (ilk ziyaret graceful fallback).
       2) DB'den exchange_rates'i oku (server-side `getExchangeRatesMap`).
       3) applyPublicSort'a {userCurrency, rates} geçir; convertPrice
          VillaCard'la AYNI formül ve AYNI rates → gösterilen
          ekonomik değer === sıralama anahtarı.
     Capacity/smart sıralarda priceOpts kullanılmaz → ek maliyet 0. */
  /* `sort` + kur haritası promise'i yukarıda (O1/O2 — villa sorgusundan
     önce) kurulur; burada AYNI noktada await edilir. */
  const [cookieStore, ratesMap] = await Promise.all([
    cookies(),
    ratesMapPromise,
  ]);
  const userCurrency =
    cookieStore.get("currency")?.value || "TRY";
  const rates: Record<string, number> = {
    TRY: 1,
    USD: Number(ratesMap.rates.USD) || 0,
    EUR: Number(ratesMap.rates.EUR) || 0,
    GBP: Number(ratesMap.rates.GBP) || 0,
  };

  /* 🛡️ STAY-TOTAL OVERRIDE — tarihli durumda fiyat sıralaması.
     KOŞUL: hasDateRange === true && sort price-asc|price-desc.
     Diğer durumlarda hesap atlanır (smart/capacity sıralama veya
     tarihsiz arama).

     EKONOMİK ANAHTAR:
       VillaCard.tsx tarihli durumda gösterilen değer:
         result.total = calculateGrandTotal({ ... }).total
       (stay + cleaning, user currency'sinde; cleaning_limit muafiyeti
       dahil). Buraya aynı imza + aynı parametreler verilir →
       sort key === kartta gösterilen sayı (matematiksel garanti).

     EDGE CASE:
       - calculateNights(start, end) <= 0 → _sortPrice = null (end-of-list)
       - prices boş veya .total <= 0 → _sortPrice = null
       - rates eksik → calculateGrandTotal kendi içinde resolveRate
         fallback ile graceful; kart da aynı fallback'i kullandığı için
         tutarlı.

     PERFORMANS:
       - Yalnız visible villa sayısı × pure JS loop (~ms)
       - DB/Cache çağrısı yok; salt hesap
       - Tarihsiz veya capacity sort'ta sıfır maliyet (erken atlama). */
  const needsStayTotalSort =
    hasDateRange && (sort === "price-asc" || sort === "price-desc");

  let sortInput: AramaVillaNormalized[] = visibleVillas;
  if (needsStayTotalSort) {
    const nightsCheck = calculateNights(start!, end!);
    if (nightsCheck > 0) {
      sortInput = visibleVillas.map((v) => {
        if (!Array.isArray(v.prices) || v.prices.length === 0) {
          return { ...v, _sortPrice: null };
        }
        const result = calculateGrandTotal({
          start: start!,
          end: end!,
          prices: v.prices,
          currency: userCurrency,
          rates,
          cleaning_fee: v.cleaning_fee,
          cleaning_currency: v.cleaning_currency,
          cleaning_limit: v.cleaning_limit,
          /* 🛡️ Kartta gösterilen sayı ile sort anahtarının AYNI olması
             bu dosyanın belgelenmiş invariant'ı — kart artık indirimli
             toplamı gösterdiği için anahtar da aynı `discounts` ile
             hesaplanır. Aksi halde "fiyata göre sırala" gösterilenden
             farklı bir sayıya göre sıralardı. */
          discounts: v.discounts,
        });
        const total =
          typeof result.total === "number" &&
          Number.isFinite(result.total) &&
          result.total > 0
            ? result.total
            : null;
        return { ...v, _sortPrice: total };
      });
    }
  }

  const sortedVillas = applyPublicSort(sortInput, sort, {
    userCurrency,
    rates,
  });

  /* 🛡️ NORMAL sonuçlar KENDİ sort + pagination'ında (eski davranış
     BYTE-IDENTICAL). Esnek sonuçlar bu listeye/sort'a/pagination'a
     GİRMEZ → normal villaların arasına karışmaz; ayrı bölümde altta.
     `total` = yalnız normal sayı; flexible bunu DEĞİŞTİRMEZ. */
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, pageRaw), totalPages);
  const sliceStart = (currentPage - 1) * pageSize;
  const villasOnPage = sortedVillas.slice(sliceStart, sliceStart + pageSize);

  /* 🛡️ Kart rozeti (villa_translations.badge) TEK batch sorguda
     çözülür — `VillaList` / `DiscountCollection` ile AYNI desen,
     N+1 YOK. TR'de sorgu HİÇ atılmaz → TR çıktısı ve maliyeti
     BİREBİR eskisi gibi. Çeviri yoksa canonical rozet gösterilir. */
  const badgeByVillaId = await getVillaBadgesByLocale(
    [...villasOnPage, ...flexibleVillas].map((v) => v.id),
    locale
  );

  /* Esnek sonuç sayısı (banner ikinci satır + bölüm başlığı için).
     Normal `total` sayısını ETKİLEMEZ; 114+70 gibi toplam gösterilmez. */
  const flexibleCount = flexibleVillas.length;

  /* 🛡️ SEO structured data — BreadcrumbList + ItemList.
     Listede en az 1 villa varsa ItemList yayınlanır (boş listede
     anlamlı değil). */
  const breadcrumbLd = buildBreadcrumb(
    [
      { name: dict.breadcrumbHome, url: "/" },
      { name: dict.breadcrumbVillas },
    ],
    /* TR'de `undefined` → JSON-LD çıktısı Phase 13 öncesiyle
       BYTE-IDENTICAL (bkz. buildBreadcrumb, Phase 7D). */
    locale === DEFAULT_LOCALE ? undefined : locale
  );
  const itemListLd =
    total > 0
      ? buildItemList(
          villasOnPage.map((v) => ({
            slug: String(v.slug || ""),
            title: String(v.title || ""),
            image: Array.isArray(v.images) ? v.images[0] : undefined,
          }))
        )
      : null;

  /* ===============================================================
     🛡️ VİLLA TİPİ ADI — SIDEBAR GÖRÜNÜMÜ İÇİN LOCALE-AWARE
     ===============================================================
     `loadHeroFilters` ile BİREBİR AYNI desen:
       • locale === "tr" → çeviri sorgusu HİÇ atılmaz; TR davranışı
         ve sorgu sayısı BİREBİR eskisi gibi.
       • EN/DE → `getVillaTypeNamesByLocale` (TEK batch `.in()`
         sorgusu, N+1 YOK) + `resolveTaxonomyName` (çeviri yoksa
         canonical TR adına düşer). Hata → `{}` → TR fallback.

     ⚠️ YALNIZ GÖRÜNEN `name` değişir. Canonical `categoryOptions`
     dizisine DOKUNULMAZ — `resolveTokens` (slug→id), URL token
     üretimi, `.in("type_id", …)` filtresi, sıralama ve seçim
     davranışı DEĞİŞMEZ; sidebar'a ayrı bir kopya geçer.
     ⚠️ BÖLGELER çevrilmez (Phase 10I: özel isim → canonical).
     =============================================================== */
  let sidebarCategoryOptions = categoryOptions;
  if (locale !== DEFAULT_LOCALE && categoryOptions.length > 0) {
    /* O3 — promise yukarıda AYNI koşul + AYNI argümanla başlatıldı. */
    const typeNameByLocale: Record<string, TaxonomyNameByLocale> =
      (await typeNamesPromise) ?? {};
    sidebarCategoryOptions = categoryOptions.map((t) => ({
      ...t,
      name: resolveTaxonomyName(
        t.name,
        typeNameByLocale[String(t.id)],
        locale
      ),
    }));
  }

  /* O4 — sidebar'ın özellik listesi render'dan ÖNCE hazır (aynı promise). */
  const featureOptions = await featureOptionsPromise;

  /* Sidebar initial state — server'dan client'a tek seferde geçer.
     Çocuk Sayısı UI breakdown'u client'ta yapılır (URL semantic'i
     `guests` tek bir toplamı tutar — yeni source yaratılmaz). */
  const sidebarInitial = {
    regions,
    categories,
    /* `start`/`end` doğrulanmış değerler; raw URL string olabilir
       ama isValidYmd geçtikten sonra null'a düşer (geçerli olmayan
       tarih sidebar'a aktarılmaz → kırık state oluşmaz). */
    start,
    end,
    guests,
    /* 🛡️ Sidebar "Gelişmiş Arama" checkbox'ı için — URL'de flexible>0 mı.
       Hero ile AYNI `flexible=3`; checkbox otomatik CHECKED gelir. */
    flexible: flexDays > 0,
    /* 🛡️ Hero'dan gelen `ozellikler` seçimi sidebar'da SEÇİLİ görünsün.
       Resolve edilmiş (geçersiz token'ları düşürülmüş) UUID listesi —
       URL kontratı ve AND filtresi ile BİREBİR aynı küme. */
    features: featureIds,
  };

  /* 🛡️ PageHero pill etiketleri — eski filter chip'lerinin birebir
     karşılığı (kategori/bölge/koleksiyon + tarih + kişi). */
  const heroPills: string[] = [];
  if (regions.length > 0)
    heroPills.push(
      formatDictionaryString(dict.pillRegions, { n: regions.length })
    );
  if (categories.length > 0)
    heroPills.push(
      formatDictionaryString(dict.pillTypes, { n: categories.length })
    );
  if (guests)
    heroPills.push(formatDictionaryString(dict.pillGuests, { n: guests }));
  if (start) heroPills.push(end ? `${start} → ${end}` : start);

  return (
    <>
      {/* 🛡️ KOMPAKT EDITORIAL HERO — eski dev başlık bloğu yerine
         PageHero. Breadcrumb/başlık/SEO KORUNDU; sadece UI. */}
      <PageHero
        breadcrumb={[
          { name: dict.breadcrumbHome, href: localeHref("/", locale) },
          { name: dict.breadcrumbVillas },
        ]}
        eyebrow={dict.heroEyebrow}
        title={
          <>
            {total > 0 ? (
              <>
                <span className="tabular-nums">{total}</span>{" "}
                {dict.heroTitleFound}
              </>
            ) : flexActive && flexibleCount > 0 ? (
              /* Edge case: 0 normal ama esnek sonuç var → normal sayıyı
                 gizleme, "0 ... bulundu" göster (esnek satırı altında). */
              <>
                <span className="tabular-nums">0</span>{" "}
                {dict.heroTitleFound}
              </>
            ) : (
              <>
                {dict.heroTitleIdleLead}{" "}
                <span className="text-[var(--color-stone-400)]">
                  {dict.heroTitleIdleAccent}
                </span>
              </>
            )}
            {/* 🛡️ İKİNCİ SAYI — yalnız esnek sonuç varken; normal count'a
                EKLENMEZ (114+70 toplam YOK). Dinamik flexibleCount.
                Renk: proje token'ları (--brand-coral / champagne) turkuaz
                olduğu ve hero görseline karıştığı için SICAK AMBER pill:
                koyu yarı-saydam zemin + backdrop-blur + amber ring/metin →
                hero'nun her tonunda okunur. Ana başlıktan belirgin küçük;
                ikincil bilgi. Layout shift yok (title akışında). */}
            {flexActive && flexibleCount > 0 && (
              <span className="mt-3 mx-auto flex w-fit max-w-full items-center gap-2 rounded-full bg-[#1a1206]/55 px-3.5 py-1.5 ring-1 ring-[#f59e0b]/45 backdrop-blur-md shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]">
                <Sparkles
                  size={15}
                  strokeWidth={2}
                  className="shrink-0 text-[#fbbf24]"
                  aria-hidden
                />
                <span className="text-[13px] md:text-[15px] font-semibold tracking-normal text-[#ffe0b3] whitespace-normal">
                  <span className="tabular-nums text-white">
                    {flexibleCount}
                  </span>{" "}
                  {dict.heroFlexibleFound}
                </span>
              </span>
            )}
          </>
        }
        pills={heroPills}
      />

      <section className="px-5 md:px-10 lg:px-16 pt-8 md:pt-12 pb-24 md:pb-32">
        {/* 🛡️ LAYOUT WIDTH — 1480 cap (1728+ ekranda yan boşluk kontrolü). */}
        <div className="site-container">
          <JsonLd data={breadcrumbLd} />
          {itemListLd ? <JsonLd data={itemListLd} /> : null}

          {/* =======================================================
            2-COL LAYOUT — sidebar + results
            🛡️ GRID OVERFLOW HARDENING:
              `1fr` track varsayılan `minmax(auto, 1fr)`'dir; alt
              içeriğin (villa kartları, uzun başlıklar) min-content'i
              track'i 1fr sınırının üstüne çıkarıp sağda
              "dev beyaz alan" / horizontal scroll yaratabiliyordu.
              `minmax(0, 1fr)` ile track 0'a kadar küçülebilir →
              sidebar 260/300px sabit kalır, kalan alanı sonuç
              kolonu doğal doldurur. Davranış değişmedi; sadece
              overflow vektörü kapatıldı. Mobil tek-kolon track'inde
              etki yok.
            ======================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[300px_1fr] gap-x-8 lg:gap-x-12">
          {/* SIDEBAR — client island (URL = source-of-truth) */}
          <FilterSidebar
            regionOptions={regionOptions}
            categoryOptions={sidebarCategoryOptions}
            /* 🛡️ Locale'e göre çözülmüş adlar `loadHeroFeatures` içinde
               hazır gelir (Hero ile AYNI helper) → sidebar'a TEK SEFER
               prop olarak geçer; client'ta sorgu YOK. */
            featureOptions={featureOptions}
            initial={sidebarInitial}
            resultCount={total}
            /* 🛡️ PHASE 13 — locale + hedef path. `mode` default
               "search"; `/kiralik-villalar`'ın mode="redirect"
               davranışı ETKİLENMEZ. */
            locale={locale}
            basePath={basePath}
          />

          {/* =====================================================
              RESULTS COLUMN — 3 state'li branching:
                1) queryFailed → ErrorState (gerçek exception)
                2) total === 0 → EmptyState (normal UX state)
                3) total > 0  → villa grid
              Her durumda sol sidebar mounted kalır; layout asla
              collapse olmaz, kullanıcı filtreleri değiştirebilir.

              🛡️ min-w-0: parent grid `minmax(0,1fr)` ile koruma var
              ama bu wrapper'a da defansif eklendi — iç içe grid
              (kart grid'i) içeriği track'i şişirmesin.
              ===================================================== */}
          <div className="min-w-0">
            {queryFailed ? (
              /* GERÇEK EXCEPTION — eski sağlayıcı/network/runtime hatası.
                 Sadece bu durumda "Arama yüklenemedi" mesajı çıkar.
                 Sidebar dokunulmaz; sağda kart gibi premium error. */
              <div className="rounded-2xl border border-[var(--color-stone-100)] bg-white px-6 py-16 md:px-10 md:py-20 text-center max-w-xl mx-auto">
                <p className="text-[11px] tracking-[0.24em] uppercase font-medium text-[var(--color-stone-500)]">
                  <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
                  {dict.errorEyebrow}
                </p>
                <h2 className="font-display text-[32px] md:text-[44px] text-[var(--color-stone-900)] mt-4 tracking-[-0.025em] leading-[1.05]">
                  {dict.errorTitle}
                </h2>
                <p className="text-[var(--color-stone-500)] mt-4 leading-relaxed text-[14.5px]">
                  {dict.errorBody}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
                  <a
                    href={basePath}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-stone-900)] text-white text-[13px] font-medium tracking-[0.04em] hover:bg-[var(--color-stone-700)] transition-colors motion-reduce:transition-none"
                  >
                    {dict.errorRetry}
                  </a>
                  <a
                    href={localeHref("/kiralik-villalar", locale)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--color-stone-200)] text-[13px] font-medium text-[var(--color-stone-700)] hover:border-[var(--color-stone-300)] hover:text-[var(--color-stone-900)] transition-colors motion-reduce:transition-none"
                  >
                    {dict.showAllVillas}
                  </a>
                </div>
              </div>
            ) : total === 0 && flexibleCount === 0 ? (
              /* 🛡️ EMPTY = ne normal ne esnek sonuç var. flexOff'ta
                 flexibleCount=0 → `total === 0` → BYTE-IDENTICAL eski
                 davranış. Esnek sonuç varsa (total=0 olsa bile) boş state
                 GÖSTERİLMEZ; aşağıdaki esnek bölüm devreye girer. */
              /* EMPTY STATE — normal UX. throw / notFound YOK.
                 Sidebar yanında yumuşak boş state; champagne/stone
                 design system ile birebir uyumlu. */
              <div className="px-2 md:px-6">
                <div className="rounded-2xl border border-[var(--color-stone-100)] bg-white/60 backdrop-blur-[2px] px-6 py-16 md:px-12 md:py-24 max-w-2xl mx-auto">
                  <div className="flex flex-col items-center text-center">
                    {/* Muted subtle icon — emoji YOK */}
                    <div className="w-14 h-14 rounded-full bg-[var(--color-sand-50)] border border-[var(--color-stone-100)] flex items-center justify-center">
                      <Search
                        size={18}
                        className="text-[var(--color-stone-500)]"
                      />
                    </div>

                    <p className="mt-7 text-[11px] tracking-[0.24em] uppercase font-medium text-[var(--color-stone-500)]">
                      <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
                      {dict.emptyEyebrow}
                    </p>

                    <h2 className="font-display text-[34px] md:text-[48px] lg:text-[56px] text-[var(--color-stone-900)] mt-4 tracking-[-0.03em] leading-[1.02]">
                      {dict.emptyTitleLead}
                      <br />
                      <span className="text-[var(--color-stone-400)]">
                        {dict.emptyTitleAccent}
                      </span>
                    </h2>

                    <p className="text-[var(--color-stone-500)] mt-6 leading-relaxed text-[14.5px] md:text-[15.5px] max-w-md">
                      {dict.emptyBody}
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-3 mt-10">
                      <a
                        href={basePath}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-stone-900)] text-white text-[13px] font-medium tracking-[0.04em] hover:bg-[var(--color-stone-700)] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
                      >
                        {dict.emptyClearFilters}
                      </a>
                      <a
                        href={localeHref("/kiralik-villalar", locale)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--color-stone-200)] text-[13px] font-medium text-[var(--color-stone-700)] hover:border-[var(--color-champagne-500)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
                      >
                        {dict.showAllVillas}
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* 🛡️ NORMAL SONUÇLAR — toolbar + grid + pagination yalnız
                    total>0 iken (byte-identical eski davranış). Esnek
                    sonuçlar bu bloğa GİRMEZ. */}
                {total > 0 && (
                <>
                {/* 🛡️ TOOLBAR — sort + page size selector (grid üstü).
                   Kart boyut/yerleşim/grid sınıfları DEĞİŞMEZ; sadece
                   üst kısımda küçük bir toolbar render edilir.
                   Mobile: yatay merkez, satır kırılırsa ortalı kalır
                     (flex-wrap + items-center + justify-center).
                   Desktop (md+): sağa yaslı, mevcut spacing (gap-6). */}
                <div className="mb-6 md:mb-8 flex flex-wrap items-center justify-center gap-3 md:justify-end md:gap-6">
                  <SortSelector
                    sp={sp}
                    sort={sort}
                    dict={dict}
                    basePath={basePath}
                  />
                  <PageSizeSelector
                    sp={sp}
                    pageSize={pageSize}
                    dict={dict}
                    basePath={basePath}
                  />
                </div>
                {/* 🛡️ Sort dropdown auto-close — <details> Link tıklandıktan
                   sonra navigation gerçekleşir ama browser native open
                   state'i DOM diff'inde korunduğu için açık kalıyordu.
                   Document-level event delegation ile menuitemradio
                   Link'ine tıklanan anda parent <details>.open=false.
                   Mevcut Link mimarisi, URL builder, sort logic ETKİLENMEZ.
                   id="public-sort-dropdown-close" → Script dedupe key
                   (her iki sayfada aynı id; ek bind oluşmaz). */}
                <Script
                  id="public-sort-dropdown-close"
                  strategy="afterInteractive"
                >
                  {SORT_DROPDOWN_CLOSE_SCRIPT}
                </Script>

                {/* 🛡️ KART GRID — sidebar-aware breakpoint düzeni.
                   Eski: sm:grid-cols-2 (640+) ile md viewport'ta (768)
                   sidebar 260px ortaya çıkınca sonuç kolonu ~396 px'e
                   düşüyor; 2 kart 186 px ile sıkışıyordu. Yeni:
                     mobile      → 1 kart (sidebar drawer)
                     sm 640+     → 2 kart (sidebar henüz yok)
                     md 768+     → 1 kart (sidebar açıldı, dar kolon)
                     lg 1024+    → 2 kart (300px sidebar + geniş)
                     xl 1280+    → 3 kart (premium)
                   Card visual'ı dokunulmadı; sadece grid sayısı. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-x-6 md:gap-x-8 gap-y-12 md:gap-y-16">
                  {/* 🛡️ SCALE HARDENING — `visibleVillas` yerine
                     `villasOnPage` (PAGE_SIZE dilim). Tüm filtreleme +
                     availability semantic'i aynen `visibleVillas`'da.
                     Yalnız client HTML 1 sayfa kart taşır. */}
                  {villasOnPage.map((villa, index) => (
                    <VillaCard
                      key={villa.id}
                      /* 🛡️ PHASE 13 — kart metinleri + detay linki
                         locale-aware (VillaCard mevcut `locale`
                         prop'u; default "tr" davranışı korunur). */
                      locale={locale}
                      /* 🛡️ FAZ 36 — favorites identity. */
                      id={villa.id}
                      slug={villa.slug ?? ""}
                      title={villa.title ?? ""}
                      location={villa.location}
                      price={villa.price ?? undefined}
                      currency={villa.currency || "TRY"}
                      images={villa.images}
                      badge={badgeByVillaId.get(villa.id) ?? villa.badge ?? undefined}
                      bedrooms={villa.bedrooms || 1}
                      bathrooms={villa.bathrooms || 1}
                      guests={villa.guests || 2}
                      /* 🛡️ Tarih varsa: VillaCard client-side
                         calculateGrandTotal çalıştırır → "Toplam X / N gece"
                         (stay + cleaning_fee dahil) gösterir.
                         Yoksa: bu prop'lar undefined kalır, eski
                         "gecelik" davranış aynen devam eder. */
                      /* 🛡️ Ana tarih (start/end) HER kart için sabit —
                         esnek villada da detailHref 20→25 taşır. Esnek
                         villada fiyat prop'ları bastırılır (fiyat motoru
                         çağrılmaz); VillaCard "±3 gün içinde müsait"
                         gösterir. Normal villalar birebir eski davranış. */
                      stayStart={hasDateRange ? start! : undefined}
                      stayEnd={hasDateRange ? end! : undefined}
                      prices={
                        hasDateRange && !villa.isFlexible
                          ? villa.prices
                          : undefined
                      }
                      /* 🛡️ İndirimler `prices` ile AYNI koşulda geçer:
                         tarih yoksa veya esnek sonuçta undefined →
                         calculateGrandTotal'ın `discounts` default'u
                         (null) devreye girer, davranış eskisiyle aynı. */
                      stayDiscounts={
                        hasDateRange && !villa.isFlexible
                          ? villa.discounts
                          : undefined
                      }
                      cleaningFee={
                        hasDateRange && !villa.isFlexible
                          ? villa.cleaning_fee
                          : undefined
                      }
                      cleaningCurrency={
                        hasDateRange && !villa.isFlexible
                          ? villa.cleaning_currency
                          : undefined
                      }
                      cleaningLimit={
                        hasDateRange && !villa.isFlexible
                          ? villa.cleaning_limit
                          : undefined
                      }
                      isFlexible={villa.isFlexible}
                      /* 🛡️ FAZ 35 — review trust meta (★ avg · count). */
                      reviewAverage={villa.review_average}
                      reviewCount={villa.review_count}
                      sizes={ARAMA_CARD_SIZES}
                      /* 🛡️ İlk kart = olası LCP → eager + high. Esnek
                         tarih bölümü (sayfa altı) lazy kalır. */
                      isLcp={index === 0}
                    />
                  ))}
                </div>

                {/* 🛡️ Numbered pagination — admin paterni: 1 ... 8 9 10 ... 42.
                   Diğer searchParams (categories/regions/guests/start/
                   end) + pageSize korunur; yalnız `page` güncellenir.
                   URL semantic ve SEO breadcrumb davranışı aynen. */}
                {totalPages > 1 && (
                  <PaginationNav
                    sp={sp}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    dict={dict}
                    basePath={basePath}
                  />
                )}
                </>
                )}

                {/* ═══════════════════════════════════════════════════
                    ✨ ESNEK TARİH FIRSATLARI — AYRI BÖLÜM
                    ═══════════════════════════════════════════════════
                    - Normal sort/pagination DIŞI (kendi tam listesi).
                    - HER ZAMAN normal sonuçların ALTINDA; son sayfada
                      (currentPage === totalPages) render edilir.
                    - Kartlar ANA tarih (start/end) taşır; fiyat GİZLİ
                      (isFlexible → "±3 gün içinde müsait"). Ana tarih/
                      fiyat/rezervasyon mantığı DEĞİŞMEZ. */}
                {flexibleCount > 0 && currentPage === totalPages && (
                  <div className="mt-14 md:mt-20 border-t border-[var(--color-stone-100)] pt-10 md:pt-14">
                    <div className="mb-7 md:mb-9 text-center md:text-left">
                      <p className="text-[11px] tracking-[0.24em] uppercase font-medium text-[var(--brand-coral-deep)]">
                        <span className="inline-block w-6 h-px bg-[var(--brand-coral)]/50 align-middle mr-2" />
                        {dict.flexibleEyebrow}
                      </p>
                      <h2 className="font-display text-[26px] md:text-[36px] text-[var(--color-stone-900)] mt-3 tracking-[-0.02em] leading-[1.06]">
                        {dict.flexibleTitle}
                      </h2>
                      <p className="text-[var(--color-stone-500)] mt-3 leading-relaxed text-[14px] md:text-[15px] max-w-xl mx-auto md:mx-0">
                        {dict.flexibleBody}
                      </p>
                      <p className="mt-3 text-[13px] font-semibold text-[var(--brand-coral-deep)]">
                        <span className="tabular-nums">{flexibleCount}</span>{" "}
                        {dict.flexibleCountSuffix}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-x-6 md:gap-x-8 gap-y-12 md:gap-y-16">
                      {flexibleVillas.map((villa) => (
                        <VillaCard
                          key={villa.id}
                          locale={locale}
                          id={villa.id}
                          slug={villa.slug ?? ""}
                          title={villa.title ?? ""}
                          location={villa.location}
                          price={villa.price ?? undefined}
                          currency={villa.currency || "TRY"}
                          images={villa.images}
                          badge={badgeByVillaId.get(villa.id) ?? villa.badge ?? undefined}
                          bedrooms={villa.bedrooms || 1}
                          bathrooms={villa.bathrooms || 1}
                          guests={villa.guests || 2}
                          /* 🛡️ ANA tarih SABİT → detailHref start/end 20→25
                             taşır. Fiyat prop'ları verilmez → VillaCard
                             isFlexible ile "±3 gün içinde müsait" gösterir. */
                          stayStart={hasDateRange ? start! : undefined}
                          stayEnd={hasDateRange ? end! : undefined}
                          isFlexible
                          reviewAverage={villa.review_average}
                          reviewCount={villa.review_count}
                          sizes={ARAMA_CARD_SIZES}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
    </>
  );
}

/* ===============================================================
   🛡️ URL BUILDER — pagination + size selector ortak helper
   ===============================================================
   Tek noktada: filter parametreleri + opsiyonel page + opsiyonel
   pageSize. Default değerler (page=1, pageSize=12) URL'e yazılmaz
   (clean URL). Repository/service/cache katmanına dokunulmaz —
   sadece public arama UI URL kontratı. */
function buildAramaSearchHref(
  sp: Awaited<Props["searchParams"]>,
  next: { page?: number; pageSize?: number; sort?: PublicSort },
  /* 🛡️ PHASE 13 — locale-aware hedef ("/arama" | "/en/arama" |
     "/de/arama"). Query parametre seti ve default'ların URL'e
     yazılmaması (clean URL) DEĞİŞMEDİ. */
  basePath: string
): string {
  const usp = new URLSearchParams();
  const setIf = (k: string, v: unknown) => {
    if (typeof v === "string" && v.length > 0) usp.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === "string")
      usp.set(k, String(v[0]));
  };
  setIf("villa-turleri", sp["villa-turleri"]);
  setIf("categories", sp.categories);
  setIf("bolgeler", sp.bolgeler);
  setIf("regions", sp.regions);
  setIf("start", sp.start);
  setIf("end", sp.end);
  setIf("guests", sp.guests);
  /* 🛡️ ADDITIVE — "Gelişmiş Arama" bayrağını sort/pageSize/pagination
     navigasyonunda KORU (yoksa esnek sonuçlar ilk tıklamada iptal
     olurdu). Yoksa yazılmaz → mevcut URL birebir. */
  setIf("flexible", sp.flexible);
  /* 🛡️ ADDITIVE — villa özellikleri filtresini sayfalama / sıralama /
     pageSize navigasyonunda KORU (yoksa ilk tıklamada silinirdi). */
  setIf("ozellikler", sp.ozellikler);

  /* page: > 1 ise URL'e yaz, değilse silmek (default 1 clean URL). */
  const p = next.page ?? parsePublicPage(sp.page);
  if (p > 1) usp.set("page", String(p));

  /* pageSize: default !== ise URL'e yaz; default ise URL'den silmek
     (clean URL). */
  const ps = next.pageSize ?? parsePublicPageSize(sp.pageSize);
  if (ps !== DEFAULT_PUBLIC_PAGE_SIZE) usp.set("pageSize", String(ps));

  /* 🛡️ sort: default ("smart") clean URL; diğerleri URL'e yazılır.
     - `next.sort` verildiyse onu kullan (Selector new tercih)
     - verilmediyse mevcut URL'deki sort'u parse et (pagination /
       pageSize değişimlerinde sort KORUNUR). */
  const s = next.sort ?? parsePublicSort(sp.sort);
  if (s !== DEFAULT_PUBLIC_SORT) usp.set("sort", s);

  const qs = usp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/* ===============================================================
   🛡️ PAGE SIZE SELECTOR — pill grup; Link-based (server-safe)
   ===============================================================
   Hero altı toolbar; pageSize değişince `?page=1`'e dönmek için
   buildAramaSearchHref({ page: 1, pageSize: N }) çağrılır. */
/* ===============================================================
   🛡️ SORT SELECTOR — Link/details dropdown (server-safe, JS-less)
   ===============================================================
   ÖNCEKİ MİMARİ (form + auto-submit script) iki bug üretiyordu:
     1) `next/script` afterInteractive — TTI öncesi select değişirse
        change handler bind edilmeden submit deneniyor → no-op.
     2) Form submit = hard navigation = React state sıfırlanır → bazı
        edge case'lerde filter state senkronize olmaz.

   YENİ MİMARİ:
     - `<details>` + `<summary>` native HTML dropdown (no JS)
     - Açılır menüdeki opsiyonlar `<Link>` (Next.js soft navigation)
     - URL inşası TEK source-of-truth: buildAramaSearchHref(sp, {...})
       → tüm filter/pageSize/sort/page param'ları aynı yerden akar
     - Sort change → page=1 reset (buildAramaSearchHref { page: 1 })
     - Hash/refresh/bookmark hepsi URL = canonical truth (zaten öyleydi)

   A11Y: <details> WCAG-compliant disclosure pattern; klavye ile
   açılır/kapanır; <Link> seçim sonrası navigation. */
function SortSelector({
  sp,
  sort,
  dict,
  basePath,
}: {
  sp: Awaited<Props["searchParams"]>;
  sort: PublicSort;
  dict: SearchDictionary;
  basePath: string;
}) {
  const currentLabel = dict.sortOptions[SORT_DICT_KEY[sort]];
  return (
    <details className="relative group/sort">
      <summary
        className={
          "list-none cursor-pointer select-none " +
          "inline-flex items-center gap-2 px-3 py-1 rounded-full " +
          "border border-[var(--color-stone-200)] bg-white " +
          "text-[12.5px] font-medium text-[var(--color-stone-700)] " +
          "hover:border-[var(--color-stone-300)] " +
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40 " +
          "transition-colors motion-reduce:transition-none"
        }
        aria-label={dict.sortAriaLabel}
      >
        <span className="text-[var(--color-stone-500)]">
          {dict.sortLabel}
        </span>
        <span>{currentLabel}</span>
        <span
          aria-hidden="true"
          className="text-[var(--color-stone-400)] transition-transform group-open/sort:rotate-180"
        >
          ▾
        </span>
      </summary>
      {/* Dropdown panel — sağa yaslı, mobile'da fit-content. */}
      <div
        role="menu"
        className={
          "absolute right-0 top-full mt-2 z-20 " +
          "min-w-[220px] rounded-xl border border-[var(--color-stone-200)] " +
          "bg-white shadow-lg p-1"
        }
      >
        {ALLOWED_PUBLIC_SORTS.map((s) => {
          const active = s === sort;
          /* TEK source-of-truth: buildAramaSearchHref tüm filter/
             pageSize/sort param'larını sp'den ya da next.*'tan akıtır.
             page=1 reset → sort değişince. */
          const href = buildAramaSearchHref(
            sp,
            { sort: s, page: 1 },
            basePath
          );
          return (
            <Link
              key={s}
              href={href}
              role="menuitemradio"
              aria-checked={active}
              className={
                "block px-3 py-2 rounded-lg " +
                "text-[12.5px] font-medium " +
                "transition-colors motion-reduce:transition-none " +
                (active
                  ? "bg-[var(--color-stone-900)] text-white"
                  : "text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)]")
              }
            >
              {dict.sortOptions[SORT_DICT_KEY[s]]}
            </Link>
          );
        })}
      </div>
    </details>
  );
}

/* ===============================================================
   🛡️ SORT DROPDOWN AUTO-CLOSE — global click delegation
   ===============================================================
   `<details>` native HTML; soft navigation sonrası `open` attribute
   DOM'da kalır (React reconciliation reset etmez) → kullanıcı sayfa
   geçişinde açık dropdown görüyordu. Tiny inline script document'a
   tek event listener bind eder; menuitemradio Link'ine tıklayan anı
   yakalayıp parent <details>.open = false yapar. Navigation Next.js
   <Link> tarafından yapılır; script onu engellemez (preventDefault
   yok), sadece DOM state'i temizler. CSP-friendly; <250 byte.
   Race-condition kabulü: TTI öncesi seçim yapılırsa script bind
   olmamış olabilir, dropdown açık kalır ama navigation YİNE çalışır
   (sort uygulanır) — degradation cosmetic, fonksiyonel etki sıfır. */
const SORT_DROPDOWN_CLOSE_SCRIPT = `(function(){document.addEventListener('click',function(e){var t=e.target;if(!(t&&t.closest))return;var l=t.closest('details [role="menuitemradio"]');if(!l)return;var d=l.closest('details');if(d)d.open=false;});})();`;

function PageSizeSelector({
  sp,
  pageSize,
  dict,
  basePath,
}: {
  sp: Awaited<Props["searchParams"]>;
  pageSize: number;
  dict: SearchDictionary;
  basePath: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-[var(--color-stone-500)]">
      <span>{dict.pageSizeLabel}</span>
      <div
        role="group"
        aria-label={dict.pageSizeAriaLabel}
        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-stone-200)] bg-white p-1"
      >
        {ALLOWED_PUBLIC_PAGE_SIZES.map((sz) => {
          const active = sz === pageSize;
          /* pageSize değişiminde page=1'e döner (default ise URL'e
             yazılmaz). Aktif size için href yine kendi href'i (kullanıcı
             tıklarsa idempotent). */
          const href = buildAramaSearchHref(
            sp,
            { pageSize: sz, page: 1 },
            basePath
          );
          return (
            <Link
              key={sz}
              href={href}
              aria-current={active ? "page" : undefined}
              className={
                "inline-flex items-center justify-center min-w-[36px] " +
                "px-2.5 py-1 rounded-full " +
                "text-[12.5px] font-medium tabular-nums " +
                "transition-colors motion-reduce:transition-none " +
                (active
                  ? "bg-[var(--color-stone-900)] text-white"
                  : "text-[var(--color-stone-600)] hover:bg-[var(--color-sand-50)]")
              }
            >
              {sz}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ===============================================================
   🛡️ PAGINATION NAV — numbered window (admin paterni)
   ===============================================================
   Görünüm: ← Önceki  1 ... 8 9 10 11 12 ... 42  Sonraki →
   `computePageWindow` (lib/pagination) ile aynı algoritma admin'le.
   Searchparams + pageSize preserve edilir; yalnız `page` değişir. */
function PaginationNav({
  sp,
  currentPage,
  totalPages,
  pageSize,
  dict,
  basePath,
}: {
  sp: Awaited<Props["searchParams"]>;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  dict: SearchDictionary;
  basePath: string;
}) {
  const pages = computePageWindow(currentPage, totalPages);
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <nav
      aria-label={dict.paginationAriaLabel}
      className="mt-16 md:mt-20 flex flex-wrap items-center justify-center gap-1.5 text-[13px] text-[var(--color-stone-600)]"
    >
      {prevDisabled ? (
        <span
          aria-disabled="true"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium text-[var(--color-stone-300)] cursor-not-allowed"
        >
          <ChevronLeft size={14} />
          {dict.paginationPrev}
        </span>
      ) : (
        <Link
          href={buildAramaSearchHref(
            sp,
            { page: currentPage - 1, pageSize },
            basePath
          )}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none"
        >
          <ChevronLeft size={14} />
          {dict.paginationPrev}
        </Link>
      )}

      {pages.map((p, idx) =>
        p === "…" ? (
          <span
            key={`gap-${idx}`}
            className="px-2 py-1.5 text-[12.5px] text-[var(--color-stone-400)]"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildAramaSearchHref(sp, { page: p, pageSize }, basePath)}
            aria-current={p === currentPage ? "page" : undefined}
            className={
              "inline-flex items-center justify-center min-w-[32px] " +
              "px-2.5 py-1.5 rounded-full " +
              "text-[12.5px] font-medium tabular-nums " +
              "transition-colors motion-reduce:transition-none " +
              (p === currentPage
                ? "bg-[var(--color-stone-900)] text-white"
                : "text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)]")
            }
          >
            {p}
          </Link>
        )
      )}

      {nextDisabled ? (
        <span
          aria-disabled="true"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium text-[var(--color-stone-300)] cursor-not-allowed"
        >
          {dict.paginationNext}
          <ChevronRight size={14} />
        </span>
      ) : (
        <Link
          href={buildAramaSearchHref(
            sp,
            { page: currentPage + 1, pageSize },
            basePath
          )}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] font-medium text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none"
        >
          {dict.paginationNext}
          <ChevronRight size={14} />
        </Link>
      )}
    </nav>
  );
}
