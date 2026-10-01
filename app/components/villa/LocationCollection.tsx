import Link from "next/link";
import Image from "next/image";

import {
  getCachedVillaLocations,
  getCachedLocationVillaCounts,
} from "@/lib/cache.helpers";
import {
  getLocationCoverPublicUrl,
  appendAssetVersion,
} from "@/lib/storage.helpers";

import HorizontalCarousel from "./HorizontalCarousel";
/* 🛡️ PHASE 11 — YALNIZ section metinleri çevrilir. BÖLGE ADLARI her
   dilde CANONICAL kalır: bölge adları özel isimdir ve bölge çeviri
   sistemi Phase 10I'de bilinçli olarak KALDIRILDI. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
/* 🛡️ NAVIGATION LOCALE PERSISTENCE — iç link aktif locale'i taşır
   (bkz. lib/i18n/locale-href.ts). */
import { localeHref } from "@/lib/i18n/locale-href";
import {
  REGION_LANDING_TR_PREFIX,
  regionLinkHref,
} from "@/lib/taxonomy-landing";

/* ===============================================================
   🛡️ LOCATION SHOWCASE — homepage "circular avatar" carousel
   ===============================================================
   Yatay kaydırmalı "Villa Kiralama Bölgeleri" — VillaTypeCarousel'dan
   (app/components/villa/VillaTypeCarousel.tsx) BİLİNÇLİ OLARAK farklı
   kart dili kullanır (aynı carousel altyapısı, tamamen farklı
   kompozisyon):
     - HorizontalCarousel (app/components/villa/HorizontalCarousel.tsx,
       DEĞİŞTİRİLMEDİ) — native scroll-snap, wheel→horizontal, desktop
       showArrows, mobile native touch swipe. Yeni kütüphane YOK.
     - Kart: KÜÇÜK, DAİRESEL görsel (rounded-full, ~140-180px) + altında
       kompakt metin — VillaTypeCarousel'in büyük dikdörtgen kartının,
       beyaz panelinin ve köşe rozet/badge'inin HİÇBİRİ kullanılmadı.
       Büyük gradient overlay YOK, görselin üzerine yazı bindirilmedi —
       bölge adı görselin ALTINDA, ayrı bir metin bloğunda.
     - Villa sayısı ikincil/küçük bilgi; yanında marka renkli
       (#ED7926/#0973BA) minik gradient nokta — badge/pill DEĞİL.
     - Hover: sadece görsel hafif zoom + dairenin çok hafif elevation'ı
       (büyük translate/scale yok, sade ve premium).
     - Server component, zero ek client JS (HorizontalCarousel hariç).

   ⚠️ GEÇMİŞ NOT (artık geçersiz): Bu component bir ara statik CSS
     grid'e (carousel'siz) düşürülmüştü, sonra büyük 3/4 poster kartlı
     bir carousel'e dönüştürülmüştü. Bu revizyonla küçük dairesel
     avatar kompozisyonuna geçildi — mevcut HorizontalCarousel altyapısı
     üzerinden, yeni bir mekanizma icat edilmeden.

   FARKLAR (CategoryCollection'a göre, veri tarafı):
     - URL param: `bolgeler` (regions canonical evrim — Faz 8)
     - Veri kaynağı: villa_locations + getCachedLocationVillaCounts
     - showArrows={true} — desktop sağ/sol navigation aktif
     - Cover fallback: location-cover yoksa SOFT PLACEHOLDER
       (kategori sistemindeki villa_type_relations fallback YOK çünkü
        bölgeler için count helper'ı sadece sayı veriyor; ileride
        gerekirse paralel cover helper eklenebilir).

   DATA (DEĞİŞMEDİ):
     getCachedVillaLocations()       → [{id, name, slug, cover_image}]
                                       (tag: taxonomy, TTL 1sa)
     getCachedLocationVillaCounts()  → { [locationId]: count }
                                       (tag: villas+taxonomy, TTL 10dk)

   FİLTRE (DEĞİŞMEDİ):
     count > 0 (aktif + deleted_at IS NULL villa içeren bölgeler).

   CLICK (DEĞİŞMEDİ):
     /arama?bolgeler=<slug | id>  (resolver UUID + slug accept eder)

   KORUNAN BEHAVIOR:
     - URL param canonical evrim (Faz 8)
     - Cache helper API'leri + revalidate tag'leri
     - filter_group_name gruplama, count toplama, token üretimi
     - Reservation, pricing, availability — sıfır dokunuş
   =============================================================== */

type Item = {
  /** Grup anahtarı = filter_group_name ?? name (kart başlığı + react key). */
  key: string;
  /** Gruptaki tüm lokasyonların villa sayısı toplamı. */
  count: number;
  /** cover_image'i olan ilk grup üyesinin cover URL'i. */
  coverUrl: string | null;
  /** Grup üyelerinin slug|id token'ları, /arama?bolgeler= için virgülle birleşik. */
  token: string;
  /** 🛡️ SEO landing — grup kökü slug'lıysa `/bolgeler/<slug>`, yoksa null. */
  landingHref: string | null;
};

