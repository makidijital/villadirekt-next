/* ===============================================================
   🔄 HEADER/FOOTER WRAPPER — CACHE SEAM KİLİDİ
   ===============================================================
   AMAÇ (tek, dar):
     HeaderWrapper ve FooterWrapper'ın public veri okumalarını
     `lib/cache.helpers.ts`'teki MEVCUT `unstable_cache`
     sarmalayıcıları üzerinden yaptığını KİLİTLEMEK.

   NEDEN AYRI BİR DOSYA:
     Mevcut testler (`menu-name-locale`, `page-menu-title-locale`,
     `villa-type-name-locale`, `footer-locale`) davranışı doğrular ve
     HER İKİ seam'i de (`services/*` ve `lib/cache.helpers`) aynı mock
     fonksiyonlarına bağlar → wrapper hangisini kullanırsa kullansın
     geçerler. Bu dosya bilinçli olarak İKİ seam'i FARKLI verilerle
     mock'lar; böylece yanlış seam kullanıldığında test DÜŞER.

   KAPSAM DIŞI (bilinçli):
     • `menuRepository.findAllVillaLocations/Types` ve
       `pagesRepository.findActivePages` DEĞİŞTİRİLMEDİ —
       `getCachedVillaLocations/Types` FARKLI sorgu çalıştırır
       (ORDER BY) ve footer sonucu `.slice(0, 7)` ile kırptığı için
       swap GÖRÜNEN veriyi değiştirirdi. Aşağıda bu da kilitlenir.
     • Yeni cache mekanizması KURULMADI; tag/revalidation yolu AYNEN.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/* ---------------- ortak client mock'ları ---------------- */
const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

vi.mock("@/app/components/layout/TopBar", () => ({ default: () => null }));
vi.mock("@/app/components/layout/VillaSearchBox", () => ({
  default: () => null,
}));
vi.mock("@/app/components/favorites/HeaderFavoritesLink", () => ({
  default: () => null,
}));

/* ---------------- SEAM 1 — doğrudan servisler (ESKİ yol) ----------------
   Wrapper'lar bunları ARTIK ÇAĞIRMAMALI. Bilerek CACHE'ten FARKLI
   veri döndürürler ki karışıklık gözle görülür olsun. */
const getPublicSettingsDirect = vi.fn();
vi.mock("@/app/services/settings.service", () => ({
  getPublicSettings: (...a: unknown[]) => getPublicSettingsDirect(...a),
}));

const getMenuDirect = vi.fn();
vi.mock("@/app/services/menu.service", () => ({
  getMenu: (...a: unknown[]) => getMenuDirect(...a),
}));

/* ---------------- SEAM 2 — cache sarmalayıcıları (YENİ yol) ---------------- */
const getCachedSettingsMock = vi.fn();
const getCachedMenuMock = vi.fn();
const getCachedVillaLocationsMock = vi.fn();
const getCachedVillaTypesMock = vi.fn();
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: (...a: unknown[]) => getCachedSettingsMock(...a),
  getCachedMenu: (...a: unknown[]) => getCachedMenuMock(...a),
  getCachedVillaLocations: (...a: unknown[]) =>
    getCachedVillaLocationsMock(...a),
  getCachedVillaTypes: (...a: unknown[]) => getCachedVillaTypesMock(...a),
}));

/* ---------------- footer veri kaynakları (DEĞİŞMEDİ) ---------------- */
const findAllVillaLocationsMock = vi.fn();
const findAllVillaTypesMock = vi.fn();
vi.mock("@/lib/db/menu.repository", () => ({
  menuRepository: {
    findAllVillaLocations: (...a: unknown[]) => findAllVillaLocationsMock(...a),
    findAllVillaTypes: (...a: unknown[]) => findAllVillaTypesMock(...a),
  },
}));

const findActivePagesMock = vi.fn();
vi.mock("@/lib/db/pages.repository", () => ({
  pagesRepository: {
    findActivePages: (...a: unknown[]) => findActivePagesMock(...a),
  },
}));

import HeaderWrapper from "@/app/components/layout/HeaderWrapper";
import FooterWrapper from "@/app/components/layout/FooterWrapper";

/* ---------------- fixtures ----------------
   İki seam BİLEREK farklı: hangisinin okunduğu çıktıdan anlaşılır. */
