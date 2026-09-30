/* ===============================================================
   🛡️ /kiralik-villalar · /en/... · /de/... ÇOKLU DİL TESTLERİ
   ===============================================================
   Kapsam:
     A) Üç route da AYNI `KiralikVillalarPageBody`'yi DOĞRU locale
        ile render eder (üç kopya YOK); EN/DE gate davranışı korunur
     B) `villasArchive` dictionary namespace bütünlüğü (TR/EN/DE)
     C) TR BYTE-IDENTITY — değerler bu fazdan önceki hardcoded
        metinlerle birebir
     D) Gövde render'ı: görünür TR/EN/DE metinler, PageHero, boş
        koleksiyon durumu, "Hakkında" bloğu
     E) FilterSidebar sözleşmesi (mode="redirect" + locale + arama
        route'una giden basePath)
     F) Villa tipi çevirisi + canonical id/slug korunması
     G) Pagination / sort / pageSize URL'leri (locale-aware basePath,
        query kontratı DEĞİŞMEDİ)
     H) Locale switch — query string korunması
     I) SOURCE-LOCK — gövdede hardcoded TR kalmadı

   `arama-locale-routes.test.tsx` (Phase 13) ile AYNI desen.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import { tr } from "@/lib/i18n/dictionaries/tr";
import { en } from "@/lib/i18n/dictionaries/en";
import { de } from "@/lib/i18n/dictionaries/de";
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
import { getLocaleSwitchTargets } from "@/lib/i18n/locale-switch.helper";
import { PUBLIC_SORT_LABELS } from "@/lib/pagination";

/* ---------------- mock katmanı ---------------- */
const requirePublicLocaleEnabledMock = vi.fn();
const setRequestLocaleMock = vi.fn();
vi.mock("@/lib/i18n/public-locale-gate.server", () => ({
  requirePublicLocaleEnabled: () => requirePublicLocaleEnabledMock(),
}));
vi.mock("@/lib/i18n/request-locale.server", () => ({
  setRequestLocale: (...a: unknown[]) => setRequestLocaleMock(...a),
}));

/* --- veri katmanı (DB'ye gidilmez; davranış sözleşmesi korunur) --- */
const villasMock = vi.fn();
const locationsMock = vi.fn();
const typesMock = vi.fn();
const settingsMock = vi.fn();
vi.mock("@/lib/cache.helpers", () => ({
  getCachedVillas: () => villasMock(),
  getCachedVillaLocations: () => locationsMock(),
  getCachedVillaTypes: () => typesMock(),
  getCachedSettings: () => settingsMock(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "TRY" }) }),
}));
vi.mock("@/app/services/exchange-rate.service", () => ({
  getExchangeRatesMap: async () => ({
    rates: { USD: 32, EUR: 35, GBP: 40 },
    updatedAt: null,
  }),
}));

const typeNamesMock = vi.fn();
vi.mock("@/lib/i18n/get-villa-type-translations.server", () => ({
  getVillaTypeNamesByLocale: (ids: string[]) => typeNamesMock(ids),
}));

/* 🛡️ ADDITIVE — sidebar "Villa Özellikleri" seçenekleri `loadHeroFeatures`
   üzerinden gelir (/arama ve Hero ile AYNI action). Yalnız en alttaki
   taksonomi okuması mock'lanır; gerçek action zinciri ÇALIŞIR. Mock
   olmasaydı action fail-soft davranıp boş liste dönerdi → mevcut
   testlerin çıktısı DEĞİŞMEZ; mock sadece 22) numaralı yeni testi
   deterministik yapar. */
const featuresTaxonomyMock = vi.fn();
vi.mock("@/lib/db/villa-feature.repository", () => ({
  villaFeatureRepository: {
    findAllForPublicTaxonomy: () => featuresTaxonomyMock(),
  },
}));

/* --- ağır UI çocukları: prop-yakalayan hafif stub'lar --- */
const sidebarProps: Record<string, unknown>[] = [];
vi.mock("@/app/(public)/arama/FilterSidebar", () => ({
  default: (props: Record<string, unknown>) => {
    sidebarProps.push(props);
    return <div data-testid="filter-sidebar" />;
  },
}));

const cardProps: Record<string, unknown>[] = [];
/* 🛡️ Kart rozeti çevirisi — `getVillaBadgesByLocale` MOCK'lanır.
   Mock'suz hâlde servis fail-soft davranıp boş Map döndüğü için
   mevcut testlerin çıktısı DEĞİŞMEZ; mock yalnız aşağıdaki rozet
   testlerini deterministik yapar. */
