/* ===============================================================
   🛡️ PHASE 12E — PUBLIC CMS SAYFASI STATİK UI ÇEVİRİ TESTLERİ
   ===============================================================
   Kapsam:
     A) `cms` dictionary namespace bütünlüğü (TR/EN/DE)
     B) TR BYTE-IDENTITY — değerler Phase 12E öncesindeki hardcoded
        metinlerin BİREBİR kopyası
     C) SOURCE-LOCK — `CmsPageBody.tsx`'te kullanıcıya görünen
        hardcoded TR metin KALMADI (yalnız anahtar kelime regex'leri)
     D) GERÇEK RENDER — /p, /en/p, /de/p breadcrumb + eyebrow +
        rozet + boş içerik metinleri DOĞRU dilde

   CMS'in ASIL içeriği (title/excerpt/body/seo_*) bu testin konusu
   DEĞİL — o `page_translations` üzerinden gelir ve
   `cms-page-translation.test.ts` / `cms-page-locale-routes.test.tsx`
   tarafından kapsanır.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import { tr } from "@/lib/i18n/dictionaries/tr";
import { en } from "@/lib/i18n/dictionaries/en";
import { de } from "@/lib/i18n/dictionaries/de";

/* ---------------- mock katmanı (locale-routes testiyle AYNI) ---------------- */

const requirePublicLocaleEnabledMock = vi.fn();
const setRequestLocaleMock = vi.fn();
vi.mock("@/lib/i18n/public-locale-gate.server", () => ({
  requirePublicLocaleEnabled: () => requirePublicLocaleEnabledMock(),
}));
vi.mock("@/lib/i18n/request-locale.server", () => ({
  setRequestLocale: (...a: unknown[]) => setRequestLocaleMock(...a),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const getPageBySlugMock = vi.fn();
vi.mock("@/app/services/page.service", () => ({
  getPageBySlug: (...a: unknown[]) => getPageBySlugMock(...a),
  getPages: vi.fn(),
}));

const getTranslationMock = vi.fn();
vi.mock("@/lib/i18n/get-translation.server", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    getTranslation: (...a: unknown[]) => getTranslationMock(...a),
  };
});

vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: vi.fn().mockResolvedValue({ multilingual_enabled: true }),
}));
vi.mock("@/lib/storage.helpers", () => ({
  getPageCoverPublicUrl: (v: string | null | undefined) =>
    v ? `https://cdn.test/${v}` : null,
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img alt={String(props.alt ?? "")} src={String(props.src ?? "")} />
  ),
}));
/* PageHero async server component → sade stub. Eyebrow / breadcrumb /
   badge prop'ları GÖRÜNÜR hale getirilir (statik metin testi). */
vi.mock("@/app/components/ui/PageHero", () => ({
  default: (props: {
    title?: React.ReactNode;
    eyebrow?: string;
    description?: string;
    breadcrumb?: { name: string; href?: string }[];
    badge?: { eyebrow?: string; lines: string[] };
  }) => (
    <div data-testid="page-hero">
      <span data-testid="hero-eyebrow">{props.eyebrow ?? ""}</span>
      <span data-testid="hero-crumbs">
        {(props.breadcrumb ?? []).map((c) => c.name).join(" | ")}
      </span>
      <span data-testid="hero-badge-eyebrow">{props.badge?.eyebrow ?? ""}</span>
      <span data-testid="hero-badge-lines">
        {(props.badge?.lines ?? []).join(" | ")}
      </span>
      <h1>{props.title}</h1>
    </div>
  ),
}));
vi.mock("@/app/components/cms/PageSectionRenderer", () => ({
  default: () => <div data-testid="section" />,
}));
vi.mock("@/app/components/seo/StructuredData", () => ({
  JsonLd: () => null,
  buildBreadcrumb: (items: unknown, locale?: string) => ({ items, locale }),
}));

const PAGE_ID = "page-uuid-1";

/* Kurumsal OLMAYAN + cover'lı → editorial hero (breadcrumb + eyebrow
   DOĞRUDAN bu component'te render edilir). */
const EDITORIAL_PAGE = {
  id: PAGE_ID,
  slug: "kasta-unutulmaz-bir-tatil",
  title: "Kaş'ta Unutulmaz Bir Tatil",
  excerpt: "Türkçe özet",
  body: "Türkçe gövde",
  seo_title: null,
  seo_description: null,
  noindex: false,
  cover_image: "pages/kas.webp",
  sections: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  requirePublicLocaleEnabledMock.mockResolvedValue(undefined);
  getPageBySlugMock.mockResolvedValue(EDITORIAL_PAGE);
  getTranslationMock.mockResolvedValue(null);
});