const CACHED_MENU = [
  {
    id: "m-cached",
    name: "CACHED-MENU",
    href: "/cached",
    source_type: "manual",
    source_id: null,
  },
];
const DIRECT_MENU = [
  {
    id: "m-direct",
    name: "DIRECT-MENU",
    href: "/direct",
    source_type: "manual",
    source_id: null,
  },
];

/** MOD B → `trHomeHref === "/tr"`. Doğrudan servis MOD A ("/") döner. */
const CACHED_SETTINGS = {
  site_name: "CACHED-SITE",
  multilingual_enabled: true,
  public_default_locale: "de",
};
const DIRECT_SETTINGS = {
  site_name: "DIRECT-SITE",
  multilingual_enabled: false,
  public_default_locale: "tr",
};

beforeEach(() => {
  usePathnameMock.mockReset();
  usePathnameMock.mockReturnValue("/");

  getPublicSettingsDirect.mockReset();
  getMenuDirect.mockReset();
  getCachedSettingsMock.mockReset();
  getCachedMenuMock.mockReset();
  getCachedVillaLocationsMock.mockReset();
  getCachedVillaTypesMock.mockReset();
  findAllVillaLocationsMock.mockReset();
  findAllVillaTypesMock.mockReset();
  findActivePagesMock.mockReset();

  getPublicSettingsDirect.mockResolvedValue(DIRECT_SETTINGS);
  getMenuDirect.mockResolvedValue(DIRECT_MENU);
  getCachedSettingsMock.mockResolvedValue(CACHED_SETTINGS);
  getCachedMenuMock.mockResolvedValue(CACHED_MENU);
  getCachedVillaLocationsMock.mockResolvedValue([]);
  getCachedVillaTypesMock.mockResolvedValue([]);
  findAllVillaLocationsMock.mockResolvedValue({
    data: [{ id: "loc-1", name: "REPO-REGION", slug: "repo-region" }],
    error: null,
  });
  findAllVillaTypesMock.mockResolvedValue({
    data: [{ id: "type-1", name: "REPO-TYPE", slug: "repo-type" }],
    error: null,
  });
  findActivePagesMock.mockResolvedValue({ data: [], error: null });
});

/* ===============================================================
   A) HEADERWRAPPER
   =============================================================== */
describe("HeaderWrapper — cache sarmalayıcılarını kullanır", () => {
  it("1) menü CACHE'ten okunur, `getMenu()` DOĞRUDAN çağrılmaz", async () => {
    const el = await HeaderWrapper();

    expect(getCachedMenuMock).toHaveBeenCalledTimes(1);
    expect(getMenuDirect).not.toHaveBeenCalled();
    expect(el.props.menu).toEqual(CACHED_MENU);
  });

  it("2) settings CACHE'ten okunur, `getPublicSettings()` DOĞRUDAN çağrılmaz", async () => {
    const el = await HeaderWrapper();

    expect(getCachedSettingsMock).toHaveBeenCalledTimes(1);
    expect(getPublicSettingsDirect).not.toHaveBeenCalled();
    /* CACHED_SETTINGS MOD B üretir → "/tr". Doğrudan servis okunsaydı
       (DIRECT_SETTINGS, multilingual kapalı) "/" gelirdi. */
    expect(el.props.trHomeHref).toBe("/tr");
  });

  it("3) request başına TEK settings + TEK menü okuması (ek sorgu yok)", async () => {
    await HeaderWrapper();

    expect(getCachedSettingsMock).toHaveBeenCalledTimes(1);
    expect(getCachedMenuMock).toHaveBeenCalledTimes(1);
  });

  it("4) cache okuması fail olursa ÖNCEKİ fallback davranışı korunur", async () => {
    getCachedSettingsMock.mockRejectedValue(new Error("settings down"));
    getCachedMenuMock.mockRejectedValue(new Error("menu down"));

    const el = await HeaderWrapper();

    expect(el.props.siteLogo).toBeNull();
    expect(el.props.trHomeHref).toBe("/");
    expect(el.props.menu).toEqual([]);
  });
});

/* ===============================================================
   B) FOOTERWRAPPER
   =============================================================== */
