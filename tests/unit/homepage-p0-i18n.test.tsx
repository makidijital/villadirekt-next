/* ===============================================================
   🛡️ PHASE 11 P0 — ANA SAYFADA KALAN TÜRKÇE METİNLERİN REGRESYON TESTLERİ
   ===============================================================
   Kapsam (P0 audit bulguları):
     1) HeroSearchPanel kişi sayısı option'ları — `{g} kişi` hardcoded'dı
     2) HeroSearchPanel villa tipi option'ları — canonical TR adı geliyordu
     3) ReviewsCarousel — "Devamını oku" / "Daha az göster" + aria metinleri
     4) HorizontalCarousel — "Geri kaydır" / "İleri kaydır" aria-label'ları

   TR çıktısının BİT-BİRE AYNI kalması her madde için ayrıca kilitlenir.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "fs";

import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";

/* ===============================================================
   1) KİŞİ SAYISI OPTION'LARI
   =============================================================== */
describe("1) home.search.guestsOption", () => {
  it("1a) TR — 1..10 için ESKİ çıktı BİREBİR ('{n} kişi')", () => {
    const tpl = getDictionary("tr").home.search.guestsOption;
    for (const g of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(formatDictionaryString(tpl, { n: g })).toBe(`${g} kişi`);
    }
  });

  it("1b) EN — '1 guests' … '10 guests'", () => {
    const tpl = getDictionary("en").home.search.guestsOption;
    expect(formatDictionaryString(tpl, { n: 1 })).toBe("1 guests");
    expect(formatDictionaryString(tpl, { n: 10 })).toBe("10 guests");
  });

  it("1c) DE — '1 Gäste' … '10 Gäste'", () => {
    const tpl = getDictionary("de").home.search.guestsOption;
    expect(formatDictionaryString(tpl, { n: 1 })).toBe("1 Gäste");
    expect(formatDictionaryString(tpl, { n: 10 })).toBe("10 Gäste");
  });

  it("1d) 🔒 kaynak kilidi — HeroSearchPanel'de hardcoded '{g} kişi' KALMADI", () => {
    const src = readFileSync(
      "app/components/ui/hero/_components/HeroSearchPanel.tsx",
      "utf-8"
    );
    expect(src).not.toMatch(/\{g\}\s*kişi/);
    expect(src).toMatch(/formatDictionaryString\(dict\.guestsOption/);
  });
});

/* ===============================================================
   2) HERO SEARCH PANEL — VILLA TİPİ ADLARI
   =============================================================== */
const findAllForPublicTaxonomyMock = vi.fn();
const findAllVillaLocationsMock = vi.fn();
const getTranslationsForParentsMock = vi.fn();

vi.mock("@/lib/db/villa-type.repository", () => ({
  villaTypeRepository: {
    findAllForPublicTaxonomy: () => findAllForPublicTaxonomyMock(),
  },
}));
vi.mock("@/lib/db/menu.repository", () => ({
  menuRepository: { findAllVillaLocations: () => findAllVillaLocationsMock() },
}));
/* Gerçek `getVillaTypeNamesByLocale` + `resolveTaxonomyName` zinciri
   ÇALIŞIR; yalnız en alttaki batch DB okuması mock'lanır. */
vi.mock("@/lib/i18n/get-translation.server", () => ({
  getTranslationsForParents: (...a: unknown[]) =>
    getTranslationsForParentsMock(...a),
}));

const TYPE_ROWS = [
  { id: "t1", name: "Deniz Manzaralı Villa", slug: "deniz-manzarali" },
  { id: "t2", name: "Havuzlu Villa", slug: "havuzlu" },
];
const LOCATION_ROWS = [
  { id: "l1", name: "Kalkan", slug: "kalkan", filter_group_name: "Kalkan" },
];

beforeEach(() => {
  vi.clearAllMocks();
  findAllForPublicTaxonomyMock.mockResolvedValue({ data: TYPE_ROWS, error: null });
  findAllVillaLocationsMock.mockResolvedValue({ data: LOCATION_ROWS, error: null });
  getTranslationsForParentsMock.mockResolvedValue(new Map());
});

describe("2) loadHeroFilters — villa tipi adı locale-aware", () => {
  it("2a) TR — çeviri sorgusu HİÇ atılmaz, adlar canonical", async () => {
    const { loadHeroFilters } = await import(
      "@/app/components/ui/hero/_components/hero-filters.action"
    );
    const { types } = await loadHeroFilters("tr");
    expect(getTranslationsForParentsMock).not.toHaveBeenCalled();
    expect(types?.map((t) => t.name)).toEqual([
      "Deniz Manzaralı Villa",
      "Havuzlu Villa",
    ]);
  });

  it("2b) TR — locale verilmezse de davranış AYNI (geriye dönük uyum)", async () => {
    const { loadHeroFilters } = await import(
      "@/app/components/ui/hero/_components/hero-filters.action"
    );
    const { types } = await loadHeroFilters();
    expect(getTranslationsForParentsMock).not.toHaveBeenCalled();
    expect(types?.[0].name).toBe("Deniz Manzaralı Villa");
  });

  it("2c) EN — çeviri VARSA option label'ı çevrilir; id/slug DEĞİŞMEZ", async () => {
    getTranslationsForParentsMock.mockResolvedValue(
      new Map([["t1", { name: "Sea View Villa" }]])
    );
    const { loadHeroFilters } = await import(
      "@/app/components/ui/hero/_components/hero-filters.action"
    );
    const { types } = await loadHeroFilters("en");

    expect(types?.[0].name).toBe("Sea View Villa");
    expect(types?.[0].id).toBe("t1");
    expect(types?.[0].slug).toBe("deniz-manzarali");
    /* Çevirisi olmayan tip canonical kalır. */
    expect(types?.[1].name).toBe("Havuzlu Villa");
  });

  it("2d) DE — çeviri kullanılır", async () => {
    getTranslationsForParentsMock.mockResolvedValue(
      new Map([["t2", { name: "Villa mit Pool" }]])
    );
    const { loadHeroFilters } = await import(
      "@/app/components/ui/hero/_components/hero-filters.action"
    );
    const { types } = await loadHeroFilters("de");
    expect(types?.[1].name).toBe("Villa mit Pool");
  });

  it("2e) N+1 YOK — locale başına TEK batch sorgu, tüm id'ler birlikte", async () => {
    const { loadHeroFilters } = await import(
      "@/app/components/ui/hero/_components/hero-filters.action"
    );
    await loadHeroFilters("en");
    /* getVillaTypeNamesByLocale en/de için 2 paralel batch çağırır
       (Phase 10H deseni) — tip SAYISINDAN bağımsız sabit. */
    expect(getTranslationsForParentsMock).toHaveBeenCalledTimes(2);
    for (const call of getTranslationsForParentsMock.mock.calls) {
      expect(call[0]).toBe("villa_type");
      expect(call[1]).toEqual(["t1", "t2"]);
    }
  });

  it("2f) 🔒 BÖLGE adları HER dilde CANONICAL (çevrilmez)", async () => {
    getTranslationsForParentsMock.mockResolvedValue(
      new Map([["l1", { name: "SHOULD NOT BE USED" }]])
    );
    const { loadHeroFilters } = await import(
      "@/app/components/ui/hero/_components/hero-filters.action"
    );
    const { locations } = await loadHeroFilters("en");
    expect(locations?.[0].name).toBe("Kalkan");
  });

  it("2g) çeviri okuması hata verirse canonical adlara düşer", async () => {
    getTranslationsForParentsMock.mockRejectedValue(new Error("boom"));
    const { loadHeroFilters } = await import(
      "@/app/components/ui/hero/_components/hero-filters.action"
    );
    const { types } = await loadHeroFilters("en");
    expect(types?.[0].name).toBe("Deniz Manzaralı Villa");
  });
});

/* ===============================================================
   3) REVIEWS CAROUSEL
   =============================================================== */
describe("3) home.reviews — buton + accessibility metinleri", () => {
  it("3a) TR değerleri ESKİ hardcoded metinlerle BİREBİR", () => {
    const d = getDictionary("tr").home.reviews;
    expect(d.readMore).toBe("Devamını oku");
    expect(d.readLess).toBe("Daha az göster");
    expect(d.navigationLabel).toBe("Diğer misafir yorumları arasında gezin");
    expect(formatDictionaryString(d.showReview, { name: "Ayşe" })).toBe(
      "Ayşe yorumunu göster"
    );
  });

  it("3b) EN/DE gerçekten çevrilmiş (TR ile aynı değil)", () => {
    for (const locale of ["en", "de"] as const) {
      const d = getDictionary(locale).home.reviews;
      const tr = getDictionary("tr").home.reviews;
      expect(d.readMore).not.toBe(tr.readMore);
      expect(d.readLess).not.toBe(tr.readLess);
      expect(d.navigationLabel).not.toBe(tr.navigationLabel);
      expect(d.showReview).not.toBe(tr.showReview);
      expect(d.showReview).toContain("{name}");
    }
  });

  it("3c) 🔒 kaynak kilidi — ReviewsCarousel'de hardcoded TR KALMADI", () => {
    const src = readFileSync("app/components/home/ReviewsCarousel.tsx", "utf-8");
    const body = src.split("=============================================================== */")[1];
    expect(body).not.toMatch(/"Daha az göster"/);
    expect(body).not.toMatch(/"Devamını oku"/);
    expect(body).not.toMatch(/aria-label="Diğer misafir/);
    expect(body).not.toMatch(/yorumunu göster`/);
  });

  it("3d) 🔒 HomepageReviewsSection locale'i AŞAĞI geçiriyor", () => {
    const src = readFileSync(
      "app/components/home/HomepageReviewsSection.tsx",
      "utf-8"
    );
    expect(src).toMatch(/<ReviewsCarousel[\s\S]*?locale=\{locale\}/);
  });
});

/* ===============================================================
   4) HORIZONTAL CAROUSEL — ok butonu aria-label'ları
   =============================================================== */
describe("4) HorizontalCarousel prevLabel/nextLabel", () => {
  /* jsdom'da scrollWidth/clientWidth 0'dır → overflow algılanmaz ve
     oklar render edilmez. Overflow'u simüle ederek okları görünür
     kılıyoruz (yalnız bu test dosyası kapsamında). */
  const withOverflow = (fn: () => void) => {
    const sw = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollWidth"
    );
    const cw = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientWidth"
    );
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get: () => 2000,
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 500,
    });
    try {
      fn();
    } finally {
      if (sw) Object.defineProperty(HTMLElement.prototype, "scrollWidth", sw);
      if (cw) Object.defineProperty(HTMLElement.prototype, "clientWidth", cw);
    }
  };

  it("4a) TR dictionary değerleri ESKİ hardcoded metinlerle BİREBİR", () => {
    const d = getDictionary("tr").home.carousel;
    expect(d.previous).toBe("Geri kaydır");
    expect(d.next).toBe("İleri kaydır");
  });

  it("4b) prop VERİLMEZSE TR default'ları korunur (mevcut çağıranlar bozulmaz)", async () => {
    const { default: HorizontalCarousel } = await import(
      "@/app/components/villa/HorizontalCarousel"
    );
    withOverflow(() => {
      render(
        <HorizontalCarousel showArrows>
          <div>içerik</div>
        </HorizontalCarousel>
      );
      expect(screen.getByLabelText("İleri kaydır")).toBeInTheDocument();
    });
  });

  it("4c) EN/DE label'ları geçilince aria-label çevrilir", async () => {
    const { default: HorizontalCarousel } = await import(
      "@/app/components/villa/HorizontalCarousel"
    );
    for (const locale of ["en", "de"] as const) {
      const d = getDictionary(locale).home.carousel;
      withOverflow(() => {
        const { unmount } = render(
          <HorizontalCarousel showArrows prevLabel={d.previous} nextLabel={d.next}>
            <div>content</div>
          </HorizontalCarousel>
        );
        expect(screen.getByLabelText(d.next)).toBeInTheDocument();
        expect(screen.queryByLabelText("İleri kaydır")).not.toBeInTheDocument();
        unmount();
      });
    }
  });

  it("4d) 🔒 4 homepage çağıranı da locale-aware label geçiriyor", () => {
    for (const f of [
      "app/components/home/DiscountCollection.tsx",
      "app/components/home/ShortGapsSection.tsx",
      "app/components/villa/VillaTypeCarousel.tsx",
      "app/components/villa/LocationCollection.tsx",
    ]) {
      const src = readFileSync(f, "utf-8");
      expect(src).toMatch(/prevLabel=\{carouselDict\.previous\}/);
      expect(src).toMatch(/nextLabel=\{carouselDict\.next\}/);
      expect(src).toMatch(/getDictionary\(locale\)\.home\.carousel/);
    }
  });
});

/* ===============================================================
   5) DICTIONARY BÜTÜNLÜĞÜ
   =============================================================== */
describe("5) yeni key'ler 3 dilde de var ve leaf kümeleri EŞİT", () => {
  const leaves = (o: unknown, pre = ""): string[] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
      typeof v === "object" && v ? leaves(v, `${pre}${k}.`) : [`${pre}${k}`]
    );

  it("5a) tr/en/de leaf kümeleri BİREBİR aynı", () => {
    const sets = SUPPORTED_LOCALES.map((l: Locale) =>
      JSON.stringify(leaves(getDictionary(l)).sort())
    );
    expect(sets[1]).toBe(sets[0]);
    expect(sets[2]).toBe(sets[0]);
  });

  it("5b) P0'da eklenen 7 key üç dilde de DOLU", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const h = getDictionary(locale).home;
      for (const v of [
        h.search.guestsOption,
        h.reviews.readMore,
        h.reviews.readLess,
        h.reviews.navigationLabel,
        h.reviews.showReview,
        h.carousel.previous,
        h.carousel.next,
      ]) {
        expect(typeof v).toBe("string");
        expect(v.trim().length).toBeGreaterThan(0);
      }
      expect(h.search.guestsOption).toContain("{n}");
      expect(h.reviews.showReview).toContain("{name}");
    }
  });
});
