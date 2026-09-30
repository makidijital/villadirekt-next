/* ===============================================================
   🛡️ PHASE 10H — VİLLA TİPİ ADININ EN/DE LOCALE ÇÖZÜMÜ
   ===============================================================
   Kapsam (kullanıcı talimatıyla sınırlı): villa tipi ADININ public
   tarafta locale-aware gösterilmesi — YALNIZ Header ve Footer.
   VillaTypeCarousel / FilterSidebar / /arama / /kiralik-villalar /
   hero paneli / teklif-al BU FAZIN KAPSAMI DIŞINDADIR ve
   DEĞİŞTİRİLMEMİŞTİR.

   Katmanlar:
     1) `resolveTaxonomyName`            — saf çözücü (client-safe)
     2) `getVillaTypeNamesByLocale`      — server okuma (batch, gerçek
        `getTranslationsForParents` çalışır; yalnız DB primitive mock)
     3) Footer (client)                  — props ile doğrudan render
     4) FooterWrapper (server)           — gate + prop-passing
     5) Header (client)                  — props ile doğrudan render
     6) HeaderWrapper (server)           — gate + ağaç birleştirme

   ⚠️ Slug/href BU FAZDA DEĞİŞMEDİ — testler bunu da doğrular.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/* ---------------------------------------------------------------
   1) SAF ÇÖZÜCÜ — resolveTaxonomyName
   --------------------------------------------------------------- */
import { resolveTaxonomyName } from "@/lib/i18n/taxonomy-name.helper";

describe("resolveTaxonomyName — saf fallback mantığı", () => {
  const CANONICAL = "Balayı Villası";
  const NAMES = { en: "Honeymoon Villa", de: "Flitterwochen-Villa" };

  it("1) TR → canonical TR adı (çeviri haritası DOLU olsa bile)", () => {
    expect(resolveTaxonomyName(CANONICAL, NAMES, "tr")).toBe(CANONICAL);
  });

  it("2) EN → EN çevirisi", () => {
    expect(resolveTaxonomyName(CANONICAL, NAMES, "en")).toBe("Honeymoon Villa");
  });

  it("3) DE → DE çevirisi", () => {
    expect(resolveTaxonomyName(CANONICAL, NAMES, "de")).toBe(
      "Flitterwochen-Villa"
    );
  });

  it("4) EN çevirisi YOKSA → TR fallback", () => {
    expect(resolveTaxonomyName(CANONICAL, { de: "X" }, "en")).toBe(CANONICAL);
  });

  it("5) DE çevirisi YOKSA → TR fallback", () => {
    expect(resolveTaxonomyName(CANONICAL, { en: "X" }, "de")).toBe(CANONICAL);
  });

  it("6) harita undefined/null → TR fallback (eski davranış)", () => {
    expect(resolveTaxonomyName(CANONICAL, undefined, "en")).toBe(CANONICAL);
    expect(resolveTaxonomyName(CANONICAL, null, "de")).toBe(CANONICAL);
  });

  it("7) boş / whitespace çeviri → TR fallback (resolveTranslatedField ile aynı ilke)", () => {
    expect(resolveTaxonomyName(CANONICAL, { en: "" }, "en")).toBe(CANONICAL);
    expect(resolveTaxonomyName(CANONICAL, { de: "   " }, "de")).toBe(CANONICAL);
  });
});

/* ---------------------------------------------------------------
   2) SERVER OKUMA — getVillaTypeNamesByLocale
   GERÇEK `getTranslationsForParents` çalışır; yalnız en alttaki DB
   primitive'i (`translationRepository.findManyForLocale`) mock'lanır.
   --------------------------------------------------------------- */
const findManyForLocaleMock = vi.fn();
vi.mock("@/lib/db/translation.repository.server", () => ({
  translationRepository: {
    findManyForLocale: (...args: unknown[]) => findManyForLocaleMock(...args),
  },
}));

