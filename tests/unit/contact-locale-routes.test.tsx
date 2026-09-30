/* ===============================================================
   🛡️ /iletisim · /en/iletisim · /de/iletisim ÇOKLU DİL TESTLERİ
   ===============================================================
   Kapsam:
     A) Üç route da AYNI `ContactPageBody`'yi DOĞRU locale ile render
        eder; EN/DE gate davranışı korunur
     B) `contact` dictionary namespace bütünlüğü (TR/EN/DE)
     C) TR BYTE-IDENTITY — değerler bu fazdan önceki hardcoded
        metinlerle birebir
     D) Gövde render'ı: hero · info · map · FAQ · CTA
     E) VERİ ÇEVRİLMEZ (telefon/e-posta/adres/sosyal) + `business_hours`
        çeviri + fallback
     F) Form (ContactForm) — label/placeholder/validation/success/
        loading/generic error
     G) SEO — canonical · hreflang · multilingual kapalı
     H) Locale switch + query koruma
     I) SOURCE-LOCK — hardcoded TR kalmadı

   `kiralik-villalar-locale-routes.test.tsx` ile AYNI desen.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import { tr } from "@/lib/i18n/dictionaries/tr";
import { en } from "@/lib/i18n/dictionaries/en";
import { de } from "@/lib/i18n/dictionaries/de";
import { getLocaleSwitchTargets, hasLocaleRoute } from "@/lib/i18n/locale-switch.helper";

/* ---------------- mock katmanı ---------------- */
const requirePublicLocaleEnabledMock = vi.fn();
const setRequestLocaleMock = vi.fn();
vi.mock("@/lib/i18n/public-locale-gate.server", () => ({
  requirePublicLocaleEnabled: () => requirePublicLocaleEnabledMock(),
}));
vi.mock("@/lib/i18n/request-locale.server", () => ({
  setRequestLocale: (...a: unknown[]) => setRequestLocaleMock(...a),
}));

const getCachedSettingsMock = vi.fn();
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: () => getCachedSettingsMock(),
}));

/* PageHero — prop-yakalayan hafif stub (tasarım bu testin konusu değil). */
vi.mock("@/app/components/ui/PageHero", () => ({
  default: (props: {
    breadcrumb: { name: string; href?: string }[];
    eyebrow?: string;
    title: React.ReactNode;
    description?: string;
  }) => (
    <div data-testid="page-hero">
      <div data-testid="hero-breadcrumb">
        {props.breadcrumb.map((c) => c.name).join(" / ")}
      </div>
      <div data-testid="hero-eyebrow">{props.eyebrow}</div>
      <h1 data-testid="hero-title">{props.title}</h1>
      <div data-testid="hero-description">{props.description}</div>
    </div>
  ),
}));

import ContactPageBody from "@/app/components/contact/ContactPageBody";
import ContactForm from "@/app/(public)/iletisim/ContactForm";
import { buildContactMetadata, contactPath, CONTACT_TR_PATH } from "@/app/components/contact/contact-metadata";

/* ---------------- fixtures / helpers ---------------- */
const SETTINGS = {
  id: "s1",
  site_name: "Tatilin Yeri",
  phone: "+90 555 111 22 33",
  email: "info@ornek.com",
  address: "Kalkan Mahallesi, Kaş / Antalya",
  business_hours: "Hafta içi 09:00 - 18:00",
  whatsapp_link: "https://wa.me/905551112233",
  instagram: "https://instagram.com/tatilinyeri",
  facebook: "https://facebook.com/tatilinyeri",
  youtube: "https://youtube.com/@tatilinyeri",
  tiktok: "https://tiktok.com/@tatilinyeri",
  company_legal_name: "Tatilin Yeri A.Ş.",
  site_logo: null,
  multilingual_enabled: true,
  translations: {} as Record<string, Record<string, string | null>>,
};

function settingsWith(overrides: Record<string, unknown> = {}) {
  return { ...SETTINGS, ...overrides };
}

