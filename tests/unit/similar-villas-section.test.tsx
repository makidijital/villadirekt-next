/* ===============================================================
   🛡️ PHASE 10G — SimilarVillasSection ("Benzer Villalar") TESTLERİ
   ===============================================================
   Villa detay sayfasının TEK "kendi verisini çeken" alt bölümü.
   Phase 10G'de eklenen locale desteği burada, GERÇEK component +
   GERÇEK VillaCard + GERÇEK `getTranslationsForParents` ile
   doğrulanır (yalnız en alttaki DB katmanı —
   `translationRepository` / `villaAdminRepository` — mock'lanır;
   bu sayede "TR'de EK SORGU YOK" iddiası gerçekten kanıtlanabilir).

   ⚠️ `SimilarVillasSection` async bir server component'tir; proje
   convention'ı gereği (bkz. tests/unit/locale-routes.test.tsx)
   `await Component(props)` ile çözülüp `render()`'a verilir.

   KAPSAM:
     1) TR / EN / DE locale render
     2) Bölüm başlığı dictionary'den (locale-aware)
     3) Bölge adı CANONICAL kalır (villa_location çevirisi YOK)
     4) Badge çevirisi (villa) + fallback
     5) VillaCard'a locale aktarımı → locale-prefixed detay linki
     6) Villa ADI ÇEVRİLMEZ (canonical villa.title)
     7) Mevcut "benzer villa" sorgu kontratı BOZULMADI
        (location_id öncelikli 1. sorgu + 3'e tamamlama 2. sorgusu,
         excludeIds, limit)
     8) TR'de ÇEVİRİ SORGUSU HİÇ ATILMAZ (DEFAULT_LOCALE guard)
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";

const findSimilarCardsMock = vi.fn();
const findManyForLocaleMock = vi.fn();

vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findSimilarCards: (...args: unknown[]) => findSimilarCardsMock(...args),
  },
}));

/* 🛡️ GERÇEK `getTranslationsForParents` çalışır (DEFAULT_LOCALE guard'ı
   dahil); yalnız en alttaki DB primitive'i mock'lanır. */
vi.mock("@/lib/db/translation.repository.server", () => ({
  translationRepository: {
    findManyForLocale: (...args: unknown[]) => findManyForLocaleMock(...args),
  },
}));

/* --- Next.js / client context stub'ları (VillaCard "use client") --- */
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt?: string; src?: string }) => (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img alt={alt ?? ""} src={typeof src === "string" ? src : ""} />
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
/* `next/dynamic` — VillaCardBookingModal lazy import'u (ssr:false).
   Modal yalnız kullanıcı tıklayınca mount olur; testte no-op. */
vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));
vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({ currency: "TRY", rates: {} }),
}));

import SimilarVillasSection from "@/app/components/villa/SimilarVillasSection";

const ROW = {
  id: "villa-2",
  slug: "villa-in-love",
  title: "Villa In Love",
  location_id: "loc-1",
  badge: "Popüler",
  currency: "TRY",
  bedrooms: 3,
  bathrooms: 2,
  guests: 6,
  location: { name: "Kalkan, Antalya" },
  villa_images: [
    { image_url: "villa-2/cover.jpg", is_cover: true, sort_order: 0 },
  ],
  villa_prices: [
    {
      price: 12000,
      currency: "TRY",
      start_date: "2026-06-01",
      end_date: "2026-09-30",
    },
  ],
};

beforeEach(() => {
  findSimilarCardsMock.mockReset();
  findManyForLocaleMock.mockReset();
  /* 1. sorgu (locationId dolu) TEK satır döner; 2. (fallback) sorgu boş —
     böylece sayfada TEK kart olur ve `getByText` tekil kalır. */
  findSimilarCardsMock.mockImplementation(
    (opts: { locationId: string | null }) =>
      Promise.resolve({ data: opts.locationId ? [ROW] : [], error: null })
  );
  findManyForLocaleMock.mockResolvedValue({ data: [], error: null });
});

async function renderSection(
  locale?: "tr" | "en" | "de",
  props?: { villaId?: string; locationId?: string | null }
) {
  const element = await SimilarVillasSection({
    villaId: props?.villaId ?? "villa-1",
    locationId: props?.locationId === undefined ? "loc-1" : props.locationId,
    locale,
  });
  return render(element as React.ReactElement);
}

/* ===============================================================
   1) BAŞLIK — locale-aware
   =============================================================== */