import { getVillaTypeNamesByLocale } from "@/lib/i18n/get-villa-type-translations.server";

describe("getVillaTypeNamesByLocale — batch okuma", () => {
  beforeEach(() => {
    findManyForLocaleMock.mockReset();
    findManyForLocaleMock.mockResolvedValue({ data: [], error: null });
  });

  it("8) locale başına TAM 1 sorgu (en + de), kayıt başına sorgu YOK", async () => {
    await getVillaTypeNamesByLocale(["t1", "t2", "t3"]);
    expect(findManyForLocaleMock).toHaveBeenCalledTimes(2);
    const locales = findManyForLocaleMock.mock.calls.map((c) => c[2]).sort();
    expect(locales).toEqual(["de", "en"]);
    for (const call of findManyForLocaleMock.mock.calls) {
      expect(call[0]).toBe("villa_type");
      expect(call[1]).toEqual(["t1", "t2", "t3"]);
    }
  });

  it("9) id listesi boşsa HİÇ sorgu atılmaz", async () => {
    const out = await getVillaTypeNamesByLocale([]);
    expect(out).toEqual({});
    expect(findManyForLocaleMock).not.toHaveBeenCalled();
  });

  it("10) tekrarlı id'ler tekilleştirilir", async () => {
    await getVillaTypeNamesByLocale(["t1", "t1", "t2"]);
    expect(findManyForLocaleMock.mock.calls[0][1]).toEqual(["t1", "t2"]);
  });

  it("11) satırlar type_id → {en, de} haritasına dönüşür", async () => {
    findManyForLocaleMock.mockImplementation(
      (_e: string, _ids: string[], locale: string) =>
        Promise.resolve({
          data: [
            {
              type_id: "t1",
              locale,
              name: locale === "en" ? "Luxury Villa" : "Luxusvilla",
            },
          ],
          error: null,
        })
    );
    const out = await getVillaTypeNamesByLocale(["t1"]);
    expect(out).toEqual({ t1: { en: "Luxury Villa", de: "Luxusvilla" } });
  });

  it("12) boş/whitespace çeviri haritaya GİRMEZ (→ tüketicide TR fallback)", async () => {
    findManyForLocaleMock.mockImplementation(
      (_e: string, _ids: string[], locale: string) =>
        Promise.resolve({
          data: [{ type_id: "t1", locale, name: locale === "en" ? "   " : "Luxusvilla" }],
          error: null,
        })
    );
    const out = await getVillaTypeNamesByLocale(["t1"]);
    expect(out).toEqual({ t1: { de: "Luxusvilla" } });
  });

  it("13) DB hatası → boş harita (çökmez, TR fallback korunur)", async () => {
    findManyForLocaleMock.mockResolvedValue({ data: null, error: new Error("db") });
    const out = await getVillaTypeNamesByLocale(["t1"]);
    expect(out).toEqual({});
  });
});

/* ---------------------------------------------------------------
   3–6) FOOTER / HEADER — client render + server wrapper
   --------------------------------------------------------------- */
const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

/* Header'ın ağır alt component'leri — header-locale.test.tsx ile AYNI
   shallow mock deseni (bu testlerin konusu yalnız isim çözümü). */
vi.mock("@/app/components/layout/TopBar", () => ({ default: () => null }));
vi.mock("@/app/components/layout/VillaSearchBox", () => ({ default: () => null }));
vi.mock("@/app/components/favorites/HeaderFavoritesLink", () => ({
  default: () => null,
}));

const getPublicSettingsMock = vi.fn();
vi.mock("@/app/services/settings.service", () => ({
  getPublicSettings: (...args: unknown[]) => getPublicSettingsMock(...args),
}));