async function renderBody(locale: "tr" | "en" | "de") {
  const element = await ContactPageBody({ locale });
  return render(element);
}

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf-8");
}

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

function leafPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k)
  );
}
function leafValues(obj: unknown): string[] {
  if (typeof obj === "string") return [obj];
  if (typeof obj !== "object" || obj === null) return [];
  return Object.values(obj as Record<string, unknown>).flatMap(leafValues);
}

const BODY_SRC = "app/components/contact/ContactPageBody.tsx";
const FORM_SRC = "app/(public)/iletisim/ContactForm.tsx";

beforeEach(() => {
  vi.clearAllMocks();
  requirePublicLocaleEnabledMock.mockResolvedValue(undefined);
  getCachedSettingsMock.mockResolvedValue(settingsWith());
});

/* ===============================================================
   A) ROUTE DAVRANIŞI
   =============================================================== */
const LOCALE_ROUTES: Array<[string, "en" | "de"]> = [
  ["@/app/(public)/en/iletisim/page", "en"],
  ["@/app/(public)/de/iletisim/page", "de"],
];

describe.each(LOCALE_ROUTES)("%s", (modulePath, locale) => {
  it(`1) ORTAK ContactPageBody'yi locale="${locale}" ile render eder`, async () => {
    const { default: Page } = await import(modulePath);
    const element = await Page();

    expect(setRequestLocaleMock).toHaveBeenCalledWith(locale);
    expect(requirePublicLocaleEnabledMock).toHaveBeenCalledTimes(1);
    expect(element.type).toBe(ContactPageBody);
    expect(element.props.locale).toBe(locale);
  });

  it("2) multilingual KAPALI → notFound() PROPAGATE eder", async () => {
    requirePublicLocaleEnabledMock.mockRejectedValue(
      new Error("NEXT_NOT_FOUND")
    );
    const { default: Page } = await import(modulePath);
    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("3) route segment config EKLENMEDİ (TR ile aynı statik/ISR)", async () => {
    const mod: Record<string, unknown> = await import(modulePath);
    expect(mod.dynamic).toBeUndefined();
    expect(mod.revalidate).toBeUndefined();
    expect(typeof mod.generateMetadata).toBe("function");
  });
});

describe("app/(public)/iletisim/page.tsx — TR", () => {
  it("4) ORTAK gövdeyi locale='tr' ile render eder", async () => {
    const { default: Page } = await import("@/app/(public)/iletisim/page");
    const element = await Page();
    expect(element.type).toBe(ContactPageBody);
    expect(element.props.locale).toBe("tr");
  });

  it("5) TR'de locale gate'i ÇAĞRILMAZ (davranış değişmedi)", async () => {
    const { default: Page } = await import("@/app/(public)/iletisim/page");
    await Page();
    expect(setRequestLocaleMock).not.toHaveBeenCalled();
    expect(requirePublicLocaleEnabledMock).not.toHaveBeenCalled();
  });

  it("6) TR'de de route segment config YOK (mevcut davranış korundu)", async () => {
    const mod: Record<string, unknown> = await import(
      "@/app/(public)/iletisim/page"
    );
    expect(mod.dynamic).toBeUndefined();
    expect(mod.revalidate).toBeUndefined();
  });
});

/* ===============================================================
   B) DICTIONARY BÜTÜNLÜĞÜ
   =============================================================== */
describe("`contact` namespace bütünlüğü", () => {
  it("7) TR/EN/DE'de AYNI key ağacı", () => {
    const trPaths = leafPaths(tr.contact).sort();
    expect(leafPaths(en.contact).sort()).toEqual(trPaths);
    expect(leafPaths(de.contact).sort()).toEqual(trPaths);
    expect(trPaths.length).toBeGreaterThan(35);
  });

  it("8) hiçbir dilde boş değer yok", () => {
    for (const [name, d] of [
      ["tr", tr],
      ["en", en],
      ["de", de],
    ] as const) {
      for (const v of leafValues(d.contact)) {
        expect(typeof v, name).toBe("string");
        expect(v.trim().length, `${name}: "${v}"`).toBeGreaterThan(0);
      }
    }
  });

  it("9) EN'de Türkçe karakter yok", () => {
    for (const v of leafValues(en.contact)) {
      expect(/[çÇğĞıİöÖşŞüÜ]/.test(v), v).toBe(false);
    }
  });

  it("10) DE'de Türkçeye ÖZGÜ karakter yok (ö/ü Almancada geçerli)", () => {
    for (const v of leafValues(de.contact)) {
      expect(/[çÇğĞıİşŞ]/.test(v), v).toBe(false);
    }
  });

  it("11) `{brand}` ve `{n}` placeholder'ları üç dilde de KORUNUYOR", () => {
    for (const d of [tr, en, de]) {
      expect(d.contact.meta.title).toContain("{brand}");
      expect(d.contact.meta.ogTitle).toContain("{brand}");
      expect(d.contact.form.validation.messageMinLength).toContain("{n}");
    }
  });
});

/* ===============================================================
   C) TR BYTE-IDENTITY
   =============================================================== */
describe("TR byte-identity — eski hardcoded metinler", () => {
  it("12) sayfa metinleri BİREBİR", () => {
    const c = tr.contact;
    expect(c.meta.title).toBe("İletişim · {brand}");
    expect(c.meta.description).toBe(
      "Akdeniz villalarımız hakkında bilgi almak, rezervasyon ve özel tekliflerimiz için bizimle iletişime geçin."
    );
    expect(c.hero.eyebrow).toBe("İletişim");
    expect(c.hero.title).toBe("İletişim & Destek");
    expect(c.info.title).toBe("Doğrudan ulaşın");
    expect(c.info.socialMedia).toBe("Sosyal Medya");
    expect(c.info.phone).toBe("Telefon");
    expect(c.info.email).toBe("E-posta");
    expect(c.info.businessHours).toBe("Çalışma Saatleri");
    expect(c.info.location).toBe("Lokasyon");
    expect(c.form.eyebrow).toBe("Mesaj");
    expect(c.form.title).toBe("Bir not bırakın.");
    expect(c.map.eyebrow).toBe("Harita");
    expect(c.map.title).toBe("Akdeniz koylarında.");
    expect(c.map.iframeTitle).toBe("Lokasyon haritası");
    expect(c.faq.eyebrow).toBe("Sık Sorulanlar");
    expect(c.faq.title).toBe("Yanıtlar, sade.");
    expect(c.faq.items.responseTime.question).toBe("Dönüş süreniz nedir?");
    expect(c.cta.eyebrow).toBe("Koleksiyon");
    expect(c.cta.titleLead).toBe("Hayalinizdeki villayı");
    expect(c.cta.titleAccent).toBe("birlikte bulalım.");
    expect(c.cta.button).toBe("Tüm villaları gör");
  });

  it("13) form metinleri BİREBİR", () => {
    const f = tr.contact.form;
    expect(f.nameLabel).toBe("Ad Soyad");
    expect(f.namePlaceholder).toBe("Adınız");
    expect(f.phoneLabel).toBe("Telefon");
    expect(f.emailLabel).toBe("E-posta");
    expect(f.messageLabel).toBe("Mesajınız");
    expect(f.submit).toBe("Gönder");
    expect(f.submitting).toBe("Gönderiliyor…");
    expect(f.submitted).toBe("Gönderildi");
    expect(f.success).toBe(
      "Mesajınız iletildi. Ekibimiz en kısa sürede dönüş yapacak."
    );
    expect(f.validation.nameRequired).toBe("Lütfen adınızı yazın.");
    expect(f.validation.messageMinLength).toBe(
      "Mesajınız en az {n} karakter olmalı."
    );
    expect(f.validation.phoneOrEmailRequired).toBe(
      "Telefon veya e-posta — en az biri gerekli."
    );
  });

  it("14) BREADCRUMB key'leri REUSE edildi (yeni key açılmadı)", () => {
    expect(tr.search.breadcrumbHome).toBe("Ana sayfa");
    expect(tr.header.contact).toBe("İletişim");
    expect(en.header.contact).toBe("Contact");
    expect(de.header.contact).toBe("Kontakt");
  });
});

/* ===============================================================
   D) GÖVDE RENDER
   =============================================================== */
describe("Gövde render — TR/EN/DE", () => {
  it.each(["tr", "en", "de"] as const)(
    "15) %s: hero breadcrumb/eyebrow/başlık/açıklama kendi dilinde",
    async (locale) => {
      const d = { tr, en, de }[locale];
      await renderBody(locale);
      expect(screen.getByTestId("hero-breadcrumb")).toHaveTextContent(
        `${d.search.breadcrumbHome} / ${d.header.contact}`
      );
      expect(screen.getByTestId("hero-eyebrow")).toHaveTextContent(
        d.contact.hero.eyebrow
      );
      expect(screen.getByTestId("hero-title")).toHaveTextContent(
        d.contact.hero.title
      );
      expect(screen.getByTestId("hero-description")).toHaveTextContent(
        d.contact.hero.description
      );
    }
  );

  it.each(["tr", "en", "de"] as const)(
    "16) %s: info başlıkları ve etiketleri kendi dilinde",
    async (locale) => {
      const c = { tr, en, de }[locale].contact;
      await renderBody(locale);
      expect(screen.getByText(c.info.title)).toBeInTheDocument();
      expect(screen.getByText(c.info.socialMedia)).toBeInTheDocument();
      /* `info.phone` / `info.email` etiketleri form alanlarıyla AYNI
         metni taşıyabilir (ör. TR "Telefon") → getAllByText. */
      expect(screen.getAllByText(c.info.phone).length).toBeGreaterThan(0);
      expect(screen.getAllByText(c.info.email).length).toBeGreaterThan(0);
      expect(screen.getByText(c.info.businessHours)).toBeInTheDocument();
      expect(screen.getByText(c.info.location)).toBeInTheDocument();
    }
  );

  it.each(["tr", "en", "de"] as const)(
    "17) %s: harita bloğu ve iframe title kendi dilinde",
    async (locale) => {
      const c = { tr, en, de }[locale].contact;
      await renderBody(locale);
      expect(screen.getByText(c.map.eyebrow)).toBeInTheDocument();
      expect(screen.getByText(c.map.title)).toBeInTheDocument();
      expect(screen.getByTitle(c.map.iframeTitle)).toBeInTheDocument();
    }
  );

  it.each(["tr", "en", "de"] as const)(
    "18) %s: 3 FAQ kartı kendi dilinde",
    async (locale) => {
      const c = { tr, en, de }[locale].contact;
      await renderBody(locale);
      expect(screen.getByText(c.faq.eyebrow)).toBeInTheDocument();
      expect(screen.getByText(c.faq.title)).toBeInTheDocument();
      for (const item of Object.values(c.faq.items)) {
        expect(screen.getByText(item.question)).toBeInTheDocument();
        expect(screen.getByText(item.answer)).toBeInTheDocument();
      }
    }
  );

  it.each(["tr", "en", "de"] as const)(
    "19) %s: CTA bloğu kendi dilinde",
    async (locale) => {
      const c = { tr, en, de }[locale].contact;
      await renderBody(locale);
      expect(screen.getByText(c.cta.eyebrow)).toBeInTheDocument();
      expect(screen.getByText(c.cta.titleAccent)).toBeInTheDocument();
      expect(screen.getByText(c.cta.description)).toBeInTheDocument();
      const link = screen.getByRole("link", { name: c.cta.button });
      /* 🛡️ NAVIGATION LOCALE PERSISTENCE — CTA hedefi artık aktif
         locale'i taşır (slug canonical kalır). */
      expect(link).toHaveAttribute(
        "href",
        locale === "tr" ? "/arama" : `/${locale}/arama`
      );
    }
  );

  it("20) TR görünümünde EN/DE metinleri SIZMAZ (regresyon)", async () => {
    await renderBody("tr");
    expect(screen.queryByText(en.contact.info.title)).toBeNull();
    expect(screen.queryByText(de.contact.map.eyebrow)).toBeNull();
    expect(screen.getByText(tr.contact.info.title)).toBeInTheDocument();
  });
});

/* ===============================================================
   E) VERİ — ÇEVRİLMEZ + business_hours
   =============================================================== */
describe("Settings verisi", () => {
  it.each(["tr", "en", "de"] as const)(
    "21) %s: telefon/e-posta/adres/sosyal handle ÇEVRİLMEZ",
    async (locale) => {
      await renderBody(locale);
      /* Telefon hem "Telefon" hem "WhatsApp" satırında değer olarak
         görünür (mevcut davranış) → getAllByText. */
      expect(screen.getAllByText(SETTINGS.phone).length).toBeGreaterThan(0);
      expect(screen.getByText(SETTINGS.email)).toBeInTheDocument();
      expect(screen.getByText(SETTINGS.address)).toBeInTheDocument();
      expect(screen.getAllByText("@tatilinyeri").length).toBeGreaterThan(0);
    }
  );

  it("22) sosyal medya bağlantı href'leri canonical kalır", async () => {
    await renderBody("de");
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain(SETTINGS.instagram);
    expect(hrefs).toContain(SETTINGS.whatsapp_link);
    expect(hrefs).toContain(`mailto:${SETTINGS.email}`);
  });

  it("23) TR → canonical business_hours", async () => {
    getCachedSettingsMock.mockResolvedValue(
      settingsWith({
        translations: { en: { business_hours: "Weekdays 09:00 - 18:00" } },
      })
    );
    await renderBody("tr");
    expect(screen.getByText("Hafta içi 09:00 - 18:00")).toBeInTheDocument();
    expect(screen.queryByText("Weekdays 09:00 - 18:00")).toBeNull();
  });

  it("24) EN → business_hours çevirisi gösterilir", async () => {
    getCachedSettingsMock.mockResolvedValue(
      settingsWith({
        translations: { en: { business_hours: "Weekdays 09:00 - 18:00" } },
      })
    );
    await renderBody("en");
    expect(screen.getByText("Weekdays 09:00 - 18:00")).toBeInTheDocument();
    expect(screen.queryByText("Hafta içi 09:00 - 18:00")).toBeNull();
  });

  it("25) DE → business_hours çevirisi gösterilir", async () => {
    getCachedSettingsMock.mockResolvedValue(
      settingsWith({
        translations: { de: { business_hours: "Werktags 09:00 - 18:00" } },
      })
    );
    await renderBody("de");
    expect(screen.getByText("Werktags 09:00 - 18:00")).toBeInTheDocument();
  });

  it("26) çeviri YOK → TR canonical fallback", async () => {
    getCachedSettingsMock.mockResolvedValue(settingsWith({ translations: {} }));
    await renderBody("en");
    expect(screen.getByText("Hafta içi 09:00 - 18:00")).toBeInTheDocument();
  });

  it("27) BOŞ / WHITESPACE çeviri → TR canonical fallback", async () => {
    getCachedSettingsMock.mockResolvedValue(
      settingsWith({
        translations: { en: { business_hours: "   " }, de: { business_hours: "" } },
      })
    );
    await renderBody("en");
    expect(screen.getByText("Hafta içi 09:00 - 18:00")).toBeInTheDocument();
  });

  it("28) settings okunamazsa sayfa ÇÖKMEZ (defensive empty-state)", async () => {
    getCachedSettingsMock.mockRejectedValue(new Error("db down"));
    await renderBody("en");
    /* Dictionary metinleri yine görünür. */
    expect(screen.getByText(en.contact.map.title)).toBeInTheDocument();
    /* İletişim satırları gizlenir. */
    expect(screen.queryByText(en.contact.info.title)).toBeNull();
  });
});

/* ===============================================================
   F) FORM
   =============================================================== */
describe("ContactForm — çoklu dil", () => {
  it.each(["tr", "en", "de"] as const)(
    "29) %s: label/placeholder/buton metinleri kendi dilinde",
    (locale) => {
      const f = { tr, en, de }[locale].contact.form;
      render(<ContactForm locale={locale} />);
      expect(screen.getByText(f.nameLabel)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(f.namePlaceholder)).toBeInTheDocument();
      expect(screen.getByText(f.messageLabel)).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(f.messagePlaceholder)
      ).toBeInTheDocument();
      expect(screen.getByText(f.submit)).toBeInTheDocument();
      expect(screen.getByText(f.privacy)).toBeInTheDocument();
    }
  );

  it("30) locale verilmezse TR (mevcut çağıranlar bozulmaz)", () => {
    render(<ContactForm />);
    expect(screen.getByText("Ad Soyad")).toBeInTheDocument();
    expect(screen.getByText("Gönder")).toBeInTheDocument();
  });

  it.each(["tr", "en", "de"] as const)(
    "31) %s: ad zorunlu validation mesajı kendi dilinde",
    async (locale) => {
      const f = { tr, en, de }[locale].contact.form;
      render(<ContactForm locale={locale} />);
      /* time-trap'i aşmak için mount zamanını geriye al. */
      vi.setSystemTime(new Date(Date.now() + 5000));
      fireEvent.submit(screen.getByText(f.submit).closest("form")!);
      await waitFor(() =>
        expect(screen.getByText(f.validation.nameRequired)).toBeInTheDocument()
      );
      vi.useRealTimers();
    }
  );

  it.each(["tr", "en", "de"] as const)(
    "32) %s: mesaj uzunluğu validation'ı `{n}` ile doldurulur",
    async (locale) => {
      const f = { tr, en, de }[locale].contact.form;
      render(<ContactForm locale={locale} />);
      fireEvent.change(screen.getByPlaceholderText(f.namePlaceholder), {
        target: { value: "Ad" },
      });
      vi.setSystemTime(new Date(Date.now() + 5000));
      fireEvent.submit(screen.getByText(f.submit).closest("form")!);
      const expected = f.validation.messageMinLength.replace("{n}", "10");
      await waitFor(() =>
        expect(screen.getByText(expected)).toBeInTheDocument()
      );
      expect(expected).not.toContain("{n}");
      vi.useRealTimers();
    }
  );

  it.each(["tr", "en", "de"] as const)(
    "33) %s: telefon/e-posta zorunluluğu kendi dilinde",
    async (locale) => {
      const f = { tr, en, de }[locale].contact.form;
      render(<ContactForm locale={locale} />);
      fireEvent.change(screen.getByPlaceholderText(f.namePlaceholder), {
        target: { value: "Ad" },
      });
      fireEvent.change(screen.getByPlaceholderText(f.messagePlaceholder), {
        target: { value: "On karakterden uzun bir mesaj." },
      });
      vi.setSystemTime(new Date(Date.now() + 5000));
      fireEvent.submit(screen.getByText(f.submit).closest("form")!);
      await waitFor(() =>
        expect(
          screen.getByText(f.validation.phoneOrEmailRequired)
        ).toBeInTheDocument()
      );
      vi.useRealTimers();
    }
  );

  async function submitValid(locale: "tr" | "en" | "de") {
    const f = { tr, en, de }[locale].contact.form;
    render(<ContactForm locale={locale} />);
    fireEvent.change(screen.getByPlaceholderText(f.namePlaceholder), {
      target: { value: "Ad Soyad" },
    });
    fireEvent.change(screen.getByPlaceholderText(f.emailPlaceholder), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(f.messagePlaceholder), {
      target: { value: "On karakterden uzun bir mesaj." },
    });
    vi.setSystemTime(new Date(Date.now() + 5000));
    fireEvent.submit(screen.getByText(f.submit).closest("form")!);
    vi.useRealTimers();
    return f;
  }

  it.each(["tr", "en", "de"] as const)(
    "34) %s: başarı mesajı kendi dilinde",
    async (locale) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
      );
      const f = await submitValid(locale);
      await waitFor(() =>
        expect(screen.getByText(f.success)).toBeInTheDocument()
      );
      expect(screen.getByText(f.submitted)).toBeInTheDocument();
      vi.unstubAllGlobals();
    }
  );

  it.each(["tr", "en", "de"] as const)(
    "35) %s: SUNUCU hata metni UI'a SIZMAZ → generic locale mesajı",
    async (locale) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          json: async () => ({ ok: false, error: "Too many requests" }),
        })
      );
      const f = await submitValid(locale);
      await waitFor(() =>
        expect(screen.getByText(f.errorGeneric)).toBeInTheDocument()
      );
      expect(screen.queryByText("Too many requests")).toBeNull();
      vi.unstubAllGlobals();
    }
  );

  it("36) TR server mesajı da SIZMAZ ('Mesaj iletilemedi.' ham metni gösterilmez)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ ok: false, error: "Geçersiz istek" }),
      })
    );
    const f = await submitValid("en");
    await waitFor(() =>
      expect(screen.getByText(f.errorGeneric)).toBeInTheDocument()
    );
    expect(screen.queryByText("Geçersiz istek")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("37) API SÖZLEŞMESİ DEĞİŞMEDİ — body alanları aynı", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await submitValid("de");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/public/contact");
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual(
      [
        "full_name",
        "phone",
        "email",
        "message",
        "source_page",
        "website",
        "elapsedMs",
      ].sort()
    );
    vi.unstubAllGlobals();
  });
});

