/* ===============================================================
   🛡️ PHASE 9B — FOOTER LOCALE DICTIONARY + WRAPPER PROP-PASSING TESTLERİ
   ===============================================================
   Hedef 1: app/components/layout/Footer.tsx (artık "use client")
   `usePathname()` + `localeFromPathname()` (Phase 9A) ile locale
   tespit edip `getDictionary(locale)` çağırıyor — Header.tsx (Phase
   9A) ile BİREBİR AYNI mekanizma. Bu grup, Footer'ı DOĞRUDAN (props
   ile, FooterWrapper olmadan) render ederek yalnızca locale/dictionary
   davranışını test eder.

   Hedef 2: app/components/layout/FooterWrapper.tsx (yeni async server
   component) — Footer'ın ÖNCEKİ (Phase 8'e kadar) veri-çekme mantığını
   BİREBİR taşıyor mu, doğru props'ları Footer'a geçiriyor mu. Bu grup
   `sitemap-locale-alternates.test.ts`'teki KANITLANMIŞ `vi.mock` +
   `vi.fn()` deseniyle DB/service katmanını mock'lar; GERÇEK DB'YE HİÇ
   DOKUNULMAZ.

   price-engine / discount / pool-heating / reservation testlerine HİÇ
   dokunulmadı. Href'ler test edilmiyor (bu fazda değişmediler — bkz.
   Phase 9B audit).
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/* ---------------- GRUP 1 — Footer (client) locale/dictionary ---------------- */

const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

import Footer from "@/app/components/layout/Footer";

const BASE_PROPS = {
  settings: null,
  locations: [],
  villaTypes: [],
  corporatePages: [],
  year: 2026,
  siteName: "Tatilin Yeri",
  phoneDigits: "",
};

describe("Footer — Phase 9B locale dictionary (props ile doğrudan render)", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  it("1) TR path ('/') → TR footer dictionary metinleri (ÖNCEKİ sabit metinler, DEĞİŞMEDİ)", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Footer {...BASE_PROPS} />);
    expect(screen.getByText("Villalar")).toBeInTheDocument();
    expect(screen.getByText("Rezervasyon Sorgula")).toBeInTheDocument();
  });

  it("1b) TR path ('/kiralik-villalar') → yine TR footer dictionary metinleri", () => {
    usePathnameMock.mockReturnValue("/kiralik-villalar");
    render(<Footer {...BASE_PROPS} />);
    expect(screen.getByText("Villalar")).toBeInTheDocument();
  });

  it("2) '/en/kiralik-villalar' → EN footer dictionary metinleri (lib/i18n/dictionaries/en.ts değerleri)", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villalar");
    render(<Footer {...BASE_PROPS} />);
    expect(screen.queryByText("Villalar")).not.toBeInTheDocument();
    expect(screen.getByText("Villas")).toBeInTheDocument();
    expect(screen.getByText("Check Reservation")).toBeInTheDocument();
  });

  it("3) '/de/kiralik-villalar' → DE footer dictionary metinleri (lib/i18n/dictionaries/de.ts değerleri)", () => {
    usePathnameMock.mockReturnValue("/de/kiralik-villalar");
    render(<Footer {...BASE_PROPS} />);
    expect(screen.queryByText("Villalar")).not.toBeInTheDocument();
    expect(screen.getByText("Villen")).toBeInTheDocument();
    expect(screen.getByText("Reservierung prüfen")).toBeInTheDocument();
  });

  it("4) segment sınırı — '/energy-something' YANLIŞLIKLA 'en' ile eşleşmez, TR'ye düşer", () => {
    usePathnameMock.mockReturnValue("/energy-something");
    render(<Footer {...BASE_PROPS} />);
    expect(screen.getByText("Villalar")).toBeInTheDocument();
  });

  it("5) villaTypes/locations boşsa fallback dictionary metinleri (allCategories/exploreAllRegions) görünür", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Footer {...BASE_PROPS} />);
    expect(screen.getByText("Tüm kategoriler")).toBeInTheDocument();
  });

  /* 🛡️ NAVIGATION LOCALE PERSISTENCE — sözleşme güncellendi:
     iç linkler artık AKTİF LOCALE'i taşır (eski "prefix'siz kalır"
     kuralı navigasyonda locale kaybına yol açıyordu). Test SİLİNMEDİ,
     doğru davranışa çevrildi ve "TR'ye düşmüyor" kontrolü eklendi. */
  it("6) href'ler aktif locale'i taşır — EN path'te '/en/rezervasyon-kontrol'", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villalar");
    render(<Footer {...BASE_PROPS} />);
    const reservationLink = screen.getByRole("link", {
      name: /Check Reservation/i,
    });
    expect(reservationLink).toHaveAttribute(
      "href",
      "/en/rezervasyon-kontrol"
    );
    expect(reservationLink).not.toHaveAttribute(
      "href",
      "/rezervasyon-kontrol"
    );
  });
});