async function renderRoute(modulePath: string, slug = EDITORIAL_PAGE.slug) {
  const { default: Page } = await import(modulePath);
  const element = await Page({ params: Promise.resolve({ slug }) });
  render(element);
}

const ROUTES = {
  tr: "@/app/p/[slug]/page",
  en: "@/app/(public)/en/p/[slug]/page",
  de: "@/app/(public)/de/p/[slug]/page",
} as const;

/* ===============================================================
   A) DICTIONARY BÜTÜNLÜĞÜ
   =============================================================== */
describe("Phase 12E — `cms` namespace bütünlüğü", () => {
  const KEYS = [
    "breadcrumbHome",
    "eyebrowContent",
    "eyebrowCorporate",
    "badgeHelpEyebrow",
    "badgeFaq",
    "badgePolicy",
    "fallbackTitle",
    "contentComingSoon",
    /* 🛡️ Sayfa bulunamadığında `generateMetadata` başlığı (EN/DE açığı
       kapatıldı; TR değeri eski hardcoded metinle BİREBİR). */
    "notFoundMetaTitle",
  ];

  it("1) TR/EN/DE'de AYNI key seti", () => {
    expect(Object.keys(tr.cms).sort()).toEqual([...KEYS].sort());
    expect(Object.keys(en.cms).sort()).toEqual([...KEYS].sort());
    expect(Object.keys(de.cms).sort()).toEqual([...KEYS].sort());
  });

  it("2) hiçbir dilde boş değer yok", () => {
    for (const [name, d] of [
      ["tr", tr],
      ["en", en],
      ["de", de],
    ] as const) {
      for (const [k, v] of Object.entries(d.cms)) {
        expect(typeof v, `${name}.${k}`).toBe("string");
        expect((v as string).trim().length, `${name}.${k}`).toBeGreaterThan(0);
      }
    }
  });

  it("3) EN'de Türkçe karakter yok", () => {
    for (const v of Object.values(en.cms)) {
      expect(/[çÇğĞıİöÖşŞüÜ]/.test(v as string), v as string).toBe(false);
    }
  });

  it("4) DE'de Türkçeye ÖZGÜ karakter yok (ö/ü Almancada geçerli)", () => {
    for (const v of Object.values(de.cms)) {
      expect(/[çÇğĞıİşŞ]/.test(v as string), v as string).toBe(false);
    }
  });

  it("5) EN/DE değerleri TR'nin kopyası değil", () => {
    for (const k of KEYS) {
      const t = (tr.cms as Record<string, string>)[k];
      expect((en.cms as Record<string, string>)[k], k).not.toBe(t);
      expect((de.cms as Record<string, string>)[k], k).not.toBe(t);
    }
  });

  it("6) public `header.home` KİRLETİLMEDİ (ayrı key, ayrı yazım)", () => {
    expect(tr.header.home).toBe("Anasayfa");
    expect(tr.cms.breadcrumbHome).toBe("Ana sayfa");
    expect(tr.cms.breadcrumbHome).not.toBe(tr.header.home);
  });
});

/* ===============================================================
   B) TR BYTE-IDENTITY
   =============================================================== */
describe("Phase 12E — TR byte-identity", () => {
  it("7) TR değerleri Phase 12E öncesi hardcoded metinlerle BİREBİR", () => {
    expect(tr.cms.breadcrumbHome).toBe("Ana sayfa");
    expect(tr.cms.eyebrowContent).toBe("İçerik");
    expect(tr.cms.eyebrowCorporate).toBe("Kurumsal");
    expect(tr.cms.badgeHelpEyebrow).toBe("Yardım");
    expect(tr.cms.badgeFaq).toBe("Sık Sorulanlar");
    expect(tr.cms.badgePolicy).toBe("Politika & Şartlar");
    expect(tr.cms.fallbackTitle).toBe("Sayfa");
    expect(tr.cms.contentComingSoon).toBe("İçerik yakında.");
  });
});

/* ===============================================================
   C) SOURCE-LOCK
   =============================================================== */
