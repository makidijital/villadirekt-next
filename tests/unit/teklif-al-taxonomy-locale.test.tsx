/* ===============================================================
   🛡️ /teklif-al "Tercihleriniz" — TAXONOMY ETİKETİ LOCALE ÇÖZÜMÜ
   ===============================================================
   SORUN (auditte tespit edildi):
   `/en|de/teklif-al` "Tercihleriniz" bölümündeki villa TİPİ ve
   ÖZELLİK chip'leri `/api/public/taxonomies` cevabındaki canonical
   TR `name` alanını render ediyordu. `villa_type_translations` ve
   `villa_feature_translations` (migration 082) DB'de MEVCUT ve
   admin'den girilebiliyor olmasına rağmen bu route onları HİÇ
   okumuyordu.

   ÇÖZÜM: `/api/public/payment-methods` (migration 088) ile BİREBİR
   aynı ADDITIVE desen — route cevabına `name_by_locale` eklenir,
   tüketici `resolveTaxonomyName(name, name_by_locale, locale)` ile
   çözer. Mevcut `name` / `slug` alanları DEĞİŞMEZ.

   ⚠️ BÖLGELER (`locations`) ÇEVRİLMEZ — özel isim (Phase 10I).
=============================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

/* ---------------- Route mock'ları ---------------- */

const findLocationsMock = vi.fn();
vi.mock("@/lib/db/villa-location.repository", () => ({
  villaLocationRepository: {
    findAllForPublicTaxonomy: (...a: unknown[]) => findLocationsMock(...a),
  },
}));

const findTypesMock = vi.fn();
vi.mock("@/lib/db/villa-type.repository", () => ({
  villaTypeRepository: {
    findAllForPublicTaxonomy: (...a: unknown[]) => findTypesMock(...a),
  },
}));

const findFeaturesMock = vi.fn();
vi.mock("@/lib/db/villa-feature.repository", () => ({
  villaFeatureRepository: {
    findAllForPublicTaxonomy: (...a: unknown[]) => findFeaturesMock(...a),
  },
}));

const getCachedSettingsMock = vi.fn();
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: (...a: unknown[]) => getCachedSettingsMock(...a),
}));

const typeNamesMock = vi.fn();
vi.mock("@/lib/i18n/get-villa-type-translations.server", () => ({
  getVillaTypeNamesByLocale: (...a: unknown[]) => typeNamesMock(...a),
}));

const featureNamesMock = vi.fn();
vi.mock("@/lib/i18n/get-villa-feature-translations.server", () => ({
  getVillaFeatureNamesByLocale: (...a: unknown[]) => featureNamesMock(...a),
}));

/* ---------------- Fixtures ---------------- */

const LOCATIONS = [
  { id: "l1", name: "Kalkan", slug: "kalkan", filter_group_name: "Kalkan" },
  { id: "l2", name: "Kaş", slug: "kas", filter_group_name: "Kaş" },
];
const TYPES = [
  { id: "t1", name: "Balayı Villası", slug: "balayi-villasi" },
  { id: "t2", name: "Muhafazakar Villa", slug: "muhafazakar-villa" },
];
const FEATURES = [
  { id: "f1", name: "Korunaklı Havuz" },
  { id: "f2", name: "Deniz Manzarası" },
];

beforeEach(() => {
  vi.clearAllMocks();
  findLocationsMock.mockResolvedValue({ data: LOCATIONS, error: null });
  findTypesMock.mockResolvedValue({ data: TYPES, error: null });
  findFeaturesMock.mockResolvedValue({ data: FEATURES, error: null });
  getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
  typeNamesMock.mockResolvedValue({
    t1: { en: "Honeymoon Villa", de: "Flitterwochen-Villa" },
    t2: { en: "Conservative Villa", de: "Konservative Villa" },
  });
  featureNamesMock.mockResolvedValue({
    f1: { en: "Sheltered Pool", de: "Geschützter Pool" },
    f2: { en: "Sea View", de: "Meerblick" },
  });
});

afterEach(() => cleanup());

async function callRoute() {
  const { GET } = await import("@/app/api/public/taxonomies/route");
  const res = await GET();
  return (await res.json()) as {
    ok: boolean;
    locations: Record<string, unknown>[];
    types: Record<string, unknown>[];
    features: Record<string, unknown>[];
  };
}

/* ===============================================================
   A) ROUTE — ADDITIVE SÖZLEŞME
   =============================================================== */

