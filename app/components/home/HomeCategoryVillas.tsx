import { unstable_cache } from "next/cache";

import {
  getCachedVillas,
  getCachedVillaTypes,
  getCachedCategoryCovers,
  type PublicVillaCard,
} from "@/lib/cache.helpers";
import { villaTypeRepository } from "@/lib/db/villa-type.repository";
import {
  getCategoryCoverPublicUrl,
  appendAssetVersion,
} from "@/lib/storage.helpers";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { localeHref } from "@/lib/i18n/locale-href";
import { categoryLinkHref } from "@/lib/taxonomy-landing";
import { getVillaTypeNamesByLocale } from "@/lib/i18n/get-villa-type-translations.server";
import { resolveTaxonomyName } from "@/lib/i18n/taxonomy-name.helper";
import { getVillaBadgesByLocale } from "@/lib/i18n/get-villa-badge-translations.server";

import HomeCategoryVillasClient, {
  type HomeCategoryItem,
} from "./HomeCategoryVillasClient";

/* ===============================================================
   🛡️ HOME — KATEGORİYE GÖRE VİLLALAR (trust kartlarının altı)
   ===============================================================
   Eski "Villa Tiplerini Keşfedin" carousel'inin (VillaTypeCarousel)
   ana sayfadaki YERİNE gelir. Yeni veri sistemi YOK — mevcut kaynaklar:
     getCachedVillaTypes()     → kategoriler (sort_order ASC)
     getCachedCategoryCovers() → kategori kapak görseli + aktif villa sayısı
     getCachedVillas()         → public villa listesi (mevcut sıralama)
     villa_type_relations      → villaTypeRepository.findAllRelations()
                                 (getCachedCategoryCovers'ın kullandığı
                                 AYNI method; aynı tag'lerle cache'lenir)
   Filtre kuralı VillaTypeCarousel ile birebir: aktif villa > 0 +
   show_on_homepage !== false.

   Her kategorinin ilk 8 villası SERVER'da (getCachedVillas sırası
   korunarak) hesaplanır → kategori değişimi client state ile anında,
   route/URL değişmez, ek istek ve loading YOK.
   =============================================================== */

const MAX_VILLAS_PER_CATEGORY = 8;

/** typeId → villaId[] (villa_type_relations). */
const getCachedTypeVillaIds = unstable_cache(
  async (): Promise<Record<string, string[]>> => {
    const { data, error } = await villaTypeRepository.findAllRelations();
    if (error) {
      console.error("[home.categoryVillas] rels FAILED", error.message);
      return {};
    }
    const map: Record<string, string[]> = {};
    for (const rel of (data || []) as Array<{
      type_id: string | null;
      villa_id: string | null;
    }>) {
      if (!rel?.type_id || !rel?.villa_id) continue;
      const key = String(rel.type_id);
      (map[key] ||= []).push(String(rel.villa_id));
    }
    return map;
  },
  ["home-category-villas:relations"],
  { tags: ["villas", "taxonomy"], revalidate: 600 }
);

export default async function HomeCategoryVillas({
  locale = DEFAULT_LOCALE,
}: {
  locale?: Locale;
} = {}) {
  const home = getDictionary(locale).home;
  const dict = home.categoryVillas;

  const [types, covers, villas, typeVillaIds] = await Promise.all([
    getCachedVillaTypes().catch(() => []),
    getCachedCategoryCovers().catch(() => ({})),
    getCachedVillas().catch(() => [] as PublicVillaCard[]),
    getCachedTypeVillaIds().catch(() => ({} as Record<string, string[]>)),
  ]);

  if (!types?.length) return null;

  const nameByLocale =
    locale === DEFAULT_LOCALE
      ? {}
      : await getVillaTypeNamesByLocale(types.map((t) => String(t.id))).catch(
          () => ({} as Awaited<ReturnType<typeof getVillaTypeNamesByLocale>>)
        );

  const coverMap = covers as Record<
    string,
    { coverImageUrl: string | null; villaCount: number }
  >;

  const categories: HomeCategoryItem[] = [];
  const villasByCategory: Record<string, PublicVillaCard[]> = {};

  for (const t of types) {
    const tid = String(t.id);
    const showOnHomepage =
      (t as { show_on_homepage?: boolean | null }).show_on_homepage !== false;
    const count = coverMap[tid]?.villaCount ?? 0;
    const name = resolveTaxonomyName(
      String(t.name || "").trim(),
      nameByLocale[tid],
      locale
    ).trim();
    if (!showOnHomepage || count <= 0 || !name) continue;

    const rawSlug = (t as { slug?: string | null }).slug;
    const slug =
      typeof rawSlug === "string" && rawSlug.trim().length > 0
        ? rawSlug.trim()
        : null;
    const adminCover = appendAssetVersion(
      getCategoryCoverPublicUrl(
        (t as { cover_image?: string | null }).cover_image
      ),
      (t as { cover_v?: number }).cover_v
    );

    /* Mevcut public sıralama (getCachedVillas) korunur → ilk 8. */
    const ids = new Set(typeVillaIds[tid] || []);
    villasByCategory[tid] = villas
      .filter((v) => ids.has(String(v.id)))
      .slice(0, MAX_VILLAS_PER_CATEGORY);

    categories.push({
      id: tid,
      name,
      count,
      coverUrl: adminCover || coverMap[tid]?.coverImageUrl || null,
      href: localeHref(categoryLinkHref({ id: tid, slug }), locale),
    });
  }

  if (!categories.length) return null;

  /* Rozet çevirileri — TEK batch (TR'de sorgu atılmaz). */
  const allIds = Array.from(
    new Set(Object.values(villasByCategory).flat().map((v) => v.id))
  );
  const badgeMap = await getVillaBadgesByLocale(allIds, locale).catch(
    () => new Map<string, string>()
  );
  const badgeByVillaId: Record<string, string> = Object.fromEntries(badgeMap);

  return (
    <HomeCategoryVillasClient
      locale={locale}
      categories={categories}
      villasByCategory={villasByCategory}
      badgeByVillaId={badgeByVillaId}
      labels={{
        sectionAriaLabel: dict.sectionAriaLabel,
        title: dict.title,
        tabsAriaLabel: dict.tabsAriaLabel,
        resultsAriaLabel: dict.resultsAriaLabel,
        empty: dict.empty,
        viewAll: dict.viewAll,
        countBadge: home.villaTypes.countBadge,
        carouselPrev: home.carousel.previous,
        carouselNext: home.carousel.next,
      }}
    />
  );
}
