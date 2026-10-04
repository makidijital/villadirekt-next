/* ===============================================================
   🗓️ VillaAvailabilityModal — "Müsaitlik" butonu + takvim popup'ı
   ===============================================================
   Takvim (AvailabilityInlineCalendar) ilk render'da GÖRÜNMEZ;
   butona tıklayınca MEVCUT takvim modal içinde açılır; X / ESC /
   backdrop ile kapanır. Availability fetch'i mock'lanır (proje
   convention'ı — bkz. villa-locale-p10b.test.tsx).
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchAndExpandVillaAvailabilityMock = vi.fn();
vi.mock("@/lib/villa-availability.helper", () => ({
  fetchAndExpandVillaAvailability: (...args: unknown[]) =>
    fetchAndExpandVillaAvailabilityMock(...args),
}));

import VillaAvailabilityModal from "@/app/components/villa/VillaAvailabilityModal";

const EMPTY_AVAILABILITY = {
  blockedDates: [],
  checkinDates: [],
  checkoutDates: [],
  pendingCheckinDates: [],
  pendingCheckoutDates: [],
  pendingMiddleDates: [],
  manualBlockedDates: [],
  manualCheckinDates: [],
  manualCheckoutDates: [],
};

beforeEach(() => {
  fetchAndExpandVillaAvailabilityMock.mockReset();
  fetchAndExpandVillaAvailabilityMock.mockResolvedValue(EMPTY_AVAILABILITY);
});

describe("VillaAvailabilityModal", () => {
  it("ilk render'da takvim GÖRÜNMEZ, 'Müsaitlik' butonu görünür", () => {
    render(<VillaAvailabilityModal villaId="v1" prices={[]} />);
    expect(
      screen.getByRole("button", { name: "Müsaitlik" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Önceki ay")).not.toBeInTheDocument();
    expect(fetchAndExpandVillaAvailabilityMock).not.toHaveBeenCalled();
  });

  it("butona tıklayınca MEVCUT takvim popup içinde açılır", async () => {
    render(<VillaAvailabilityModal villaId="v1" prices={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Müsaitlik" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Takvim")).toBeInTheDocument();
    expect(screen.getByLabelText("Önceki ay")).toBeInTheDocument();
    expect(screen.getByLabelText("Sonraki ay")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchAndExpandVillaAvailabilityMock).toHaveBeenCalledWith("v1")
    );
  });

  it("X (Kapat) butonu ile kapanır, takvim gizlenir", () => {
    render(<VillaAvailabilityModal villaId="v1" prices={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Müsaitlik" }));
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Önceki ay")).not.toBeInTheDocument();
  });

  it("ESC ile kapanır", () => {
    render(<VillaAvailabilityModal villaId="v1" prices={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Müsaitlik" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dışarı (backdrop) tıklayınca kapanır; popup içine tıklamak kapatmaz", () => {
    render(<VillaAvailabilityModal villaId="v1" prices={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Müsaitlik" }));

    fireEvent.click(screen.getByLabelText("Sonraki ay"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const backdrop = screen
      .getByRole("dialog")
      .querySelector(":scope > div[aria-hidden]") as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("açıkken body scroll kilitlenir, kapanınca geri alınır", () => {
    render(<VillaAvailabilityModal villaId="v1" prices={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Müsaitlik" }));
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(document.body.style.overflow).toBe("");
  });

  it("EN/DE locale buton etiketi dictionary'den gelir", () => {
    const { unmount } = render(
      <VillaAvailabilityModal villaId="v1" prices={[]} locale="en" />
    );
    expect(
      screen.getByRole("button", { name: "Availability" })
    ).toBeInTheDocument();
    unmount();
    render(<VillaAvailabilityModal villaId="v1" prices={[]} locale="de" />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByLabelText("Vorheriger Monat")).toBeInTheDocument();
  });

  it("buton: tam genişlik, #E7000B, beyaz yazı, ikon+metin ortalı, yavaş pulse (reduced-motion guard'lı)", () => {
    const { container } = render(
      <VillaAvailabilityModal villaId="v1" prices={[]} />
    );
    const btn = screen.getByRole("button", { name: "Müsaitlik" });
    for (const cls of [
      "w-full",
      "bg-[#E7000B]",
      "text-white",
      "justify-center",
      "items-center",
      "vd-avail-pulse",
    ]) {
      expect(btn).toHaveClass(cls);
    }
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(css).toMatch(/vd-avail-pulse 2\.6s ease-in-out infinite/);
    expect(css).not.toMatch(/gradient/i);
  });

  it("popup paneli tamamen beyaz (#FFFFFF)", () => {
    render(<VillaAvailabilityModal villaId="v1" prices={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Müsaitlik" }));
    const panel = screen
      .getByRole("dialog")
      .querySelector(":scope > div:not([aria-hidden])") as HTMLElement;
    expect(panel).toHaveClass("bg-[#FFFFFF]");
  });
});

describe("Müsaitlik popup takvimi — gün hücresi çerçevesi", () => {
  it("ay içi her gün hücresinde rezervasyon takvimiyle AYNI inset 1px #E5E7EB çerçeve; header/ok/hafta günlerinde YOK", async () => {
    render(<VillaAvailabilityModal villaId="v1" prices={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Müsaitlik" }));
    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(fetchAndExpandVillaAvailabilityMock).toHaveBeenCalledWith("v1")
    );

    const dayCells = Array.from(
      dialog.querySelectorAll<HTMLElement>('[role="presentation"]')
    );
    expect(dayCells.length).toBeGreaterThanOrEqual(28);
    for (const cell of dayCells) {
      /* Ölçü/radius AYNEN. */
      expect(cell).toHaveClass("aspect-square", "rounded-md");
      const layer = cell.querySelector<HTMLElement>(":scope > div[aria-hidden]");
      expect(layer).toBeTruthy();
      expect(layer!.style.boxShadow).toBe("inset 0 0 0 1px #E5E7EB");
    }

    /* Hücre dışı öğelerde çerçeve YOK. */
    const withShadow = Array.from(
      dialog.querySelectorAll<HTMLElement>("[style]")
    ).filter((el) => el.style.boxShadow.includes("#E5E7EB"));
    expect(withShadow).toHaveLength(dayCells.length);
    expect(screen.getByLabelText("Önceki ay").style.boxShadow).toBe("");
  });
});
