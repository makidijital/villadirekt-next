/* ===============================================================
   🛡️ PHASE 11 — PUBLIC LAYOUT KABUĞU i18n TESTLERİ
   ===============================================================
   Kapsam: BottomNav · SearchBottomSheet · VillaSearchBox ·
           CookieConsent · ScrollToTopButton · FloatingSocialClient

   `footer-locale.test.tsx` / `header-locale.test.tsx` (Phase 9A/9B) ile
   AYNI `usePathname` mock deseni — yeni test altyapısı İCAT EDİLMEDİ.

   TR regresyonu her component için AYRI kilitlenir: dictionary'ye
   taşınan metinlerin TR değerleri ESKİ hardcoded değerlerle BİREBİR.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "fs";

import { getDictionary } from "@/lib/i18n/get-dictionary";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";

const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

/* VillaSearchBox'ın server action'ı — arama MANTIĞI test kapsamı dışı. */
vi.mock("@/app/components/layout/villa-search.action", () => ({
  searchVillas: vi.fn(async () => []),
}));
vi.mock("@/lib/storage.helpers", () => ({
  resolveVillaImageUrl: () => "/placeholder.jpg",
}));

import BottomNav from "@/app/components/layout/BottomNav";
import SearchBottomSheet from "@/app/components/layout/SearchBottomSheet";
import VillaSearchBox from "@/app/components/layout/VillaSearchBox";
import CookieConsent from "@/app/components/layout/CookieConsent";
import ScrollToTopButton from "@/app/components/layout/ScrollToTopButton";
import FloatingSocialClient from "@/app/components/layout/FloatingSocialClient";

/** Blok + satır yorumlarını sıyırır — kaynak kilidi testleri YALNIZ
 *  gerçek kodu denetlesin (yorumlardaki metinler yanlış pozitif üretir). */
function stripComments(src: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of src.split("\n")) {
    const s = line.trim();
    if (!inBlock && (s.startsWith("/*") || s.startsWith("{/*"))) {
      inBlock = !s.includes("*/");
      continue;
    }
    if (inBlock) {
      if (s.includes("*/")) inBlock = false;
      continue;
    }
    if (s.startsWith("//") || s.startsWith("*")) continue;
    out.push(line);
  }
  return out.join("\n");
}

const PATHS: Record<Locale, string> = {
  tr: "/",
  en: "/en",
  de: "/de",
};

beforeEach(() => {
  usePathnameMock.mockReset();
  usePathnameMock.mockReturnValue("/");
  try {
    window.localStorage.clear();
  } catch {
    /* jsdom private-mode guard */
  }
});

/* ===============================================================
   1) BOTTOM NAV
   =============================================================== */
