/* ===============================================================
   🛡️ REZERVASYON ÇOKLU DİL (TR/EN/DE) — ROUTE + GÖVDE + FORM
   ===============================================================
   Kapsam:
     • `reservation` dictionary namespace bütünlüğü (TR/EN/DE)
     • `ReservationPageBody` — locale prop → PageHero metinleri,
       breadcrumb href'leri, ReservationForm'a locale geçişi
     • `ReservationSuccessBody` — locale prop → metinler + linkler
     • `ReservationForm` — TR parity + EN/DE render
     • Sunucu hata metni sızıntı guard'ı (409 istisnası dahil)
     • Locale-aware success redirect (`router.push`)
     • Locale switch hedefleri (/rezervasyon/*)
     • Source-lock: gövdelerde hardcoded Türkçe kullanıcı metni YOK

   🔒 DEĞİŞMEYENLER (bu test dosyası bunları da doğrular):
     fiyat hesaplama · snapshot · ödeme · pool heating · payment
     method · payload alanları · API endpoint · mail dispatch ·
     rate-limit · rezervasyon oluşturma akışı.
=============================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import { getLocaleSwitchTargets } from "@/lib/i18n/locale-switch.helper";
import type { Locale } from "@/lib/i18n/config";

/* ---------------- Mocks ---------------- */

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

/* 🛡️ useCurrency shallow mock — currency/rate mantığı bu dosyanın
   KAPSAMI DIŞINDA (fiyat motoru DEĞİŞTİRİLMEDİ). */
vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({ currency: "TRY", rates: {}, setCurrency: vi.fn() }),
}));

vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 20 })),
}));

const getCachedSettingsMock = vi.fn(async () => ({
  phone: "+90 555 111 22 33",
  whatsapp_link: "",
  updated_at: null,
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: () => getCachedSettingsMock(),
}));

/* 🛡️ Servis mock'ları — ReservationPageBody'nin ÇAĞRI SÖZLEŞMESİ
   (hangi servis, hangi argüman, hangi sıra) korunuyor mu diye
   doğrulanır; DB'ye BAĞLANILMAZ. */
const getVillaBySlugMock = vi.fn();
const getVillaPricesMock = vi.fn();
const getVillaDiscountsMock = vi.fn();
const getVillaImagesMock = vi.fn();

vi.mock("@/app/services/villa.service", () => ({
  getVillaBySlug: (...a: unknown[]) => getVillaBySlugMock(...a),
}));
vi.mock("@/app/services/villa-price.service", () => ({
  getVillaPrices: (...a: unknown[]) => getVillaPricesMock(...a),
}));
vi.mock("@/app/services/villa-discount.service", () => ({
  getVillaDiscounts: (...a: unknown[]) => getVillaDiscountsMock(...a),
}));
vi.mock("@/app/services/villa-image/villa-image.read", () => ({
  getVillaImages: (...a: unknown[]) => getVillaImagesMock(...a),
}));
vi.mock("@/lib/storage.helpers", () => ({
  resolveVillaImageUrl: (u: string | null | undefined) => u || null,
  resolveAssetUrlVersioned: (u: string | null | undefined) => u || null,
}));

import ReservationForm from "@/app/components/reservation/ReservationForm";
import ReservationPageBody from "@/app/components/reservation/ReservationPageBody";
import ReservationSuccessBody from "@/app/components/reservation/ReservationSuccessBody";
import PageHero from "@/app/components/ui/PageHero";

const LOCALES: Locale[] = ["tr", "en", "de"];

const VILLA = {
  id: "villa-1",
  slug: "test-villa",
  title: "Test Villa",
  cleaning_fee: 0,
  cleaning_currency: "TRY",
  cleaning_limit: 0,
  pool_heating_fee: 0,
  pool_heating_currency: "TRY",
  pool_heating_months: null,
  /* 🔒 Server-only alanlar — ReservationForm (client) sınırına ASLA
     geçmemeli; test 14 bunu kilitler. Form bu alanları okumaz. */
  private_access_token: "SECRET-TOKEN-TEST",
  commission_rate: 17.5,
};

function renderForm(locale?: Locale, overrides: Record<string, unknown> = {}) {
  const props: Record<string, unknown> = {
    villa: VILLA,
    /* 🛡️ FIXTURE DÜZELTMESİ (eksik sezon fiyatı koruması):
       Fixture eskiden `prices: []` idi — yani "hiç fiyatı olmayan"
       gerçekçi olmayan bir villa. Motor artık böyle bir aralıkta
       GEÇERLİ fiyat üretmediği için form gönderimi (doğru şekilde)
       kilitleniyor ve bu dosyadaki gönderim/hata-mesajı testleri
       anlamını yitiriyordu. Fixture, seçili aralığı (01→08 Haziran)
       TAM KAPSAYAN tek bir fiyat satırına çevrildi; testlerin
       assertion'ları AYNEN korundu. */
    prices: [
      {
        start_date: "2026-06-01",
        end_date: "2026-06-30",
        price: 1000,
        currency: "TRY",
      },
    ],
    discounts: [],
    start: "2026-06-01",
    end: "2026-06-08",
    image: "/cover.jpg",
    adults: "2",
    children: "1",
    poolHeatingSelected: false,
    ...overrides,
  };
  if (locale) props.locale = locale;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<ReservationForm {...(props as any)} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  getCachedSettingsMock.mockResolvedValue({
    phone: "+90 555 111 22 33",
    whatsapp_link: "",
    updated_at: null,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/public/payment-methods")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            payment_methods: [{ id: "pm-1", name: "Havale / EFT" }],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* ===============================================================
   1) DICTIONARY BÜTÜNLÜĞÜ
   =============================================================== */

function leafPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string") return [prefix];
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k)
  );
}

function leafValues(obj: unknown): string[] {
  if (typeof obj === "string") return [obj];
  if (!obj || typeof obj !== "object") return [];
  return Object.values(obj as Record<string, unknown>).flatMap(leafValues);
}