const villaBadgesMock = vi.fn();
vi.mock("@/lib/i18n/get-villa-badge-translations.server", () => ({
  getVillaBadgesByLocale: (...a: unknown[]) => villaBadgesMock(...a),
}));

vi.mock("@/app/components/villa/VillaCard", () => ({
  default: (props: Record<string, unknown>) => {
    cardProps.push(props);
    return <div data-testid="villa-card">{String(props.title)}</div>;
  },
}));

vi.mock("@/app/components/ui/PageHero", () => ({
  default: (props: {
    breadcrumb: { name: string; href?: string }[];
    eyebrow?: string;
    title: React.ReactNode;
    stat?: { value: string | number; label: string };
  }) => (
    <div data-testid="page-hero">
      <div data-testid="hero-breadcrumb">
        {props.breadcrumb.map((c) => c.name).join(" / ")}
      </div>
      <div data-testid="hero-eyebrow">{props.eyebrow}</div>
      <h1 data-testid="hero-title">{props.title}</h1>
      <div data-testid="hero-stat">
        {props.stat ? `${props.stat.value}|${props.stat.label}` : ""}
      </div>
    </div>
  ),
}));

vi.mock("next/script", () => ({
  default: () => <div data-testid="next-script" />,
}));

import KiralikVillalarPageBody, {
  ARCHIVE_TR_PATH,
  archivePath,
} from "@/app/components/search/KiralikVillalarPageBody";

/* ---------------- fixtures / helpers ---------------- */
const REGION_OPTIONS = [
  { id: "r1", name: "Fethiye", group: "Muğla" },
  { id: "r2", name: "Kalkan", group: "Antalya" },
];
const TYPE_OPTIONS = [
  { id: "t1", name: "Muhafazakar Villalar", slug: "muhafazakar-villalar" },
  { id: "t2", name: "Balayı Villaları", slug: "balayi-villalari" },
];

function villa(i: number) {
  return {
    id: `v${i}`,
    slug: `villa-${i}`,
    title: `Villa ${i}`,
    location: "Fethiye",
    price: 1000 + i,
    currency: "TRY",
    images: [`img-${i}.jpg`],
    badge: null,
    bedrooms: 3,
    bathrooms: 2,
    guests: 6,
    review_average: null,
    review_count: 0,
  };
}
const MANY_VILLAS = Array.from({ length: 30 }, (_, i) => villa(i + 1));

async function renderBody(
  locale: "tr" | "en" | "de",
  sp: Record<string, string> = {}
) {
  const element = await KiralikVillalarPageBody({
    locale,
    searchParams: Promise.resolve(sp),
  });
  return render(element);
}

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf-8");
}

/** Yorumları temizler — source-lock YALNIZ koda bakmalı. */
function stripComments(src: string): string {
  const out: string[] = [];
  let i = 0;
  const n = src.length;
  let state: "code" | "block" | "line" = "code";
  while (i < n) {
    const ch = src[i];
    if (state === "code") {
      if (src.startsWith("/*", i)) {
        state = "block";
        i += 2;
        continue;
      }
      if (src.startsWith("//", i)) {
        state = "line";
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        const q = ch;
        out.push(ch);
        i += 1;
        while (i < n) {
          if (src[i] === "\\") {
            out.push(src[i]);
            if (i + 1 < n) out.push(src[i + 1]);
            i += 2;
            continue;
          }
          out.push(src[i]);
          if (src[i] === q) {
            i += 1;
            break;
          }
          i += 1;
        }
        continue;
      }
      out.push(ch);
      i += 1;
      continue;
    }
    if (state === "block") {
      if (src.startsWith("*/", i)) {
        state = "code";
        i += 2;
        continue;
      }
      out.push(ch === "\n" ? "\n" : " ");
      i += 1;
      continue;
    }
    if (ch === "\n") {
      state = "code";
      out.push("\n");
      i += 1;
      continue;
    }
    out.push(" ");
    i += 1;
  }
  return out.join("");
}

function leafPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k)
  );
}
function leafValues(obj: unknown): string[] {
  if (typeof obj === "string") return [obj];
  if (typeof obj !== "object" || obj === null) return [];
  return Object.values(obj as Record<string, unknown>).flatMap(leafValues);
}

const BODY_SRC = "app/components/search/KiralikVillalarPageBody.tsx";

