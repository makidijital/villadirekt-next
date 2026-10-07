/* ===============================================================
   🧭 PublicBreadcrumb — ortak breadcrumb (/rezervasyon + villa detay)
   =============================================================== */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import PublicBreadcrumb from "@/app/components/ui/PublicBreadcrumb";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { localeHref } from "@/lib/i18n/locale-href";
import type { Locale } from "@/lib/i18n/config";

const villaItems = (locale: Locale, title: string) => {
  const d = getDictionary(locale);
  return [
    { name: d.villasArchive.breadcrumbHome, href: localeHref("/", locale) },
    { name: d.villasArchive.breadcrumbCurrent, href: localeHref("/kiralik-villalar", locale) },
    { name: title },
  ];
};

describe("PublicBreadcrumb", () => {
  it.each([
    ["tr", "Ana sayfa", "Kiralık Villalar", "/", "/kiralik-villalar"],
    ["en", "Home", "Villas for Rent", "/en", "/en/kiralik-villalar"],
    ["de", "Startseite", getDictionary("de").villasArchive.breadcrumbCurrent, "/de", "/de/kiralik-villalar"],
  ] as const)("%s: üç öğe — iki link + link olmayan villa adı", (locale, home, villas, homeHref, villasHref) => {
    render(<PublicBreadcrumb singleLine items={villaItems(locale, "Villa Manifesto")} />);
    expect(screen.getByText(home).closest("a")).toHaveAttribute("href", homeHref);
    expect(screen.getByText(villas).closest("a")).toHaveAttribute("href", villasHref);
    const current = screen.getByText("Villa Manifesto");
    expect(current.closest("a")).toBeNull();
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("rezervasyon breadcrumb'ı ile AYNI stil: 12px, #64708A, chevron ayırıcı, hover #1B4EF5, son öğe semibold #0A1633", () => {
    const { container } = render(<PublicBreadcrumb items={villaItems("tr", "Villa Manifesto")} />);
    const nav = container.querySelector("nav") as HTMLElement;
    expect(nav).toHaveClass("text-[12px]", "text-[#64708A]", "gap-x-2", "flex-wrap");
    expect(nav.querySelectorAll("svg.lucide-chevron-right")).toHaveLength(2);
    expect(screen.getByText("Ana sayfa")).toHaveClass("hover:text-[#1B4EF5]");
    expect(screen.getByText("Villa Manifesto")).toHaveClass("font-semibold", "text-[#0A1633]");
  });

  it("singleLine: tek satır, taşma yok, uzun villa adı truncate + title", () => {
    const long = "Çok Uzun Bir Villa Adı Kalkan Kızıltaş Deniz Manzaralı Muhafazakar Villa";
    const { container } = render(<PublicBreadcrumb singleLine items={villaItems("tr", long)} />);
    const nav = container.querySelector("nav") as HTMLElement;
    expect(nav).toHaveClass("whitespace-nowrap", "overflow-hidden", "min-w-0");
    expect(nav).not.toHaveClass("flex-wrap");
    const current = screen.getByText(long);
    expect(current).toHaveClass("truncate");
    expect(current).toHaveAttribute("title", long);
    expect(current.parentElement).toHaveClass("min-w-0");
  });
});
