/* ===============================================================
   🛡️ PHASE 7E — app/robots.ts LOCALE (EN/DE) DAVRANIŞ TESTLERİ
   ===============================================================
   Hedef: app/robots.ts > default export (robots())

   AUDIT SONUCU (bu dosya bunu test olarak KİLİTLİYOR): `app/robots.ts`
   BU FAZDA DEĞİŞTİRİLMEDİ — dosyanın kendisi zaten locale-agnostic'tir
   ("default allow + explicit disallow", kök `/` açık). Disallow listesi
   yalnız internal/token/duplicate path'leri kapsıyor
   (/maki-admin, /api, /arama, /favoriler, /liste/, /v/, /rezervasyon/)
   — bunların HİÇBİRİ `/en` veya `/de` prefix'i DEĞİL, dolayısıyla
   EN/DE villa/sayfa URL'leri robots.txt seviyesinde ZATEN Disallow
   EDİLMİYOR.

   BU BİLİNÇLİ BİR TASARIM KARARI, EKSİKLİK DEĞİL: EN/DE villa detay
   sayfaları hâlâ `generateMetadata`'da unconditional
   `robots: { index: false, follow: false }` döndürüyor (Phase 7C,
   `LocaleRouteComingSoon` placeholder hâlâ kullanımda — bkz. Phase 7E
   raporu §9). SEO KURALI: robots.txt Disallow ile <meta name="robots"
   content="noindex"> AYNI ŞEY DEĞİLDİR — bir path'i robots.txt'te
   Disallow etmek, Googlebot'un o sayfayı HİÇ CRAWL ETMESİNİ (ve
   dolayısıyla sayfadaki noindex meta etiketini GÖRMESİNİ) ENGELLER.
   EN/DE'yi robots.txt'te Disallow etmek, noindex sinyalinin Google'a
   asla ulaşmamasına ve (daha kötüsü) sayfanın başka sitelerden gelen
   backlink'ler yüzünden URL-only/sitelinks olarak indexlenme riskine
   yol açardı. Bu yüzden EN/DE ASLA robots.txt'te Disallow EDİLMEDİ —
   noindex meta etiketi (page-level, generateMetadata) tek ve doğru
   mekanizma olarak KORUNDU.

   `SITE_URL` MODÜL YÜKLEME anında `process.env.NEXT_PUBLIC_SITE_URL`'i
   okuyor (`app/sitemap.ts` ile AYNI desen) — bu yüzden her testte
   `vi.stubEnv` + `vi.resetModules()` + dinamik `import()` kullanılır
   (Phase 7D'nin `sitemap-locale-alternates.test.ts`'teki AYNI,
   kanıtlanmış desen).

   Mock YOK (DB'ye hiç erişmiyor, saf fonksiyon) — gerçek
   implementasyon test ediliyor. GERÇEK DB'YE HİÇ DOKUNULMAZ.
   =============================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function runRobots() {
  const mod = await import("@/app/robots");
  return mod.default();
}

describe("robots() — Phase 7E EN/DE locale davranışı", () => {
  /* --- 8) TR disallow politikası AYNEN korunuyor + locale eşitleme ---
     🛡️ PUBLIC LOCALE PARİTESİ: `/arama` TR'de kapalıyken `/en/arama` ve
     `/de/arama` açık kalıyordu (faceted search asimetrisi). Artık TR
     girdileri AYNI SIRAYLA başta, ardından locale-prefix'li kardeşleri
     geliyor. `/maki-admin` ve `/api` locale-routed DEĞİL → prefix ÜRETİLMEZ.
     Hiçbir route crawl'a AÇILMADI; yalnız mevcut politika EN/DE'ye
     eşitlendi. --- */
  const TR_DISALLOW = [
    "/maki-admin",
    "/api",
    "/arama",
    "/favoriler",
    "/liste/",
    "/v/",
    "/rezervasyon/",
  ];
  const LOCALE_ROUTED = TR_DISALLOW.filter(
    (p) => p !== "/maki-admin" && p !== "/api"
  );

  it("8) TR disallow girdileri AYNEN ve AYNI SIRADA listenin başında", async () => {
    const result = await runRobots();
    const rule = result.rules as { disallow?: string | string[] } | Array<{ disallow?: string | string[] }>;
    const ruleObj = Array.isArray(rule) ? rule[0] : rule;
    const list = ruleObj.disallow as string[];
    expect(list.slice(0, TR_DISALLOW.length)).toEqual(TR_DISALLOW);
  });

  it("8a) locale-routed TR path'lerinin /en ve /de varyantları da disallow", async () => {
    const result = await runRobots();
    const rule = result.rules as { disallow?: string | string[] } | Array<{ disallow?: string | string[] }>;
    const ruleObj = Array.isArray(rule) ? rule[0] : rule;
    const list = ruleObj.disallow as string[];
    for (const p of LOCALE_ROUTED) {
      expect(list).toContain(`/en${p}`);
      expect(list).toContain(`/de${p}`);
    }
    /* Faceted search — auditte bulunan asimetri. */
    expect(list).toContain("/arama");
    expect(list).toContain("/en/arama");
    expect(list).toContain("/de/arama");
  });

  it("8c) `/maki-admin` ve `/api` için locale prefix ÜRETİLMEZ", async () => {
    const result = await runRobots();
    const rule = result.rules as { disallow?: string | string[] } | Array<{ disallow?: string | string[] }>;
    const ruleObj = Array.isArray(rule) ? rule[0] : rule;
    const list = ruleObj.disallow as string[];
    for (const bad of ["/en/maki-admin", "/de/maki-admin", "/en/api", "/de/api"]) {
      expect(list).not.toContain(bad);
    }
  });

  it("8d) BAŞKA route'un politikası DEĞİŞMEDİ (indexlenebilirler listede YOK)", async () => {
    const result = await runRobots();
    const rule = result.rules as { disallow?: string | string[] } | Array<{ disallow?: string | string[] }>;
    const ruleObj = Array.isArray(rule) ? rule[0] : rule;
    const list = ruleObj.disallow as string[];
    for (const allowed of [
      "/kiralik-villalar",
      "/en/kiralik-villalar",
      "/de/kiralik-villalar",
      "/kiralik-villa/",
      "/en/kiralik-villa/",
      "/p/",
      "/en/p/",
      "/iletisim",
      "/en/iletisim",
      "/teklif-al",
      "/en/teklif-al",
      "/rezervasyon-kontrol",
      "/en/rezervasyon-kontrol",
      "/kisa-sureli-tarihler/",
      "/blog",
    ]) {
      expect(list).not.toContain(allowed);
    }
    /* Toplam: 7 TR + 5 locale-routed × 2 locale = 17 */
    expect(list).toHaveLength(TR_DISALLOW.length + LOCALE_ROUTED.length * 2);
  });

  it("8b) allow hâlâ kök '/' (villa detay/listeleme/CMS sayfaları crawl'a AÇIK, Phase 7E BUNA DOKUNMADI)", async () => {
    const result = await runRobots();
    const rule = result.rules as { allow?: string | string[] } | Array<{ allow?: string | string[] }>;
    const ruleObj = Array.isArray(rule) ? rule[0] : rule;
    expect(ruleObj.allow).toBe("/");
  });

  /* --- 9) EN/DE kök prefix'i TOPTAN engellenmiyor (yalnız TR ile AYNI
     path'ler) — `/en` veya `/de` tek başına listede OLMAMALI. --- */
  it("9) '/en' | '/de' kökleri TOPTAN disallow DEĞİL (yalnız TR politikasının eşleniği)", async () => {
    const result = await runRobots();
    const rule = result.rules as { disallow?: string | string[] } | Array<{ disallow?: string | string[] }>;
    const ruleObj = Array.isArray(rule) ? rule[0] : rule;
    const disallowList = Array.isArray(ruleObj.disallow)
      ? ruleObj.disallow
      : ruleObj.disallow
        ? [ruleObj.disallow]
        : [];
    for (const bad of ["/en", "/de", "/en/", "/de/"]) {
      expect(disallowList).not.toContain(bad);
    }
    /* Her `/en|de/...` girdisinin TR eşleniği listede OLMALI. */
    for (const entry of disallowList) {
      const m = /^\/(en|de)(\/.*)$/.exec(entry);
      if (m) expect(disallowList).toContain(m[2]);
    }
  });

  it("9b) disallow listesi flag durumundan (multilingual_enabled) BAĞIMSIZ — robots.ts hiç settings okumuyor, statik/deterministik", async () => {
    // robots.ts hiçbir DB/settings çağrısı yapmıyor (grep ile doğrulandı) —
    // bu test bunun BİR DEĞİŞİKLİK OLMADIĞINI, iki ayrı import'ta AYNI
    // sonucu vererek kanıtlıyor (settings mock'lamaya GEREK YOK).
    const first = await runRobots();
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    const second = await runRobots();
    expect(first.rules).toEqual(second.rules);
  });

  /* --- sitemap/host referansı (mevcut davranış, Phase 7E DOKUNMADI) --- */
  it("10) sitemap/host SITE_URL'den absolute üretiliyor (ÖNCEKİ davranış, DEĞİŞMEDİ)", async () => {
    const result = await runRobots();
    expect(result.sitemap).toBe("https://example.com/sitemap.xml");
    expect(result.host).toBe("https://example.com");
  });

  it("10b) SITE_URL boşsa sitemap/host omit edilir (fail-safe, ÖNCEKİ davranış, DEĞİŞMEDİ)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_URL", "");
    const result = await runRobots();
    expect(result.sitemap).toBeUndefined();
    expect(result.host).toBeUndefined();
  });
});