/* ===============================================================
   G) SEO / METADATA
   =============================================================== */
describe("Metadata", () => {
  it("38) contactPath() üç locale için doğru", () => {
    expect(CONTACT_TR_PATH).toBe("/iletisim");
    expect(contactPath("tr")).toBe("/iletisim");
    expect(contactPath("en")).toBe("/en/iletisim");
    expect(contactPath("de")).toBe("/de/iletisim");
  });

  it.each([
    ["tr", "/iletisim"],
    ["en", "/en/iletisim"],
    ["de", "/de/iletisim"],
  ] as const)("39) %s: canonical '%s' + locale başlık", async (locale, canonical) => {
    const meta = await buildContactMetadata(locale);
    const d = { tr, en, de }[locale].contact.meta;
    expect(meta.title).toBe(d.title.replace("{brand}", "Tatilin Yeri"));
    expect(meta.description).toBe(d.description);
    expect(meta.alternates?.canonical).toBe(canonical);
    expect(meta.openGraph?.url).toBe(canonical);
  });

  it("40) multilingual AÇIK → hreflang (languages) üretilir", async () => {
    const meta = await buildContactMetadata("en");
    expect(meta.alternates?.languages).toEqual({
      tr: "/iletisim",
      en: "/en/iletisim",
      de: "/de/iletisim",
      "x-default": "/iletisim",
    });
  });

  it("41) multilingual KAPALI → languages ÜRETİLMEZ (TR çıktısı eskisi gibi)", async () => {
    getCachedSettingsMock.mockResolvedValue(
      settingsWith({ multilingual_enabled: false })
    );
    const meta = await buildContactMetadata("tr");
    expect(meta.alternates?.canonical).toBe("/iletisim");
    expect(meta.alternates?.languages).toBeUndefined();
  });

  it("42) settings okunamazsa brand fallback'i korunur", async () => {
    getCachedSettingsMock.mockRejectedValue(new Error("db"));
    const meta = await buildContactMetadata("tr");
    expect(meta.title).toBe("İletişim · Villa Kiralama");
  });
});