/** Yorumları temizler — source-lock YALNIZ koda bakmalı (yorumlardaki
 *  "Ana sayfa" gibi alıntılar false-positive üretir; Phase 11/12'deki
 *  aynı ilke). */
function stripComments(src: string): string {
  const out: string[] = [];
  let i = 0;
  const n = src.length;
  let state: "code" | "block" | "line" = "code";
  while (i < n) {
    const ch = src[i];
    if (state === "code") {
      if (src.startsWith("/*", i)) {
        state = "block";
        i += 2;
        continue;
      }
      if (src.startsWith("//", i)) {
        state = "line";
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        const q = ch;
        out.push(ch);
        i += 1;
        while (i < n) {
          if (src[i] === "\\") {
            out.push(src[i]);
            if (i + 1 < n) out.push(src[i + 1]);
            i += 2;
            continue;
          }
          out.push(src[i]);
          if (src[i] === q) {
            i += 1;
            break;
          }
          i += 1;
        }
        continue;
      }
      out.push(ch);
      i += 1;
      continue;
    }
    if (state === "block") {
      if (src.startsWith("*/", i)) {
        state = "code";
        i += 2;
        continue;
      }
      out.push(ch === "\n" ? "\n" : " ");
      i += 1;
      continue;
    }
    if (ch === "\n") {
      state = "code";
      out.push("\n");
      i += 1;
      continue;
    }
    out.push(" ");
    i += 1;
  }
  return out.join("");
}

describe("Phase 12E — source-lock", () => {
  const raw = fs.readFileSync(
    path.join(process.cwd(), "app/components/cms/CmsPageBody.tsx"),
    "utf-8"
  );
  const src = stripComments(raw);

  it("8) kullanıcıya görünen hardcoded TR string KALMADI", () => {
    for (const forbidden of [
      '"Ana sayfa"',
      '"İçerik"',
      '"Kurumsal"',
      '"Yardım"',
      '"Sık Sorulanlar"',
      '"Politika & Şartlar"',
      '"Sayfa"',
      "İçerik yakında.",
    ]) {
      expect(src.includes(forbidden), forbidden).toBe(false);
    }
  });

  it("9) statik metinler MEVCUT `getDictionary` ile çözülüyor", () => {
    expect(src).toContain("getDictionary(locale).cms");
    /* Yeni provider/context/fallback mekanizması EKLENMEDİ. */
    expect(src).not.toContain("createContext");
    expect(src).not.toContain("useContext");
    expect(src).not.toContain("localStorage");
  });

  it("10) anahtar kelime regex'leri TÜRKÇE kalır (içerik eşleşmesi)", () => {
    /* Bunlar kullanıcıya GÖRÜNMEZ; canonical TR başlık/slug üzerinde
       çalışır — çevrilirse kurumsal hero/rozet kararı bozulurdu. */
    expect(src).toContain("sik sorul|sık sorul");
    expect(src).toContain("gizlilik|kvkk");
  });
});

/* ===============================================================
   D) GERÇEK RENDER
   =============================================================== */
describe("Phase 12E — editorial hero (breadcrumb + eyebrow)", () => {
  const CASES = [
    ["tr", tr] as const,
    ["en", en] as const,
    ["de", de] as const,
  ];

  it.each(CASES)("11) /%s → breadcrumb + eyebrow doğru dilde", async (loc, d) => {
    await renderRoute(ROUTES[loc]);
    expect(screen.getByText(d.cms.breadcrumbHome)).toBeTruthy();
    expect(screen.getByText(d.cms.eyebrowContent)).toBeTruthy();
  });

  it("12) EN sayfada TR statik metinler YOK", async () => {
    await renderRoute(ROUTES.en);
    expect(screen.queryAllByText(tr.cms.breadcrumbHome)).toHaveLength(0);
    expect(screen.queryAllByText(tr.cms.eyebrowContent)).toHaveLength(0);
    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("Content")).toBeTruthy();
  });

  it("13) DE sayfada TR statik metinler YOK", async () => {
    await renderRoute(ROUTES.de);
    expect(screen.queryAllByText(tr.cms.breadcrumbHome)).toHaveLength(0);
    expect(screen.getByText("Startseite")).toBeTruthy();
    expect(screen.getByText("Inhalt")).toBeTruthy();
  });
});

