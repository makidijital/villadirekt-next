/* ===============================================================
   🛡️ REZERVASYON NAVİGASYONU — LOCALE KORUMASI
   ===============================================================
   KÖK NEDEN (düzeltildi):
     Villa detay sayfasındaki "Rezervasyon Yap" butonu
     (`useBookingEngine > handleReservation`) hedefi PREFIX'SİZ
     üretiyordu: `/rezervasyon/<slug>?...`. Bu kod yazıldığında
     `/en|/de/rezervasyon/[slug]` route'ları `LocaleRouteComingSoon`
     placeholder'ıydı ve locale yalnız `&locale=` query param'ı ile
     taşınıyordu — ancak `/rezervasyon/[slug]/page.tsx` o param'ı HİÇ
     okumuyor. Sonuç: `/de/...` üzerindeki kullanıcı TR route'una
     düşüyor → `localeFromPathname` "tr" → dil TR'ye dönüyordu.

   DÜZELTME: hedef, projenin MEVCUT merkezi helper'ı `localeHref` ile
   prefix'lenir. Yeni i18n/routing sistemi YOK; URL locale'in tek
   kaynağı olarak KALIR.

   BU TEST GERÇEK DAVRANIŞI ÖLÇER: hook render edilir, tarih seçimi
   yapılır, `handleReservation()` çağrılır ve `window.location.href`'e
   YAZILAN değer doğrulanır.
=============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 0 })),
}));

import { useBookingEngine } from "@/app/components/villa/booking/useBookingEngine";
import { localeFromPathname, SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { localeHref } from "@/lib/i18n/locale-href";
import type { VillaPriceEmbed } from "@/lib/villa-row.types";

const PRICES: VillaPriceEmbed[] = [
  { price: 4000, currency: "TRY", start_date: "2026-10-01", end_date: "2026-12-31" },
];

const START = "2026-10-05";
const END = "2026-10-10"; // 5 gece

/** `window.location.href` yazımını yakalar (jsdom'da gerçek navigation yok). */
let navigatedTo = "";

function stubLocation() {
  navigatedTo = "";
  const loc = { href: "" };
  Object.defineProperty(loc, "href", {
    get: () => navigatedTo,
    set: (v: string) => {
      navigatedTo = v;
    },
    configurable: true,
  });
  Object.defineProperty(window, "location", {
    value: loc,
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, ranges: [] }),
    })) as unknown as typeof fetch
  );
  stubLocation();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function reserveWith(locale?: "tr" | "en" | "de") {
  const { result } = renderHook(() =>
    useBookingEngine({
      villaSlug: "deniz-villa",
      villaId: "v1",
      prices: PRICES,
      cleaning_fee: 0,
      cleaning_currency: "TRY",
      initialStart: START,
      initialEnd: END,
      locale,
    })
  );
  await waitFor(() => expect(result.current.selectedNights).toBe(5));
  /* Başlangıç aralığı müsaitliği doğrulanana kadar rezervasyona geçilmez
     (useBookingEngine başlangıç aralığı doğrulaması). */
  await waitFor(() => expect(result.current.availabilityPending).toBe(false));
  await act(async () => {
    result.current.handleReservation();
  });
  return navigatedTo;
}

/* =============================================================== */
describe("1-3) Rezervasyon hedefi aktif locale prefix'ini TAŞIR", () => {
  it("1) TR → /rezervasyon/... (canonical, prefix'siz — DAVRANIŞ DEĞİŞMEDİ)", async () => {
    const url = await reserveWith("tr");
    expect(url.startsWith("/rezervasyon/deniz-villa?")).toBe(true);
    expect(url.startsWith("/tr/")).toBe(false);
    /* TR'de ek query param EKLENMEZ (byte-identical davranış). */
    expect(url).not.toContain("locale=");
  });

  it("1b) locale HİÇ verilmezse de TR canonical (geriye dönük uyum)", async () => {
    const url = await reserveWith(undefined);
    expect(url.startsWith("/rezervasyon/deniz-villa?")).toBe(true);
    expect(url).not.toContain("locale=");
  });

  it("2) EN → /en/rezervasyon/...", async () => {
    const url = await reserveWith("en");
    expect(url.startsWith("/en/rezervasyon/deniz-villa?")).toBe(true);
  });

  it("3) DE → /de/rezervasyon/... (bildirilen hata senaryosu)", async () => {
    const url = await reserveWith("de");
    expect(url.startsWith("/de/rezervasyon/deniz-villa?")).toBe(true);
    /* REGRESYON: prefix'siz TR route'una ASLA düşmemeli. */
    expect(url.startsWith("/rezervasyon/")).toBe(false);
  });
});

describe("4) Query sözleşmesi AYNEN korunur", () => {
  it("4a) start/end/adults/children/poolHeating parametreleri değişmedi", async () => {
    const url = await reserveWith("de");
    const qs = url.slice(url.indexOf("?"));
    expect(qs).toContain(`start=${START}`);
    expect(qs).toContain(`end=${END}`);
    expect(qs).toContain("adults=");
    expect(qs).toContain("children=");
    expect(qs).toContain("poolHeating=");
  });

  it("4b) TR ile EN/DE arasındaki TEK fark path prefix'i (+ mevcut &locale=)", async () => {
    const tr = await reserveWith("tr");
    const de = await reserveWith("de");
    expect(de).toBe(`/de${tr}&locale=de`);
  });
});

describe("5) Hedef, gidilen locale'de ÇÖZÜLEBİLİR bir route", () => {
  it.each(SUPPORTED_LOCALES)(
    "5) %s → localeFromPathname(hedef) aynı locale'i döndürür",
    async (loc) => {
      const url = await reserveWith(loc);
      const pathOnly = url.slice(0, url.indexOf("?"));
      expect(localeFromPathname(pathOnly)).toBe(loc);
    }
  );
});

describe("6) Merkezi helper kullanılıyor — ikinci bir prefix mantığı YOK", () => {
  it("6a) çıktı localeHref sözleşmesiyle BİREBİR uyumlu", async () => {
    for (const loc of ["tr", "en", "de"] as const) {
      const url = await reserveWith(loc);
      /* Aynı girdi için helper ne üretirse o: prefix mantığı tek yerde. */
      expect(url).toBe(localeHref(url, loc));
    }
  });

  it("6b) SOURCE-LOCK — navigation localeHref'ten geçer, elle prefix YOK", () => {
    const src = readFileSync(
      join(process.cwd(), "app/components/villa/booking/useBookingEngine.ts"),
      "utf-8"
    );
    expect(src).toContain("window.location.href = localeHref(");
    /* Elle `/${locale}/rezervasyon` gibi ikinci bir prefix kurgusu yok. */
    expect(src).not.toContain("`/${locale}/rezervasyon");
  });
});

describe("7) Mevcut davranışlar KORUNDU (regresyon)", () => {
  it("7a) tarih seçilmemişse navigation YAPILMAZ", async () => {
    const { result } = renderHook(() =>
      useBookingEngine({
        villaSlug: "deniz-villa",
        villaId: "v1",
        prices: PRICES,
        cleaning_fee: 0,
        cleaning_currency: "TRY",
        locale: "de",
      })
    );
    await act(async () => {
      result.current.handleReservation();
    });
    expect(navigatedTo).toBe("");
  });

  it("7b) slug URL'de AYNEN korunur", async () => {
    const url = await reserveWith("en");
    expect(url).toContain("/rezervasyon/deniz-villa?");
  });
});