describe("reservation dictionary — TR/EN/DE bütünlüğü", () => {
  it("1) TR/EN/DE anahtar ağaçları BİREBİR aynı", () => {
    const tr = leafPaths(getDictionary("tr").reservation).sort();
    const en = leafPaths(getDictionary("en").reservation).sort();
    const de = leafPaths(getDictionary("de").reservation).sort();
    expect(en).toEqual(tr);
    expect(de).toEqual(tr);
  });

  it.each(LOCALES)("2) %s — hiçbir değer boş/whitespace değil", (locale) => {
    for (const v of leafValues(getDictionary(locale).reservation)) {
      expect(v.trim().length).toBeGreaterThan(0);
    }
  });

  it.each(LOCALES)("3) %s — beş alt namespace mevcut", (locale) => {
    const r = getDictionary(locale).reservation;
    expect(Object.keys(r).sort()).toEqual(
      ["form", "page", "success", "summary", "validation"].sort()
    );
  });

  it("4) `{n}` / `{rate}` token'ları HER dilde korunur", () => {
    for (const locale of LOCALES) {
      const r = getDictionary(locale).reservation;
      expect(r.summary.guestsCount).toContain("{n}");
      expect(r.summary.nightsCount).toContain("{n}");
      expect(r.form.guestNamePlaceholder).toContain("{n}");
      expect(r.form.guestsPersonCount).toContain("{n}");
      expect(r.form.prepaymentHint).toContain("{rate}");
    }
  });

  it("5) EN ve DE değerleri TR ile aynı DEĞİL (gerçekten çevrilmiş)", () => {
    const tr = leafValues(getDictionary("tr").reservation);
    const en = leafValues(getDictionary("en").reservation);
    const de = leafValues(getDictionary("de").reservation);
    /* Metin sayısı aynı; birebir aynı kalan metin oranı düşük olmalı. */
    expect(en.length).toBe(tr.length);
    expect(de.length).toBe(tr.length);
    /* 🛡️ ÇEVRİLEBİLİR metinler karşılaştırılır. Harf İÇERMEYEN
       değerler (ör. telefon örneği "532 123 45 67") hiçbir dilde
       farklılaşamaz; bunları "çevrilmemiş" saymak yanlış pozitif
       üretir. Eşik GEVŞETİLMEDİ — hâlâ 3; yalnız çevrilemez örnekler
       kümeden çıkarıldı. */
    const translatable = (v: string, i: number) =>
      /\p{L}/u.test(tr[i]) || /\p{L}/u.test(v);
    const sameEn = en.filter(
      (v, i) => v === tr[i] && translatable(v, i)
    ).length;
    const sameDe = de.filter(
      (v, i) => v === tr[i] && translatable(v, i)
    ).length;
    expect(sameEn).toBeLessThan(3);
    expect(sameDe).toBeLessThan(3);
  });

  it("6) TR değerleri ESKİ hardcoded metinlerle BİREBİR", () => {
    const r = getDictionary("tr").reservation;
    expect(r.page.title).toBe("Kişisel Bilgilerinizi Girin");
    expect(r.page.description).toBe(
      "Rezervasyon talebini aldıktan sonra ekibimiz seninle iletişime geçecek."
    );
    expect(r.page.badgeEyebrow).toBe("Rezervasyon");
    expect([r.page.badgeLine1, r.page.badgeLine2, r.page.badgeLine3]).toEqual([
      "Güvenli Ödeme",
      "Hızlı Onay",
      "Destek Ekibi",
    ]);
    expect(r.page.invalidUrl).toBe("Geçersiz URL");
    expect(r.page.notFoundEyebrow).toBe("404");
    expect(r.page.notFoundTitle).toBe("Villa bulunamadı");
    expect(r.form.submit).toBe("Rezervasyon Gönder");
    expect(r.form.submitting).toBe("Gönderiliyor…");
    expect(r.success.metaTitle).toBe("Rezervasyon Talebiniz Alındı");
  });

  it("7) `booking` namespace REUSE — ikinci kopya üretilmedi", () => {
    const b = getDictionary("tr").booking;
    expect(b.accommodationAmountLabel).toBe("Konaklama Tutarı ({n} Gece)");
    expect(b.shortStayFeeLabel).toBe("Kısa Süreli Konaklama Ücreti");
    expect(b.poolHeatingFeeLabel).toBe("Havuz Isıtma Ücreti");
    expect(b.total).toBe("Toplam Tutar");
    expect(b.dueAtCheckinLabel).toBe("Girişte ödenecek");
    expect(b.discountedTotal).toBe("İndirimli Tutar");
    expect(b.prepaymentAmountLabel).toBe("Ön ödeme (%{rate})");
  });

  it("8) errorGeneric sunucu metni İÇERMEZ (sızıntı guard'ı)", () => {
    for (const locale of LOCALES) {
      const g = getDictionary(locale).reservation.form.errorGeneric;
      expect(g).not.toMatch(/Too many requests/i);
      expect(g).not.toMatch(/Geçersiz istek/i);
      expect(g).not.toMatch(/zorunlu/i);
      expect(g).not.toMatch(/duplicate|constraint|relation|pg_/i);
    }
  });
});

/* ===============================================================
   2) RESERVATION PAGE BODY
   =============================================================== */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function childrenOf(el: any): any[] {
  const c = el?.props?.children;
  return Array.isArray(c) ? c.flat(Infinity) : c ? [c] : [];
}

