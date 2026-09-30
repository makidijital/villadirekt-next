/* ===============================================================
   🛡️ TAXONOMY LANDING — kategori + bölge GRUBU SEO URL'leri (SAF)
   ===============================================================
   SEO giriş sayfaları:
     /villa-turleri/[slug]   → villa kategorisi (villa_types.slug)
     /bolgeler/[slug]        → YALNIZ bölge GRUP KÖKÜ (villa_locations.slug)

   `/arama` filtre sistemi DEĞİŞMEZ; bu modül yalnız:
     (1) link üreticilerinin (menü, footer, anasayfa) hedefini seçer,
     (2) landing route'larının slug → kayıt çözümünü yapar.

   GRUP KÖKÜ KURALI — `AramaPageBody > expandedRegions` ve
   `LocationCollection` ile BİREBİR AYNI (yeni kural İCAT EDİLMEDİ):
     group = (filter_group_name || "").trim()
     kök  ⇔ group !== "" && name === group
     üyeler = filter_group_name.trim() === group olan TÜM bölgeler
   Alt bölgelerin landing'i YOKTUR; onların linkleri mevcut
   `/arama?bolgeler=<slug>` filtresinde kalır.

   Bu dosya SAF'tır (server/client ortak) — DB/cache erişimi YOK.
   Landing çözümü için bkz. `lib/taxonomy-landing.server.ts`.
   =============================================================== */
import { isUuid } from "@/lib/slug";

export const CATEGORY_LANDING_TR_PREFIX = "/villa-turleri";
export const REGION_LANDING_TR_PREFIX = "/bolgeler";

export type TaxonomyLinkItem = {
  id: string;
  slug?: string | null;
};

export type RegionLinkItem = TaxonomyLinkItem & {
  name?: string | null;
  filter_group_name?: string | null;
};

/** Landing URL'ine uygun slug: boş değil ve UUID değil. */
export function landingSlugOf(slug: string | null | undefined): string | null {
  const s = String(slug ?? "").trim();
  if (!s || isUuid(s)) return null;
  return s;
}

/** Bölgenin grup anahtarı (trim'li `filter_group_name`; yoksa ""). */
export function regionGroupKey(loc: {
  filter_group_name?: string | null;
}): string {
  return String(loc.filter_group_name ?? "").trim();
}

/** `AramaPageBody > expandedRegions` ile aynı grup-kökü kuralı. */
export function isRegionGroupRoot(loc: {
  name?: string | null;
  filter_group_name?: string | null;
}): boolean {
  const group = regionGroupKey(loc);
  return !!group && loc.name === group;
}

/** Kökün grubundaki TÜM bölge id'leri (kök dahil). */
export function regionGroupMemberIds<
  T extends { id: string; filter_group_name?: string | null }
>(root: { name?: string | null; filter_group_name?: string | null }, all: readonly T[]): string[] {
  const group = regionGroupKey(root);
  if (!group) return [];
  return all
    .filter((o) => regionGroupKey(o) === group)
    .map((o) => String(o.id));
}

/* ---------------------------------------------------------------
   LINK HEDEFLERİ — landing uygunsa landing, değilse MEVCUT /arama URL'i
   (fallback çıktısı eski üreticilerle BİREBİR aynı string).
   Dönen path'ler TR (prefix'siz); locale öneki caller'daki mevcut
   `localeHref` ile eklenir (değişmeyen sözleşme).
   --------------------------------------------------------------- */

/** Kategori linki: slug varsa `/villa-turleri/<slug>`, yoksa eski `/arama`. */
export function categoryLinkHref(item: TaxonomyLinkItem): string {
  const slug = landingSlugOf(item.slug);
  if (slug) return `${CATEGORY_LANDING_TR_PREFIX}/${encodeURIComponent(slug)}`;
  const token = (item.slug && item.slug.trim()) || item.id;
  return `/arama?villa-turleri=${encodeURIComponent(token)}`;
}

/** Bölge linki: grup kökü + slug → `/bolgeler/<slug>`; aksi halde eski `/arama`. */
export function regionLinkHref(item: RegionLinkItem): string {
  const slug = landingSlugOf(item.slug);
  if (slug && isRegionGroupRoot(item)) {
    return `${REGION_LANDING_TR_PREFIX}/${encodeURIComponent(slug)}`;
  }
  const token = (item.slug && item.slug.trim()) || item.id;
  return `/arama?bolgeler=${encodeURIComponent(token)}`;
}

/** Route param'ı → karşılaştırılabilir slug (URL-encoded gelebilir). */
export function normalizeLandingParam(raw: string | null | undefined): string {
  const s = String(raw ?? "");
  try {
    return decodeURIComponent(s).trim();
  } catch {
    return s.trim();
  }
}
