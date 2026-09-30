/* ===============================================================
   🛡️ PHASE 4A — PUBLIC LOCALE ROUTING CORE: ROUTE WIRING TESTS
   ===============================================================
   Bu proje Next.js App Router'ı gerçek bir server ile test etmiyor
   (bkz. mevcut *OrchestrationContract.test.ts deseni — gerçek
   route/DB yerine call-sequence + mock doğrulanıyor). Aynı ruhla:
   her yeni /en/* ve /de/* page.tsx'in

     1) requirePublicLocaleEnabled() gate'ini GERÇEKTEN çağırdığını
        (bypass edilmediğini),
     2) gate geçtiğinde (multilingual_enabled=true senaryosu) doğru
        locale ile LocaleRouteComingSoon render ettiğini,
     3) gate notFound() fırlattığında (multilingual_enabled=false —
        bugünkü production) sayfanın hiçbir ek içerik üretmeden aynı
        şekilde fırlattığını (yutmadığını)

   statik olarak doğrular. Gerçek Next.js route resolution (/en/...
   URL'inin doğru dosyaya eşlenmesi) bu ortamda test edilemez — o
   yalnız `next build`/manuel doğrulama ile teyit edilebilir (bkz.
   nihai rapor).

   Mevcut price-engine / discount / pool-heating / reservation / TR
   route testlerine HİÇ dokunulmadı.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
/* 🛡️ PHASE 10B — GERÇEK (mock'lanmamış) dictionary. Villa detay artık
   ComingSoon yerine gerçek locale metni render ediyor; assertion'lar
   TR hardcoded string yerine BU'ndan okunan gerçek EN/DE değerleriyle
   yapılıyor (dictionary'nin kendi doğruluğu tests/unit/dictionary*.test.ts
   gibi ayrı testlerde zaten doğrulanıyor — burada yalnız page.tsx'in
   doğru anahtarı render ettiği kontrol ediliyor). */
import { getDictionary } from "@/lib/i18n/get-dictionary";

const requirePublicLocaleEnabledMock = vi.fn();
const getVillaBySlugMock = vi.fn();
const getVillaTranslatedDescriptionMock = vi.fn();
/* 🛡️ PHASE 8D-2 — location/features/rules/priceIncludes/distances ham veri
   + batch çeviri (8D-1) + icon-key mock'ları. Gerçek DB/gerçek Türkçe
   anahtar-kelime mantığına gidilmesin diye (bu dosyanın amacı routing/
   render testi — gerçek çeviri/fallback/icon mantığı kendi testlerinde
   ayrıntılı doğrulanıyor, bkz. get-translation.test.ts, translation-
   repository.test.ts) hepsi mock'lanıyor. */
const getVillaDistancesMock = vi.fn();
const getVillaFeaturesByVillaMock = vi.fn();
const getRuleItemsByVillaMock = vi.fn();
const getPriceIncludeItemsByVillaMock = vi.fn();
const getTranslationsForParentsMock = vi.fn();
const getDistanceIconKeyMock = vi.fn();
/* 🛡️ PHASE 10B, Section 9 — EN/DE villa detay artık Gallery/PriceList/
   AvailabilityInlineCalendar/BookingSidebar/MobileBookingCta render ediyor.
   Bu component'lerin page.tsx'te okuduğu YENİ servisler — gerçek DB/network'e
   gidilmesin diye mock'lanıyor (bu dosyanın amacı routing/render testi,
   fiyat/availability/rezervasyon MANTIĞI kendi testlerinde ayrıntılı
   doğrulanıyor, bkz. price.engine/villa-availability.helper testleri). */
const getVillaImagesMock = vi.fn();
const getVillaPricesMock = vi.fn();
const getVillaDiscountsMock = vi.fn();
const fetchExternalCalendarStringsForVillaMock = vi.fn();
const getCachedSettingsMock = vi.fn();
const getCachedVillaReviewStatsMock = vi.fn();
/* 🛡️ PHASE 10G — EN/DE villa detay artık TR ile AYNI gövdeyi
   (VillaDetailBody) render ediyor: yorumlar bölümü + "Benzer Villalar"
   eklendi. İkisi de gerçek DB'ye gitmesin diye mock'lanıyor. */
const getCachedVillaReviewsMock = vi.fn();
const findSimilarCardsMock = vi.fn();

vi.mock("@/lib/i18n/public-locale-gate.server", () => ({
  requirePublicLocaleEnabled: () => requirePublicLocaleEnabledMock(),
}));

/* 🛡️ PHASE 6B — yalnız /en, /de kiralik-villa/[slug] artık villa okuyup
   title çeviriyor. Bu dosyanın amacı routing/gate testi (bkz. üstyazı);
   title-çözümleme mantığının KENDİSİ zaten
   tests/unit/get-villa-translation.test.ts'te ayrıntılı test ediliyor —
   burada yalnız gerçek DB'ye gidilmesin diye mock'lanıyor. */
vi.mock("@/app/services/villa.service", () => ({
  getVillaBySlug: (...args: unknown[]) => getVillaBySlugMock(...args),
}));
vi.mock("@/lib/i18n/get-villa-translation.server", () => ({
  /* 🛡️ PHASE 8B — description helper de aynı modülden export edilir;
     mock'lanmazsa EN/DE villa detay page.tsx'in yeni import'u
     `undefined` alır ve çağrıda TypeError fırlatır. */
  getVillaTranslatedDescription: (...args: unknown[]) =>
    getVillaTranslatedDescriptionMock(...args),
}));

/* 🛡️ PHASE 8D-2 — EN/DE villa detay artık location/distances/features/
   rules/priceIncludes de okuyor (bkz. page.tsx). TR sayfasındaki AYNI 4
   servis + Phase 8D-1'in batch çeviri helper'ı — gerçek DB'ye gidilmesin
   diye mock'lanıyor. */
vi.mock("@/app/services/villa-distance.service", () => ({
  getVillaDistances: (...args: unknown[]) => getVillaDistancesMock(...args),
}));
vi.mock("@/app/services/villa-feature.service", () => ({
  getVillaFeaturesByVilla: (...args: unknown[]) =>
    getVillaFeaturesByVillaMock(...args),
}));
vi.mock("@/app/services/rule-item.service", () => ({
  getRuleItemsByVilla: (...args: unknown[]) => getRuleItemsByVillaMock(...args),
}));
vi.mock("@/app/services/price-include-item.service", () => ({
  getPriceIncludeItemsByVilla: (...args: unknown[]) =>
    getPriceIncludeItemsByVillaMock(...args),
}));
/* 🛡️ PHASE 8D-2 — `getTranslationsForParents` mock'lanır;
   `resolveTranslatedField`'in GERÇEK saf mantığı burada birebir yeniden
   uygulanır (modül tamamen mock'landığı için page.tsx'in gerçek import'u
   gerçek fonksiyona erişemez — bkz. lib/i18n/get-translation.server.ts
   satır 201-209, `vi.importActual` bu dosyada/projede kullanılan bir
   desen değil, bu yüzden yeni bir desen İCAT EDİLMEDİ, mevcut "inline
   mock implementation" convention'ı izlendi). */