describe("SimilarVillasSection — bölüm başlığı", () => {
  it.each(["tr", "en", "de"] as const)(
    "%s: başlık dictionary'den gelir (hardcoded TR metin YOK)",
    async (locale) => {
      await renderSection(locale);
      const dict = getDictionary(locale);
      expect(
        screen.getByRole("heading", { name: dict.villa.similarVillasTitle })
      ).toBeInTheDocument();
    }
  );

  it("locale verilmezse TR davranışı (eski çağrılar bozulmaz)", async () => {
    await renderSection(undefined);
    expect(
      screen.getByRole("heading", {
        name: getDictionary("tr").villa.similarVillasTitle,
      })
    ).toBeInTheDocument();
  });

  it("EN ve DE başlıkları birbirinden ve TR'den FARKLI", async () => {
    const tr = getDictionary("tr").villa.similarVillasTitle;
    const en = getDictionary("en").villa.similarVillasTitle;
    const de = getDictionary("de").villa.similarVillasTitle;
    expect(new Set([tr, en, de]).size).toBe(3);
  });
});

/* ===============================================================
   2) DETAY LİNKİ — locale-prefixed
   =============================================================== */
describe("SimilarVillasSection — VillaCard'a locale aktarımı", () => {
  it("TR: detay linki PREFIX'SİZ (/kiralik-villa/<slug>)", async () => {
    const { container } = await renderSection("tr");
    const link = container.querySelector('a[href*="kiralik-villa"]');
    expect(link).toHaveAttribute("href", "/kiralik-villa/villa-in-love");
  });

  it("EN: detay linki /en ile prefix'lenir", async () => {
    const { container } = await renderSection("en");
    const link = container.querySelector('a[href*="kiralik-villa"]');
    expect(link).toHaveAttribute("href", "/en/kiralik-villa/villa-in-love");
  });

  it("DE: detay linki /de ile prefix'lenir", async () => {
    const { container } = await renderSection("de");
    const link = container.querySelector('a[href*="kiralik-villa"]');
    expect(link).toHaveAttribute("href", "/de/kiralik-villa/villa-in-love");
  });

  it("locale VillaCard'ın METİNLERİNE de geçer (kartta TR hardcoded metin kalmaz)", async () => {
    await renderSection("en");
    const en = getDictionary("en");
    /* Kart alt bilgi pill'leri — locale'e göre. */
    expect(
      screen.getByText(
        formatDictionaryString(en.card.guestsValue, { n: ROW.guests })
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        formatDictionaryString(en.card.bedroomsValue, { n: ROW.bedrooms })
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        formatDictionaryString(en.card.bathroomsValue, { n: ROW.bathrooms })
      )
    ).toBeInTheDocument();
    /* TR karşılıkları DOM'da OLMAMALI. */
    const tr = getDictionary("tr");
    expect(
      screen.queryByText(
        formatDictionaryString(tr.card.bedroomsValue, { n: ROW.bedrooms })
      )
    ).not.toBeInTheDocument();
  });
});

/* ===============================================================
   3) VİLLA ADI ÇEVRİLMEZ (canonical)
   =============================================================== */
describe("SimilarVillasSection — villa adı canonical", () => {
  it.each(["tr", "en", "de"] as const)(
    "%s: villa adı her locale'de AYNI (özel isim → çevrilmez)",
    async (locale) => {
      /* villa çeviri satırı DOLU gelse bile ad çevrilmemeli. */
      findManyForLocaleMock.mockImplementation(
        (entity: string, _ids: string[], loc: string) => {
          if (entity === "villa") {
            return Promise.resolve({
              data: [
                {
                  villa_id: "villa-2",
                  locale: loc,
                  /* `title` alanı tipte YOK; olası bir DB kalıntısı
                     bile okunmamalı. */
                  title: `TRANSLATED TITLE (${loc})`,
                  badge: null,
                },
              ],
              error: null,
            });
          }
          return Promise.resolve({ data: [], error: null });
        }
      );
      await renderSection(locale);
      expect(screen.getByText("Villa In Love")).toBeInTheDocument();
      expect(
        screen.queryByText(`TRANSLATED TITLE (${locale})`)
      ).not.toBeInTheDocument();
    }
  );
});

/* ===============================================================
   4) BÖLGE ADI (canonical) + BADGE ÇEVİRİSİ
   ===============================================================
   🛡️ PHASE 10I — Bölge adları ÖZEL İSİMDİR (Kalkan, Kaş, Fethiye,
   Çavdır …); EN/DE karşılıkları yoktur ve çevrilmez. Aşağıdaki ilk iki
   test, eski "lokasyon çevirisi" davranışının TERSİNİ kilitler.
   =============================================================== */
