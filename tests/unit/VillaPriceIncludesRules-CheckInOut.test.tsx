/* ===============================================================
   🧾 VillaPriceIncludesAndRulesSection (minimal liste) +
   🕓 CheckInOutTimes (minimal giriş/çıkış) — sunum testleri
   =============================================================== */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import VillaPriceIncludesAndRulesSection from "@/app/components/villa/VillaPriceIncludesAndRulesSection";
import CheckInOutTimes from "@/app/components/villa/CheckInOutTimes";
import { getDictionary } from "@/lib/i18n/get-dictionary";

const INCLUDES = [
  { id: "i1", displayTitle: "Elektrik" },
  { id: "i2", displayTitle: "Su" },
];
const RULES = [
  { id: "r1", displayTitle: "Sigara içilmez" },
  { id: "r2", displayTitle: "Evcil hayvan kabul edilmez" },
];

describe("VillaPriceIncludesAndRulesSection — minimal liste", () => {
  it("ikisi de boşsa hiçbir şey render edilmez", () => {
    const { container } = render(
      <VillaPriceIncludesAndRulesSection priceIncludes={[]} rules={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("başlıklar ve maddeler aynı sırayla render edilir; ikisi doluysa lg 2 kolon", () => {
    const dict = getDictionary("tr");
    const { container } = render(
      <VillaPriceIncludesAndRulesSection
        priceIncludes={INCLUDES}
        rules={RULES}
      />
    );
    expect(screen.getByText(dict.villa.priceIncludesTitle)).toBeInTheDocument();
    expect(screen.getByText(dict.villa.rulesTitle)).toBeInTheDocument();
    const items = Array.from(container.querySelectorAll("li")).map(
      (li) => li.textContent
    );
    expect(items).toEqual([
      "Elektrik",
      "Su",
      "Sigara içilmez",
      "Evcil hayvan kabul edilmez",
    ]);
    expect(container.firstElementChild).toHaveClass("lg:grid-cols-2");
  });

  it("tek koleksiyon doluysa 2 kolon sınıfı eklenmez", () => {
    const { container } = render(
      <VillaPriceIncludesAndRulesSection priceIncludes={INCLUDES} rules={[]} />
    );
    expect(container.firstElementChild).not.toHaveClass("lg:grid-cols-2");
    expect(screen.queryByText(getDictionary("tr").villa.rulesTitle)).toBeNull();
  });

  it("kart/kutu/arka plan YOK; ikonlar küçük brand-blue (dahil: check, kural: info)", () => {
    const { container } = render(
      <VillaPriceIncludesAndRulesSection
        priceIncludes={INCLUDES}
        rules={RULES}
      />
    );
    expect(container.querySelector(".rounded-3xl, .rounded-xl, [class*='bg-emerald'], [class*='bg-rose']")).toBeNull();
    const sections = container.querySelectorAll("section");
    expect(sections[0].querySelectorAll("svg.lucide-check")).toHaveLength(2);
    expect(sections[1].querySelectorAll("svg.lucide-info")).toHaveLength(2);
    container.querySelectorAll("li svg").forEach((svg) => {
      expect(svg.getAttribute("class")).toContain("text-[#1B4EF5]");
    });
  });

  it("EN locale başlıkları dictionary'den", () => {
    const dict = getDictionary("en");
    render(
      <VillaPriceIncludesAndRulesSection
        priceIncludes={INCLUDES}
        rules={RULES}
        locale="en"
      />
    );
    expect(screen.getByText(dict.villa.priceIncludesTitle)).toBeInTheDocument();
    expect(screen.getByText(dict.villa.rulesTitle)).toBeInTheDocument();
  });
});

describe("CheckInOutTimes — minimal giriş/çıkış", () => {
  it("başlık + etiketler dictionary'den, değerler prop'tan AYNEN", () => {
    const dict = getDictionary("tr");
    render(<CheckInOutTimes checkIn="16:00" checkOut="10:00" />);
    expect(
      screen.getByRole("heading", { name: dict.villa.checkInOutTitle })
    ).toBeInTheDocument();
    expect(screen.getByText(dict.villa.checkInLabel)).toBeInTheDocument();
    expect(screen.getByText(dict.villa.checkOutLabel)).toBeInTheDocument();
    expect(screen.getByText("16:00")).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
  });

  it("component kendi saat değeri üretmez (verilen değer gösterilir)", () => {
    render(<CheckInOutTimes checkIn="15:30" checkOut="11:15" />);
    expect(screen.getByText("15:30")).toBeInTheDocument();
    expect(screen.getByText("11:15")).toBeInTheDocument();
    expect(screen.queryByText("16:00")).toBeNull();
  });

  it("DE locale etiketleri", () => {
    const dict = getDictionary("de");
    render(<CheckInOutTimes checkIn="16:00" checkOut="10:00" locale="de" />);
    expect(screen.getByText(dict.villa.checkInOutTitle)).toBeInTheDocument();
    expect(screen.getByText(dict.villa.checkInLabel)).toBeInTheDocument();
  });
});