describe("FooterWrapper — settings cache'ten, taksonomi AYNEN repository'den", () => {
  it("5) settings CACHE'ten okunur, `getPublicSettings()` DOĞRUDAN çağrılmaz", async () => {
    const el = await FooterWrapper();

    expect(getCachedSettingsMock).toHaveBeenCalledTimes(1);
    expect(getPublicSettingsDirect).not.toHaveBeenCalled();
    expect(el.props.settings).toEqual(CACHED_SETTINGS);
    expect(el.props.siteName).toBe("CACHED-SITE");
  });

  it("6) bölge/tip verisi HÂLÂ menuRepository'den gelir (davranış değişmedi)", async () => {
    const el = await FooterWrapper();

    expect(findAllVillaLocationsMock).toHaveBeenCalledTimes(1);
    expect(findAllVillaTypesMock).toHaveBeenCalledTimes(1);
    expect(el.props.locations[0].name).toBe("REPO-REGION");
    expect(el.props.villaTypes[0].name).toBe("REPO-TYPE");
  });

  it("7) `getCachedVillaLocations/Types` KASTEN kullanılmaz (farklı ORDER BY + slice(0,7))", async () => {
    await FooterWrapper();

    expect(getCachedVillaLocationsMock).not.toHaveBeenCalled();
    expect(getCachedVillaTypesMock).not.toHaveBeenCalled();
  });

  it("8) `pagesRepository.findActivePages` kanalı AYNEN korunur", async () => {
    await FooterWrapper();

    expect(findActivePagesMock).toHaveBeenCalledTimes(1);
  });

  it("9) settings cache reject olursa Promise.allSettled fallback'i korunur", async () => {
    getCachedSettingsMock.mockRejectedValue(new Error("settings down"));

    const el = await FooterWrapper();

    expect(el.props.settings).toBeNull();
    expect(el.props.siteName).toBe("Villa Kiralama");
    /* Diğer fetch'ler etkilenmez — ÖNCEKİ davranış. */
    expect(el.props.locations[0].name).toBe("REPO-REGION");
  });
});

/* ===============================================================
   C) KAYNAK KİLİDİ — import seam'i geri kaymasın
   =============================================================== */
describe("kaynak kilidi — wrapper import'ları", () => {
  const header = readFileSync(
    join(process.cwd(), "app/components/layout/HeaderWrapper.tsx"),
    "utf-8"
  );
  const footer = readFileSync(
    join(process.cwd(), "app/components/layout/FooterWrapper.tsx"),
    "utf-8"
  );

  /** Yorum satırlarını atarak yalnız GERÇEK kodu inceler. */
  function codeOnly(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  it("10) HeaderWrapper `@/lib/cache.helpers`'tan okur", () => {
    const code = codeOnly(header);
    expect(code).toMatch(
      /import\s*\{[^}]*getCachedMenu[^}]*\}\s*from\s*"@\/lib\/cache\.helpers"/
    );
    expect(code).toMatch(
      /import\s*\{[^}]*getCachedSettings[^}]*\}\s*from\s*"@\/lib\/cache\.helpers"/
    );
  });

  it("11) HeaderWrapper servisleri DOĞRUDAN import ETMEZ", () => {
    const code = codeOnly(header);
    expect(code).not.toMatch(/from\s*"@\/app\/services\/menu\.service"/);
    expect(code).not.toMatch(/from\s*"@\/app\/services\/settings\.service"/);
  });

  it("12) FooterWrapper `getCachedSettings` kullanır, settings servisini DOĞRUDAN import ETMEZ", () => {
    const code = codeOnly(footer);
    expect(code).toMatch(
      /import\s*\{[^}]*getCachedSettings[^}]*\}\s*from\s*"@\/lib\/cache\.helpers"/
    );
    expect(code).not.toMatch(
      /import\s*\{[^}]*getPublicSettings[^}]*\}\s*from\s*"@\/app\/services\/settings\.service"/
    );
  });

  it("13) FooterWrapper taksonomi kaynakları DEĞİŞMEDİ", () => {
    const code = codeOnly(footer);
    expect(code).toMatch(/menuRepository\.findAllVillaLocations\(\)/);
    expect(code).toMatch(/menuRepository\.findAllVillaTypes\(\)/);
    expect(code).toMatch(/pagesRepository\.findActivePages\(\)/);
    expect(code).not.toMatch(/getCachedVillaLocations/);
    expect(code).not.toMatch(/getCachedVillaTypes/);
  });
});
