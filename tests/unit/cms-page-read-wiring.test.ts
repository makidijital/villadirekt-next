/* ===============================================================
   🛡️ PHASE 12D — PUBLIC OKUMA ZİNCİRİ: UÇTAN UCA WIRING TESTİ
   ===============================================================
   AMAÇ: `/en/p/[slug]` ve `/de/p/[slug]` sayfalarının GERÇEKTEN
   `page_translations` tablosundan okuduğunu, yalnız EN ALT katmanı
   (`dbNative`) mock'layarak kanıtlamak. Bu testte GERÇEK kod çalışır:

     resolvePageContent          (lib/i18n/get-page-translation.server)
       → getTranslation          (lib/i18n/get-translation.server)
         → translationRepository.findOne
           → db.from("page_translations").select("*")
                .eq("page_id", …).eq("locale", …).maybeSingle()   ← mock

   `translation-repository.test.ts` ile AYNI mock-katman prensibi;
   gerçek DB bağlantısı bu ortamdan erişilebilir DEĞİL.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@/lib/db/native", () => ({
  dbNative: { from: (...a: unknown[]) => fromMock(...a) },
  dbAdminNative: { from: vi.fn() },
}));

const PAGE_ID = "page-uuid-1";

const TR_PAGE = {
  id: PAGE_ID,
  title: "Kaş'ta Unutulmaz Bir Tatil",
  excerpt: "Türkçe özet",
  body: "Türkçe gövde",
  seo_title: "TR SEO",
  seo_description: "TR SEO açıklama",
};

const EN_DB_ROW = {
  id: "t-en",
  page_id: PAGE_ID,
  locale: "en",
  title: "An Unforgettable Holiday in Kas",
  excerpt: "EN excerpt",
  body: "EN body",
  seo_title: "EN SEO title",
  seo_description: "EN SEO description",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

let dbRow: unknown = EN_DB_ROW;
let dbError: unknown = null;

beforeEach(() => {
  vi.clearAllMocks();
  dbRow = EN_DB_ROW;
  dbError = null;

  const chain: Record<string, unknown> = {};
  chain.select = (...a: unknown[]) => {
    selectMock(...a);
    return chain;
  };
  chain.eq = (...a: unknown[]) => {
    eqMock(...a);
    return chain;
  };
  chain.maybeSingle = (...a: unknown[]) => {
    maybeSingleMock(...a);
    return Promise.resolve({ data: dbRow, error: dbError });
  };
  fromMock.mockReturnValue(chain);
});

async function helper() {
  return import("@/lib/i18n/get-page-translation.server");
}

describe("Phase 12D — public okuma zinciri", () => {
  it("EN: page_translations SELECT … WHERE page_id=$1 AND locale='en'", async () => {
    const { resolvePageContent } = await helper();
    const r = await resolvePageContent(TR_PAGE, "en");

    expect(fromMock).toHaveBeenCalledWith("page_translations");
    expect(selectMock).toHaveBeenCalledWith("*");
    expect(eqMock).toHaveBeenCalledWith("page_id", PAGE_ID);
    expect(eqMock).toHaveBeenCalledWith("locale", "en");
    expect(maybeSingleMock).toHaveBeenCalled();

    expect(r.title).toBe(EN_DB_ROW.title);
    expect(r.body).toBe(EN_DB_ROW.body);
    expect(r.seoTitle).toBe(EN_DB_ROW.seo_title);
  });

  it("DE: aynı tablo, locale='de'", async () => {
    dbRow = { ...EN_DB_ROW, locale: "de", title: "Ein unvergesslicher Urlaub" };
    const { resolvePageContent } = await helper();
    const r = await resolvePageContent(TR_PAGE, "de");

    expect(fromMock).toHaveBeenCalledWith("page_translations");
    expect(eqMock).toHaveBeenCalledWith("locale", "de");
    expect(r.title).toBe("Ein unvergesslicher Urlaub");
  });

  it("TR: DB'ye HİÇ GİDİLMEZ", async () => {
    const { resolvePageContent } = await helper();
    const r = await resolvePageContent(TR_PAGE, "tr");
    expect(fromMock).not.toHaveBeenCalled();
    expect(r.title).toBe(TR_PAGE.title);
  });

  it("çeviri satırı yoksa (null) TR'ye fallback — throw YOK", async () => {
    dbRow = null;
    const { resolvePageContent } = await helper();
    const r = await resolvePageContent(TR_PAGE, "en");
    expect(fromMock).toHaveBeenCalledWith("page_translations");
    expect(r.title).toBe(TR_PAGE.title);
    expect(r.body).toBe(TR_PAGE.body);
  });

  it("DB hatası → public render çökmez, TR'ye fallback", async () => {
    dbRow = null;
    dbError = new Error("connection lost");
    const { resolvePageContent } = await helper();
    const r = await resolvePageContent(TR_PAGE, "en");
    expect(r.title).toBe(TR_PAGE.title);
    expect(r.seoDescription).toBe(TR_PAGE.seo_description);
  });
});