beforeEach(() => {
  vi.clearAllMocks();
  sidebarProps.length = 0;
  featuresTaxonomyMock.mockResolvedValue({
    data: [
      { id: "f-2", name: "Sauna" },
      { id: "f-1", name: "Jakuzi" },
    ],
    error: null,
  });
  cardProps.length = 0;
  requirePublicLocaleEnabledMock.mockResolvedValue(undefined);
  villasMock.mockResolvedValue(MANY_VILLAS);
  locationsMock.mockResolvedValue(REGION_OPTIONS);
  typesMock.mockResolvedValue(TYPE_OPTIONS);
  settingsMock.mockResolvedValue({ site_name: "Tatilin Yeri" });
  typeNamesMock.mockResolvedValue({
    t1: { en: "Conservative Villas", de: "Konservative Villen" },
    t2: { en: "Honeymoon Villas", de: "Flitterwochen-Villen" },
  });
  villaBadgesMock.mockResolvedValue(new Map());
});

/* ===============================================================
   A) ROUTE DAVRANIŞI
   =============================================================== */
const LOCALE_ROUTES: Array<[string, "en" | "de"]> = [
  ["@/app/(public)/en/kiralik-villalar/page", "en"],
  ["@/app/(public)/de/kiralik-villalar/page", "de"],
];