/* ---------------- GRUP 2 — FooterWrapper (server) prop-passing ---------------- */

const getPublicSettingsMock = vi.fn();
const findAllVillaLocationsMock = vi.fn();
const findAllVillaTypesMock = vi.fn();
const findActivePagesMock = vi.fn();

vi.mock("@/app/services/settings.service", () => ({
  getPublicSettings: (...args: unknown[]) => getPublicSettingsMock(...args),
}));
vi.mock("@/lib/db/menu.repository", () => ({
  menuRepository: {
    findAllVillaLocations: (...args: unknown[]) =>
      findAllVillaLocationsMock(...args),
    findAllVillaTypes: (...args: unknown[]) =>
      findAllVillaTypesMock(...args),
  },
}));
vi.mock("@/lib/db/pages.repository", () => ({
  pagesRepository: {
    findActivePages: (...args: unknown[]) => findActivePagesMock(...args),
  },
}));

import FooterWrapper from "@/app/components/layout/FooterWrapper";

describe("FooterWrapper — Phase 9B prop-passing (DB/service mock'lanır, gerçek DB'ye dokunulmaz)", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockReset();
    findAllVillaLocationsMock.mockReset();
    findAllVillaTypesMock.mockReset();
    findActivePagesMock.mockReset();
  });

  it("7) settings/villaTypes/locations/corporatePages başarıyla döner → Footer'a props olarak geçer ve render edilir", async () => {
    getPublicSettingsMock.mockResolvedValue({
      site_name: "Test Villa",
      phone: "+90 555 000 00 00",
      email: "info@example.com",
    });
    findAllVillaLocationsMock.mockResolvedValue({
      data: [{ id: "loc-1", name: "Kalkan", slug: "kalkan" }],
    });
    findAllVillaTypesMock.mockResolvedValue({
      data: [{ id: "type-1", name: "Havuzlu Villa", slug: "havuzlu-villa" }],
    });
    findActivePagesMock.mockResolvedValue({
      data: [
        {
          id: "page-1",
          title: "Hakkımızda",
          slug: "hakkimizda",
          menu_order: 1,
          created_at: "2024-01-01T00:00:00.000Z",
        },
      ],
    });

    const element = await FooterWrapper();
    render(element);

    expect(screen.getByText("Kalkan")).toBeInTheDocument();
    expect(screen.getByText("Havuzlu Villa")).toBeInTheDocument();
    expect(screen.getByText("Hakkımızda")).toBeInTheDocument();
    /* settings mock'unda site_logo/footer_logo YOK → wordmark fallback
       render edilmeli (ÖNCEKİ davranış — <img> DEĞİL). */
    expect(screen.getByText("Gel")).toBeInTheDocument();
  });

  it("8) bir fetch reject olursa (Promise.allSettled) diğerleri etkilenmez — ÖNCEKİ davranış korunuyor", async () => {
    getPublicSettingsMock.mockRejectedValue(new Error("settings down"));
    findAllVillaLocationsMock.mockResolvedValue({
      data: [{ id: "loc-2", name: "Kaş", slug: "kas" }],
    });
    findAllVillaTypesMock.mockResolvedValue({ data: [] });
    findActivePagesMock.mockResolvedValue({ data: [] });

    const element = await FooterWrapper();
    render(element);

    /* settings reject oldu ama locations yine de render edildi. */
    expect(screen.getByText("Kaş")).toBeInTheDocument();
    /* settings null olduğu için copyright fallback görünür. */
    expect(screen.getByText(/Tüm hakları saklıdır/)).toBeInTheDocument();
  });
});

/* ---------------- GRUP 3 — Phase 9C href regresyon kilidi ---------------- */

/* 🛡️ NAVIGATION LOCALE PERSISTENCE — SÖZLEŞME GÜNCELLEMESİ
   Phase 9C'de bu grup "locale ne olursa olsun TR path'lerine gitsin"
   davranışını kilitliyordu; o davranış EN/DE'de navigasyonda locale
   kaybına yol açıyordu. Testler SİLİNMEDİ: TR beklentileri AYNEN
   korunur (canonical prefix'siz), EN/DE beklentileri doğru davranışa
   (prefix'li) çevrildi ve "TR route'una düşmüyor" kontrolü eklendi.
   Query parametreleri ve token/slug kontratı DEĞİŞMEZ. */

