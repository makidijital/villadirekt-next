/* ===============================================================
   🛡️ ENTITY ÇEVİRİ SIZINTISI — REGRESYON TESTLERİ
   ===============================================================
   İKİNCİ FORENSIC AUDIT'te bulunan İKİ GERÇEK bug'ı kilitler:

     B#1  `/v/[token]` (PrivateVillaPageBody) — `villa.description`,
          mesafe başlıkları, `villa_feature.name`, `rule_item.title`
          ve `price_include_item.title` EN/DE'de canonical TR
          basılıyordu (çeviri tablosu ve batch reader VAR, kullanım
          noktası helper'ı HİÇ ÇAĞIRMIYORDU).

     B#2  `/kisa-sureli-tarihler/...` (ShortGapsPageBody) — sidebar
          villa tipi adları canonical TR basılıyordu (`/arama` ve
          `/kiralik-villalar` aynı sidebar deseninde ÇEVİRİYORDU).

   YÖNTEM — `similar-villas-section.test.tsx` ile AYNI desen:
   GERÇEK component + GERÇEK `getTranslationsForParents` /
   `getVillaTypeNamesByLocale` çalışır; yalnız en alttaki DB
   primitive'i (`translationRepository.findManyForLocale`) ve veri
   servisleri mock'lanır. Bu sayede
     • "TR'de ÇEVİRİ SORGUSU HİÇ ATILMAZ" ve
     • "koleksiyon başına TEK batch sorgu (N+1 YOK)"
   iddiaları GERÇEKTEN kanıtlanabilir.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/* ---------------------------------------------------------------
   Ortak: en alttaki çeviri DB primitive'i (tek mock noktası)
--------------------------------------------------------------- */
const findManyForLocaleMock = vi.fn();
vi.mock("@/lib/db/translation.repository.server", () => ({
  translationRepository: {
    findManyForLocale: (...args: unknown[]) => findManyForLocaleMock(...args),
    findOne: (...args: unknown[]) => findOneMock(...args),
  },
}));
const findOneMock = vi.fn();

/* ---------------------------------------------------------------
   B#1 — PrivateVillaPageBody veri servisleri
--------------------------------------------------------------- */
const VILLA = {
  id: "villa-1",
  slug: "villa-lorien",
  title: "Villa Lorien",
  description: "<p>Kalkan merkeze yakin canonical TR aciklama.</p>",
  location: "Kalkan, Antalya",
  is_active: true,
  bedrooms: 3,
  bathrooms: 2,
  guests: 6,
  price: 12000,
  currency: "TRY",
  cleaning_fee: null,
  cleaning_currency: null,
  cleaning_limit: null,
  deposit: null,
  custom_prepayment_rate: null,
  minimum_stay_nights: null,
  pool_type: "yok",
  indoor_pool: false,
  child_pool: false,
  pool_heating_fee: null,
  pool_heating_currency: null,
  pool_heating_months: null,
  map_type: null,
  map_embed: null,
  latitude: null,
  longitude: null,
  tourism_document_number: null,
  youtube_videos: [],
  about: null,
  calendar: null,
  season: null,
  service: null,
  features: [],
  rules: [],
  distances: [],
};

const DISTANCES = [{ id: "d-1", title: "Plaj", distance: "500 m" }];
const FEATURES = [{ id: "f-1", name: "Ozel Havuz" }];
const RULES = [{ id: "r-1", title: "Evcil hayvan kabul edilmez" }];
const INCLUDES = [{ id: "p-1", title: "Havlu ve nevresim" }];

vi.mock("@/app/services/villa.service", () => ({
  getVillaByPrivateToken: () => Promise.resolve(VILLA),
}));
vi.mock("@/app/services/villa-image/villa-image.read", () => ({
  getVillaImages: () => Promise.resolve([]),
}));
vi.mock("@/app/services/villa-price.service", () => ({
  getVillaPrices: () => Promise.resolve([]),
}));
vi.mock("@/app/services/villa-distance.service", () => ({
  getVillaDistances: () => Promise.resolve(DISTANCES),
}));
vi.mock("@/app/services/villa-feature.service", () => ({
  getVillaFeaturesByVilla: () => Promise.resolve(FEATURES),
}));
vi.mock("@/app/services/rule-item.service", () => ({
  getRuleItemsByVilla: () => Promise.resolve(RULES),
}));
vi.mock("@/app/services/price-include-item.service", () => ({
  getPriceIncludeItemsByVilla: () => Promise.resolve(INCLUDES),
}));
vi.mock("@/app/services/settings.service", () => ({
  getPublicSettings: () => Promise.resolve(null),
}));

