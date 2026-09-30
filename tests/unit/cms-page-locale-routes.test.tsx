/* ===============================================================
   🛡️ PHASE 12D — /p/[slug] · /en/p/[slug] · /de/p/[slug] TESTLERİ
   ===============================================================
   Kapsam:
     A) Üç route da AYNI `CmsPageBody`'yi render eder ve DOĞRU
        locale + ÇÖZÜLMÜŞ metinleri geçirir
     B) EN/DE `setRequestLocale` + `requirePublicLocaleEnabled`
        gate davranışı (multilingual kapalıyken notFound)
     C) 404: TR'nin kendine özgü inline bloğu KORUNDU; EN/DE
        `notFound()` kullanır
     D) 🔴 GERÇEK DOM RENDER — EN/DE çeviri metinleri sayfada
        GÖRÜNÜYOR; slug ve sections TR kalıyor

   `homepage-locale-routes.test.tsx` (Phase 11) ile AYNI mock deseni.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const requirePublicLocaleEnabledMock = vi.fn();
const setRequestLocaleMock = vi.fn();
const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/lib/i18n/public-locale-gate.server", () => ({
  requirePublicLocaleEnabled: () => requirePublicLocaleEnabledMock(),
}));
vi.mock("@/lib/i18n/request-locale.server", () => ({
  setRequestLocale: (...a: unknown[]) => setRequestLocaleMock(...a),
}));
vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));

const getPageBySlugMock = vi.fn();
vi.mock("@/app/services/page.service", () => ({
  getPageBySlug: (...a: unknown[]) => getPageBySlugMock(...a),
  getPages: vi.fn(),
}));

const getTranslationMock = vi.fn();
vi.mock("@/lib/i18n/get-translation.server", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    getTranslation: (...a: unknown[]) => getTranslationMock(...a),
  };
});

vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: vi.fn().mockResolvedValue({ multilingual_enabled: true }),
}));

vi.mock("@/lib/storage.helpers", () => ({
  getPageCoverPublicUrl: (v: string | null | undefined) =>
    v ? `https://cdn.test/${v}` : null,
}));

/* DOM render için: async / ağır alt component'ler sadeleştirilir.
   Tasarım testi DEĞİL — metin kaynağı testi. */
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img alt={String(props.alt ?? "")} src={String(props.src ?? "")} />
  ),
}));
vi.mock("@/app/components/ui/PageHero", () => ({
  default: (props: { title?: React.ReactNode; description?: string }) => (
    <div data-testid="page-hero">
      <h1>{props.title}</h1>
      {props.description ? <p>{props.description}</p> : null}
    </div>
  ),
}));
vi.mock("@/app/components/cms/PageSectionRenderer", () => ({
  default: (props: { section: { type: string; content?: string } }) => (
    <div data-testid="section">{props.section.content ?? props.section.type}</div>
  ),
}));
vi.mock("@/app/components/seo/StructuredData", () => ({
  JsonLd: () => null,
  buildBreadcrumb: (items: unknown, locale?: string) => ({ items, locale }),
}));

import CmsPageBody from "@/app/components/cms/CmsPageBody";

const PAGE_ID = "page-uuid-1";
const SLUG = "kasta-unutulmaz-bir-tatil";

/* Kurumsal OLMAYAN + cover'lı sayfa → editorial hero dalı (h1 doğrudan). */
const TR_PAGE = {
  id: PAGE_ID,
  slug: SLUG,
  title: "Kaş'ta Unutulmaz Bir Tatil",
  excerpt: "Türkçe özet",
  body: "Türkçe gövde",
  seo_title: "TR SEO başlık",
  seo_description: "TR SEO açıklama",
  noindex: false,
  cover_image: "pages/kas.webp",
  sections: [],
};

