/* ==============================================================
   🛡️ PHASE 10C — TOPBAR D°L DEĞİŞTİRİCİ: TESTLER
   ==============================================================
   Hedef: app/components/layout/TopBar.tsx'e eklenen dil değiştirici
   (bkz. lib/i18n/locale-switch.helper.ts, dictionaries `common.language`).

   TopBar zaten kendi `getPublicSettingsAction()` fetch'ine sahip
   ("use client", useEffect + cancelled guard, DEĞİŞMEDİ) — bu dosyada
   o fetch mock'lanır (gerçek DB/RPC'ye ÇİKMAZ, diğer proje testleriyle
   AYNI convention — bkz. tests/unit/BookingSidebar.pool-heating.test.tsx).
   `usePathname()` (next/navigation) ve `useCurrency()` (CurrencyContext)
   de shallow mock'lanır — bu testlerin amacı dil değiştirici + TopBar'ın
   MEVCUT davranışının regresyonu, currency context'in kendi iç mantığı
   DEĞİLI (o ayrı bir dosyanın kapsamı).

   14 kullanıcı-onaylı senaryo + ek regresyon testleri:
     1-3)   Görünürlük: multilingual kapalı/açık/settings-null.
     4-9)   Aktif locale + hedef URL'ler (ana sayfa, villa detay, TR/EN/DE).
     10-12) Fallback-to-home (locale karşılığı olmayan route'lar).
     13-16) Regresyon: currency seçici, sosyal ikonlar, 7/24 destek,
            telefon/e-posta ETKİLENMEDİ.
     17-19) Dropdown mekaniği: aç/kapa, dışa-tık, aktif locale
            tıklanamaz + aria-current.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { tr } from "@/lib/i18n/dictionaries/tr";
import { en } from "@/lib/i18n/dictionaries/en";
import { de } from "@/lib/i18n/dictionaries/de";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";

const usePathnameMock = vi.fn();
/* 🛡️ QUERY KORUMA FAZI — dil değiştirici artık `useSearchParams()`
   de okuyor (hedef URL'lerde mevcut query string korunsun diye).
   Mock, Next'in `ReadonlyURLSearchParams` yerine düz `URLSearchParams`
   döner — component yalnız `.toString()` çağırır. */
const useSearchParamsMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useSearchParams: () => useSearchParamsMock(),
}));

const getPublicSettingsMock = vi.fn();
vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: () => getPublicSettingsMock(),
}));

/* 🛡️ useCurrency shallow mock — CurrencyProvider'ın kendi localStorage/
   rate mantığı bu dosyanın kapsamı DIŞINDA (ayrı, dokunulmayan bir
   context). Currency seçicinin TopBar içindeki MEVCUT davranışının
   (state/dropdown/seçim) regresyonu aşağıda test edilir. */
const setCurrencyMock = vi.fn();
vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({
    currency: "TRY",
    setCurrency: setCurrencyMock,
    rates: {},
  }),
}));

import TopBar from "@/app/components/layout/TopBar";

const LANGUAGE_LABEL: Record<"tr" | "en" | "de", string> = {
  tr: "Dil",
  en: "Language",
  de: "Sprache",
};

const BASE_SETTINGS = {
  phone: "+90 555 555 55 55",
  email: "info@example.com",
  whatsapp_link: null as string | null,
  instagram: "https://instagram.com/example",
  facebook: "https://facebook.com/example",
  youtube: "https://youtube.com/example",
  tiktok: "https://tiktok.com/example",
};

function settingsWith(
  overrides: Partial<typeof BASE_SETTINGS & { multilingual_enabled: boolean | null }>
) {
  return { ...BASE_SETTINGS, multilingual_enabled: false, ...overrides };
}

