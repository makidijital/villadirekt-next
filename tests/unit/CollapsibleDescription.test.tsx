/* ===============================================================
   📝 CollapsibleDescription — minimal görünüm + clamp/expand AYNEN
   =============================================================== */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import CollapsibleDescription from "@/app/components/villa/CollapsibleDescription";
import { getDictionary } from "@/lib/i18n/get-dictionary";

const HTML = "<p>Denize yakın, özel havuzlu villa.</p>";
const tr = getDictionary("tr");

describe("CollapsibleDescription — minimal", () => {
  it("container: arka plan / border / radius / shadow / padding YOK", () => {
    const { container } = render(<CollapsibleDescription html={HTML} collapsible={false} />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.className).not.toMatch(/\bbg-|\bborder\b|border-\[|rounded|shadow|p-6|md:p-7/);
    expect(box).toHaveClass("p-0");
  });

  it("metin 13px; renk ve line-height AYNEN", () => {
    const { container } = render(<CollapsibleDescription html={HTML} collapsible={false} />);
    const text = container.querySelector(".villa-description") as HTMLElement;
    expect(text).toHaveClass("text-[13px]", "leading-[1.75]", "text-[var(--color-stone-600)]");
    expect(text).not.toHaveClass("text-[15px]");
    expect(screen.getByText("Denize yakın, özel havuzlu villa.")).toBeInTheDocument();
  });

  it("collapsible: kapalıyken clamp'li, 'Devamını oku' ile açılır, tekrar kapanır (transition AYNEN)", () => {
    const { container } = render(<CollapsibleDescription html={HTML} collapsible={true} />);
    const text = container.querySelector(".villa-description") as HTMLElement;
    expect(text).toHaveClass("max-h-[6.5rem]", "transition-[max-height]", "duration-500");

    fireEvent.click(screen.getByRole("button", { name: tr.villa.readMore }));
    expect(text).toHaveClass("max-h-[3000px]");
    expect(text).not.toHaveClass("max-h-[6.5rem]");

    fireEvent.click(screen.getByRole("button", { name: tr.villa.readLess }));
    expect(text).toHaveClass("max-h-[6.5rem]");
  });

  it("collapsible=false: buton yok", () => {
    render(<CollapsibleDescription html={HTML} collapsible={false} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
