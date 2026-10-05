/* ===============================================================
   🧾 VillaReviewsSection — minimal yorum listesi + aç/kapat +
   "Yorum Yap" accordion (public villa detay)
   =============================================================== */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/app/services/villa-review.action", () => ({
  createVillaReviewAction: vi.fn(async () => ({ ok: true })),
}));

import VillaReviewsSection from "@/app/components/villa/VillaReviewsSection";
import type {
  VillaReviewPublic,
  VillaReviewStats,
} from "@/app/services/villa-review.service";
import { getDictionary } from "@/lib/i18n/get-dictionary";

const r = (
  id: string,
  guest_name: string,
  comment: string,
  extra: Partial<VillaReviewPublic> = {}
): VillaReviewPublic => ({
  id,
  guest_name,
  rating: 5,
  comment,
  created_at: "2023-06-07T10:00:00Z",
  is_featured: false,
  ...extra,
});

const stats = (count: number, average = 5): VillaReviewStats => ({
  count,
  average,
});

const REVIEWS = [
  r("1", "Gö**** sümer", "Geçirdiğim harika tatillerden birisi."),
  r("2", "Ad***", "Tek kelimeyle çok güzel bir tatildi."),
  r("3", "Yu***", "Eşimle birlikte çok güzel zaman geçirdik."),
  r("4", "Sa*** Bulut", "Gayet güzel ve temiz bir yerdi."),
];

const tr = getDictionary("tr");

function listItems() {
  const list = screen.queryByTestId("reviews-list");
  return list ? within(list).getAllByRole("listitem") : [];
}

describe("VillaReviewsSection — yorum listesi", () => {
  it("0 yorum: boş durum metni, liste ve aç/kapat butonu YOK", () => {
    render(<VillaReviewsSection villaId="v1" reviews={[]} stats={stats(0, 0)} />);
    expect(screen.getByText(tr.reviews.empty)).toBeInTheDocument();
    expect(screen.queryByTestId("reviews-list")).toBeNull();
    expect(screen.queryByRole("button", { name: tr.reviews.showMore })).toBeNull();
  });

  it("1 yorum: yorum görünür, 'Daha Fazla Göster' butonu HİÇ yok", () => {
    render(
      <VillaReviewsSection villaId="v1" reviews={[REVIEWS[0]]} stats={stats(1)} />
    );
    expect(listItems()).toHaveLength(1);
    expect(screen.getByText("Gö**** sümer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: tr.reviews.showMore })).toBeNull();
    expect(screen.queryByRole("button", { name: tr.reviews.showLess })).toBeNull();
  });

  it("2+ yorum: ilk açılışta YALNIZ ilk yorum; 'Daha Fazla Göster' → tümü sırasıyla; 'Daha Az Göster' → tekrar 1", () => {
    render(<VillaReviewsSection villaId="v1" reviews={REVIEWS} stats={stats(4)} />);

    expect(listItems()).toHaveLength(1);
    expect(screen.getByText("Gö**** sümer")).toBeInTheDocument();
    expect(screen.queryByText("Ad***")).toBeNull();

    const more = screen.getByRole("button", { name: tr.reviews.showMore });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);

    const items = listItems();
    expect(items).toHaveLength(4);
    expect(items.map((li) => within(li).getByText(/\*\*\*/).textContent)).toEqual([
      "Gö**** sümer",
      "Ad***",
      "Yu***",
      "Sa*** Bulut",
    ]);
    const less = screen.getByRole("button", { name: tr.reviews.showLess });
    expect(less).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(less);
    expect(listItems()).toHaveLength(1);
    expect(screen.getByText("Gö**** sümer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: tr.reviews.showMore })).toBeInTheDocument();
  });

  it("öne çıkan yorum (mevcut davranış) en üstte; ilk açılışta o gösterilir", () => {
    const reviews = [REVIEWS[0], r("9", "Öne Çıkan", "Harika", { is_featured: true }), REVIEWS[1]];
    render(<VillaReviewsSection villaId="v1" reviews={reviews} stats={stats(3)} />);
    expect(listItems()).toHaveLength(1);
    expect(screen.getByText("Öne Çıkan")).toBeInTheDocument();
    expect(screen.getByText(tr.reviews.featuredBadge)).toBeInTheDocument();
  });

  it("puan / yorum sayısı ve metinler veriden AYNEN", () => {
    render(<VillaReviewsSection villaId="v1" reviews={REVIEWS} stats={stats(4, 4.5)} />);
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText(tr.reviews.countLabel.replace("{n}", "4"))).toBeInTheDocument();
    expect(screen.getByText("Geçirdiğim harika tatillerden birisi.")).toBeInTheDocument();
  });

  it("minimal tasarım: ad brand blue, yıldız #FAD716, ince #E5E7EB ayırıcılar, yorum metni 13.5px", () => {
    render(<VillaReviewsSection villaId="v1" reviews={REVIEWS} stats={stats(4)} />);
    fireEvent.click(screen.getByRole("button", { name: tr.reviews.showMore }));
    expect(screen.getByText("Ad***")).toHaveClass("text-[#1B4EF5]");
    expect(screen.getByTestId("reviews-list")).toHaveClass("divide-y", "divide-[#E5E7EB]");
    expect(screen.getByText("Tek kelimeyle çok güzel bir tatildi.")).toHaveClass("text-[13.5px]");
    const stars = screen.getAllByLabelText(tr.reviews.ratingAriaLabel.replace("{value}", "5.0"));
    expect(stars[0]).toHaveClass("text-[#FAD716]");
  });

  it("EN/DE buton metinleri dictionary'den", () => {
    const { unmount } = render(
      <VillaReviewsSection villaId="v1" reviews={REVIEWS} stats={stats(4)} locale="en" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Show More" }));
    expect(screen.getByRole("button", { name: "Show Less" })).toBeInTheDocument();
    unmount();
    render(<VillaReviewsSection villaId="v1" reviews={REVIEWS} stats={stats(4)} locale="de" />);
    expect(screen.getByRole("button", { name: "Mehr anzeigen" })).toBeInTheDocument();
  });
});

describe("VillaReviewsSection — 'Yorum Yap' accordion", () => {
  it("varsayılan kapalı; tıklayınca form açılır, tekrar tıklayınca kapanır", () => {
    render(<VillaReviewsSection villaId="v1" reviews={REVIEWS} stats={stats(4)} />);
    const toggle = screen.getByRole("button", { name: tr.reviews.formOpen });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(tr.reviews.formTitle)).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(tr.reviews.formTitle)).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(tr.reviews.formTitle)).toBeNull();
  });

  it("yorumlar bloğu ve 'Yorum Yap' container'ı AYNI genişlik/kenar sınıflarını kullanır", () => {
    render(<VillaReviewsSection villaId="v1" reviews={REVIEWS} stats={stats(4)} />);
    const box = screen.getByTestId("reviews-box");
    const acc = screen.getByTestId("review-form-accordion");
    expect(box.className).toBe(acc.className);
    for (const cls of ["w-full", "rounded-[14px]", "border", "border-[#E5E7EB]", "bg-white"]) {
      expect(box).toHaveClass(cls);
    }
    /* İkisi de aynı parent içinde kardeş → aynı kolon genişliği. */
    expect(box.parentElement).toBe(acc.parentElement);
    expect(screen.getByText(tr.reviews.formOpen)).toHaveClass("text-[18px]", "font-bold");
  });
});