async function renderBody(locale: Locale, slug = "test-villa") {
  getVillaBySlugMock.mockResolvedValue(VILLA);
  getVillaPricesMock.mockResolvedValue([]);
  getVillaDiscountsMock.mockResolvedValue([]);
  getVillaImagesMock.mockResolvedValue([{ image_url: "/cover.jpg" }]);
  return ReservationPageBody({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({
      start: "2026-06-01",
      end: "2026-06-08",
      adults: "2",
      children: "1",
      poolHeating: "1",
    }),
    locale,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe("ReservationPageBody — locale-aware gövde", () => {
  it.each(LOCALES)("9) %s — PageHero başlık/açıklama dictionary'den", async (locale) => {
    const el = await renderBody(locale);
    const hero = childrenOf(el).find((c) => c?.type === PageHero);
    const dict = getDictionary(locale).reservation.page;
    expect(hero.props.title).toBe(dict.title);
    expect(hero.props.description).toBe(dict.description);
    expect(hero.props.badge).toEqual({
      eyebrow: dict.badgeEyebrow,
      lines: [dict.badgeLine1, dict.badgeLine2, dict.badgeLine3],
    });
  });

  it.each(LOCALES)("10) %s — breadcrumb isimleri dictionary'den", async (locale) => {
    const el = await renderBody(locale);
    const hero = childrenOf(el).find((c) => c?.type === PageHero);
    const d = getDictionary(locale);
    expect(hero.props.breadcrumb.map((c: { name: string }) => c.name)).toEqual([
      d.search.breadcrumbHome,
      d.villasArchive.breadcrumbCurrent,
      d.reservation.page.breadcrumbCurrent,
    ]);
  });

  it("11) TR breadcrumb href'leri BİREBİR eskisi gibi ('/', '/kiralik-villalar')", async () => {
    const el = await renderBody("tr");
    const hero = childrenOf(el).find((c) => c?.type === PageHero);
    expect(hero.props.breadcrumb[0].href).toBe("/");
    expect(hero.props.breadcrumb[1].href).toBe("/kiralik-villalar");
    expect(hero.props.breadcrumb[2].href).toBeUndefined();
  });

  it.each([
    ["en", "/en", "/en/kiralik-villalar"],
    ["de", "/de", "/de/kiralik-villalar"],
  ] as const)("12) %s breadcrumb href'leri locale-prefixli", async (locale, home, villas) => {
    const el = await renderBody(locale);
    const hero = childrenOf(el).find((c) => c?.type === PageHero);
    expect(hero.props.breadcrumb[0].href).toBe(home);
    expect(hero.props.breadcrumb[1].href).toBe(villas);
  });

  it.each(LOCALES)("13) %s — ReservationForm'a locale prop'u geçilir", async (locale) => {
    const el = await renderBody(locale);
    const wrapper = childrenOf(el).find(
      (c) => c?.props?.className === "section-narrow pt-12 md:pt-16 pb-20"
    );
    const form = childrenOf(wrapper)[0];
    expect(form.type).toBe(ReservationForm);
    expect(form.props.locale).toBe(locale);
  });

  it("14) 🔒 iş mantığı props'ları DEĞİŞMEDİ (searchParams → form)", async () => {
    const el = await renderBody("en");
    const wrapper = childrenOf(el).find(
      (c) => c?.props?.className === "section-narrow pt-12 md:pt-16 pb-20"
    );
    const form = childrenOf(wrapper)[0];
    /* 🔒 Tam VillaDTO değil, yalnız formun okuduğu alanlar AYNI
       değerlerle geçer; server-only alanlar client'a gitmez. */
    const expectedVilla = Object.fromEntries(
      Object.entries(VILLA).filter(
        ([k]) => k !== "private_access_token" && k !== "commission_rate"
      )
    );
    expect(form.props.villa).toEqual(expectedVilla);
    expect(form.props.villa).not.toHaveProperty("private_access_token");
    expect(form.props.villa).not.toHaveProperty("commission_rate");
    expect(Object.keys(form.props.villa).sort()).toEqual(
      [
        "id",
        "slug",
        "title",
        "deposit",
        "cleaning_fee",
        "cleaning_currency",
        "cleaning_limit",
        "pool_heating_fee",
        "pool_heating_currency",
        "pool_heating_months",
        "custom_prepayment_rate",
      ].sort()
    );
    expect(form.props.start).toBe("2026-06-01");
    expect(form.props.end).toBe("2026-06-08");
    expect(form.props.adults).toBe("2");
    expect(form.props.children).toBe("1");
    expect(form.props.poolHeatingSelected).toBe(true);
    expect(form.props.image).toBe("/cover.jpg");
  });

  it("15) 🔒 4 servis AYNI sırada/imzayla çağrılır (DB akışı değişmedi)", async () => {
    await renderBody("de");
    expect(getVillaBySlugMock).toHaveBeenCalledWith("test-villa");
    expect(getVillaPricesMock).toHaveBeenCalledWith("villa-1");
    expect(getVillaDiscountsMock).toHaveBeenCalledWith("villa-1");
    expect(getVillaImagesMock).toHaveBeenCalledWith("villa-1");
    expect(getVillaBySlugMock).toHaveBeenCalledTimes(1);
  });

  it("16) poolHeating !== '1' → poolHeatingSelected=false (mantık aynı)", async () => {
    getVillaBySlugMock.mockResolvedValue(VILLA);
    getVillaPricesMock.mockResolvedValue([]);
    getVillaDiscountsMock.mockResolvedValue([]);
    getVillaImagesMock.mockResolvedValue([]);
    const el = await ReservationPageBody({
      params: Promise.resolve({ slug: "test-villa" }),
      searchParams: Promise.resolve({ poolHeating: "0" }),
      locale: "tr",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const wrapper = childrenOf(el).find(
      (c) => c?.props?.className === "section-narrow pt-12 md:pt-16 pb-20"
    );
    expect(childrenOf(wrapper)[0].props.poolHeatingSelected).toBe(false);
  });

  it.each(LOCALES)("17) %s — boş slug → locale'e uygun 'Geçersiz URL'", async (locale) => {
    const el = await ReservationPageBody({
      params: Promise.resolve({ slug: "" }),
      searchParams: Promise.resolve({}),
      locale,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    render(el);
    expect(
      screen.getByText(getDictionary(locale).reservation.page.invalidUrl)
    ).toBeInTheDocument();
    expect(getVillaBySlugMock).not.toHaveBeenCalled();
  });

  it.each(LOCALES)("18) %s — villa yok → locale'e uygun 404 metni", async (locale) => {
    getVillaBySlugMock.mockResolvedValue(null);
    const el = await ReservationPageBody({
      params: Promise.resolve({ slug: "yok" }),
      searchParams: Promise.resolve({}),
      locale,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    render(el);
    const d = getDictionary(locale).reservation.page;
    expect(screen.getByText(d.notFoundEyebrow)).toBeInTheDocument();
    expect(screen.getByText(d.notFoundTitle)).toBeInTheDocument();
    /* 🔒 villa yoksa fiyat/indirim/görsel servisleri ÇAĞRILMAZ */
    expect(getVillaPricesMock).not.toHaveBeenCalled();
  });

  it("19) locale verilmezse 'tr' (backward compatibility)", async () => {
    getVillaBySlugMock.mockResolvedValue(VILLA);
    getVillaPricesMock.mockResolvedValue([]);
    getVillaDiscountsMock.mockResolvedValue([]);
    getVillaImagesMock.mockResolvedValue([]);
    const el = await ReservationPageBody({
      params: Promise.resolve({ slug: "test-villa" }),
      searchParams: Promise.resolve({}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const hero = childrenOf(el).find((c) => c?.type === PageHero);
    expect(hero.props.title).toBe("Kişisel Bilgilerinizi Girin");
    expect(hero.props.breadcrumb[0].href).toBe("/");
  });
});

/* ===============================================================
   3) RESERVATION SUCCESS BODY
   =============================================================== */

async function renderSuccess(locale?: Locale, sp: Record<string, string> = {}) {
  const el = await ReservationSuccessBody({
    searchParams: Promise.resolve(sp),
    ...(locale ? { locale } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return render(el);
}

describe("ReservationSuccessBody — locale-aware başarı sayfası", () => {
  it.each(LOCALES)("20) %s — eyebrow/başlık/açıklama dictionary'den", async (locale) => {
    await renderSuccess(locale);
    const d = getDictionary(locale).reservation.success;
    expect(screen.getByText(d.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(d.title)).toBeInTheDocument();
    expect(screen.getByText(d.description)).toBeInTheDocument();
  });

  it.each(LOCALES)("21) %s — ref varsa referans kartı locale metinleriyle", async (locale) => {
    await renderSuccess(locale, { ref: "RES-123" });
    const d = getDictionary(locale).reservation.success;
    expect(screen.getByText(d.referenceLabel)).toBeInTheDocument();
    expect(screen.getByText(d.referenceHint)).toBeInTheDocument();
    expect(screen.getByText("RES-123")).toBeInTheDocument();
  });

  it("22) ref yoksa referans kartı render EDİLMEZ (davranış aynı)", async () => {
    await renderSuccess("en");
    const d = getDictionary("en").reservation.success;
    expect(screen.queryByText(d.referenceLabel)).toBeNull();
  });

  it("23) TR — 'Ana Sayfaya Dön' href='/' (BİREBİR eskisi gibi)", async () => {
    await renderSuccess("tr", { villa: "test-villa" });
    const d = getDictionary("tr").reservation.success;
    expect(screen.getByText(d.homeCta).closest("a")).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByText(d.villaCta).closest("a")).toHaveAttribute(
      "href",
      "/kiralik-villa/test-villa"
    );
  });

  it.each([
    ["en", "/en", "/en/kiralik-villa/test-villa"],
    ["de", "/de", "/de/kiralik-villa/test-villa"],
  ] as const)("24) %s — CTA href'leri locale-prefixli", async (locale, home, villa) => {
    await renderSuccess(locale, { villa: "test-villa" });
    const d = getDictionary(locale).reservation.success;
    expect(screen.getByText(d.homeCta).closest("a")).toHaveAttribute(
      "href",
      home
    );
    expect(screen.getByText(d.villaCta).closest("a")).toHaveAttribute(
      "href",
      villa
    );
  });

  it("25) villa query yoksa 'Villa Detayına Dön' render EDİLMEZ", async () => {
    await renderSuccess("de");
    expect(
      screen.queryByText(getDictionary("de").reservation.success.villaCta)
    ).toBeNull();
  });

  it.each(LOCALES)("26) %s — WhatsApp CTA settings'ten türer (mantık aynı)", async (locale) => {
    await renderSuccess(locale);
    const d = getDictionary(locale).reservation.success;
    const link = screen.getByText(d.whatsappCta).closest("a");
    expect(link).toHaveAttribute("href", "https://wa.me/905551112233");
  });

  it("27) settings whatsapp/phone yoksa WhatsApp CTA gizli (fail-soft aynı)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getCachedSettingsMock.mockResolvedValue({} as any);
    await renderSuccess("en");
    expect(
      screen.queryByText(getDictionary("en").reservation.success.whatsappCta)
    ).toBeNull();
  });

  it("28) locale verilmezse TR metinleri (backward compatibility)", async () => {
    await renderSuccess(undefined, { ref: "X1" });
    expect(screen.getByText("Rezervasyon Talebiniz Alındı")).toBeInTheDocument();
    expect(screen.getByText("Talep Alındı")).toBeInTheDocument();
    expect(screen.getByText("Referans Numarası")).toBeInTheDocument();
  });
});

/* ===============================================================
   4) RESERVATION FORM — TR PARITY
   =============================================================== */

describe("ReservationForm — TR parity (regresyon)", () => {
  it("29) 5 adım eyebrow/başlık ESKİ hardcoded metinlerle BİREBİR", async () => {
    renderForm("tr");
    for (const t of [
      "Adım 1",
      "Adım 2",
      "Adım 3",
      "Adım 4",
      "Adım 5",
      "İletişim bilgileri",
      "Adres bilgisi",
      "Misafirler",
      "Ödeme yöntemi",
      "Ödeme Tercihi",
    ]) {
      expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    }
  });

  it("30) placeholder'lar BİREBİR", () => {
    renderForm("tr");
    for (const p of [
      "İsim Soyisim",
      "E-posta",
      /* 🛡️ Telefon placeholder'ı artık ulusal numara örneği; ülke kodu
         ayrı select'te. İkinci telefonun kendi placeholder'ı var. */
      "532 123 45 67",
      "151 12345678",
      "TC / Pasaport",
      "Adres",
      "Not (isteğe bağlı)",
    ]) {
      expect(screen.getByPlaceholderText(p)).toBeInTheDocument();
    }
  });

  it("31) fiyat özeti etiketleri BİREBİR", () => {
    renderForm("tr");
    expect(screen.getByText("Konaklama")).toBeInTheDocument();
    expect(screen.getByText("Toplam Tutar")).toBeInTheDocument();
    expect(
      screen.getAllByText("Konaklama Tutarı (7 Gece)").length
    ).toBeGreaterThan(0);
    expect(screen.getByText("Girişte ödenecek")).toBeInTheDocument();
    expect(screen.getByText("Ön ödeme (%20)")).toBeInTheDocument();
  });

  it("32) gece/misafir sayıları BİREBİR formatta", () => {
    renderForm("tr");
    expect(screen.getByText("7 gece")).toBeInTheDocument();
    expect(screen.getByText("3 misafir")).toBeInTheDocument();
    expect(screen.getByText("3 kişi")).toBeInTheDocument();
    expect(screen.getByText("(2 yetişkin · 1 çocuk)")).toBeInTheDocument();
  });

  it("33) ülke/şehir select metinleri BİREBİR", () => {
    renderForm("tr");
    expect(screen.getByText("Ülke seç")).toBeInTheDocument();
    /* Ülke default TR seçili → "Şehir seç" aktif metin. */
    expect(screen.getByText("Şehir seç")).toBeInTheDocument();
  });

  it("34) submit butonu metni BİREBİR", () => {
    renderForm("tr");
    expect(screen.getByText("Rezervasyon Gönder")).toBeInTheDocument();
  });

  it("35) ödeme tercihi seçenekleri BİREBİR", () => {
    renderForm("tr");
    expect(screen.getByText("Ön Ödeme")).toBeInTheDocument();
    expect(screen.getByText("%20 ön ödeme")).toBeInTheDocument();
    expect(screen.getByText("Tamamını Ödemek İstiyorum")).toBeInTheDocument();
    expect(screen.getByText("Toplam tutarın tamamı")).toBeInTheDocument();
  });

  it("36) locale prop'u HİÇ verilmezse de TR (backward compatibility)", () => {
    renderForm();
    expect(screen.getByText("Rezervasyon Gönder")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("İsim Soyisim")).toBeInTheDocument();
  });

  it("37) misafir adı placeholder'ı BİREBİR ('Misafir 2 Ad Soyad')", async () => {
    renderForm("tr");
    await waitFor(() =>
      expect(screen.getByText("Diğer misafirler")).toBeInTheDocument()
    );
    expect(screen.getByPlaceholderText("Misafir 2 Ad Soyad")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Misafir 3 Ad Soyad")).toBeInTheDocument();
  });
});

/* ===============================================================
   5) RESERVATION FORM — EN/DE
   =============================================================== */

describe.each(["en", "de"] as const)("ReservationForm — %s", (locale) => {
  const d = getDictionary(locale).reservation;
  const b = getDictionary(locale).booking;

  it(`38-${locale}) adım başlıkları dictionary'den`, () => {
    renderForm(locale);
    for (const t of [
      d.form.step1Eyebrow,
      d.form.step1Title,
      d.form.step2Title,
      d.form.step3Title,
      d.form.step4Title,
      d.form.step5Title,
    ]) {
      expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    }
  });

  it(`39-${locale}) placeholder'lar dictionary'den`, () => {
    renderForm(locale);
    for (const p of [
      d.form.namePlaceholder,
      d.form.emailPlaceholder,
      d.form.phonePlaceholder,
      d.form.phone2Placeholder,
      d.form.identityPlaceholder,
      d.form.addressPlaceholder,
      d.form.notePlaceholder,
    ]) {
      expect(screen.getByPlaceholderText(p)).toBeInTheDocument();
    }
  });

  it(`40-${locale}) fiyat özeti etiketleri booking namespace'inden`, () => {
    renderForm(locale);
    expect(screen.getByText(d.summary.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(b.total)).toBeInTheDocument();
    expect(screen.getByText(b.dueAtCheckinLabel)).toBeInTheDocument();
    expect(
      screen.getAllByText(
        formatDictionaryString(b.accommodationAmountLabel, { n: 7 })
      ).length
    ).toBeGreaterThan(0);
  });

  it(`41-${locale}) gece/misafir sayıları interpolasyonlu`, () => {
    renderForm(locale);
    expect(
      screen.getByText(formatDictionaryString(d.summary.nightsCount, { n: 7 }))
    ).toBeInTheDocument();
    expect(
      screen.getByText(formatDictionaryString(d.summary.guestsCount, { n: 3 }))
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `(${formatDictionaryString(b.guestsSummary, {
          adults: 2,
          children: 1,
        })})`
      )
    ).toBeInTheDocument();
  });

  it(`42-${locale}) submit + ödeme tercihi metinleri dictionary'den`, () => {
    renderForm(locale);
    expect(screen.getByText(d.form.submit)).toBeInTheDocument();
    expect(screen.getByText(d.form.prepaymentOption)).toBeInTheDocument();
    expect(screen.getByText(d.form.fullPaymentOption)).toBeInTheDocument();
    expect(screen.getByText(d.form.fullPaymentHint)).toBeInTheDocument();
  });

  it(`43-${locale}) TR metinleri EKRANDA YOK (gerçekten çevrilmiş)`, () => {
    renderForm(locale);
    for (const t of [
      "Adım 1",
      "İletişim bilgileri",
      "Rezervasyon Gönder",
      "Toplam Tutar",
      "Girişte ödenecek",
    ]) {
      expect(screen.queryByText(t)).toBeNull();
    }
    expect(screen.queryByPlaceholderText("İsim Soyisim")).toBeNull();
  });

  it(`44-${locale}) format validation mesajları locale'e uygun (regex DEĞİŞMEDİ)`, async () => {
    renderForm(locale);
    await waitFor(() =>
      expect(screen.getByText("Havale / EFT")).toBeInTheDocument()
    );
    fireEvent.change(screen.getByPlaceholderText(d.form.namePlaceholder), {
      target: { value: "John Doe" },
    });
    fireEvent.change(screen.getByPlaceholderText(d.form.emailPlaceholder), {
      target: { value: "not-an-email" },
    });
    fireEvent.change(screen.getByPlaceholderText(d.form.phonePlaceholder), {
      target: { value: "123" },
    });
    /* phone2 de dolu ama geçersiz → submit engeli telefon 2'den değil,
       assertion'ın hedeflediği phoneInvalid'den gelsin. */
    fireEvent.change(screen.getByPlaceholderText(d.form.phone2Placeholder), {
      target: { value: "123" },
    });
    fireEvent.change(screen.getByPlaceholderText(d.form.identityPlaceholder), {
      target: { value: "42" },
    });
    fireEvent.click(screen.getAllByRole("radio")[0]);
    acceptTerms();
    fireEvent.click(screen.getByText(d.form.submit));

    await waitFor(() =>
      expect(screen.getByText(d.validation.phoneInvalid)).toBeInTheDocument()
    );
    expect(screen.getByText(d.validation.emailInvalid)).toBeInTheDocument();
    expect(screen.getByText(d.validation.identityInvalid)).toBeInTheDocument();
    /* 🔒 validation başarısızsa API'ye POST YAPILMAZ (akış aynı). */
    const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } })
      .mock.calls;
    expect(
      calls.some((c) => String(c[0]) === "/api/public/reservations")
    ).toBe(false);
  });
});

/* ===============================================================
   6) SUNUCU HATA METNİ SIZINTISI + LOCALE-AWARE REDIRECT
   =============================================================== */

/* 🛡️ SÖZLEŞME ONAYI (yeni zorunlu adım) — gönderim artık checkbox
   işaretlenmeden çalışmaz. Testler KULLANICI AKIŞINI tamamlar; hiçbir
   assertion gevşetilmedi/kaldırılmadı. */
/* 🛡️ İKİ TELEFON (Migration 094) — gönderim artık her iki telefon da
   dolu olmadan çalışmaz. Testler KULLANICI AKIŞINI tamamlar; hiçbir
   assertion gevşetilmedi/kaldırılmadı.
   Ülke kodu select'i varsayılan +90'dır; ikinci telefonda ülkeyi
   BİLEREK +49 yaparak bağımsızlık da doğrulanır. */
function fillPhones(
  locale: Locale,
  national1 = "5551112233",
  national2 = "15112345678"
) {
  const d = getDictionary(locale).reservation;
  fireEvent.change(screen.getByPlaceholderText(d.form.phonePlaceholder), {
    target: { value: national1 },
  });
  const dial2 = screen.getByLabelText(
    `${d.form.phone2Label} — ${d.form.phoneCountryAriaLabel}`
  );
  fireEvent.change(dial2, { target: { value: "+49" } });
  fireEvent.change(screen.getByPlaceholderText(d.form.phone2Placeholder), {
    target: { value: national2 },
  });
}

function acceptTerms() {
  const box = document.getElementById(
    "reservation-terms-accept"
  ) as HTMLInputElement | null;
  expect(box).toBeTruthy();
  fireEvent.click(box!);
}

async function fillAndSubmit(locale: Locale) {
  const d = getDictionary(locale).reservation;
  renderForm(locale);
  await waitFor(() =>
    expect(screen.getByText("Havale / EFT")).toBeInTheDocument()
  );
  fireEvent.change(screen.getByPlaceholderText(d.form.namePlaceholder), {
    target: { value: "Ahmet Yılmaz" },
  });
  fireEvent.change(screen.getByPlaceholderText(d.form.emailPlaceholder), {
    target: { value: "test@example.com" },
  });
  fillPhones(locale);
  fireEvent.change(screen.getByPlaceholderText(d.form.identityPlaceholder), {
    target: { value: "12345678901" },
  });
  fireEvent.click(screen.getAllByRole("radio")[0]);
  acceptTerms();
  fireEvent.click(screen.getByText(d.form.submit));
}

function mockReservationPost(
  status: number,
  body: Record<string, unknown>
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/public/payment-methods")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            payment_methods: [{ id: "pm-1", name: "Havale / EFT" }],
          }),
        };
      }
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      };
    })
  );
}

/* ===============================================================
   🛡️ TELEFON ALANLARI — GÖRÜNÜR ÜST LABEL YOK
   ===============================================================
   "Telefon 1 *" / "Telefon 2 *" üst etiketleri KALDIRILDI; alanların
   kendisi, placeholder'ları, ülke kodu select'i ve ZORUNLULUK mantığı
   AYNEN duruyor.
=============================================================== */
describe("ReservationForm — telefon üst label'ları kaldırıldı", () => {
  it.each(LOCALES)("9-10-%s) 'Telefon 1' / 'Telefon 2' üst label'ı RENDER EDİLMEZ", (locale) => {
    const d = getDictionary(locale).reservation;
    renderForm(locale);
    /* Görünür bir <label> elementi olarak bulunmamalı. */
    for (const text of [d.form.phoneLabel, d.form.phone2Label]) {
      const visible = screen.queryAllByText(
        (_c, el) =>
          el?.tagName === "LABEL" && el.textContent?.trim().startsWith(text) === true
      );
      expect(visible).toHaveLength(0);
    }
  });

  it.each(LOCALES)("9b-10b-%s) yıldız (*) içeren telefon label'ı YOK", (locale) => {
    const d = getDictionary(locale).reservation;
    renderForm(locale);
    for (const text of [d.form.phoneLabel, d.form.phone2Label]) {
      expect(screen.queryByText(`${text} *`)).toBeNull();
    }
  });

  it.each(LOCALES)("11-%s) iki telefon INPUT'u hâlâ render edilir", (locale) => {
    const d = getDictionary(locale).reservation;
    renderForm(locale);
    expect(
      screen.getByPlaceholderText(d.form.phonePlaceholder)
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(d.form.phone2Placeholder)
    ).toBeInTheDocument();
  });

  it.each(LOCALES)("12-%s) ülke kodu select'leri + aria-label'lar korundu", (locale) => {
    const d = getDictionary(locale).reservation;
    renderForm(locale);
    for (const label of [d.form.phoneLabel, d.form.phone2Label]) {
      const sel = screen.getByLabelText(
        `${label} — ${d.form.phoneCountryAriaLabel}`
      );
      expect(sel).toBeInTheDocument();
      expect((sel as HTMLSelectElement).value).toBe("+90");
      /* +90 dışındaki ülkeler hâlâ seçilebilir. */
      expect(
        Array.from((sel as HTMLSelectElement).options).map((o) => o.value)
      ).toEqual(expect.arrayContaining(["+90", "+49", "+44", "+33", "+31", "+1"]));
    }
  });

  it("12b) input'lar erişilebilir kalır (görünmez aria-label)", () => {
    const d = getDictionary("tr").reservation;
    renderForm("tr");
    expect(screen.getByLabelText(d.form.phoneLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(d.form.phone2Label)).toBeInTheDocument();
  });

  it("12c) telefon ZORUNLULUĞU değişmedi — boş phone2 ile POST yok", async () => {
    const d = getDictionary("tr").reservation;
    renderForm("tr");
    await waitFor(() =>
      expect(screen.getByText("Havale / EFT")).toBeInTheDocument()
    );
    fireEvent.change(screen.getByPlaceholderText(d.form.namePlaceholder), {
      target: { value: "Ahmet Yılmaz" },
    });
    fireEvent.change(screen.getByPlaceholderText(d.form.emailPlaceholder), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(d.form.phonePlaceholder), {
      target: { value: "5551112233" },
    });
    /* phone2 BİLEREK boş bırakıldı. */
    fireEvent.change(screen.getByPlaceholderText(d.form.identityPlaceholder), {
      target: { value: "12345678901" },
    });
    fireEvent.click(screen.getAllByRole("radio")[0]);
    acceptTerms();

    /* phone2 boş olduğu için gönderim kapısı AÇILMAZ (isFormValid) —
       mevcut davranış; label kaldırma bunu DEĞİŞTİRMEDİ. */
    const submit = screen
      .getByText(d.form.submit)
      .closest("button") as HTMLButtonElement;
    expect(submit).toBeTruthy();
    expect(submit.disabled).toBe(true);

    fireEvent.click(submit);
    const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } })
      .mock.calls;
    expect(
      calls.some((c) => String(c[0]) === "/api/public/reservations")
    ).toBe(false);
  });

  it("12d) phone2 DOLDURULUNCA gönderim kapısı açılır (regresyon)", async () => {
    const d = getDictionary("tr").reservation;
    renderForm("tr");
    await waitFor(() =>
      expect(screen.getByText("Havale / EFT")).toBeInTheDocument()
    );
    fireEvent.change(screen.getByPlaceholderText(d.form.namePlaceholder), {
      target: { value: "Ahmet Yılmaz" },
    });
    fireEvent.change(screen.getByPlaceholderText(d.form.emailPlaceholder), {
      target: { value: "test@example.com" },
    });
    fillPhones("tr");
    fireEvent.change(screen.getByPlaceholderText(d.form.identityPlaceholder), {
      target: { value: "12345678901" },
    });
    fireEvent.click(screen.getAllByRole("radio")[0]);
    acceptTerms();

    const submit = screen
      .getByText(d.form.submit)
      .closest("button") as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });
});

describe("ReservationForm — sunucu hata metni SIZMAZ", () => {
  it.each(LOCALES)(
    "45) %s — 500 + ham DB hatası → generic dictionary mesajı",
    async (locale) => {
      mockReservationPost(500, {
        ok: false,
        error:
          'duplicate key value violates unique constraint "reservations_pkey"',
      });
      await fillAndSubmit(locale);
      const d = getDictionary(locale).reservation.form;
      await waitFor(() =>
        expect(screen.getByText(d.errorGeneric)).toBeInTheDocument()
      );
      expect(screen.queryByText(/duplicate key value/i)).toBeNull();
    }
  );

  it.each(LOCALES)("46) %s — 429 'Too many requests' SIZMAZ", async (locale) => {
    mockReservationPost(429, { ok: false, error: "Too many requests" });
    await fillAndSubmit(locale);
    const d = getDictionary(locale).reservation.form;
    await waitFor(() =>
      expect(screen.getByText(d.errorGeneric)).toBeInTheDocument()
    );
    expect(screen.queryByText("Too many requests")).toBeNull();
  });

  it.each(LOCALES)("47) %s — 400 TR server mesajları SIZMAZ", async (locale) => {
    mockReservationPost(400, { ok: false, error: "Ad ve telefon zorunlu" });
    await fillAndSubmit(locale);
    const d = getDictionary(locale).reservation.form;
    await waitFor(() =>
      expect(screen.getByText(d.errorGeneric)).toBeInTheDocument()
    );
    expect(screen.queryByText("Ad ve telefon zorunlu")).toBeNull();
  });

  it.each(LOCALES)(
    "48) %s — HTTP 409 İSTİSNASI → 'tarihler dolu' mesajı",
    async (locale) => {
      mockReservationPost(409, { ok: false, error: "Bu tarihler dolu" });
      await fillAndSubmit(locale);
      const d = getDictionary(locale).reservation.form;
      await waitFor(() =>
        expect(
          screen.getByText(d.errorDatesUnavailable)
        ).toBeInTheDocument()
      );
      expect(screen.queryByText(d.errorGeneric)).toBeNull();
    }
  );

  it("49) hata banner'ı kapatma aria-label'ı locale-aware", async () => {
    mockReservationPost(500, { ok: false, error: "boom" });
    await fillAndSubmit("de");
    const d = getDictionary("de").reservation.form;
    await waitFor(() =>
      expect(
        screen.getByLabelText(d.errorDismissAriaLabel)
      ).toBeInTheDocument()
    );
  });

  it("50) 🔒 API endpoint DEĞİŞMEDİ (/api/public/reservations)", async () => {
    mockReservationPost(500, { ok: false, error: "x" });
    await fillAndSubmit("en");
    await waitFor(() => {
      const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } })
        .mock.calls;
      expect(
        calls.some((c) => String(c[0]) === "/api/public/reservations")
      ).toBe(true);
    });
  });
});

