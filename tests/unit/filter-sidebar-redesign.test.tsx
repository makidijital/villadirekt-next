/* ===============================================================
   🎨 FilterSidebar — UI REDESIGN testleri
   ===============================================================
   Bileşen: app/(public)/arama/FilterSidebar.tsx
   Kullanıldığı public sayfalar: /arama (mode="search"),
   /kiralik-villalar + /villa-turleri/[slug] + /bolgeler/[slug]
   (KiralikVillalarPageBody, mode="redirect") — TR/EN/DE.

   A) "Redesign sırasında filtre state ve URL davranışının değişmediğini
      doğrula." — tam URL sözleşmesi (villa-turleri / bolgeler / start /
      end / guests / flexible / sort / pageSize korunur), reset & redirect.
   B) Yeni görsel dil (başlık, tarih kartı, seçili satır, CTA, kart).
   C) Mobil drawer aç/kapa davranışı AYNEN.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const pushMock = vi.fn();
const searchParamsGetMock = vi.fn<(k: string) => string | null>(() => null);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: (k: string) => searchParamsGetMock(k) }),
}));

import FilterSidebar from "@/app/(public)/arama/FilterSidebar";
import { getDictionary } from "@/lib/i18n/get-dictionary";

const REGIONS = [
  { id: "r1", name: "Kalkan", slug: "kalkan", show_in_filter: true },
  { id: "r2", name: "Kaş", slug: "kas", show_in_filter: true },
];
const TYPES = [
  { id: "t1", name: "Balayı", slug: "balayi" },
  { id: "t2", name: "Deniz Manzaralı", slug: "deniz-manzarali" },
];
const INITIAL = {
  regions: [] as string[],
  categories: [] as string[],
  start: null as string | null,
  end: null as string | null,
  guests: 1,
};

type L = "tr" | "en" | "de";

function renderSidebar(
  opts: { locale?: L; basePath?: string; initial?: typeof INITIAL & { flexible?: boolean }; mode?: "search" | "redirect" } = {}
) {
  const { locale = "tr", basePath = "/arama", initial = INITIAL, mode } = opts;
  return render(
    <FilterSidebar
      regionOptions={REGIONS}
      categoryOptions={TYPES}
      initial={initial}
      resultCount={7}
      locale={locale}
      basePath={basePath}
      {...(mode ? { mode } : {})}
    />
  );
}

/* Desktop aside içindeki panel (drawer'daki kopyası ayrı). */
function desktopPanel(container: HTMLElement) {
  return container.querySelector("aside") as HTMLElement;
}

function parse(href: string) {
  const [path, qs = ""] = href.split("?");
  return { path, params: new URLSearchParams(qs) };
}

beforeEach(() => {
  /* jsdom'da matchMedia yok — bileşen mobil datepicker yerleşimi için
     okur (mantık değil, yalnız popper konumu). */
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  pushMock.mockReset();
  searchParamsGetMock.mockReset();
  searchParamsGetMock.mockImplementation(() => null);
});

/* ---------------------------------------------------------------
   A) STATE + URL SÖZLEŞMESİ DEĞİŞMEDİ
   --------------------------------------------------------------- */