describe.each(LOCALE_ROUTES)("%s", (modulePath, locale) => {
  const sp = Promise.resolve({});

  it(`1) ORTAK KiralikVillalarPageBody'yi locale="${locale}" ile render eder`, async () => {
    const { default: Page } = await import(modulePath);
    const element = await Page({ searchParams: sp });

    expect(setRequestLocaleMock).toHaveBeenCalledWith(locale);
    expect(requirePublicLocaleEnabledMock).toHaveBeenCalledTimes(1);
    expect(element.type).toBe(KiralikVillalarPageBody);
    expect(element.props.locale).toBe(locale);
    /* searchParams AYNEN geçirilir — URL kontratı değişmedi. */
    expect(element.props.searchParams).toBe(sp);
  });

  it("2) multilingual KAPALI → notFound() PROPAGATE eder", async () => {
    requirePublicLocaleEnabledMock.mockRejectedValue(
      new Error("NEXT_NOT_FOUND")
    );
    const { default: Page } = await import(modulePath);
    await expect(Page({ searchParams: sp })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("3) placeholder koşulsuz noindex metadata'sı KALDIRILDI, generateMetadata var", async () => {
    const mod = await import(modulePath);
    expect(mod.metadata).toBeUndefined();
    expect(typeof mod.generateMetadata).toBe("function");
  });

  it("4) route segment config EKLENMEDİ (TR ile aynı: dynamic/revalidate yok)", async () => {
    const mod = await import(modulePath);
    expect(mod.dynamic).toBeUndefined();
    expect(mod.revalidate).toBeUndefined();
  });
});

describe("app/(public)/kiralik-villalar/page.tsx — TR", () => {
  it("5) ORTAK gövdeyi locale='tr' ile render eder", async () => {
    const sp = Promise.resolve({});
    const { default: Page } = await import(
      "@/app/(public)/kiralik-villalar/page"
    );
    const element = await Page({ searchParams: sp });
    expect(element.type).toBe(KiralikVillalarPageBody);
    expect(element.props.locale).toBe("tr");
    expect(element.props.searchParams).toBe(sp);
  });

  it("6) TR'de locale gate'i ÇAĞRILMAZ (davranış değişmedi)", async () => {
    const { default: Page } = await import(
      "@/app/(public)/kiralik-villalar/page"
    );
    await Page({ searchParams: Promise.resolve({}) });
    expect(setRequestLocaleMock).not.toHaveBeenCalled();
    expect(requirePublicLocaleEnabledMock).not.toHaveBeenCalled();
  });

  it("7) TR'de de route segment config YOK (mevcut davranış korundu)", async () => {
    const mod: Record<string, unknown> = await import(
      "@/app/(public)/kiralik-villalar/page"
    );
    expect(mod.dynamic).toBeUndefined();
    expect(mod.revalidate).toBeUndefined();
  });
});

/* ===============================================================
   B) DICTIONARY BÜTÜNLÜĞÜ
   =============================================================== */
describe("`villasArchive` namespace bütünlüğü", () => {
  it("8) TR/EN/DE'de AYNI key ağacı", () => {
    const trPaths = leafPaths(tr.villasArchive).sort();
    expect(leafPaths(en.villasArchive).sort()).toEqual(trPaths);
    expect(leafPaths(de.villasArchive).sort()).toEqual(trPaths);
    expect(trPaths.length).toBe(20);
  });

  it("9) hiçbir dilde boş değer yok", () => {
    for (const [name, d] of [
      ["tr", tr],
      ["en", en],
      ["de", de],
    ] as const) {
      for (const v of leafValues(d.villasArchive)) {
        expect(typeof v, name).toBe("string");
        expect(v.trim().length, `${name}: "${v}"`).toBeGreaterThan(0);
      }
    }
  });

  it("10) EN'de Türkçe karakter yok", () => {
    for (const v of leafValues(en.villasArchive)) {
      expect(/[çÇğĞıİöÖşŞüÜ]/.test(v), v).toBe(false);
    }
  });

  it("11) DE'de Türkçeye ÖZGÜ karakter yok (ö/ü Almancada geçerli)", () => {
    for (const v of leafValues(de.villasArchive)) {
      expect(/[çÇğĞıİşŞ]/.test(v), v).toBe(false);
    }
  });

  it("12) `metaTitle` üç dilde de `{brand}` placeholder'ını KORUYOR", () => {
    for (const d of [tr, en, de]) {
      expect(d.villasArchive.metaTitle).toContain("{brand}");
    }
  });
});

/* ===============================================================
   C) TR BYTE-IDENTITY
   =============================================================== */
describe("TR byte-identity — eski hardcoded metinler", () => {
  it("13) `villasArchive` TR değerleri BİREBİR", () => {
    const a = tr.villasArchive;
    expect(a.metaTitle).toBe("Kiralık Villalar — {brand}");
    expect(a.metaDescription).toBe(
      "Akdeniz'in seçkin koleksiyonu. Özel havuz, deniz manzarası ve butik konforla tasarlanmış kiralık villaları keşfedin."
    );
    expect(a.breadcrumbHome).toBe("Ana sayfa");
    expect(a.breadcrumbCurrent).toBe("Kiralık Villalar");
    expect(a.heroEyebrow).toBe("Tüm Villalar");
    expect(a.heroTitle).toBe("Kiralık Villalar");
    expect(a.heroStatLabel).toBe("Aktif Villa");
    expect(a.collectionName).toBe("Kiralık Villalar");
    expect(a.collectionDescription).toBe(
      "Akdeniz'in seçkin kiralık villa koleksiyonu — özel havuz, deniz manzarası, butik konfor."
    );
    expect(a.emptyEyebrow).toBe("Koleksiyon");
    expect(a.emptyTitle).toBe("Yakında burada.");
    expect(a.emptyBody).toBe(
      "Koleksiyon henüz oluşturuluyor. Yakında keşfedilmeyi bekleyecek."
    );
    expect(a.aboutEyebrow).toBe("Hakkında");
    expect(a.aboutTitleLead).toBe("Bir konaklamadan");
    expect(a.aboutTitleAccent).toBe("fazlası.");
    expect(a.aboutParagraph3LinkLabel).toBe("arama sayfasından");
    expect(a.aboutParagraph3Trail).toBe("sonuçları görüntüleyebilirsiniz.");
  });

  it("14) PAYLAŞILAN toolbar metinleri `search` namespace'inden gelir (kopya YOK)", () => {
    /* Eski /kiralik-villalar hardcoded metinleri ile birebir. */
    expect(tr.search.sortLabel).toBe("Sırala");
    expect(tr.search.sortAriaLabel).toBe("Villa sıralaması");
    expect(tr.search.pageSizeLabel).toBe("Sayfa başına");
    expect(tr.search.pageSizeAriaLabel).toBe("Sayfa başına villa sayısı");
    expect(tr.search.paginationAriaLabel).toBe("Sayfalar");
    expect(tr.search.paginationPrev).toBe("Önceki");
    expect(tr.search.paginationNext).toBe("Sonraki");
  });

  it("15) sıralama etiketleri `PUBLIC_SORT_LABELS` ile lockstep (lib/pagination DEĞİŞMEDİ)", () => {
    expect(tr.search.sortOptions.smart).toBe(PUBLIC_SORT_LABELS.smart);
    expect(tr.search.sortOptions.priceAsc).toBe(
      PUBLIC_SORT_LABELS["price-asc"]
    );
    expect(tr.search.sortOptions.priceDesc).toBe(
      PUBLIC_SORT_LABELS["price-desc"]
    );
    expect(tr.search.sortOptions.capacityAsc).toBe(
      PUBLIC_SORT_LABELS["capacity-asc"]
    );
    expect(tr.search.sortOptions.capacityDesc).toBe(
      PUBLIC_SORT_LABELS["capacity-desc"]
    );
  });
});

/* ===============================================================
   D) GÖVDE RENDER — görünür metinler
   =============================================================== */
describe("Gövde render — TR/EN/DE görünür metinler", () => {
  it.each(["tr", "en", "de"] as const)(
    "16) %s: hero breadcrumb/eyebrow/başlık/stat kendi dilinde",
    async (locale) => {
      const d = { tr, en, de }[locale].villasArchive;
      await renderBody(locale);
      expect(screen.getByTestId("hero-breadcrumb")).toHaveTextContent(
        `${d.breadcrumbHome} / ${d.breadcrumbCurrent}`
      );
      expect(screen.getByTestId("hero-eyebrow")).toHaveTextContent(
        d.heroEyebrow
      );
      expect(screen.getByTestId("hero-title")).toHaveTextContent(d.heroTitle);
      expect(screen.getByTestId("hero-stat")).toHaveTextContent(
        `30|${d.heroStatLabel}`
      );
    }
  );

  it.each(["tr", "en", "de"] as const)(
    "17) %s: 'Hakkında' bloğu kendi dilinde",
    async (locale) => {
      const d = { tr, en, de }[locale].villasArchive;
      await renderBody(locale);
      expect(screen.getByText(d.aboutEyebrow)).toBeInTheDocument();
      expect(screen.getByText(d.aboutParagraph1)).toBeInTheDocument();
      expect(screen.getByText(d.aboutParagraph2)).toBeInTheDocument();
      const link = screen.getByRole("link", {
        name: d.aboutParagraph3LinkLabel,
      });
      /* Arama route'u locale-aware. */
      expect(link).toHaveAttribute(
        "href",
        buildLocaleAlternates("/arama", locale).canonical
      );
    }
  );

  it.each(["tr", "en", "de"] as const)(
    "18) %s: boş koleksiyon durumu kendi dilinde",
    async (locale) => {
      villasMock.mockResolvedValue([]);
      const d = { tr, en, de }[locale].villasArchive;
      await renderBody(locale);
      expect(screen.getByText(d.emptyEyebrow)).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: d.emptyTitle })
      ).toBeInTheDocument();
      expect(screen.getByText(d.emptyBody)).toBeInTheDocument();
      expect(screen.queryAllByTestId("villa-card")).toHaveLength(0);
    }
  );

  it("19) TR görünümünde EN/DE metinleri SIZMAZ (regresyon)", async () => {
    await renderBody("tr");
    expect(screen.queryByText(en.villasArchive.heroEyebrow)).toBeNull();
    expect(screen.queryByText(de.villasArchive.aboutEyebrow)).toBeNull();
  });
});

