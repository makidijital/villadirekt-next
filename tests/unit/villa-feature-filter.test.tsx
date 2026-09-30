/* ===============================================================
   🛡️ VİLLA ÖZELLİKLERİ FİLTRESİ (ozellikler) — REGRESYON KİLİDİ
   ===============================================================
   Kapsam:
     A) Hiç özellik seçilmemiş → MEVCUT davranış BİREBİR (ek sorgu YOK,
        `findSearchResults` argümanları eskisiyle aynı)
     B) 1 özellik → yalnız o özelliğe sahip villalar
     C) 2+ özellik → AND (kesişim), junction'daki yinelenen satırlara
        ve URL'deki yinelenen token'a bağışık
     D) Tip + bölge + misafir + tarih ile BİRLİKTE çalışma
     E) ⚠️ KESİŞİM BOŞ → 0 SONUÇ (asla "tüm villalar")
     F) URL kontratı — `ozellikler` sayfalama/sıralama ve FilterSidebar
        "Filtrele" akışında KAYBOLMAZ; refresh'te korunur
     G) i18n — TR/EN/DE sözlük anahtarları + `loadHeroFeatures`
     H) `buildHeroSearchParams` çıktısı

   ⚠️ Mevcut hiçbir test dosyası değiştirilmedi; bu dosya EK bir ağ örer.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

/* ---------------- repository / service mock'ları ---------------- */
const findSearchResultsMock = vi.fn();
const findVillaTypeRelationsByTypeIdsMock = vi.fn();
const findAllFeaturesMock = vi.fn();
const findFeatureRelationsMock = vi.fn();
const getTranslationsForParentsMock = vi.fn();

vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findSearchResults: (opts: unknown) => findSearchResultsMock(opts),
  },
}));
vi.mock("@/lib/db/villa-type.repository", () => ({
  villaTypeRepository: {
    findVillaTypeRelationsByTypeIds: (ids: string[]) =>
      findVillaTypeRelationsByTypeIdsMock(ids),
  },
}));
vi.mock("@/lib/db/villa-feature.repository", () => ({
  villaFeatureRepository: {
    findAllForPublicTaxonomy: () => findAllFeaturesMock(),
    findVillaFeatureRelationsByFeatureIds: (ids: string[]) =>
      findFeatureRelationsMock(ids),
  },
}));
/* Gerçek `getVillaFeatureNamesByLocale` zinciri ÇALIŞIR; yalnız en
   alttaki batch DB okuması mock'lanır (homepage-p0-i18n deseni). */
vi.mock("@/lib/i18n/get-translation.server", () => ({
  getTranslationsForParents: (...a: unknown[]) =>
    getTranslationsForParentsMock(...a),
}));

vi.mock("@/lib/cache.helpers", () => ({
  getCachedVillaLocations: async () => [
    {
      id: "loc-1",
      name: "Kalkan",
      slug: "kalkan",
      filter_group_name: "Kalkan",
      show_in_filter: true,
    },
  ],
  getCachedVillaTypes: async () => [
    { id: "11111111-1111-4111-8111-111111111111", name: "Havuzlu", slug: "havuzlu" },
  ],
}));

vi.mock("@/lib/availability.helper", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/availability.helper")>();
  return { ...actual, getBlockedVillaIds: async () => new Set<string>() };
});
vi.mock("@/app/services/exchange-rate.service", () => ({
  getExchangeRatesMap: async () => ({ rates: { USD: 30, EUR: 35, GBP: 40 } }),
}));
vi.mock("@/app/services/villa-review.service", () => ({
  getVillaReviewStatsBatch: async () => ({}),
}));
vi.mock("@/lib/i18n/get-villa-type-translations.server", () => ({
  getVillaTypeNamesByLocale: async () => ({}),
}));
vi.mock("@/lib/i18n/get-villa-badge-translations.server", () => ({
  getVillaBadgesByLocale: async () => new Map<string, string>(),
}));
vi.mock("@/lib/storage.helpers", () => ({
  resolveVillaImageUrl: (u: string | null) => u || "",
  appendAssetVersion: (u: string) => u,
}));

/* ---------------- next/* mock'ları ---------------- */
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
const pushMock = vi.fn();
const searchParamsGetMock = vi.fn<(k: string) => string | null>(() => null);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: searchParamsGetMock }),
  usePathname: () => "/arama",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));
vi.mock("next/script", () => ({ default: () => null }));
vi.mock("next/image", () => ({
  /* eslint-disable-next-line @next/next/no-img-element */
  default: ({ alt }: { alt?: string }) => <img alt={alt ?? ""} />,
}));
vi.mock("@/app/components/ui/PageHero", () => ({ default: () => null }));
vi.mock("@/app/components/villa/VillaCard", () => ({
  default: ({ id }: { id: string }) => <div data-testid="villa-card">{id}</div>,
}));