const PROPS_WITH_TAXONOMY_AND_CMS = {
  settings: null,
  locations: [{ id: "loc-1", name: "Kalkan", slug: "kalkan" }],
  villaTypes: [{ id: "type-1", name: "Havuzlu Villa", slug: "havuzlu-villa" }],
  corporatePages: [
    {
      id: "page-1",
      title: "Hakkımızda",
      slug: "hakkimizda",
      menu_order: 1,
      created_at: "2024-01-01T00:00:00.000Z",
    },
  ],
  year: 2026,
  siteName: "Tatilin Yeri",
  phoneDigits: "",
};

describe("Footer — href locale kilidi (iç linkler aktif locale'i taşır)", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  /* 🛡️ SEO LANDING — slug'lı villa tipi artık `/villa-turleri/<slug>`
     landing'ine gider; bölge (grup kökü DEĞİLSE) ESKİ /arama URL'inde
     kalır (bkz. lib/taxonomy-landing + taxonomy-landing.test.ts). */
  it("9) villa type taxonomy href'i '/villa-turleri/{slug}' landing'i — TR path'te", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Footer {...PROPS_WITH_TAXONOMY_AND_CMS} />);
    const link = screen.getByRole("link", { name: "Havuzlu Villa" });
    expect(link).toHaveAttribute("href", "/villa-turleri/havuzlu-villa");
  });

  it("10) location taxonomy href'i '/arama?bolgeler={slug}' yapısında — TR path'te", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Footer {...PROPS_WITH_TAXONOMY_AND_CMS} />);
    const link = screen.getByRole("link", { name: "Kalkan" });
    expect(link).toHaveAttribute("href", "/arama?bolgeler=kalkan");
  });

  it("11) CMS (corporate page) href'i '/p/{slug}' yapısında — TR path'te", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Footer {...PROPS_WITH_TAXONOMY_AND_CMS} />);
    const link = screen.getByRole("link", { name: "Hakkımızda" });
    expect(link).toHaveAttribute("href", "/p/hakkimizda");
  });

  it("12) taxonomy + CMS href'leri '/en/...' path'te '/en' prefix'i alır (token/slug kontratı AYNEN)", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villalar");
    render(<Footer {...PROPS_WITH_TAXONOMY_AND_CMS} />);
    expect(screen.getByRole("link", { name: "Havuzlu Villa" })).toHaveAttribute(
      "href",
      "/en/villa-turleri/havuzlu-villa"
    );
    expect(screen.getByRole("link", { name: "Kalkan" })).toHaveAttribute(
      "href",
      "/en/arama?bolgeler=kalkan"
    );
    expect(screen.getByRole("link", { name: "Hakkımızda" })).toHaveAttribute(
      "href",
      "/en/p/hakkimizda"
    );
    /* Prefix'siz TR route'una DÜŞMÜYOR. */
    expect(screen.getByRole("link", { name: "Kalkan" })).not.toHaveAttribute(
      "href",
      "/arama?bolgeler=kalkan"
    );
  });

  it("13) taxonomy + CMS href'leri '/de/...' path'te '/de' prefix'i alır (token/slug kontratı AYNEN)", () => {
    usePathnameMock.mockReturnValue("/de/kiralik-villalar");
    render(<Footer {...PROPS_WITH_TAXONOMY_AND_CMS} />);
    expect(screen.getByRole("link", { name: "Havuzlu Villa" })).toHaveAttribute(
      "href",
      "/de/villa-turleri/havuzlu-villa"
    );
    expect(screen.getByRole("link", { name: "Kalkan" })).toHaveAttribute(
      "href",
      "/de/arama?bolgeler=kalkan"
    );
    expect(screen.getByRole("link", { name: "Hakkımızda" })).toHaveAttribute(
      "href",
      "/de/p/hakkimizda"
    );
    /* Prefix'siz TR route'una DÜŞMÜYOR. */
    expect(screen.getByRole("link", { name: "Kalkan" })).not.toHaveAttribute(
      "href",
      "/arama?bolgeler=kalkan"
    );
  });

  it("14) villaTypes/locations boşsa fallback linkleri '/arama' hedefler (allCategories/exploreAllRegions) — TR path'te", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Footer {...BASE_PROPS} />);
    expect(
      screen.getByRole("link", { name: "Tüm kategoriler" })
    ).toHaveAttribute("href", "/arama");
    expect(
      screen.getByRole("link", { name: "Tüm bölgeleri keşfet" })
    ).toHaveAttribute("href", "/arama");
  });

  it("15) 'Rezervasyon Sorgula' href her zaman '/rezervasyon-kontrol' — TR path'te (EN path zaten test 6'da doğrulandı)", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Footer {...BASE_PROPS} />);
    const link = screen.getByRole("link", { name: /Rezervasyon Sorgula/i });
    expect(link).toHaveAttribute("href", "/rezervasyon-kontrol");
  });
});