describe("ReservationForm — locale-aware success redirect", () => {
  it.each([
    ["tr", "/rezervasyon/basarili"],
    ["en", "/en/rezervasyon/basarili"],
    ["de", "/de/rezervasyon/basarili"],
  ] as const)("51) %s → %s", async (locale, base) => {
    mockReservationPost(200, {
      ok: true,
      reservation: { id: "res-1" },
    });
    await fillAndSubmit(locale);
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(pushMock.mock.calls[0][0]).toBe(
      `${base}?ref=res-1&villa=test-villa`
    );
  });

  it("52) query param SIRASI ve encoding korunur (ref → villa)", async () => {
    mockReservationPost(200, {
      ok: true,
      reservation: { id: "res 1/ü" },
    });
    await fillAndSubmit("en");
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(pushMock.mock.calls[0][0]).toBe(
      `/en/rezervasyon/basarili?ref=${encodeURIComponent(
        "res 1/ü"
      )}&villa=test-villa`
    );
  });

  it("53) ref yoksa yalnız villa param'ı kalır", async () => {
    mockReservationPost(200, { ok: true, reservation: {} });
    await fillAndSubmit("de");
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(pushMock.mock.calls[0][0]).toBe(
      "/de/rezervasyon/basarili?villa=test-villa"
    );
  });
});

