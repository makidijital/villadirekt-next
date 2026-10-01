import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (p: { src: string; alt: string }) => <img src={p.src} alt={p.alt} />,
}));
vi.mock("@/app/components/villa/VillaCard", () => ({
  default: (p: { title: string }) => <div data-testid="villa-card">{p.title}</div>,
}));

import HomeCategoryVillasClient from "@/app/components/home/HomeCategoryVillasClient";
import type { PublicVillaCard } from "@/lib/cache.helpers";
import { getDictionary } from "@/lib/i18n/get-dictionary";

const mk = (id: string): PublicVillaCard =>
  ({ id, slug: id, title: `Villa ${id}`, location: "Kaş", price: 100, currency: "TRY", images: [], bedrooms: 1, bathrooms: 1, guests: 2 }) as unknown as PublicVillaCard;

const tr = getDictionary("tr").home;
const labels = { ...tr.categoryVillas, countBadge: tr.villaTypes.countBadge };

const categories = [
  { id: "a", name: "Muhafazakar", count: 10, coverUrl: null, href: "/villa-turleri/a" },
  { id: "b", name: "Balayı", count: 2, coverUrl: null, href: "/villa-turleri/b" },
];
const villasByCategory = {
  a: Array.from({ length: 8 }, (_, i) => mk(`a${i}`)),
  b: [mk("b0"), mk("b1")],
};

describe("HomeCategoryVillasClient", () => {
  it("ilk kategori aktif; ilk 8 villa gösterilir; tümünü gör linki var", () => {
    render(<HomeCategoryVillasClient locale="tr" categories={categories} villasByCategory={villasByCategory} badgeByVillaId={{}} labels={labels} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByTestId("villa-card")).toHaveLength(8);
    expect(screen.getByRole("link", { name: /Tüm Muhafazakar villalarını gör/ })).toHaveAttribute("href", "/villa-turleri/a");
  });

  it("kategori değişince aynı alanda yeni kategorinin villaları gösterilir (route değişmez)", () => {
    render(<HomeCategoryVillasClient locale="tr" categories={categories} villasByCategory={villasByCategory} badgeByVillaId={{}} labels={labels} />);
    fireEvent.click(screen.getByRole("tab", { name: /Balayı/ }));
    expect(screen.getByRole("tab", { name: /Balayı/ })).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getAllByTestId("villa-card").map((n) => n.textContent)).toEqual(["Villa b0", "Villa b1"]);
    expect(screen.queryByRole("link", { name: /villalarını gör/ })).toBeNull();
  });

  it("boş kategori → empty metni", () => {
    render(<HomeCategoryVillasClient locale="tr" categories={[categories[1]]} villasByCategory={{}} badgeByVillaId={{}} labels={labels} />);
    expect(screen.getByText(tr.categoryVillas.empty)).toBeInTheDocument();
  });

  it("eski 'Villa Tiplerini Keşfedin' metinleri bu bölümde kullanılmaz", () => {
    const { container } = render(<HomeCategoryVillasClient locale="tr" categories={categories} villasByCategory={villasByCategory} badgeByVillaId={{}} labels={labels} />);
    expect(container.textContent).not.toContain("Villa Tiplerini Keşfedin");
    expect(container.textContent).not.toContain("Size en uygun villa kategorisini");
  });
});