export default async function LocationCollection({
  locale = DEFAULT_LOCALE,
}: {
  locale?: Locale;
} = {}) {
  const dict = getDictionary(locale).home.regions;
  const carouselDict = getDictionary(locale).home.carousel;
  const [locations, counts] = await Promise.all([
    getCachedVillaLocations(),
    getCachedLocationVillaCounts(),
  ]);

  if (!locations?.length) return null;

  /* 🛡️ GRUPLAMA — group key = filter_group_name ?? name.
     Alt bölgeler (ör. "Kalkan / Üzümlü", "Kalkan / Çavdır") tek "Kalkan"
     kartında birleşir. Veri kaynağı / cache / helper DEĞİŞMEDİ; gruplama
     yalnız bu render katmanında. Map insertion order = query order
     (name ASC) → kartlar deterministik sırada. */
  const groups = new Map<
    string,
    {
      count: number;
      coverUrl: string | null;
      tokens: string[];
      /* Plan A — grup-kökü (name === filter_group_name) slug/id token'ı.
         Varsa /arama'ya TEK token gider (ör. "kalkan"); /arama'daki
         expandedRegions kökü tüm alt bölgelere genişletir, sidebar yalnız
         "Tüm Kalkan"ı seçili gösterir. */
      rootToken: string | null;
      /* 🛡️ SEO landing — grup kökü slug'lıysa `/bolgeler/<slug>`
         (lib/taxonomy-landing kuralı); yoksa null → ESKİ /arama linki. */
      landingHref: string | null;
    }
  >();

  for (const l of locations) {
    const lid = String(l.id);
    const name = String(l.name || "").trim();
    const rawGroup = (l as { filter_group_name?: string | null })
      .filter_group_name;
    const groupTrim =
      typeof rawGroup === "string" ? rawGroup.trim() : "";
    const key = groupTrim.length > 0 ? groupTrim : name;
    if (!key) continue;

    const rawSlug = (l as { slug?: string | null }).slug;
    const token =
      typeof rawSlug === "string" && rawSlug.trim().length > 0
        ? rawSlug.trim()
        : lid;
    /* 🛡️ cover_v cache-bust — deterministik path overwrite → URL
       değişmez → CDN stale. revalidateTaxonomy rebuild → yeni token →
       anında fresh. (bkz. storage.helpers > appendAssetVersion). */
    const cover = appendAssetVersion(
      getLocationCoverPublicUrl(
        (l as { cover_image?: string | null }).cover_image
      ),
      (l as { cover_v?: number }).cover_v
    );

    const g =
      groups.get(key) ?? {
        count: 0,
        coverUrl: null,
        tokens: [],
        rootToken: null,
        landingHref: null,
      };
    g.count += counts[lid] ?? 0;
    if (!g.coverUrl && cover) g.coverUrl = cover; // cover_image olan ilk kayıt
    g.tokens.push(token);
    /* Grup-kökü tespiti: name === filter_group_name → token'ı kökün slug'ı. */
    if (!g.rootToken && groupTrim.length > 0 && name === groupTrim) {
      g.rootToken = token;
    }
    if (!g.landingHref) {
      const lh = regionLinkHref({
        id: lid,
        slug: rawSlug,
        name: l.name,
        filter_group_name: rawGroup,
      });
      if (lh.startsWith(`${REGION_LANDING_TR_PREFIX}/`)) g.landingHref = lh;
    }
    groups.set(key, g);
  }

  const items: Item[] = Array.from(groups.entries())
    .map(([key, g]) => ({
      key,
      count: g.count,
      coverUrl: g.coverUrl,
      /* Kök varsa TEK token (ör. "kalkan"); yoksa eski çoklu-token fallback. */
      token: g.rootToken ?? g.tokens.join(","),
      landingHref: g.landingHref,
    }))
    .filter((item) => item.count > 0);

  if (!items.length) return null;

  return (
    <section
      aria-label={dict.sectionAriaLabel}
      className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-4 md:pb-10"
    >
      <div className="site-container">
        {/* 🛡️ FAZ 39M — Normalized section header (CategoryCollection parity). */}
        <div className="text-center mb-8 md:mb-12">
          <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] leading-tight tracking-[-0.02em]">
            {dict.title}
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-stone-500)] max-w-md mx-auto">
            {dict.subtitle}
          </p>
        </div>

        {/* CIRCULAR AVATAR CAROUSEL — yatay kaydırma, HorizontalCarousel
            (DEĞİŞTİRİLMEDİ) üzerinden. Kartlar küçük olduğu için geniş
            boşluk bırakılıyor (gap-7/8/9) ve aynı anda çok daha fazla
            bölge görünüyor — VillaTypeCarousel'in geniş kartlarının
            tersine. */}
        <HorizontalCarousel
          showArrows
          ariaLabel={dict.carouselAriaLabel}
          prevLabel={carouselDict.previous}
          nextLabel={carouselDict.next}
          className="pb-1"
        >
          <ul role="list" className="flex flex-nowrap min-w-max gap-7 md:gap-8 lg:gap-9">
            {items.map((item) => (
              <li key={item.key} className="snap-start shrink-0">
                <LocationCard item={item} locale={locale} />
              </li>
            ))}
          </ul>
        </HorizontalCarousel>

        {/* 🛡️ CTA — grid altında, tüm ekranlarda centered (header'dan taşındı). */}
        <div className="mt-9 md:mt-10 flex justify-center">
          <Link
            href={localeHref("/arama", locale)}
            className="
              group inline-flex items-center gap-2
              px-4 py-2 rounded-full
              border border-[var(--color-stone-200)]
              text-[12.5px] font-medium tracking-[0.02em]
              text-[var(--color-stone-700)]
              hover:border-[var(--brand-coral)] hover:text-[var(--color-stone-900)]
              hover:bg-[var(--brand-coral-tint)]
              transition-colors motion-reduce:transition-none
            "
          >
            <span>{dict.ctaAll}</span>
            <span
              aria-hidden="true"
              className="text-[var(--color-stone-500)] group-hover:text-[var(--brand-coral)]"
            >
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ===============================================================
   LocationCard — dairesel "avatar" destination kartı
   ===============================================================
   VillaTypeCard'dan (VillaTypeCarousel.tsx) BİLİNÇLİ OLARAK farklı:
   büyük dikdörtgen kart YOK — küçük rounded-full görsel (~140-180px,
   breakpoint'e göre) + görselin ALTINDA kompakt metin bloğu. Gradient
   overlay/yazı-üstüne-bindirme YOK, köşe rozet/badge YOK. İnce premium
   ring (border) + hover'da sade görsel zoom/hafif elevation. Villa
   sayısı küçük ikincil bilgi, yanında marka-renkli mini gradient nokta.
   Veri/link/placeholder mantığı DEĞİŞMEDİ (sadece sunum).
=============================================================== */
function LocationCard({ item, locale }: { item: Item; locale: Locale }) {
  /* Grup üyelerinin token'ları (slug|id) virgülle; /arama çoklu değeri
     `regionsRaw.split(",")` ile parse edip `.in("location_id", …)` uygular. */
  /* 🛡️ NAVIGATION LOCALE PERSISTENCE — bölge kartı linki aktif
     locale'i taşır; `bolgeler` token'ı ve query kontratı DEĞİŞMEZ. */
  /* 🛡️ SEO landing — grup kökü slug'lıysa `/bolgeler/<slug>`; aksi
     halde ESKİ `/arama?bolgeler=<token>` davranışı AYNEN. */
  const href = localeHref(
    item.landingHref ?? `/arama?bolgeler=${encodeURIComponent(item.token)}`,
    locale
  );
  const initial = (item.key?.[0] || "·").toUpperCase();

  return (
    <Link
      href={href}
      className="group flex w-[140px] sm:w-[150px] md:w-[170px] lg:w-[180px] flex-col items-center text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 rounded-3xl"
    >
      {/* DAİRESEL GÖRSEL — ince premium ring, hover'da sadece zoom +
          çok hafif elevation (büyük translate/scale YOK). */}
      <div
        className="
          relative shrink-0 overflow-hidden rounded-full
          w-[140px] h-[140px] sm:w-[150px] sm:h-[150px]
          md:w-[170px] md:h-[170px] lg:w-[180px] lg:h-[180px]
          bg-[var(--color-sand-100)]
          ring-1 ring-[var(--color-stone-200)]
          shadow-[0_8px_20px_-12px_rgba(0,0,0,0.28)]
          transition-[box-shadow,transform] duration-400
          motion-reduce:transition-none
          group-hover:shadow-[0_14px_30px_-14px_rgba(0,0,0,0.34)]
          group-hover:-translate-y-0.5
          group-hover:ring-brand/30
        "
      >
        {item.coverUrl ? (
          <Image
            src={item.coverUrl}
            alt={item.key}
            fill
            sizes="(max-width: 640px) 140px, (max-width: 1024px) 170px, 180px"
            className="object-cover object-center transition-transform duration-[700ms] ease-out group-hover:scale-[1.08] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          /* SOFT PLACEHOLDER — serif initial (davranış korunuyor) */
          <div className="absolute inset-0 flex items-center justify-center select-none">
            <div className="font-display text-[36px] md:text-[42px] leading-none text-[var(--color-stone-300)] tracking-[-0.03em]">
              {initial}
            </div>
          </div>
        )}
      </div>

      {/* METİN — görselin ALTINDA: kompakt güçlü başlık + ikincil villa
          sayısı + marka-renkli minik gradient nokta (rozet/badge YOK). */}
      <h3 className="mt-3 font-display text-[14.5px] md:text-[15.5px] font-medium leading-[1.2] text-[var(--color-stone-900)] tracking-[-0.01em] line-clamp-2">
        {item.key}
      </h3>
      <div className="mt-1 flex items-center justify-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full bg-accent "
        />
        <span className="text-[11px] text-[var(--color-stone-500)] tabular-nums">
          {item.count} villa
        </span>
      </div>
    </Link>
  );
}
