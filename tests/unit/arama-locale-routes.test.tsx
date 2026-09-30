/* ===============================================================
   🛡️ PHASE 13 — /arama · /en/arama · /de/arama ÇOKLU DİL TESTLERİ
   ===============================================================
   Kapsam:
     A) Üç route da AYNI `AramaPageBody`'yi DOĞRU locale ile render
        eder (üç kopya YOK); EN/DE gate davranışı korunur
     B) `search` dictionary namespace bütünlüğü (TR/EN/DE)
     C) TR BYTE-IDENTITY — değerler Phase 13 öncesi hardcoded
        metinlerle birebir; `PUBLIC_SORT_LABELS` ile lockstep
     D) basePath türetimi (/arama · /en/arama · /de/arama)
     E) FilterSidebar locale davranışı — buildHref + resetFilters
     F) SOURCE-LOCK — hardcoded TR kalmadı, URL kontratı korundu

   `homepage-locale-routes.test.tsx` (Phase 11) ve
   `cms-page-locale-routes.test.tsx` (Phase 12D) ile AYNI desen.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import { tr } from "@/lib/i18n/dictionaries/tr";
import { en } from "@/lib/i18n/dictionaries/en";
import { de } from "@/lib/i18n/dictionaries/de";
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
import { PUBLIC_SORT_LABELS } from "@/lib/pagination";
import { resolveTaxonomyName } from "@/lib/i18n/taxonomy-name.helper";

/* ---------------- mock katmanı ---------------- */
const requirePublicLocaleEnabledMock = vi.fn();
const setRequestLocaleMock = vi.fn();
vi.mock("@/lib/i18n/public-locale-gate.server", () => ({
  requirePublicLocaleEnabled: () => requirePublicLocaleEnabledMock(),
}));
vi.mock("@/lib/i18n/request-locale.server", () => ({
  setRequestLocale: (...a: unknown[]) => setRequestLocaleMock(...a),
}));

const pushMock = vi.fn();
const searchParamsGetMock = vi.fn(() => null);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: searchParamsGetMock }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import AramaPageBody from "@/app/components/search/AramaPageBody";
import FilterSidebar from "@/app/(public)/arama/FilterSidebar";