const findAllVillaLocationsMock = vi.fn();
const findAllVillaTypesMock = vi.fn();
vi.mock("@/lib/db/menu.repository", () => ({
  menuRepository: {
    findAllVillaLocations: (...args: unknown[]) =>
      findAllVillaLocationsMock(...args),
    findAllVillaTypes: (...args: unknown[]) => findAllVillaTypesMock(...args),
  },
}));

const findActivePagesMock = vi.fn();
vi.mock("@/lib/db/pages.repository", () => ({
  pagesRepository: {
    findActivePages: (...args: unknown[]) => findActivePagesMock(...args),
  },
}));

const getMenuMock = vi.fn();
vi.mock("@/app/services/menu.service", () => ({
  getMenu: (...args: unknown[]) => getMenuMock(...args),
}));

/* 🔄 HeaderWrapper/FooterWrapper artık `getPublicSettings`/`getMenu`'yü
   DOĞRUDAN değil, `lib/cache.helpers.ts`'teki `unstable_cache`
   sarmalayıcıları üzerinden okuyor. Sarmalayıcılar AYNI fonksiyonu
   çağırdığı için testin AMACI ve TÜM assertion'ları DEĞİŞMEDİ — yalnız
   mock seam'i taşındı: aşağıdaki mock YUKARIDAKİ AYNI mock
   fonksiyonlarına delege eder. `menuRepository` mock'u (Footer'ın
   taksonomi kaynağı) AYNEN duruyor — orası DEĞİŞTİRİLMEDİ. */
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: (...args: unknown[]) => getPublicSettingsMock(...args),
  getCachedMenu: (...args: unknown[]) => getMenuMock(...args),
}));

import Footer from "@/app/components/layout/Footer";
import FooterWrapper from "@/app/components/layout/FooterWrapper";
import Header from "@/app/components/layout/Header";
import HeaderWrapper from "@/app/components/layout/HeaderWrapper";

const FOOTER_BASE = {
  settings: null,
  locations: [],
  corporatePages: [],
  year: 2026,
  siteName: "Tatilin Yeri",
  phoneDigits: "",
};

const TYPE_ITEM = {
  id: "type-1",
  name: "Lüks Villa",
  slug: "luks-villa",
  nameByLocale: { en: "Luxury Villa", de: "Luxusvilla" },
};

describe("Footer — villa tipi adı locale-aware", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  it("14) TR path → canonical TR adı (ÖNCEKİ davranış, DEĞİŞMEDİ)", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Footer {...FOOTER_BASE} villaTypes={[TYPE_ITEM]} />);
    expect(screen.getByText("Lüks Villa")).toBeInTheDocument();
    expect(screen.queryByText("Luxury Villa")).not.toBeInTheDocument();
  });

  it("15) EN path → EN adı", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villa/test");
    render(<Footer {...FOOTER_BASE} villaTypes={[TYPE_ITEM]} />);
    expect(screen.getByText("Luxury Villa")).toBeInTheDocument();
    expect(screen.queryByText("Lüks Villa")).not.toBeInTheDocument();
  });

  it("16) DE path → DE adı", () => {
    usePathnameMock.mockReturnValue("/de/kiralik-villa/test");
    render(<Footer {...FOOTER_BASE} villaTypes={[TYPE_ITEM]} />);
    expect(screen.getByText("Luxusvilla")).toBeInTheDocument();
  });

  it("17) EN çevirisi YOKSA → TR fallback", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villa/test");
    render(
      <Footer
        {...FOOTER_BASE}
        villaTypes={[{ ...TYPE_ITEM, nameByLocale: { de: "Luxusvilla" } }]}
      />
    );
    expect(screen.getByText("Lüks Villa")).toBeInTheDocument();
  });

  it("18) nameByLocale HİÇ YOKSA (eski caller) → TR adı, çökme yok", () => {
    usePathnameMock.mockReturnValue("/de/kiralik-villa/test");
    render(
      <Footer
        {...FOOTER_BASE}
        villaTypes={[{ id: "t", name: "Lüks Villa", slug: "luks-villa" }]}
      />
    );
    expect(screen.getByText("Lüks Villa")).toBeInTheDocument();
  });

  /* 🛡️ NAVIGATION LOCALE PERSISTENCE — TOKEN (`luks-villa`) ve query
     parametresi (`villa-turleri`) canonical KALIR; link yalnız aktif
     locale prefix'ini alır. Eski "prefix'siz" beklentisi EN/DE'de
     locale kaybına yol açıyordu. */
  it("19) 🛡️ SLUG/TOKEN DEĞİŞMEDİ — EN'de canonical token + '/en' prefix", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villa/test");
    render(<Footer {...FOOTER_BASE} villaTypes={[TYPE_ITEM]} />);
    expect(
      screen.getByRole("link", { name: "Luxury Villa" })
    /* 🛡️ SEO landing — slug'lı kategori `/villa-turleri/<slug>`'e gider;
       token (slug) ve '/en' prefix'i AYNEN. */
    ).toHaveAttribute("href", "/en/villa-turleri/luks-villa");
  });
});