/* ---------------- sabitler ---------------- */
const F1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const F2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const F3 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const TYPE_ID = "11111111-1111-4111-8111-111111111111";

const FEATURE_ROWS = [
  { id: F1, name: "Jakuzi" },
  { id: F2, name: "Sauna" },
  { id: F3, name: "Isıtmalı Havuz" },
];

function villaRow(id: string) {
  return {
    id,
    slug: id,
    title: `Villa ${id}`,
    price: 10000,
    currency: "TRY",
    badge: null,
    bedrooms: 3,
    bathrooms: 2,
    guests: 6,
    cleaning_fee: 0,
    cleaning_currency: "TRY",
    cleaning_limit: 0,
    is_active: true,
    deleted_at: null,
    location: { name: "Kalkan" },
    location_id: "loc-1",
    villa_images: [{ image_url: "/x.jpg", is_cover: true, sort_order: 0 }],
    villa_prices: [],
    villa_discounts: [],
  };
}

const ALL_VILLAS = ["v1", "v2", "v3", "v4"].map(villaRow);

type SP = Record<string, string | string[] | undefined>;

async function renderArama(sp: SP, locale: "tr" | "en" | "de" = "tr") {
  const { default: AramaPageBody } = await import(
    "@/app/components/search/AramaPageBody"
  );
  const element = await AramaPageBody({
    locale,
    searchParams: Promise.resolve(sp),
  });
  return render(element);
}

