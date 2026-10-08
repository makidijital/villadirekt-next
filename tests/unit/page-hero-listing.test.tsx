/* ===============================================================
   🎨 PageHero variant="listing" — /kiralik-villalar · /villa-turleri/
   [slug] · /bolgeler/[slug] kompakt hero (yalnız tasarım)
   ===============================================================
   - Görsel kaynağı default variant ile BİREBİR aynı (settings →
     resolveAssetUrlVersioned).
   - Breadcrumb isim/href, eyebrow, başlık, stat değeri prop'lardan AYNEN.
   - Default variant (diğer sayfalar) DEĞİŞMEDİ.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, within } from "@testing-library/react";

const getCachedSettingsMock = vi.fn();
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: () => getCachedSettingsMock(),
}));

import PageHero from "@/app/components/ui/PageHero";
import { resolveAssetUrlVersioned } from "@/lib/storage.helpers";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { localeHref } from "@/lib/i18n/locale-href";
import type { Locale } from "@/lib/i18n/config";

const SETTINGS = {
  page_hero_background_image: "https://cdn.example.com/hero/bg.jpg",
  updated_at: "2026-10-01T10:00:00Z",
};

function crumbs(locale: Locale, title?: string) {
  const d = getDictionary(locale).villasArchive;
  return title
    ? [
        { name: d.breadcrumbHome, href: localeHref("/", locale) },
        { name: d.breadcrumbCurrent, href: localeHref("/kiralik-villalar", locale) },
        { name: title },
      ]
    : [{ name: d.breadcrumbHome, href: localeHref("/", locale) }, { name: d.breadcrumbCurrent }];
}

async function renderHero(props: Parameters<typeof PageHero>[0]) {
  const el = await PageHero(props);
  return render(el);
}

beforeEach(() => {
  getCachedSettingsMock.mockReset();
  getCachedSettingsMock.mockResolvedValue(SETTINGS);
});

describe("PageHero variant='listing'", () => {
  it.each(["tr", "en", "de"] as const)(
    "%s: aynı görsel kaynağı, aynı breadcrumb linkleri, aynı başlık/etiket/sayı",
    async (locale) => {
      const d = getDictionary(locale);
      const { container } = await renderHero({
        variant: "listing",
        breadcrumb: crumbs(locale, "Muhafazakar Villalar"),
        eyebrow: d.taxonomyLanding.categoryHeroEyebrow,
        title: "Muhafazakar Villalar",
        stat: { value: 537, label: d.villasArchive.heroStatLabel },
      });

      const img = container.querySelector("img") as HTMLImageElement;
      expect(img.getAttribute("src")).toBe(
        resolveAssetUrlVersioned(SETTINGS.page_hero_background_image, SETTINGS.updated_at)
      );
      expect(img).toHaveClass("object-cover");

      const nav = container.querySelector('nav[aria-label="Breadcrumb"]') as HTMLElement;
      const links = Array.from(nav.querySelectorAll("a")).map((a) => [a.textContent, a.getAttribute("href")]);
      expect(links).toEqual([
        [d.villasArchive.breadcrumbHome, localeHref("/", locale)],
        [d.villasArchive.breadcrumbCurrent, localeHref("/kiralik-villalar", locale)],
      ]);
      expect(within(nav).getByText("Muhafazakar Villalar")).toHaveAttribute("aria-current", "page");

      expect(within(container).getByText(d.taxonomyLanding.categoryHeroEyebrow)).toHaveClass("text-[#FAD716]", "uppercase");
      const h1 = container.querySelector("h1") as HTMLElement;
      expect(h1.textContent).toBe("Muhafazakar Villalar");
      expect(h1).toHaveClass("font-display", "font-bold", "text-white", "text-[28px]", "md:text-[42px]", "lg:text-[46px]");

      expect(within(container).getByText("537")).toHaveClass("text-[#FAD716]");
      expect(within(container).getByText(d.villasArchive.heroStatLabel)).toBeInTheDocument();
    }
  );

  it("kompakt yükseklik; overlay hafif ve düz (gradient yok); breadcrumb beyaz tek satır", async () => {
    const { container } = await renderHero({
      variant: "listing",
      breadcrumb: crumbs("tr"),
      eyebrow: "Tüm Villalar",
      title: "Kiralık Villalar",
      stat: { value: 12, label: "Aktif Villa" },
    });
    const section = container.querySelector("section") as HTMLElement;
    expect(section).toHaveClass("min-h-[290px]", "sm:min-h-[330px]", "lg:min-h-[360px]", "overflow-hidden");
    expect(container.querySelector(".bg-\\[\\#0A1633\\]\\/35")).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/gradient|rgb\(0 0 0 \/ 0\.5\)/);
    const nav = container.querySelector("nav") as HTMLElement;
    expect(nav).toHaveClass("text-white/75", "whitespace-nowrap", "overflow-hidden");
  });

  it("görsel yoksa (settings boş) navy zemin; içerik aynı", async () => {
    getCachedSettingsMock.mockResolvedValue({});
    const { container } = await renderHero({
      variant: "listing",
      breadcrumb: crumbs("en"),
      title: "Villas for Rent",
      stat: { value: 3, label: "Active Villas" },
    });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("section")).toHaveClass("bg-[#0A1633]");
    expect(container.querySelector("h1")?.textContent).toBe("Villas for Rent");
  });

  it("default variant (blog / favoriler / kurumsal / arama…) DEĞİŞMEDİ", async () => {
    const { container } = await renderHero({
      breadcrumb: crumbs("tr"),
      eyebrow: "Tüm Villalar",
      title: "Kiralık Villalar",
      stat: { value: 12, label: "Aktif Villa" },
    });
    const section = container.querySelector("section") as HTMLElement;
    expect(section).toHaveClass("pt-12", "md:pt-20");
    expect(section).not.toHaveClass("min-h-[290px]");
    expect(container.querySelector("h1")).toHaveClass("lg:text-[66px]");
    const overlay = container.querySelector("img")!.nextElementSibling as HTMLElement;
    expect(overlay.getAttribute("style")).toMatch(/rgba?\(0,? ?0,? ?0/);
  });
});
