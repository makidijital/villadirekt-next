/* 🔄 Kısa Süreli Fırsatlar — ay kolonları + gece satırları (referans düzen).
   Veri/sıra/link sözleşmesi aynı; fotoğraf/görsel sorgusu YOK;
   "Son Dakika Fırsatı" ve "günlük" ifadesi YOK. */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));
const { findGaps } = vi.hoisted(() => ({ findGaps: vi.fn() }));
vi.mock("@/lib/db/short-gaps.repository", () => ({
  shortGapsRepository: {
    getShortGapCounts: vi.fn(async () => ({
      data: [
        { bucket_month: "2026-10-01", gap_nights: 2, villa_count: 69 },
        { bucket_month: "2026-10-01", gap_nights: 3, villa_count: 81 },
        { bucket_month: "2026-11-01", gap_nights: 2, villa_count: 15 },
      ],
      error: null,
    })),
    findGapsByMonthNights: findGaps,
  },
}));

import ShortGapsSection from "@/app/components/home/ShortGapsSection";

describe("ShortGapsSection — ay kolonları", () => {
  it("her ay ayrı kart (yalnız ay adı), gece satırları + villa sayısı, linkler aynı", async () => {
    const { container } = render(await ShortGapsSection({ locale: "tr" }));
    expect(screen.getByRole("heading", { name: "Ekim" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kasım" })).toBeInTheDocument();
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(links).toEqual([
      "/kisa-sureli-tarihler/ekim/2",
      "/kisa-sureli-tarihler/ekim/3",
      "/kisa-sureli-tarihler/kasim/2",
    ]);
    expect(screen.getAllByText("2 gecelik villalar")).toHaveLength(2);
    expect(screen.getByText("69 villa")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toMatch(/Son Dakika|günlük/);
    expect(findGaps).not.toHaveBeenCalled();
  });

  it("EN/DE 'gecelik' anlamı korunur", async () => {
    const en = render(await ShortGapsSection({ locale: "en" }));
    expect(en.getAllByText("2-night villas").length).toBeGreaterThan(0);
    expect(en.getByText("69 villas")).toBeInTheDocument();
    en.unmount();
    const de = render(await ShortGapsSection({ locale: "de" }));
    expect(de.getAllByText("Villen für 2 Nächte").length).toBeGreaterThan(0);
  });

  it("kaynakta fotoğraf/cover sorgusu kalmadı", () => {
    const src = readFileSync("app/components/home/ShortGapsSection.tsx", "utf-8");
    expect(src).not.toMatch(/next\/image|getCachedVillas|findGapsByMonthNights/);
  });
});
