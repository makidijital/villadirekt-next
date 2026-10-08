/* ===============================================================
   🎨 HEADER — desktop mega-menü (Bölgeler / Kategoriler)
   ===============================================================
   Veri = `menu[].children` (getMenu); sıra, href, locale prefix AYNEN.
   Yalnız masaüstü dropdown görünümü değişti; mobil accordion aynı.
   =============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";

const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => usePathnameMock() }));
vi.mock("@/app/components/layout/TopBar", () => ({ default: () => null }));
vi.mock("@/app/components/layout/VillaSearchBox", () => ({ default: () => null }));
vi.mock("@/app/components/favorites/HeaderFavoritesLink", () => ({ default: () => null }));

import Header from "@/app/components/layout/Header";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { localeHref } from "@/lib/i18n/locale-href";

const REGIONS = ["Kalkan", "Kaş", "Fethiye", "Üzümlü", "Göcek", "Ölüdeniz", "Hisarönü", "Faralya", "Dalaman"].map(
  (name, i) => ({
    id: `r${i}`,
    name,
    href: `/bolgeler/${name.toLowerCase()}`,
    source_type: "region",
  })
);
const TYPES = [
  { id: "t1", name: "Balayı Villası", href: "/villa-turleri/balayi-villasi", source_type: "category", nameByLocale: { en: "Honeymoon Villa", de: "Flitterwochen-Villa" } },
  { id: "t2", name: "Muhafazakar Villa", href: "/villa-turleri/muhafazakar-villa", source_type: "category" },
  { id: "t3", name: "Lüks Villa", href: "/villa-turleri/luks-villa", source_type: "category", nameByLocale: { en: "Luxury Villa" } },
  { id: "t4", name: "Ekonomik Villa", href: "/villa-turleri/ekonomik-villa", source_type: "category" },
  { id: "t5", name: "Jakuzili Villa", href: "/villa-turleri/jakuzili-villa", source_type: "category" },
];
const MENU = [
  { id: "m1", name: "Bölgeler", href: "/bolgeler", source_type: "manual", children: REGIONS },
  { id: "m2", name: "Kategoriler", href: "/villa-turleri", source_type: "manual", children: TYPES },
  { id: "m3", name: "İletişim", href: "/iletisim", source_type: "manual" },
  { id: "m4", name: "Kurumsal", href: "#", source_type: "manual", children: [{ id: "p1", name: "Hakkımızda", href: "/p/hakkimizda", source_type: "page" }] },
];

beforeEach(() => usePathnameMock.mockReturnValue("/"));
afterEach(() => cleanup());

function panels() {
  return screen.getAllByTestId("header-mega-menu");
}

describe("mega-menü — veri / href / sıra AYNEN", () => {
  it.each(["tr", "en", "de"] as const)("%s: bölge + kategori linkleri, sıra ve locale prefix", (locale) => {
    usePathnameMock.mockReturnValue(locale === "tr" ? "/" : `/${locale}`);
    render(<Header menu={MENU} />);
    const [reg, cat, corp] = panels();
    expect(panels()).toHaveLength(3); /* yalnız children'lı öğeler */

    const regLinks = within(reg).getAllByRole("listitem").map((li) => li.querySelector("a")!);
    expect(regLinks.map((a) => a.textContent)).toEqual(REGIONS.map((r) => r.name));
    expect(regLinks.map((a) => a.getAttribute("href"))).toEqual(REGIONS.map((r) => localeHref(r.href, locale)));

    const catLinks = within(cat).getAllByRole("listitem").map((li) => li.querySelector("a")!);
    expect(catLinks.map((a) => a.getAttribute("href"))).toEqual(TYPES.map((t) => localeHref(t.href, locale)));
    if (locale === "en") expect(catLinks[0].textContent).toBe("Honeymoon Villa");
    if (locale === "de") expect(catLinks[0].textContent).toBe("Flitterwochen-Villa");
    if (locale === "tr") expect(catLinks[0].textContent).toBe("Balayı Villası");

    /* "Tüm …" CTA → ebeveynin MEVCUT href'i; "#" ebeveynde CTA yok */
    const d = getDictionary(locale).header;
    const regAll = within(reg).getByRole("link", { name: d.megaMenuViewAll.replace("{label}", "Bölgeler") });
    expect(regAll.getAttribute("href")).toBe(localeHref("/bolgeler", locale));
    expect(within(corp).queryByText(d.megaMenuViewAll.replace("{label}", "Kurumsal"))).toBeNull();
  });
});

describe("mega-menü — tasarım", () => {
  it("bölgeler 3 kolon / geniş panel, kategoriler 2 kolon; ikonlar #1B4EF5", () => {
    render(<Header menu={MENU} />);
    const [reg, cat] = panels();
    const regCard = reg.firstElementChild as HTMLElement;
    expect(regCard.className).toContain("w-[800px]");
    expect(regCard.className).toContain("max-w-full");
    expect(regCard.className).toContain("rounded-[20px]");
    expect(regCard.className).toContain("border-[#E5E7EB]");
    expect(reg.querySelector("ul")!.className).toContain("lg:grid-cols-3");
    expect((cat.firstElementChild as HTMLElement).className).toContain("w-[560px]");
    expect(cat.querySelector("ul")!.className).toContain("grid-cols-2");
    const icon = reg.querySelector("li svg")!;
    expect(icon.getAttribute("class")).toContain("text-[#1B4EF5]");
    const link = reg.querySelector("li a")!;
    expect(link.className).toContain("hover:bg-[#EFF4FF]");
    expect(reg.outerHTML + cat.outerHTML).not.toMatch(/gradient|glow|blur/);
  });

  it("hover + klavye (focus-within) ile açılır; chevron döner; panel container'a ortalı", () => {
    const { container } = render(<Header menu={MENU} />);
    const [reg] = panels();
    expect(reg.className).toContain("invisible");
    expect(reg.className).toContain("group-hover:visible");
    expect(reg.className).toContain("group-focus-within:visible");
    expect(reg.className).toContain("inset-x-0");
    /* panel anchor'ı: header container (relative); item static */
    const item = reg.parentElement!;
    expect(item.className).not.toMatch(/\brelative\b/);
    expect(container.querySelector(".site-container.relative")).toBeTruthy();
    const chevron = item.querySelector("a svg")!;
    expect(chevron.getAttribute("class")).toContain("group-hover:rotate-180");
    /* children'sız öğe eskisi gibi relative + panel yok */
    const plain = screen.getAllByRole("link", { name: "İletişim" })[0].parentElement!;
    expect(plain.className).toContain("relative");
    expect(within(plain).queryByTestId("header-mega-menu")).toBeNull();
  });

  it("mobil accordion davranışı aynen (hamburger → alt menü aç)", () => {
    render(<Header menu={MENU} />);
    const d = getDictionary("tr").header;
    fireEvent.click(screen.getByRole("button", { name: d.menuOpen }));
    const toggle = screen.getByRole("button", { name: d.submenuOpenAriaLabel.replace("{label}", "Bölgeler") });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});
