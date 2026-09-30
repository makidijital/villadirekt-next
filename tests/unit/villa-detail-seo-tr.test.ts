/* ===============================================================
   🛡️ PHASE 7C — TR VILLA DETAIL generateMetadata: CANONICAL + HREFLANG
   ===============================================================
   Hedef: app/(public)/kiralik-villa/[slug]/page.tsx > generateMetadata

   Bu dosya TR sayfasının generateMetadata'sını GERÇEK modül olarak
   import eder (dynamic import) — yalnız `@/app/services/villa.service`
   ve `@/lib/cache.helpers` mock'lanır (villa.service.ts VE
   cache.helpers.ts KENDİLERİ hiç değiştirilmedi/yeniden yazılmadı,
   yalnız test-seviyesinde mock'lanıyorlar). Sayfanın diğer TÜM
   import'ları (villa-price/discount/distance/feature service'leri,
   component'ler, vb.) modül-yükleme sırasında hiçbir yan etki
   üretmediği için (yalnız fonksiyon export'ları) mock'lanmasına
   GEREK YOK — bu ampirik olarak doğrulandı (probe test, bu dosyanın
   yazılmasından önce ayrı bir geçici testle çalıştırılıp silindi).

   `buildLocaleAlternates` (Phase 7B) BURADA AYRICA mock'lanmıyor —
   gerçek implementasyonuyla çalışıyor (saf fonksiyon, DB/network
   YOK) — böylece testler generateMetadata + helper'ın GERÇEK
   entegrasyonunu doğruluyor.

   GERÇEK DB'YE HİÇ DOKUNULMAZ, production'a test verisi YAZILMAZ.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const getVillaBySlugMock = vi.fn();
const getCachedSettingsMock = vi.fn();
const getCachedVillaReviewsMock = vi.fn();
const getCachedVillaReviewStatsMock = vi.fn();

vi.mock("@/app/services/villa.service", () => ({
  getVillaBySlug: (...args: unknown[]) => getVillaBySlugMock(...args),
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: (...args: unknown[]) => getCachedSettingsMock(...args),
  getCachedVillaReviews: (...args: unknown[]) =>
    getCachedVillaReviewsMock(...args),
  getCachedVillaReviewStats: (...args: unknown[]) =>
    getCachedVillaReviewStatsMock(...args),
}));

beforeEach(() => {
  getVillaBySlugMock.mockReset();
  getCachedSettingsMock.mockReset();
  getCachedVillaReviewsMock.mockReset();
  getCachedVillaReviewStatsMock.mockReset();
});

const BASE_VILLA = {
  id: "villa-uuid-1",
  slug: "villa-in-love",
  title: "Villa Aşkım",
  seo_title: "",
  seo_description: "",
  description: "<p>Muhteşem bir villa</p>",
  images: ["https://cdn.example.com/cover.jpg"],
  noindex: false,
};

async function callGenerateMetadata(slug = "villa-in-love") {
  const mod = await import("@/app/(public)/kiralik-villa/[slug]/page");
  return mod.generateMetadata({ params: Promise.resolve({ slug }) });
}

describe("TR villa detail generateMetadata — Phase 7C canonical/hreflang", () => {
  /* --- 1) TR locale canonical prefix-free --- */
  it("1) canonical prefix-free TR path'tir ('/tr' YOK)", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
    getVillaBySlugMock.mockResolvedValue(BASE_VILLA);

    const result = await callGenerateMetadata();
    expect(result.alternates?.canonical).toBe("/kiralik-villa/villa-in-love");
  });

  /* --- 4) multilingual_enabled=true iken dört hreflang key'i --- */
  it("4) multilingual_enabled=true iken languages tr/en/de/x-default TAMAMI mevcut", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
    getVillaBySlugMock.mockResolvedValue(BASE_VILLA);

    const result = await callGenerateMetadata();
    const languages = result.alternates?.languages as
      | Record<string, unknown>
      | undefined;
    expect(languages).toBeDefined();
    expect(languages?.tr).toBe("/kiralik-villa/villa-in-love");
    expect(languages?.en).toBe("/en/kiralik-villa/villa-in-love");
    expect(languages?.de).toBe("/de/kiralik-villa/villa-in-love");
    expect(languages?.["x-default"]).toBe("/kiralik-villa/villa-in-love");
  });

  /* --- 5) x-default TR --- */
  it("5) x-default HER ZAMAN TR path'tir (flag true iken de)", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
    getVillaBySlugMock.mockResolvedValue(BASE_VILLA);

    const result = await callGenerateMetadata();
    const languages = result.alternates?.languages as
      | Record<string, unknown>
      | undefined;
    expect(languages?.["x-default"]).toBe("/kiralik-villa/villa-in-love");
  });

  /* --- 6) multilingual_enabled=false iken EN/DE hreflang'ların
     YANLIŞLIKLA 404 URL olarak üretilmemesi --- */
  it("6) multilingual_enabled=false iken alternates'te `languages` key'i HİÇ YOK (EN/DE'ye işaret eden 404 hreflang üretilmez)", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
    getVillaBySlugMock.mockResolvedValue(BASE_VILLA);

    const result = await callGenerateMetadata();
    expect(result.alternates).toEqual({
      canonical: "/kiralik-villa/villa-in-love",
    });
    expect(
      (result.alternates as Record<string, unknown>).languages
    ).toBeUndefined();
  });

  it("6b) getCachedSettings null/reject ederse (fail-safe) → flag false davranışıyla AYNI (languages YOK)", async () => {
    getCachedSettingsMock.mockRejectedValue(new Error("settings down"));
    getVillaBySlugMock.mockResolvedValue(BASE_VILLA);

    const result = await callGenerateMetadata();
    expect(
      (result.alternates as Record<string, unknown>).languages
    ).toBeUndefined();
    expect(result.alternates?.canonical).toBe("/kiralik-villa/villa-in-love");
  });

  /* --- 7) mevcut robots/noindex davranışının korunması --- */
  it("7) villa.noindex=false → robots index:true,follow:true (ÖNCEKİ davranışla AYNI)", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
    getVillaBySlugMock.mockResolvedValue({ ...BASE_VILLA, noindex: false });

    const result = await callGenerateMetadata();
    expect(result.robots).toEqual({ index: true, follow: true });
  });

  it("7b) villa.noindex=true → robots index:false,follow:false (ÖNCEKİ davranışla AYNI)", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
    getVillaBySlugMock.mockResolvedValue({ ...BASE_VILLA, noindex: true });

    const result = await callGenerateMetadata();
    expect(result.robots).toEqual({ index: false, follow: false });
  });

  it("7c) villa bulunamazsa (null) → title 'Villa bulunamadı' + noindex (ÖNCEKİ davranışla AYNI, DEĞİŞMEDİ)", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
    getVillaBySlugMock.mockResolvedValue(null);

    const result = await callGenerateMetadata("olmayan-slug");
    expect(result.title).toBe("Villa bulunamadı");
    expect(result.robots).toEqual({ index: false, follow: false });
    // Not-found dalı Phase 7C'de HİÇ dokunulmadı — alternates hâlâ yok.
    expect(result.alternates).toBeUndefined();
  });

  /* --- 8) mevcut TR metadata title/description davranışının korunması --- */
  it("8) seo_title/seo_description doluysa ONLAR kullanılır (ÖNCEKİ davranış)", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
    getVillaBySlugMock.mockResolvedValue({
      ...BASE_VILLA,
      seo_title: "Özel SEO Başlığı",
      seo_description: "Özel SEO açıklaması",
    });

    const result = await callGenerateMetadata();
    expect(result.title).toBe("Özel SEO Başlığı");
    expect(result.description).toBe("Özel SEO açıklaması");
  });

  it("8b) seo_title/seo_description boşsa villa.title + description excerpt'ine düşer (ÖNCEKİ davranış)", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
    getVillaBySlugMock.mockResolvedValue(BASE_VILLA);

    const result = await callGenerateMetadata();
    expect(result.title).toBe("Villa Aşkım");
    expect(result.description).toBe("Muhteşem bir villa");
  });

  /* --- Ek: EN/DE canonical'a bu dosyadan asla dokunulmadığının
     dolaylı kanıtı: EN/DE canonical'ı locale='tr' çağrısı üretmez --- */
  it("ek) openGraph.url canonical ile AYNI (küçük, güvenli hizalama — Phase 7C §6)", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
    getVillaBySlugMock.mockResolvedValue(BASE_VILLA);

    const result = await callGenerateMetadata();
    expect(result.openGraph?.url).toBe(result.alternates?.canonical);
  });
});