describe("1) BottomNav — locale", () => {
  const props = { phoneHref: "tel:+900000", whatsappHref: "https://wa.me/900000" };

  it("1a) TR — ESKİ hardcoded metinler BİREBİR", () => {
    usePathnameMock.mockReturnValue("/");
    render(<BottomNav {...props} />);
    expect(screen.getByLabelText("Alt gezinme")).toBeInTheDocument();
    expect(screen.getByText("Anasayfa")).toBeInTheDocument();
    expect(screen.getByText("Arama")).toBeInTheDocument();
    expect(screen.getByText("Telefon")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    /* 🔄 "Öneri Al" alt bardan KALDIRILDI — assertion silinmedi,
       tersine çevrildi (öğe artık bulunmamalı). */
    expect(screen.queryByText("Öneri Al")).not.toBeInTheDocument();
    /* "Villa ara" hem arama BUTONUNDA hem (kapalı) sheet dialog'unda
       geçer — burada BUTON hedeflenir. */
    expect(
      screen.getByRole("button", { name: "Villa ara", expanded: false })
    ).toBeInTheDocument();
  });

  it("1b) EN — çevrilmiş metinler", () => {
    usePathnameMock.mockReturnValue("/en");
    render(<BottomNav {...props} />);
    const d = getDictionary("en");
    expect(screen.getByLabelText(d.layout.bottomNav.ariaLabel)).toBeInTheDocument();
    expect(screen.getByText(d.header.home)).toBeInTheDocument();
    expect(screen.getByText(d.layout.bottomNav.search)).toBeInTheDocument();
    expect(screen.getByText(d.footer.phone)).toBeInTheDocument();
    expect(screen.queryByText("Öneri Al")).not.toBeInTheDocument();
    /* 🔄 Çevrilmiş "Öneri Al" de artık alt barda YOK. */
    expect(
      screen.queryByText(d.layout.bottomNav.offer)
    ).not.toBeInTheDocument();
  });

  it("1c) DE — çevrilmiş metinler", () => {
    usePathnameMock.mockReturnValue("/de/kiralik-villalar");
    render(<BottomNav {...props} />);
    const d = getDictionary("de");
    expect(screen.getByText(d.header.home)).toBeInTheDocument();
    expect(screen.queryByText("Anasayfa")).not.toBeInTheDocument();
    expect(
      screen.queryByText(d.layout.bottomNav.offer)
    ).not.toBeInTheDocument();
  });

  it("1d) 🔒 P0 REGRESYONU — /en/kiralik-villa/x'te nav HÂLÂ gizli (null)", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villa/ornek-villa");
    const { container } = render(<BottomNav {...props} />);
    expect(container.innerHTML).toBe("");
  });

  it("1e) 🔒 P0 REGRESYONU — /en'de 'Anasayfa' sekmesi AKTİF", () => {
    usePathnameMock.mockReturnValue("/en");
    render(<BottomNav {...props} />);
    const home = screen.getByLabelText(getDictionary("en").header.home);
    expect(home).toHaveAttribute("aria-current", "page");
  });

  /* ===============================================================
     🔄 ALT BAR İÇERİK SÖZLEŞMESİ (bu tur)
     ===============================================================
     "Öneri Al" kaldırıldı; WhatsApp artık GERÇEK marka glyph'i
     kullanıyor (lucide `MessageCircle` sohbet balonu DEĞİL).
     WhatsApp/telefon hedefleri PROP'tan gelir — yeniden üretilmez.
  =============================================================== */
  it("1g) 🔒 Alt barda TAM 4 öğe var ve grid 4 sütun", () => {
    usePathnameMock.mockReturnValue("/");
    const { container } = render(<BottomNav {...props} />);
    expect(container.querySelectorAll("nav ul > li")).toHaveLength(4);
    expect(container.querySelector("nav ul")?.className).toContain(
      "grid-cols-4"
    );
  });

  it("1h) 🔒 WhatsApp ikonu GERÇEK marka glyph'i (emoji/sohbet balonu değil)", () => {
    usePathnameMock.mockReturnValue("/");
    const { container } = render(<BottomNav {...props} />);
    const wa = container.querySelector('a[href="https://wa.me/900000"]');
    expect(wa).not.toBeNull();
    const path = wa?.querySelector("svg path");
    /* FloatingSocialClient ile BİREBİR aynı path verisi. */
    expect(path?.getAttribute("d")?.startsWith("M.057 24")).toBe(true);
    /* Rengi çağıran taşır → currentColor + text-[#25D366] korunur. */
    expect(wa?.querySelector("svg")?.getAttribute("fill")).toBe(
      "currentColor"
    );
    expect(wa?.querySelector("svg")?.getAttribute("class")).toContain(
      "text-[#25D366]"
    );
  });

  it("1i) 🔒 Telefon ikonu gerçek component (emoji/unicode YOK) ve href AYNEN", () => {
    usePathnameMock.mockReturnValue("/");
    const { container } = render(<BottomNav {...props} />);
    const tel = container.querySelector('a[href="tel:+900000"]');
    expect(tel).not.toBeNull();
    expect(tel?.querySelector("svg")).not.toBeNull();
    /* lucide ikonları `lucide` class'ı taşır → gerçek component. */
    expect(tel?.querySelector("svg")?.getAttribute("class")).toContain(
      "lucide"
    );
    expect(tel?.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it("1j) 🔒 WhatsApp/telefon hedefleri PROP'tan gelir — hardcode YOK", () => {
    usePathnameMock.mockReturnValue("/");
    const { container, unmount } = render(
      <BottomNav phoneHref="tel:+905550001122" whatsappHref="https://example.test/wa" />
    );
    expect(
      container.querySelector('a[href="https://example.test/wa"]')
    ).not.toBeNull();
    expect(
      container.querySelector('a[href="tel:+905550001122"]')
    ).not.toBeNull();
    unmount();
  });

  /* 🛡️ NAVIGATION LOCALE PERSISTENCE — sözleşme güncellendi: alt
     navigasyon linkleri AKTİF LOCALE'i taşır. Eski "locale'den
     BAĞIMSIZ" kuralı, EN/DE'de alt menüye dokunan kullanıcıyı
     prefix'siz TR route'una düşürüyordu. Test SİLİNMEDİ: TR
     beklentisi AYNEN korunur, EN/DE doğru davranışa çevrildi. */
  it("1f) 🔒 HREF'LER aktif locale'i taşır (TR canonical, EN/DE prefix'li)", () => {
    for (const p of ["/", "/en", "/de"]) {
      usePathnameMock.mockReturnValue(p);
      const locale = p === "/" ? "tr" : (p.slice(1) as Locale);
      const prefix = locale === "tr" ? "" : `/${locale}`;
      const { unmount } = render(<BottomNav {...props} />);
      const d = getDictionary(locale);
      expect(screen.getByLabelText(d.header.home)).toHaveAttribute(
        "href",
        prefix || "/"
      );
      /* 🔄 Alt barda ARTIK hiçbir /teklif-al linki olmamalı (öğe
         kaldırıldı). Eski href beklentisi silinmedi, bu daha SIKI
         kurala dönüştürüldü. */
      expect(
        document.querySelector('a[href$="/teklif-al"]')
      ).toBeNull();
      unmount();
    }
  });
});

/* ===============================================================
   2) SEARCH BOTTOM SHEET
   =============================================================== */
describe("2) SearchBottomSheet — locale", () => {
  it("2a) TR — ESKİ metinler BİREBİR", () => {
    render(<SearchBottomSheet open onClose={() => {}} />);
    expect(screen.getByText("Villa Ara")).toBeInTheDocument();
    expect(screen.getByLabelText("Aramayı kapat")).toBeInTheDocument();
    expect(screen.getByLabelText("Kapat")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Villa adı ile ara...")
    ).toBeInTheDocument();
  });

  it("2b) EN/DE — çevrilmiş metinler", () => {
    for (const locale of ["en", "de"] as const) {
      const d = getDictionary(locale).layout.search;
      const { unmount } = render(
        <SearchBottomSheet open onClose={() => {}} locale={locale} />
      );
      expect(screen.getByText(d.sheetTitle)).toBeInTheDocument();
      expect(
        screen.getByLabelText(d.closeBackdropAriaLabel)
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(d.sheetPlaceholder)
      ).toBeInTheDocument();
      expect(screen.queryByText("Villa Ara")).not.toBeInTheDocument();
      unmount();
    }
  });
});

/* ===============================================================
   3) VILLA SEARCH BOX
   =============================================================== */
describe("3) VillaSearchBox — locale", () => {
  it("3a) TR — varsayılan placeholder ESKİ değerle BİREBİR", () => {
    render(<VillaSearchBox />);
    expect(screen.getByPlaceholderText("Villa ara...")).toBeInTheDocument();
  });

  it("3b) EN/DE — varsayılan placeholder çevrilir", () => {
    for (const locale of ["en", "de"] as const) {
      const { unmount } = render(<VillaSearchBox locale={locale} />);
      expect(
        screen.getByPlaceholderText(getDictionary(locale).layout.search.placeholder)
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("3c) 🔒 GERİYE DÖNÜK UYUM — placeholder prop'u verilirse AYNEN kullanılır", () => {
    render(<VillaSearchBox locale="en" placeholder="Özel metin" />);
    expect(screen.getByPlaceholderText("Özel metin")).toBeInTheDocument();
  });

  it("3d) sheet variant boş durum — TR metinleri BİREBİR", () => {
    render(<VillaSearchBox variant="sheet" />);
    expect(screen.getByText("Villa adı ile arama yapın")).toBeInTheDocument();
    expect(
      screen.getByText("Aradığınız villanın adını yazın, anında listeleyelim.")
    ).toBeInTheDocument();
  });

  it("3e) sheet variant boş durum — EN/DE çevrilir", () => {
    for (const locale of ["en", "de"] as const) {
      const d = getDictionary(locale).layout.search;
      const { unmount } = render(
        <VillaSearchBox variant="sheet" locale={locale} />
      );
      expect(screen.getByText(d.emptyTitle)).toBeInTheDocument();
      expect(screen.getByText(d.emptyBody)).toBeInTheDocument();
      expect(
        screen.queryByText("Villa adı ile arama yapın")
      ).not.toBeInTheDocument();
      unmount();
    }
  });
});

/* ===============================================================
   4) COOKIE CONSENT
   =============================================================== */
describe("4) CookieConsent — locale", () => {
  it("4a) TR — ESKİ metinler BİREBİR", async () => {
    render(<CookieConsent />);
    expect(
      await screen.findByText(
        "Bu site deneyiminizi geliştirmek için çerezler kullanmaktadır."
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Çerez bilgilendirmesi")).toBeInTheDocument();
    expect(screen.getByText("Detaylar")).toBeInTheDocument();
    expect(screen.getByText("Kabul Et")).toBeInTheDocument();
  });

  it("4b) EN/DE — çevrilmiş metinler", async () => {
    for (const locale of ["en", "de"] as const) {
      usePathnameMock.mockReturnValue(PATHS[locale]);
      const d = getDictionary(locale).layout.cookie;
      const { unmount } = render(<CookieConsent />);
      expect(await screen.findByText(d.message)).toBeInTheDocument();
      expect(screen.getByText(d.accept)).toBeInTheDocument();
      unmount();
    }
  });

  /* 🛡️ NAVIGATION LOCALE PERSISTENCE — slug canonical kalır, link
     aktif locale prefix'ini taşır. */
  it("4c) 'Detaylar' href'i aktif locale'i taşır — /en/p/cerez-politikasi", async () => {
    usePathnameMock.mockReturnValue("/en");
    render(<CookieConsent />);
    const link = await screen.findByText(
      getDictionary("en").layout.cookie.details
    );
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "/en/p/cerez-politikasi"
    );
  });

  it("4d) TR'de çerez politikası linki canonical KALIR", async () => {
    usePathnameMock.mockReturnValue("/");
    render(<CookieConsent />);
    const link = await screen.findByText(
      getDictionary("tr").layout.cookie.details
    );
    expect(link.closest("a")).toHaveAttribute("href", "/p/cerez-politikasi");
  });
});

/* ===============================================================
   5) SCROLL TO TOP
   =============================================================== */
describe("5) ScrollToTopButton — locale", () => {
  it("5a) TR — ESKİ metinler BİREBİR", () => {
    render(<ScrollToTopButton />);
    expect(screen.getByText("Yukarı Çık")).toBeInTheDocument();
    expect(screen.getByLabelText("Sayfanın başına dön")).toBeInTheDocument();
  });

  it("5b) EN/DE — çevrilmiş metinler", () => {
    for (const locale of ["en", "de"] as const) {
      usePathnameMock.mockReturnValue(PATHS[locale]);
      const d = getDictionary(locale).layout.scrollTop;
      const { unmount } = render(<ScrollToTopButton />);
      expect(screen.getByText(d.label)).toBeInTheDocument();
      expect(screen.getByLabelText(d.ariaLabel)).toBeInTheDocument();
      expect(screen.queryByText("Yukarı Çık")).not.toBeInTheDocument();
      unmount();
    }
  });
});

/* ===============================================================
   6) FLOATING SOCIAL (client sunum katmanı)
   =============================================================== */
describe("6) FloatingSocialClient — locale", () => {
  const props = {
    phoneHref: "tel:+905550000000",
    whatsappHref: "https://wa.me/905550000000",
  };

  it("6a) TR — ESKİ aria/title/etiket metinleri BİREBİR", () => {
    render(<FloatingSocialClient {...props} />);
    expect(screen.getByLabelText("Hızlı iletişim")).toBeInTheDocument();
    expect(screen.getByLabelText("Hemen Ara")).toBeInTheDocument();
    expect(screen.getByLabelText("WhatsApp'tan Yaz")).toBeInTheDocument();
    expect(screen.getByLabelText("Hemen Ara")).toHaveAttribute(
      "title",
      "Hemen Ara"
    );
  });

  it("6b) EN/DE — çevrilmiş aria/title", () => {
    for (const locale of ["en", "de"] as const) {
      usePathnameMock.mockReturnValue(PATHS[locale]);
      const d = getDictionary(locale).layout.floatingSocial;
      const { unmount } = render(<FloatingSocialClient {...props} />);
      expect(screen.getByLabelText(d.ariaLabel)).toBeInTheDocument();
      expect(screen.getByLabelText(d.call)).toHaveAttribute("title", d.call);
      expect(screen.getByLabelText(d.whatsapp)).toHaveAttribute(
        "title",
        d.whatsapp
      );
      unmount();
    }
  });

  it("6c) 🔒 HREF'LER locale'den BAĞIMSIZ (link hedefleri değişmedi)", () => {
    usePathnameMock.mockReturnValue("/de");
    render(<FloatingSocialClient {...props} />);
    const d = getDictionary("de").layout.floatingSocial;
    expect(screen.getByLabelText(d.call)).toHaveAttribute("href", props.phoneHref);
    expect(screen.getByLabelText(d.whatsapp)).toHaveAttribute(
      "href",
      props.whatsappHref
    );
  });

  it("6d) 🔒 SERVER SINIRI — client dosyası getCachedSettings IMPORT ETMEZ", () => {
    const clientRaw = readFileSync(
      "app/components/layout/FloatingSocialClient.tsx",
      "utf-8"
    );
    const client = stripComments(clientRaw);
    expect(client).not.toMatch(/getCachedSettings/);
    expect(client).not.toMatch(/@\/lib\/cache\.helpers/);
    expect(clientRaw.startsWith('"use client"')).toBe(true);

    const server = stripComments(
      readFileSync("app/components/layout/FloatingSocial.tsx", "utf-8")
    );
    expect(server).toMatch(/getCachedSettings/);
    expect(server).not.toMatch(/"use client"/);
    expect(server).not.toMatch(/usePathname/);
  });
});

/* ===============================================================
   7) DICTIONARY BÜTÜNLÜĞÜ + KAYNAK KİLİDİ
   =============================================================== */
describe("7) dictionary + kaynak kilidi", () => {
  const leaves = (o: unknown, pre = ""): string[] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
      typeof v === "object" && v ? leaves(v, `${pre}${k}.`) : [`${pre}${k}`]
    );

  it("7a) tr/en/de leaf kümeleri BİREBİR aynı", () => {
    const sets = SUPPORTED_LOCALES.map((l) =>
      JSON.stringify(leaves(getDictionary(l)).sort())
    );
    expect(sets[1]).toBe(sets[0]);
    expect(sets[2]).toBe(sets[0]);
  });

  it("7b) layout.* key'leri üç dilde de DOLU", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of leaves(getDictionary(locale).layout)) {
        const value = key
          .split(".")
          .reduce<unknown>(
            (acc, k) => (acc as Record<string, unknown>)[k],
            getDictionary(locale).layout
          );
        expect(typeof value).toBe("string");
        expect((value as string).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("7c) 🔒 6 layout component'inde hardcoded TR kullanıcı-facing metin KALMADI", () => {
    const FORBIDDEN: Array<[string, string[]]> = [
      [
        "app/components/layout/BottomNav.tsx",
        ['"Alt gezinme"', '"Anasayfa"', '"Villa ara"', ">Arama<", '"Öneri Al"', '"Telefon"'],
      ],
      [
        "app/components/layout/SearchBottomSheet.tsx",
        ['"Aramayı kapat"', '"Villa ara"', '"Kapat"', '"Villa adı ile ara..."'],
      ],
      [
        "app/components/layout/VillaSearchBox.tsx",
        ['"Villa ara..."', "Villa adı ile arama yapın", "Villa bulunamadı", "Sonuç bulunamadı"],
      ],
      [
        "app/components/layout/CookieConsent.tsx",
        ['"Çerez bilgilendirmesi"', "Kabul Et", ">Detaylar<"],
      ],
      [
        "app/components/layout/ScrollToTopButton.tsx",
        ['"Sayfanın başına dön"', "Yukarı Çık"],
      ],
      [
        "app/components/layout/FloatingSocialClient.tsx",
        ['"Hızlı iletişim"', '"Hemen Ara"', "WhatsApp'tan Yaz"],
      ],
    ];
    for (const [file, needles] of FORBIDDEN) {
      const code = stripComments(readFileSync(file, "utf-8"));
      for (const needle of needles) {
        expect(code, `${file} → ${needle}`).not.toContain(needle);
      }
    }
  });
});
