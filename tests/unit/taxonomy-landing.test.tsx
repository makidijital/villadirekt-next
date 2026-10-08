/* ===============================================================
   🛡️ SEO LANDING — /villa-turleri/[slug] + /bolgeler/[slug]
   ===============================================================
   Kilitlenenler:
     A) Saf link kuralları (kategori / grup kökü / alt bölge / slug'sız)
     B) Grup kökü kuralı /arama `expandedRegions` ile AYNI (kaynak kilidi)
     C) Server çözümü: geçerli / geçersiz / UUID / alt bölge / kökü
        olmayan grup / grubun TÜM bölgeleri / boş kategori
     D) Metadata: title, description, canonical (sayfa 2 dahil),
        hreflang (multilingual açık/kapalı), OG/Twitter, noindex
     E) Gövde: mevcut KiralikVillalarPageBody'ye scope ile delege;
        yalnız kapsamdaki villalar, sayfalama linkleri landing path'i,
        sidebar ön-seçimi (redirect → mevcut /arama), breadcrumb
     F) Sitemap path'leri: yalnız slug'lı + villalı kategori ve kökler
     G) Link üreticileri: menü resolver, footer, bölge kartları
     H) Route dosyaları (TR/EN/DE) + EN/DE dil kapısı
     I) Sözlük bütünlüğü (TR/EN/DE)
     J) Admin: kategori adı değişince slug korunur
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import {
  categoryLinkHref,
  regionLinkHref,
  isRegionGroupRoot,
  regionGroupMemberIds,
  landingSlugOf,
  normalizeLandingParam,
} from "@/lib/taxonomy-landing";
import { resolveMenuRow, type MenuSourceMaps } from "@/lib/menu-resolver";
import { tr } from "@/lib/i18n/dictionaries/tr";
import { en } from "@/lib/i18n/dictionaries/en";
import { de } from "@/lib/i18n/dictionaries/de";

/* ---------------- mock katmanı ---------------- */
const typesMock = vi.fn();
const locationsMock = vi.fn();
const villasMock = vi.fn();
const coversMock = vi.fn();
const locCountsMock = vi.fn();
const settingsMock = vi.fn();
vi.mock("@/lib/cache.helpers", () => ({
  getCachedVillaTypes: () => typesMock(),
  getCachedVillaLocations: () => locationsMock(),
  getCachedVillas: () => villasMock(),
  getCachedCategoryCovers: () => coversMock(),
  getCachedLocationVillaCounts: () => locCountsMock(),
  getCachedSettings: () => settingsMock(),
}));

const typeRelsMock = vi.fn();
vi.mock("@/lib/db/villa-type.repository", () => ({
  villaTypeRepository: {
    findVillaTypeRelationsByTypeIds: (ids: string[]) => typeRelsMock(ids),
  },
}));
const villaIdsByLocMock = vi.fn();
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findActiveVillaIdsByLocationIds: (ids: string[]) => villaIdsByLocMock(ids),
  },
}));

