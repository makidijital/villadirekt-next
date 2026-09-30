/* ===============================================================
   🛡️ PHASE 12C — app/services/page-translation.service.ts TESTLERİ
   ===============================================================
   `villa-translation-service.test.ts` (Phase 10A) ile BİREBİR AYNI
   mock-katman prensibi: translationRepository + parent repository
   MOCK'LANIR, gerçek DB'ye dokunulmaz. Servis katmanının iş kuralı
   sorumluluğu (locale whitelist, parent existence, alan uzunlukları,
   boş string → null normalize) BURADA test edilir.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const findAllForParentMock = vi.fn();
const upsertOneMock = vi.fn();
const findByIdMock = vi.fn();

vi.mock("@/lib/db/translation.repository.server", () => ({
  translationRepository: {
    findAllForParent: (...args: unknown[]) => findAllForParentMock(...args),
    upsertOne: (...args: unknown[]) => upsertOneMock(...args),
  },
}));

vi.mock("@/lib/db/pages.repository.server", () => ({
  pagesServerRepository: {
    findById: (...args: unknown[]) => findByIdMock(...args),
  },
}));

const PAGE_ID = "page-uuid-1";

const VALID_ROW = {
  id: "row-1",
  page_id: PAGE_ID,
  locale: "en",
  title: null,
  body: null,
  excerpt: null,
  seo_title: null,
  seo_description: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  findAllForParentMock.mockReset();
  upsertOneMock.mockReset();
  findByIdMock.mockReset();

  findByIdMock.mockResolvedValue({ data: { id: PAGE_ID }, error: null });
  upsertOneMock.mockResolvedValue({ data: VALID_ROW, error: null });
  findAllForParentMock.mockResolvedValue({ data: [], error: null });
});

async function svc() {
  return import("@/app/services/page-translation.service");
}

describe("upsertPageTranslation", () => {
  it("EN upsert — 5 alan repository.upsertOne'a doğru argümanlarla ulaşır", async () => {
    const { upsertPageTranslation } = await svc();

    const result = await upsertPageTranslation({
      pageId: PAGE_ID,
      locale: "en",
      title: "About Us",
      excerpt: "Short intro",
      body: "Long body",
      seoTitle: "About | Site",
      seoDescription: "Meta description",
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith("page", PAGE_ID, "en", {
      title: "About Us",
      excerpt: "Short intro",
      body: "Long body",
      seo_title: "About | Site",
      seo_description: "Meta description",
    });
  });

  it("DE upsert — locale doğru iletilir", async () => {
    const { upsertPageTranslation } = await svc();

    const result = await upsertPageTranslation({
      pageId: PAGE_ID,
      locale: "de",
      title: "Über uns",
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith(
      "page",
      PAGE_ID,
      "de",
      expect.objectContaining({ title: "Über uns" })
    );
  });

  it("BOŞ çeviri güvenli — tüm alanlar null yazılır (TR'ye fallback)", async () => {
    const { upsertPageTranslation } = await svc();

    const result = await upsertPageTranslation({
      pageId: PAGE_ID,
      locale: "en",
      title: "   ",
      excerpt: "",
      body: null,
      seoTitle: undefined,
      seoDescription: "  \n ",
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith("page", PAGE_ID, "en", {
      title: null,
      excerpt: null,
      body: null,
      seo_title: null,
      seo_description: null,
    });
  });

  it("trim uygulanır", async () => {
    const { upsertPageTranslation } = await svc();
    await upsertPageTranslation({
      pageId: PAGE_ID,
      locale: "en",
      title: "  About Us  ",
    });
    expect(upsertOneMock).toHaveBeenCalledWith(
      "page",
      PAGE_ID,
      "en",
      expect.objectContaining({ title: "About Us" })
    );
  });

  it("locale 'tr' reddedilir — repository çağrılmaz", async () => {
    const { upsertPageTranslation } = await svc();
    const result = await upsertPageTranslation({
      pageId: PAGE_ID,
      locale: "tr",
      title: "Hakkımızda",
    });
    expect(result).toEqual({
      ok: false,
      error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir",
    });
    expect(upsertOneMock).not.toHaveBeenCalled();
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it("locale 'fr' reddedilir — repository çağrılmaz", async () => {
    const { upsertPageTranslation } = await svc();
    const result = await upsertPageTranslation({
      pageId: PAGE_ID,
      locale: "fr",
      title: "A propos",
    });
    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("boş/geçersiz pageId reddedilir — repository çağrılmaz", async () => {
    const { upsertPageTranslation } = await svc();
    const result = await upsertPageTranslation({
      pageId: "   ",
      locale: "en",
      title: "x",
    });
    expect(result).toEqual({ ok: false, error: "Geçersiz sayfa" });
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("parent yoksa 'Sayfa bulunamadı' — upsert çağrılmaz", async () => {
    findByIdMock.mockResolvedValue({ data: null, error: null });
    const { upsertPageTranslation } = await svc();
    const result = await upsertPageTranslation({
      pageId: PAGE_ID,
      locale: "en",
      title: "x",
    });
    expect(result).toEqual({ ok: false, error: "Sayfa bulunamadı" });
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("parent okuma hatası → 'Sayfa doğrulanamadı'", async () => {
    findByIdMock.mockResolvedValue({ data: null, error: new Error("db") });
    const { upsertPageTranslation } = await svc();
    const result = await upsertPageTranslation({
      pageId: PAGE_ID,
      locale: "en",
      title: "x",
    });
    expect(result).toEqual({ ok: false, error: "Sayfa doğrulanamadı" });
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("uzunluk sınırları — title 200, excerpt 300, body 20000, seo 120/300", async () => {
    const { upsertPageTranslation, PAGE_TRANSLATION_MAX_LEN } = await svc();
    expect(PAGE_TRANSLATION_MAX_LEN).toEqual({
      title: 200,
      excerpt: 300,
      body: 20000,
      seoTitle: 120,
      seoDescription: 300,
      /* 🛡️ MIGRATION 091 — bölüm dizisi serileştirilmiş JSON tavanı. */
      sectionsJson: 40000,
    });

    const cases: Array<[string, Record<string, string>]> = [
      ["Başlık 200 karakteri geçemez", { title: "a".repeat(201) }],
      ["Kısa açıklama 300 karakteri geçemez", { excerpt: "a".repeat(301) }],
      ["İçerik 20000 karakteri geçemez", { body: "a".repeat(20001) }],
      ["SEO başlık 120 karakteri geçemez", { seoTitle: "a".repeat(121) }],
      [
        "SEO açıklama 300 karakteri geçemez",
        { seoDescription: "a".repeat(301) },
      ],
    ];

    for (const [error, patch] of cases) {
      upsertOneMock.mockClear();
      const result = await upsertPageTranslation({
        pageId: PAGE_ID,
        locale: "en",
        ...patch,
      });
      expect(result).toEqual({ ok: false, error });
      expect(upsertOneMock).not.toHaveBeenCalled();
    }
  });

  it("sınır değerleri (tam limit) KABUL edilir", async () => {
    const { upsertPageTranslation } = await svc();
    const result = await upsertPageTranslation({
      pageId: PAGE_ID,
      locale: "en",
      title: "a".repeat(200),
      excerpt: "a".repeat(300),
      body: "a".repeat(20000),
      seoTitle: "a".repeat(120),
      seoDescription: "a".repeat(300),
    });
    expect(result.ok).toBe(true);
  });

  it("repository hatası → 'Çeviri kaydedilemedi'", async () => {
    upsertOneMock.mockResolvedValue({ data: null, error: new Error("boom") });
    const { upsertPageTranslation } = await svc();
    const result = await upsertPageTranslation({
      pageId: PAGE_ID,
      locale: "en",
      title: "x",
    });
    expect(result).toEqual({ ok: false, error: "Çeviri kaydedilemedi" });
  });

  it("başarılı kayıt { ok: true, row } döner", async () => {
    const { upsertPageTranslation } = await svc();
    const result = await upsertPageTranslation({
      pageId: PAGE_ID,
      locale: "en",
      title: "About Us",
    });
    expect(result).toEqual({ ok: true, row: VALID_ROW });
  });

  it("`sections` ve `slug` payload'a HİÇ girmez", async () => {
    const { upsertPageTranslation } = await svc();
    await upsertPageTranslation({
      pageId: PAGE_ID,
      locale: "en",
      title: "About Us",
    });
    const payload = upsertOneMock.mock.calls[0][3] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "body",
      "excerpt",
      "seo_description",
      "seo_title",
      "title",
    ]);
  });
});