vi.mock("@/lib/i18n/get-translation.server", () => ({
  getTranslationsForParents: (...args: unknown[]) =>
    getTranslationsForParentsMock(...args),
  resolveTranslatedField: (
    translatedValue: string | null | undefined,
    parentValue: unknown
  ) =>
    typeof translatedValue === "string" && translatedValue.trim() !== ""
      ? translatedValue
      : parentValue,
}));
/* 🛡️ PHASE 8D-2 — `getDistanceIconKey` TÜRKÇE anahtar kelimeye bağlı
   (bkz. lib/distance.helper.ts); bu dosyanın amacı o eşleme mantığını
   test etmek DEĞİL (routing/render testi) — yalnız page.tsx'in bu
   fonksiyonu HANGİ ARGÜMANLA çağırdığını (orijinal TR title mi, çevrilmiş
   displayTitle mi) doğrulamak için mock'lanıyor. */
vi.mock("@/lib/distance.helper", () => ({
  getDistanceIconKey: (...args: unknown[]) => getDistanceIconKeyMock(...args),
  /* 🛡️ PHASE 10D BATCH 4 — `lib/distance-label.helper.ts` bu modülden
     `isCanonicalDistanceTitle` import ediyor; modül TAMAMEN mock'landığı
     için gerçek fonksiyona erişemiyor (page.tsx artık villa_distance
     title'ını bu helper üzerinden çözüyor). Mevcut "inline mock
     implementation" convention'ı (bkz. yukarıdaki
     getTranslationsForParents mock yorumu) izlenerek GERÇEK, saf mantık
     burada birebir yeniden uygulandı — 12 canonical title listesi
     lib/distance.helper.ts'teki DISTANCE_OPTIONS ile AYNI (bu dosyanın
     kendi senkronizasyonu tests/unit/distance-label.helper.test.ts'te,
     GERÇEK modülle, ayrıca doğrulanıyor). */
  isCanonicalDistanceTitle: (t: string | null | undefined) => {
    if (!t) return false;
    const DISTANCE_OPTIONS = [
      "Restoran",
      "Market",
      "Plaj",
      "Deniz",
      "Şehir Merkezi",
      "Havaalanı (Antalya)",
      "Havaalanı (Dalaman)",
      "Otobüs Terminali",
      "Sağlık Merkezi",
      "Eczane",
      "Benzin İstasyonu",
      "Okul",
    ];
    return DISTANCE_OPTIONS.includes(String(t).trim());
  },
}));

/* 🛡️ PHASE 10B, Section 9 */
vi.mock("@/app/services/villa-image/villa-image.read", () => ({
  getVillaImages: (...args: unknown[]) => getVillaImagesMock(...args),
}));
vi.mock("@/app/services/villa-price.service", () => ({
  getVillaPrices: (...args: unknown[]) => getVillaPricesMock(...args),
}));
vi.mock("@/app/services/villa-discount.service", () => ({
  getVillaDiscounts: (...args: unknown[]) => getVillaDiscountsMock(...args),
}));
vi.mock("@/lib/external-calendar.public.helper", () => ({
  fetchExternalCalendarStringsForVilla: (...args: unknown[]) =>
    fetchExternalCalendarStringsForVillaMock(...args),
  /* 🛡️ Gerçek (mock'lanmamış) sabit değer — `EMPTY_EXTERNAL_STRING_ARRAYS`
     saf bir `Object.freeze` sabiti (network/DB YOK), page.tsx'in `.catch()`
     fallback'inde kullandığı DEĞERLE birebir aynı olması gerekiyor. */
  EMPTY_EXTERNAL_STRING_ARRAYS: Object.freeze({
    checkin: [],
    checkout: [],
    middle: [],
  }),
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: (...args: unknown[]) => getCachedSettingsMock(...args),
  getCachedVillaReviewStats: (...args: unknown[]) =>
    getCachedVillaReviewStatsMock(...args),
  getCachedVillaReviews: (...args: unknown[]) =>
    getCachedVillaReviewsMock(...args),
}));
/* 🛡️ PHASE 10G — `SimilarVillasSection` KENDİ verisini çeker (server-only
   native repo). Bu dosyanın amacı routing/render testi; "benzer villa"
   seçim mantığı bu fazda DEĞİŞMEDİ — yalnız gerçek DB'ye gidilmesin diye
   mock'lanıyor. Boş sonuç → component null döner (mevcut davranış). */
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findSimilarCards: (...args: unknown[]) => findSimilarCardsMock(...args),
  },
}));
/* 🛡️ PHASE 10G — `SimilarVillasSection` ASYNC bir server component'tir;
   jsdom/testing-library client render'ında async component suspend eder ve
   TÜM ağaç boş kalır (Next.js RSC runtime'ında böyle bir sorun YOKTUR).
   Bu dosyanın amacı sayfa gövdesinin render'ı olduğu için component senkron
   bir stub ile mock'lanır; GERÇEK component (locale-prefixed href, çevrilmiş
   başlık/lokasyon, canonical villa adı) kendi testinde doğrulanır:
   tests/unit/similar-villas-section.test.tsx */
vi.mock("@/app/components/villa/SimilarVillasSection", () => ({
  default: (props: { villaId: string; locationId: string | null; locale?: string }) => (
    <div
      data-testid="similar-villas-section"
      data-villa-id={props.villaId}
      data-locale={props.locale ?? "tr"}
    />
  ),
}));