describe("SimilarVillasSection — bölge adı canonical, badge çevrilir", () => {
  it.each(["en", "de"] as const)(
    "%s: bölge adı canonical kalır — villa_location için sorgu HİÇ atılmaz",
    async (locale) => {
      await renderSection(locale);
      expect(screen.getByText("Kalkan, Antalya")).toBeInTheDocument();
      const entities = findManyForLocaleMock.mock.calls.map((c) => c[0]);
      expect(entities).not.toContain("villa_location");
    }
  );

  it("EN: badge çevirisi varsa çevrilmiş badge render edilir", async () => {
    findManyForLocaleMock.mockImplementation((entity: string) => {
      if (entity === "villa") {
        return Promise.resolve({
          data: [{ villa_id: "villa-2", locale: "en", badge: "Popular", description: null }],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });
    await renderSection("en");
    expect(screen.getByText("Popular")).toBeInTheDocument();
    expect(screen.queryByText("Popüler")).not.toBeInTheDocument();
  });

  it("EN: badge çevirisi YOKSA orijinal TR badge kalır", async () => {
    await renderSection("en");
    expect(screen.getByText("Popüler")).toBeInTheDocument();
  });

  it("location_id null olan satırda da embed bölge adı kullanılır (çökmez)", async () => {
    findSimilarCardsMock.mockImplementation(
      (opts: { locationId: string | null }) =>
        Promise.resolve({
          data: opts.locationId ? [{ ...ROW, location_id: null }] : [],
          error: null,
        })
    );
    await renderSection("en");
    expect(screen.getByText("Kalkan, Antalya")).toBeInTheDocument();
  });
});

/* ===============================================================
   5) TR — ÇEVİRİ SORGUSU HİÇ ATILMAZ
   =============================================================== */
describe("SimilarVillasSection — TR'de ek sorgu yok", () => {
  it("TR: translationRepository.findManyForLocale HİÇ çağrılmaz", async () => {
    await renderSection("tr");
    expect(findManyForLocaleMock).not.toHaveBeenCalled();
  });

  it("locale verilmezse de (default TR) çeviri sorgusu atılmaz", async () => {
    await renderSection(undefined);
    expect(findManyForLocaleMock).not.toHaveBeenCalled();
  });

  it("EN: TEK batch sorgu — yalnız `villa` (badge); villa_location YOK", async () => {
    await renderSection("en");
    const entities = findManyForLocaleMock.mock.calls.map((c) => c[0]);
    expect(entities).toEqual(["villa"]);
    /* 🛡️ PHASE 10I — bölge çevirisi kaldırıldığı için sorgu sayısı 2 → 1. */
    expect(findManyForLocaleMock.mock.calls.length).toBe(1);
    expect(findManyForLocaleMock.mock.calls[0][2]).toBe("en");
  });
});

/* ===============================================================
   6) MEVCUT "BENZER VİLLA" SORGU KONTRATI — BOZULMADI
   =============================================================== */
describe("SimilarVillasSection — benzer villa sorgu kontratı", () => {
  it("locationId varsa 1. sorgu aynı bölgede, mevcut villa hariç, limit 3", async () => {
    await renderSection("en");
    expect(findSimilarCardsMock.mock.calls[0][0]).toEqual({
      locationId: "loc-1",
      excludeIds: ["villa-1"],
      limit: 3,
    });
  });

  it("3'e ulaşılmadıysa 2. (fallback) sorgu locationId:null + kalan limit + bulunanlar exclude", async () => {
    await renderSection("en");

    expect(findSimilarCardsMock).toHaveBeenCalledTimes(2);
    expect(findSimilarCardsMock.mock.calls[1][0]).toEqual({
      locationId: null,
      excludeIds: ["villa-1", "villa-2"],
      limit: 2,
    });
  });

  it("3 satır dönerse fallback sorgu HİÇ atılmaz (MAX 2 query kuralı)", async () => {
    findSimilarCardsMock.mockResolvedValue({
      data: [
        ROW,
        { ...ROW, id: "villa-3", slug: "v3", title: "Villa Three" },
        { ...ROW, id: "villa-4", slug: "v4", title: "Villa Four" },
      ],
      error: null,
    });
    await renderSection("en");
    expect(findSimilarCardsMock).toHaveBeenCalledTimes(1);
  });

  it("locationId null ise 1. sorgu HİÇ atılmaz, yalnız fallback çalışır", async () => {
    findSimilarCardsMock.mockResolvedValue({ data: [], error: null });
    await renderSection("en", { locationId: null });
    expect(findSimilarCardsMock).toHaveBeenCalledTimes(1);
    expect(findSimilarCardsMock.mock.calls[0][0]).toEqual({
      locationId: null,
      excludeIds: ["villa-1"],
      limit: 3,
    });
  });

  it("hiç sonuç yoksa component null döner (section HİÇ çizilmez)", async () => {
    findSimilarCardsMock.mockResolvedValue({ data: [], error: null });
    const element = await SimilarVillasSection({
      villaId: "villa-1",
      locationId: "loc-1",
      locale: "en",
    });
    expect(element).toBeNull();
  });
});