describe("FooterWrapper — multilingual gate + prop-passing", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    usePathnameMock.mockReturnValue("/en/kiralik-villa/test");
    getPublicSettingsMock.mockReset();
    findAllVillaLocationsMock.mockReset();
    findAllVillaTypesMock.mockReset();
    findActivePagesMock.mockReset();
    findManyForLocaleMock.mockReset();
    findManyForLocaleMock.mockImplementation(
      (_e: string, _ids: string[], locale: string) =>
        Promise.resolve({
          data: [
            {
              type_id: "type-1",
              locale,
              name: locale === "en" ? "Luxury Villa" : "Luxusvilla",
            },
          ],
          error: null,
        })
    );
    findAllVillaLocationsMock.mockResolvedValue({ data: [] });
    findAllVillaTypesMock.mockResolvedValue({
      data: [{ id: "type-1", name: "Lüks Villa", slug: "luks-villa" }],
    });
    findActivePagesMock.mockResolvedValue({ data: [] });
  });

  it("20) multilingual_enabled=false → çeviri sorgusu HİÇ atılmaz, TR adı gösterilir", async () => {
    getPublicSettingsMock.mockResolvedValue({ multilingual_enabled: false });
    render(await FooterWrapper());
    expect(findManyForLocaleMock).not.toHaveBeenCalled();
    expect(screen.getByText("Lüks Villa")).toBeInTheDocument();
  });

  it("21) multilingual_enabled=true → çeviri okunur ve EN adı gösterilir", async () => {
    getPublicSettingsMock.mockResolvedValue({ multilingual_enabled: true });
    render(await FooterWrapper());
    expect(findManyForLocaleMock).toHaveBeenCalled();
    expect(screen.getByText("Luxury Villa")).toBeInTheDocument();
  });

  it("22) çeviri okuması patlarsa footer ÇÖKMEZ, TR adına düşer", async () => {
    getPublicSettingsMock.mockResolvedValue({ multilingual_enabled: true });
    findManyForLocaleMock.mockRejectedValue(new Error("db down"));
    render(await FooterWrapper());
    expect(screen.getByText("Lüks Villa")).toBeInTheDocument();
  });

  it("23) villa tipi YOKSA çeviri sorgusu atılmaz", async () => {
    getPublicSettingsMock.mockResolvedValue({ multilingual_enabled: true });
    findAllVillaTypesMock.mockResolvedValue({ data: [] });
    render(await FooterWrapper());
    expect(findManyForLocaleMock).not.toHaveBeenCalled();
  });
});

const CATEGORY_MENU_ITEM = {
  id: "m1",
  name: "Lüks Villa",
  href: "/arama?villa-turleri=luks-villa",
  source_type: "category",
  source_id: "type-1",
  children: [],
};

