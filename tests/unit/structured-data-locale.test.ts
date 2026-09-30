/* ===============================================================
   🛡️ PHASE 7D — JSON-LD inLanguage TESTLERİ
   ===============================================================
   Hedef: app/components/seo/StructuredData.tsx
     > buildVacationRental (opsiyonel `locale`)
     > buildBreadcrumb (opsiyonel ikinci parametre `locale`)

   Gerçek implementasyon çalışır (mock YOK — bu dosyanın saf,
   DB/network'süz fonksiyonları test ediliyor). `SITE_URL`/`abs()`
   davranışı bu fazda DEĞİŞMEDİ; testler yalnız `inLanguage` alanını
   ve mevcut alanların KORUNDUĞUNU doğruluyor.
   =============================================================== */

import { describe, it, expect } from "vitest";

import {
  buildVacationRental,
  buildBreadcrumb,
  type VacationRentalInput,
} from "@/app/components/seo/StructuredData";

const BASE_INPUT: VacationRentalInput = {
  slug: "villa-in-love",
  title: "Villa Aşkım",
  description: "Muhteşem bir villa",
  images: ["/villa1.jpg"],
  locationName: "Kalkan",
  latitude: 36.27,
  longitude: 29.42,
  guests: 6,
  bedrooms: 3,
  bathrooms: 2,
  features: ["Havuz", "Deniz Manzarası"],
  priceFrom: { amount: 1000, currency: "TRY" },
  aggregateRating: null,
};

describe("buildVacationRental — Phase 7D inLanguage", () => {
  /* --- 1) TR -> inLanguage tr-TR --- */
  it("1) locale='tr' → inLanguage 'tr-TR'", () => {
    const result = buildVacationRental({ ...BASE_INPUT, locale: "tr" });
    expect(result.inLanguage).toBe("tr-TR");
  });

  /* --- 2) EN -> inLanguage en --- */
  it("2) locale='en' → inLanguage 'en'", () => {
    const result = buildVacationRental({ ...BASE_INPUT, locale: "en" });
    expect(result.inLanguage).toBe("en");
  });

  /* --- 3) DE -> inLanguage de --- */
  it("3) locale='de' → inLanguage 'de'", () => {
    const result = buildVacationRental({ ...BASE_INPUT, locale: "de" });
    expect(result.inLanguage).toBe("de");
  });

  /* --- 4) mevcut schema alanları korunuyor --- */
  it("4) locale verilmezse inLanguage HİÇ EKLENMEZ (önceki call-site'lar byte-identical)", () => {
    const result = buildVacationRental(BASE_INPUT);
    expect("inLanguage" in result).toBe(false);
  });

  it("4b) locale='tr' verilse BİLE @type/name/url/description/image/address/geo/numberOfRooms/occupancy/amenityFeature/offers KORUNUYOR", () => {
    const withoutLocale = buildVacationRental(BASE_INPUT);
    const withLocale = buildVacationRental({ ...BASE_INPUT, locale: "tr" });

    // inLanguage dışındaki TÜM alanlar birebir aynı.
    const rest: Record<string, unknown> = {
      ...(withLocale as Record<string, unknown>),
    };
    delete rest.inLanguage;
    expect(rest).toEqual(withoutLocale);

    expect(withLocale["@type"]).toBe("VacationRental");
    expect(withLocale.name).toBe("Villa Aşkım");
    expect(withLocale.address).toBeDefined();
    expect(withLocale.geo).toBeDefined();
    expect(withLocale.numberOfRooms).toBe(3);
    expect(withLocale.occupancy).toBeDefined();
    expect(withLocale.amenityFeature).toBeDefined();
    expect(withLocale.offers).toBeDefined();
  });

  it("4c) aggregateRating yalnız gerçek review varken eklenir (Phase 7D bu mantığa DOKUNMADI)", () => {
    const result = buildVacationRental({
      ...BASE_INPUT,
      locale: "tr",
      aggregateRating: { ratingValue: 4.8, reviewCount: 12 },
    });
    expect(result.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.8,
      reviewCount: 12,
      bestRating: 5,
      worstRating: 1,
    });
  });
});

describe("buildBreadcrumb — Phase 7D inLanguage", () => {
  const ITEMS = [
    { name: "Ana sayfa", url: "/" },
    { name: "Villalar", url: "/arama" },
    { name: "Villa Aşkım" },
  ];

  it("1) locale='tr' → inLanguage 'tr-TR'", () => {
    const result = buildBreadcrumb(ITEMS, "tr");
    expect(result.inLanguage).toBe("tr-TR");
  });

  it("2) locale='en' → inLanguage 'en'", () => {
    const result = buildBreadcrumb(ITEMS, "en");
    expect(result.inLanguage).toBe("en");
  });

  it("3) locale='de' → inLanguage 'de'", () => {
    const result = buildBreadcrumb(ITEMS, "de");
    expect(result.inLanguage).toBe("de");
  });

  it("4) locale verilmezse (mevcut TÜM call-site'lar) inLanguage HİÇ EKLENMEZ, itemListElement AYNEN korunuyor", () => {
    const withoutLocale = buildBreadcrumb(ITEMS);
    expect("inLanguage" in withoutLocale).toBe(false);
    expect(withoutLocale["@type"]).toBe("BreadcrumbList");
    expect(withoutLocale.itemListElement).toHaveLength(3);
  });
});