const EN_ROW = {
  id: "t-en",
  page_id: PAGE_ID,
  locale: "en",
  title: "An Unforgettable Holiday in Kas",
  excerpt: "EN excerpt",
  body: "EN body paragraph",
  seo_title: "EN SEO title",
  seo_description: "EN SEO description",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const DE_ROW = {
  ...EN_ROW,
  id: "t-de",
  locale: "de",
  title: "Ein unvergesslicher Urlaub in Kaş",
  excerpt: "DE Auszug",
  body: "DE Inhalt Absatz",
};

beforeEach(() => {
  vi.clearAllMocks();
  requirePublicLocaleEnabledMock.mockResolvedValue(undefined);
  getPageBySlugMock.mockResolvedValue(TR_PAGE);
  getTranslationMock.mockResolvedValue(null);
  notFoundMock.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

const params = Promise.resolve({ slug: SLUG });

/* ===============================================================
   A + B) ROUTE DAVRANIŞI
   =============================================================== */
const LOCALE_ROUTES: Array<[string, "en" | "de", typeof EN_ROW]> = [
  ["@/app/(public)/en/p/[slug]/page", "en", EN_ROW],
  ["@/app/(public)/de/p/[slug]/page", "de", DE_ROW],
];

describe.each(LOCALE_ROUTES)("%s", (modulePath, locale, row) => {
  it(`1) gate geçerse ORTAK CmsPageBody'yi locale="${locale}" ile render eder`, async () => {
    getTranslationMock.mockResolvedValue(row);
    const { default: Page } = await import(modulePath);
    const element = await Page({ params: Promise.resolve({ slug: SLUG }) });

    expect(setRequestLocaleMock).toHaveBeenCalledWith(locale);
    expect(requirePublicLocaleEnabledMock).toHaveBeenCalledTimes(1);
    expect(element.type).toBe(CmsPageBody);
    expect(element.props.locale).toBe(locale);
    expect(element.props.slug).toBe(SLUG);
    expect(element.props.title).toBe(row.title);
    expect(element.props.resolvedExcerpt).toBe(row.excerpt);
    expect(element.props.body).toBe(row.body);
  });

  it(`2) çeviri okuması DOĞRU entity/locale ile yapılır`, async () => {
    getTranslationMock.mockResolvedValue(row);
    const { default: Page } = await import(modulePath);
    await Page({ params: Promise.resolve({ slug: SLUG }) });
    expect(getTranslationMock).toHaveBeenCalledWith("page", PAGE_ID, locale);
  });

  it(`3) çeviri YOKSA TR'ye fallback — URL/locale korunur`, async () => {
    getTranslationMock.mockResolvedValue(null);
    const { default: Page } = await import(modulePath);
    const element = await Page({ params: Promise.resolve({ slug: SLUG }) });
    expect(element.props.locale).toBe(locale);
    expect(element.props.slug).toBe(SLUG);
    expect(element.props.title).toBe(TR_PAGE.title);
    expect(element.props.body).toBe(TR_PAGE.body);
  });

  it(`4) multilingual KAPALI → gate'in notFound()'u PROPAGATE eder`, async () => {
    requirePublicLocaleEnabledMock.mockRejectedValue(
      new Error("NEXT_NOT_FOUND")
    );
    const { default: Page } = await import(modulePath);
    await expect(
      Page({ params: Promise.resolve({ slug: SLUG }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it(`5) sayfa yoksa notFound() çağrılır`, async () => {
    getPageBySlugMock.mockResolvedValue(null);
    const { default: Page } = await import(modulePath);
    await expect(
      Page({ params: Promise.resolve({ slug: SLUG }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it(`6) generateMetadata mevcut (statik metadata YOK)`, async () => {
    const mod = await import(modulePath);
    expect(mod.metadata).toBeUndefined();
    expect(typeof mod.generateMetadata).toBe("function");
  });
});

describe("app/p/[slug]/page.tsx — TR", () => {
  it("7) ORTAK CmsPageBody'yi locale='tr' ile render eder", async () => {
    const { default: Page } = await import("@/app/p/[slug]/page");
    const element = await Page({ params });
    expect(element.type).toBe(CmsPageBody);
    expect(element.props.locale).toBe("tr");
    expect(element.props.title).toBe(TR_PAGE.title);
    expect(element.props.body).toBe(TR_PAGE.body);
  });

  it("8) TR'de locale gate'i ve çeviri okuması ÇAĞRILMAZ", async () => {
    const { default: Page } = await import("@/app/p/[slug]/page");
    await Page({ params });
    expect(setRequestLocaleMock).not.toHaveBeenCalled();
    expect(requirePublicLocaleEnabledMock).not.toHaveBeenCalled();
    expect(getTranslationMock).not.toHaveBeenCalled();
  });

  it("9) TR 404: kendine özgü inline blok KORUNDU (notFound() DEĞİL)", async () => {
    getPageBySlugMock.mockResolvedValue(null);
    const { default: Page } = await import("@/app/p/[slug]/page");
    const element = await Page({ params });
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(element.type).not.toBe(CmsPageBody);
    render(element);
    expect(screen.getByText("Sayfa bulunamadı.")).toBeTruthy();
    expect(
      screen.getByText("Aradığın sayfa kaldırılmış veya taşınmış olabilir.")
    ).toBeTruthy();
  });
});

/* ===============================================================
   D) GERÇEK DOM RENDER — çeviri metni sayfada görünüyor mu?
   =============================================================== */
describe("CmsPageBody — gerçek render (çeviri metinleri)", () => {
  async function renderRoute(modulePath: string) {
    const { default: Page } = await import(modulePath);
    const element = await Page({ params: Promise.resolve({ slug: SLUG }) });
    render(element);
  }

  it("10) TR: Türkçe başlık/excerpt/gövde render edilir", async () => {
    await renderRoute("@/app/p/[slug]/page");
    /* Başlık hem breadcrumb'da hem <h1>'de geçer → heading role ile. */
    expect(
      screen.getByRole("heading", { name: TR_PAGE.title })
    ).toBeTruthy();
    expect(screen.getByText(TR_PAGE.excerpt)).toBeTruthy();
    expect(screen.getByText(TR_PAGE.body)).toBeTruthy();
  });

  it("11) EN: İngilizce başlık/excerpt/gövde render edilir", async () => {
    getTranslationMock.mockResolvedValue(EN_ROW);
    await renderRoute("@/app/(public)/en/p/[slug]/page");

    expect(screen.getByRole("heading", { name: EN_ROW.title })).toBeTruthy();
    expect(screen.getByText(EN_ROW.excerpt)).toBeTruthy();
    expect(screen.getByText(EN_ROW.body)).toBeTruthy();
    /* TR içerik SAYFADA YOK */
    expect(screen.queryAllByText(TR_PAGE.title)).toHaveLength(0);
    expect(screen.queryAllByText(TR_PAGE.body)).toHaveLength(0);
  });

  it("12) DE: Almanca başlık/excerpt/gövde render edilir", async () => {
    getTranslationMock.mockResolvedValue(DE_ROW);
    await renderRoute("@/app/(public)/de/p/[slug]/page");

    expect(screen.getByRole("heading", { name: DE_ROW.title })).toBeTruthy();
    expect(screen.getByText(DE_ROW.excerpt)).toBeTruthy();
    expect(screen.getByText(DE_ROW.body)).toBeTruthy();
    expect(screen.queryAllByText(TR_PAGE.title)).toHaveLength(0);
  });

  it("13) EN çevirisi YOKSA sayfa TR içerikle render edilir (fallback)", async () => {
    getTranslationMock.mockResolvedValue(null);
    await renderRoute("@/app/(public)/en/p/[slug]/page");
    expect(
      screen.getByRole("heading", { name: TR_PAGE.title })
    ).toBeTruthy();
    expect(screen.getByText(TR_PAGE.body)).toBeTruthy();
  });

  it("14) ALAN BAZINDA fallback: EN başlık var, gövde TR", async () => {
    getTranslationMock.mockResolvedValue({ ...EN_ROW, body: null });
    await renderRoute("@/app/(public)/en/p/[slug]/page");
    expect(screen.getByRole("heading", { name: EN_ROW.title })).toBeTruthy();
    expect(screen.getByText(TR_PAGE.body)).toBeTruthy();
  });

  it("15) SLUG ÇEVRİLMEZ — cover alt/başlık değişse de slug TR kalır", async () => {
    getTranslationMock.mockResolvedValue(EN_ROW);
    const { default: Page } = await import(
      "@/app/(public)/en/p/[slug]/page"
    );
    const element = await Page({ params: Promise.resolve({ slug: SLUG }) });
    expect(element.props.slug).toBe(SLUG);
    expect(element.props.page.slug).toBe(SLUG);
  });

  it("16) SECTIONS ÇEVRİLMEZ — EN sayfasında TR sections render edilir", async () => {
    getPageBySlugMock.mockResolvedValue({
      ...TR_PAGE,
      sections: [{ type: "richtext", content: "TR bölüm metni" }],
    });
    getTranslationMock.mockResolvedValue(EN_ROW);
    await renderRoute("@/app/(public)/en/p/[slug]/page");

    /* Başlık EN, section içeriği TR (page_translations'ta kolon YOK). */
    expect(screen.getByRole("heading", { name: EN_ROW.title })).toBeTruthy();
    expect(screen.getByTestId("section").textContent).toBe("TR bölüm metni");
    /* sections varken body render EDİLMEZ (mevcut davranış). */
    expect(screen.queryByText(EN_ROW.body)).toBeNull();
  });

  it("17) kurumsal sayfa kararı canonical TR başlığa bağlı kalır (EN'de de PageHero)", async () => {
    getPageBySlugMock.mockResolvedValue({
      ...TR_PAGE,
      slug: "hakkimizda",
      title: "Hakkımızda",
      cover_image: "pages/x.webp",
    });
    getTranslationMock.mockResolvedValue({ ...EN_ROW, title: "About Us" });

    const { default: Page } = await import(
      "@/app/(public)/en/p/[slug]/page"
    );
    const element = await Page({
      params: Promise.resolve({ slug: "hakkimizda" }),
    });
    render(element);

    /* Kurumsal hero KORUNDU (cover'a rağmen PageHero) ve başlık EN. */
    expect(screen.getByTestId("page-hero")).toBeTruthy();
    expect(screen.getByText("About Us")).toBeTruthy();
  });
});
