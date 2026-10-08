/* ===============================================================
   🎨 /teklif-al REDESIGN — UI değişti, form state + submit DEĞİŞMEDİ
   ===============================================================
   - Tüm alanlar render olur (grup, tarih, kişi, bölge, tip, özellik,
     bütçe, para birimi, ad, telefon, e-posta, not, honeypot).
   - Submit payload'ı / endpoint / method / honeypot + time-trap /
     loading / success / error davranışı BİREBİR.
   - Teklif özeti yalnız mevcut state'ten; yardım kartı settings
     href'lerini AYNEN kullanır. TR / EN / DE.
   =============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, cleanup, act } from "@testing-library/react";
import { readFileSync } from "fs";

import { getDictionary } from "@/lib/i18n/get-dictionary";
import { localeHref } from "@/lib/i18n/locale-href";
import type { Locale } from "@/lib/i18n/config";

/* DatePicker stub — prop'ları kaydeder, onChange'i tetikleyen buton. */
const dpProps: Array<Record<string, unknown>> = [];
vi.mock("react-datepicker", () => ({
  default: (p: Record<string, unknown> & { onChange: (d: [Date, Date]) => void; placeholderText: string }) => {
    dpProps.push(p);
    return (
      <button
        type="button"
        data-testid="dp-trigger"
        className={String(p.className)}
        onClick={() => p.onChange([new Date(2026, 9, 12), new Date(2026, 9, 19)])}
      >
        {p.placeholderText}
      </button>
    );
  },
  registerLocale: () => undefined,
}));

const SETTINGS = {
  phone: " +90 532 000 00 00 ",
  whatsapp_link: "https://wa.me/905320000000?text=Merhaba",
};
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: async () => SETTINGS,
}));

const TAX = {
  ok: true,
  locations: [
    { id: "l1", name: "Kalkan", slug: "kalkan", filter_group_name: "Kalkan" },
    { id: "l2", name: "Kaş", slug: "kas", filter_group_name: "Kaş" },
    { id: "l3", name: "Kalkan Merkez", slug: "kalkan-merkez", filter_group_name: "Kalkan" },
  ],
  types: [{ id: "t1", name: "Balayı Villası", slug: "balayi-villasi", name_by_locale: { en: "Honeymoon Villa", de: "Flitterwochen-Villa" } }],
  features: [{ id: "f1", name: "Deniz Manzarası", slug: null, name_by_locale: { en: "Sea View", de: "Meerblick" } }],
};

let postResponse: { ok: boolean; body: unknown } = { ok: true, body: { ok: true } };
let fetchMock: ReturnType<typeof vi.fn>;
let now = 0;