/** `findSearchResults`'a giden argüman objesi. */
function searchArgs() {
  expect(findSearchResultsMock).toHaveBeenCalledTimes(1);
  return findSearchResultsMock.mock.calls[0][0] as {
    categoryVillaIds: string[] | null;
    expandedRegions: string[];
    guests: number | null;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findSearchResultsMock.mockResolvedValue({ data: ALL_VILLAS, error: null });
  findVillaTypeRelationsByTypeIdsMock.mockResolvedValue({
    data: [],
    error: null,
  });
  findAllFeaturesMock.mockResolvedValue({ data: FEATURE_ROWS, error: null });
  findFeatureRelationsMock.mockResolvedValue({ data: [], error: null });
  getTranslationsForParentsMock.mockResolvedValue(new Map());
  if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

/* ===============================================================
   A) HİÇ ÖZELLİK SEÇİLMEMİŞ → MEVCUT DAVRANIŞ BİREBİR
   =============================================================== */
describe("A) regresyon — özellik filtresi KAPALI", () => {
  it("1) parametre yokken `findSearchResults` ESKİ argümanlarla çağrılır", async () => {
    await renderArama({});
    expect(searchArgs()).toEqual({
      categoryVillaIds: null,
      expandedRegions: [],
      guests: 0,
    });
  });

  it("2) parametre yokken PAHALI ilişki sorgusu atılmaz; seçenek listesi TEK kez okunur", async () => {
    await renderArama({ bolgeler: "kalkan", guests: "4" });
    /* ⚠️ SÖZLEŞME DEĞİŞİKLİĞİ (bilinçli): sidebar'daki "Villa
       Özellikleri" bölümü seçenek listesine HER ZAMAN ihtiyaç duyduğu
       için taksonomi okuması koşulsuz çalışır — ama mevcut Promise.all
       içinde olduğu için EK RTT YOKTUR ve TAM 1 kez çalışır (checkbox
       başına sorgu YOK). Asıl maliyetli olan junction (AND) sorgusu
       seçim yokken HÂLÂ HİÇ atılmaz. */
    expect(findAllFeaturesMock).toHaveBeenCalledTimes(1);
    expect(findFeatureRelationsMock).not.toHaveBeenCalled();
    expect(searchArgs()).toEqual({
      categoryVillaIds: null,
      expandedRegions: ["loc-1"],
      guests: 4,
    });
  });

  it("3) parametre yokken villalar NORMAL şekilde render edilir", async () => {
    await renderArama({});
    expect(screen.getAllByTestId("villa-card")).toHaveLength(4);
  });

  it("4) boş `ozellikler=` değeri filtre SAYILMAZ (eski davranış)", async () => {
    await renderArama({ ozellikler: "" });
    expect(findFeatureRelationsMock).not.toHaveBeenCalled();
    expect(searchArgs().categoryVillaIds).toBeNull();
  });
});

/* ===============================================================
   B/C) TEK ÖZELLİK · AND KESİŞİMİ
   =============================================================== */
describe("B/C) özellik filtresi — AND semantiği", () => {
  it("5) tek özellik → yalnız o özelliğe sahip villa id'leri", async () => {
    findFeatureRelationsMock.mockResolvedValue({
      data: [
        { villa_id: "v1", feature_id: F1 },
        { villa_id: "v3", feature_id: F1 },
      ],
      error: null,
    });
    await renderArama({ ozellikler: F1 });
    expect(findFeatureRelationsMock).toHaveBeenCalledWith([F1]);
    expect(searchArgs().categoryVillaIds).toEqual(["v1", "v3"]);
  });

  it("6) iki özellik → AND (ikisine de sahip olan villa)", async () => {
    findFeatureRelationsMock.mockResolvedValue({
      data: [
        { villa_id: "v1", feature_id: F1 },
        { villa_id: "v1", feature_id: F2 },
        { villa_id: "v2", feature_id: F1 },
        { villa_id: "v3", feature_id: F2 },
      ],
      error: null,
    });
    await renderArama({ ozellikler: `${F1},${F2}` });
    expect(searchArgs().categoryVillaIds).toEqual(["v1"]);
  });

  it("7) üç özellik → yalnız ÜÇÜNE de sahip villa", async () => {
    findFeatureRelationsMock.mockResolvedValue({
      data: [
        { villa_id: "v1", feature_id: F1 },
        { villa_id: "v1", feature_id: F2 },
        { villa_id: "v1", feature_id: F3 },
        { villa_id: "v2", feature_id: F1 },
        { villa_id: "v2", feature_id: F2 },
      ],
      error: null,
    });
    await renderArama({ ozellikler: `${F1},${F2},${F3}` });
    expect(searchArgs().categoryVillaIds).toEqual(["v1"]);
  });

  it("8) junction'daki YİNELENEN satır AND sayımını bozmaz", async () => {
    findFeatureRelationsMock.mockResolvedValue({
      data: [
        { villa_id: "v1", feature_id: F1 },
        { villa_id: "v1", feature_id: F1 },
        { villa_id: "v2", feature_id: F1 },
        { villa_id: "v2", feature_id: F2 },
      ],
      error: null,
    });
    await renderArama({ ozellikler: `${F1},${F2}` });
    /* v1 iki kez F1'e sahip ama F2 YOK → eşleşmez. */
    expect(searchArgs().categoryVillaIds).toEqual(["v2"]);
  });

  it("9) URL'de yinelenen token DEDUPE edilir (ozellikler=F1,F1)", async () => {
    findFeatureRelationsMock.mockResolvedValue({
      data: [{ villa_id: "v1", feature_id: F1 }],
      error: null,
    });
    await renderArama({ ozellikler: `${F1},${F1}` });
    expect(findFeatureRelationsMock).toHaveBeenCalledWith([F1]);
    expect(searchArgs().categoryVillaIds).toEqual(["v1"]);
  });

  it("10) geçersiz / bilinmeyen token DÜŞER, sorgu uuid hatası ALMAZ", async () => {
    findFeatureRelationsMock.mockResolvedValue({
      data: [{ villa_id: "v1", feature_id: F1 }],
      error: null,
    });
    await renderArama({
      ozellikler: `jakuzi,${F1},99999999-9999-4999-8999-999999999999`,
    });
    /* "jakuzi" UUID değil; son UUID `villa_features`'ta YOK → ikisi de düşer. */
    expect(findFeatureRelationsMock).toHaveBeenCalledWith([F1]);
  });

  it("11) tüm tokenlar geçersizse filtre UYGULANMAZ (tip/bölge kontratı)", async () => {
    await renderArama({ ozellikler: "jakuzi,sauna" });
    expect(findFeatureRelationsMock).not.toHaveBeenCalled();
    expect(searchArgs().categoryVillaIds).toBeNull();
  });

  it("12) ilişki sorgusu HATA verirse filtre atlanır (fail-open, sayfa çalışır)", async () => {
    findFeatureRelationsMock.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    await renderArama({ ozellikler: F1 });
    expect(searchArgs().categoryVillaIds).toBeNull();
    expect(screen.getAllByTestId("villa-card")).toHaveLength(4);
  });
});

/* ===============================================================
   D) DİĞER FİLTRELERLE BİRLİKTE
   =============================================================== */
describe("D) diğer filtrelerle birlikte", () => {
  it("13) TİP + ÖZELLİK → iki kümenin KESİŞİMİ", async () => {
    findVillaTypeRelationsByTypeIdsMock.mockResolvedValue({
      data: [
        { villa_id: "v1", type_id: TYPE_ID },
        { villa_id: "v2", type_id: TYPE_ID },
      ],
      error: null,
    });
    findFeatureRelationsMock.mockResolvedValue({
      data: [
        { villa_id: "v2", feature_id: F1 },
        { villa_id: "v4", feature_id: F1 },
      ],
      error: null,
    });
    await renderArama({ "villa-turleri": "havuzlu", ozellikler: F1 });
    expect(searchArgs().categoryVillaIds).toEqual(["v2"]);
  });

  it("14) BÖLGE + MİSAFİR + ÖZELLİK → diğer argümanlar DEĞİŞMEZ", async () => {
    findFeatureRelationsMock.mockResolvedValue({
      data: [{ villa_id: "v1", feature_id: F1 }],
      error: null,
    });
    await renderArama({ bolgeler: "kalkan", guests: "6", ozellikler: F1 });
    expect(searchArgs()).toEqual({
      categoryVillaIds: ["v1"],
      expandedRegions: ["loc-1"],
      guests: 6,
    });
  });

  it("15) TARİH + ÖZELLİK → tarih pipeline'ı etkilenmez, filtre uygulanır", async () => {
    findFeatureRelationsMock.mockResolvedValue({
      data: [{ villa_id: "v1", feature_id: F1 }],
      error: null,
    });
    /* Tarihli aramada yalnız aralığı fiyatla kapsanan villalar listelenir
       (arama fiyat-kapsamı filtresi) → fixture bu test için fiyatlı. */
    findSearchResultsMock.mockResolvedValue({
      data: ALL_VILLAS.map((v) => ({
        ...v,
        villa_prices: [
          { price: 10000, currency: "TRY", start_date: "2026-10-01", end_date: "2026-10-31" },
        ],
      })),
      error: null,
    });
    await renderArama({
      start: "2026-10-08",
      end: "2026-10-15",
      ozellikler: F1,
    });
    expect(searchArgs().categoryVillaIds).toEqual(["v1"]);
    expect(screen.getAllByTestId("villa-card").length).toBeGreaterThan(0);
  });
});

/* ===============================================================
   E) ⚠️ KESİŞİM BOŞ → 0 SONUÇ
   =============================================================== */
describe("E) 0 sonuç garantisi (forceEmpty)", () => {
  it("16) hiçbir villa iki özelliğe birden sahip değilse 0 KART render edilir", async () => {
    findFeatureRelationsMock.mockResolvedValue({
      data: [
        { villa_id: "v1", feature_id: F1 },
        { villa_id: "v2", feature_id: F2 },
      ],
      error: null,
    });
    await renderArama({ ozellikler: `${F1},${F2}` });
    expect(searchArgs().categoryVillaIds).toEqual([]);
    /* 🔒 EN KRİTİK ASSERTION: boş dizi "filtre yok" sayılıp TÜM villalar
       gösterilemez. */
    expect(screen.queryAllByTestId("villa-card")).toHaveLength(0);
  });

  it("17) özelliğe sahip hiç villa yoksa 0 KART", async () => {
    findFeatureRelationsMock.mockResolvedValue({ data: [], error: null });
    await renderArama({ ozellikler: F1 });
    expect(searchArgs().categoryVillaIds).toEqual([]);
    expect(screen.queryAllByTestId("villa-card")).toHaveLength(0);
  });

  it("18) TİP eşleşiyor ama ÖZELLİK kesişimi boşsa 0 KART", async () => {
    findVillaTypeRelationsByTypeIdsMock.mockResolvedValue({
      data: [{ villa_id: "v1", type_id: TYPE_ID }],
      error: null,
    });
    findFeatureRelationsMock.mockResolvedValue({
      data: [{ villa_id: "v2", feature_id: F1 }],
      error: null,
    });
    await renderArama({ "villa-turleri": "havuzlu", ozellikler: F1 });
    expect(searchArgs().categoryVillaIds).toEqual([]);
    expect(screen.queryAllByTestId("villa-card")).toHaveLength(0);
  });
});

/* ===============================================================
   F) URL KONTRATI — `ozellikler` KAYBOLMAZ
   =============================================================== */
describe("F) URL kontratı", () => {
  it("19) sayfalama / sıralama linkleri `ozellikler` parametresini TAŞIR", async () => {
    findFeatureRelationsMock.mockResolvedValue({
      data: ["v1", "v2", "v3", "v4"].map((v) => ({
        villa_id: v,
        feature_id: F1,
      })),
      error: null,
    });
    const { container } = await renderArama({ ozellikler: F1, sort: "price-asc" });
    const hrefs = Array.from(container.querySelectorAll("a"))
      .map((a) => a.getAttribute("href") || "")
      .filter((h) => h.includes("/arama?"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) {
      expect(h, h).toContain("ozellikler=");
    }
  });

  it("20) FilterSidebar 'Filtrele' → `ozellikler` URL'de KORUNUR", async () => {
    searchParamsGetMock.mockImplementation((k: string) =>
      k === "ozellikler" ? `${F1},${F2}` : null
    );
    const { default: FilterSidebar } = await import(
      "@/app/(public)/arama/FilterSidebar"
    );
    render(
      <FilterSidebar
        regionOptions={[]}
        categoryOptions={[]}
        initial={{
          regions: [],
          categories: [],
          start: null,
          end: null,
          guests: 4,
        }}
      />
    );
    const btn = screen
      .getAllByText("Filtrele")
      .map((el) => el.closest("button"))
      .find(
        (b): b is HTMLButtonElement =>
          !!b && b.getAttribute("aria-haspopup") !== "dialog"
      );
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    const url = String(pushMock.mock.calls[0][0]);
    expect(url).toContain("guests=4");
    expect(url).toContain(`ozellikler=${encodeURIComponent(`${F1},${F2}`)}`);
  });

  it("21) parametre YOKKEN sidebar URL'i BİREBİR eski haliyle kalır", async () => {
    searchParamsGetMock.mockReturnValue(null);
    const { default: FilterSidebar } = await import(
      "@/app/(public)/arama/FilterSidebar"
    );
    render(
      <FilterSidebar
        regionOptions={[]}
        categoryOptions={[]}
        initial={{
          regions: [],
          categories: [],
          start: null,
          end: null,
          guests: 4,
        }}
      />
    );
    const btn = screen
      .getAllByText("Filtrele")
      .map((el) => el.closest("button"))
      .find(
        (b): b is HTMLButtonElement =>
          !!b && b.getAttribute("aria-haspopup") !== "dialog"
      );
    fireEvent.click(btn!);
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(pushMock.mock.calls[0][0]).toBe("/arama?guests=4");
  });

  it("22) refresh/paylaşım — URL'deki seçim aynı sonucu üretir (deterministik)", async () => {
    findFeatureRelationsMock.mockResolvedValue({
      data: [
        { villa_id: "v1", feature_id: F1 },
        { villa_id: "v1", feature_id: F2 },
      ],
      error: null,
    });
    await renderArama({ ozellikler: `${F1},${F2}` });
    const first = searchArgs().categoryVillaIds;
    findSearchResultsMock.mockClear();
    await renderArama({ ozellikler: `${F1},${F2}` });
    expect(searchArgs().categoryVillaIds).toEqual(first);
  });

  it("23) 🔒 kaynak kilidi — her İKİ URL üreticisi de `ozellikler` yazar", () => {
    const body = fs.readFileSync(
      path.join(process.cwd(), "app/components/search/AramaPageBody.tsx"),
      "utf-8"
    );
    const sidebar = fs.readFileSync(
      path.join(process.cwd(), "app/(public)/arama/FilterSidebar.tsx"),
      "utf-8"
    );
    expect(body).toContain('setIf("ozellikler"');
    expect(sidebar).toContain('params.set("ozellikler"');
    /* Mevcut parametrelerin hiçbiri kaybolmadı. */
    for (const p of [
      "villa-turleri",
      "categories",
      "bolgeler",
      "regions",
      "start",
      "end",
      "guests",
      "flexible",
    ]) {
      expect(body, p).toContain(`"${p}"`);
    }
  });
});

/* ===============================================================
   G) i18n
   =============================================================== */
describe("G) i18n", () => {
  it("24) TR/EN/DE sözlüklerinde yeni anahtarlar TAM", async () => {
    const { tr } = await import("@/lib/i18n/dictionaries/tr");
    const { en } = await import("@/lib/i18n/dictionaries/en");
    const { de } = await import("@/lib/i18n/dictionaries/de");
    for (const d of [tr, en, de]) {
      expect(typeof d.home.search.featuresLabel).toBe("string");
      expect(d.home.search.featuresLabel.length).toBeGreaterThan(0);
      expect(d.home.search.featuresSelected).toContain("{n}");
      expect(typeof d.home.search.featuresEmpty).toBe("string");
    }
    /* Üç dilde de FARKLI metin (kopyala-yapıştır TR sızıntısı yok). */
    expect(en.home.search.featuresLabel).not.toBe(tr.home.search.featuresLabel);
    expect(de.home.search.featuresLabel).not.toBe(tr.home.search.featuresLabel);
  });

  it("25) loadHeroFeatures — TR'de çeviri sorgusu HİÇ atılmaz", async () => {
    const { loadHeroFeatures } = await import(
      "@/app/components/ui/hero/_components/hero-features.action"
    );
    const rows = await loadHeroFeatures("tr");
    expect(getTranslationsForParentsMock).not.toHaveBeenCalled();
    expect(rows.map((r) => r.name)).toEqual([
      "Isıtmalı Havuz",
      "Jakuzi",
      "Sauna",
    ]);
    /* URL token'ı UUID olsun diye slug BİLİNÇLİ null. */
    expect(rows.every((r) => r.slug === null)).toBe(true);
  });

  it("26) loadHeroFeatures — EN'de çeviri kullanılır, id DEĞİŞMEZ", async () => {
    getTranslationsForParentsMock.mockResolvedValue(
      new Map([[F1, { name: "Jacuzzi" }]])
    );
    const { loadHeroFeatures } = await import(
      "@/app/components/ui/hero/_components/hero-features.action"
    );
    const rows = await loadHeroFeatures("en");
    const jacuzzi = rows.find((r) => r.id === F1);
    expect(jacuzzi?.name).toBe("Jacuzzi");
    /* Çevirisi olmayan canonical kalır. */
    expect(rows.find((r) => r.id === F2)?.name).toBe("Sauna");
    /* N+1 YOK: entity başına locale başına TEK batch (en + de). */
    expect(getTranslationsForParentsMock).toHaveBeenCalledTimes(2);
    for (const call of getTranslationsForParentsMock.mock.calls) {
      expect(call[0]).toBe("villa_feature");
    }
  });

  it("27) loadHeroFeatures — çeviri hatası canonical adlara düşer", async () => {
    getTranslationsForParentsMock.mockRejectedValue(new Error("boom"));
    const { loadHeroFeatures } = await import(
      "@/app/components/ui/hero/_components/hero-features.action"
    );
    const rows = await loadHeroFeatures("de");
    expect(rows.find((r) => r.id === F1)?.name).toBe("Jakuzi");
  });
});

/* ===============================================================
   H) buildHeroSearchParams
   =============================================================== */
describe("H) hero URL üretimi", () => {
  it("28) seçim varsa `ozellikler` virgülle ayrık UUID olarak yazılır", async () => {
    const { buildHeroSearchParams } = await import(
      "@/app/components/ui/hero/_helpers/build-search-params"
    );
    const qs = buildHeroSearchParams({
      categories: [],
      regions: [],
      startDate: null,
      endDate: null,
      guests: 2,
      categoryOptions: [],
      regionOptions: [],
      features: [F1, F2],
    });
    expect(new URLSearchParams(qs).get("ozellikler")).toBe(`${F1},${F2}`);
  });

  it("29) seçim yoksa URL BİREBİR eski haliyle kalır", async () => {
    const { buildHeroSearchParams } = await import(
      "@/app/components/ui/hero/_helpers/build-search-params"
    );
    const base = {
      categories: [],
      regions: [],
      startDate: null,
      endDate: null,
      guests: 2,
      categoryOptions: [],
      regionOptions: [],
    };
    expect(buildHeroSearchParams(base)).toBe("guests=2");
    expect(buildHeroSearchParams({ ...base, features: [] })).toBe("guests=2");
  });
});

/* ===============================================================
   I) SIDEBAR UI — accordion · özellik bölümü · scroll · Temizle
   ===============================================================
   ⚠️ Bu blok FAZ 2'de (sidebar entegrasyonu) eklendi. Yukarıdaki
   testlerin hiçbiri gevşetilmedi; yalnız 2) numaralı testin sorgu
   sözleşmesi, sidebar listesi koşulsuz gerektiği için AÇIKÇA
   güncellendi (ilişki sorgusu assertion'ı AYNEN duruyor).
=============================================================== */

const SIDEBAR_SRC_PATH = "app/(public)/arama/FilterSidebar.tsx";

type SidebarProps = {
  regionOptions?: unknown[];
  categoryOptions?: unknown[];
  featureOptions?: Array<{ id: string; name: string }>;
  initial?: Record<string, unknown>;
  locale?: "tr" | "en" | "de";
};

async function renderSidebar(props: SidebarProps = {}) {
  const { default: FilterSidebar } = await import(
    "@/app/(public)/arama/FilterSidebar"
  );
  return render(
    <FilterSidebar
      regionOptions={[]}
      categoryOptions={[
        { id: "t1", name: "Havuzlu Villa", slug: "havuzlu" },
        { id: "t2", name: "Deniz Manzaralı", slug: "deniz" },
      ]}
      featureOptions={
        props.featureOptions || [
          { id: F1, name: "Jakuzi" },
          { id: F2, name: "Sauna" },
        ]
      }
      initial={{
        regions: [],
        categories: [],
        start: null,
        end: null,
        guests: 4,
        features: [],
        ...(props.initial || {}),
      }}
      locale={props.locale}
    />
  );
}

/** Panel içindeki (drawer trigger'ı OLMAYAN) butonu bulur. */
function panelButton(label: string): HTMLButtonElement {
  const btn = screen
    .getAllByText(label)
    .map((el) => el.closest("button"))
    .find(
      (b): b is HTMLButtonElement =>
        !!b && b.getAttribute("aria-haspopup") !== "dialog"
    );
  expect(btn, `panel button: ${label}`).toBeTruthy();
  return btn!;
}

describe("I) sidebar — accordion davranışı", () => {
  it("30) VİLLA TİPİ seçim YOKKEN KAPALI başlar", async () => {
    /* ⚠️ FAZ 3 ürün kararı: ilk açılışta [+] Villa Tipi / [+] Villa
       Özellikleri. Önceki "varsayılan açık" assertion'ı bu davranışla
       DEĞİŞTİRİLDİ (gevşetilmedi: kapalı olması artık kilitli). */
    await renderSidebar();
    expect(panelButton("Villa Tipi").getAttribute("aria-expanded")).toBe(
      "false"
    );
    expect(screen.queryAllByText("Havuzlu Villa")).toHaveLength(0);
  });

  it("30b) VİLLA TİPİ URL'den seçili geldiğinde AÇIK gelir", async () => {
    await renderSidebar({ initial: { categories: ["t1"] } });
    expect(panelButton("Villa Tipi").getAttribute("aria-expanded")).toBe(
      "true"
    );
    expect(screen.getAllByText("Havuzlu Villa").length).toBeGreaterThan(0);
  });

  it("31) VİLLA TİPİ başlığına tıklayınca AÇILIR, tekrar tıklayınca KAPANIR", async () => {
    await renderSidebar();
    fireEvent.click(panelButton("Villa Tipi"));
    expect(screen.getAllByText("Havuzlu Villa").length).toBeGreaterThan(0);
    expect(panelButton("Villa Tipi").getAttribute("aria-expanded")).toBe(
      "true"
    );
    fireEvent.click(panelButton("Villa Tipi"));
    expect(screen.queryAllByText("Havuzlu Villa")).toHaveLength(0);
  });

  it("32) VİLLA ÖZELLİKLERİ bölümü accordion — seçim yokken KAPALI, açılınca seçenekler gelir", async () => {
    await renderSidebar();
    const header = panelButton("Villa Özellikleri");
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByText("Jakuzi")).toHaveLength(0);
    fireEvent.click(header);
    expect(screen.getAllByText("Jakuzi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sauna").length).toBeGreaterThan(0);
  });

  it("33) URL'de seçim VARSA özellik bölümü AÇIK gelir (bölge grubu kuralı)", async () => {
    await renderSidebar({ initial: { features: [F1] } });
    expect(
      panelButton("Villa Özellikleri").getAttribute("aria-expanded")
    ).toBe("true");
  });

  it("34) TARİH / KİŞİ / BÖLGE başlıkları accordion DEĞİL (mevcut davranış birebir)", async () => {
    await renderSidebar();
    for (const label of ["Tarih", "Kişi Sayısı", "Bölge"]) {
      const el = screen.getAllByText(label)[0];
      expect(el.closest("button"), label).toBeNull();
    }
  });

  it("35) `featureOptions` verilmeyen caller'da bölüm HİÇ render edilmez (/kiralik-villalar)", async () => {
    const { default: FilterSidebar } = await import(
      "@/app/(public)/arama/FilterSidebar"
    );
    render(
      <FilterSidebar
        regionOptions={[]}
        categoryOptions={[]}
        initial={{
          regions: [],
          categories: [],
          start: null,
          end: null,
          guests: 0,
        }}
        mode="redirect"
      />
    );
    expect(screen.queryAllByText("Villa Özellikleri")).toHaveLength(0);
  });
});

describe("I) sidebar — seçim · URL · Temizle", () => {
  it("36) Hero'dan gelen seçim sidebar'da CHECKED görünür", async () => {
    const { container } = await renderSidebar({ initial: { features: [F2] } });
    const boxes = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    );
    const labels = boxes.map(
      (b) => b.closest("label")?.textContent?.trim() || ""
    );
    const jacuzzi = boxes[labels.indexOf("Jakuzi")];
    const sauna = boxes[labels.indexOf("Sauna")];
    expect(sauna.checked).toBe(true);
    expect(jacuzzi.checked).toBe(false);
  });

  it("37) sidebar'dan özellik seçip Filtrele → `ozellikler` URL'e yazılır", async () => {
    await renderSidebar();
    fireEvent.click(panelButton("Villa Özellikleri"));
    fireEvent.click(screen.getAllByText("Jakuzi")[0]);
    fireEvent.click(panelButton("Filtrele"));
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    const url = String(pushMock.mock.calls[0][0]);
    expect(url).toContain(`ozellikler=${F1}`);
    expect(url).toContain("guests=4");
  });

  it("38) özellik değişirken DİĞER filtreler (bölge/tip/tarih/kişi) KAYBOLMAZ", async () => {
    await renderSidebar({
      initial: {
        regions: [],
        categories: ["t1"],
        start: "2026-10-08",
        end: "2026-10-15",
        guests: 6,
        features: [F1],
      },
    });
    fireEvent.click(screen.getAllByText("Sauna")[0]);
    fireEvent.click(panelButton("Filtrele"));
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    const url = String(pushMock.mock.calls[0][0]);
    expect(url).toContain("villa-turleri=havuzlu");
    expect(url).toContain("start=2026-10-08");
    expect(url).toContain("end=2026-10-15");
    expect(url).toContain("guests=6");
    expect(url).toContain(encodeURIComponent(`${F1},${F2}`));
  });

  it("39) son özellik kaldırılınca `ozellikler` URL'den TAMAMEN kalkar (boş param YOK)", async () => {
    await renderSidebar({ initial: { features: [F1] } });
    fireEvent.click(screen.getAllByText("Jakuzi")[0]);
    fireEvent.click(panelButton("Filtrele"));
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    const url = String(pushMock.mock.calls[0][0]);
    expect(url).not.toContain("ozellikler");
    expect(url).toBe("/arama?guests=4");
  });

  it("40) YALNIZ özellik seçiliyken 'Temizle' AKTİF olur", async () => {
    await renderSidebar({
      initial: { guests: 1, features: [F1] },
    });
    expect(panelButton("Temizle").disabled).toBe(false);
  });

  it("41) hiç filtre yokken 'Temizle' PASİF kalır (mevcut davranış)", async () => {
    await renderSidebar({ initial: { guests: 1, features: [] } });
    expect(panelButton("Temizle").disabled).toBe(true);
  });

  it("42) 'Temizle' özellik seçimini de sıfırlar ve paramsız /arama'ya döner", async () => {
    await renderSidebar({ initial: { features: [F1, F2] } });
    fireEvent.click(panelButton("Temizle"));
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(pushMock.mock.calls[0][0]).toBe("/arama");
  });
});

describe("I) sidebar — /arama entegrasyonu ve i18n", () => {
  it("43) /arama sidebar'ı özellik seçeneklerini SERVER'dan alır (client sorgu YOK)", async () => {
    const { container } = await renderArama({});
    expect(container.textContent).toContain("Villa Özellikleri");
    /* Seçenek listesi TAM 1 kez okunur — checkbox başına sorgu yok. */
    expect(findAllFeaturesMock).toHaveBeenCalledTimes(1);
  });

  it("44) URL'deki seçim /arama render'ında sidebar'da CHECKED gelir (refresh senaryosu)", async () => {
    findFeatureRelationsMock.mockResolvedValue({
      data: [{ villa_id: "v1", feature_id: F1 }],
      error: null,
    });
    const { container } = await renderArama({ ozellikler: F1 });
    const boxes = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    );
    const checked = boxes.filter((b) => b.checked);
    /* Panel JSX'i desktop aside + mobil drawer olarak İKİ kez mount
       edilir (mevcut mimari) → her checkbox iki kopyada görünür. */
    expect(checked.length).toBeGreaterThan(0);
    for (const box of checked) {
      expect(box.closest("label")?.textContent).toContain("Jakuzi");
    }
  });

  it("45) EN/DE — bölüm başlığı sözlükten gelir (hardcoded TR yok)", async () => {
    const { en } = await import("@/lib/i18n/dictionaries/en");
    const { de } = await import("@/lib/i18n/dictionaries/de");
    const enRender = await renderArama({}, "en");
    expect(enRender.container.textContent).toContain(
      en.search.filters.featuresLabel
    );
    enRender.unmount();
    const deRender = await renderArama({}, "de");
    expect(deRender.container.textContent).toContain(
      de.search.filters.featuresLabel
    );
  });

  it("46) 🔒 kaynak kilidi — desktop iç scroll KALDIRILDI, mobil drawer scroll DURUYOR", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), SIDEBAR_SRC_PATH),
      "utf-8"
    );
    /* Desktop card artık viewport'a göre kırpılmıyor. Yalnız GERÇEK
       className attribute'ları taranır (yorumlar hariç). */
    const classNames = Array.from(src.matchAll(/className="([^"]*)"/g)).map(
      (m) => m[1]
    );
    expect(
      classNames.some((c) => c.includes("max-h-[calc(100vh-9rem)]"))
    ).toBe(false);
    expect(src).toContain(
      'rounded-2xl p-6 flex flex-col"'
    );
    /* Mobil drawer'ın iç scroll'u KORUNDU (aksi halde CTA altındaki
       içerik erişilemez olurdu) + desktop'ta kapatıldı. */
    expect(src).toContain("overflow-y-auto md:flex-none md:overflow-visible");
    /* Body scroll kilidi (drawer açıkken) DOKUNULMADI. */
    expect(src).toContain('document.body.style.overflow = "hidden"');
  });

  it("47) 🔒 kaynak kilidi — desktop aside'da STICKY YOK, layout/drawer korundu", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), SIDEBAR_SRC_PATH),
      "utf-8"
    );
    const classNames = Array.from(src.matchAll(/className="([^"]*)"/g)).map(
      (m) => m[1]
    );
    /* Hiçbir className'de sticky KALMADI (yorum metni hariç). */
    expect(classNames.some((c) => /\bsticky\b/.test(c))).toBe(false);
    /* Genişlik/grid sarmalayıcısı ve mobil drawer AYNEN duruyor. */
    expect(src).toContain('<aside className="hidden md:block">');
    expect(src).toContain("h-[calc(92vh-1.25rem)]");
  });
});
