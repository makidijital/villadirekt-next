/* ===============================================================
   🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — YENİ LOCALE ROUTE'LARI
   ===============================================================
   Kapsam:
     • `/en|de/teklif-al`, `/en|de/rezervasyon-kontrol`,
       `/en|de/favoriler`, `/en|de/favoriler/paylas/[token]`,
       `/en|de/kisa-sureli-tarihler/[ay]/[gece]` gate + ortak gövde
     • Yeni dictionary namespace'lerinin TR/EN/DE bütünlüğü
     • TR byte-identity (eski hardcoded metinler dictionary'de AYNEN)
     • 404 + bakım ekranı locale çözümü
     • Source-lock: gövdelerde hardcoded TR kullanıcı metni YOK

   Mock convention: `locale-routes.test.tsx` / `contact-locale-routes`
   ile AYNI — yeni bir test mimarisi İCAT EDİLMEDİ.
=============================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";

const LOCALES: Locale[] = ["tr", "en", "de"];
const WRITABLE: Array<"en" | "de"> = ["en", "de"];

/* ---------------- Mocks ---------------- */

const requirePublicLocaleEnabledMock = vi.fn();
vi.mock("@/lib/i18n/public-locale-gate.server", () => ({
  requirePublicLocaleEnabled: () => requirePublicLocaleEnabledMock(),
}));

const setRequestLocaleMock = vi.fn();
vi.mock("@/lib/i18n/request-locale.server", () => ({
  setRequestLocale: (l: string) => setRequestLocaleMock(l),
}));

const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: vi.fn(async () => ({ multilingual_enabled: true })),
  getCachedVillas: vi.fn(async () => []),
}));

beforeEach(() => {
  vi.clearAllMocks();
  requirePublicLocaleEnabledMock.mockResolvedValue(undefined);
  usePathnameMock.mockReturnValue("/");
});

afterEach(() => cleanup());

/* ===============================================================
   1) GATE + ORTAK GÖVDE
   =============================================================== */

const ROUTES: Array<{
  path: string;
  body: string;
  props?: Record<string, unknown>;
}> = [
  {
    path: "teklif-al",
    body: "@/app/components/offer/OfferPageBody",
  },
  {
    path: "rezervasyon-kontrol",
    body: "@/app/components/reservation-lookup/ReservationLookupPageBody",
    props: { searchParams: Promise.resolve({}) },
  },
  {
    path: "favoriler",
    body: "@/app/components/favorites/FavoritesPageBody",
  },
  {
    path: "favoriler/paylas/[token]",
    body: "@/app/components/favorites/SharedFavoritesPageBody",
    props: { params: Promise.resolve({ token: "abc" }) },
  },
  {
    path: "kisa-sureli-tarihler/[ay]/[gece]",
    body: "@/app/components/short-gaps/ShortGapsPageBody",
    props: {
      params: Promise.resolve({ ay: "haziran", gece: "2" }),
      searchParams: Promise.resolve({}),
    },
  },
];

for (const route of ROUTES) {
  for (const locale of WRITABLE) {
    describe(`/${locale}/${route.path}`, () => {
      const modulePath = `@/app/(public)/${locale}/${route.path}/page`;

      it(`1) gate geçtiğinde ortak gövdeyi locale="${locale}" ile render eder`, async () => {
        const { default: Page } = await import(modulePath);
        const { default: Body } = await import(route.body);
        const element = await Page(route.props ?? {});

        expect(setRequestLocaleMock).toHaveBeenCalledWith(locale);
        expect(requirePublicLocaleEnabledMock).toHaveBeenCalledTimes(1);
        expect(element.type).toBe(Body);
        expect(element.props.locale).toBe(locale);
      });

      it("2) gate notFound() fırlattığında sayfa bunu YUTMAZ", async () => {
        requirePublicLocaleEnabledMock.mockRejectedValue(
          new Error("NEXT_NOT_FOUND")
        );
        const { default: Page } = await import(modulePath);
        await expect(Page(route.props ?? {})).rejects.toThrow(
          "NEXT_NOT_FOUND"
        );
      });
    });
  }
}

/* ===============================================================
   2) DICTIONARY BÜTÜNLÜĞÜ
   =============================================================== */

function leafPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string") return [prefix];
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k)
  );
}
function leafValues(obj: unknown): string[] {
  if (typeof obj === "string") return [obj];
  if (!obj || typeof obj !== "object") return [];
  return Object.values(obj as Record<string, unknown>).flatMap(leafValues);
}

const NEW_NAMESPACES = [
  "offer",
  "reservationLookup",
  "favoritesPage",
  "shortGaps",
  "notFound",
  "maintenance",
] as const;

describe("yeni dictionary namespace'leri — TR/EN/DE", () => {
  it.each(NEW_NAMESPACES)("3-%s) anahtar ağaçları BİREBİR aynı", (ns) => {
    const tr = leafPaths(getDictionary("tr")[ns]).sort();
    expect(leafPaths(getDictionary("en")[ns]).sort()).toEqual(tr);
    expect(leafPaths(getDictionary("de")[ns]).sort()).toEqual(tr);
  });

  it.each(NEW_NAMESPACES)("4-%s) hiçbir değer boş/whitespace değil", (ns) => {
    for (const locale of LOCALES) {
      for (const v of leafValues(getDictionary(locale)[ns])) {
        expect(v.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it.each(NEW_NAMESPACES)("5-%s) EN ve DE gerçekten çevrilmiş", (ns) => {
    const tr = leafValues(getDictionary("tr")[ns]);
    const en = leafValues(getDictionary("en")[ns]);
    const de = leafValues(getDictionary("de")[ns]);
    expect(en.length).toBe(tr.length);
    expect(de.length).toBe(tr.length);
    expect(en.filter((v, i) => v === tr[i]).length).toBeLessThan(
      Math.max(2, Math.ceil(tr.length * 0.2))
    );
    expect(de.filter((v, i) => v === tr[i]).length).toBeLessThan(
      Math.max(2, Math.ceil(tr.length * 0.2))
    );
  });

  it("6) interpolasyon token'ları HER dilde korunur", () => {
    for (const locale of LOCALES) {
      const d = getDictionary(locale);
      expect(d.offer.stepperDecreaseAriaLabel).toContain("{label}");
      expect(d.offer.stepperIncreaseAriaLabel).toContain("{label}");
      expect(d.reservationLookup.detailGuestsValue).toContain("{n}");
      expect(d.reservationLookup.shareNights).toContain("{n}");
      expect(d.favoritesPage.sharedCreatedAt).toContain("{date}");
      expect(d.favoritesPage.sharedVisibleCount).toContain("{visible}");
      expect(d.favoritesPage.sharedVisibleCount).toContain("{total}");
      expect(d.shortGaps.metaTitle).toContain("{month}");
      expect(d.shortGaps.heroTitle).toContain("{n}");
      expect(d.shortGaps.heroSubtitle).toContain("{count}");
      expect(d.footer.copyrightFallback).toContain("{year}");
      expect(d.footer.copyrightFallback).toContain("{site_name}");
      expect(d.header.submenuOpenAriaLabel).toContain("{label}");
    }
  });

  it("7) TR değerleri ESKİ hardcoded metinlerle BİREBİR", () => {
    const d = getDictionary("tr");
    expect(d.offer.metaTitle).toBe("Teklif Al — Size Özel Villa Önerisi");
    expect(d.offer.submit).toBe("Teklifimi Oluştur");
    expect(d.offer.successTitle).toBe("Talebiniz alındı.");
    expect(d.reservationLookup.metaTitle).toBe("Rezervasyon Kontrol");
    expect(d.reservationLookup.formTitle).toBe("Bilgilerinizi girin.");
    expect(d.reservationLookup.statusPendingLabel).toBe("Beklemede");
    expect(d.favoritesPage.heroTitle).toBe("Favorilerim");
    expect(d.favoritesPage.emptyTitle).toBe("Koleksiyonunuzu başlatın");
    expect(d.shortGaps.heroEyebrow).toBe("Kısa Süreli Tarihler");
    expect(d.shortGaps.emptyBody).toBe(
      "Bu kriterlere uygun kısa süreli boşluk bulunamadı."
    );
    expect(d.notFound.title).toBe("Aradığınız sayfayı bulamadık");
    expect(d.notFound.homeCta).toBe("Ana Sayfaya Dön");
    expect(d.maintenance.eyebrow).toBe("Bakım");
    expect(d.maintenance.defaultMessage).toBe(
      "Sitemizi yeniliyoruz. Kısa süre içinde tekrar buradayız."
    );
    expect(d.common.searching).toBe("Aranıyor...");
    expect(d.common.carouselPrev).toBe("Geri kaydır");
    expect(d.favorites.myFavorites).toBe("Favorilerim");
    expect(d.header.logoAlt).toBe("Site logosu");
    expect(d.footer.tursabAlt).toBe("TÜRSAB üyesi");
  });
});

/* ===============================================================
   3) 404 + BAKIM EKRANI (pathname → locale)
   =============================================================== */

describe("NotFoundContent — pathname'den locale", () => {
  it.each([
    ["/olmayan-sayfa", "tr"],
    ["/en/olmayan-sayfa", "en"],
    ["/de/olmayan-sayfa", "de"],
  ] as const)("8) %s → %s metinleri", async (pathname, locale) => {
    usePathnameMock.mockReturnValue(pathname);
    const { default: NotFoundContent } = await import(
      "@/app/components/not-found/NotFoundContent"
    );
    render(<NotFoundContent />);
    const dict = getDictionary(locale).notFound;
    expect(screen.getByText(dict.title)).toBeInTheDocument();
    expect(screen.getByText(dict.homeCta)).toBeInTheDocument();
    expect(screen.getByText(dict.homeCta).closest("a")).toHaveAttribute(
      "href",
      locale === "tr" ? "/" : `/${locale}`
    );
  });
});

describe("MaintenanceScreen — canonical mesaj + locale etiketi", () => {
  it.each(LOCALES)("9) %s — mesaj yoksa dictionary varsayılanı", async (locale) => {
    usePathnameMock.mockReturnValue(locale === "tr" ? "/" : `/${locale}`);
    const { default: MaintenanceScreen } = await import(
      "@/app/components/layout/MaintenanceScreen"
    );
    render(<MaintenanceScreen brand="Marka" message={null} />);
    const dict = getDictionary(locale).maintenance;
    expect(screen.getByText(dict.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(dict.defaultMessage)).toBeInTheDocument();
  });

  it("10) 🔒 admin mesajı CANONICAL kalır (migration 084 kararı)", async () => {
    usePathnameMock.mockReturnValue("/de");
    const { default: MaintenanceScreen } = await import(
      "@/app/components/layout/MaintenanceScreen"
    );
    render(<MaintenanceScreen brand="Marka" message="Özel bakım mesajı" />);
    expect(screen.getByText("Özel bakım mesajı")).toBeInTheDocument();
    expect(
      screen.queryByText(getDictionary("de").maintenance.defaultMessage)
    ).toBeNull();
  });
});

/* ===============================================================
   4) SOURCE-LOCK — hardcoded TR kullanıcı metni yok
   =============================================================== */

const SOURCE_LOCKED = [
  "app/(public)/teklif-al/OfferRequestForm.tsx",
  "app/components/offer/OfferPageBody.tsx",
  "app/(public)/rezervasyon-kontrol/ReservationLookup.tsx",
  "app/(public)/rezervasyon-kontrol/ReservationShareView.tsx",
  "app/components/reservation-lookup/ReservationLookupPageBody.tsx",
  "app/(public)/favoriler/FavoritesGrid.tsx",
  "app/components/favorites/FavoritesPageBody.tsx",
  "app/components/favorites/SharedFavoritesPageBody.tsx",
  "app/(public)/kisa-sureli-tarihler/GapFilterSidebar.tsx",
  "app/components/short-gaps/ShortGapsPageBody.tsx",
  "app/components/not-found/NotFoundContent.tsx",
  "app/components/layout/MaintenanceScreen.tsx",
  "app/components/layout/Footer.tsx",
  "app/components/layout/VillaSearchBox.tsx",
  "app/components/favorites/HeaderFavoritesLink.tsx",
  "app/components/villa/HorizontalCarousel.tsx",
  "app/(public)/layout.tsx",
];

describe("source-lock — public gövdelerde hardcoded TR metin yok", () => {
  it.each(SOURCE_LOCKED)("11) %s", (p) => {
    const raw = readFileSync(resolve(process.cwd(), p), "utf8");
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    const offending = src
      .split("\n")
      .filter(
        (l) => /[çğıöşüÇĞİÖŞÜ]/.test(l) && !l.includes("console.")
      );
    expect(offending).toEqual([]);
  });
});