describe("Header — kategori menü adı locale-aware", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  it("24) TR path → canonical TR adı (ÖNCEKİ davranış)", () => {
    usePathnameMock.mockReturnValue("/");
    render(
      <Header
        menu={[{ ...CATEGORY_MENU_ITEM, nameByLocale: { en: "Luxury Villa" } }]}
        siteLogo={null}
      />
    );
    expect(screen.getAllByText("Lüks Villa").length).toBeGreaterThan(0);
    expect(screen.queryByText("Luxury Villa")).not.toBeInTheDocument();
  });

  it("25) EN path → EN adı (masaüstü + mobil menüde)", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villa/test");
    render(
      <Header
        menu={[{ ...CATEGORY_MENU_ITEM, nameByLocale: { en: "Luxury Villa" } }]}
        siteLogo={null}
      />
    );
    expect(screen.getAllByText("Luxury Villa").length).toBeGreaterThan(0);
    expect(screen.queryByText("Lüks Villa")).not.toBeInTheDocument();
  });

  it("26) DE path → DE adı", () => {
    usePathnameMock.mockReturnValue("/de/kiralik-villa/test");
    render(
      <Header
        menu={[{ ...CATEGORY_MENU_ITEM, nameByLocale: { de: "Luxusvilla" } }]}
        siteLogo={null}
      />
    );
    expect(screen.getAllByText("Luxusvilla").length).toBeGreaterThan(0);
  });

  it("27) çeviri yoksa TR fallback; nameByLocale olmayan öğeler etkilenmez", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villa/test");
    render(
      <Header
        menu={[
          { ...CATEGORY_MENU_ITEM, nameByLocale: { de: "Luxusvilla" } },
          { id: "m2", name: "Hakkımızda", href: "/p/hakkimizda" },
        ]}
        siteLogo={null}
      />
    );
    expect(screen.getAllByText("Lüks Villa").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hakkımızda").length).toBeGreaterThan(0);
  });

  it("28) alt menü (children) öğeleri de locale-aware", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villa/test");
    render(
      <Header
        menu={[
          {
            id: "m0",
            name: "Villalar",
            href: "/arama",
            children: [
              {
                ...CATEGORY_MENU_ITEM,
                nameByLocale: { en: "Luxury Villa" },
              },
            ],
          },
        ]}
        siteLogo={null}
      />
    );
    expect(screen.getAllByText("Luxury Villa").length).toBeGreaterThan(0);
  });

  /* 🛡️ NAVIGATION LOCALE PERSISTENCE — TOKEN (`luks-villa`) ve query
     parametresi (`villa-turleri`) canonical KALIR; link yalnız aktif
     locale prefix'ini alır. Eski "prefix'siz" beklentisi EN/DE'de
     locale kaybına yol açıyordu. */
  it("29) 🛡️ SLUG/TOKEN DEĞİŞMEDİ — EN'de canonical token + '/en' prefix", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villa/test");
    render(
      <Header
        menu={[{ ...CATEGORY_MENU_ITEM, nameByLocale: { en: "Luxury Villa" } }]}
        siteLogo={null}
      />
    );
    const links = screen.getAllByRole("link", { name: "Luxury Villa" });
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) {
      expect(l).toHaveAttribute(
        "href",
        "/en/arama?villa-turleri=luks-villa"
      );
    }
  });
});

