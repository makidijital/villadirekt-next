/* ===============================================================
   🛡️ PHASE 10L / 10M — FALLBACK ZİNCİRİ + PUBLIC RENDER TESTLERİ
   ===============================================================
   Kapsam:
     A) `resolveSettingsText` (saf resolver, §6)
     B) Footer telif metni — locale-aware + {year}/{site_name} ikamesi (§7)
     C) TR BİT-BİRE AYNILIK REGRESYON KİLİDİ

   🛡️ PHASE 10M — Bakım ekranı testleri KALDIRILDI: bakım mesajı artık
   çevrilmiyor (çeviri kolonu migration 084 ile DROP edildi) ve ilgili
   client component silinip `app/(public)/layout.tsx` içine inline geri
   taşındı. Bakım ekranının CANONICAL davranışı (settings değeri +
   Türkçe varsayılan fallback) DEĞİŞMEDİ.

   `tests/unit/footer-locale.test.tsx` (Phase 9B) ile AYNI
   `usePathname` mock deseni — yeni bir test mimarisi İCAT EDİLMEDİ.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

import { resolveSettingsText } from "@/lib/i18n/settings-translation.helper";
import type { SettingsTranslationsByLocale } from "@/lib/i18n/settings-translations.types";
import Footer from "@/app/components/layout/Footer";

const TR_COPYRIGHT = "© {year} {site_name} · Tüm hakları saklıdır.";
const EN_COPYRIGHT = "© {year} {site_name} · All rights reserved.";
const DE_COPYRIGHT = "© {year} {site_name} · Alle Rechte vorbehalten.";

const TRANSLATIONS: SettingsTranslationsByLocale = {
  en: {
    footer_copyright: EN_COPYRIGHT,
    default_meta_title: "Luxury Villa Rentals",
    default_meta_description: "Handpicked villas on the Mediterranean coast.",
    hero_title: null,
    hero_subtitle: null,
    hero_badge_text: null,
    hero_primary_cta_text: null,
    hero_secondary_cta_text: null,
    business_hours: null,
  },
  de: {
    footer_copyright: DE_COPYRIGHT,
    default_meta_title: "Luxus-Villen mieten",
    default_meta_description: "Ausgewählte Villen an der Mittelmeerküste.",
    hero_title: null,
    hero_subtitle: null,
    hero_badge_text: null,
    hero_primary_cta_text: null,
    hero_secondary_cta_text: null,
    business_hours: null,
  },
};

/* ===============================================================
   A) resolveSettingsText — fallback zinciri
   =============================================================== */
describe("resolveSettingsText — §6 fallback zinciri", () => {
  it("1) locale 'tr' → canonical AYNEN (aynı string referansı, trim YOK)", () => {
    const canonical = "  boşluklu canonical  ";
    const out = resolveSettingsText(
      canonical,
      TRANSLATIONS,
      "tr",
      "footer_copyright"
    );
    expect(out).toBe(canonical);
  });

  it("2) locale 'tr' → çeviri VARSA BİLE canonical döner", () => {
    expect(
      resolveSettingsText(TR_COPYRIGHT, TRANSLATIONS, "tr", "footer_copyright")
    ).toBe(TR_COPYRIGHT);
  });

  it("3) locale 'tr' + canonical null/undefined → AYNEN null/undefined (çağıranın falsy kontrolü korunur)", () => {
    expect(resolveSettingsText(null, TRANSLATIONS, "tr", "footer_copyright")).toBeNull();
    expect(
      resolveSettingsText(undefined, TRANSLATIONS, "tr", "footer_copyright")
    ).toBeUndefined();
  });

  it("4) locale 'en' + çeviri var → çeviri", () => {
    expect(
      resolveSettingsText(TR_COPYRIGHT, TRANSLATIONS, "en", "footer_copyright")
    ).toBe(EN_COPYRIGHT);
  });

  it("5) locale 'de' + çeviri var → çeviri", () => {
    expect(
      resolveSettingsText(TR_COPYRIGHT, TRANSLATIONS, "de", "footer_copyright")
    ).toBe(DE_COPYRIGHT);
  });

  it("6) locale 'en' + çeviri YOK (translations null) → TR canonical", () => {
    expect(
      resolveSettingsText(TR_COPYRIGHT, null, "en", "footer_copyright")
    ).toBe(TR_COPYRIGHT);
    expect(
      resolveSettingsText(TR_COPYRIGHT, undefined, "en", "footer_copyright")
    ).toBe(TR_COPYRIGHT);
  });

  it("7) locale 'en' + o dil hiç yok ({ de: … }) → TR canonical", () => {
    expect(
      resolveSettingsText(
        TR_COPYRIGHT,
        { de: TRANSLATIONS.de },
        "en",
        "footer_copyright"
      )
    ).toBe(TR_COPYRIGHT);
  });

  it("8) çeviri null → TR canonical", () => {
    const partial: SettingsTranslationsByLocale = {
      en: {
        footer_copyright: null,
        default_meta_title: null,
        default_meta_description: null,
        hero_title: null,
    hero_subtitle: null,
    hero_badge_text: null,
    hero_primary_cta_text: null,
    hero_secondary_cta_text: null,
    business_hours: null,
  },
    };
    expect(
      resolveSettingsText(TR_COPYRIGHT, partial, "en", "footer_copyright")
    ).toBe(TR_COPYRIGHT);
  });

  it("9) çeviri '' veya yalnız boşluk → TR canonical", () => {
    for (const empty of ["", "   ", "\n\t"]) {
      const partial: SettingsTranslationsByLocale = {
        en: {
          footer_copyright: empty,
          default_meta_title: null,
          default_meta_description: null,
          hero_title: null,
    hero_subtitle: null,
    hero_badge_text: null,
    hero_primary_cta_text: null,
    hero_secondary_cta_text: null,
    business_hours: null,
    },
      };
      expect(
        resolveSettingsText(TR_COPYRIGHT, partial, "en", "footer_copyright")
      ).toBe(TR_COPYRIGHT);
    }
  });

  it("10) her alan BAĞIMSIZ çözülür (biri çevrili, diğeri değil)", () => {
    const partial: SettingsTranslationsByLocale = {
      en: {
        footer_copyright: EN_COPYRIGHT,
        default_meta_title: "Luxury Villa Rentals",
        default_meta_description: "",
        hero_title: null,
    hero_subtitle: null,
    hero_badge_text: null,
    hero_primary_cta_text: null,
    hero_secondary_cta_text: null,
    business_hours: null,
  },
    };
    expect(
      resolveSettingsText(TR_COPYRIGHT, partial, "en", "footer_copyright")
    ).toBe(EN_COPYRIGHT);
    expect(
      resolveSettingsText("TR başlık", partial, "en", "default_meta_title")
    ).toBe("Luxury Villa Rentals");
    expect(
      resolveSettingsText("TR açıklama", partial, "en", "default_meta_description")
    ).toBe("TR açıklama");
  });
});