describe("TopBar — Phase 10C dil değiştirici", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    useSearchParamsMock.mockReset();
    getPublicSettingsMock.mockReset();
    setCurrencyMock.mockReset();
    usePathnameMock.mockReturnValue("/");
    useSearchParamsMock.mockReturnValue(new URLSearchParams(""));
  });

  /* --- 1-3) GÖRÜNÜRLÜK --- */

  it("1) multilingual_enabled=false → dil değiştirici RENDER EDİLMEZ, currency seçici etkilenmez", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: false }));
    render(<TopBar />);
    expect(await screen.findByText("TRY")).toBeInTheDocument();
    expect(screen.queryByLabelText(LANGUAGE_LABEL.tr)).not.toBeInTheDocument();
  });

  it("2) multilingual_enabled=true → dil değiştirici render edilir", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    expect(await screen.findByLabelText(LANGUAGE_LABEL.tr)).toBeInTheDocument();
  });

  it("3) settings null (fetch başarısız/okunamıyor) → TOPBAR'IN TAMAMI (dil değiştirici dahil) render edilmez — fail-safe", async () => {
    getPublicSettingsMock.mockResolvedValue(null);
    const { container } = render(<TopBar />);
    await waitFor(() => expect(getPublicSettingsMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByLabelText(LANGUAGE_LABEL.tr)).not.toBeInTheDocument();
  });

  /* --- 4-9) AKTİF LOCALE + HEDEF URL'LER --- */

  it("4) '/' (TR ana sayfa) → aktif locale TR, EN→'/en', DE→'/de'", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.tr);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.tr));
    const trOption = screen.getByRole("option", { name: "TR" });
    expect(trOption.tagName).toBe("SPAN");
    expect(trOption).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute("href", "/en");
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute("href", "/de");
  });

  it("5) '/en' (EN ana sayfa) → aktif locale EN, TR→'/', DE→'/de'", async () => {
    usePathnameMock.mockReturnValue("/en");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.en);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.en));
    expect(screen.getByRole("option", { name: "EN" }).tagName).toBe("SPAN");
    expect(screen.getByRole("option", { name: "TR" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute("href", "/de");
  });

  it("6) '/de' (DE ana sayfa) → aktif locale DE, TR→'/', EN→'/en'", async () => {
    usePathnameMock.mockReturnValue("/de");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.de);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.de));
    expect(screen.getByRole("option", { name: "DE" }).tagName).toBe("SPAN");
    expect(screen.getByRole("option", { name: "TR" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute("href", "/en");
  });

  it("7) '/kiralik-villa/test' (TR villa detay) → EN→'/en/kiralik-villa/test', DE→'/de/kiralik-villa/test'", async () => {
    usePathnameMock.mockReturnValue("/kiralik-villa/test");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.tr);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.tr));
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute(
      "href",
      "/en/kiralik-villa/test"
    );
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute(
      "href",
      "/de/kiralik-villa/test"
    );
  });

  it("8) '/en/kiralik-villa/test' (EN villa detay) → TR→'/kiralik-villa/test', DE→'/de/kiralik-villa/test'", async () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villa/test");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.en);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.en));
    expect(screen.getByRole("option", { name: "TR" })).toHaveAttribute(
      "href",
      "/kiralik-villa/test"
    );
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute(
      "href",
      "/de/kiralik-villa/test"
    );
  });

  it("9) '/de/kiralik-villa/test' (DE villa detay) → TR→'/kiralik-villa/test', EN→'/en/kiralik-villa/test'", async () => {
    usePathnameMock.mockReturnValue("/de/kiralik-villa/test");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.de);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.de));
    expect(screen.getByRole("option", { name: "TR" })).toHaveAttribute(
      "href",
      "/kiralik-villa/test"
    );
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute(
      "href",
      "/en/kiralik-villa/test"
    );
  });

  /* --- 10-12) LOCALE ROUTE'LARI + FALLBACK-TO-HOME ---
     🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA: `/teklif-al` artık GERÇEK `/en` ve
     `/de` route'larına sahip → fallback DEĞİL, prefix'li hedef.
     Fallback davranışı `/blog` (12) ile doğrulanmaya devam ediyor. */

  it("10) '/teklif-al' → EN→'/en/teklif-al', DE→'/de/teklif-al'", async () => {
    usePathnameMock.mockReturnValue("/teklif-al");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.tr);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.tr));
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute(
      "href",
      "/en/teklif-al"
    );
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute(
      "href",
      "/de/teklif-al"
    );
  });

  it("11) '/en/teklif-al' → TR→'/teklif-al'", async () => {
    usePathnameMock.mockReturnValue("/en/teklif-al");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.en);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.en));
    expect(screen.getByRole("option", { name: "TR" })).toHaveAttribute(
      "href",
      "/teklif-al"
    );
  });

  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — `/en|de/blog` GERÇEK route'ları
     eklendi; `/de/blog` artık fallback DEĞİL, locale-routed. */
  it("12) '/de/blog' → EN→'/en/blog' (artık locale route'u var)", async () => {
    usePathnameMock.mockReturnValue("/de/blog");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.de);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.de));
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute(
      "href",
      "/en/blog"
    );
  });

  /* --- 13-16) REGRESYON: mevcut TopBar davranışı ETKİLENMEDİ --- */

  it("13) currency seçici hâlâ çalışıyor (dil değiştirici AÇIKKEN) — ayrı state, birbirini etkilemez", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    const curButton = await screen.findByText("TRY");
    fireEvent.click(curButton);
    expect(screen.getByRole("option", { name: /USD/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /USD/ }));
    expect(setCurrencyMock).toHaveBeenCalledWith("USD");
    // Dil değiştirici dropdown'ı hâlâ kapalı — currency seçimi onu tetiklemedi.
    expect(screen.queryByRole("option", { name: "TR" })).not.toBeInTheDocument();
  });

  it("14) dil değiştirici açıkken currency seçici KAPALI kalır (bağımsız state)", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.tr);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.tr));
    expect(screen.getByRole("option", { name: "TR" })).toBeInTheDocument();
    // Currency dropdown'ı bu tıklamadan ETKİLENMEDİ (hâlâ kapalı).
    expect(screen.queryByRole("option", { name: /USD/ })).not.toBeInTheDocument();
  });

  it("15) sosyal ikonlar, 7/24 destek, telefon/e-posta — multilingual açıkken de DEĞİŞMEDİ", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.tr);
    expect(screen.getByText("7/24 Destek")).toBeInTheDocument();
    expect(screen.getByText(BASE_SETTINGS.phone)).toBeInTheDocument();
    expect(screen.getByText(BASE_SETTINGS.email)).toBeInTheDocument();
    expect(screen.getByLabelText("Instagram")).toBeInTheDocument();
    expect(screen.getByLabelText("Facebook")).toBeInTheDocument();
    expect(screen.getByLabelText("YouTube")).toBeInTheDocument();
    expect(screen.getByLabelText("TikTok")).toBeInTheDocument();
  });

  it("16) sosyal ikonlar, 7/24 destek, telefon/e-posta — multilingual KAPALİYKEN de DEĞİŞMEDİ (regresyon)", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: false }));
    render(<TopBar />);
    await screen.findByText("7/24 Destek");
    expect(screen.getByText(BASE_SETTINGS.phone)).toBeInTheDocument();
    expect(screen.getByText(BASE_SETTINGS.email)).toBeInTheDocument();
    expect(screen.getByText("TRY")).toBeInTheDocument();
  });

  /* --- 17-19) DROPDOWN MEKANIğİ --- */

  it("17) dil değiştirici butonuna tıklayınca dropdown açılır, tekrar tıklayınca kapanır", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    const langButton = await screen.findByLabelText(LANGUAGE_LABEL.tr);
    expect(screen.queryByRole("listbox", { name: LANGUAGE_LABEL.tr })).not.toBeInTheDocument();
    fireEvent.click(langButton);
    expect(screen.getByRole("listbox", { name: LANGUAGE_LABEL.tr })).toBeInTheDocument();
    fireEvent.click(langButton);
    expect(screen.queryByRole("listbox", { name: LANGUAGE_LABEL.tr })).not.toBeInTheDocument();
  });

  it("18) dropdown açıkken dışarı tıklanınca kapanır (dışa-tık — currency ile AYNI mekanik)", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    const langButton = await screen.findByLabelText(LANGUAGE_LABEL.tr);
    fireEvent.click(langButton);
    expect(screen.getByRole("listbox", { name: LANGUAGE_LABEL.tr })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox", { name: LANGUAGE_LABEL.tr })).not.toBeInTheDocument();
  });

  it("19) aktif locale seçeneği tıklanamaz (span, Link değil) — diğer ikisi tıklanabilir Link", async () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villalar");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.en);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.en));
    const activeOption = screen.getByRole("option", { name: "EN" });
    expect(activeOption.tagName).toBe("SPAN");
    expect(activeOption).not.toHaveAttribute("href");
    expect(screen.getByRole("option", { name: "TR" }).tagName).toBe("A");
    expect(screen.getByRole("option", { name: "DE" }).tagName).toBe("A");
  });

  /* ═══════════════════════════════════════════════════════════════
     20-28) QUERY STRING KORUMA (/arama dil değiştirme düzeltmesi)
     ═══════════════════════════════════════════════════════════════
     SORUN: `/de/arama?villa-turleri=...&flexible=3` üzerindeyken EN'e
     geçince `/en/arama` üretiliyor, query KAYBOLUYORDU.
     BEKLENEN: yalnız locale segmenti değişir; query string EKSİKSİZ,
     AYNEN (parametre adı/değeri/sırası/encoding) korunur. */

  /** Kullanıcının bildirdiği GERÇEK örnek query — birebir. */
  const ARAMA_QUERY =
    "villa-turleri=2027-kiralik-villalar%2Cmuhafazakar-villalar&flexible=3";

  /** Verilen pathname + query ile switcher'ı açar. */
  async function openSwitcher(pathname: string, query: string, label: string) {
    usePathnameMock.mockReturnValue(pathname);
    useSearchParamsMock.mockReturnValue(new URLSearchParams(query));
    getPublicSettingsMock.mockResolvedValue(
      settingsWith({ multilingual_enabled: true })
    );
    render(<TopBar />);
    await screen.findByLabelText(label);
    fireEvent.click(screen.getByLabelText(label));
  }

  it("20) '/arama' + query → EN/DE hedefleri AYNI query'yi korur", async () => {
    await openSwitcher("/arama", ARAMA_QUERY, LANGUAGE_LABEL.tr);
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute(
      "href",
      `/en/arama?${ARAMA_QUERY}`
    );
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute(
      "href",
      `/de/arama?${ARAMA_QUERY}`
    );
  });

  it("21) '/en/arama' + query → DE hedefi AYNI query'yi korur", async () => {
    await openSwitcher("/en/arama", ARAMA_QUERY, LANGUAGE_LABEL.en);
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute(
      "href",
      `/de/arama?${ARAMA_QUERY}`
    );
    expect(screen.getByRole("option", { name: "TR" })).toHaveAttribute(
      "href",
      `/arama?${ARAMA_QUERY}`
    );
  });

  it("22) '/de/arama' + query → TR hedefi AYNI query'yi korur (kullanıcı senaryosu)", async () => {
    await openSwitcher("/de/arama", ARAMA_QUERY, LANGUAGE_LABEL.de);
    expect(screen.getByRole("option", { name: "TR" })).toHaveAttribute(
      "href",
      `/arama?${ARAMA_QUERY}`
    );
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute(
      "href",
      `/en/arama?${ARAMA_QUERY}`
    );
  });

  it("23) BİRDEN FAZLA parametre (sıra dahil) korunur", async () => {
    const q = "regions=fethiye&guests=6&start=2026-07-01&end=2026-07-08&page=2";
    await openSwitcher("/arama", q, LANGUAGE_LABEL.tr);
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute(
      "href",
      `/en/arama?${q}`
    );
  });

  it("24) `villa-turleri` VİRGÜLLÜ değerleri canonical slug olarak korunur (çevrilmez)", async () => {
    const q = "villa-turleri=2027-kiralik-villalar%2Cmuhafazakar-villalar";
    await openSwitcher("/de/arama", q, LANGUAGE_LABEL.de);
    const en = screen.getByRole("option", { name: "EN" });
    expect(en).toHaveAttribute("href", `/en/arama?${q}`);
    expect(en.getAttribute("href")).toContain(
      "2027-kiralik-villalar%2Cmuhafazakar-villalar"
    );
  });

  it("25) `flexible` parametresi korunur", async () => {
    await openSwitcher("/arama", "flexible=3", LANGUAGE_LABEL.tr);
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute(
      "href",
      "/de/arama?flexible=3"
    );
  });

  it("26) query YOKSA mevcut davranış BİREBİR korunur (soru işareti eklenmez)", async () => {
    await openSwitcher("/arama", "", LANGUAGE_LABEL.tr);
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute(
      "href",
      "/en/arama"
    );
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute(
      "href",
      "/de/arama"
    );
  });

  it("27) URL encoding BOZULMAZ (percent-encoded değerler aynen taşınır)", async () => {
    const q = "regions=k%C3%B6ycegiz%2Csarigerme&villa-turleri=a%2Cb";
    await openSwitcher("/arama", q, LANGUAGE_LABEL.tr);
    const href = screen.getByRole("option", { name: "EN" })!.getAttribute("href");
    expect(href).toBe(`/en/arama?${q}`);
    expect(href).not.toContain("köycegiz");
  });

  it("28) DİĞER locale route'ları ETKİLENMEZ: fallback hâlâ query'siz kök, villa detay query'yi korur", async () => {
    /* (a) locale karşılığı OLMAYAN path → hâlâ query'siz locale kökü.
       🛡️ `/blog` ARTIK locale-routed olduğu için gerçek bir fallback
       örneğiyle (bilinmeyen path) değiştirildi. */
    await openSwitcher("/bilinmeyen-sayfa", "foo=bar", LANGUAGE_LABEL.tr);
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute("href", "/en");
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute("href", "/de");
    cleanup();

    /* (a1) 🛡️ `/blog` ARTIK locale route'u → query AYNEN korunur */
    await openSwitcher("/blog", "foo=bar", LANGUAGE_LABEL.tr);
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute(
      "href",
      "/en/blog?foo=bar"
    );
    cleanup();

    /* (a2) 🛡️ `/teklif-al` ARTIK locale route'u → query AYNEN korunur */
    await openSwitcher("/teklif-al", "foo=bar", LANGUAGE_LABEL.tr);
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute(
      "href",
      "/en/teklif-al?foo=bar"
    );
    cleanup();

    /* (b) query'siz villa detay → Phase 10C davranışı BİREBİR aynı */
    await openSwitcher("/kiralik-villa/test", "", LANGUAGE_LABEL.tr);
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute(
      "href",
      "/en/kiralik-villa/test"
    );
  });

  /* ═══════════════════════════════════════════════════════════════
     29-40) STATİK METİN ÇOKLU DİLİ (TR/EN/DE)
     ═══════════════════════════════════════════════════════════════
     TopBar'ın hardcoded TR metinleri MEVCUT `header` namespace'ine
     taşındı (yeni namespace/provider/hook YOK). Marka adı "Costeralla
     Travel" ÖZEL İSİM olduğu için ÇEVRİLMEZ; sosyal medya etiketleri
     (Instagram/Facebook/...) de marka adıdır. */

  /** Belirtilen path + multilingual bayrağı ile TopBar'ı mount eder. */
  async function mountAt(pathname: string, multilingual = true) {
    usePathnameMock.mockReturnValue(pathname);
    getPublicSettingsMock.mockResolvedValue(
      settingsWith({ multilingual_enabled: multilingual })
    );
    render(<TopBar />);
    await screen.findByText("Costeralla Travel");
  }

  it("29) TR ('/') → '7/24 Destek' ve TR belge satırı BİREBİR (regresyon)", async () => {
    await mountAt("/");
    expect(screen.getByText("7/24 Destek")).toBeInTheDocument();
    expect(
      screen.getByText("TURSAB A Grubu Acenta · Belge No: 13303")
    ).toBeInTheDocument();
  });

  it("29b) TR alt sayfada da ('/kiralik-villalar') TR metinler", async () => {
    await mountAt("/kiralik-villalar");
    expect(screen.getByText("7/24 Destek")).toBeInTheDocument();
  });

  it("30) EN ('/en') → '24/7 Support' + EN belge satırı", async () => {
    await mountAt("/en");
    expect(screen.getByText("24/7 Support")).toBeInTheDocument();
    expect(
      screen.getByText("TURSAB Group A Agency · License No: 13303")
    ).toBeInTheDocument();
    expect(screen.queryByText("7/24 Destek")).not.toBeInTheDocument();
  });

  it("31) DE ('/de') → '24/7 Support' + DE belge satırı", async () => {
    await mountAt("/de");
    expect(screen.getByText("24/7 Support")).toBeInTheDocument();
    expect(
      screen.getByText("TURSAB Agentur der Gruppe A · Lizenznr.: 13303")
    ).toBeInTheDocument();
    expect(screen.queryByText("7/24 Destek")).not.toBeInTheDocument();
  });

  it("32) EN/DE alt sayfalarda da locale'e göre çözülür", async () => {
    await mountAt("/en/kiralik-villa/test");
    expect(screen.getByText("24/7 Support")).toBeInTheDocument();
    cleanup();
    await mountAt("/de/arama");
    expect(
      screen.getByText("TURSAB Agentur der Gruppe A · Lizenznr.: 13303")
    ).toBeInTheDocument();
  });

  it("33) MARKA ADI hiçbir dilde çevrilmez (özel isim)", async () => {
    for (const p of ["/", "/en", "/de"]) {
      await mountAt(p);
      expect(screen.getByText("Costeralla Travel")).toBeInTheDocument();
      cleanup();
    }
  });

  it("34) SOSYAL MEDYA etiketleri marka adıdır — çevrilmez", async () => {
    await mountAt("/de");
    for (const label of ["Instagram", "Facebook", "WhatsApp", "YouTube"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("35) multilingual KAPALI + TR → metinler BİREBİR eskisi gibi", async () => {
    await mountAt("/", false);
    expect(screen.getByText("7/24 Destek")).toBeInTheDocument();
    expect(
      screen.getByText("TURSAB A Grubu Acenta · Belge No: 13303")
    ).toBeInTheDocument();
    /* Dil değiştirici görünmez (mevcut davranış DEĞİŞMEDİ). */
    expect(screen.queryByLabelText(LANGUAGE_LABEL.tr)).not.toBeInTheDocument();
  });

  it("36) belge NUMARASI üç dilde de AYNI (yalnız etiket çevrilir)", async () => {
    for (const p of ["/", "/en", "/de"]) {
      await mountAt(p);
      expect(screen.getByText(/13303/)).toBeInTheDocument();
      expect(screen.getByText(/TURSAB/)).toBeInTheDocument();
      cleanup();
    }
  });

  it("37) EN metinleri ile locale switch query koruması BİRLİKTE çalışır", async () => {
    usePathnameMock.mockReturnValue("/en/arama");
    useSearchParamsMock.mockReturnValue(new URLSearchParams(ARAMA_QUERY));
    getPublicSettingsMock.mockResolvedValue(
      settingsWith({ multilingual_enabled: true })
    );
    render(<TopBar />);
    await screen.findByText("24/7 Support");
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.en));
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute(
      "href",
      `/de/arama?${ARAMA_QUERY}`
    );
  });

  /* ===============================================================
     🔒 44-48) DROPDOWN İKON/BAYRAK SÖZLEŞMESİ
     ===============================================================
     Kapalı tetikleyicide seçili kurun sembolü ve seçili dilin bayrağı
     ZATEN vardı; bu tur dropdown SEÇENEKLERİNE de eklendi. Testler
     hem yeni sunumu hem de "iş mantığı değişmedi" garantisini kilitler.
  =============================================================== */

  it("44) KUR dropdown'ı — her seçenek KENDİ sembolünü gösterir", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(
      settingsWith({ multilingual_enabled: true })
    );
    const { container } = render(<TopBar />);
    fireEvent.click(await screen.findByText("TRY"));

    const list = container.querySelector('ul[role="listbox"]');
    expect(list).not.toBeNull();
    const rows = Array.from(list!.querySelectorAll('[role="option"]')).map(
      (o) => o.textContent || ""
    );
    expect(rows).toEqual(["₺TRY", "$USD", "€EUR", "£GBP"]);
    /* Bayrak <img> ARTIK kur listesinde YOK (kur ≠ ülke). */
    expect(list!.querySelectorAll("img")).toHaveLength(0);
  });

  it("45) KUR dropdown'ı — erişilebilir ad hâlâ SADECE kod (mevcut testler bozulmaz)", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(
      settingsWith({ multilingual_enabled: true })
    );
    render(<TopBar />);
    fireEvent.click(await screen.findByText("TRY"));
    expect(screen.getByRole("option", { name: "USD" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "EUR" })).toBeInTheDocument();
  });

  it("46) KUR seçimi — sembol eklenmesi setCurrency davranışını DEĞİŞTİRMEDİ", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(
      settingsWith({ multilingual_enabled: true })
    );
    render(<TopBar />);
    fireEvent.click(await screen.findByText("TRY"));
    fireEvent.click(screen.getByRole("option", { name: "EUR" }));
    expect(setCurrencyMock).toHaveBeenCalledWith("EUR");
    expect(setCurrencyMock).toHaveBeenCalledTimes(1);
  });

  it("47) DİL dropdown'ı — her seçenek KENDİ bayrağını gösterir (emoji DEĞİL, /flags/*.svg)", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(
      settingsWith({ multilingual_enabled: true })
    );
    const { container } = render(<TopBar />);
    fireEvent.click(await screen.findByLabelText(LANGUAGE_LABEL.tr));

    const list = container.querySelector('ul[role="listbox"]');
    expect(list).not.toBeNull();
    const srcs = Array.from(list!.querySelectorAll("img")).map((i) =>
      i.getAttribute("src")
    );
    expect(srcs).toEqual(["/flags/tr.svg", "/flags/gb.svg", "/flags/de.svg"]);
    /* Bayraklar dekoratif → erişilebilir ad SADECE dil kodu kalır. */
    expect(screen.getByRole("option", { name: "TR" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "EN" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "DE" })).toBeInTheDocument();
  });

  it("48) DİL seçimi — bayrak eklenmesi hedef URL'leri DEĞİŞTİRMEDİ", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(
      settingsWith({ multilingual_enabled: true })
    );
    render(<TopBar />);
    fireEvent.click(await screen.findByLabelText(LANGUAGE_LABEL.tr));
    expect(screen.getByRole("option", { name: "TR" }).tagName).toBe("SPAN");
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute(
      "href",
      "/en"
    );
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute(
      "href",
      "/de"
    );
  });
});

