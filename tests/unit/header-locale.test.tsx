/* ===============================================================
   🛡️ PHASE 9A — HEADER LOCALE DICTIONARY TESTS
   ===============================================================
   Hedef: app/components/layout/Header.tsx + lib/i18n/config.ts'in
   `localeFromPathname()`'i (Phase 9A).

   Header zaten "use client" ve `usePathname()` (next/navigation)
   kullanıyordu (Phase 9A audit'inde doğrulandı) — bu fazda YALNIZ
   dictionary kaynağı modül-seviyesi sabit `getDictionary(DEFAULT_LOCALE)`
   yerine, component gövdesinde `getDictionary(localeFromPathname(pathname))`
   oldu. Middleware/headers() KULLANILMADI (Footer'ın aksine — bkz.
   Phase 9A audit raporu, dynamic-rendering riski nedeniyle Footer bu
   fazın kapsamı DIŞINDA bırakıldı).

   Header'ın ağır, kendi veri/efekt mantığına sahip alt component'leri
   (TopBar, VillaSearchBox, HeaderFavoritesLink — üçü de "use client",
   kendi async/efekt akışlarına sahip) burada KASITLI OLARAK shallow
   mock'lanır: bu testlerin amacı SADECE dictionary/locale davranışı,
   o alt component'lerin kendi mantığı DEĞİL (onlar bu fazın kapsamı
   dışında, dokunulmadı — bkz. Phase 9A audit raporu §10).

   price-engine / discount / pool-heating / reservation testlerine
   HİÇ dokunulmadı.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

/* 🛡️ Ağır/veri-çeken alt component'ler shallow mock'lanır — bkz.
   dosya başı yorum. Gerçek default export'larının component olması
   yeterli (React onları render edebilsin diye); içerikleri bu testler
   için önemsiz. */
vi.mock("@/app/components/layout/TopBar", () => ({
  default: () => null,
}));
vi.mock("@/app/components/layout/VillaSearchBox", () => ({
  default: () => null,
}));
vi.mock("@/app/components/favorites/HeaderFavoritesLink", () => ({
  default: () => null,
}));

import Header from "@/app/components/layout/Header";

describe("Header — Phase 9A locale dictionary", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  it("1) TR path ('/') → 'Teklif Al' (ÖNCEKİ sabit TR metin, DEĞİŞMEDİ)", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Header menu={[]} siteLogo={null} />);
    expect(screen.getAllByText("Teklif Al").length).toBeGreaterThan(0);
  });

  it("2) TR path (villa detay örneği) → yine 'Teklif Al'", () => {
    usePathnameMock.mockReturnValue("/kiralik-villa/ornek-slug");
    render(<Header menu={[]} siteLogo={null} />);
    expect(screen.getAllByText("Teklif Al").length).toBeGreaterThan(0);
  });

  it("3) '/en/...' path → 'Get a Quote' (EN dictionary)", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villa/ornek-slug");
    render(<Header menu={[]} siteLogo={null} />);
    expect(screen.getAllByText("Get a Quote").length).toBeGreaterThan(0);
    expect(screen.queryByText("Teklif Al")).not.toBeInTheDocument();
  });

  it("4) '/de/...' path → 'Angebot anfordern' (DE dictionary)", () => {
    usePathnameMock.mockReturnValue("/de/kiralik-villa/ornek-slug");
    render(<Header menu={[]} siteLogo={null} />);
    expect(screen.getAllByText("Angebot anfordern").length).toBeGreaterThan(0);
    expect(screen.queryByText("Teklif Al")).not.toBeInTheDocument();
  });

  it("5) menuOpen aria-label — EN path'te 'Open menu'", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villalar");
    render(<Header menu={[]} siteLogo={null} />);
    expect(screen.getByLabelText("Open menu")).toBeInTheDocument();
  });

  it("6) menuOpen aria-label — DE path'te 'Menü öffnen'", () => {
    usePathnameMock.mockReturnValue("/de/kiralik-villalar");
    render(<Header menu={[]} siteLogo={null} />);
    expect(screen.getByLabelText("Menü öffnen")).toBeInTheDocument();
  });

  it("7) menuOpen aria-label — TR path'te ÖNCEKİ 'Menüyü aç' (regresyon)", () => {
    usePathnameMock.mockReturnValue("/arama");
    render(<Header menu={[]} siteLogo={null} />);
    expect(screen.getByLabelText("Menüyü aç")).toBeInTheDocument();
  });

  it("8) segment sınırı — '/energy...' gibi yanlış-pozitif olabilecek bir path yine TR'ye düşer", () => {
    usePathnameMock.mockReturnValue("/energy-tasarrufu-ipuclari");
    render(<Header menu={[]} siteLogo={null} />);
    expect(screen.getAllByText("Teklif Al").length).toBeGreaterThan(0);
  });
});

