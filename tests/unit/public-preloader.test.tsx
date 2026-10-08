/* ===============================================================
   🎬 PUBLIC PRELOADER — render, çıkış zamanlaması, public-only kilit
   =============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

import PublicPreloader, {
  PRELOADER_FADE_MS,
  PRELOADER_MIN_VISIBLE_MS,
} from "@/app/components/layout/PublicPreloader";

const LOGO = "https://cdn.example.com/site-assets/logo.png?v=2026-10-01";
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

function mockReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes("prefers-reduced-motion") ? matches : false,
    media: q,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockReturnValue(0);
  mockReducedMotion(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PublicPreloader — render", () => {
  it("mevcut site logosu (settings.site_logo URL'i) ortada, aspect-ratio korunur", () => {
    const { container } = render(<PublicPreloader logoSrc={LOGO} brand="VillaDirekt" />);
    const root = screen.getByTestId("public-preloader");
    expect(root.className).toContain("vd-preloader");
    expect(root.getAttribute("aria-hidden")).toBe("true");
    const img = container.querySelector("img.vd-preloader__logo") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe(LOGO);
    expect(img.getAttribute("alt")).toBe("");
    /* width/height attribute YOK → CSS width + height:auto (distortion yok) */
    expect(img.hasAttribute("width")).toBe(false);
    expect(img.hasAttribute("height")).toBe(false);
    /* logo varken wordmark tekrar yazılmaz */
    expect(container.querySelector(".vd-preloader__wordmark")).toBeNull();
  });

  it("loading çizgisi: track + mavi fill + sarı nokta; spinner / 'Loading' metni YOK", () => {
    const { container } = render(<PublicPreloader logoSrc={LOGO} />);
    expect(container.querySelector(".vd-preloader__track")).toBeTruthy();
    expect(container.querySelector(".vd-preloader__fill")).toBeTruthy();
    expect(container.querySelector(".vd-preloader__dot")).toBeTruthy();
    expect(container.textContent?.trim()).toBe("");
    expect(container.innerHTML).not.toMatch(/spin|loading\.\.\./i);
  });

  it("logo yoksa site adı wordmark fallback'i (yeni logo çizilmez)", () => {
    const { container } = render(<PublicPreloader logoSrc={null} brand="VillaDirekt" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".vd-preloader__wordmark")?.textContent).toBe("VillaDirekt");
  });

  it("içerik erişimini engellemez: sayfa içeriği aynı anda render olur ve a11y ağacında kalır", () => {
    render(
      <>
        <PublicPreloader logoSrc={LOGO} />
        <main>
          <h1>Kiralık Villalar</h1>
          <button type="button">Rezervasyon</button>
        </main>
      </>
    );
    expect(screen.getByRole("heading", { name: "Kiralık Villalar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rezervasyon" })).toBeTruthy();
    expect(screen.getByRole("main").hasAttribute("inert")).toBe(false);
  });
});

describe("PublicPreloader — çıkış (sahte uzun bekleme yok)", () => {
  it(`erken hydration → en fazla ${PRELOADER_MIN_VISIBLE_MS}ms görünür, ${PRELOADER_FADE_MS}ms fade, sonra DOM'dan çıkar`, () => {
    render(<PublicPreloader logoSrc={LOGO} />);
    expect(screen.getByTestId("public-preloader").dataset.state).toBe("in");
    act(() => { vi.advanceTimersByTime(PRELOADER_MIN_VISIBLE_MS); });
    expect(screen.getByTestId("public-preloader").dataset.state).toBe("out");
    act(() => { vi.advanceTimersByTime(PRELOADER_FADE_MS); });
    expect(screen.queryByTestId("public-preloader")).toBeNull();
  });

  it("sayfa zaten geç hazırsa ek bekleme YOK (anında fade-out)", () => {
    vi.spyOn(performance, "now").mockReturnValue(2000);
    render(<PublicPreloader logoSrc={LOGO} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByTestId("public-preloader").dataset.state).toBe("out");
    act(() => { vi.advanceTimersByTime(PRELOADER_FADE_MS); });
    expect(screen.queryByTestId("public-preloader")).toBeNull();
  });

  it("prefers-reduced-motion: bekleme yok, ~80ms içinde kaldırılır", () => {
    mockReducedMotion(true);
    render(<PublicPreloader logoSrc={LOGO} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByTestId("public-preloader").dataset.state).toBe("out");
    act(() => { vi.advanceTimersByTime(80); });
    expect(screen.queryByTestId("public-preloader")).toBeNull();
  });
});

describe("PublicPreloader — CSS", () => {
  const css = read("app/globals.css");
  const start = css.indexOf("PUBLIC PRELOADER");
  const block = css.slice(start);

  it("reduced-motion desteği: animasyonlar kapatılır, fill/dot statik", () => {
    const rm = block.slice(block.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(rm).toContain(".vd-preloader__logo");
    expect(rm).toContain("animation: none");
    expect(rm).toMatch(/\.vd-preloader__fill \{ animation: none/);
  });

  it("marka renkleri, fixed tam ekran, failsafe; gradient / spinner (rotate) YOK", () => {
    expect(block).toContain("position: fixed");
    expect(block).toContain("inset: 0");
    expect(block).toContain("#1b4ef5");
    expect(block).toContain("#fad716");
    expect(block).toContain("vd-pl-failsafe");
    expect(block).not.toMatch(/gradient/i);
    expect(block).not.toMatch(/rotate\(/);
  });

  it("mobilde logo ve çizgi daha küçük", () => {
    const mob = block.slice(block.indexOf("@media (max-width: 639px)"));
    expect(mob).toContain("--vd-pl-w: 128px");
    expect(mob).toContain("width: 140px");
  });
});

describe("PublicPreloader — yalnız public layout", () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  }

  it("public layout preloader'ı header'la AYNI logo kaynağıyla render eder", () => {
    const pub = read("app/(public)/layout.tsx");
    expect(pub).toContain('import PublicPreloader from "@/app/components/layout/PublicPreloader"');
    expect(pub).toContain("resolveAssetUrlVersioned(settings?.site_logo, settings?.updated_at)");
    expect(pub).toContain("<PublicPreloader");
    /* bakım ekranı dalında preloader yok (public-shell içinde) */
    const iShell = pub.indexOf('className="public-shell');
    expect(pub.indexOf("<PublicPreloader")).toBeGreaterThan(iShell);
    const header = read("app/components/layout/HeaderWrapper.tsx");
    expect(header).toContain("resolveAssetUrlVersioned(settings?.site_logo, settings?.updated_at)");
  });

  it("admin ve root layout preloader İÇERMEZ", () => {
    const files = [
      "app/layout.tsx",
      ...walk(resolve(process.cwd(), "app/(admin)")).filter((f) => /\.(tsx?|css)$/.test(f)),
    ];
    for (const f of files) {
      const src = f.startsWith("/") ? readFileSync(f, "utf8") : read(f);
      expect(src, f).not.toMatch(/PublicPreloader|vd-preloader/);
    }
  });
});