/* ===============================================================
   E) FILTERSIDEBAR SÖZLEŞMESİ
   =============================================================== */
describe("FilterSidebar sözleşmesi", () => {
  it.each([
    ["tr", "/arama"],
    ["en", "/en/arama"],
    ["de", "/de/arama"],
  ] as const)(
    "20) %s: mode='redirect' + locale + basePath='%s' (arama route'u, bu sayfa DEĞİL)",
    async (locale, expectedBasePath) => {
      await renderBody(locale);
      expect(sidebarProps).toHaveLength(1);
      const p = sidebarProps[0];
      expect(p.mode).toBe("redirect");
      expect(p.locale).toBe(locale);
      expect(p.basePath).toBe(expectedBasePath);
      /* Archive page: filtre state'i boş başlar (mevcut davranış). */
      expect(p.initial).toEqual({
        regions: [],
        categories: [],
        start: null,
        end: null,
        guests: 0,
      });
    }
  );

  it("21) bölge seçenekleri ÇEVRİLMEZ (Phase 10I canonical özel isim)", async () => {
    await renderBody("en");
    expect(sidebarProps[0].regionOptions).toEqual(REGION_OPTIONS);
  });

  it("22) villa ÖZELLİK seçenekleri sidebar'a geçer; `initial` BOŞ sözleşmesi korunur", async () => {
    await renderBody("tr");
    const p = sidebarProps[0];
    /* Seçenekler server'dan TEK SEFER prop olarak iner (client sorgu YOK). */
    expect(featuresTaxonomyMock).toHaveBeenCalledTimes(1);
    expect(
      (p.featureOptions as Array<{ id: string; name: string }>).map(
        (f) => f.name
      )
    ).toEqual(["Jakuzi", "Sauna"]);
    /* 🔒 Arşiv sözleşmesi: URL okunmaz → `initial.features` VERİLMEZ
       (bölüm seçim yokken KAPALI başlar). */
    expect(
      (p.initial as Record<string, unknown>).features
    ).toBeUndefined();
  });
});

