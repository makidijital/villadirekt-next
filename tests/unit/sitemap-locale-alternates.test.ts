/* ===============================================================
   🛡️ PHASE 7D — SITEMAP LOCALE ALTERNATES TESTLERİ
   ===============================================================
   Hedef: app/sitemap.ts > default export (sitemap())

   `app/sitemap.ts` içindeki `SITE_URL` sabiti MODÜL YÜKLEME anında
   `process.env.NEXT_PUBLIC_SITE_URL`'i okuyor — bu yüzden her testte
   `vi.stubEnv` + `vi.resetModules()` + dinamik `import()` kullanılır
   (request-locale.test.ts'teki AYNI, kanıtlanmış desen — cache()'in
   modül-seviyesi sabitler için de geçerli bir analogu).

   Mock seviyesi: yalnız DB repository'leri (`villaAdminRepository`,
   `pagesRepository`, `blogRepository`) ve `getCachedSettings`
   mock'lanır — hiçbiri bu fazda GERÇEKTEN değiştirilmedi.
   `buildLocaleAlternates` (Phase 7B) mock'lanmıyor, gerçek
   implementasyonuyla çalışıyor.

   GERÇEK DB'YE HİÇ DOKUNULMAZ, production'a bağlanılmaz.
   =============================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const listPublicSlugsMock = vi.fn();
const findActivePagesMock = vi.fn();
const findActiveSlugsMock = vi.fn();
const getCachedSettingsMock = vi.fn();

vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    listPublicSlugs: (...args: unknown[]) => listPublicSlugsMock(...args),
  },
}));
vi.mock("@/lib/db/pages.repository", () => ({
  pagesRepository: {
    findActivePages: (...args: unknown[]) => findActivePagesMock(...args),
  },
}));
vi.mock("@/lib/db/blog.repository", () => ({
  blogRepository: {
    findActiveSlugs: (...args: unknown[]) => findActiveSlugsMock(...args),
  },
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: (...args: unknown[]) => getCachedSettingsMock(...args),
}));

const VILLA_ROWS = [
  { slug: "villa-in-love", created_at: "2024-01-01T00:00:00.000Z" },
  { slug: "villa-sunset", created_at: "2024-02-01T00:00:00.000Z" },
];

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");

  listPublicSlugsMock.mockReset();
  findActivePagesMock.mockReset();
  findActiveSlugsMock.mockReset();
  getCachedSettingsMock.mockReset();

  listPublicSlugsMock.mockResolvedValue(VILLA_ROWS);
  findActivePagesMock.mockResolvedValue({
    data: [{ slug: "hakkimizda", created_at: "2024-01-01T00:00:00.000Z" }],
    error: null,
  });
  findActiveSlugsMock.mockResolvedValue({
    data: [
      {
        slug: "ilk-yazi",
        published_at: "2024-01-01T00:00:00.000Z",
        updated_at: null,
      },
    ],
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function runSitemap() {
  const mod = await import("@/app/sitemap");
  return mod.default();
}

function villaEntry(
  entries: Awaited<ReturnType<typeof runSitemap>>,
  slug: string
) {
  return entries.find((e) => e.url === `https://example.com/kiralik-villa/${slug}`);
}

describe("sitemap() — Phase 7D villa locale alternates", () => {
  /* --- 5) multilingual false -> EN/DE sitemap yok --- */
  it("5) multilingual_enabled=false → hiçbir entry'de `alternates` YOK, EN/DE URL'si HİÇ üretilmiyor", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });

    const entries = await runSitemap();
    const villa = villaEntry(entries, "villa-in-love");
    expect(villa).toBeDefined();
    expect((villa as Record<string, unknown>).alternates).toBeUndefined();

    // Sitemap'te HİÇBİR /en veya /de URL'i yok.
    const hasEnDeUrl = entries.some(
      (e) => e.url.includes("/en/") || e.url.includes("/de/")
    );
    expect(hasEnDeUrl).toBe(false);
  });

  it("5b) getCachedSettings reddederse (fail-safe) → flag false davranışıyla AYNI", async () => {
    getCachedSettingsMock.mockRejectedValue(new Error("settings down"));

    const entries = await runSitemap();
    const villa = villaEntry(entries, "villa-in-love");
    expect((villa as Record<string, unknown>).alternates).toBeUndefined();
  });

  /* --- 6) multilingual true -> locale alternate doğru --- */
  it("6) multilingual_enabled=true → villa entry'sinin alternates.languages doğru (absolute URL'ler)", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });

    const entries = await runSitemap();
    const villa = villaEntry(entries, "villa-in-love") as {
      alternates?: { languages?: Record<string, string> };
    };
    expect(villa.alternates?.languages).toEqual({
      tr: "https://example.com/kiralik-villa/villa-in-love",
      en: "https://example.com/en/kiralik-villa/villa-in-love",
      de: "https://example.com/de/kiralik-villa/villa-in-love",
      "x-default": "https://example.com/kiralik-villa/villa-in-love",
    });
  });

  it("6b) EN/DE için AYRI bir sitemap URL entry'si YOK (multilingual=true iken bile)", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });

    const entries = await runSitemap();
    const hasEnDeUrl = entries.some(
      (e) => e.url.includes("/en/") || e.url.includes("/de/")
    );
    expect(hasEnDeUrl).toBe(false);
  });

  /* --- 7) TR canonical URL değişmiyor --- */
  it("7) villa entry'sinin `url` alanı flag true/false FARK ETMEKSİZİN AYNI TR path'tir", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
    const withFlagOff = await runSitemap();

    vi.resetModules();
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
    const withFlagOn = await runSitemap();

    const urlOff = villaEntry(withFlagOff, "villa-in-love")?.url;
    const urlOn = villaEntry(withFlagOn, "villa-in-love")?.url;
    expect(urlOff).toBe("https://example.com/kiralik-villa/villa-in-love");
    expect(urlOn).toBe(urlOff);
  });

  /* --- 8) /tr hiçbir yerde oluşmuyor --- */
  it("8) HİÇBİR entry/alternates değeri '/tr' prefix'i İÇERMEZ", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });

    const entries = await runSitemap();
    for (const entry of entries) {
      expect(entry.url.startsWith("https://example.com/tr")).toBe(false);
      const alt = (entry as { alternates?: { languages?: Record<string, string> } })
        .alternates;
      if (alt?.languages) {
        for (const value of Object.values(alt.languages)) {
          expect(value.startsWith("https://example.com/tr")).toBe(false);
        }
      }
    }
  });

  /* --- 9) x-default TR --- */
  it("9) x-default HER ZAMAN TR (prefix'siz) URL'e eşittir", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });

    const entries = await runSitemap();
    const villa = villaEntry(entries, "villa-sunset") as {
      alternates?: { languages?: Record<string, string> };
    };
    expect(villa.alternates?.languages?.["x-default"]).toBe(
      "https://example.com/kiralik-villa/villa-sunset"
    );
    expect(villa.alternates?.languages?.["x-default"]).toBe(
      villa.alternates?.languages?.tr
    );
  });

  /* --- 10) mevcut diğer sitemap entry'leri korunuyor --- */
  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — `/`, `/kiralik-villalar`,
     `/iletisim`, `/teklif-al` ve `/p/[slug]` ARTIK gerçek `/en` + `/de`
     route'larına sahip → sitemap onlara da `alternates.languages` verir.
     🛡️ BLOG da ARTIK `/en|de/blog` + `/en|de/blog/[slug]` route'larına
     sahip (migration 089 `blog_post_translations`) → alternates TAŞIR. */
  it("10) locale route'u OLAN entry'ler alternates taşır (blog dahil)", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });

    const entries = await runSitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain("https://example.com/");
    expect(urls).toContain("https://example.com/kiralik-villalar");
    expect(urls).toContain("https://example.com/iletisim");
    expect(urls).toContain("https://example.com/teklif-al");
    expect(urls).toContain("https://example.com/p/hakkimizda");
    expect(urls).toContain("https://example.com/blog");
    expect(urls).toContain("https://example.com/blog/ilk-yazi");

    const byUrl = new Map(entries.map((e) => [e.url, e]));
    const localized = [
      "https://example.com/",
      "https://example.com/kiralik-villalar",
      "https://example.com/iletisim",
      "https://example.com/teklif-al",
      "https://example.com/p/hakkimizda",
      "https://example.com/blog",
      "https://example.com/blog/ilk-yazi",
    ];
    for (const u of localized) {
      const alt = (byUrl.get(u) as Record<string, unknown> | undefined)
        ?.alternates as { languages?: Record<string, string> } | undefined;
      expect(alt?.languages).toBeDefined();
      expect(Object.keys(alt!.languages!).sort()).toEqual([
        "de",
        "en",
        "tr",
        "x-default",
      ]);
    }

    /* Ana sayfa hreflang'i `buildLocaleAlternates` ile birebir. */
    const homeAlt = (
      byUrl.get("https://example.com/") as Record<string, unknown>
    ).alternates as { languages: Record<string, string> };
    expect(homeAlt.languages.en).toBe("https://example.com/en");
    expect(homeAlt.languages.de).toBe("https://example.com/de");
    expect(homeAlt.languages.tr).toBe("https://example.com/");

    /* BLOG hreflang — `buildLocaleAlternates` ile birebir. */
    const blogAlt = (
      byUrl.get("https://example.com/blog/ilk-yazi") as Record<string, unknown>
    ).alternates as { languages: Record<string, string> };
    expect(blogAlt.languages.tr).toBe("https://example.com/blog/ilk-yazi");
    expect(blogAlt.languages.en).toBe("https://example.com/en/blog/ilk-yazi");
    expect(blogAlt.languages.de).toBe("https://example.com/de/blog/ilk-yazi");
    expect(blogAlt.languages["x-default"]).toBe(blogAlt.languages.tr);

    // Toplam entry sayısı: 4 statik + 2 villa + 1 page + 1 blog-index + 1 blog = 9
    expect(entries).toHaveLength(9);
  });

  it("10a) `multilingual_enabled=false` → HİÇBİR entry alternates taşımaz", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });

    const entries = await runSitemap();
    for (const entry of entries) {
      expect((entry as Record<string, unknown>).alternates).toBeUndefined();
    }
  });

  it("10b) villa fetch exception atarsa (fail-soft) diğer entry'ler yine döner (ÖNCEKİ davranış)", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
    listPublicSlugsMock.mockRejectedValue(new Error("db down"));

    const entries = await runSitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://example.com/");
    expect(urls.some((u) => u.includes("/kiralik-villa/"))).toBe(false);
  });
});
