/* ===============================================================
   🛡️ PHASE 7C / 8C — EN/DE VILLA DETAIL generateMetadata:
   CANONICAL + HREFLANG (7C) + SEO_DESCRIPTION (8C)
   ===============================================================
   Hedef:
     app/(public)/en/kiralik-villa/[slug]/page.tsx > generateMetadata
     app/(public)/de/kiralik-villa/[slug]/page.tsx > generateMetadata

   Mock seviyesi Phase 6B/locale-routes.test.tsx ile AYNI desen:
   `@/lib/i18n/public-locale-gate.server`, `@/app/services/villa.service`,
   `@/lib/i18n/get-villa-translation.server`, `@/lib/cache.helpers`
   mock'lanır (hiçbiri bu fazda GERÇEKTEN değiştirilmedi). `buildLocaleAlternates`
   (Phase 7B) mock'lanmıyor — gerçek implementasyonuyla çalışıyor.

   🛡️ PHASE 8C EKLEMESİ: `getVillaTranslatedSeoDescription` de AYNI
   mock factory'ye eklendi (mock'lanmazsa page.tsx'in yeni import'u
   `undefined` alır ve generateMetadata çağrısında TypeError fırlatır
   — Phase 8B'nin locale-routes.test.tsx'te uyguladığı AYNI zorunlu
   düzeltme). canonical/hreflang/robots testleri DEĞİŞMEDİ — yalnız
   eski "description metadata'da SET EDİLMEZ" testi, artık description'ın
   set EDİLDİĞİ yeni Phase 8C davranışına göre güncellendi.

   GERÇEK DB'YE HİÇ DOKUNULMAZ.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const requirePublicLocaleEnabledMock = vi.fn();
const getVillaBySlugMock = vi.fn();
const getVillaTranslatedSeoDescriptionMock = vi.fn();
/* 🛡️ PHASE 10B, Section 11 — generateMetadata artık seo_title
   çevirisini de okuyor (varsa title yerine onu kullanır). */
const getVillaTranslatedSeoTitleMock = vi.fn();
const getCachedSettingsMock = vi.fn();

vi.mock("@/lib/i18n/public-locale-gate.server", () => ({
  requirePublicLocaleEnabled: () => requirePublicLocaleEnabledMock(),
}));
vi.mock("@/app/services/villa.service", () => ({
  getVillaBySlug: (...args: unknown[]) => getVillaBySlugMock(...args),
}));
vi.mock("@/lib/i18n/get-villa-translation.server", () => ({
  /* 🛡️ PHASE 8C — generateMetadata artık bunu da import ediyor;
     mock'lanmazsa `undefined` çağrılır ve TypeError fırlatır. */
  getVillaTranslatedSeoDescription: (...args: unknown[]) =>
    getVillaTranslatedSeoDescriptionMock(...args),
  /* 🛡️ PHASE 10B, Section 11 — AYNI zorunlu düzeltme (bkz. üst yorum). */
  getVillaTranslatedSeoTitle: (...args: unknown[]) =>
    getVillaTranslatedSeoTitleMock(...args),
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: (...args: unknown[]) => getCachedSettingsMock(...args),
}));

beforeEach(() => {
  requirePublicLocaleEnabledMock.mockReset();
  requirePublicLocaleEnabledMock.mockResolvedValue(undefined);
  getVillaBySlugMock.mockReset();
  getVillaTranslatedSeoDescriptionMock.mockReset();
  /* 🛡️ PHASE 8C — varsayılan: gerçek fallback/excerpt mantığı burada
     test edilmiyor (bkz. get-villa-translation.test.ts); testler
     ihtiyaç duyduğunda kendi mockResolvedValue'sini set eder. */
  getVillaTranslatedSeoDescriptionMock.mockResolvedValue(
    "Translated SEO description."
  );
  /* 🛡️ PHASE 10B, Section 11 — varsayılan: ECHO deseni (originalSeoTitle
     geri döner). `BASE_VILLA`'da `seo_title` alanı YOK (undefined) →
     `translatedSeoTitle` undefined'a çözülür → page.tsx'in
     `(translatedSeoTitle && ...) || fallbackTitle` mantığı fallbackTitle'a
     düşer — fallbackTitle ARTIK canonical `villa.title`'dır (villa adı
     çevrilmez). seo_title-spesifik testler kendi
     mockResolvedValue'sini set eder. */
  getVillaTranslatedSeoTitleMock.mockReset();
  getVillaTranslatedSeoTitleMock.mockImplementation(
    (_villaId: string, originalSeoTitle: string | null | undefined) =>
      Promise.resolve(originalSeoTitle)
  );
  getCachedSettingsMock.mockReset();
});

const BASE_VILLA = {
  id: "villa-uuid-1",
  slug: "villa-in-love",
  title: "Villa Aşkım",
  /* 🛡️ PHASE 8C — generateMetadata artık bunları
     getVillaTranslatedSeoDescription'a geçiriyor (mock'landığı için
     GERÇEK excerpt/fallback mantığı burada çalışmıyor — yalnız
     doğru argümanlarla çağrıldığı doğrulanıyor). */
  seo_description: "Orijinal TR seo açıklaması.",
  description: "<p>Orijinal TR açıklaması.</p>",
};

const ROUTES: Array<{
  modulePath: string;
  locale: "en" | "de";
  notFoundTitle: string;
}> = [
  {
    modulePath: "@/app/(public)/en/kiralik-villa/[slug]/page",
    locale: "en",
    notFoundTitle: "Villa not found",
  },
  {
    modulePath: "@/app/(public)/de/kiralik-villa/[slug]/page",
    locale: "de",
    notFoundTitle: "Villa nicht gefunden",
  },
];