/* ===============================================================
   🛡️ PHASE 9C — HREF REGRESYON KİLİDİ (locale'den bağımsız)
   ===============================================================
   PHASE 9C AUDIT KARARI: Header/Footer href'leri bu fazda
   DEĞİŞTİRİLMEDİ (bkz. Phase 9C audit raporu). Bu blok yalnızca
   BUGÜNKÜ href davranışını (locale ne olursa olsun TR path'lerine
   gitmesini) gelecekte yanlışlıkla bozulmaya karşı kilitler —
   dictionary/metin davranışına dokunmaz, yukarıdaki testlerle
   ÇAKIŞMAZ.
=============================================================== */
/* ===============================================================
   🛡️ NAVIGATION LOCALE PERSISTENCE — SÖZLEŞME GÜNCELLEMESİ
   ===============================================================
   Phase 9C'de bu blok "href locale'den BAĞIMSIZ, DEĞİŞMEZ" kuralını
   kilitliyordu. O kural, EN/DE'de bir iç linke tıklandığında
   prefix'siz TR route'una düşülmesine — yani locale'in navigasyonda
   KAYBOLMASINA — yol açıyordu (bildirilen hata).

   YENİ SÖZLEŞME: iç linkler AKTİF LOCALE'i taşır (`localeHref`).
   Aşağıdaki testler SİLİNMEDİ/GEVŞETİLMEDİ — TR davranışı aynen
   kilitli kalır, EN/DE beklentileri ise doğru davranışa çevrildi ve
   "prefix'siz TR route'una düşmüyor" kontrolü EKLENEREK sıkılaştırıldı.
   =============================================================== */
describe("Header — href locale kilidi (iç linkler aktif locale'i taşır)", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  it("Logo href her zaman '/' — TR path'te", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Header menu={[]} siteLogo={null} />);
    const logoLink = screen.getByRole("link", { name: /Kiralama/i });
    expect(logoLink).toHaveAttribute("href", "/");
  });

  it("Logo href '/en/...' path'te '/en' olur (locale KAYBOLMAZ)", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villa/ornek-slug");
    render(<Header menu={[]} siteLogo={null} />);
    const logoLink = screen.getByRole("link", { name: /Kiralama/i });
    expect(logoLink).toHaveAttribute("href", "/en");
    expect(logoLink).not.toHaveAttribute("href", "/");
  });

  it("Logo href '/de/...' path'te '/de' olur", () => {
    usePathnameMock.mockReturnValue("/de/kiralik-villa/ornek-slug");
    render(<Header menu={[]} siteLogo={null} />);
    const logoLink = screen.getByRole("link", { name: /Kiralama/i });
    expect(logoLink).toHaveAttribute("href", "/de");
  });

  it("'Teklif Al' CTA href her zaman '/teklif-al' — TR path'te", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Header menu={[]} siteLogo={null} />);
    const ctaLinks = screen.getAllByRole("link", { name: "Teklif Al" });
    expect(ctaLinks.length).toBeGreaterThan(0);
    ctaLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "/teklif-al");
    });
  });

  it("CTA href '/en/...' path'te '/en/teklif-al' olur (metin VE hedef EN)", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villalar");
    render(<Header menu={[]} siteLogo={null} />);
    const ctaLinks = screen.getAllByRole("link", { name: "Get a Quote" });
    expect(ctaLinks.length).toBeGreaterThan(0);
    ctaLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "/en/teklif-al");
      expect(link).not.toHaveAttribute("href", "/teklif-al");
    });
  });

  it("CTA href '/de/...' path'te '/de/teklif-al' olur", () => {
    usePathnameMock.mockReturnValue("/de/kiralik-villalar");
    render(<Header menu={[]} siteLogo={null} />);
    const ctaLinks = screen.getAllByRole("link", {
      name: "Angebot anfordern",
    });
    expect(ctaLinks.length).toBeGreaterThan(0);
    ctaLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "/de/teklif-al");
    });
  });
});