beforeEach(() => {
  dpProps.length = 0;
  postResponse = { ok: true, body: { ok: true } };
  now = 1_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/api/public/taxonomies")) return { ok: true, json: async () => TAX };
    return { ok: postResponse.ok, json: async () => postResponse.body };
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderForm(locale: Locale = "tr", hrefs: { phoneHref?: string | null; whatsappHref?: string | null } = {}) {
  const { default: OfferRequestForm } = await import("@/app/(public)/teklif-al/OfferRequestForm");
  const utils = render(<OfferRequestForm locale={locale} {...hrefs} />);
  await screen.findByText("Kalkan");
  now = 10_000; /* time-trap geçildi (≥ 2000ms) */
  return utils;
}

const d = (l: Locale) => getDictionary(l).offer;

describe("1) tüm alanlar render olur", () => {
  it.each<Locale>(["tr", "en", "de"])("%s — bölümler + alanlar", async (locale) => {
    const t = d(locale);
    const { container } = await renderForm(locale);

    /* 4 görsel bölüm (sıra: tatil → villa → iletişim → ek) */
    const h2 = Array.from(container.querySelectorAll("section h2")).map((h) => h.textContent);
    expect(h2).toEqual([t.sectionTripTitle, t.sectionPrefsTitle, t.step4Title, t.sectionExtraTitle]);

    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radiogroup", { name: t.travelGroupAriaLabel })).toBeTruthy();
    expect(screen.getByTestId("dp-trigger").textContent).toBe(t.datePlaceholder);
    expect(screen.getByRole("button", { name: t.stepperIncreaseAriaLabel.replace("{label}", t.adultsLabel) })).toBeTruthy();
    expect(screen.getByRole("button", { name: t.stepperIncreaseAriaLabel.replace("{label}", t.childrenLabel) })).toBeTruthy();
    /* bölge: yalnız grup kökleri */
    expect(screen.getByRole("button", { name: "Kalkan" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Kalkan Merkez" })).toBeNull();
    expect(screen.getAllByPlaceholderText("0")).toHaveLength(2);
    const select = container.querySelector("select")!;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["TRY", "USD", "EUR", "GBP"]);
    expect(screen.getByPlaceholderText(t.fullNamePlaceholder)).toBeTruthy();
    expect(screen.getByPlaceholderText("+90 5__ ___ __ __").getAttribute("type")).toBe("tel");
    expect(screen.getByPlaceholderText(t.emailPlaceholder).getAttribute("type")).toBe("email");
    expect(screen.getByLabelText(t.noteLabel).tagName).toBe("TEXTAREA");
    expect(container.querySelector('input[name="website"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: t.submit })).toBeTruthy();
  });

  it("DatePicker prop'ları AYNEN (range, format, minDate, portal, locale)", async () => {
    await renderForm("en");
    const p = dpProps[dpProps.length - 1];
    expect(p.selectsRange).toBe(true);
    expect(p.dateFormat).toBe("dd.MM.yyyy");
    expect(p.locale).toBe("en");
    expect(p.portalId).toBe("teklif-datepicker-portal");
    expect(p.popperClassName).toBe("!z-[60]");
    expect(p.minDate).toBeInstanceOf(Date);
    expect(document.getElementById("teklif-datepicker-portal")).toBeTruthy();
  });
});

describe("2) UI redesign sonrası mevcut form state ve submit davranışı DEĞİŞMEDİ", () => {
  it("submit yalnız ad ≥2 + telefon ≥6 ile aktif", async () => {
    const t = d("tr");
    await renderForm("tr");
    const btn = screen.getByRole("button", { name: t.submit }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(t.fullNamePlaceholder), { target: { value: "A" } });
    fireEvent.change(screen.getByPlaceholderText("+90 5__ ___ __ __"), { target: { value: "123456" } });
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(t.fullNamePlaceholder), { target: { value: "Ay" } });
    expect(btn.disabled).toBe(false);
  });

  it("tam akış: aynı endpoint / method / payload → loading → success", async () => {
    const t = d("tr");
    let resolvePost: (v: unknown) => void = () => {};
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("/api/public/taxonomies")) return Promise.resolve({ ok: true, json: async () => TAX });
      return new Promise((r) => { resolvePost = r; });
    });
    await renderForm("tr");

    fireEvent.click(screen.getByRole("radio", { name: new RegExp(t.groupFriends) }));
    fireEvent.click(screen.getByTestId("dp-trigger"));
    fireEvent.click(screen.getByRole("button", { name: t.stepperIncreaseAriaLabel.replace("{label}", t.adultsLabel) }));
    fireEvent.click(screen.getByRole("button", { name: t.stepperIncreaseAriaLabel.replace("{label}", t.childrenLabel) }));
    fireEvent.click(screen.getByRole("button", { name: "Kalkan" }));
    fireEvent.click(screen.getByRole("button", { name: "Balayı Villası" }));
    fireEvent.click(screen.getByRole("button", { name: "Deniz Manzarası" }));
    const [bmin, bmax] = screen.getAllByPlaceholderText("0");
    fireEvent.change(bmin, { target: { value: "10.000₺" } });
    fireEvent.change(bmax, { target: { value: "25000" } });
    fireEvent.change(document.querySelector("select")!, { target: { value: "EUR" } });
    fireEvent.change(screen.getByPlaceholderText(t.fullNamePlaceholder), { target: { value: "Ayşe Yılmaz" } });
    fireEvent.change(screen.getByPlaceholderText("+90 5__ ___ __ __"), { target: { value: "+90 555 111 22 33" } });
    fireEvent.change(screen.getByPlaceholderText(t.emailPlaceholder), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(t.noteLabel), { target: { value: "Doğum günü" } });

    fireEvent.click(screen.getByRole("button", { name: t.submit }));
    await screen.findByRole("button", { name: t.submitting });
    expect((screen.getByRole("button", { name: t.submitting }) as HTMLButtonElement).disabled).toBe(true);

    const post = fetchMock.mock.calls.find((c) => String(c[0]) === "/api/public/offer-requests")!;
    expect(post[1].method).toBe("POST");
    expect(post[1].headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(post[1].body)).toEqual({
      travel_group: "friends",
      start_date: "2026-10-12",
      end_date: "2026-10-19",
      adults: 3,
      children: 1,
      region_tokens: ["kalkan"],
      villa_type_tokens: ["balayi-villasi"],
      feature_tokens: ["f1"],
      budget_min: 10000,
      budget_max: 25000,
      budget_currency: "EUR",
      full_name: "Ayşe Yılmaz",
      phone: "+90 555 111 22 33",
      email: "a@b.com",
      note: "Doğum günü",
      website: "",
      elapsedMs: 9000,
    });

    await act(async () => { resolvePost({ ok: true, json: async () => ({ ok: true }) }); });
    const ok = await screen.findByRole("status");
    expect(ok.textContent).toContain(t.successTitle);
    expect(ok.textContent).toContain(t.successBody);
  });

  it("sunucu hatası → mevcut kırmızı alert + generic mesaj; buton tekrar aktif", async () => {
    const t = d("en");
    postResponse = { ok: false, body: { ok: false, error: "x" } };
    await renderForm("en");
    fireEvent.change(screen.getByPlaceholderText(t.fullNamePlaceholder), { target: { value: "John" } });
    fireEvent.change(screen.getByPlaceholderText("+90 5__ ___ __ __"), { target: { value: "1234567" } });
    fireEvent.click(screen.getByRole("button", { name: t.submit }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(t.errorGeneric);
    expect(alert.className).toContain("bg-red-50");
    expect((screen.getByRole("button", { name: t.submit }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("honeypot dolu → sessiz success, POST YOK", async () => {
    const t = d("tr");
    const { container } = await renderForm("tr");
    fireEvent.change(container.querySelector('input[name="website"]')!, { target: { value: "bot" } });
    fireEvent.change(screen.getByPlaceholderText(t.fullNamePlaceholder), { target: { value: "Ay" } });
    fireEvent.change(screen.getByPlaceholderText("+90 5__ ___ __ __"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: t.submit }));
    await screen.findByRole("status");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("offer-requests"))).toBe(false);
  });

  it("stepper min/max: yetişkin ≥1, çocuk ≥0", async () => {
    const t = d("tr");
    await renderForm("tr");
    const decA = screen.getByRole("button", { name: t.stepperDecreaseAriaLabel.replace("{label}", t.adultsLabel) }) as HTMLButtonElement;
    const decC = screen.getByRole("button", { name: t.stepperDecreaseAriaLabel.replace("{label}", t.childrenLabel) }) as HTMLButtonElement;
    expect(decC.disabled).toBe(true);
    fireEvent.click(decA);
    expect(decA.disabled).toBe(true);
  });

  it("kaynak kilidi — submit/validation/time-trap satırları aynen", () => {
    const src = readFileSync("app/(public)/teklif-al/OfferRequestForm.tsx", "utf8");
    for (const line of [
      'fetch("/api/public/taxonomies")',
      'await fetch("/api/public/offer-requests", {',
      'method: "POST",',
      "body: JSON.stringify({ ...payload, website, elapsedMs: elapsed }),",
      "const MIN_SUBMIT_MS = 2000;",
      "if (state.fullName.trim().length < 2) return false;",
      "if (state.phone.trim().length < 6) return false;",
      'disabled={!isReady || status.kind === "loading"}',
      "<form\n      onSubmit={handleSubmit}",
    ]) {
      expect(src).toContain(line);
    }
  });
});

describe("3) teklif özeti (mevcut state'ten)", () => {
  it("başlangıçta placeholder + misafir; seçim yapınca satırlar", async () => {
    const t = d("tr");
    await renderForm("tr");
    const sum = screen.getByTestId("offer-summary");
    expect(within(sum).getByText(t.summaryTitle)).toBeTruthy();
    expect(within(sum).getByText(t.summaryEmpty)).toBeTruthy();
    expect(within(sum).getByText(`2 ${t.adultsLabel}`)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Kalkan" }));
    fireEvent.click(screen.getByTestId("dp-trigger"));
    expect(within(sum).queryByText(t.summaryEmpty)).toBeNull();
    expect(within(sum).getByText("Kalkan")).toBeTruthy();
    expect(within(sum).getByText(t.dateRangeLabel)).toBeTruthy();
  });

  it("EN — tip/özellik adı çeviriyle görünür", async () => {
    await renderForm("en");
    fireEvent.click(screen.getByRole("button", { name: "Honeymoon Villa" }));
    expect(within(screen.getByTestId("offer-summary")).getByText("Honeymoon Villa")).toBeTruthy();
  });
});

describe("4) yardım kartı", () => {
  it("href verilmezse kart yok", async () => {
    await renderForm("tr");
    expect(screen.queryByText(d("tr").helpTitle)).toBeNull();
  });
  it("verilen telefon / WhatsApp href'leri AYNEN", async () => {
    await renderForm("de", { phoneHref: "tel:+905320000000", whatsappHref: "https://wa.me/905320000000" });
    const t = d("de");
    expect(screen.getByText(t.helpTitle)).toBeTruthy();
    expect(screen.getByRole("link", { name: t.phoneLabel }).getAttribute("href")).toBe("tel:+905320000000");
    expect(screen.getByRole("link", { name: t.helpWhatsapp }).getAttribute("href")).toBe("https://wa.me/905320000000");
  });
});

describe("5) sayfa gövdesi — breadcrumb, başlık, settings href'leri, layout", () => {
  it.each<Locale>(["tr", "en", "de"])("%s", async (locale) => {
    const { default: OfferPageBody } = await import("@/app/components/offer/OfferPageBody");
    const dict = getDictionary(locale);
    const { container } = render(await OfferPageBody({ locale }));
    await screen.findByText("Kalkan");

    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: dict.search.breadcrumbHome }).getAttribute("href")).toBe(localeHref("/", locale));
    expect(within(nav).getByText(dict.header.offer).getAttribute("aria-current")).toBe("page");

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe(dict.offer.heroTitle);
    expect(h1.className).toContain("text-[27px]");
    expect(h1.className).toContain("lg:text-[40px]");
    const eyebrow = container.querySelector("header p")!;
    expect(eyebrow.textContent).toBe(dict.header.offer);
    expect(eyebrow.className).toContain("uppercase");
    expect(screen.getByText(dict.offer.heroDescription)).toBeTruthy();

    /* settings → FloatingSocial ile aynı türetme */
    expect(screen.getByRole("link", { name: dict.offer.phoneLabel }).getAttribute("href")).toBe("tel:+90 532 000 00 00");
    expect(screen.getByRole("link", { name: dict.offer.helpWhatsapp }).getAttribute("href")).toBe(SETTINGS.whatsapp_link);

    /* güven satırları korunur */
    expect(screen.getByText(dict.offer.trust1Title)).toBeTruthy();
    expect(screen.getByText(dict.offer.trust3Description)).toBeTruthy();

    /* layout: mobil tek kolon, lg iki kolon; form bölümleri özetten ÖNCE */
    const form = container.querySelector("form")!;
    expect(form.className).toContain("grid-cols-1");
    expect(form.className).toContain("lg:grid-cols-[minmax(0,1.63fr)_minmax(0,1fr)]");
    const kids = Array.from(form.children).filter((c) => !c.getAttribute("aria-hidden"));
    expect(kids[0].querySelectorAll("section")).toHaveLength(4);
    expect(kids[1].tagName).toBe("ASIDE");
    expect(kids.every((k) => k.className.includes("min-w-0"))).toBe(true);
    const submit = screen.getByRole("button", { name: dict.offer.submit });
    expect(submit.className).toContain("w-full");
    expect(submit.className).toContain("h-[52px]");
    expect(submit.className).toContain("bg-[#1B4EF5]");
    expect(container.innerHTML).not.toMatch(/gradient|btn-glow/);
  });
});