/* ---------------------------------------------------------------
   B#2 — ShortGapsPageBody veri servisleri
--------------------------------------------------------------- */
const VILLA_TYPES = [
  { id: "type-1", name: "Balayi Villasi", slug: "balayi-villasi" },
  { id: "type-2", name: "Deniz Manzarali", slug: "deniz-manzarali" },
];
const LOCATIONS = [
  {
    id: "loc-1",
    name: "Kalkan",
    slug: "kalkan",
    show_in_filter: true,
    filter_group_name: null,
  },
];

vi.mock("@/lib/cache.helpers", () => ({
  getCachedVillaTypes: () => Promise.resolve(VILLA_TYPES),
  getCachedVillaLocations: () => Promise.resolve(LOCATIONS),
}));
vi.mock("@/lib/db/short-gaps.repository", () => ({
  shortGapsRepository: {
    findGapsByMonthNights: () => Promise.resolve({ data: [], error: null }),
  },
}));
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findCardsByIds: () => Promise.resolve({ data: [], error: null }),
  },
}));
vi.mock("@/lib/db/villa-type.repository", () => ({
  villaTypeRepository: {
    findVillaIdsByTypeIds: () => Promise.resolve({ data: [], error: null }),
  },
}));

/* ---------------------------------------------------------------
   Next.js / client context stub'ları
--------------------------------------------------------------- */
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt?: string; src?: string }) => (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img alt={alt ?? ""} src={typeof src === "string" ? src : ""} />
  ),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({ currency: "TRY", rates: {} }),
}));

import PrivateVillaPageBody from "@/app/components/private-villa/PrivateVillaPageBody";
import ShortGapsPageBody from "@/app/components/short-gaps/ShortGapsPageBody";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ---------------------------------------------------------------
   Çeviri satırı fixture'ı — entity başına dolu satırlar
--------------------------------------------------------------- */
type Row = Record<string, unknown>;
const TRANSLATIONS: Record<string, Record<string, Row[]>> = {
  villa: {
    en: [{ villa_id: "villa-1", locale: "en", description: "<p>EN description.</p>" }],
    de: [{ villa_id: "villa-1", locale: "de", description: "<p>DE Beschreibung.</p>" }],
  },
  villa_feature: {
    en: [{ feature_id: "f-1", locale: "en", name: "Private Pool" }],
    de: [{ feature_id: "f-1", locale: "de", name: "Privatpool" }],
  },
  rule_item: {
    en: [{ rule_id: "r-1", locale: "en", title: "No pets allowed" }],
    de: [{ rule_id: "r-1", locale: "de", title: "Keine Haustiere" }],
  },
  price_include_item: {
    en: [{ include_id: "p-1", locale: "en", title: "Towels and linen" }],
    de: [{ include_id: "p-1", locale: "de", title: "Handtucher und Bettwasche" }],
  },
  villa_type: {
    en: [{ type_id: "type-1", locale: "en", name: "Honeymoon Villa" }],
    de: [{ type_id: "type-1", locale: "de", name: "Flitterwochen-Villa" }],
  },
};

/** `findManyForLocale(entity, ids, locale)` → dolu fixture. */
function withTranslations() {
  findManyForLocaleMock.mockImplementation(
    (entity: string, _ids: readonly string[], locale: string) =>
      Promise.resolve({
        data: TRANSLATIONS[entity]?.[locale] ?? [],
        error: null,
      })
  );
  findOneMock.mockImplementation(
    (entity: string, _id: string, locale: string) =>
      Promise.resolve({
        data: TRANSLATIONS[entity]?.[locale]?.[0] ?? null,
        error: null,
      })
  );
}

/** Hiç çeviri satırı YOK → canonical TR fallback beklenir. */
function withoutTranslations() {
  findManyForLocaleMock.mockResolvedValue({ data: [], error: null });
  findOneMock.mockResolvedValue({ data: null, error: null });
}

beforeEach(() => {
  findManyForLocaleMock.mockReset();
  findOneMock.mockReset();
  withoutTranslations();
});