const typeNamesMock = vi.fn();
vi.mock("@/lib/i18n/get-villa-type-translations.server", () => ({
  getVillaTypeNamesByLocale: (ids: string[]) => typeNamesMock(ids),
}));
vi.mock("@/lib/i18n/get-villa-badge-translations.server", () => ({
  getVillaBadgesByLocale: async () => new Map(),
}));
vi.mock("@/lib/db/villa-feature.repository", () => ({
  villaFeatureRepository: { findAllForPublicTaxonomy: async () => ({ data: [], error: null }) },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "TRY" }) }),
}));
vi.mock("@/app/services/exchange-rate.service", () => ({
  getExchangeRatesMap: async () => ({ rates: { USD: 32, EUR: 35, GBP: 40 }, updatedAt: null }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/script", () => ({ default: () => null }));

const sidebarProps: Record<string, unknown>[] = [];
vi.mock("@/app/(public)/arama/FilterSidebar", () => ({
  default: (props: Record<string, unknown>) => {
    sidebarProps.push(props);
    return <div data-testid="filter-sidebar" />;
  },
}));
vi.mock("@/app/components/villa/VillaCard", () => ({
  default: (props: { title: string }) => <div data-testid="villa-card">{props.title}</div>,
}));
const heroProps: Record<string, unknown>[] = [];
vi.mock("@/app/components/ui/PageHero", () => ({
  default: (props: Record<string, unknown>) => {
    heroProps.push(props);
    return <h1 data-testid="hero-title">{String(props.title)}</h1>;
  },
}));

/* ---------------- fixture ---------------- */
const UUID = "11111111-2222-4333-8444-555555555555";
const TYPES = [
  { id: "t-muh", name: "Muhafazakar Villalar", slug: "muhafazakar-villalar", cover_image: null },
  { id: "t-bos", name: "Boş Kategori", slug: "bos-kategori", cover_image: null },
  { id: "t-noslug", name: "Slugsuz", slug: null, cover_image: null },
];
const LOCATIONS = [
  { id: "l-bodrum", name: "Bodrum", slug: "bodrum", filter_group_name: "Bodrum", cover_image: null },
  { id: "l-yali", name: "Yalıkavak", slug: "yalikavak", filter_group_name: "Bodrum", cover_image: null },
  { id: "l-turk", name: "Türkbükü", slug: "turkbuku", filter_group_name: "Bodrum ", cover_image: null },
  { id: "l-kas", name: "Kaş", slug: "kas", filter_group_name: "Kaş", cover_image: null },
  /* Kökü olmayan grup: "Datça" adında kayıt yok. */
  { id: "l-mesu", name: "Mesudiye", slug: "mesudiye", filter_group_name: "Datça", cover_image: null },
  { id: "l-free", name: "Serbest", slug: "serbest", filter_group_name: null, cover_image: null },
];
const villa = (id: string, title: string) => ({
  id, slug: id, title, location: "x", price: 1000, currency: "TRY",
  images: [], badge: "", bedrooms: 2, bathrooms: 1, guests: 4,
});
const VILLAS = Array.from({ length: 15 }, (_, i) => villa(`v${i + 1}`, `Villa ${i + 1}`));

beforeEach(() => {
  vi.clearAllMocks();
  sidebarProps.length = 0;
  heroProps.length = 0;
  typesMock.mockResolvedValue(TYPES);
  locationsMock.mockResolvedValue(LOCATIONS);
  villasMock.mockResolvedValue(VILLAS);
  settingsMock.mockResolvedValue({ site_name: "Balayı Villanız", multilingual_enabled: false });
  typeNamesMock.mockResolvedValue({ "t-muh": { en: "Conservative Villas", de: "Konservative Villen" } });
  typeRelsMock.mockImplementation(async (ids: string[]) => ({
    data: ids[0] === "t-muh"
      ? ["v1", "v2", "v3", "v99-inactive"].map((villa_id) => ({ villa_id, type_id: "t-muh" }))
      : [],
    error: null,
  }));
  villaIdsByLocMock.mockImplementation(async () => ({
    data: [{ id: "v4" }, { id: "v5" }, { id: "v6" }],
    error: null,
  }));
  coversMock.mockResolvedValue({ "t-muh": { villaCount: 3, coverImageUrl: null }, "t-noslug": { villaCount: 2, coverImageUrl: null } });
  locCountsMock.mockResolvedValue({ "l-yali": 2, "l-kas": 0, "l-mesu": 4, "l-free": 1 });
});

/* ===============================================================
   A) SAF LİNK KURALLARI
   =============================================================== */
describe("A) link kuralları", () => {
  it("kategori: slug → /villa-turleri/<slug>; slug yoksa ESKİ /arama (uuid)", () => {
    expect(categoryLinkHref({ id: "t-muh", slug: "muhafazakar-villalar" })).toBe(
      "/villa-turleri/muhafazakar-villalar"
    );
    expect(categoryLinkHref({ id: UUID, slug: null })).toBe(`/arama?villa-turleri=${UUID}`);
    expect(categoryLinkHref({ id: UUID, slug: "  " })).toBe(`/arama?villa-turleri=${UUID}`);
  });

  it("bölge: grup kökü → /bolgeler/<slug>; alt bölge / grupsuz / slug'sız → ESKİ /arama", () => {
    expect(regionLinkHref(LOCATIONS[0])).toBe("/bolgeler/bodrum");
    expect(regionLinkHref(LOCATIONS[1])).toBe("/arama?bolgeler=yalikavak");
    expect(regionLinkHref(LOCATIONS[5])).toBe("/arama?bolgeler=serbest");
    expect(regionLinkHref({ id: UUID, name: "Kalkan", filter_group_name: "Kalkan", slug: null })).toBe(
      `/arama?bolgeler=${UUID}`
    );
    /* filter_group_name bilgisi yoksa (eski veri şekli) → eski davranış */
    expect(regionLinkHref({ id: "l", name: "Kalkan", slug: "kalkan" })).toBe("/arama?bolgeler=kalkan");
  });

  it("UUID görünümlü slug landing'e gitmez; param normalize edilir", () => {
    expect(landingSlugOf(UUID)).toBeNull();
    expect(landingSlugOf(" kas ")).toBe("kas");
    expect(normalizeLandingParam("ka%C5%9F")).toBe("kaş");
    expect(normalizeLandingParam("%E0%A4%A")).toBe("%E0%A4%A");
  });

  it("grup üyeleri: trim'li grup adı eşleşir (kök dahil)", () => {
    expect(isRegionGroupRoot(LOCATIONS[0])).toBe(true);
    expect(isRegionGroupRoot(LOCATIONS[1])).toBe(false);
    expect(regionGroupMemberIds(LOCATIONS[0], LOCATIONS).sort()).toEqual(
      ["l-bodrum", "l-turk", "l-yali"]
    );
  });
});

/* ===============================================================
   B) KAYNAK KİLİDİ — /arama grup genişletme kuralıyla AYNI
   =============================================================== */
describe("B) /arama grup kuralı paritesi", () => {
  it("AramaPageBody expandedRegions aynı kök + üye kuralını kullanıyor (değişmedi)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "app/components/search/AramaPageBody.tsx"),
      "utf-8"
    );
    expect(src).toContain('const group = (loc?.filter_group_name || "").trim();');
    expect(src).toContain("const isGroupRoot = !!loc && !!group && loc.name === group;");
    expect(src).toContain('if ((o.filter_group_name || "").trim() === group) out.add(o.id);');
  });
});

/* ===============================================================
   C) SERVER ÇÖZÜMÜ
   =============================================================== */
describe("C) server çözümü", () => {
  it("kategori: geçerli slug → id + villa kümesi (type relations)", async () => {
    const { resolveCategoryLanding } = await import("@/lib/taxonomy-landing.server");
    const r = await resolveCategoryLanding("muhafazakar-villalar");
    expect(r?.id).toBe("t-muh");
    expect(typeRelsMock).toHaveBeenCalledWith(["t-muh"]);
    expect([...r!.villaIds].sort()).toEqual(["v1", "v2", "v3", "v99-inactive"]);
  });

  it("kategori: geçersiz slug / UUID / boş → null (404)", async () => {
    const { resolveCategoryLanding } = await import("@/lib/taxonomy-landing.server");
    expect(await resolveCategoryLanding("yok-boyle")).toBeNull();
    expect(await resolveCategoryLanding(UUID)).toBeNull();
    expect(await resolveCategoryLanding("")).toBeNull();
    expect(typeRelsMock).not.toHaveBeenCalled();
  });

  it("bölge: grup kökü → grubun TÜM bölgeleriyle villa sorgusu", async () => {
    const { resolveRegionGroupLanding } = await import("@/lib/taxonomy-landing.server");
    const r = await resolveRegionGroupLanding("bodrum");
    expect(r?.id).toBe("l-bodrum");
    expect(villaIdsByLocMock).toHaveBeenCalledTimes(1);
    expect((villaIdsByLocMock.mock.calls[0][0] as string[]).sort()).toEqual([
      "l-bodrum",
      "l-turk",
      "l-yali",
    ]);
    expect([...r!.villaIds].sort()).toEqual(["v4", "v5", "v6"]);
  });

  it("bölge: alt bölge / kökü olmayan grup / grupsuz / UUID / geçersiz → null", async () => {
    const { resolveRegionGroupLanding } = await import("@/lib/taxonomy-landing.server");
    for (const s of ["yalikavak", "turkbuku", "mesudiye", "serbest", UUID, "yok"]) {
      expect(await resolveRegionGroupLanding(s), s).toBeNull();
    }
    expect(villaIdsByLocMock).not.toHaveBeenCalled();
  });

  it("DB hatası 'boş kategori' sayılmaz → hata fırlatır (noindex'e düşmez)", async () => {
    typeRelsMock.mockResolvedValueOnce({ data: null, error: { message: "db down" } });
    const { resolveCategoryLanding } = await import("@/lib/taxonomy-landing.server");
    await expect(resolveCategoryLanding("muhafazakar-villalar")).rejects.toThrow(/db down/);
  });

  it("public villa sayısı getCachedVillas kümesiyle kesişim (pasif villa sayılmaz)", async () => {
    const { countPublicLandingVillas } = await import("@/lib/taxonomy-landing.server");
    expect(await countPublicLandingVillas(new Set(["v1", "v2", "v99-inactive"]))).toBe(2);
    expect(await countPublicLandingVillas(new Set())).toBe(0);
  });
});

/* ===============================================================
   D) METADATA
   =============================================================== */
describe("D) metadata", () => {
  const sp = (o: Record<string, string> = {}) => Promise.resolve(o);

  it("kategori TR: title/description/canonical/OG; hreflang kapalı", async () => {
    const { buildTaxonomyLandingMetadata } = await import(
      "@/app/components/search/TaxonomyLandingPageBody"
    );
    const m = await buildTaxonomyLandingMetadata("category", "muhafazakar-villalar", "tr", sp());
    expect(m.title).toBe("Muhafazakar Villalar | Balayı Villanız");
    expect(String(m.description)).toContain("Muhafazakar Villalar");
    expect(m.alternates).toEqual({ canonical: "/villa-turleri/muhafazakar-villalar" });
    expect((m.openGraph as { title: string }).title).toBe(m.title);
    expect((m.twitter as { title: string }).title).toBe(m.title);
    expect(m.robots).toBeUndefined();
  });

  it("bölge TR: 'Bodrum Villaları | marka'; EN 'Bodrum Villas', DE 'Villen in Bodrum'", async () => {
    const { buildTaxonomyLandingMetadata } = await import(
      "@/app/components/search/TaxonomyLandingPageBody"
    );
    expect((await buildTaxonomyLandingMetadata("region", "bodrum", "tr", sp())).title).toBe(
      "Bodrum Villaları | Balayı Villanız"
    );
    expect((await buildTaxonomyLandingMetadata("region", "bodrum", "en", sp())).title).toBe(
      "Bodrum Villas | Balayı Villanız"
    );
    expect((await buildTaxonomyLandingMetadata("region", "bodrum", "de", sp())).title).toBe(
      "Villen in Bodrum | Balayı Villanız"
    );
  });

  it("EN kategori adı mevcut çeviri sisteminden; canonical /en/... ; hreflang açık", async () => {
    settingsMock.mockResolvedValue({ site_name: "Balayı Villanız", multilingual_enabled: true });
    const { buildTaxonomyLandingMetadata } = await import(
      "@/app/components/search/TaxonomyLandingPageBody"
    );
    const m = await buildTaxonomyLandingMetadata("category", "muhafazakar-villalar", "en", sp());
    expect(m.title).toBe("Conservative Villas | Balayı Villanız");
    expect(m.alternates).toEqual({
      canonical: "/en/villa-turleri/muhafazakar-villalar",
      languages: {
        tr: "/villa-turleri/muhafazakar-villalar",
        en: "/en/villa-turleri/muhafazakar-villalar",
        de: "/de/villa-turleri/muhafazakar-villalar",
        "x-default": "/villa-turleri/muhafazakar-villalar",
      },
    });
  });

  it("sayfa 2 → self canonical ?page=2; sort/pageSize varyantı → temel URL", async () => {
    villasMock.mockResolvedValue(VILLAS);
    typeRelsMock.mockResolvedValue({
      data: VILLAS.map((v) => ({ villa_id: v.id, type_id: "t-muh" })),
      error: null,
    });
    const { buildTaxonomyLandingMetadata } = await import(
      "@/app/components/search/TaxonomyLandingPageBody"
    );
    const p2 = await buildTaxonomyLandingMetadata("category", "muhafazakar-villalar", "tr", sp({ page: "2" }));
    expect((p2.alternates as { canonical: string }).canonical).toBe(
      "/villa-turleri/muhafazakar-villalar?page=2"
    );
    const big = await buildTaxonomyLandingMetadata(
      "category", "muhafazakar-villalar", "tr", sp({ page: "2", pageSize: "30" })
    );
    expect((big.alternates as { canonical: string }).canonical).toBe(
      "/villa-turleri/muhafazakar-villalar"
    );
    const sorted = await buildTaxonomyLandingMetadata(
      "category", "muhafazakar-villalar", "tr", sp({ sort: "price-asc" })
    );
    expect((sorted.alternates as { canonical: string }).canonical).toBe(
      "/villa-turleri/muhafazakar-villalar"
    );
  });

  it("villası olmayan kategori → noindex,follow (404 değil)", async () => {
    const { buildTaxonomyLandingMetadata } = await import(
      "@/app/components/search/TaxonomyLandingPageBody"
    );
    const m = await buildTaxonomyLandingMetadata("category", "bos-kategori", "tr", sp());
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("geçersiz slug / alt bölge / UUID → notFound()", async () => {
    const { buildTaxonomyLandingMetadata } = await import(
      "@/app/components/search/TaxonomyLandingPageBody"
    );
    await expect(buildTaxonomyLandingMetadata("category", "yok", "tr", sp())).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(buildTaxonomyLandingMetadata("region", "yalikavak", "tr", sp())).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(buildTaxonomyLandingMetadata("region", UUID, "tr", sp())).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

/* ===============================================================
   E) GÖVDE — mevcut arşiv gövdesine scope ile delege
   =============================================================== */
describe("E) gövde", () => {
  async function renderLanding(kind: "category" | "region", slug: string, spObj: Record<string, string> = {}) {
    const { default: Body } = await import("@/app/components/search/TaxonomyLandingPageBody");
    const el = await Body({ kind, slug, locale: "tr", searchParams: Promise.resolve(spObj) });
    /* Gövde, MEVCUT arşiv gövdesine (async server component) delege eder;
       RTL async bileşen çalıştırmadığı için element'i elle çözüyoruz. */
    const inner = el as unknown as {
      type: (p: unknown) => Promise<React.ReactElement>;
      props: unknown;
    };
    const { default: Archive } = await import("@/app/components/search/KiralikVillalarPageBody");
    expect(inner.type).toBe(Archive);
    return render(await inner.type(inner.props));
  }

  it("kategori: yalnız kapsamdaki PUBLIC villalar; hero + breadcrumb", async () => {
    const { findAllByTestId } = await renderLanding("category", "muhafazakar-villalar");
    const cards = await findAllByTestId("villa-card");
    expect(cards.map((c) => c.textContent)).toEqual(["Villa 1", "Villa 2", "Villa 3"]);
    const hero = heroProps.at(-1)!;
    expect(hero.title).toBe("Muhafazakar Villalar");
    expect(hero.eyebrow).toBe("Villa Kategorisi");
    expect(hero.breadcrumb).toEqual([
      { name: tr.villasArchive.breadcrumbHome, href: "/" },
      { name: tr.villasArchive.breadcrumbCurrent, href: "/kiralik-villalar" },
      { name: "Muhafazakar Villalar" },
    ]);
  });

  it("🎨 kategori + bölge landing'leri kompakt listing hero kullanır (veri prop'ları AYNEN)", async () => {
    await renderLanding("category", "muhafazakar-villalar");
    expect(heroProps.at(-1)!.variant).toBe("listing");
    expect((heroProps.at(-1)!.stat as { value: number }).value).toBe(3);
    heroProps.length = 0;
    await renderLanding("region", "bodrum");
    expect(heroProps.at(-1)!.variant).toBe("listing");
    expect(heroProps.at(-1)!.title).toBe("Bodrum Villaları");
  });

  it("sidebar ön-seçimi + redirect hedefi MEVCUT /arama", async () => {
    await renderLanding("category", "muhafazakar-villalar");
    const sb = sidebarProps.at(-1)!;
    expect(sb.mode).toBe("redirect");
    expect(sb.basePath).toBe("/arama");
    expect((sb.initial as { categories: string[] }).categories).toEqual(["t-muh"]);

    await renderLanding("region", "bodrum");
    const rb = sidebarProps.at(-1)!;
    expect((rb.initial as { regions: string[] }).regions).toEqual(["l-bodrum"]);
    expect(rb.basePath).toBe("/arama");
  });

  it("bölge: grubun villaları + 'Bodrum Villaları' başlığı", async () => {
    const { findAllByTestId } = await renderLanding("region", "bodrum");
    const cards = await findAllByTestId("villa-card");
    expect(cards.map((c) => c.textContent)).toEqual(["Villa 4", "Villa 5", "Villa 6"]);
    expect(heroProps.at(-1)!.title).toBe("Bodrum Villaları");
  });

  it("sayfalama linkleri landing path'ini kullanır (arşivi değil)", async () => {
    typeRelsMock.mockResolvedValue({
      data: VILLAS.map((v) => ({ villa_id: v.id, type_id: "t-muh" })),
      error: null,
    });
    const { container } = await renderLanding("category", "muhafazakar-villalar");
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/villa-turleri/muhafazakar-villalar?page=2");
    expect(hrefs.some((h) => h?.startsWith("/kiralik-villalar?"))).toBe(false);
  });

  it("boş kategori: sayfa render edilir (boş durum), kart yok", async () => {
    const { queryAllByTestId, getByText } = await renderLanding("category", "bos-kategori");
    expect(queryAllByTestId("villa-card")).toHaveLength(0);
    expect(getByText(tr.villasArchive.emptyTitle)).toBeTruthy();
  });

  it("geçersiz / alt bölge → notFound()", async () => {
    await expect(renderLanding("category", "yok")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(renderLanding("region", "yalikavak")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("/kiralik-villalar (scope yok) — TÜM villalar, eski breadcrumb", async () => {
    const { default: Archive } = await import("@/app/components/search/KiralikVillalarPageBody");
    const el = await Archive({ locale: "tr", searchParams: Promise.resolve({ pageSize: "100" }) });
    render(el);
    expect(screen.getAllByTestId("villa-card")).toHaveLength(15);
    expect(heroProps.at(-1)!.breadcrumb).toEqual([
      { name: tr.villasArchive.breadcrumbHome, href: "/" },
      { name: tr.villasArchive.breadcrumbCurrent },
    ]);
    expect((sidebarProps.at(-1)!.initial as { categories: string[] }).categories).toEqual([]);
  });
});

/* ===============================================================
   F) SITEMAP PATH'LERİ
   =============================================================== */
describe("F) sitemap", () => {
  it("yalnız slug'lı + villalı kategori ve grup kökleri; alt bölge YOK", async () => {
    const { getTaxonomyLandingSitemapPaths } = await import("@/lib/taxonomy-landing.server");
    const r = await getTaxonomyLandingSitemapPaths();
    /* t-bos villasız, t-noslug slug'sız → dışarıda. */
    expect(r.categories).toEqual(["/villa-turleri/muhafazakar-villalar"]);
    /* Bodrum: üyelerde 2 villa → var; Kaş: 0 → yok; Mesudiye/Serbest kök değil. */
    expect(r.regions).toEqual(["/bolgeler/bodrum"]);
  });

  it("sitemap.ts landing entry'lerini ekliyor (kaynak kilidi)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "app/sitemap.ts"), "utf-8");
    expect(src).toContain("getTaxonomyLandingSitemapPaths");
    expect(src).toMatch(/\.\.\.staticEntries,\s*\.\.\.landingEntries,/);
  });
});

/* ===============================================================
   G) LİNK ÜRETİCİLERİ
   =============================================================== */
describe("G) link üreticileri", () => {
  const maps: MenuSourceMaps = {
    pages: new Map(),
    types: new Map([
      ["t-muh", { name: "Muhafazakar Villalar", slug: "muhafazakar-villalar" }],
      [UUID, { name: "Slugsuz", slug: null }],
    ]),
    locations: new Map([
      ["l-bodrum", { name: "Bodrum", slug: "bodrum", filter_group_name: "Bodrum" }],
      ["l-yali", { name: "Yalıkavak", slug: "yalikavak", filter_group_name: "Bodrum" }],
    ]),
  };
  const row = (source_type: string, source_id: string) => ({
    id: "m", name: null, href: null, order: 1, parent_id: null, source_type, source_id,
  });

  it("menü: kategori → landing; grup kökü → landing; alt bölge → /arama; slug'sız → /arama", () => {
    expect(resolveMenuRow(row("category", "t-muh"), maps)?.href).toBe("/villa-turleri/muhafazakar-villalar");
    expect(resolveMenuRow(row("category", UUID), maps)?.href).toBe(`/arama?villa-turleri=${UUID}`);
    expect(resolveMenuRow(row("region", "l-bodrum"), maps)?.href).toBe("/bolgeler/bodrum");
    expect(resolveMenuRow(row("region", "l-yali"), maps)?.href).toBe("/arama?bolgeler=yalikavak");
  });

  it("anasayfa bölge kartı: kök slug'lı grup → /bolgeler; kökü olmayan grup → ESKİ çoklu token", async () => {
    locCountsMock.mockResolvedValue({ "l-bodrum": 1, "l-mesu": 4 });
    const { default: LocationCollection } = await import("@/app/components/villa/LocationCollection");
    const el = await LocationCollection({ locale: "tr" });
    const { container } = render(el!);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/bolgeler/bodrum");
    expect(hrefs).toContain("/arama?bolgeler=mesudiye");
  });

  it("anasayfa kategori carousel'i ve footer landing helper'ını kullanıyor (kaynak kilidi)", () => {
    const carousel = fs.readFileSync(path.join(process.cwd(), "app/components/villa/VillaTypeCarousel.tsx"), "utf-8");
    expect(carousel).toContain("categoryLinkHref({ id: item.id, slug: item.slug })");
    const footer = fs.readFileSync(path.join(process.cwd(), "app/components/layout/Footer.tsx"), "utf-8");
    expect(footer).toContain('prefix === "bolgeler" ? regionLinkHref(item) : categoryLinkHref(item)');
  });
});

/* ===============================================================
   H) ROUTE DOSYALARI
   =============================================================== */
describe("H) route dosyaları", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf-8");
  for (const [seg, kind] of [["villa-turleri", "category"], ["bolgeler", "region"]] as const) {
    it(`${seg}: TR/EN/DE dosyaları ortak gövdeyi doğru locale ile çağırır`, () => {
      const trSrc = read(`app/(public)/${seg}/[slug]/page.tsx`);
      expect(trSrc).toContain(`kind="${kind}"`);
      expect(trSrc).toContain('locale="tr"');
      expect(trSrc).not.toContain("requirePublicLocaleEnabled");
      for (const loc of ["en", "de"]) {
        const s = read(`app/(public)/${loc}/${seg}/[slug]/page.tsx`);
        expect(s).toContain(`locale="${loc}"`);
        expect(s).toContain(`setRequestLocale("${loc}")`);
        expect(s).toContain("await requirePublicLocaleEnabled();");
      }
    });
  }

  it("robots.ts landing prefix'lerini engellemiyor; /arama engeli AYNEN", () => {
    const src = read("app/robots.ts");
    expect(src).not.toMatch(/"\/villa-turleri|"\/bolgeler/);
    expect(src).toContain('"/arama",');
  });
});

/* ===============================================================
   I) SÖZLÜK
   =============================================================== */
describe("I) sözlük", () => {
  it("taxonomyLanding anahtarları TR/EN/DE'de aynı ve {name} içeriyor", () => {
    const keys = Object.keys(tr.taxonomyLanding).sort();
    expect(Object.keys(en.taxonomyLanding).sort()).toEqual(keys);
    expect(Object.keys(de.taxonomyLanding).sort()).toEqual(keys);
    for (const d of [tr, en, de]) {
      expect(d.taxonomyLanding.categoryMetaTitle).toContain("{name}");
      expect(d.taxonomyLanding.regionMetaTitle).toContain("{brand}");
    }
  });
});

/* ===============================================================
   J) ADMİN — kategori adı değişince slug korunur
   =============================================================== */
describe("J) admin slug koruması", () => {
  it("handleUpdate mevcut slug'ı explicit geçer; slug yoksa undefined (eski üretim)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "app/(admin)/maki-admin/types/page.tsx"),
      "utf-8"
    );
    expect(src).toContain("updateVillaType(id, newName, existingSlug || undefined)");
  });
});