/* ===============================================================
   F) VİLLA TİPİ ÇEVİRİSİ
   =============================================================== */
describe("Villa tipi çevirisi", () => {
  it("22) TR'de çeviri sorgusu HİÇ atılmaz (sorgu sayısı değişmedi)", async () => {
    await renderBody("tr");
    expect(typeNamesMock).not.toHaveBeenCalled();
    expect(sidebarProps[0].categoryOptions).toBe(
      await typesMock.mock.results[0].value
    );
  });

  it.each([
    ["en", "Conservative Villas", "Honeymoon Villas"],
    ["de", "Konservative Villen", "Flitterwochen-Villen"],
  ] as const)(
    "23) %s: sidebar villa tipi adları çevrilir",
    async (locale, n1, n2) => {
      await renderBody(locale);
      const opts = sidebarProps[0].categoryOptions as Array<{
        id: string;
        name: string;
        slug: string;
      }>;
      expect(opts.map((o) => o.name)).toEqual([n1, n2]);
    }
  );

  it("24) TEK batch `.in()` sorgusu — N+1 YOK", async () => {
    await renderBody("en");
    expect(typeNamesMock).toHaveBeenCalledTimes(1);
    expect(typeNamesMock).toHaveBeenCalledWith(["t1", "t2"]);
  });

  it("25) CANONICAL id/slug DEĞİŞMEZ — yalnız görünen `name` çevrilir", async () => {
    await renderBody("de");
    const opts = sidebarProps[0].categoryOptions as Array<{
      id: string;
      slug: string;
    }>;
    expect(opts.map((o) => o.id)).toEqual(["t1", "t2"]);
    expect(opts.map((o) => o.slug)).toEqual([
      "muhafazakar-villalar",
      "balayi-villalari",
    ]);
  });

  it("26) çeviri okuması hata verirse TR canonical adına DÜŞER (sayfa çökmez)", async () => {
    typeNamesMock.mockRejectedValue(new Error("db down"));
    await renderBody("en");
    const opts = sidebarProps[0].categoryOptions as Array<{ name: string }>;
    expect(opts.map((o) => o.name)).toEqual([
      "Muhafazakar Villalar",
      "Balayı Villaları",
    ]);
  });

  it("27) VillaCard `locale` prop'u alır (kart metinleri + detay linki)", async () => {
    await renderBody("de");
    expect(cardProps.length).toBeGreaterThan(0);
    for (const p of cardProps) expect(p.locale).toBe("de");
  });
});

/* ===============================================================
   G) URL / PAGINATION / SORT KONTRATI
   =============================================================== */
