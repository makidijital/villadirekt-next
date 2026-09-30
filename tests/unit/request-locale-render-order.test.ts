/* ===============================================================
   🛡️ PHASE 7E — B) İLLÜSTRATİF: "parent önce render olur" hazard'ı
   ===============================================================
   Bu dosya, `html-lang-layout.test.ts`'teki audit bulgusunun ARKA
   PLANINI, Phase 4B'nin `tests/unit/request-locale.test.ts`
   dosyasındaki AYNI, kanıtlanmış `cache()` mock deseniyle (vi.mock
   MODÜL TOP-LEVEL'DA, `beforeEach` de MODÜL TOP-LEVEL'DA — hiçbiri
   bir `describe` callback'i İÇİNE YERLEŞTİRİLMEDİ, tam olarak
   request-locale.test.ts'teki KANITLANMIŞ yapı) İLLÜSTRATİF olarak
   gösterir.

   ÖNEMLİ SINIRLAMA (raporda da AÇIKÇA belirtildi): bu test GERÇEK
   Next.js RSC render'ını simüle ETMEZ — yalnız `request-locale.
   server.ts` store'unun "daha önce yapılan bir okuma, daha SONRA
   yapılan bir yazmayı GÖRMEZ" ilkel (primitive-capture) davranışını
   gösterir. Bu, Next.js'in KENDİSİNİN garanti ettiği bir davranış
   değildir — audit'in asıl kanıtı `html-lang-layout.test.ts`'in başlık
   yorumunda özetlenen Next.js KAYNAK KODU incelemesidir (RSC
   parent-önce-child sırası + `next/root-params`'ın bu projenin
   dynamic-segment'siz routing mimarisinde kullanılamaz olması). Bu
   dosya SADECE destekleyici/eğitici bir illüstrasyondur — "test
   geçiyor" diye gerçek request davranışı hakkında varsayım
   YAPILMADI (Phase 7E §9 talimatı gereği).

   `react`'in `cache()` export'u BU DOSYA KAPSAMINDA mock'lanıyor —
   bu yüzden `app/layout.tsx` gibi gerçek React davranışına bağımlı
   modüller BU dosyada import EDİLMİYOR (onlar `html-lang-layout.
   test.ts`'te, ayrı bir dosyada, gerçek `react` ile test ediliyor).
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T): T => {
      let hasRun = false;
      let cached: ReturnType<T>;
      return ((...args: Parameters<T>) => {
        if (!hasRun) {
          cached = fn(...args) as ReturnType<T>;
          hasRun = true;
        }
        return cached;
      }) as T;
    },
  };
});

beforeEach(() => {
  vi.resetModules();
});

describe("B) İLLÜSTRATİF — 'parent önce render olur' hazard'ı (Phase 4B store'u üzerinde)", () => {
  it("1/4) 'RootLayout' konumunda (page render'ından ÖNCE) okunan locale → DEFAULT 'tr' (henüz kimse setRequestLocale çağırmadı)", async () => {
    const { getRequestLocale } = await import(
      "@/lib/i18n/request-locale.server"
    );
    // Bu, RootLayout'un JSX'i üretirken yapacağı okumayı simüle eder —
    // bu noktada page'in setRequestLocale çağrısı HENÜZ ÇALIŞMADI.
    const rootLayoutObservedLocale = getRequestLocale();
    expect(rootLayoutObservedLocale).toBe("tr");
  });

  it("2/4-3/4) page (child) DAHA SONRA setRequestLocale('en'/'de') çağırsa bile, RootLayout'un DAHA ÖNCE okuduğu/JSX'e GÖMDÜĞÜ değer DEĞİŞMEZ (primitive capture)", async () => {
    const { getRequestLocale, setRequestLocale } = await import(
      "@/lib/i18n/request-locale.server"
    );

    // 1) RootLayout render sırası: page'den ÖNCE okur, JSX'e gömer.
    const htmlLangEmittedByRootLayout = getRequestLocale();

    // 2) Page (EnVillaDetailPage) render sırası: RootLayout'tan SONRA
    //    çalışır, kendi locale'ini yazar.
    setRequestLocale("en");

    // 3) RootLayout'un ZATEN döndürdüğü <html lang> değeri hâlâ "tr" —
    //    page'in yazması GERİYE DÖNÜK etkilemedi (string primitive,
    //    referans değil). Bu YÜZDEN root layout'ta getRequestLocale()
    //    okumak EN/DE için asla doğru sonucu ÜRETEMEZ.
    expect(htmlLangEmittedByRootLayout).toBe("tr");
    expect(getRequestLocale()).toBe("en"); // store'un GÜNCEL hâli "en" —
    // ama RootLayout bunu ASLA GÖRMEDİ, çünkü ondan ÖNCE okudu.
  });

  it("4/4) geçersiz/hiç set edilmemiş locale → güvenli fallback 'tr' (DEFAULT_LOCALE, Phase 1B ile AYNI)", async () => {
    const { getRequestLocale } = await import(
      "@/lib/i18n/request-locale.server"
    );
    expect(getRequestLocale()).toBe("tr");
  });
});