/* ===============================================================
   7) LOCALE SWITCH
   =============================================================== */

describe("locale switch — /rezervasyon/*", () => {
  it("54) /rezervasyon/<slug> → EN/DE prefixli hedefler", () => {
    const t = getLocaleSwitchTargets("/rezervasyon/test-villa");
    expect(t.tr).toBe("/rezervasyon/test-villa");
    expect(t.en).toBe("/en/rezervasyon/test-villa");
    expect(t.de).toBe("/de/rezervasyon/test-villa");
  });

  it("55) query string AYNEN korunur", () => {
    const search = "?start=2026-06-01&end=2026-06-08&adults=2&poolHeating=1";
    const t = getLocaleSwitchTargets("/en/rezervasyon/test-villa", search);
    expect(t.tr).toBe(`/rezervasyon/test-villa${search}`);
    expect(t.de).toBe(`/de/rezervasyon/test-villa${search}`);
  });

  it("56) /rezervasyon/basarili de allowlist'te (ref/villa korunur)", () => {
    const t = getLocaleSwitchTargets(
      "/rezervasyon/basarili",
      "?ref=res-1&villa=test-villa"
    );
    expect(t.en).toBe("/en/rezervasyon/basarili?ref=res-1&villa=test-villa");
    expect(t.de).toBe("/de/rezervasyon/basarili?ref=res-1&villa=test-villa");
  });

  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — `/rezervasyon-kontrol` ARTIK kendi
     `/en` + `/de` route'larına sahip (ortak `ReservationLookupPageBody`)
     → locale switch onu da korur. `/rezervasyon/` PREFIX'i ile
     YANLIŞLIKLA eşleşme olmadığı aşağıda ayrıca doğrulanır. */
  it("57) /rezervasyon-kontrol locale-routed (kendi exact kaydı)", () => {
    const t = getLocaleSwitchTargets("/rezervasyon-kontrol");
    expect(t.tr).toBe("/rezervasyon-kontrol");
    expect(t.en).toBe("/en/rezervasyon-kontrol");
    expect(t.de).toBe("/de/rezervasyon-kontrol");
  });

  it("57b) /rezervasyon-kontrolX → fallback (prefix ile yanlış eşleşme yok)", () => {
    const t = getLocaleSwitchTargets("/rezervasyon-kontrolX");
    expect(t.tr).toBe("/");
    expect(t.en).toBe("/en");
    expect(t.de).toBe("/de");
  });
});

