/* ===============================================================
   🛡️ PHASE 1B — LOCALE CORE TESTS
   ===============================================================
   Hedef: lib/i18n/config.ts
     • Locale type / SUPPORTED_LOCALES / DEFAULT_LOCALE
     • isSupportedLocale / toLocale
     • resolveLocale
     • isMultilingualEnabled / getPublicDefaultLocale (settings entegrasyonu)

   Bu testler yalnız yeni, izole locale-core primitive'lerini kapsar.
   price-engine / discount / pool-heating / reservation testlerine
   HİÇ dokunulmadı.
=============================================================== */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  toLocale,
  resolveLocale,
  isMultilingualEnabled,
  getPublicDefaultLocale,
  localeFromPathname,
} from "@/lib/i18n/config";

describe("SUPPORTED_LOCALES / DEFAULT_LOCALE", () => {
  it("SUPPORTED_LOCALES sadece tr/en/de içerir", () => {
    expect(SUPPORTED_LOCALES).toEqual(["tr", "en", "de"]);
  });

  it("DEFAULT_LOCALE tr'dir", () => {
    expect(DEFAULT_LOCALE).toBe("tr");
  });
});

describe("isSupportedLocale", () => {
  it("'tr' geçerli", () => {
    expect(isSupportedLocale("tr")).toBe(true);
  });

  it("'en' geçerli", () => {
    expect(isSupportedLocale("en")).toBe(true);
  });

  it("'de' geçerli", () => {
    expect(isSupportedLocale("de")).toBe(true);
  });

  it("desteklenmeyen değer geçersiz ('fr')", () => {
    expect(isSupportedLocale("fr")).toBe(false);
  });

  it("boş string geçersiz", () => {
    expect(isSupportedLocale("")).toBe(false);
  });

  it("undefined/null geçersiz", () => {
    expect(isSupportedLocale(undefined)).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
  });

  it("string olmayan değerler geçersiz", () => {
    expect(isSupportedLocale(123)).toBe(false);
    expect(isSupportedLocale({})).toBe(false);
  });
});

describe("toLocale", () => {
  it("geçerli locale aynen döner", () => {
    expect(toLocale("en")).toBe("en");
    expect(toLocale("de")).toBe("de");
    expect(toLocale("tr")).toBe("tr");
  });

  it("geçersiz/tanınmayan değer -> tr fallback", () => {
    expect(toLocale("fr")).toBe("tr");
    /* case-sensitive — büyük harf normalize edilmez, bilinçli olarak
       geçersiz sayılır (üst katman gerekirse normalize eder). */
    expect(toLocale("EN")).toBe("tr");
  });

  it("undefined/null/empty -> tr fallback", () => {
    expect(toLocale(undefined)).toBe("tr");
    expect(toLocale(null)).toBe("tr");
    expect(toLocale("")).toBe("tr");
  });
});

describe("resolveLocale", () => {
  it("geçerli explicit locale verilmişse onu kullanır", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("de")).toBe("de");
    expect(resolveLocale("tr")).toBe("tr");
  });

  it("geçersiz locale verilmişse tr'ye düşer", () => {
    expect(resolveLocale("fr")).toBe("tr");
  });

  it("locale verilmemişse tr'ye düşer", () => {
    expect(resolveLocale()).toBe("tr");
    expect(resolveLocale(undefined)).toBe("tr");
    expect(resolveLocale(null)).toBe("tr");
  });
});

describe("isMultilingualEnabled (Phase 1A settings entegrasyonu)", () => {
  it("multilingual_enabled=true -> true", () => {
    expect(isMultilingualEnabled({ multilingual_enabled: true })).toBe(true);
  });

  it("multilingual_enabled=false -> false", () => {
    expect(isMultilingualEnabled({ multilingual_enabled: false })).toBe(
      false
    );
  });

  it("multilingual_enabled=null/undefined -> false (fail-safe kapalı)", () => {
    expect(isMultilingualEnabled({ multilingual_enabled: null })).toBe(false);
    expect(isMultilingualEnabled({})).toBe(false);
  });

  it("settings null/undefined -> false", () => {
    expect(isMultilingualEnabled(null)).toBe(false);
    expect(isMultilingualEnabled(undefined)).toBe(false);
  });
});

describe("localeFromPathname (Phase 9A — Header client-side locale tespiti)", () => {
  it("'/en' veya '/en/...' -> 'en'", () => {
    expect(localeFromPathname("/en")).toBe("en");
    expect(localeFromPathname("/en/kiralik-villa/ornek-slug")).toBe("en");
    expect(localeFromPathname("/en/kiralik-villalar")).toBe("en");
  });

  it("'/de' veya '/de/...' -> 'de'", () => {
    expect(localeFromPathname("/de")).toBe("de");
    expect(localeFromPathname("/de/kiralik-villa/ornek-slug")).toBe("de");
  });

  it("TR path'leri (prefix yok) -> 'tr'", () => {
    expect(localeFromPathname("/")).toBe("tr");
    expect(localeFromPathname("/kiralik-villa/ornek-slug")).toBe("tr");
    expect(localeFromPathname("/kiralik-villalar")).toBe("tr");
    expect(localeFromPathname("/arama")).toBe("tr");
  });

  it("segment sınırı korunur — '/en'/'/de' ile BAŞLAYAN ama farklı bir segment olan path'ler YANLIŞLIKLA eşleşmez", () => {
    expect(localeFromPathname("/energy-tasarrufu")).toBe("tr");
    expect(localeFromPathname("/destek")).toBe("tr");
    expect(localeFromPathname("/development")).toBe("tr");
  });

  it("null/undefined/boş -> 'tr' fallback", () => {
    expect(localeFromPathname(null)).toBe("tr");
    expect(localeFromPathname(undefined)).toBe("tr");
    expect(localeFromPathname("")).toBe("tr");
  });

  it("'/tr' prefix'i (bu projede hiç üretilmez) yine de savunmacı olarak 'tr'ye düşer", () => {
    expect(localeFromPathname("/tr")).toBe("tr");
    expect(localeFromPathname("/tr/kiralik-villa/x")).toBe("tr");
  });
});

describe("getPublicDefaultLocale (Phase 1A settings entegrasyonu)", () => {
  it("geçerli public_default_locale aynen döner", () => {
    expect(getPublicDefaultLocale({ public_default_locale: "en" })).toBe(
      "en"
    );
    expect(getPublicDefaultLocale({ public_default_locale: "de" })).toBe(
      "de"
    );
  });

  it("geçersiz/bozuk değer -> tr fallback (DB CHECK bypass edilse bile güvenli)", () => {
    expect(getPublicDefaultLocale({ public_default_locale: "fr" })).toBe(
      "tr"
    );
  });

  it("null/undefined -> tr fallback", () => {
    expect(getPublicDefaultLocale({ public_default_locale: null })).toBe(
      "tr"
    );
    expect(getPublicDefaultLocale({})).toBe("tr");
    expect(getPublicDefaultLocale(null)).toBe("tr");
    expect(getPublicDefaultLocale(undefined)).toBe("tr");
  });
});