/* ---------------- helpers ---------------- */
/** `clickPanelButton`'ın describe-dışı ikizi (aynı ayırt etme kuralı). */
function clickPanelButtonGlobal(label: string) {
  const btn = screen
    .getAllByText(label)
    .map((el) => el.closest("button"))
    .find(
      (b): b is HTMLButtonElement =>
        !!b && b.getAttribute("aria-haspopup") !== "dialog"
    );
  expect(btn, `panel button: ${label}`).toBeTruthy();
  fireEvent.click(btn!);
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

const BODY_SRC = "app/components/search/AramaPageBody.tsx";
const SIDEBAR_SRC = "app/(public)/arama/FilterSidebar.tsx";

/* jsdom `window.matchMedia` implement etmez; FilterSidebar mobil
   datepicker tespiti için kullanıyor (üretim kodu DEĞİŞTİRİLMEDİ). */
beforeEach(() => {
  vi.clearAllMocks();
  requirePublicLocaleEnabledMock.mockResolvedValue(undefined);
  searchParamsGetMock.mockReturnValue(null);
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
   A) ROUTE DAVRANIŞI
   =============================================================== */
const LOCALE_ROUTES: Array<[string, "en" | "de"]> = [
  ["@/app/(public)/en/arama/page", "en"],
  ["@/app/(public)/de/arama/page", "de"],
];

describe.each(LOCALE_ROUTES)("%s", (modulePath, locale) => {
  const sp = Promise.resolve({});

  it(`1) ORTAK AramaPageBody'yi locale="${locale}" ile render eder`, async () => {
    const { default: Page } = await import(modulePath);
    const element = await Page({ searchParams: sp });

    expect(setRequestLocaleMock).toHaveBeenCalledWith(locale);
    expect(requirePublicLocaleEnabledMock).toHaveBeenCalledTimes(1);
    expect(element.type).toBe(AramaPageBody);
    expect(element.props.locale).toBe(locale);
    /* searchParams AYNEN geçirilir — URL kontratı değişmedi. */
    expect(element.props.searchParams).toBe(sp);
  });

  it(`2) multilingual KAPALI → notFound() PROPAGATE eder`, async () => {
    requirePublicLocaleEnabledMock.mockRejectedValue(
      new Error("NEXT_NOT_FOUND")
    );
    const { default: Page } = await import(modulePath);
    await expect(Page({ searchParams: sp })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it(`3) force-dynamic korundu, placeholder noindex metadata'sı KALDIRILDI`, async () => {
    const mod = await import(modulePath);
    expect(mod.dynamic).toBe("force-dynamic");
    expect(mod.metadata).toBeUndefined();
  });
});

describe("app/(public)/arama/page.tsx — TR", () => {
  it("4) ORTAK AramaPageBody'yi locale='tr' ile render eder", async () => {
    const sp = Promise.resolve({});
    const { default: Page } = await import("@/app/(public)/arama/page");
    const element = await Page({ searchParams: sp });
    expect(element.type).toBe(AramaPageBody);
    expect(element.props.locale).toBe("tr");
    expect(element.props.searchParams).toBe(sp);
  });

  it("5) TR'de locale gate'i ÇAĞRILMAZ (davranış değişmedi)", async () => {
    const { default: Page } = await import("@/app/(public)/arama/page");
    await Page({ searchParams: Promise.resolve({}) });
    expect(setRequestLocaleMock).not.toHaveBeenCalled();
    expect(requirePublicLocaleEnabledMock).not.toHaveBeenCalled();
  });

  it("6) force-dynamic KORUNDU", async () => {
    const mod = await import("@/app/(public)/arama/page");
    expect(mod.dynamic).toBe("force-dynamic");
  });
});

/* ===============================================================
   B) DICTIONARY BÜTÜNLÜĞÜ
   =============================================================== */
describe("Phase 13 — `search` namespace bütünlüğü", () => {
  it("7) TR/EN/DE'de AYNI key ağacı", () => {
    const trPaths = leafPaths(tr.search).sort();
    expect(leafPaths(en.search).sort()).toEqual(trPaths);
    expect(leafPaths(de.search).sort()).toEqual(trPaths);
    expect(trPaths.length).toBeGreaterThan(50);
  });

  it("8) hiçbir dilde boş değer yok", () => {
    for (const [name, d] of [
      ["tr", tr],
      ["en", en],
      ["de", de],
    ] as const) {
      for (const v of leafValues(d.search)) {
        expect(typeof v, name).toBe("string");
        expect(v.trim().length, `${name}: "${v}"`).toBeGreaterThan(0);
      }
    }
  });

  it("9) EN'de Türkçe karakter yok", () => {
    for (const v of leafValues(en.search)) {
      expect(/[çÇğĞıİöÖşŞüÜ]/.test(v), v).toBe(false);
    }
  });

  it("10) DE'de Türkçeye ÖZGÜ karakter yok (ö/ü Almancada geçerli)", () => {
    for (const v of leafValues(de.search)) {
      expect(/[çÇğĞıİşŞ]/.test(v), v).toBe(false);
    }
  });

  it("11) parametreli şablonlar üç dilde de placeholder'ı KORUYOR", () => {
    for (const d of [tr, en, de]) {
      expect(d.search.pillRegions).toContain("{n}");
      expect(d.search.pillTypes).toContain("{n}");
      expect(d.search.pillGuests).toContain("{n}");
      expect(d.search.filters.guestsSummary).toContain("{n}");
      expect(d.search.filters.selectedCount).toContain("{n}");
      expect(d.search.filters.showResults).toContain("{n}");
      expect(d.search.filters.regionGroupAll).toContain("{group}");
      expect(d.search.filters.increaseAriaLabel).toContain("{label}");
      expect(d.search.filters.decreaseAriaLabel).toContain("{label}");
    }
  });
});

/* ===============================================================
   C) TR BYTE-IDENTITY
   =============================================================== */
describe("Phase 13 — TR byte-identity", () => {
  it("12) sayfa metinleri Phase 13 öncesiyle BİREBİR", () => {
    const s = tr.search;
    expect(s.breadcrumbHome).toBe("Ana sayfa");
    expect(s.breadcrumbVillas).toBe("Villalar");
    expect(s.heroEyebrow).toBe("Kiralık Villalar");
    expect(s.heroTitleFound).toBe("kiralık villa ve yazlık bulundu");
    expect(s.heroTitleIdleLead).toBe("Aradığını");
    expect(s.heroTitleIdleAccent).toBe("bulalım.");
    expect(s.heroFlexibleFound).toBe("alternatif villa daha bulundu");
    expect(s.pillRegions).toBe("{n} Bölge");
    expect(s.pillTypes).toBe("{n} Tip");
    expect(s.pillGuests).toBe("{n}+ Kişi");
    expect(s.errorTitle).toBe("Arama yüklenemedi.");
    expect(s.errorRetry).toBe("Tekrar dene");
    expect(s.showAllVillas).toBe("Tüm villaları göster");
    expect(s.emptyTitleLead).toBe("Uygun villa");
    expect(s.emptyTitleAccent).toBe("bulunamadı.");
    expect(s.emptyClearFilters).toBe("Filtreleri temizle");
    expect(s.sortLabel).toBe("Sırala");
    expect(s.pageSizeLabel).toBe("Sayfa başına");
    expect(s.paginationAriaLabel).toBe("Sayfalar");
    expect(s.paginationPrev).toBe("Önceki");
    expect(s.paginationNext).toBe("Sonraki");
    expect(s.flexibleEyebrow).toBe("Alternatif Müsaitlik");
    expect(s.flexibleTitle).toBe("Esnek Tarih Fırsatları");
    expect(s.flexibleCountSuffix).toBe("alternatif villa");
  });

  it("13) FilterSidebar metinleri BİREBİR", () => {
    const f = tr.search.filters;
    expect(f.title).toBe("Filtrele ve Tarih Seç");
    expect(f.dateLabel).toBe("Tarih");
    expect(f.dateSummaryEmpty).toBe("Tarih seç");
    expect(f.datePlaceholder).toBe("Giriş – Çıkış");
    expect(f.guestsLabel).toBe("Kişi Sayısı");
    expect(f.guestsCounterLabel).toBe("Kişi");
    expect(f.guestsCounterHint).toBe("Toplam kapasite");
    expect(f.regionLabel).toBe("Bölge");
    expect(f.regionAll).toBe("Tüm bölgeler");
    expect(f.typeLabel).toBe("Villa Tipi");
    expect(f.typeAll).toBe("Tümü");
    expect(f.advancedTitle).toBe("Gelişmiş Arama");
    expect(f.reset).toBe("Temizle");
    expect(f.apply).toBe("Filtrele");
    expect(f.applying).toBe("Aranıyor…");
    expect(f.findVillas).toBe("Villa Bul");
    expect(f.regionGroupAll).toBe("Tüm {group}");
    expect(f.showResults).toBe("{n} sonucu göster");
    expect(f.mobileTriggerLabel).toBe("Bölge, tarih, kişi…");
  });

  it("14) sortOptions TR değerleri `PUBLIC_SORT_LABELS` ile LOCKSTEP", () => {
    /* lib/pagination.ts DEĞİŞTİRİLMEDİ; TR çıktısı birebir aynı kalmalı. */
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
   D) BASEPATH TÜRETİMİ
   =============================================================== */
describe("Phase 13 — basePath", () => {
  it("15) mevcut `buildLocaleAlternates` ile /arama · /en/arama · /de/arama", () => {
    expect(buildLocaleAlternates("/arama", "tr").canonical).toBe("/arama");
    expect(buildLocaleAlternates("/arama", "en").canonical).toBe("/en/arama");
    expect(buildLocaleAlternates("/arama", "de").canonical).toBe("/de/arama");
  });

  it("16) gövde basePath'i buildLocaleAlternates'ten türetiyor", () => {
    const src = stripComments(readSrc(BODY_SRC));
    expect(src).toContain('buildLocaleAlternates("/arama", locale).canonical');
    /* Hardcoded "/arama?" URL inşası KALMADI. */
    expect(src).not.toContain('`/arama?${qs}`');
  });
});

/* ===============================================================
   E) FILTERSIDEBAR LOCALE DAVRANIŞI
   =============================================================== */
describe("Phase 13 — FilterSidebar locale", () => {
  const REGIONS = [
    { id: "r1", name: "Kalkan", slug: "kalkan", show_in_filter: true },
  ];
  const TYPES = [{ id: "t1", name: "Balayı", slug: "balayi" }];
  const INITIAL = {
    regions: [] as string[],
    categories: [] as string[],
    start: null,
    end: null,
    guests: 1,
  };

  /* ⚠️ "Filtrele" (apply CTA) ile mobil trigger eyebrow'u AYNI metni
     taşır. Mobil trigger `aria-haspopup="dialog"` ile ayırt edilir;
     bu helper panel içindeki gerçek CTA'yı tıklar. */
  function clickPanelButton(label: string) {
    const btn = screen
      .getAllByText(label)
      .map((el) => el.closest("button"))
      .find(
        (b): b is HTMLButtonElement =>
          !!b && b.getAttribute("aria-haspopup") !== "dialog"
      );
    expect(btn, `panel button: ${label}`).toBeTruthy();
    fireEvent.click(btn!);
  }

  function renderSidebar(
    locale: "tr" | "en" | "de",
    basePath: string,
    initial = INITIAL
  ) {
    return render(
      <FilterSidebar
        regionOptions={REGIONS}
        categoryOptions={TYPES}
        initial={initial}
        resultCount={7}
        locale={locale}
        basePath={basePath}
      />
    );
  }

  it("17) TR: başlık ve CTA TR (mevcut davranış)", () => {
    renderSidebar("tr", "/arama");
    expect(
      screen.getAllByText("Filtrele ve Tarih Seç").length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Temizle").length).toBeGreaterThan(0);
  });

  it("18) EN: panel metinleri İngilizce", () => {
    renderSidebar("en", "/en/arama");
    expect(
      screen.getAllByText(en.search.filters.title).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(en.search.filters.reset).length
    ).toBeGreaterThan(0);
    expect(screen.queryAllByText("Filtrele ve Tarih Seç")).toHaveLength(0);
  });

  it("19) DE: panel metinleri Almanca", () => {
    renderSidebar("de", "/de/arama");
    expect(
      screen.getAllByText(de.search.filters.title).length
    ).toBeGreaterThan(0);
    expect(screen.queryAllByText("Filtrele ve Tarih Seç")).toHaveLength(0);
  });

  it("20) EN buildHref → /en/arama (query kontratı korunur)", async () => {
    renderSidebar("en", "/en/arama", { ...INITIAL, guests: 4 });
    clickPanelButton(en.search.filters.apply);
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(pushMock.mock.calls[0][0]).toBe("/en/arama?guests=4");
  });

  it("21) DE buildHref → /de/arama", async () => {
    renderSidebar("de", "/de/arama", { ...INITIAL, guests: 4 });
    clickPanelButton(de.search.filters.apply);
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(pushMock.mock.calls[0][0]).toBe("/de/arama?guests=4");
  });

  it("22) TR buildHref → /arama (BYTE-IDENTICAL eski davranış)", async () => {
    renderSidebar("tr", "/arama", { ...INITIAL, guests: 4 });
    clickPanelButton("Filtrele");
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(pushMock.mock.calls[0][0]).toBe("/arama?guests=4");
  });

  it("23) prop verilmezse default tr + /arama (kiralik-villalar korunur)", async () => {
    render(
      <FilterSidebar
        regionOptions={REGIONS}
        categoryOptions={TYPES}
        initial={{ ...INITIAL, guests: 4 }}
        mode="redirect"
      />
    );
    /* mode="redirect" CTA'sı TR "Villa Bul" olarak kalır. */
    expect(screen.getAllByText("Villa Bul").length).toBeGreaterThan(0);
    clickPanelButton("Villa Bul");
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(pushMock.mock.calls[0][0]).toBe("/arama?guests=4");
  });

  it("24) resetFilters locale-aware (EN → /en/arama)", async () => {
    renderSidebar("en", "/en/arama", { ...INITIAL, guests: 4 });
    clickPanelButton(en.search.filters.reset);
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(pushMock.mock.calls[0][0]).toBe("/en/arama");
  });

  it("25) mode='redirect' resetFilters PUSH ETMEZ (mevcut sözleşme)", async () => {
    render(
      <FilterSidebar
        regionOptions={REGIONS}
        categoryOptions={TYPES}
        initial={{ ...INITIAL, guests: 4 }}
        mode="redirect"
        locale="en"
        basePath="/en/arama"
      />
    );
    clickPanelButton(en.search.filters.reset);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("26) takvim locale'leri (tr/en/de) register edildi", () => {
    const src = stripComments(readSrc(SIDEBAR_SRC));
    expect(src).toContain('registerLocale("tr", tr)');
    expect(src).toContain('registerLocale("en", enUS)');
    expect(src).toContain('registerLocale("de", de)');
    /* DatePicker locale'i artık prop'tan gelir. */
    expect(src).toContain("locale={locale}");
    expect(src).not.toContain('locale="tr"');
  });
});

/* ===============================================================
   E2) VİLLA TİPİ ADI — LOCALE-AWARE LABEL
   =============================================================== */
describe("Villa tipi adı locale-aware", () => {
  const OPTS = [
    { id: "r1", name: "Kalkan", slug: "kalkan", show_in_filter: true },
  ];
  const INITIAL = {
    regions: [] as string[],
    categories: [] as string[],
    start: null,
    end: null,
    guests: 1,
  };

  it("32) resolveTaxonomyName: TR canonical · EN/DE çeviri · eksikte TR fallback", () => {
    const canonical = "Müstakil Villa";
    const byLocale = { en: "Detached Villa", de: "Freistehende Villa" };

    expect(resolveTaxonomyName(canonical, byLocale, "tr")).toBe(canonical);
    expect(resolveTaxonomyName(canonical, byLocale, "en")).toBe(
      "Detached Villa"
    );
    expect(resolveTaxonomyName(canonical, byLocale, "de")).toBe(
      "Freistehende Villa"
    );
    /* DE çevirisi yoksa → canonical TR */
    expect(resolveTaxonomyName(canonical, { en: "Detached Villa" }, "de")).toBe(
      canonical
    );
    /* Boş/whitespace çeviri → canonical TR */
    expect(resolveTaxonomyName(canonical, { en: "   " }, "en")).toBe(canonical);
    /* TR'de harita dolu olsa bile ASLA çevrilmez */
    expect(resolveTaxonomyName(canonical, byLocale, "tr")).toBe(canonical);
  });

  it.each([
    ["tr", "Müstakil Villa"],
    ["en", "Detached Villa"],
    ["de", "Freistehende Villa"],
  ] as const)(
    "33) FilterSidebar /%s → çözülmüş tip adını gösterir",
    (loc, expected) => {
      /* Server tarafı `sidebarCategoryOptions`'ı çözüp geçirir; burada
         sidebar'ın verilen `name`'i AYNEN gösterdiği doğrulanır. */
      render(
        <FilterSidebar
          regionOptions={OPTS}
          categoryOptions={[{ id: "t1", name: expected, slug: "mustakil" }]}
          initial={INITIAL}
          locale={loc}
          basePath={loc === "tr" ? "/arama" : `/${loc}/arama`}
        />
      );
      /* 🛡️ "Villa Tipi" bölümü artık seçim yokken KAPALI başlıyor
         (accordion). Assertion DEĞİŞMEDİ — yalnız bölüm açılıyor. */
      clickPanelButtonGlobal({ tr, en, de }[loc].search.filters.typeLabel);
      expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
    }
  );

  it("34) tip SLUG'ı çevrilmez — seçim/URL canonical kalır", async () => {
    render(
      <FilterSidebar
        regionOptions={OPTS}
        categoryOptions={[
          { id: "t1", name: "Detached Villa", slug: "mustakil-villa" },
        ]}
        initial={INITIAL}
        locale="en"
        basePath="/en/arama"
      />
    );
    /* 🛡️ Accordion: seçim yokken kapalı → önce aç (assertion aynı). */
    clickPanelButtonGlobal(en.search.filters.typeLabel);
    fireEvent.click(screen.getAllByText("Detached Villa")[0]);
    clickPanelButtonGlobal(en.search.filters.apply);
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    /* Görünen ad EN, ama URL token canonical TR slug'ı. */
    expect(pushMock.mock.calls[0][0]).toBe(
      "/en/arama?villa-turleri=mustakil-villa"
    );
  });
});

/* ===============================================================
   F) SOURCE-LOCK
   =============================================================== */
describe("Phase 13 — source-lock", () => {
  it("27) AramaPageBody'de hardcoded TR kullanıcı metni KALMADI", () => {
    const src = stripComments(readSrc(BODY_SRC));
    for (const forbidden of [
      '"Ana sayfa"',
      '"Villalar"',
      '"Kiralık Villalar"',
      "kiralık villa ve",
      "Arama yüklenemedi.",
      "Tüm villaları göster",
      "Filtreleri temizle",
      '"Sırala"',
      "Sayfa başına",
      '"Sayfalar"',
      "Önceki",
      "Sonraki",
      "Esnek Tarih Fırsatları",
      "Alternatif Müsaitlik",
    ]) {
      expect(src.includes(forbidden), forbidden).toBe(false);
    }
  });

  it("28) FilterSidebar'da hardcoded TR kullanıcı metni KALMADI", () => {
    const src = stripComments(readSrc(SIDEBAR_SRC));
    for (const forbidden of [
      "Filtrele ve Tarih Seç",
      '"Tarih seç"',
      "Giriş – Çıkış",
      '"Kişi Sayısı"',
      '"Toplam kapasite"',
      '"Tüm bölgeler"',
      '"Villa Tipi"',
      "Gelişmiş Arama",
      '"Temizle"',
      '"Villa Bul"',
      '"Aranıyor…"',
      "Bölge, tarih, kişi…",
    ]) {
      expect(src.includes(forbidden), forbidden).toBe(false);
    }
  });

  it("29) URL QUERY KONTRATI değişmedi (canonical + legacy param'lar)", () => {
    const body = stripComments(readSrc(BODY_SRC));
    const sidebar = stripComments(readSrc(SIDEBAR_SRC));
    for (const p of [
      "villa-turleri",
      "categories",
      "bolgeler",
      "regions",
      "start",
      "end",
      "guests",
      "page",
      "pageSize",
      "sort",
      "flexible",
    ]) {
      expect(body.includes(p), `body: ${p}`).toBe(true);
    }
    expect(sidebar).toContain('params.set("villa-turleri"');
    expect(sidebar).toContain('params.set("bolgeler"');
    expect(sidebar).toContain('params.set("flexible", "3")');
  });

  it("30) arama pipeline'ı gövdede AYNEN duruyor", () => {
    const body = stripComments(readSrc(BODY_SRC));
    for (const token of [
      "findSearchResults",
      "getBlockedVillaIds",
      "calculateGrandTotal",
      "getStartingPrice",
      "applyPublicSort",
      "resolveTokens",
      "expandedRegions",
      "getVillaReviewStatsBatch",
      "parsePublicPage",
      "parsePublicPageSize",
      "parsePublicSort",
    ]) {
      expect(body.includes(token), token).toBe(true);
    }
  });

  it("30b) villa tipi adı MEVCUT iki helper ile çözülüyor (yeni sistem YOK)", () => {
    const body = stripComments(readSrc(BODY_SRC));
    expect(body).toContain("getVillaTypeNamesByLocale");
    expect(body).toContain("resolveTaxonomyName");
    /* TR'de çeviri sorgusu atılmaz. */
    expect(body).toContain("locale !== DEFAULT_LOCALE");
    /* Sidebar AYRI kopyayı alır; canonical dizi filtre mantığında kalır. */
    expect(body).toContain("categoryOptions={sidebarCategoryOptions}");
    expect(body).toContain("resolveTokens(categoryTokensRaw, categoryOptions)");
    /* Bölge adları çevrilmez (Phase 10I). */
    expect(body).toContain("regionOptions={regionOptions}");
  });

  it("31) VillaCard'a locale geçiliyor", () => {
    const body = stripComments(readSrc(BODY_SRC));
    const matches = body.match(/locale=\{locale\}/g) || [];
    /* 2 × VillaCard + 1 × FilterSidebar */
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});