async function renderPrivateVilla(locale?: "tr" | "en" | "de") {
  const el = await PrivateVillaPageBody({
    params: Promise.resolve({ token: "tok-1" }),
    searchParams: Promise.resolve({}),
    locale,
  });
  return render(el as React.ReactElement);
}

async function renderShortGaps(locale?: "tr" | "en" | "de") {
  const el = await ShortGapsPageBody({
    params: Promise.resolve({ ay: "haziran", gece: "3" }),
    searchParams: Promise.resolve({}),
    locale,
  });
  return render(el as React.ReactElement);
}

/* ===============================================================
   1) B#1 — /v/[token] entity alanları locale-aware
   =============================================================== */
describe("PrivateVillaPageBody — DB entity alanları locale-aware", () => {
  it("TR: canonical TR değerleri AYNEN gösterilir", async () => {
    withTranslations();
    await renderPrivateVilla("tr");
    expect(screen.getByText("Ozel Havuz")).toBeInTheDocument();
    expect(screen.getByText("Evcil hayvan kabul edilmez")).toBeInTheDocument();
    expect(screen.getByText("Havlu ve nevresim")).toBeInTheDocument();
    expect(screen.getByText("Plaj")).toBeInTheDocument();
    expect(
      screen.getByText(/canonical TR aciklama/)
    ).toBeInTheDocument();
  });

  it("TR: ÇEVİRİ SORGUSU HİÇ ATILMAZ (DEFAULT_LOCALE kısa devresi)", async () => {
    withTranslations();
    await renderPrivateVilla("tr");
    expect(findManyForLocaleMock).not.toHaveBeenCalled();
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it("locale verilmezse TR davranışı (eski çağrılar bozulmaz)", async () => {
    withTranslations();
    await renderPrivateVilla(undefined);
    expect(findManyForLocaleMock).not.toHaveBeenCalled();
    expect(screen.getByText("Ozel Havuz")).toBeInTheDocument();
  });

  it("EN: feature / rule / price-include / mesafe / açıklama EN gösterilir", async () => {
    withTranslations();
    await renderPrivateVilla("en");
    expect(screen.getByText("Private Pool")).toBeInTheDocument();
    expect(screen.getByText("No pets allowed")).toBeInTheDocument();
    expect(screen.getByText("Towels and linen")).toBeInTheDocument();
    /* Mesafe başlığı statik dictionary'den (DB'den DEĞİL). */
    expect(
      screen.getByText(getDictionary("en").distanceLabels["Plaj"])
    ).toBeInTheDocument();
    expect(screen.getByText(/EN description/)).toBeInTheDocument();

    /* Canonical TR karşılıkları DOM'da OLMAMALI. */
    expect(screen.queryByText("Ozel Havuz")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Evcil hayvan kabul edilmez")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Havlu ve nevresim")).not.toBeInTheDocument();
    expect(screen.queryByText(/canonical TR aciklama/)).not.toBeInTheDocument();
  });

  it("DE: feature / rule / price-include / mesafe / açıklama DE gösterilir", async () => {
    withTranslations();
    await renderPrivateVilla("de");
    expect(screen.getByText("Privatpool")).toBeInTheDocument();
    expect(screen.getByText("Keine Haustiere")).toBeInTheDocument();
    expect(screen.getByText("Handtucher und Bettwasche")).toBeInTheDocument();
    expect(
      screen.getByText(getDictionary("de").distanceLabels["Plaj"])
    ).toBeInTheDocument();
    expect(screen.getByText(/DE Beschreibung/)).toBeInTheDocument();
    expect(screen.queryByText("Ozel Havuz")).not.toBeInTheDocument();
  });

  it.each(["en", "de"] as const)(
    "%s: çeviri satırı YOKSA canonical TR fallback gösterilir",
    async (locale) => {
      withoutTranslations();
      await renderPrivateVilla(locale);
      expect(screen.getByText("Ozel Havuz")).toBeInTheDocument();
      expect(
        screen.getByText("Evcil hayvan kabul edilmez")
      ).toBeInTheDocument();
      expect(screen.getByText("Havlu ve nevresim")).toBeInTheDocument();
      expect(screen.getByText(/canonical TR aciklama/)).toBeInTheDocument();
    }
  );

  it("villa ADI her locale'de CANONICAL kalır (özel isim)", async () => {
    withTranslations();
    for (const locale of ["tr", "en", "de"] as const) {
      const { unmount } = await renderPrivateVilla(locale);
      expect(screen.getAllByText("Villa Lorien").length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("EN: koleksiyon başına TEK batch sorgu — N+1 YOK", async () => {
    withTranslations();
    await renderPrivateVilla("en");
    const entities = findManyForLocaleMock.mock.calls.map((c) => c[0]);
    /* villa_feature + rule_item + price_include_item → 3 batch.
       Mesafeler DB'ye HİÇ gitmez (statik dictionary). */
    expect(entities.filter((e) => e === "villa_feature")).toHaveLength(1);
    expect(entities.filter((e) => e === "rule_item")).toHaveLength(1);
    expect(entities.filter((e) => e === "price_include_item")).toHaveLength(1);
    expect(entities.filter((e) => e === "villa_distance")).toHaveLength(0);
    expect(findManyForLocaleMock).toHaveBeenCalledTimes(3);
    /* Açıklama tek satırlık okuma (`findOne`) — kayıt başına değil. */
    expect(findOneMock).toHaveBeenCalledTimes(1);
  });
});

/* ===============================================================
   2) B#2 — ShortGaps sidebar villa tipleri locale-aware
   =============================================================== */
describe("ShortGapsPageBody — sidebar villa tipi adları locale-aware", () => {
  it("TR: canonical villa tipi adları gösterilir", async () => {
    withTranslations();
    await renderShortGaps("tr");
    /* Sidebar iki kez mount olur (desktop aside + mobil drawer) →
       `getAllByText` ile sayıdan bağımsız doğrulanır. */
    expect(screen.getAllByText("Balayi Villasi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Deniz Manzarali").length).toBeGreaterThan(0);
  });

  it("TR: villa tipi çeviri sorgusu HİÇ atılmaz", async () => {
    withTranslations();
    await renderShortGaps("tr");
    expect(
      findManyForLocaleMock.mock.calls.filter((c) => c[0] === "villa_type")
    ).toHaveLength(0);
  });

  it("EN: çevirisi olan tip EN gösterilir", async () => {
    withTranslations();
    await renderShortGaps("en");
    expect(screen.getAllByText("Honeymoon Villa").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Balayi Villasi")).toHaveLength(0);
  });

  it("DE: çevirisi olan tip DE gösterilir", async () => {
    withTranslations();
    await renderShortGaps("de");
    expect(
      screen.getAllByText("Flitterwochen-Villa").length
    ).toBeGreaterThan(0);
    expect(screen.queryAllByText("Balayi Villasi")).toHaveLength(0);
  });

  it.each(["en", "de"] as const)(
    "%s: çevirisi OLMAYAN tip canonical TR kalır (alan bazlı fallback)",
    async (locale) => {
      withTranslations();
      await renderShortGaps(locale);
      /* type-2 fixture'da YOK → canonical ad korunur. */
      expect(screen.getAllByText("Deniz Manzarali").length).toBeGreaterThan(0);
    }
  );

  it.each(["en", "de"] as const)(
    "%s: hiç çeviri satırı yoksa tüm tipler canonical TR kalır",
    async (locale) => {
      withoutTranslations();
      await renderShortGaps(locale);
      expect(screen.getAllByText("Balayi Villasi").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Deniz Manzarali").length).toBeGreaterThan(0);
    }
  );

  it.each(["tr", "en", "de"] as const)(
    "%s: BÖLGE adları CANONICAL kalır (Phase 10I — çevrilmez)",
    async (locale) => {
      withTranslations();
      await renderShortGaps(locale);
      expect(screen.getAllByText("Kalkan").length).toBeGreaterThan(0);
      expect(
        findManyForLocaleMock.mock.calls.filter(
          (c) => c[0] === "villa_location"
        )
      ).toHaveLength(0);
    }
  );

  it("EN: villa tipi çevirisi locale başına TEK batch — N+1 YOK", async () => {
    withTranslations();
    await renderShortGaps("en");
    const typeCalls = findManyForLocaleMock.mock.calls.filter(
      (c) => c[0] === "villa_type"
    );
    /* `getVillaTypeNamesByLocale` en + de için birer batch atar
       (locale-bağımsız harita); tip BAŞINA sorgu YOKTUR. */
    expect(typeCalls).toHaveLength(2);
    for (const call of typeCalls) {
      expect(call[1]).toEqual(["type-1", "type-2"]);
    }
  });
});