describe("URL kontratı — pagination / sort / pageSize", () => {
  it("28) archivePath() üç locale için doğru", () => {
    expect(ARCHIVE_TR_PATH).toBe("/kiralik-villalar");
    expect(archivePath("tr")).toBe("/kiralik-villalar");
    expect(archivePath("en")).toBe("/en/kiralik-villalar");
    expect(archivePath("de")).toBe("/de/kiralik-villalar");
  });

  it.each([
    ["tr", "/kiralik-villalar"],
    ["en", "/en/kiralik-villalar"],
    ["de", "/de/kiralik-villalar"],
  ] as const)(
    "29) %s: pagination linkleri locale'li basePath kullanır, query adları AYNI",
    async (locale, base) => {
      const d = { tr, en, de }[locale].search;
      await renderBody(locale, { pageSize: "12" });
      const nav = screen.getByRole("navigation", {
        name: d.paginationAriaLabel,
      });
      const next = screen.getByRole("link", { name: d.paginationNext });
      expect(next).toHaveAttribute("href", `${base}?page=2`);
      /* 2. sayfa linki de aynı basePath'te. */
      expect(
        nav.querySelector('a[href="' + base + '?page=2"]')
      ).toBeTruthy();
    }
  );

  it("30) sort default ('smart') URL'e YAZILMAZ; page=1 reset korunur", async () => {
    await renderBody("en");
    const smart = screen.getByRole("menuitemradio", {
      name: en.search.sortOptions.smart,
    });
    expect(smart).toHaveAttribute("href", "/en/kiralik-villalar");
    const priceAsc = screen.getByRole("menuitemradio", {
      name: en.search.sortOptions.priceAsc,
    });
    expect(priceAsc).toHaveAttribute(
      "href",
      "/en/kiralik-villalar?sort=price-asc"
    );
  });

  it("31) pageSize default (12) URL'e YAZILMAZ; diğerleri yazılır + sort korunur", async () => {
    await renderBody("de", { sort: "price-desc" });
    const group = screen.getByRole("group", {
      name: de.search.pageSizeAriaLabel,
    });
    const hrefs = Array.from(group.querySelectorAll("a")).map((a) =>
      a.getAttribute("href")
    );
    expect(hrefs).toEqual([
      "/de/kiralik-villalar?sort=price-desc",
      "/de/kiralik-villalar?pageSize=30&sort=price-desc",
      "/de/kiralik-villalar?pageSize=50&sort=price-desc",
      "/de/kiralik-villalar?pageSize=100&sort=price-desc",
    ]);
  });

  it("32) pagination dilimleme davranışı DEĞİŞMEDİ (30 villa / 12 per page)", async () => {
    await renderBody("tr");
    expect(screen.getAllByTestId("villa-card")).toHaveLength(12);
  });

  it("33) `?page=3` → son dilim (30 villa, 12/sayfa → 6 kart)", async () => {
    await renderBody("en", { page: "3" });
    expect(screen.getAllByTestId("villa-card")).toHaveLength(6);
  });
});

/* ===============================================================
   H) LOCALE SWITCH — QUERY STRING KORUNMASI
   =============================================================== */
describe("Locale switch — query string korunması", () => {
  const Q =
    "villa-turleri=2027-kiralik-villalar%2Cmuhafazakar-villalar&flexible=3";

  it("34) /de/kiralik-villalar + query → EN'de AYNI query (kullanıcı senaryosu)", () => {
    const t = getLocaleSwitchTargets("/de/kiralik-villalar", Q);
    expect(t.en).toBe(`/en/kiralik-villalar?${Q}`);
    expect(t.tr).toBe(`/kiralik-villalar?${Q}`);
    expect(t.de).toBe(`/de/kiralik-villalar?${Q}`);
  });

  it("35) canonical token'lar ÇEVRİLMEZ / yeniden yorumlanmaz", () => {
    const t = getLocaleSwitchTargets("/kiralik-villalar", Q);
    for (const href of [t.tr, t.en, t.de]) {
      expect(href).toContain("2027-kiralik-villalar%2Cmuhafazakar-villalar");
      expect(href).toContain("flexible=3");
    }
  });

  it("36) pagination query'si de korunur", () => {
    const t = getLocaleSwitchTargets(
      "/en/kiralik-villalar",
      "page=3&pageSize=50&sort=price-asc"
    );
    expect(t.de).toBe("/de/kiralik-villalar?page=3&pageSize=50&sort=price-asc");
  });

  it("37) query YOKSA mevcut davranış BİREBİR (soru işareti eklenmez)", () => {
    expect(getLocaleSwitchTargets("/kiralik-villalar")).toEqual({
      tr: "/kiralik-villalar",
      en: "/en/kiralik-villalar",
      de: "/de/kiralik-villalar",
    });
  });
});

/* ===============================================================
   I) SOURCE-LOCK
   =============================================================== */
describe("SOURCE-LOCK — gövdede hardcoded TR kalmadı", () => {
  const code = stripComments(readSrc(BODY_SRC));

  it("38) eski hardcoded TR metinleri KODDA yok", () => {
    for (const s of [
      "Tüm Villalar",
      "Aktif Villa",
      "Koleksiyon henüz oluşturuluyor",
      "Yakında burada.",
      "Hakkında",
      "Bir konaklamadan",
      "Sayfa başına",
      "Sayfalar",
      "Önceki",
      "Sonraki",
      "Sırala",
      "Villa sıralaması",
      "arama sayfasından",
    ]) {
      expect(code.includes(s), s).toBe(false);
    }
  });

  it("39) `PUBLIC_SORT_LABELS` ARTIK kullanılmıyor (dictionary köprüsü var)", () => {
    expect(code.includes("PUBLIC_SORT_LABELS")).toBe(false);
    expect(code.includes("SORT_DICT_KEY")).toBe(true);
  });

  it("40) URL query anahtarları DEĞİŞMEDİ", () => {
    for (const key of ['"page"', '"pageSize"', '"sort"']) {
      expect(code.includes(key), key).toBe(true);
    }
  });

  it("41) hardcoded '/arama' ve '/kiralik-villalar' literal'i sayfa linklerinde YOK (basePath türetilir)", () => {
    /* Tek izinli literal: ARCHIVE_TR_PATH tanımı. */
    const occurrences = code.split('"/kiralik-villalar"').length - 1;
    expect(occurrences).toBe(1);
    expect(code.includes('href="/arama"')).toBe(false);
  });
});