/* ===============================================================
   B) Footer — §7
   =============================================================== */
const FOOTER_BASE = {
  locations: [],
  villaTypes: [],
  corporatePages: [],
  year: 2026,
  siteName: "Tatilin Yeri",
  phoneDigits: "",
};

describe("Footer — footer_copyright locale-aware (§7)", () => {
  beforeEach(() => usePathnameMock.mockReset());

  it("11) TR — canonical metin, {year}/{site_name} ikamesi AYNEN", () => {
    usePathnameMock.mockReturnValue("/");
    render(
      <Footer
        {...FOOTER_BASE}
        settings={{ footer_copyright: TR_COPYRIGHT, translations: TRANSLATIONS }}
      />
    );
    expect(
      screen.getByText("© 2026 Tatilin Yeri · Tüm hakları saklıdır.")
    ).toBeInTheDocument();
  });

  it("12) EN — çeviri kullanılır ve yer tutucular ÇEVİRİDE DE ikame edilir", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villalar");
    render(
      <Footer
        {...FOOTER_BASE}
        settings={{ footer_copyright: TR_COPYRIGHT, translations: TRANSLATIONS }}
      />
    );
    expect(
      screen.getByText("© 2026 Tatilin Yeri · All rights reserved.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("© 2026 Tatilin Yeri · Tüm hakları saklıdır.")
    ).not.toBeInTheDocument();
  });

  it("13) DE — çeviri kullanılır", () => {
    usePathnameMock.mockReturnValue("/de");
    render(
      <Footer
        {...FOOTER_BASE}
        settings={{ footer_copyright: TR_COPYRIGHT, translations: TRANSLATIONS }}
      />
    );
    expect(
      screen.getByText("© 2026 Tatilin Yeri · Alle Rechte vorbehalten.")
    ).toBeInTheDocument();
  });

  it("14) EN + çeviri YOK → TR canonical metin gösterilir", () => {
    usePathnameMock.mockReturnValue("/en");
    render(
      <Footer
        {...FOOTER_BASE}
        settings={{ footer_copyright: TR_COPYRIGHT, translations: null }}
      />
    );
    expect(
      screen.getByText("© 2026 Tatilin Yeri · Tüm hakları saklıdır.")
    ).toBeInTheDocument();
  });

  it("15) canonical BOŞ + çeviri yok → ESKİ hardcoded Türkçe fallback (DEĞİŞMEDİ)", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Footer {...FOOTER_BASE} settings={{ footer_copyright: "" }} />);
    expect(
      screen.getByText("© 2026 Tatilin Yeri · Tüm hakları saklıdır")
    ).toBeInTheDocument();
  });

  it("16) settings null → ESKİ hardcoded Türkçe fallback (DEĞİŞMEDİ)", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Footer {...FOOTER_BASE} settings={null} />);
    expect(
      screen.getByText("© 2026 Tatilin Yeri · Tüm hakları saklıdır")
    ).toBeInTheDocument();
  });

  it("17) EN + canonical boş + çeviri VAR → çeviri gösterilir", () => {
    usePathnameMock.mockReturnValue("/en");
    render(
      <Footer
        {...FOOTER_BASE}
        settings={{ footer_copyright: "", translations: TRANSLATIONS }}
      />
    );
    expect(
      screen.getByText("© 2026 Tatilin Yeri · All rights reserved.")
    ).toBeInTheDocument();
  });
});

/* ===============================================================
   C) TR BİT-BİRE AYNILIK — regresyon kilidi
   =============================================================== */
describe("TR bit-bire aynılık (§6) — çeviri VARKEN bile TR çıktısı değişmez", () => {
  beforeEach(() => usePathnameMock.mockReset());

  it("24) Footer TR DOM'u, translations=null ve translations=DOLU durumlarında AYNI", () => {
    usePathnameMock.mockReturnValue("/");
    const { container: withoutT, unmount } = render(
      <Footer
        {...FOOTER_BASE}
        settings={{ footer_copyright: TR_COPYRIGHT, translations: null }}
      />
    );
    const htmlWithout = withoutT.innerHTML;
    unmount();

    usePathnameMock.mockReturnValue("/");
    const { container: withT } = render(
      <Footer
        {...FOOTER_BASE}
        settings={{ footer_copyright: TR_COPYRIGHT, translations: TRANSLATIONS }}
      />
    );
    expect(withT.innerHTML).toBe(htmlWithout);
  });
});