/* ===============================================================
   8) SOURCE LOCK — hardcoded Türkçe kullanıcı metni YOK
   =============================================================== */

function sourceWithoutComments(relPath: string): string {
  const raw = readFileSync(resolve(process.cwd(), relPath), "utf8");
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const SOURCE_LOCKED = [
  "app/components/reservation/ReservationForm.tsx",
  "app/components/reservation/ReservationPageBody.tsx",
  "app/components/reservation/ReservationSuccessBody.tsx",
  "app/components/reservation/_helpers/validatePublicReservationForm.ts",
];

describe("source-lock — rezervasyon gövdelerinde hardcoded TR metin yok", () => {
  it.each(SOURCE_LOCKED)("58) %s — Türkçe'ye özgü karakter yok", (p) => {
    const src = sourceWithoutComments(p);
    const offending = src
      .split("\n")
      .filter((l) => /[çğıöşüÇĞİÖŞÜ]/.test(l));
    expect(offending).toEqual([]);
  });

  it("59) ReservationForm eski hardcoded etiketleri İÇERMEZ", () => {
    const src = sourceWithoutComments(SOURCE_LOCKED[0]);
    for (const t of [
      "Rezervasyon Gonder",
      '"Adim 1"',
      "Toplam Tutar",
      "Konaklama Tutari",
    ]) {
      expect(src).not.toContain(t);
    }
  });

  it("60) 🔒 iş mantığı çağrıları ReservationForm'da DURUYOR", () => {
    const src = sourceWithoutComments(SOURCE_LOCKED[0]);
    for (const t of [
      "calculateGrandTotal",
      "calculatePrepayment",
      "buildPublicReservationPayload",
      "dispatchPublicReservationRequestMail",
      "/api/public/reservations",
      "/api/public/payment-methods",
      "validatePublicReservationForm",
    ]) {
      expect(src).toContain(t);
    }
  });

  it("61) 🔒 sunucudan gelen `json.error` UI'a BASILMIYOR", () => {
    const src = sourceWithoutComments(SOURCE_LOCKED[0]);
    expect(src).not.toContain("json?.error");
    expect(src).not.toContain("json.error");
  });

  it("62) success redirect locale-aware (kaynak seviyesinde)", () => {
    const src = sourceWithoutComments(SOURCE_LOCKED[0]);
    expect(src).toContain("/rezervasyon/basarili");
    expect(src).toContain("${activeLocale}/rezervasyon/basarili");
  });
});
