import "server-only";
import { cache } from "react";

import {
  getCachedCategoryCovers,
  getCachedLocationVillaCounts,
  getCachedVillaLocations,
  getCachedVillaTypes,
  getCachedVillas,
} from "@/lib/cache.helpers";
import { villaTypeRepository } from "@/lib/db/villa-type.repository";
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { isUuid } from "@/lib/slug";
import {
  CATEGORY_LANDING_TR_PREFIX,
  REGION_LANDING_TR_PREFIX,
  isRegionGroupRoot,
  landingSlugOf,
  normalizeLandingParam,
  regionGroupMemberIds,
} from "@/lib/taxonomy-landing";

/* ===============================================================
   🛡️ TAXONOMY LANDING — SERVER ÇÖZÜMÜ
   ===============================================================
   /villa-turleri/[slug] ve /bolgeler/[slug] route'larının slug →
   kayıt → villa id kümesi çözümü. YENİ listeleme sistemi DEĞİL:
     • Kayıt kaynağı: mevcut taxonomy cache'leri (tag "taxonomy";
       admin CRUD sonrası `revalidateTaxonomy()` anında tazeler).
     • Villa kümesi: /arama'nın kullandığı AYNI predicate'ler
       (kategori: villa_type_relations.type_id; bölge: location_id ∈
       grup üyeleri) — istek başına, cache'siz (her zaman güncel).
     • Kart listesi: `KiralikVillalarPageBody` + `getCachedVillas()`
       (public küme) — bu modül yalnız id kümesini verir.
   `cache()` (React) → generateMetadata + sayfa gövdesi AYNI istekte
   tek çözüm/tek sorgu (dedupe).

   Geçersiz slug / UUID / alt bölge / kökü olmayan grup → null
   (route `notFound()` döndürür).
   =============================================================== */

export type CategoryLanding = {
  kind: "category";
  id: string;
  slug: string;
  /** Canonical (TR) ad — locale adı route katmanında çözülür. */
  name: string;
  villaIds: Set<string>;
};

export type RegionGroupLanding = {
  kind: "region";
  id: string;
  slug: string;
  name: string;
  memberLocationIds: string[];
  villaIds: Set<string>;
};

function acceptableParam(raw: string): string | null {
  const slug = normalizeLandingParam(raw);
  if (!slug || isUuid(slug)) return null;
  return slug;
}

export const resolveCategoryLanding = cache(
  async (rawSlug: string): Promise<CategoryLanding | null> => {
    const slug = acceptableParam(rawSlug);
    if (!slug) return null;

    const types = await getCachedVillaTypes();
    const type = types.find((t) => landingSlugOf(t.slug) === slug);
    if (!type) return null;

    const { data, error } =
      await villaTypeRepository.findVillaTypeRelationsByTypeIds([
        String(type.id),
      ]);
    if (error) {
      /* Geçici DB hatasını "boş kategori" (noindex) sanmayalım → 500. */
      throw new Error(`[taxonomy-landing] category villas: ${error.message}`);
    }
    const villaIds = new Set<string>();
    for (const r of (data || []) as Array<{ villa_id: string | null }>) {
      if (r?.villa_id) villaIds.add(String(r.villa_id));
    }
    return {
      kind: "category",
      id: String(type.id),
      slug,
      name: String(type.name ?? ""),
      villaIds,
    };
  }
);

export const resolveRegionGroupLanding = cache(
  async (rawSlug: string): Promise<RegionGroupLanding | null> => {
    const slug = acceptableParam(rawSlug);
    if (!slug) return null;

    const locations = await getCachedVillaLocations();
    const root = locations.find((l) => landingSlugOf(l.slug) === slug);
    /* Alt bölge veya kökü olmayan grup → landing YOK. */
    if (!root || !isRegionGroupRoot(root)) return null;

    const memberLocationIds = regionGroupMemberIds(root, locations);
    const { data, error } =
      await villaAdminRepository.findActiveVillaIdsByLocationIds(
        memberLocationIds
      );
    if (error) {
      throw new Error(`[taxonomy-landing] region villas: ${error.message}`);
    }
    const villaIds = new Set<string>();
    for (const r of (data || []) as Array<{ id: string | null }>) {
      if (r?.id) villaIds.add(String(r.id));
    }
    return {
      kind: "region",
      id: String(root.id),
      slug,
      name: String(root.name ?? ""),
      memberLocationIds,
      villaIds,
    };
  }
);

/** Landing'de listelenecek public villa sayısı (kart listesiyle AYNI küme). */
export async function countPublicLandingVillas(
  villaIds: ReadonlySet<string>
): Promise<number> {
  if (villaIds.size === 0) return 0;
  const villas = await getCachedVillas();
  let n = 0;
  for (const v of villas) if (villaIds.has(String(v.id))) n += 1;
  return n;
}

/* ===============================================================
   SITEMAP — yalnız slug'lı + en az 1 aktif villalı kategori ve
   grup kökleri. Mevcut cached sayaçlar kullanılır (ek sorgu YOK):
     • getCachedCategoryCovers  → kategori başına aktif villa sayısı
     • getCachedLocationVillaCounts → bölge başına aktif villa sayısı
   Alt bölgeler ASLA dönmez.
   =============================================================== */
export async function getTaxonomyLandingSitemapPaths(): Promise<{
  categories: string[];
  regions: string[];
}> {
  const [types, locations, covers, locationCounts] = await Promise.all([
    getCachedVillaTypes(),
    getCachedVillaLocations(),
    getCachedCategoryCovers(),
    getCachedLocationVillaCounts(),
  ]);

  const categories: string[] = [];
  for (const t of types) {
    const slug = landingSlugOf(t.slug);
    if (!slug) continue;
    if ((covers[String(t.id)]?.villaCount ?? 0) < 1) continue;
    categories.push(`${CATEGORY_LANDING_TR_PREFIX}/${encodeURIComponent(slug)}`);
  }

  const regions: string[] = [];
  for (const l of locations) {
    const slug = landingSlugOf(l.slug);
    if (!slug || !isRegionGroupRoot(l)) continue;
    const total = regionGroupMemberIds(l, locations).reduce(
      (sum, id) => sum + (locationCounts[id] ?? 0),
      0
    );
    if (total < 1) continue;
    regions.push(`${REGION_LANDING_TR_PREFIX}/${encodeURIComponent(slug)}`);
  }

  return { categories, regions };
}