describe("A) Redesign sırasında filtre state ve URL davranışı değişmedi", () => {
  it("kişi + bölge + villa tipi + tarih + esnek → aynı URL parametreleri (search mode)", async () => {
    const d = getDictionary("tr").search.filters;
    const { container } = renderSidebar({
      initial: { ...INITIAL, start: "2026-10-12", end: "2026-10-19" },
    });
    const panel = desktopPanel(container);

    /* Kişi: + iki kez → 3 */
    const inc = within(panel).getByRole("button", {
      name: d.increaseAriaLabel.replace("{label}", d.guestsCounterLabel),
    });
    fireEvent.click(inc);
    fireEvent.click(inc);

    /* Bölge: grup aç → Kalkan seç */
    fireEvent.click(within(panel).getByRole("button", { name: /Kalkan/ }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: /Kalkan/ }));

    /* Villa tipi — seçim yokken bölüm kapalı (mevcut davranış) → aç, seç */
    fireEvent.click(within(panel).getByRole("button", { name: new RegExp(d.typeLabel) }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Balayı" }));

    /* Gelişmiş arama */
    fireEvent.click(within(panel).getByRole("checkbox", { name: new RegExp(d.advancedCheckbox) }));

    fireEvent.click(within(panel).getByRole("button", { name: d.apply }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    const { path, params } = parse(pushMock.mock.calls[0][0]);
    expect(path).toBe("/arama");
    expect(params.get("villa-turleri")).toBe("balayi");
    expect(params.get("bolgeler")).toBe("kalkan");
    expect(params.get("start")).toBe("2026-10-12");
    expect(params.get("end")).toBe("2026-10-19");
    expect(params.get("guests")).toBe("3");
    expect(params.get("flexible")).toBe("3");
  });

  it("mevcut sort / pageSize URL'de korunur; guests=1 yazılmaz", async () => {
    searchParamsGetMock.mockImplementation((k: string) =>
      k === "sort" ? "price-asc" : k === "pageSize" ? "30" : null
    );
    const d = getDictionary("en").search.filters;
    const { container } = renderSidebar({ locale: "en", basePath: "/en/arama" });
    fireEvent.click(within(desktopPanel(container)).getByRole("button", { name: d.apply }));
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    const { path, params } = parse(pushMock.mock.calls[0][0]);
    expect(path).toBe("/en/arama");
    expect(params.get("guests")).toBeNull();
    expect(params.get("sort")).toBe("price-asc");
    expect(params.get("pageSize")).toBe("30");
  });

  it("Temizle (artık başlıkta): search mode → basePath'e push; filtre yokken disabled", async () => {
    const d = getDictionary("de").search.filters;
    const { container, unmount } = renderSidebar({ locale: "de", basePath: "/de/arama" });
    const reset0 = within(desktopPanel(container)).getByRole("button", { name: d.reset });
    expect(reset0).toBeDisabled();
    unmount();

    const r = renderSidebar({ locale: "de", basePath: "/de/arama", initial: { ...INITIAL, guests: 4 } });
    const reset = within(desktopPanel(r.container)).getByRole("button", { name: d.reset });
    expect(reset).not.toBeDisabled();
    fireEvent.click(reset);
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(pushMock.mock.calls[0][0]).toBe("/de/arama");
  });

  it("redirect mode (/kiralik-villalar): 'Villa Bul' /arama'ya push; Temizle push ETMEZ, yalnız draft sıfırlar", async () => {
    const d = getDictionary("tr").search.filters;
    const { container } = renderSidebar({ mode: "redirect", initial: { ...INITIAL, guests: 4 } });
    const panel = desktopPanel(container);
    fireEvent.click(within(panel).getByRole("button", { name: d.reset }));
    expect(pushMock).not.toHaveBeenCalled();
    /* Draft sıfırlandı → kişi 1 → buton tekrar disabled. */
    expect(within(panel).getByRole("button", { name: d.reset })).toBeDisabled();
    fireEvent.click(within(panel).getByRole("button", { name: d.findVillas }));
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(pushMock.mock.calls[0][0]).toBe("/arama");
  });

  it("kişi sayısı min=1 / max=20 sınırları AYNEN", () => {
    const d = getDictionary("tr").search.filters;
    const { container } = renderSidebar({ initial: { ...INITIAL, guests: 20 } });
    const panel = desktopPanel(container);
    const label = d.guestsCounterLabel;
    expect(within(panel).getByRole("button", { name: d.increaseAriaLabel.replace("{label}", label) })).toBeDisabled();
    expect(within(panel).getByRole("button", { name: d.decreaseAriaLabel.replace("{label}", label) })).not.toBeDisabled();
  });
});

/* ---------------------------------------------------------------
   B) YENİ GÖRSEL DİL
   --------------------------------------------------------------- */
describe("B) Görsel redesign", () => {
  it.each(["tr", "en", "de"] as const)("%s: başlık (ikon + 17px) ve alt açıklama dictionary'den", (locale) => {
    const d = getDictionary(locale).search.filters;
    const { container } = renderSidebar({ locale, basePath: locale === "tr" ? "/arama" : `/${locale}/arama` });
    const panel = desktopPanel(container);
    const h2 = within(panel).getByRole("heading", { level: 2, name: d.title });
    expect(h2).toHaveClass("font-display", "font-bold", "text-[17px]", "text-[#0A1633]");
    expect(within(panel).getByText(d.subtitle)).toBeInTheDocument();
    expect(panel.querySelector("svg.lucide-sliders-horizontal")).toBeTruthy();
  });

  it("masaüstü kart: beyaz, #E5E7EB border, 16px radius, hafif shadow; sticky YOK", () => {
    const { container } = renderSidebar();
    const card = desktopPanel(container).querySelector("div > div") as HTMLElement;
    expect(card).toHaveClass("bg-white", "border-[#E5E7EB]", "rounded-2xl");
    expect(card.className).toMatch(/shadow-\[/);
    expect(container.innerHTML).not.toMatch(/\bsticky\b/);
  });

  it("tarih kartı: takvim ikonu; tarih seçiliyken mavi border + açık mavi yüzey", () => {
    const { container, unmount } = renderSidebar();
    let box = desktopPanel(container).querySelector("[data-drawer-initial-focus]") as HTMLElement;
    expect(box).toHaveClass("border-[#E5E7EB]", "bg-white", "min-h-[48px]", "rounded-[12px]");
    expect(box.querySelector("svg.lucide-calendar")).toBeTruthy();
    unmount();
    const r = renderSidebar({ initial: { ...INITIAL, start: "2026-10-12", end: "2026-10-19" } });
    box = desktopPanel(r.container).querySelector("[data-drawer-initial-focus]") as HTMLElement;
    expect(box).toHaveClass("border-[#1B4EF5]", "bg-[#F4F7FF]");
  });

  it("seçili villa tipi satırı açık mavi + mavi metin; checkbox accent #1B4EF5", () => {
    const { container } = renderSidebar({ initial: { ...INITIAL, categories: ["t2"] } });
    const panel = desktopPanel(container);
    const cb = within(panel).getByRole("checkbox", { name: "Deniz Manzaralı" });
    expect(cb).toBeChecked();
    expect(cb).toHaveClass("accent-[#1B4EF5]");
    expect(cb.closest("label")).toHaveClass("bg-[#EFF4FF]", "text-[#1B4EF5]");
    const other = within(panel).getByRole("checkbox", { name: "Balayı" });
    expect(other.closest("label")).not.toHaveClass("bg-[#EFF4FF]");
  });

  it("Filtrele CTA: tam genişlik mavi 48px; Temizle başlık alanında küçük mavi text buton", () => {
    const d = getDictionary("tr").search.filters;
    const { container } = renderSidebar();
    const panel = desktopPanel(container);
    const apply = within(panel).getByRole("button", { name: d.apply });
    expect(apply).toHaveClass("flex-1", "h-[48px]", "bg-[#1B4EF5]", "text-white", "rounded-[12px]", "font-semibold");
    const reset = within(panel).getByRole("button", { name: d.reset });
    expect(reset).toHaveClass("text-[#1B4EF5]", "text-[12px]");
    /* Temizle, başlıkla aynı header satırında. */
    const header = within(panel).getByRole("heading", { level: 2 }).closest("div.flex.items-start.justify-between") as HTMLElement;
    expect(header).toContainElement(reset);
  });
});

/* ---------------------------------------------------------------
   C) MOBİL DRAWER — davranış AYNEN
   --------------------------------------------------------------- */
describe("C) Mobil drawer", () => {
  it("trigger açar (aria-expanded + translate-y-0), kapat butonu kapatır; dialog yapısı korunur", () => {
    const d = getDictionary("tr").search.filters;
    renderSidebar();
    const trigger = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-haspopup") === "dialog")!;
    expect(trigger).toHaveClass("min-h-[56px]", "border-[#E5E7EB]");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const sheet = dialog.querySelector("div.h-\\[92vh\\]") as HTMLElement;
    expect(sheet).toHaveClass("translate-y-full");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(sheet).toHaveClass("translate-y-0");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(within(dialog).getByRole("button", { name: d.closeAriaLabel }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(sheet).toHaveClass("translate-y-full");
  });

  it("drawer açıkken CTA sonuç sayısını gösterir (mevcut showResults metni)", () => {
    const d = getDictionary("tr").search.filters;
    renderSidebar();
    const trigger = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-haspopup") === "dialog")!;
    fireEvent.click(trigger);
    expect(
      screen.getAllByText(d.showResults.replace("{n}", "7")).length
    ).toBeGreaterThan(0);
  });
});
