/* 🔄 Kısa Süreli Fırsatlar — fotoğraflı fırsat türü kartları.
   Veri/link sözleşmesi aynı; "Son Dakika Fırsatı" artık yok. */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (p: { src: string; alt: string }) => <img src={p.src} alt={p.alt} />,
}));
vi.mock("@/lib/db/short-gaps.repository", () => ({
  shortGapsRepository: {
    getShortGapCounts: vi.fn(async () => ({
      data: [
        { bucket_month: "2026-10-01", gap_nights: 2, villa_count: 5 },
        { bucket_month: "2026-10-01", gap_nights: 3, villa_count: 2 },
      ],
      error: null,
    })),
    findGapsByMonthNights: vi.fn(async (_bm: string, n: number) => ({
      data: n === 2 ? [{ villa_id: "v1" }] : [{ villa_id: "v1" }, { villa_id: "v2" }],
    })),
  },
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedVillas: vi.fn(async () => [
    { id: "v1", images: ["https://cdn.example/v1.jpg"] },
    { id: "v2", images: ["https://cdn.example/v2.jpg"] },
  ]),
}));

import ShortGapsSection from "@/app/components/home/ShortGapsSection";

describe("ShortGapsSection — fırsat kartları", () => {
  it("her (ay × gece) grubu için link + gerçek villa görseli; rozet yok", async () => {
    const { container } = render(await ShortGapsSection({ locale: "tr" }));
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/kisa-sureli-tarihler/ekim/2", "/kisa-sureli-tarihler/ekim/3"]);
    expect(screen.getByText("2 gecelik villalar")).toBeInTheDocument();
    expect(screen.getByText("5 Villa")).toBeInTheDocument();
    const imgs = Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(imgs).toEqual(["https://cdn.example/v1.jpg", "https://cdn.example/v2.jpg"]);
    expect(container.textContent).not.toMatch(/Son Dakika/);
  });
});