beforeEach(() => {
  requirePublicLocaleEnabledMock.mockReset();
  getVillaBySlugMock.mockReset();
  getVillaTranslatedDescriptionMock.mockReset();
  /* 🛡️ PHASE 8D-2 */
  getVillaDistancesMock.mockReset();
  getVillaFeaturesByVillaMock.mockReset();
  getRuleItemsByVillaMock.mockReset();
  getPriceIncludeItemsByVillaMock.mockReset();
  getTranslationsForParentsMock.mockReset();
  getDistanceIconKeyMock.mockReset();
  /* 🛡️ PHASE 10B, Section 9 */
  getVillaImagesMock.mockReset();
  getVillaPricesMock.mockReset();
  getVillaDiscountsMock.mockReset();
  fetchExternalCalendarStringsForVillaMock.mockReset();
  getCachedSettingsMock.mockReset();
  getCachedVillaReviewStatsMock.mockReset();
  getCachedVillaReviewsMock.mockReset();
  findSimilarCardsMock.mockReset();
  /* Varsayılan: boş koleksiyonlar / nötr ayarlar — TR route'larını (bu
     servisleri hiç çağırmayan) ETKİLEMEZ; yalnız EN/DE villa detay
     testlerinin sayfayı çökertmeden render etmesini sağlar. İlgili
     testler kendi ihtiyacına göre override eder. */
  getVillaImagesMock.mockResolvedValue([]);
  getVillaPricesMock.mockResolvedValue([]);
  getVillaDiscountsMock.mockResolvedValue([]);
  fetchExternalCalendarStringsForVillaMock.mockResolvedValue({
    checkin: [],
    checkout: [],
    middle: [],
  });
  getCachedSettingsMock.mockResolvedValue({});
  getCachedVillaReviewStatsMock.mockResolvedValue({ count: 0, average: 0 });
  getCachedVillaReviewsMock.mockResolvedValue([]);
  findSimilarCardsMock.mockResolvedValue({ data: [], error: null });
  getVillaBySlugMock.mockResolvedValue({
    id: "test-villa-id",
    slug: "test-villa",
    title: "Test Villa Title",
    /* 🛡️ PHASE 8B — description artık EN/DE villa detay page.tsx'te
       okunuyor; VillaDTO.description zorunlu (non-optional) bir
       string olduğu için mock'ta da sağlanmalı (aksi halde
       description.trim() undefined üzerinde çağrılıp TypeError atar). */
    description: "<p>Test villa description.</p>",
    /* 🛡️ PHASE 8D-2 — VillaInfoBar + location çözümü için gereken alanlar.
       location_id varsayılan olarak null: mevcut (Phase 4A/8B) testler
       location çeviri sorgusu HİÇ atılmadan geçmeli (audit hedefi:
       "location_id null ise villa_location sorgusu hiç atılmaz"). */
    location: "Bodrum, Muğla",
    location_id: null as string | null,
    guests: 6,
    bedrooms: 3,
    bathrooms: 2,
    tourism_document_number: null as string | null,
  });
  /* 🛡️ PHASE 8D-2 — varsayılan: boş koleksiyonlar + boş çeviri Map'i
     (TR fallback olmadan da sayfa çökmemeli — bkz. "empty collections"
     testi). İlgili testler kendi ihtiyacına göre override eder. */
  getVillaDistancesMock.mockResolvedValue([]);
  getVillaFeaturesByVillaMock.mockResolvedValue([]);
  getRuleItemsByVillaMock.mockResolvedValue([]);
  getPriceIncludeItemsByVillaMock.mockResolvedValue([]);
  getTranslationsForParentsMock.mockResolvedValue(new Map());
  getDistanceIconKeyMock.mockReturnValue("pin");
  /* 🛡️ PHASE 8B — description için de AYNI echo deseni (varsayılan);
     description-spesifik testler bunu kendi ihtiyacına göre override eder. */
  getVillaTranslatedDescriptionMock.mockImplementation(
    (_villaId: string, originalDescription: string) =>
      Promise.resolve(originalDescription)
  );
});

/* 🛡️ PHASE 6B — kiralik-villa/[slug] route'ları artık `params` (slug)
   okuyor; testte sabit bir slug ile Promise geçiriyoruz. Diğer 6 route
   hâlâ hiç prop almıyor (PHASE 4A ile birebir). */
const VILLA_PAGE_PROPS = { params: Promise.resolve({ slug: "test-villa" }) };

/* 🛡️ PHASE 10G — villa detay gövdesi artık TR ile AYNI: sezon fiyatları,
   takvim, mesafeler ve özellikler `VillaDetailTabs` içinde TEK AKTİF PANEL
   olarak render ediliyor (varsayılan sekme "fiyatlar"). Aktif olmayan
   sekmelerin içeriği DOM'da HİÇ YOKTUR (component'in kendi kontratı:
   "tıklanan tab'ın content'i görünür, diğerleri DOM'dan kalkar") — bu TR
   sayfasının BUGÜNKÜ davranışıdır, test için DEĞİŞTİRİLMEDİ. Bu yüzden
   ilgili assertion'lardan önce sekme GERÇEKTEN tıklanır. */
function openVillaTab(
  locale: "en" | "de",
  tab: "prices" | "availability" | "location" | "features"
) {
  const dict = getDictionary(locale);
  fireEvent.click(screen.getByRole("button", { name: dict.villaTabs[tab] }));
}

/* 🛡️ ComingSoon placeholder'ı KALAN public locale route'u YOK —
   `/en|de/kiralik-villalar` (ARCHIVE_GATE_ROUTES), `/en|de/arama`
   (SEARCH_GATE_ROUTES), `/en|de/iletisim` (CONTACT_GATE_ROUTES),
   `/en|de/kiralik-villa/[slug]` (VILLA_DETAIL_GATE_ROUTES) ve
   `/en|de/rezervasyon/*` (RESERVATION_GATE_ROUTES /
   RESERVATION_SUCCESS_GATE_ROUTES) gerçek gövdeleri render ediyor.
   Gate sözleşmesi (gate çağrısı + notFound propagate) HEPSİNDE AYNI.
   `LocaleRouteComingSoon` component'inin kendi testi
   `tests/unit/LocaleRouteComingSoon.test.tsx` içinde DURUYOR. */

/* 🛡️ Rezervasyon route'ları (/rezervasyon/[slug]): gate sözleşmesi
   AYNEN, içerik assertion'ı ortak `ReservationPageBody` + locale
   prop'u. `params` ve `searchParams` Promise'leri sayfaya AYNEN
   geçirilir (URL/slug kontratı DEĞİŞMEDİ). */
const RESERVATION_GATE_ROUTES: Array<
  [string, "en" | "de", Record<string, unknown>]
> = [
  [
    "@/app/(public)/en/rezervasyon/[slug]/page",
    "en",
    {
      params: Promise.resolve({ slug: "test-villa" }),
      searchParams: Promise.resolve({}),
    },
  ],
  [
    "@/app/(public)/de/rezervasyon/[slug]/page",
    "de",
    {
      params: Promise.resolve({ slug: "test-villa" }),
      searchParams: Promise.resolve({}),
    },
  ],
];

/* 🛡️ Rezervasyon başarılı route'ları (/rezervasyon/basarili): gate
   sözleşmesi AYNEN, içerik assertion'ı ortak `ReservationSuccessBody`
   + locale prop'u. `searchParams` (ref/villa) AYNEN geçirilir. */
const RESERVATION_SUCCESS_GATE_ROUTES: Array<
  [string, "en" | "de", Record<string, unknown>]
> = [
  [
    "@/app/(public)/en/rezervasyon/basarili/page",
    "en",
    { searchParams: Promise.resolve({}) },
  ],
  [
    "@/app/(public)/de/rezervasyon/basarili/page",
    "de",
    { searchParams: Promise.resolve({}) },
  ],
];

/* 🛡️ PHASE 13 — arama route'ları: gate sözleşmesi AYNEN, içerik
   assertion'ı ComingSoon yerine ortak `AramaPageBody` + locale prop'u.
   `searchParams` Promise'i sayfaya AYNEN geçirilir (URL kontratı). */
const SEARCH_GATE_ROUTES: Array<
  [string, "en" | "de", Record<string, unknown>]
> = [
  [
    "@/app/(public)/en/arama/page",
    "en",
    { searchParams: Promise.resolve({}) },
  ],
  [
    "@/app/(public)/de/arama/page",
    "de",
    { searchParams: Promise.resolve({}) },
  ],
];

/* 🛡️ Arşiv route'ları (/kiralik-villalar): gate sözleşmesi AYNEN,
   içerik assertion'ı ComingSoon yerine ortak `KiralikVillalarPageBody`
   + locale prop'u. `searchParams` Promise'i sayfaya AYNEN geçirilir
   (URL kontratı DEĞİŞMEDİ). */