describe("A) /api/public/taxonomies — additive name_by_locale", () => {
  it("1) mevcut `id` / `name` / `slug` / `filter_group_name` AYNEN döner", async () => {
    const json = await callRoute();

    expect(json.ok).toBe(true);
    for (let i = 0; i < LOCATIONS.length; i++) {
      expect(json.locations[i]).toMatchObject(LOCATIONS[i]);
    }
    for (let i = 0; i < TYPES.length; i++) {
      expect(json.types[i]).toMatchObject(TYPES[i]);
    }
    for (let i = 0; i < FEATURES.length; i++) {
      expect(json.features[i]).toMatchObject(FEATURES[i]);
    }
  });

  it("2) `types` ve `features` satırlarına `name_by_locale` EKLENİR", async () => {
    const json = await callRoute();

    expect(json.types[0].name_by_locale).toEqual({
      en: "Honeymoon Villa",
      de: "Flitterwochen-Villa",
    });
    expect(json.features[1].name_by_locale).toEqual({
      en: "Sea View",
      de: "Meerblick",
    });
  });

  it("3) BÖLGELER çevrilmez — `locations` satırlarında name_by_locale YOK", async () => {
    const json = await callRoute();

    for (const row of json.locations) {
      expect(row).not.toHaveProperty("name_by_locale");
    }
    /* Bölge adı her locale'de canonical kalır (özel isim). */
    expect(json.locations[1].name).toBe("Kaş");
  });

  it("4) çevirisi olmayan satırda boş obje döner (TR fallback'e düşer)", async () => {
    typeNamesMock.mockResolvedValue({ t1: { en: "Honeymoon Villa" } });
    featureNamesMock.mockResolvedValue({});

    const json = await callRoute();

    expect(json.types[0].name_by_locale).toEqual({ en: "Honeymoon Villa" });
    expect(json.types[1].name_by_locale).toEqual({});
    expect(json.features[0].name_by_locale).toEqual({});
    /* Canonical adlar bozulmaz. */
    expect(json.types[1].name).toBe("Muhafazakar Villa");
    expect(json.features[0].name).toBe("Korunaklı Havuz");
  });

  it("5) multilingual_enabled=false → çeviri sorgusu HİÇ atılmaz", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });

    const json = await callRoute();

    expect(typeNamesMock).not.toHaveBeenCalled();
    expect(featureNamesMock).not.toHaveBeenCalled();
    expect(json.types[0].name).toBe("Balayı Villası");
    expect(json.types[0].name_by_locale).toEqual({});
  });

  it("6) çeviri okuma hatası cevabı BOZMAZ (fail-soft)", async () => {
    typeNamesMock.mockRejectedValue(new Error("boom"));

    const json = await callRoute();

    expect(json.ok).toBe(true);
    expect(json.types[0].name).toBe("Balayı Villası");
    expect(json.types[0].name_by_locale).toEqual({});
    expect(json.features[0].name).toBe("Korunaklı Havuz");
  });

  it("7) N+1 YOK — entity başına TEK batch çağrı, TÜM id'lerle", async () => {
    await callRoute();

    expect(typeNamesMock).toHaveBeenCalledTimes(1);
    expect(featureNamesMock).toHaveBeenCalledTimes(1);
    expect(typeNamesMock).toHaveBeenCalledWith(["t1", "t2"]);
    expect(featureNamesMock).toHaveBeenCalledWith(["f1", "f2"]);
  });

  it("8) ADMIN tüketicileri etkilenmez — buildLabelMap yalnız id/name/slug okur", async () => {
    const json = await callRoute();
    const { buildLabelMap } = await import("@/lib/offer-request.humanize");

    const map = buildLabelMap(
      json.types as unknown as { id: string; name: string; slug?: string | null }[]
    );
    /* Admin listesi canonical TR adı görmeye DEVAM eder. */
    expect(map["t1"]).toBe("Balayı Villası");
    expect(map["balayi-villasi"]).toBe("Balayı Villası");
  });
});

/* ===============================================================
   B) FORM — CHIP ETİKETİ LOCALE ÇÖZÜMÜ
   =============================================================== */

vi.mock("react-datepicker", () => ({
  default: () => null,
  registerLocale: () => undefined,
}));

const TAXONOMY_RESPONSE = {
  ok: true,
  locations: LOCATIONS,
  types: [
    { ...TYPES[0], name_by_locale: { en: "Honeymoon Villa", de: "Flitterwochen-Villa" } },
    { ...TYPES[1], name_by_locale: {} },
  ],
  features: [
    { ...FEATURES[0], name_by_locale: { en: "Sheltered Pool", de: "Geschützter Pool" } },
    { ...FEATURES[1], name_by_locale: { en: "Sea View", de: "Meerblick" } },
  ],
};

