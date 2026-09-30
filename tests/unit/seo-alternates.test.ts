/* ===============================================================
   🛡️ PHASE 7B — SEO ALTERNATES HELPER: TESTLER
   ===============================================================
   Hedef: lib/i18n/seo-alternates.ts (buildLocaleAlternates)

   Bu dosya SAF bir path-şekillendirme fonksiyonunu test eder — DB,
   network, React cache(), Next.js Metadata API, generateMetadata,
   sitemap, robots, StructuredData'nın HİÇBİRİNE dokunulmaz/mock'lanmaz
   (çünkü helper'ın kendisi bunların hiçbirini kullanmıyor). Görev
   listesindeki 14 zorunlu senaryo + birkaç ek güvenlik-sınırı testi
   (segment-sınırlı prefix eşleşmesi, kök path özel durumu) içerir.
   =============================================================== */

import { describe, it, expect } from "vitest";

import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";

const TR_PATH = "/kiralik-villa/villa-in-love";
const EN_PATH = "/en/kiralik-villa/villa-in-love";
const DE_PATH = "/de/kiralik-villa/villa-in-love";

describe("buildLocaleAlternates", () => {
  /* --- 1) TR villa path --- */
  it("1) TR villa path → languages.tr orijinal path'in AYNISI", () => {
    const result = buildLocaleAlternates(TR_PATH, "tr");
    expect(result.languages.tr).toBe(TR_PATH);
  });

  /* --- 2) EN villa path --- */
  it("2) EN villa path → languages.en '/en' prefix'li", () => {
    const result = buildLocaleAlternates(TR_PATH, "en");
    expect(result.languages.en).toBe(EN_PATH);
  });

  /* --- 3) DE villa path --- */
  it("3) DE villa path → languages.de '/de' prefix'li", () => {
    const result = buildLocaleAlternates(TR_PATH, "de");
    expect(result.languages.de).toBe(DE_PATH);
  });

  /* --- 4) x-default --- */
  it("4) x-default HER ZAMAN TR path'e işaret eder (hedef locale ne olursa olsun)", () => {
    expect(buildLocaleAlternates(TR_PATH, "tr").languages["x-default"]).toBe(TR_PATH);
    expect(buildLocaleAlternates(TR_PATH, "en").languages["x-default"]).toBe(TR_PATH);
    expect(buildLocaleAlternates(TR_PATH, "de").languages["x-default"]).toBe(TR_PATH);
  });

  /* --- 5) TR canonical --- */
  it("5) locale='tr' → canonical, prefix'siz TR path'tir", () => {
    const result = buildLocaleAlternates(TR_PATH, "tr");
    expect(result.canonical).toBe(TR_PATH);
  });

  /* --- 6) EN canonical --- */
  it("6) locale='en' → canonical, '/en' prefix'li path'tir", () => {
    const result = buildLocaleAlternates(TR_PATH, "en");
    expect(result.canonical).toBe(EN_PATH);
  });

  /* --- 7) DE canonical --- */
  it("7) locale='de' → canonical, '/de' prefix'li path'tir", () => {
    const result = buildLocaleAlternates(TR_PATH, "de");
    expect(result.canonical).toBe(DE_PATH);
  });

  /* --- 8) EN prefixed input normalize --- */
  it("8) input zaten '/en/...' ile prefixed ve locale='en' → çifte prefix OLUŞMAZ ('/en/en/...' değil)", () => {
    const result = buildLocaleAlternates(EN_PATH, "en");
    expect(result.canonical).toBe(EN_PATH);
    expect(result.canonical).not.toContain("/en/en/");
    expect(result.languages.tr).toBe(TR_PATH);
    expect(result.languages.de).toBe(DE_PATH);
  });

  /* --- 9) DE prefixed input normalize --- */
  it("9) input zaten '/de/...' ile prefixed ve locale='de' → çifte prefix OLUŞMAZ ('/de/de/...' değil)", () => {
    const result = buildLocaleAlternates(DE_PATH, "de");
    expect(result.canonical).toBe(DE_PATH);
    expect(result.canonical).not.toContain("/de/de/");
    expect(result.languages.tr).toBe(TR_PATH);
    expect(result.languages.en).toBe(EN_PATH);
  });

  /* --- 10) TR input normalize (çapraz yön: prefixed input + tr hedefi) --- */
  it("10) input '/en/...' prefixed ama hedef locale='tr' → canonical prefix'siz TR path'e NORMALIZE olur", () => {
    const result = buildLocaleAlternates(EN_PATH, "tr");
    expect(result.canonical).toBe(TR_PATH);
    expect(result.languages.tr).toBe(TR_PATH);
  });

  /* --- 11) '/tr/...' hiçbir zaman üretilmez --- */
  it("11) hiçbir input/locale kombinasyonu '/tr' prefix'i ÜRETMEZ", () => {
    const inputs = [TR_PATH, EN_PATH, DE_PATH, "/", "/kiralik-villalar"];
    const locales: Locale[] = ["tr", "en", "de"];
    for (const input of inputs) {
      for (const locale of locales) {
        const result = buildLocaleAlternates(input, locale);
        expect(result.canonical.startsWith("/tr")).toBe(false);
        expect(result.languages.tr.startsWith("/tr")).toBe(false);
        expect(result.languages.en.startsWith("/tr")).toBe(false);
        expect(result.languages.de.startsWith("/tr")).toBe(false);
        expect(result.languages["x-default"].startsWith("/tr")).toBe(false);
      }
    }
  });

  /* --- 12) supported locale davranışı --- */
  it("12) SUPPORTED_LOCALES'teki HER locale için geçerli, ayrışık bir canonical üretir", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const result = buildLocaleAlternates(TR_PATH, locale);
      expect(typeof result.canonical).toBe("string");
      expect(result.canonical.startsWith("/")).toBe(true);
    }
  });

  it("12b) geçersiz/desteklenmeyen bir locale değeri (TS bypass) throw ETMEZ, güvenli şekilde TR'ye düşer", () => {
    const invalidLocale = "fr" as unknown as Locale;
    const result = buildLocaleAlternates(TR_PATH, invalidLocale);
    expect(result.canonical).toBe(TR_PATH);
  });

  /* --- 13) path sonundaki slash davranışı --- */
  it("13) trailing slash STRIP EDİLMEZ — olduğu gibi (tek kopya) taşınır, yeni bir kural icat edilmez", () => {
    const withSlash = "/kiralik-villa/villa-in-love/";
    const result = buildLocaleAlternates(withSlash, "en");
    expect(result.canonical).toBe("/en/kiralik-villa/villa-in-love/");
    expect(result.languages.tr).toBe(withSlash);
  });

  /* --- 14) query/hash yanlışlıkla eklenmiyor/bozulmuyor --- */
  it("14) query string + hash opak taşınır — parse/strip/encode EDİLMEZ", () => {
    const withQueryAndHash = "/kiralik-villa/villa-in-love?ref=abc&utm=x#section";
    const result = buildLocaleAlternates(withQueryAndHash, "en");
    expect(result.canonical).toBe(
      "/en/kiralik-villa/villa-in-love?ref=abc&utm=x#section"
    );
    // Yalnız prefix eklendi; query/hash karakterleri BOZULMADI.
    expect(result.canonical).toContain("?ref=abc&utm=x#section");
  });

  /* --- Ek: segment-sınırlı prefix eşleşmesi (yanlış pozitif KORUMASI) --- */
  it("ek) '/energy-report' gibi path'ler '/en' prefix'i taşıyormuş gibi YANLIŞ ALGILANMAZ", () => {
    const falsePositiveCandidate = "/energy-report";
    const result = buildLocaleAlternates(falsePositiveCandidate, "tr");
    // Eğer segment sınırı doğru çalışıyorsa, "/en" YANLIŞLIKLA soyulmaz;
    // TR canonical path'in TAMAMI korunur.
    expect(result.canonical).toBe(falsePositiveCandidate);
    expect(result.languages.en).toBe(`/en${falsePositiveCandidate}`);
  });

  /* --- Ek: kök path özel durumu ("/") --- */
  it("ek) path='/' → EN/DE '/en/' veya '/de/' değil, '/en' ve '/de' üretir (çifte slash yok)", () => {
    const result = buildLocaleAlternates("/", "en");
    expect(result.languages.tr).toBe("/");
    expect(result.languages.en).toBe("/en");
    expect(result.languages.de).toBe("/de");
    expect(result.languages["x-default"]).toBe("/");
  });

  /* --- Ek: leading slash eksikse eklenir (sitemap.ts:74-83 ile aynı desen) --- */
  it("ek) baştaki '/' eksikse eklenir (mevcut sitemap.ts url() convention'ıyla tutarlı)", () => {
    const result = buildLocaleAlternates("kiralik-villa/villa-in-love", "en");
    expect(result.canonical).toBe(EN_PATH);
  });
});