async function callGenerateMetadata(modulePath: string, slug = "villa-in-love") {
  const mod = await import(/* @vite-ignore */ modulePath);
  return mod.generateMetadata({ params: Promise.resolve({ slug }) });
}

describe.each(ROUTES)(
  "$modulePath generateMetadata — Phase 7C canonical/hreflang",
  ({ modulePath, locale, notFoundTitle }) => {
    /* --- 2/3) EN/DE locale canonical --- */
    it(`canonical '/${locale}/kiralik-villa/{slug}' formatındadır`, async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      expect(result.alternates?.canonical).toBe(
        `/${locale}/kiralik-villa/villa-in-love`
      );
    });

    /* --- 4) multilingual_enabled=true iken dört hreflang key'i --- */
    it("multilingual_enabled=true iken languages tr/en/de/x-default TAMAMI mevcut", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      const languages = result.alternates?.languages as
        | Record<string, unknown>
        | undefined;
      expect(languages?.tr).toBe("/kiralik-villa/villa-in-love");
      expect(languages?.en).toBe("/en/kiralik-villa/villa-in-love");
      expect(languages?.de).toBe("/de/kiralik-villa/villa-in-love");
      expect(languages?.["x-default"]).toBe("/kiralik-villa/villa-in-love");
    });

    /* --- 5) x-default TR --- */
    it("x-default HER ZAMAN TR path'tir", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      const languages = result.alternates?.languages as
        | Record<string, unknown>
        | undefined;
      expect(languages?.["x-default"]).toBe("/kiralik-villa/villa-in-love");
    });

    /* --- 6) multilingual_enabled=false iken EN/DE hreflang'ların
       YANLIŞLIKLA 404 URL olarak üretilmemesi --- */
    it("multilingual_enabled=false iken `languages` key'i HİÇ YOK", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      expect(result.alternates).toEqual({
        canonical: `/${locale}/kiralik-villa/villa-in-love`,
      });
      expect(
        (result.alternates as Record<string, unknown>).languages
      ).toBeUndefined();
    });

    /* --- 7) 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — KOŞULSUZ `noindex`
       KALDIRILDI. Bu override Phase 4A/6B/7C'nin geçici
       `LocaleRouteComingSoon` placeholder'ından kalmıştı; sayfa Phase
       10B'den beri TR ile AYNI, tam çevrilmiş gerçek içeriği render
       ediyor ve sitemap bu URL'leri hreflang alternate olarak veriyor.
       Index politikası artık root layout'un
       `settings.robots_index/robots_follow` ayarından MİRAS alınır;
       `multilingual_enabled=false` iken route zaten 404 döner.
       ⚠️ Villa BULUNAMADIĞINDA dönen noindex DEĞİŞMEDİ (aşağıdaki
       test). --- */
    it("robots override YOK — flag kapalıyken de root politikası miras alınır", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      expect(result.robots).toBeUndefined();
    });

    it("robots override YOK — flag açıkken de (hreflang ile tutarlı)", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      expect(result.robots).toBeUndefined();
    });

    it("villa bulunamazsa (null) → notFound title + noindex, alternates YOK", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
      getVillaBySlugMock.mockResolvedValue(null);

      const result = await callGenerateMetadata(modulePath, "olmayan-slug");
      expect(result.title).toBe(notFoundTitle);
      expect(result.robots).toEqual({ index: false, follow: false });
      expect(result.alternates).toBeUndefined();
    });

    /* --- 🛡️ VİLLA ADI ÇEVRİLMEZ: metadata title'ı canonical
       `villa.title`'dan gelir (seo_title çevirisi varsa o önceliklidir —
       ayrı testte doğrulanıyor). --- */
    it("title canonical villa.title'dan gelir (çeviri helper'ı YOK)", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      expect(result.title).toBe(BASE_VILLA.title);
    });

    /* --- 🛡️ PHASE 8C — description artık getVillaTranslatedSeoDescription'dan
       set ediliyor (eski "SET EDİLMEZ" beklentisi Phase 7C'ye özgüydü,
       Phase 8C audit raporunun onayladığı tek adımla güncellendi). --- */
    it("description metadata'da getVillaTranslatedSeoDescription'ın döndürdüğü değeri İÇERİR", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);
      getVillaTranslatedSeoDescriptionMock.mockResolvedValue(
        `Translated ${locale} SEO description.`
      );

      const result = await callGenerateMetadata(modulePath);
      expect(result.description).toBe(`Translated ${locale} SEO description.`);
      expect(getVillaTranslatedSeoDescriptionMock).toHaveBeenCalledWith(
        BASE_VILLA.id,
        BASE_VILLA.seo_description,
        BASE_VILLA.description,
        locale
      );
    });

    it("openGraph.description ve twitter.description EKLENMEZ (bu faz yalnız metadata.description'ı hedefler)", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);
      getVillaTranslatedSeoDescriptionMock.mockResolvedValue(
        `Translated ${locale} SEO description.`
      );

      const result = await callGenerateMetadata(modulePath);
      expect(
        (result.openGraph as Record<string, unknown> | undefined)?.description
      ).toBeUndefined();
      expect(
        (result as Record<string, unknown>).twitter
      ).toBeUndefined();
    });

    it("villa bulunamazsa (null) → getVillaTranslatedSeoDescription HİÇ ÇAĞRILMAZ", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
      getVillaBySlugMock.mockResolvedValue(null);

      await callGenerateMetadata(modulePath, "olmayan-slug");
      expect(getVillaTranslatedSeoDescriptionMock).not.toHaveBeenCalled();
    });

    it("openGraph.url canonical ile AYNI", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);

      const result = await callGenerateMetadata(modulePath);
      expect(result.openGraph?.url).toBe(result.alternates?.canonical);
    });
  }
);