async function renderForm(locale: "tr" | "en" | "de") {
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      String(url).includes("/api/public/taxonomies")
        ? TAXONOMY_RESPONSE
        : { ok: true },
  }));
  vi.stubGlobal("fetch", fetchMock);

  const { default: OfferRequestForm } = await import(
    "@/app/(public)/teklif-al/OfferRequestForm"
  );
  render(<OfferRequestForm locale={locale} />);
  /* Taxonomy fetch'i tamamlanınca chip'ler render edilir. */
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  return fetchMock;
}

describe("B) /teklif-al chip etiketleri", () => {
  it("9) TR — canonical Türkçe adlar BİREBİR korunur", async () => {
    await renderForm("tr");

    await screen.findByText("Balayı Villası");
    expect(screen.getByText("Muhafazakar Villa")).toBeInTheDocument();
    expect(screen.getByText("Korunaklı Havuz")).toBeInTheDocument();
    expect(screen.getByText("Deniz Manzarası")).toBeInTheDocument();
    /* Bölgeler her locale'de canonical. */
    expect(screen.getByText("Kalkan")).toBeInTheDocument();
  });

  it("10) EN — çeviri VARSA İngilizce etiket görünür", async () => {
    await renderForm("en");

    await screen.findByText("Honeymoon Villa");
    expect(screen.getByText("Sheltered Pool")).toBeInTheDocument();
    expect(screen.getByText("Sea View")).toBeInTheDocument();
    expect(screen.queryByText("Balayı Villası")).toBeNull();
    expect(screen.queryByText("Korunaklı Havuz")).toBeNull();
  });

  it("11) DE — çeviri VARSA Almanca etiket görünür", async () => {
    await renderForm("de");

    await screen.findByText("Flitterwochen-Villa");
    expect(screen.getByText("Geschützter Pool")).toBeInTheDocument();
    expect(screen.getByText("Meerblick")).toBeInTheDocument();
    expect(screen.queryByText("Deniz Manzarası")).toBeNull();
  });

  it("12) EN — çeviri YOKSA canonical TR ad FALLBACK olarak kalır", async () => {
    await renderForm("en");

    await screen.findByText("Honeymoon Villa");
    /* t2'nin `name_by_locale` boş → TR canonical görünür. */
    expect(screen.getByText("Muhafazakar Villa")).toBeInTheDocument();
  });

  it("13) BÖLGE adları EN/DE'de de canonical kalır (özel isim)", async () => {
    await renderForm("de");

    await screen.findByText("Flitterwochen-Villa");
    expect(screen.getByText("Kalkan")).toBeInTheDocument();
    expect(screen.getByText("Kaş")).toBeInTheDocument();
  });

  it("14) taxonomy fetch'i TEK çağrı (N+1 yok)", async () => {
    const fetchMock = await renderForm("en");
    await screen.findByText("Honeymoon Villa");

    const taxonomyCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/public/taxonomies")
    );
    expect(taxonomyCalls).toHaveLength(1);
  });
});

/* ===============================================================
   C) SOURCE-LOCK — payload contract'ı ve hardcoded TR
   =============================================================== */

describe("C) regresyon kilitleri", () => {
  it("15) submit payload token'ı `slug || id` olmaya DEVAM eder (çeviriden etkilenmez)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "app/(public)/teklif-al/OfferRequestForm.tsx",
      "utf8"
    );
    /* Etiket çevrilir ama payload token'ı canonical slug/id kalır. */
    expect(src).toContain("(opt?.slug && opt.slug.trim()) || id");
    expect(src).toContain("region_tokens: state.regions.map((id) =>");
    /* Çevrilmiş ad payload'a SIZMAZ. */
    expect(src).not.toMatch(/tokens:[\s\S]{0,80}name_by_locale/);
  });

  it("16) chip etiketi dictionary DEĞİL, taxonomy resolver'ı ile çözülür", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "app/(public)/teklif-al/OfferRequestForm.tsx",
      "utf8"
    );
    expect(src).toContain("resolveTaxonomyName(");
    /* Ham canonical ad artık DOĞRUDAN render edilmiyor. */
    expect(src).not.toContain("{o.name}");
  });

  it("17) 'Tercihleriniz' başlığı ZATEN dictionary'den geliyor (yeni key açılmadı)", async () => {
    const { getDictionary } = await import("@/lib/i18n/get-dictionary");
    expect(getDictionary("tr").offer.step3Title).toBe("Tercihleriniz");
    expect(getDictionary("en").offer.step3Title).toBe("Your preferences");
    expect(getDictionary("de").offer.step3Title.length).toBeGreaterThan(0);
    expect(getDictionary("de").offer.step3Title).not.toBe("Tercihleriniz");
  });
});