const ARCHIVE_GATE_ROUTES: Array<
  [string, "en" | "de", Record<string, unknown>]
> = [
  [
    "@/app/(public)/en/kiralik-villalar/page",
    "en",
    { searchParams: Promise.resolve({}) },
  ],
  [
    "@/app/(public)/de/kiralik-villalar/page",
    "de",
    { searchParams: Promise.resolve({}) },
  ],
];

describe.each(ARCHIVE_GATE_ROUTES)("%s", (modulePath, locale, pageProps) => {
  it(`gate geçtiğinde ortak KiralikVillalarPageBody'yi locale="${locale}" ile render eder`, async () => {
    requirePublicLocaleEnabledMock.mockResolvedValue(undefined);

    const { default: Page } = await import(modulePath);
    const { default: KiralikVillalarPageBody } = await import(
      "@/app/components/search/KiralikVillalarPageBody"
    );
    const element = await Page(pageProps);

    expect(requirePublicLocaleEnabledMock).toHaveBeenCalledTimes(1);
    expect(element.type).toBe(KiralikVillalarPageBody);
    expect(element.props.locale).toBe(locale);
    expect(element.props.searchParams).toBe(pageProps.searchParams);
  });

  it("gate notFound() fırlattığında sayfa bunu YUTMAZ (aynen propagate eder)", async () => {
    requirePublicLocaleEnabledMock.mockRejectedValue(
      new Error("NEXT_NOT_FOUND")
    );

    const { default: Page } = await import(modulePath);

    await expect(Page(pageProps)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

/* 🛡️ İletişim route'ları (/iletisim): gate sözleşmesi AYNEN, içerik
   assertion'ı ortak `ContactPageBody` + locale prop'u. Sayfa prop
   ALMAZ (searchParams yok). */
const CONTACT_GATE_ROUTES: Array<[string, "en" | "de"]> = [
  ["@/app/(public)/en/iletisim/page", "en"],
  ["@/app/(public)/de/iletisim/page", "de"],
];

describe.each(CONTACT_GATE_ROUTES)("%s", (modulePath, locale) => {
  it(`gate geçtiğinde ortak ContactPageBody'yi locale="${locale}" ile render eder`, async () => {
    requirePublicLocaleEnabledMock.mockResolvedValue(undefined);

    const { default: Page } = await import(modulePath);
    const { default: ContactPageBody } = await import(
      "@/app/components/contact/ContactPageBody"
    );
    const element = await Page();

    expect(requirePublicLocaleEnabledMock).toHaveBeenCalledTimes(1);
    expect(element.type).toBe(ContactPageBody);
    expect(element.props.locale).toBe(locale);
  });

  it("gate notFound() fırlattığında sayfa bunu YUTMAZ (aynen propagate eder)", async () => {
    requirePublicLocaleEnabledMock.mockRejectedValue(
      new Error("NEXT_NOT_FOUND")
    );

    const { default: Page } = await import(modulePath);

    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

/* 🛡️ PHASE 10B, Section 9 — villa detay artık ComingSoon'un YERİNE
   gerçek Gallery/PriceList/AvailabilityInlineCalendar/BookingSidebar/
   MobileBookingCta render ediyor (PHASE 10B IMPLEMENTATION talimatının
   AÇIK hedefi). Gate davranışı (requirePublicLocaleEnabled çağrısı +
   notFound() propagate) YUKARIDAKİ route'larla BİREBİR aynı kaldığı
   için AYRI bir route grubu + AYRI describe.each ile test ediliyor —
   yalnız "ComingSoon metni var" assertion'ı bu route'lar için ARTIK
   GEÇERSİZ (bkz. aşağıda). */
const VILLA_DETAIL_GATE_ROUTES: Array<
  [string, "en" | "de", Record<string, unknown> | undefined]
> = [
  ["@/app/(public)/en/kiralik-villa/[slug]/page", "en", VILLA_PAGE_PROPS],
  ["@/app/(public)/de/kiralik-villa/[slug]/page", "de", VILLA_PAGE_PROPS],
];

describe.each(RESERVATION_GATE_ROUTES)(
  "%s",
  (modulePath, locale, pageProps) => {
    it(`gate geçtiğinde ortak ReservationPageBody'yi locale="${locale}" ile render eder`, async () => {
      requirePublicLocaleEnabledMock.mockResolvedValue(undefined);

      const { default: Page } = await import(modulePath);
      const { default: ReservationPageBody } = await import(
        "@/app/components/reservation/ReservationPageBody"
      );
      const element = await Page(pageProps);

      expect(requirePublicLocaleEnabledMock).toHaveBeenCalledTimes(1);
      expect(element.type).toBe(ReservationPageBody);
      expect(element.props.locale).toBe(locale);
      expect(element.props.params).toBe(pageProps.params);
      expect(element.props.searchParams).toBe(pageProps.searchParams);
    });

    it("gate notFound() fırlattığında sayfa bunu YUTMAZ (aynen propagate eder)", async () => {
      requirePublicLocaleEnabledMock.mockRejectedValue(
        new Error("NEXT_NOT_FOUND")
      );

      const { default: Page } = await import(modulePath);

      await expect(Page(pageProps)).rejects.toThrow("NEXT_NOT_FOUND");
    });
  }
);

describe.each(RESERVATION_SUCCESS_GATE_ROUTES)(
  "%s",
  (modulePath, locale, pageProps) => {
    it(`gate geçtiğinde ortak ReservationSuccessBody'yi locale="${locale}" ile render eder`, async () => {
      requirePublicLocaleEnabledMock.mockResolvedValue(undefined);

      const { default: Page } = await import(modulePath);
      const { default: ReservationSuccessBody } = await import(
        "@/app/components/reservation/ReservationSuccessBody"
      );
      const element = await Page(pageProps);

      expect(requirePublicLocaleEnabledMock).toHaveBeenCalledTimes(1);
      expect(element.type).toBe(ReservationSuccessBody);
      expect(element.props.locale).toBe(locale);
      expect(element.props.searchParams).toBe(pageProps.searchParams);
    });

    it("gate notFound() fırlattığında sayfa bunu YUTMAZ (aynen propagate eder)", async () => {
      requirePublicLocaleEnabledMock.mockRejectedValue(
        new Error("NEXT_NOT_FOUND")
      );

      const { default: Page } = await import(modulePath);

      await expect(Page(pageProps)).rejects.toThrow("NEXT_NOT_FOUND");
    });
  }
);

describe.each(SEARCH_GATE_ROUTES)("%s", (modulePath, locale, pageProps) => {
  it(`gate geçtiğinde ortak AramaPageBody'yi locale="${locale}" ile render eder`, async () => {
    requirePublicLocaleEnabledMock.mockResolvedValue(undefined);

    const { default: Page } = await import(modulePath);
    const { default: AramaPageBody } = await import(
      "@/app/components/search/AramaPageBody"
    );
    const element = await Page(pageProps);

    expect(requirePublicLocaleEnabledMock).toHaveBeenCalledTimes(1);
    expect(element.type).toBe(AramaPageBody);
    expect(element.props.locale).toBe(locale);
    /* searchParams AYNEN aktarılır — URL query kontratı değişmedi. */
    expect(element.props.searchParams).toBe(pageProps.searchParams);
  });

  it("gate notFound() fırlattığında sayfa bunu YUTMAZ (aynen propagate eder)", async () => {
    requirePublicLocaleEnabledMock.mockRejectedValue(
      new Error("NEXT_NOT_FOUND")
    );

    const { default: Page } = await import(modulePath);

    await expect(Page(pageProps)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

/* 🛡️ PHASE 10B, Section 9 — villa detay için AYNI iki test (gate
   çağrısı + notFound propagate), yalnız "içerik" assertion'ı ComingSoon
   yerine GERÇEK (mock'lanmamış getDictionary'den okunan) booking CTA
   metnine bakıyor — hem BookingSidebar'ın hem MobileBookingCta'nın
   "Rezervasyon Yap/Book Now/Jetzt Buchen" metnini paylaştığı biliniyor
   (bkz. dictionary), bu yüzden getAllByText + length>0. */
describe.each(VILLA_DETAIL_GATE_ROUTES)(
  "%s",
  (modulePath, locale, pageProps) => {
    it(`gate geçtiğinde (multilingual_enabled=true) locale="${locale}" ile GERÇEK villa detay render eder (ComingSoon YOK)`, async () => {
      requirePublicLocaleEnabledMock.mockResolvedValue(undefined);

      const { default: Page } = await import(modulePath);
      const element = await Page(pageProps);
      render(element);

      expect(requirePublicLocaleEnabledMock).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByText(/this page isn't translated yet/i)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/diese seite ist noch nicht übersetzt/i)
      ).not.toBeInTheDocument();
      const dict = getDictionary(locale);
      expect(
        screen.getAllByText(dict.booking.bookNow).length
      ).toBeGreaterThan(0);
    });

    it("gate notFound() fırlattığında sayfa bunu YUTMAZ (aynen propagate eder)", async () => {
      requirePublicLocaleEnabledMock.mockRejectedValue(
        new Error("NEXT_NOT_FOUND")
      );

      const { default: Page } = await import(modulePath);

      await expect(Page(pageProps)).rejects.toThrow("NEXT_NOT_FOUND");
    });
  }
);

/* ===============================================================
   🛡️ PHASE 8B — EN/DE villa detay: description overlay page-body testleri
   ===============================================================
   Yalnız `kiralik-villa/[slug]` route'larını (villa okuyan tek EN/DE
   route grubu) hedefler. `getVillaTranslatedDescription` yukarıdaki
   mock ile sarılı — GERÇEK çeviri/fallback mantığı burada test
   edilmiyor (bkz. get-villa-translation.test.ts); burada yalnız
   page.tsx'in resolve edilen description'ı doğru şekilde
   `CollapsibleDescription`'a/fallback'e ilettiği doğrulanıyor.
   =============================================================== */
const VILLA_DETAIL_ROUTES: Array<[string, "en" | "de"]> = [
  ["@/app/(public)/en/kiralik-villa/[slug]/page", "en"],
  ["@/app/(public)/de/kiralik-villa/[slug]/page", "de"],
];

describe.each(VILLA_DETAIL_ROUTES)(
  "%s — Phase 8B description overlay",
  (modulePath, locale) => {
    beforeEach(() => {
      requirePublicLocaleEnabledMock.mockResolvedValue(undefined);
    });

    it("8) çevrilmiş description CollapsibleDescription'a (sanitize edilmiş HTML olarak) geçer", async () => {
      getVillaTranslatedDescriptionMock.mockResolvedValue(
        `<p>Resolved ${locale} description.</p>`
      );

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(
        screen.getByText(`Resolved ${locale} description.`)
      ).toBeInTheDocument();
      expect(getVillaTranslatedDescriptionMock).toHaveBeenCalledWith(
        "test-villa-id",
        "<p>Test villa description.</p>",
        locale
      );
    });

    it("8b) sanitize mekanizması korunuyor — çeviri HTML'i içinde script/tehlikeli attribute varsa render'a SIZMAZ", async () => {
      getVillaTranslatedDescriptionMock.mockResolvedValue(
        '<p onclick="alert(1)">Safe text</p><script>alert(2)</script>'
      );

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      const { container } = render(element);

      expect(screen.getByText("Safe text")).toBeInTheDocument();
      /* 🛡️ PHASE 10B, Section 10 — villa detay artık MEŞRU bir
         `<script type="application/ld+json">` (JsonLd/StructuredData)
         render ediyor; "sayfada HİÇ <script> yok" assertion'ı artık
         YANLIŞ POZİTİF verir. Doğru/daha KESKİN kontrol: XSS payload'ının
         (`alert(2)`) DOM'un HİÇBİR yerinde (JSON-LD içinde bile,
         string olarak) GÖRÜNMEMESİ — sanitizeHtml'in description'dan
         gerçekten temizlediğinin kanıtı. */
      expect(container.innerHTML).not.toContain("alert(2)");
      expect(container.innerHTML).not.toContain("onclick");
    });

    it("9) resolved description boş/whitespace → locale-aware fallback (Phase 10B — artık dictionary'den, TR hardcoded metin DEĞİL)", async () => {
      getVillaTranslatedDescriptionMock.mockResolvedValue("   ");

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      const dict = getDictionary(locale);
      expect(
        screen.getByText(dict.villa.descriptionEmpty)
      ).toBeInTheDocument();
    });
  }
);

/* ===============================================================
   🛡️ PHASE 8D-2 — EN/DE villa detay: location/distances/features/
   priceIncludes/rules page-body testleri
   ===============================================================
   Yalnız `kiralik-villa/[slug]` route'larını hedefler.
   `getTranslationsForParents`/`resolveTranslatedField`/servis
   fonksiyonları/`getDistanceIconKey` yukarıda mock'lı — GERÇEK
   çeviri/fallback/icon-eşleme mantığı burada test edilmiyor (bkz.
   get-translation.test.ts, translation-repository.test.ts,
   lib/distance.helper.ts'in kendi testleri); burada yalnız page.tsx'in
   resolve edilen değerleri doğru prop'larla ilgili component'lere
   ilettiği + N+1 YAPMADIĞI + icon key'i HER ZAMAN orijinal (TR)
   title'dan hesapladığı doğrulanıyor. */
describe.each(VILLA_DETAIL_ROUTES)(
  "%s — Phase 8D-2 location/distances/features/rules/priceIncludes",
  (modulePath, locale) => {
    beforeEach(() => {
      requirePublicLocaleEnabledMock.mockResolvedValue(undefined);
    });

    /* 🛡️ PHASE 10I — BÖLGE ADLARI ÇEVRİLMEZ (özel isim). Bu test, eski
       "çeviri varsa çevrilmiş değeri göster" davranışının TERSİNİ kilitler:
       DB'de bir `villa_location` çevirisi BULUNSA BİLE sayfa canonical
       `villa.location` göstermeli ve çeviri sorgusu HİÇ atılmamalı. */
    it("10) 🛡️ PHASE 10I — çeviri KAYDI OLSA BİLE canonical bölge adı gösterilir, sorgu atılmaz", async () => {
      getVillaBySlugMock.mockResolvedValue({
        id: "test-villa-id",
        slug: "test-villa",
        title: "Test Villa Title",
        description: "<p>Test villa description.</p>",
        location: "Orijinal TR Konum",
        location_id: "loc-1",
        guests: 6,
        bedrooms: 3,
        bathrooms: 2,
        tourism_document_number: null,
      });
      getTranslationsForParentsMock.mockImplementation((entity: string) => {
        if (entity === "villa_location") {
          return Promise.resolve(
            new Map([["loc-1", { name: `Translated location (${locale})` }]])
          );
        }
        return Promise.resolve(new Map());
      });

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      /* Canonical TR bölge adı — çeviri satırı mock'ta DOLU olmasına rağmen. */
      expect(screen.getByText("Orijinal TR Konum")).toBeInTheDocument();
      expect(
        screen.queryByText(`Translated location (${locale})`)
      ).not.toBeInTheDocument();
      /* `villa_location` entity'si registry'den kaldırıldı → sorgu YOK. */
      expect(getTranslationsForParentsMock).not.toHaveBeenCalledWith(
        "villa_location",
        expect.anything(),
        expect.anything()
      );
    });

    it("11) location_id DOLU + çeviri yok → canonical villa.location gösterilir", async () => {
      getVillaBySlugMock.mockResolvedValue({
        id: "test-villa-id",
        slug: "test-villa",
        title: "Test Villa Title",
        description: "<p>Test villa description.</p>",
        location: "Orijinal TR Konum (çeviri yok)",
        location_id: "loc-2",
        guests: 6,
        bedrooms: 3,
        bathrooms: 2,
        tourism_document_number: null,
      });
      /* getTranslationsForParentsMock varsayılan (beforeEach'ten) boş Map
         döner — loc-2 için çeviri YOK. */

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(
        screen.getByText("Orijinal TR Konum (çeviri yok)")
      ).toBeInTheDocument();
    });

    it("12) location_id null ise de canonical villa.location kullanılır, çeviri sorgusu atılmaz", async () => {
      /* beforeEach'in varsayılan villa mock'u zaten location_id: null. */
      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(screen.getByText("Bodrum, Muğla")).toBeInTheDocument();
      expect(getTranslationsForParentsMock).not.toHaveBeenCalledWith(
        "villa_location",
        expect.anything(),
        expect.anything()
      );
    });

    it("13) features: çevirisi olan çevrilmiş isimle, olmayan orijinal TR isimle render edilir", async () => {
      getVillaFeaturesByVillaMock.mockResolvedValue([
        { id: "f1", name: "Deniz Manzarası" },
        { id: "f2", name: "Havuz" },
      ]);
      getTranslationsForParentsMock.mockImplementation((entity: string) => {
        if (entity === "villa_feature") {
          return Promise.resolve(
            new Map([["f1", { name: `Sea View (${locale})` }]])
          );
        }
        return Promise.resolve(new Map());
      });

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);
      openVillaTab(locale, "features");

      expect(screen.getByText(`Sea View (${locale})`)).toBeInTheDocument();
      expect(screen.getByText("Havuz")).toBeInTheDocument();
    });

    it("14) rules: çevirisi olan çevrilmiş başlıkla, olmayan orijinal TR başlıkla render edilir", async () => {
      getRuleItemsByVillaMock.mockResolvedValue([
        { id: "r1", title: "Evcil hayvan kabul edilmez" },
        { id: "r2", title: "Sigara içilmez" },
      ]);
      getTranslationsForParentsMock.mockImplementation((entity: string) => {
        if (entity === "rule_item") {
          return Promise.resolve(
            new Map([["r1", { title: `No pets allowed (${locale})` }]])
          );
        }
        return Promise.resolve(new Map());
      });

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(
        screen.getByText(`No pets allowed (${locale})`)
      ).toBeInTheDocument();
      expect(screen.getByText("Sigara içilmez")).toBeInTheDocument();
    });

    it("15) priceIncludes: çevirisi olan çevrilmiş başlıkla, olmayan orijinal TR başlıkla render edilir", async () => {
      getPriceIncludeItemsByVillaMock.mockResolvedValue([
        { id: "p1", title: "Temizlik dahil" },
        { id: "p2", title: "Havlu ve nevresim dahil" },
      ]);
      getTranslationsForParentsMock.mockImplementation((entity: string) => {
        if (entity === "price_include_item") {
          return Promise.resolve(
            new Map([["p1", { title: `Cleaning included (${locale})` }]])
          );
        }
        return Promise.resolve(new Map());
      });

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(
        screen.getByText(`Cleaning included (${locale})`)
      ).toBeInTheDocument();
      expect(screen.getByText("Havlu ve nevresim dahil")).toBeInTheDocument();
    });

    it("16) 🛡️ PHASE 10D BATCH 4 — distance TITLE dictionary üzerinden locale'e göre çevrilir, distance DEĞERİ HİÇBİR ZAMAN çevrilmez", async () => {
      getVillaDistancesMock.mockResolvedValue([
        {
          id: "d1",
          villa_id: "test-villa-id",
          title: "Plaj",
          distance: "300 m",
          created_at: "",
        },
        {
          id: "d2",
          villa_id: "test-villa-id",
          title: "Market",
          distance: "150 m",
          created_at: "",
        },
        /* d3: legacy/custom (canonical DEĞİL) title — dictionary'de
           ARANMAZ, olduğu gibi render edilmeli. */
        {
          id: "d3",
          villa_id: "test-villa-id",
          title: "Eski Özel Mesafe",
          distance: "2 km",
          created_at: "",
        },
      ]);

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);
      openVillaTab(locale, "location");

      const dict = getDictionary(locale);
      expect(
        screen.getByText(dict.distanceLabels["Plaj"])
      ).toBeInTheDocument();
      expect(
        screen.getByText(dict.distanceLabels["Market"])
      ).toBeInTheDocument();
      /* Legacy/custom title değişmeden render edilir. */
      expect(screen.getByText("Eski Özel Mesafe")).toBeInTheDocument();
      /* Mesafe DEĞERİ locale'den BAĞIMSIZ — hiçbir zaman çevrilmez. */
      expect(screen.getByText("300 m")).toBeInTheDocument();
      expect(screen.getByText("150 m")).toBeInTheDocument();
      expect(screen.getByText("2 km")).toBeInTheDocument();
      /* 🛡️ MIGRATION 090 — villa BAŞINA mesafe çevirisi KALDIRILDI.
         Mesafe başlıkları YALNIZ statik `distanceLabels` dictionary'si
         ile çözülür → mesafeler için DB'ye HİÇ sorgu ATILMAZ.
         (Önceden burada `villa_distance` batch çağrısı doğrulanıyordu;
         assertion gevşetilmedi, TERSİ yönde sıkılaştırıldı.) */
      const distanceCalls = getTranslationsForParentsMock.mock.calls.filter(
        (call: unknown[]) => call[0] === "villa_distance"
      );
      expect(distanceCalls).toHaveLength(0);
    });

    it("16b) 🛡️ MIGRATION 090 — DB'de `villa_distance` çevirisi OLSA BİLE kullanılmaz; canonical/custom başlık davranışı değişmez", async () => {
      getVillaDistancesMock.mockResolvedValue([
        {
          id: "d3",
          villa_id: "test-villa-id",
          title: "Eski Özel Mesafe",
          distance: "2 km",
          created_at: "",
        },
      ]);
      /* Eski (kaldırılmış) sistemin verisi hâlâ mock'lanıyor —
         AMAÇ: sayfanın onu ARTIK OKUMADIĞINI kanıtlamak. */
      getTranslationsForParentsMock.mockImplementation(
        async (entity: string) =>
          entity === "villa_distance"
            ? new Map([["d3", { title: "Legacy Custom Distance" }]])
            : new Map()
      );

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);
      openVillaTab(locale, "location");

      /* DB çevirisi KULLANILMAZ; canonical olmayan başlık AYNEN kalır. */
      expect(screen.queryByText("Legacy Custom Distance")).toBeNull();
      expect(screen.getByText("Eski Özel Mesafe")).toBeInTheDocument();
      /* Mesafe DEĞERİ locale'den BAĞIMSIZ. */
      expect(screen.getByText("2 km")).toBeInTheDocument();
      /* İkon anahtarı yine ORİJİNAL TR title'dan. */
      expect(getDistanceIconKeyMock).toHaveBeenCalledWith("Eski Özel Mesafe");
    });

    it("17) 🛡️ REGRESYON: distance icon key ORİJİNAL (TR) title'dan hesaplanır, ÇEVRİLMİŞ displayTitle'dan DEĞİL", async () => {
      getVillaDistancesMock.mockResolvedValue([
        {
          id: "d1",
          villa_id: "test-villa-id",
          title: "Restoran",
          distance: "500 m",
          created_at: "",
        },
      ]);

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      const dict = getDictionary(locale);
      /* ORİJİNAL TR title ile çağrılmalı ... */
      expect(getDistanceIconKeyMock).toHaveBeenCalledWith("Restoran");
      /* ... ÇEVRİLMİŞ (dictionary'den gelen) displayTitle ile ASLA
         çağrılmamalı. */
      expect(getDistanceIconKeyMock).not.toHaveBeenCalledWith(
        dict.distanceLabels["Restoran"]
      );
    });

    it("18) boş koleksiyonlar (distances/features/rules/priceIncludes) sayfayı ÇÖKERTMEZ, hardcoded boş-durum metinleri render edilir", async () => {
      /* beforeEach varsayılanı zaten tüm koleksiyonlar için []. */
      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      /* 🛡️ PHASE 10G — boş-durum metinleri ARTIK dictionary'den
         (locale-aware); TR hardcoded metin DEĞİL. Her biri kendi
         sekmesi açıldıktan sonra DOM'a gelir. */
      const dict = getDictionary(locale);
      openVillaTab(locale, "location");
      expect(screen.getByText(dict.villa.distancesEmpty)).toBeInTheDocument();
      openVillaTab(locale, "features");
      expect(screen.getByText(dict.villa.featuresEmpty)).toBeInTheDocument();
    });

    /* ===============================================================
       🛡️ PHASE 10E BATCH 4 — KONAKLAMA DÜZENİ (EN/DE public render)
       ===============================================================
       Villa mock'u YALNIZ bu testlerde override edilir
       (`mockResolvedValueOnce`) — paylaşılan beforeEach varsayılanında
       layout alanı YOK (section hiç render edilmez), böylece yukarıdaki
       MEVCUT testler ETKİLENMEZ. */
    const VILLA_WITH_LAYOUT = {
      id: "test-villa-id",
      slug: "test-villa",
      title: "Test Villa Title",
      description: "<p>Test villa description.</p>",
      location: "Bodrum, Muğla",
      location_id: null as string | null,
      guests: 6,
      bedrooms: 3,
      bathrooms: 2,
      tourism_document_number: null as string | null,
      bedroom_layout: [
        { name: "Ana Yatak Odası", beds: [{ type: "double", count: 1 }] },
        { name: "Çocuk Odası", beds: [{ type: "single", count: 2 }] },
      ],
      bathroom_layout: [{ name: "1. Banyo", type: "full" }],
    };

    it("19) PHASE 10E — AccommodationLayout EN/DE sayfasında RENDER EDİLİR", async () => {
      getVillaBySlugMock.mockResolvedValueOnce(VILLA_WITH_LAYOUT);

      const { default: Page } = await import(modulePath);
      render(await Page({ params: Promise.resolve({ slug: "test-villa" }) }));

      const dict = getDictionary(locale);
      expect(
        screen.getByText(dict.accommodation.sectionTitle)
      ).toBeInTheDocument();
    });

    it("20) 🛡️ PHASE 10F — oda/banyo adları SÖZLÜKTEN çevrilir (villa bazlı çeviri YOK)", async () => {
      getVillaBySlugMock.mockResolvedValueOnce(VILLA_WITH_LAYOUT);

      const { default: Page } = await import(modulePath);
      render(await Page({ params: Promise.resolve({ slug: "test-villa" }) }));

      const dict = getDictionary(locale);
      expect(
        screen.getByText(dict.roomNameLabels["Ana Yatak Odası"])
      ).toBeInTheDocument();
      expect(
        screen.getByText(dict.roomNameLabels["Çocuk Odası"])
      ).toBeInTheDocument();
      /* TR adlar EN/DE'de GÖRÜNMEMELİ. */
      expect(screen.queryByText("Ana Yatak Odası")).not.toBeInTheDocument();
    });

    it("21) 🛡️ PHASE 10F — sözlükte OLMAYAN serbest ad TR olarak kalır", async () => {
      getVillaBySlugMock.mockResolvedValueOnce({
        ...VILLA_WITH_LAYOUT,
        bedroom_layout: [
          { name: "Deniz Manzaralı Süit", beds: [{ type: "double", count: 1 }] },
        ],
      });

      const { default: Page } = await import(modulePath);
      render(await Page({ params: Promise.resolve({ slug: "test-villa" }) }));

      expect(screen.getByText("Deniz Manzaralı Süit")).toBeInTheDocument();
    });

    it("22) 🛡️ PHASE 10F — numaralı banyo adı locale şablonundan üretilir", async () => {
      getVillaBySlugMock.mockResolvedValueOnce(VILLA_WITH_LAYOUT);

      const { default: Page } = await import(modulePath);
      render(await Page({ params: Promise.resolve({ slug: "test-villa" }) }));

      const dict = getDictionary(locale);
      const expected = dict.accommodation.bathroomFallback.replace("{n}", "1");
      expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it("23) PHASE 10E — layout YOKSA section HİÇ render edilmez", async () => {
      /* beforeEach varsayılan villa'sında layout alanı yok. */
      const { default: Page } = await import(modulePath);
      render(await Page({ params: Promise.resolve({ slug: "test-villa" }) }));

      const dict = getDictionary(locale);
      expect(
        screen.queryByText(dict.accommodation.sectionTitle)
      ).not.toBeInTheDocument();
    });

    it("25) 🛡️ PHASE 10E BATCH 5 — havuz bölümü EN/DE'de locale etiketleriyle render edilir", async () => {
      getVillaBySlugMock.mockResolvedValueOnce({
        ...VILLA_WITH_LAYOUT,
        pool_type: "ozel",
        pool_sheltered: true,
        pool_width: "4",
        pool_length: "8",
        pool_depth: "1.5",
        indoor_pool: true,
        child_pool: true,
      });

      const { default: Page } = await import(modulePath);
      render(await Page({ params: Promise.resolve({ slug: "test-villa" }) }));

      const dict = getDictionary(locale);
      expect(screen.getByText(dict.pool.sectionTitle)).toBeInTheDocument();
      expect(
        screen.getByText(dict.poolTypeLabels.private_sheltered)
      ).toBeInTheDocument();
      expect(
        screen.getByText(dict.poolTypeLabels.indoor)
      ).toBeInTheDocument();
      expect(screen.getByText(dict.poolTypeLabels.child)).toBeInTheDocument();
      /* TR literal'leri EN/DE sayfasında GÖRÜNMEMELİ. */
      expect(screen.queryByText("Havuz Bilgileri")).not.toBeInTheDocument();
    });

    it("26) 🛡️ PHASE 10E BATCH 5 — havuz yoksa bölüm HİÇ render edilmez", async () => {
      getVillaBySlugMock.mockResolvedValueOnce({
        ...VILLA_WITH_LAYOUT,
        pool_type: "yok",
        indoor_pool: false,
        child_pool: false,
      });

      const { default: Page } = await import(modulePath);
      render(await Page({ params: Promise.resolve({ slug: "test-villa" }) }));

      const dict = getDictionary(locale);
      expect(
        screen.queryByText(dict.pool.sectionTitle)
      ).not.toBeInTheDocument();
    });

    it("24) 🛡️ VİLLA ADI ÇEVRİLMEZ — EN/DE'de canonical villa.title gösterilir", async () => {
      getVillaBySlugMock.mockResolvedValueOnce({
        ...VILLA_WITH_LAYOUT,
        title: "Villa Aşkım",
      });

      const { default: Page } = await import(modulePath);
      render(await Page({ params: Promise.resolve({ slug: "test-villa" }) }));

      /* Title birden fazla yerde render edilir (başlık + VillaInfoBar) —
         bu dosyadaki mevcut `getAllByText(...).length > 0` convention'ı. */
      expect(screen.getAllByText("Villa Aşkım").length).toBeGreaterThan(0);
    });
  }
);

/* ===============================================================
   🛡️ PHASE 10B, Section 14 — YENİ TESTLER: component visibility +
   JSON-LD locale
   ===============================================================
   Hedef: standing "PHASE 10B IMPLEMENTATION" talimatının Section 14
   maddesinde AÇIKÇA istenen ek test kapsamı:
     - EN/DE component visibility (Gallery/PriceList/Availability
       gerçekten render ediyor — BookingSidebar/MobileBookingCta zaten
       yukarıdaki VILLA_DETAIL_GATE_ROUTES bloğunda "bookNow" ile
       doğrulanıyor, burada TEKRAR EDİLMİYOR)
     - EN/DE JSON-LD locale (vacationRentalLd/breadcrumbLd'nin
       `inLanguage` alanına page.tsx'in gerçekten "en"/"de" geçirdiği —
       buildVacationRental/buildBreadcrumb'ın KENDİ locale mantığı
       tests/unit/structured-data-locale.test.ts'te ayrıntılı test
       edildi, burada yalnız page.tsx'in DOĞRU parametreyle çağırdığı
       doğrulanıyor)
   Yalnız beforeEach'in VARSAYILAN (boş) mock'larını kullanır — images/
   prices/discounts/externalBlocks hepsi boş, bu yüzden Gallery "Görsel
   yok" / PriceList "Fiyat bilgisi yok" gibi boş-durum metinlerini
   render eder — bu METİNLERİN KENDİSİ locale-aware olduğu için (dict'ten
   okunuyor) doğru locale ile render edildiklerini kanıtlamaya yeterli. */
describe.each(VILLA_DETAIL_ROUTES)(
  "%s — Phase 10B Section 14: component visibility + JSON-LD locale",
  (modulePath, locale) => {
    beforeEach(() => {
      requirePublicLocaleEnabledMock.mockResolvedValue(undefined);
    });

    it("19) Gallery boş-durum metni doğru locale ile render edilir (component gerçekten mount edildi)", async () => {
      const dict = getDictionary(locale);
      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(screen.getByText(dict.gallery.noImages)).toBeInTheDocument();
    });

    it("20) PriceList boş-durum metni doğru locale ile render edilir", async () => {
      const dict = getDictionary(locale);
      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(screen.getByText(dict.price.noPriceInfo)).toBeInTheDocument();
    });

    it("21) AvailabilityInlineCalendar doğru locale aria-label'larla render edilir", async () => {
      const dict = getDictionary(locale);
      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);
      openVillaTab(locale, "availability");

      expect(
        screen.getByLabelText(dict.availability.prevMonth)
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(dict.availability.nextMonth)
      ).toBeInTheDocument();
    });

    it("22) JSON-LD: vacationRentalLd + breadcrumbLd 'inLanguage' alanı sayfanın locale'iyle eşleşir", async () => {
      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      const { container } = render(element);

      const scripts = Array.from(
        container.querySelectorAll('script[type="application/ld+json"]')
      );
      expect(scripts.length).toBe(2);

      const payloads = scripts.map(
        (s) => JSON.parse(s.textContent || "{}") as Record<string, unknown>
      );

      const vacationRental = payloads.find(
        (p) => p["@type"] === "VacationRental"
      );
      const breadcrumb = payloads.find(
        (p) => p["@type"] === "BreadcrumbList"
      );

      expect(vacationRental).toBeTruthy();
      expect(breadcrumb).toBeTruthy();
      expect(vacationRental?.inLanguage).toBe(locale);
      expect(breadcrumb?.inLanguage).toBe(locale);
    });

    it("23) JSON-LD breadcrumb isimleri locale-aware (dict.header.home/villas + çevrilmiş title)", async () => {
      const dict = getDictionary(locale);
      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      const { container } = render(element);

      const scripts = Array.from(
        container.querySelectorAll('script[type="application/ld+json"]')
      );
      const payloads = scripts.map(
        (s) => JSON.parse(s.textContent || "{}") as Record<string, unknown>
      );
      const breadcrumb = payloads.find(
        (p) => p["@type"] === "BreadcrumbList"
      ) as { itemListElement: Array<{ name?: string }> } | undefined;

      expect(breadcrumb).toBeTruthy();
      const names = (breadcrumb!.itemListElement || []).map((i) => i.name);
      expect(names).toContain(dict.header.home);
      expect(names).toContain(dict.header.villas);
      expect(names).toContain("Test Villa Title");
    });
  }
);
