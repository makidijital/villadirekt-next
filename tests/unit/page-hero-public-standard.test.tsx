/* ===============================================================
   🎨 PUBLIC HERO STANDARDI — tüm PageHero kullanımları variant="listing"
   ===============================================================
   Yaklaşım: sayfa gövdeleri PageHero'ya geçtikleri prop'larla
   yakalanır (veri/metin/breadcrumb AYNEN), sonra GERÇEK PageHero aynı
   prop'larla render edilip yeni tasarım doğrulanır.
   =============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { readFileSync } from "fs";
import { resolve } from "path";

type HeroProps = ComponentProps<typeof import("@/app/components/ui/PageHero").default>;
const captured: HeroProps[] = [];

vi.mock("@/app/components/ui/PageHero", () => ({
  default: (p: HeroProps) => {
    captured.push(p);
    return null;
  },
}));

const SETTINGS = {
  page_hero_background_image: "https://cdn.example.com/hero/bg.jpg",
  updated_at: "2026-10-01T10:00:00Z",
};
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: async () => SETTINGS,
}));

const POST = {
  id: "p1",
  slug: "kas-rehberi",
  title: "Kaş Rehberi",
  excerpt: "Kaş'ta gezilecek yerler.",
  content: "<p>Gövde</p>",
  category: "Rehber",
  cover_image: null,
  og_image: null,
  published_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  author: null,
  is_active: true,
};
vi.mock("@/app/services/blog.service", () => ({
  getBlogPosts: async () => [],
  getBlogPostBySlug: async () => POST,
}));
vi.mock("@/lib/i18n/get-blog-translation.server", () => ({
  resolveBlogListContent: async (posts: unknown[]) => posts,
  resolveBlogContent: async (p: typeof POST, locale: string) => ({
    title: locale === "tr" ? p.title : `${p.title} (${locale})`,
    excerpt: p.excerpt,
    body: p.content,
    seoDescription: null,
  }),
}));
vi.mock("@/lib/storage/site-asset-version.server", () => ({
  getSiteAssetVersions: async () => ({}),
}));
vi.mock("@/app/(public)/favoriler/FavoritesGrid", () => ({ default: () => null }));

import BlogIndexPageBody from "@/app/components/blog/BlogIndexPageBody";
import BlogDetailPageBody from "@/app/components/blog/BlogDetailPageBody";
import FavoritesPageBody from "@/app/components/favorites/FavoritesPageBody";
import { resolveAssetUrlVersioned } from "@/lib/storage.helpers";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";

const LOCALES: Locale[] = ["tr", "en", "de"];
const prefix = (l: Locale) => (l === "tr" ? "" : `/${l}`);
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

async function realHero(props: HeroProps) {
  const { default: PageHero } = await vi.importActual<
    typeof import("@/app/components/ui/PageHero")
  >("@/app/components/ui/PageHero");
  return render(await PageHero(props));
}

function expectStandard(container: HTMLElement) {
  const section = container.querySelector("section")!;
  expect(section.className).toContain("min-h-[290px]");
  expect(section.className).toContain("sm:min-h-[330px]");
  expect(section.className).toContain("lg:min-h-[360px]");
  const img = section.querySelector("img")!;
  expect(img.getAttribute("src")).toBe(
    resolveAssetUrlVersioned(SETTINGS.page_hero_background_image, SETTINGS.updated_at)
  );
  expect(img.className).toContain("object-cover");
  expect(section.querySelector(".bg-\\[\\#0A1633\\]\\/35")).toBeTruthy();
  expect(container.innerHTML).not.toMatch(/gradient|rgb\(0 0 0 \/ 0\.5\)/);
  const nav = section.querySelector("nav")!;
  expect(nav.className).toContain("text-white/75");
  expect(nav.className).toContain("whitespace-nowrap");
  const h1 = section.querySelector("h1")!;
  expect(h1.className).toContain("text-[28px]");
  expect(h1.className).toContain("lg:text-[46px]");
  expect(h1.className).toContain("text-white");
  return { section, nav, h1 };
}

beforeEach(() => {
  captured.length = 0;
});

describe.each(LOCALES)("Blog hero — %s", (locale) => {
  const d = getDictionary(locale).blog;

  it("blog index: breadcrumb / eyebrow / başlık / açıklama AYNEN, yeni tasarım, sayı yok", async () => {
    render(await BlogIndexPageBody({ locale }));
    const p = captured[0];
    expect(p.variant).toBe("listing");
    expect(p.breadcrumb).toEqual([
      { name: d.breadcrumbHome, href: prefix(locale) || "/" },
      { name: d.breadcrumbBlog },
    ]);
    expect(p.eyebrow).toBe(d.eyebrow);
    expect(p.title).toBe(d.heroTitle);
    expect(p.description).toBe(d.heroDescription);
    expect(p.stat).toBeUndefined();

    const { container } = await realHero(p);
    const { section, nav, h1 } = expectStandard(container);
    expect(h1.textContent).toBe(d.heroTitle);
    const eyebrow = section.querySelector("p.uppercase")!;
    expect(eyebrow.textContent).toBe(d.eyebrow);
    expect(eyebrow.className).toContain("text-[#FAD716]");
    expect(eyebrow.className).toContain("text-[10.5px]");
    const desc = within(section).getByText(d.heroDescription);
    expect(desc.className).toContain("text-white/85");
    expect(desc.className).toContain("text-[13.5px]");
    const home = within(nav).getByRole("link", { name: d.breadcrumbHome });
    expect(home.getAttribute("href")).toBe(prefix(locale) || "/");
    expect(within(nav).getByText(d.breadcrumbBlog).getAttribute("aria-current")).toBe("page");
    expect(section.querySelector(".tabular-nums")).toBeNull();
  });

  it("blog detay: Ana sayfa → Blog → yazı başlığı; kategori eyebrow, özet açıklama", async () => {
    render(await BlogDetailPageBody({ locale, params: Promise.resolve({ slug: POST.slug }) }));
    const p = captured[0];
    const title = locale === "tr" ? POST.title : `${POST.title} (${locale})`;
    expect(p.variant).toBe("listing");
    expect(p.breadcrumb).toEqual([
      { name: d.breadcrumbHome, href: prefix(locale) || "/" },
      { name: d.breadcrumbBlog, href: `${prefix(locale)}/blog` },
      { name: title },
    ]);
    expect(p.eyebrow).toBe(POST.category);
    expect(p.description).toBe(POST.excerpt);

    const { container } = await realHero(p);
    const { nav, h1 } = expectStandard(container);
    expect(h1.textContent).toBe(title);
    expect(within(nav).getByRole("link", { name: d.breadcrumbBlog }).getAttribute("href")).toBe(
      `${prefix(locale)}/blog`
    );
  });

  it("favoriler: mevcut metinler + yeni tasarım", async () => {
    render(<>{FavoritesPageBody({ locale })}</>);
    const p = captured[0];
    const f = getDictionary(locale).favoritesPage;
    expect(p.variant).toBe("listing");
    expect(p.title).toBe(f.heroTitle);
    expect(p.description).toBe(f.heroDescription);
    const { container } = await realHero(p);
    expectStandard(container);
  });
});

describe("Kurumsal (CMS) hero — badge kompakt pill, stat yok", () => {
  it.each(LOCALES)("%s: badge eyebrow + satırlar render olur, eski büyük stat yok", async (locale) => {
    const c = getDictionary(locale).cms;
    const { container } = await realHero({
      variant: "listing",
      breadcrumb: [{ name: c.breadcrumbHome, href: prefix(locale) || "/" }, { name: "Hakkımızda" }],
      eyebrow: c.eyebrowCorporate,
      title: "Hakkımızda",
      description: "Biz kimiz.",
      badge: { eyebrow: "VillaDirekt", lines: ["2015", "Kaş"] },
    });
    const { section, h1 } = expectStandard(container);
    expect(h1.textContent).toBe("Hakkımızda");
    expect(within(section).getByText("VillaDirekt").className).toContain("text-[#FAD716]");
    expect(within(section).getByText("2015")).toBeTruthy();
    expect(within(section).getByText("Kaş")).toBeTruthy();
    expect(container.innerHTML).not.toContain("text-[44px]");
  });

  it("stat varken badge gizli (öncelik kuralı korunur)", async () => {
    const { container } = await realHero({
      variant: "listing",
      breadcrumb: [{ name: "Ana Sayfa", href: "/" }, { name: "X" }],
      title: "X",
      stat: { value: 537, label: "aktif villa" },
      badge: { lines: ["gizli"] },
    });
    expect(container.textContent).toContain("537");
    expect(container.textContent).not.toContain("gizli");
  });
});

describe("Arama hero — pill'ler kompakt", () => {
  it("pills değerleri AYNEN, kompakt chip", async () => {
    const { container } = await realHero({
      variant: "listing",
      breadcrumb: [{ name: "Ana Sayfa", href: "/" }, { name: "Villalar" }],
      title: "114 villa bulundu",
      pills: ["2 bölge", "4 misafir"],
    });
    expectStandard(container);
    const chip = Array.from(container.querySelectorAll("span")).find((s) => s.textContent === "2 bölge")!;
    expect(chip.className).toContain("h-7");
    expect(container.textContent).toContain("4 misafir");
  });
});

describe("Kaynak kilidi — kullanım noktaları", () => {
  const USERS = [
    "app/components/search/KiralikVillalarPageBody.tsx",
    "app/components/search/AramaPageBody.tsx",
    "app/components/blog/BlogIndexPageBody.tsx",
    "app/components/blog/BlogDetailPageBody.tsx",
    "app/components/favorites/FavoritesPageBody.tsx",
    "app/components/cms/CmsPageBody.tsx",
    "app/components/reservation-lookup/ReservationLookupPageBody.tsx",
  ];
  it.each(USERS)("%s → tek PageHero, variant=\"listing\"", (f) => {
    const src = read(f);
    expect(src.match(/<PageHero\b/g)?.length).toBe(1);
    const start = src.indexOf("<PageHero");
    const indent = src.slice(src.lastIndexOf("\n", start) + 1, start);
    const call = src.slice(start, src.indexOf(`\n${indent}/>`, start));
    expect(call).toContain('variant="listing"');
  });

  const NON_USERS = [
    "app/components/contact/ContactPageBody.tsx",
    "app/components/offer/OfferPageBody.tsx",
    "app/components/short-gaps/ShortGapsPageBody.tsx",
    "app/components/shared-list/SharedListPageBody.tsx",
    "app/components/not-found/NotFoundContent.tsx",
    "app/components/home/HomePageBody.tsx",
    "app/components/reservation/ReservationPageBody.tsx",
    "app/components/private-villa/PrivateVillaPageBody.tsx",
  ];
  it.each(NON_USERS)("%s → PageHero kullanmıyor (etkilenmedi)", (f) => {
    expect(read(f)).not.toMatch(/<PageHero\b/);
  });
});