/* ═══════════════════════════════════════════════════════════════
   38-42) DICTIONARY BÜTÜNLÜĞÜ + SOURCE-LOCK
   ═══════════════════════════════════════════════════════════════ */
describe("TopBar — dictionary bütünlüğü ve source-lock", () => {
  const TOPBAR_SRC = "app/components/layout/TopBar.tsx";

  /** Yorumları temizler — source-lock YALNIZ koda bakmalı. */
  function stripComments(src: string): string {
    const out: string[] = [];
    let i = 0;
    const n = src.length;
    let state: "code" | "block" | "line" = "code";
    while (i < n) {
      const ch = src[i];
      if (state === "code") {
        if (src.startsWith("/*", i)) {
          state = "block";
          i += 2;
          continue;
        }
        if (src.startsWith("//", i)) {
          state = "line";
          i += 2;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
          const q = ch;
          out.push(ch);
          i += 1;
          while (i < n) {
            if (src[i] === "\\") {
              out.push(src[i]);
              if (i + 1 < n) out.push(src[i + 1]);
              i += 2;
              continue;
            }
            out.push(src[i]);
            if (src[i] === q) {
              i += 1;
              break;
            }
            i += 1;
          }
          continue;
        }
        out.push(ch);
        i += 1;
        continue;
      }
      if (state === "block") {
        if (src.startsWith("*/", i)) {
          state = "code";
          i += 2;
          continue;
        }
        out.push(ch === "\n" ? "\n" : " ");
        i += 1;
        continue;
      }
      if (ch === "\n") {
        state = "code";
        out.push("\n");
        i += 1;
        continue;
      }
      out.push(" ");
      i += 1;
    }
    return out.join("");
  }

  const code = stripComments(
    fs.readFileSync(path.join(process.cwd(), TOPBAR_SRC), "utf-8")
  );

  it("38) TR değerleri ESKİ hardcoded metinlerle BİREBİR", () => {
    expect(tr.header.supportBadge).toBe("7/24 Destek");
    expect(tr.header.agencyCredential).toBe(
      "TURSAB A Grubu Acenta · Belge No: {no}"
    );
  });

  it("39) yeni key'ler TR/EN/DE'de MEVCUT ve dolu", () => {
    for (const [name, d] of [
      ["tr", tr],
      ["en", en],
      ["de", de],
    ] as const) {
      for (const k of ["supportBadge", "agencyCredential"] as const) {
        expect(typeof d.header[k], `${name}.${k}`).toBe("string");
        expect(d.header[k].trim().length, `${name}.${k}`).toBeGreaterThan(0);
      }
    }
  });

  it("40) `{no}` placeholder üç dilde de KORUNUYOR", () => {
    for (const d of [tr, en, de]) {
      expect(d.header.agencyCredential).toContain("{no}");
      /* Numara çeviri metnine GÖMÜLMEZ (tek kaynak component'te). */
      expect(d.header.agencyCredential).not.toContain("13303");
    }
  });

  it("41) EN'de Türkçe karakter yok; DE'de Türkçeye ÖZGÜ karakter yok", () => {
    for (const k of ["supportBadge", "agencyCredential"] as const) {
      expect(/[çÇğĞıİöÖşŞüÜ]/.test(en.header[k]), `en.${k}`).toBe(false);
      expect(/[çÇğĞıİşŞ]/.test(de.header[k]), `de.${k}`).toBe(false);
    }
  });

  it("42) SOURCE-LOCK — TopBar kodunda hardcoded TR metin KALMADI", () => {
    for (const s of [
      "7/24 Destek",
      "TURSAB A Grubu Acenta",
      "Belge No",
      "Destek",
    ]) {
      expect(code.includes(s), s).toBe(false);
    }
    /* Dictionary üzerinden okunuyor. */
    expect(code.includes("dictionary.header.supportBadge")).toBe(true);
    expect(code.includes("dictionary.header.agencyCredential")).toBe(true);
  });

  it("43) marka adı ve belge numarası KODDA kalır (çeviri kapsamı dışı)", () => {
    expect(code.includes("Costeralla Travel")).toBe(true);
    expect(code.includes("13303")).toBe(true);
  });

});