describe("HeaderWrapper — multilingual gate + ağaç birleştirme", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    usePathnameMock.mockReturnValue("/en/kiralik-villa/test");
    getPublicSettingsMock.mockReset();
    getMenuMock.mockReset();
    findManyForLocaleMock.mockReset();
    findManyForLocaleMock.mockImplementation(
      (_e: string, _ids: string[], locale: string) =>
        Promise.resolve({
          data: [
            {
              type_id: "type-1",
              locale,
              name: locale === "en" ? "Luxury Villa" : "Luxusvilla",
            },
          ],
          error: null,
        })
    );
    getMenuMock.mockResolvedValue([CATEGORY_MENU_ITEM]);
  });

  it("30) multilingual_enabled=false → çeviri sorgusu HİÇ atılmaz, TR adı", async () => {
    getPublicSettingsMock.mockResolvedValue({ multilingual_enabled: false });
    render(await HeaderWrapper());
    expect(findManyForLocaleMock).not.toHaveBeenCalled();
    expect(screen.getAllByText("Lüks Villa").length).toBeGreaterThan(0);
  });

  it("31) multilingual_enabled=true → EN adı gösterilir", async () => {
    getPublicSettingsMock.mockResolvedValue({ multilingual_enabled: true });
    render(await HeaderWrapper());
    expect(findManyForLocaleMock).toHaveBeenCalled();
    expect(screen.getAllByText("Luxury Villa").length).toBeGreaterThan(0);
  });

  it("32) iç içe (children) kategori öğesi de çözülür, tek batch sorguda", async () => {
    getPublicSettingsMock.mockResolvedValue({ multilingual_enabled: true });
    getMenuMock.mockResolvedValue([
      {
        id: "m0",
        name: "Villalar",
        href: "/arama",
        source_type: "manual",
        source_id: null,
        children: [CATEGORY_MENU_ITEM],
      },
    ]);
    render(await HeaderWrapper());
    expect(screen.getAllByText("Luxury Villa").length).toBeGreaterThan(0);
    /* 🛡️ MIGRATION 086 — villa tipi çevirisi locale başına 1 sorgu
       (entity "villa_type"); ek olarak menü etiketi çevirisi de
       locale başına 1 sorgu (entity "menu"). Öğe/kayıt başına sorgu
       YOK — N+1 kilidi entity BAZINDA doğrulanır. */
    const typeCalls = findManyForLocaleMock.mock.calls.filter(
      (call) => call[0] === "villa_type"
    );
    expect(typeCalls).toHaveLength(2);
    const menuCalls = findManyForLocaleMock.mock.calls.filter(
      (call) => call[0] === "menu"
    );
    expect(menuCalls).toHaveLength(2);
  });

  it("33) menüde kategori öğesi yoksa VİLLA TİPİ çeviri sorgusu atılmaz", async () => {
    getPublicSettingsMock.mockResolvedValue({ multilingual_enabled: true });
    getMenuMock.mockResolvedValue([
      { id: "m2", name: "Hakkımızda", href: "/p/hakkimizda", source_type: "page", source_id: "p1" },
    ]);
    render(await HeaderWrapper());
    expect(
      findManyForLocaleMock.mock.calls.filter((c) => c[0] === "villa_type")
    ).toHaveLength(0);
    /* 🛡️ MIGRATION 086 (KAPSAM DARALTMASI) — `menu_translations`
       YALNIZ `source_type === "manual"` satırlar için okunur. Bu
       senaryodaki tek öğe `page` olduğundan menü çeviri sorgusu da
       ATILMAZ; sayfa adının çevirisi Pages sisteminin işidir. */
    expect(
      findManyForLocaleMock.mock.calls.filter((c) => c[0] === "menu")
    ).toHaveLength(0);
  });

  it("34) çeviri okuması patlarsa header ÇÖKMEZ, TR adına düşer", async () => {
    getPublicSettingsMock.mockResolvedValue({ multilingual_enabled: true });
    findManyForLocaleMock.mockRejectedValue(new Error("db down"));
    render(await HeaderWrapper());
    expect(screen.getAllByText("Lüks Villa").length).toBeGreaterThan(0);
  });

  it("35) getMenu patlarsa ÖNCEKİ fallback davranışı korunur (boş menü)", async () => {
    getPublicSettingsMock.mockResolvedValue({ multilingual_enabled: true });
    getMenuMock.mockRejectedValue(new Error("menu down"));
    const el = await HeaderWrapper();
    expect(() => render(el)).not.toThrow();
  });
});