/* ===============================================================
   H) LOCALE SWITCH
   =============================================================== */
describe("Locale switch", () => {
  it("43) '/iletisim' artık EXACT locale route (fallback DEĞİL)", () => {
    expect(hasLocaleRoute("/iletisim")).toBe(true);
  });

  it("44) /de/iletisim → EN/TR hedefleri doğru", () => {
    expect(getLocaleSwitchTargets("/de/iletisim")).toEqual({
      tr: "/iletisim",
      en: "/en/iletisim",
      de: "/de/iletisim",
    });
  });

  it("45) query string KORUNUR", () => {
    const q = "utm_source=mail&x=1";
    const t = getLocaleSwitchTargets("/de/iletisim", q);
    expect(t.en).toBe(`/en/iletisim?${q}`);
    expect(t.tr).toBe(`/iletisim?${q}`);
  });
});

/* ===============================================================
   I) SOURCE-LOCK
   =============================================================== */
describe("SOURCE-LOCK — hardcoded TR kalmadı", () => {
  const bodyCode = stripComments(readSrc(BODY_SRC));
  const formCode = stripComments(readSrc(FORM_SRC));

  it("46) ContactPageBody'de eski hardcoded TR metinleri YOK", () => {
    for (const s of [
      "İletişim & Destek",
      "Doğrudan ulaşın",
      "Sosyal Medya",
      "Çalışma Saatleri",
      "Lokasyon haritası",
      "Akdeniz koylarında",
      "Sık Sorulanlar",
      "Yanıtlar, sade.",
      "Bir not bırakın.",
      "Hayalinizdeki villayı",
      "Tüm villaları gör",
      "Dönüş süreniz nedir?",
      "Ana sayfa",
    ]) {
      expect(bodyCode.includes(s), s).toBe(false);
    }
  });

  it("47) ContactForm'da eski hardcoded TR metinleri YOK", () => {
    for (const s of [
      "Ad Soyad",
      "Adınız",
      "Mesajınız",
      "Gönderiliyor",
      "Gönderildi",
      "Lütfen adınızı yazın",
      "Mesaj iletilemedi",
      "en az biri gerekli",
      "Gizlilik",
    ]) {
      expect(formCode.includes(s), s).toBe(false);
    }
  });

  it("48) her ikisi de dictionary üzerinden okuyor", () => {
    expect(bodyCode.includes("getDictionary(locale).contact")).toBe(true);
    expect(formCode.includes("getDictionary(locale).contact.form")).toBe(true);
  });

  it("49) sunucu hata metni UI'a basılmıyor (`result?.error` kaldırıldı)", () => {
    expect(formCode.includes("result?.error")).toBe(false);
    expect(formCode.includes("dict.errorGeneric")).toBe(true);
  });

  it("50) GERÇEK iletişim verisi dictionary'ye ALINMADI", () => {
    for (const d of [tr, en, de]) {
      const values = leafValues(d.contact).join(" ");
      /* Gerçek telefon/e-posta/adres/sosyal URL HİÇBİR dilde yok.
         (`form.emailPlaceholder` bilinçli bir ÖRNEK metindir —
         gerçek veri değildir.) */
      expect(values).not.toContain("http");
      expect(values).not.toContain("instagram.com");
      expect(values).not.toContain("wa.me");
      expect(values).not.toMatch(/\+90\s?5\d\d\s?\d{3}/);
    }
    /* Placeholder dışında hiçbir değerde "@" yok. */
    for (const d of [tr, en, de]) {
      const others = leafValues(d.contact).filter(
        (v) => v !== d.contact.form.emailPlaceholder
      );
      expect(others.join(" ")).not.toContain("@");
    }
  });
});