/* ===============================================================
   F) VILLA ROZETİ (villa_translations.badge) — LOCALE DAVRANIŞI
   ===============================================================
   Bu blok, rozetin EN/DE'de GERÇEKTEN çevrilmiş değerle render
   edildiğini (implementation detayını değil, VillaCard'a ulaşan
   PROP'u) doğrular. Fallback ve N+1 guard'ları da buradadır.
   Mevcut `renderBody` helper'ı REUSE edilir.
   =============================================================== */
describe("F) villa rozeti locale davranışı", () => {
  /* Rozeti DOLU canonical villalar — TR değeri açıkça Türkçe. */
  const BADGED = [
    { ...villa(1), badge: "Yeni" },
    { ...villa(2), badge: "Popüler" },
  ];

  it("30) EN — çeviri VARSA EN rozet VillaCard'a ulaşır", async () => {
    villasMock.mockResolvedValue(BADGED);
    villaBadgesMock.mockResolvedValue(
      new Map([
        ["v1", "New"],
        ["v2", "Popular"],
      ])
    );
    await renderBody("en");

    const badges = cardProps.map((p) => p.badge);
    expect(badges).toContain("New");
    expect(badges).toContain("Popular");
    expect(badges).not.toContain("Yeni");
    expect(badges).not.toContain("Popüler");
  });

  it("31) DE — çeviri VARSA DE rozet VillaCard'a ulaşır", async () => {
    villasMock.mockResolvedValue(BADGED);
    villaBadgesMock.mockResolvedValue(
      new Map([
        ["v1", "Neu"],
        ["v2", "Beliebt"],
      ])
    );
    await renderBody("de");

    const badges = cardProps.map((p) => p.badge);
    expect(badges).toContain("Neu");
    expect(badges).toContain("Beliebt");
    expect(badges).not.toContain("Yeni");
  });

  it("32) EN — çeviri YOKSA canonical TR rozet FALLBACK olarak kalır", async () => {
    villasMock.mockResolvedValue(BADGED);
    villaBadgesMock.mockResolvedValue(new Map());
    await renderBody("en");

    const badges = cardProps.map((p) => p.badge);
    expect(badges).toContain("Yeni");
    expect(badges).toContain("Popüler");
  });

  it("33) EN — KISMİ çeviri: çevrili olan çevrilir, olmayan TR kalır", async () => {
    villasMock.mockResolvedValue(BADGED);
    villaBadgesMock.mockResolvedValue(new Map([["v1", "New"]]));
    await renderBody("en");

    const badges = cardProps.map((p) => p.badge);
    expect(badges).toContain("New");
    expect(badges).toContain("Popüler");
  });

  it("34) N+1 YOK — 30 villalık sayfada rozet sorgusu TEK çağrı, TÜM id'ler TEK batch'te", async () => {
    villasMock.mockResolvedValue(MANY_VILLAS);
    villaBadgesMock.mockResolvedValue(new Map());
    await renderBody("en");

    expect(villaBadgesMock).toHaveBeenCalledTimes(1);
    const [ids, locale] = villaBadgesMock.mock.calls[0] as [string[], string];
    expect(locale).toBe("en");
    /* Sayfadaki kart sayısı kadar id TEK dizide gider. */
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBe(cardProps.length);
    expect(ids.length).toBeGreaterThan(1);
  });

  it("35) TR — canonical rozet BİREBİR korunur, servis 'tr' ile çağrılır", async () => {
    villasMock.mockResolvedValue(BADGED);
    villaBadgesMock.mockResolvedValue(new Map());
    await renderBody("tr");

    expect(villaBadgesMock.mock.calls[0][1]).toBe("tr");
    const badges = cardProps.map((p) => p.badge);
    expect(badges).toContain("Yeni");
    expect(badges).toContain("Popüler");
  });
});