describe("getPageTranslations", () => {
  it("yalnız en/de satırlarını döner (tr varsa filtrelenir)", async () => {
    findAllForParentMock.mockResolvedValue({
      data: [
        { ...VALID_ROW, locale: "tr" },
        { ...VALID_ROW, locale: "en" },
        { ...VALID_ROW, locale: "de" },
      ],
      error: null,
    });
    const { getPageTranslations } = await svc();
    const result = await getPageTranslations(PAGE_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((r) => r.locale)).toEqual(["en", "de"]);
    expect(findAllForParentMock).toHaveBeenCalledWith("page", PAGE_ID);
  });

  it("boş/geçersiz pageId reddedilir — repository çağrılmaz", async () => {
    const { getPageTranslations } = await svc();
    const result = await getPageTranslations("  ");
    expect(result).toEqual({ ok: false, error: "Geçersiz sayfa" });
    expect(findAllForParentMock).not.toHaveBeenCalled();
  });

  it("repository hatası → 'Çeviriler okunamadı'", async () => {
    findAllForParentMock.mockResolvedValue({
      data: null,
      error: new Error("boom"),
    });
    const { getPageTranslations } = await svc();
    const result = await getPageTranslations(PAGE_ID);
    expect(result).toEqual({ ok: false, error: "Çeviriler okunamadı" });
  });

  it("kayıt yoksa boş dizi döner", async () => {
    const { getPageTranslations } = await svc();
    const result = await getPageTranslations(PAGE_ID);
    expect(result).toEqual({ ok: true, rows: [] });
  });
});