describe("Phase 12E — kurumsal/PageHero metinleri", () => {
  const CORPORATE = {
    ...EDITORIAL_PAGE,
    slug: "hakkimizda",
    title: "Hakkımızda",
  };

  const CASES = [
    ["tr", tr] as const,
    ["en", en] as const,
    ["de", de] as const,
  ];

  it.each(CASES)(
    "14) /%s kurumsal sayfa → PageHero eyebrow + breadcrumb doğru dilde",
    async (loc, d) => {
      getPageBySlugMock.mockResolvedValue(CORPORATE);
      await renderRoute(ROUTES[loc], CORPORATE.slug);

      expect(screen.getByTestId("hero-eyebrow").textContent).toBe(
        d.cms.eyebrowCorporate
      );
      expect(screen.getByTestId("hero-crumbs").textContent).toContain(
        d.cms.breadcrumbHome
      );
    }
  );

  it.each(CASES)("15) /%s SSS sayfası → rozet doğru dilde", async (loc, d) => {
    getPageBySlugMock.mockResolvedValue({
      ...EDITORIAL_PAGE,
      slug: "sss",
      title: "Sık Sorulan Sorular",
    });
    await renderRoute(ROUTES[loc], "sss");

    expect(screen.getByTestId("hero-badge-eyebrow").textContent).toBe(
      d.cms.badgeHelpEyebrow
    );
    expect(screen.getByTestId("hero-badge-lines").textContent).toBe(
      d.cms.badgeFaq
    );
  });

  it.each(CASES)(
    "16) /%s gizlilik sayfası → 'Politika & Şartlar' rozeti doğru dilde",
    async (loc, d) => {
      getPageBySlugMock.mockResolvedValue({
        ...EDITORIAL_PAGE,
        slug: "gizlilik-politikasi",
        title: "Gizlilik Politikası",
      });
      await renderRoute(ROUTES[loc], "gizlilik-politikasi");

      expect(screen.getByTestId("hero-badge-lines").textContent).toBe(
        d.cms.badgePolicy
      );
    }
  );

  it.each(CASES)(
    "17) /%s başlık boşsa yedek başlık doğru dilde",
    async (loc, d) => {
      getPageBySlugMock.mockResolvedValue({
        ...EDITORIAL_PAGE,
        slug: "hakkimizda",
        title: null,
      });
      await renderRoute(ROUTES[loc], "hakkimizda");
      expect(
        screen.getByRole("heading", { name: d.cms.fallbackTitle })
      ).toBeTruthy();
    }
  );
});

describe("Phase 12E — boş içerik durumu", () => {
  const CASES = [
    ["tr", tr] as const,
    ["en", en] as const,
    ["de", de] as const,
  ];

  it.each(CASES)("18) /%s → 'İçerik yakında.' doğru dilde", async (loc, d) => {
    getPageBySlugMock.mockResolvedValue({
      ...EDITORIAL_PAGE,
      body: null,
      sections: [],
    });
    await renderRoute(ROUTES[loc]);
    expect(screen.getByText(d.cms.contentComingSoon)).toBeTruthy();
  });
});

describe("Phase 12E — mevcut davranış korunuyor", () => {
  it("19) CMS İÇERİĞİ hâlâ page_translations'tan geliyor", async () => {
    getTranslationMock.mockResolvedValue({
      id: "t-en",
      page_id: PAGE_ID,
      locale: "en",
      title: "An Unforgettable Holiday in Kas",
      excerpt: "EN excerpt",
      body: "EN body",
      seo_title: null,
      seo_description: null,
      created_at: "",
      updated_at: "",
    });
    await renderRoute(ROUTES.en);

    expect(getTranslationMock).toHaveBeenCalledWith("page", PAGE_ID, "en");
    /* İçerik çevirisi + statik UI çevirisi AYNI sayfada, AYRI kaynaklardan. */
    expect(
      screen.getByRole("heading", {
        name: "An Unforgettable Holiday in Kas",
      })
    ).toBeTruthy();
    expect(screen.getByText("EN body")).toBeTruthy();
    expect(screen.getByText(en.cms.breadcrumbHome)).toBeTruthy();
  });

  it("20) TR'de çeviri sorgusu YOK ve statik metinler TR", async () => {
    await renderRoute(ROUTES.tr);
    expect(getTranslationMock).not.toHaveBeenCalled();
    expect(screen.getByText("Ana sayfa")).toBeTruthy();
    expect(screen.getByText("İçerik")).toBeTruthy();
  });
});
