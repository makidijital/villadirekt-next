/* ===============================================================
   🛡️ SSS (FAQ) ÇOKLU DİL — ADMIN + SERVİS + ŞEMA
   ===============================================================
   Kapsam:
     A) Migration 082 `faq_translations` şema kilidi (CASCADE/UNIQUE)
     B) `faq.service.replaceFaqs` — ID-KORUYAN senkron (çeviriler
        her kayıtta SİLİNMEZ) + eski davranışın korunması
     C) `faq-translation.service` — batch okuma, upsert, fallback
     D) `/maki-admin/faqs` — EN/DE alanları, kaydetme akışı

   ⚠️ PUBLIC okuma yolu (`applyFaqTranslations`, `getCachedFaqs`)
   Phase 11'de ZATEN kuruluydu ve bu fazda DEĞİŞTİRİLMEDİ; onun
   testleri `homepage-i18n.test.ts` (C bölümü) ve
   `homepage-cache-locale.test.ts` içindedir.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

/* ===============================================================
   A) MIGRATION ŞEMASI — yeni migration GEREKMEDİĞİNİN kanıtı
   =============================================================== */
describe("migration 082 — faq_translations (mevcut, yeterli)", () => {
  const sql = readFileSync(
    join(process.cwd(), "db/migrations/082_translation_tables.sql"),
    "utf-8"
  );

  it("1) tablo migration 082'de ZATEN tanımlı", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.faq_translations/);
  });

  it("2) faq_id → public.faqs(id) ON DELETE CASCADE", () => {
    expect(sql).toMatch(
      /faq_id\s+uuid NOT NULL REFERENCES public\.faqs \(id\) ON DELETE CASCADE/
    );
  });

  it("3) locale CHECK ('tr','en','de') + UNIQUE(faq_id, locale)", () => {
    expect(sql).toMatch(
      /faq_translations_locale_check CHECK \(locale IN \('tr', 'en', 'de'\)\)/
    );
    expect(sql).toMatch(
      /faq_translations_faq_id_locale_key UNIQUE \(faq_id, locale\)/
    );
  });

  it("4) çevrilebilir kolonlar: question + answer (nullable)", () => {
    const block = sql.slice(
      sql.indexOf("CREATE TABLE IF NOT EXISTS public.faq_translations")
    );
    expect(block).toMatch(/^\s*question\s+text,\s*$/m);
    expect(block).toMatch(/^\s*answer\s+text,\s*$/m);
  });
});

/* ===============================================================
   B) faq.service — ID-KORUYAN SENKRON
   =============================================================== */
const findAllForAdminMock = vi.fn();
const upsertManyMock = vi.fn();
const insertManyMock = vi.fn();
const deleteByIdsMock = vi.fn();
const deleteAllMock = vi.fn();
const findActiveMock = vi.fn();
const deleteByIdMock = vi.fn();

vi.mock("@/lib/db/faq.repository", () => ({
  faqRepository: {
    findActive: (...a: unknown[]) => findActiveMock(...a),
    findAllForAdmin: (...a: unknown[]) => findAllForAdminMock(...a),
    upsertMany: (...a: unknown[]) => upsertManyMock(...a),
    insertMany: (...a: unknown[]) => insertManyMock(...a),
    deleteByIds: (...a: unknown[]) => deleteByIdsMock(...a),
    deleteAll: (...a: unknown[]) => deleteAllMock(...a),
    deleteById: (...a: unknown[]) => deleteByIdMock(...a),
  },
}));

import { replaceFaqs } from "@/app/services/faq.service";

describe("replaceFaqs — ID-KORUYAN senkron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAllForAdminMock.mockResolvedValue({
      data: [{ id: "f1" }, { id: "f2" }],
      error: null,
    });
    upsertManyMock.mockResolvedValue({ data: null, error: null });
    insertManyMock.mockResolvedValue({ data: [], error: null });
    deleteByIdsMock.mockResolvedValue({ data: null, error: null });
  });

  it("5) DELETE ALL ARTIK ÇAĞRILMIYOR — çeviriler CASCADE ile silinmez", async () => {
    await replaceFaqs([
      { id: "f1", question: "S1", answer: "C1" },
      { id: "f2", question: "S2", answer: "C2" },
    ]);
    expect(deleteAllMock).not.toHaveBeenCalled();
  });

  it("6) mevcut satırlar TEK upsert ile güncellenir (id KORUNUR)", async () => {
    const res = await replaceFaqs([
      { id: "f1", question: "S1", answer: "C1" },
      { id: "f2", question: "S2", answer: "C2" },
    ]);
    expect(res.ok).toBe(true);
    expect(upsertManyMock).toHaveBeenCalledTimes(1);
    expect(upsertManyMock.mock.calls[0][0]).toEqual([
      { id: "f1", question: "S1", answer: "C1", sort_order: 0, is_active: true },
      { id: "f2", question: "S2", answer: "C2", sort_order: 1, is_active: true },
    ]);
    expect(insertManyMock).not.toHaveBeenCalled();
    expect(res.ids).toEqual(["f1", "f2"]);
  });

  it("7) yeni satır TEK insert ile eklenir; id'ler SIRAYLA döner", async () => {
    insertManyMock.mockResolvedValue({ data: [{ id: "new1" }], error: null });
    const res = await replaceFaqs([
      { id: "f1", question: "S1", answer: "C1" },
      { question: "Yeni", answer: "Cevap" },
      { id: "f2", question: "S2", answer: "C2" },
    ]);
    expect(insertManyMock).toHaveBeenCalledTimes(1);
    expect(insertManyMock.mock.calls[0][0]).toEqual([
      { question: "Yeni", answer: "Cevap", sort_order: 1, is_active: true },
    ]);
    expect(res.ids).toEqual(["f1", "new1", "f2"]);
  });

  it("8) formdan çıkarılan satırlar TEK `IN (...)` sorgusuyla silinir", async () => {
    await replaceFaqs([{ id: "f1", question: "S1", answer: "C1" }]);
    expect(deleteByIdsMock).toHaveBeenCalledTimes(1);
    expect(deleteByIdsMock.mock.calls[0][0]).toEqual(["f2"]);
  });

  it("9) silinecek satır yoksa DELETE sorgusu ATILMAZ", async () => {
    await replaceFaqs([
      { id: "f1", question: "S1", answer: "C1" },
      { id: "f2", question: "S2", answer: "C2" },
    ]);
    expect(deleteByIdsMock).not.toHaveBeenCalled();
  });

  it("10) BOŞ/whitespace satırlar FİLTRELENİR (eski davranış)", async () => {
    findAllForAdminMock.mockResolvedValue({ data: [], error: null });
    insertManyMock.mockResolvedValue({ data: [{ id: "n1" }], error: null });
    await replaceFaqs([
      { question: "  ", answer: "C" },
      { question: "S", answer: "   " },
      { question: " Geçerli ", answer: " Cevap " },
    ]);
    expect(insertManyMock.mock.calls[0][0]).toEqual([
      { question: "Geçerli", answer: "Cevap", sort_order: 0, is_active: true },
    ]);
  });

  it("11) MAX_FAQS guard'ı DEĞİŞMEDİ (16 satır → hata, DB'ye gidilmez)", async () => {
    const rows = Array.from({ length: 16 }, (_, i) => ({
      question: `S${i}`,
      answer: `C${i}`,
    }));
    const res = await replaceFaqs(rows);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("15");
    expect(findAllForAdminMock).not.toHaveBeenCalled();
  });

  it("12) `id` verilmeyen ESKİ çağrı şekli çalışmaya devam eder", async () => {
    findAllForAdminMock.mockResolvedValue({ data: [], error: null });
    insertManyMock.mockResolvedValue({
      data: [{ id: "a" }, { id: "b" }],
      error: null,
    });
    const res = await replaceFaqs([
      { question: "S1", answer: "C1" },
      { question: "S2", answer: "C2" },
    ]);
    expect(res.ok).toBe(true);
    expect(res.ids).toEqual(["a", "b"]);
  });

  it("13) BİLİNMEYEN id → yeni satır olarak eklenir (çökme yok)", async () => {
    insertManyMock.mockResolvedValue({ data: [{ id: "n9" }], error: null });
    const res = await replaceFaqs([{ id: "yok", question: "S", answer: "C" }]);
    expect(insertManyMock).toHaveBeenCalledTimes(1);
    expect(res.ids).toEqual(["n9"]);
  });

  it("14) DB hatalarında ok:false döner ve akış durur", async () => {
    upsertManyMock.mockResolvedValue({ data: null, error: new Error("boom") });
    const res = await replaceFaqs([{ id: "f1", question: "S", answer: "C" }]);
    expect(res.ok).toBe(false);
    expect(insertManyMock).not.toHaveBeenCalled();
  });

  it("15) SORGU SAYISI sınırlı — satır başına sorgu YOK (N+1 yok)", async () => {
    insertManyMock.mockResolvedValue({
      data: Array.from({ length: 5 }, (_, i) => ({ id: `n${i}` })),
      error: null,
    });
    await replaceFaqs([
      { id: "f1", question: "S", answer: "C" },
      { id: "f2", question: "S", answer: "C" },
      ...Array.from({ length: 5 }, () => ({ question: "S", answer: "C" })),
    ]);
    expect(findAllForAdminMock).toHaveBeenCalledTimes(1);
    expect(upsertManyMock).toHaveBeenCalledTimes(1);
    expect(insertManyMock).toHaveBeenCalledTimes(1);
    expect(deleteByIdsMock).not.toHaveBeenCalled();
  });
});

/* ===============================================================
   C) faq-translation.service
   =============================================================== */
const findManyForLocaleMock = vi.fn();
const upsertOneMock = vi.fn();
vi.mock("@/lib/db/translation.repository.server", () => ({
  translationRepository: {
    findManyForLocale: (...a: unknown[]) => findManyForLocaleMock(...a),
    upsertOne: (...a: unknown[]) => upsertOneMock(...a),
  },
}));

import {
  getFaqTranslations,
  upsertFaqTranslation,
} from "@/app/services/faq-translation.service";

describe("faq-translation.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyForLocaleMock.mockResolvedValue({ data: [], error: null });
    upsertOneMock.mockResolvedValue({
      data: { id: "t", faq_id: "f1", locale: "en", question: "Q", answer: "A" },
      error: null,
    });
  });

  it("16) getFaqTranslations — locale başına TEK batch sorgu (N+1 YOK)", async () => {
    await getFaqTranslations(["f1", "f2", "f3"]);
    expect(findManyForLocaleMock).toHaveBeenCalledTimes(2);
    for (const call of findManyForLocaleMock.mock.calls) {
      expect(call[0]).toBe("faq");
      expect(call[1]).toEqual(["f1", "f2", "f3"]);
    }
    expect(
      findManyForLocaleMock.mock.calls.map((c) => c[2]).sort()
    ).toEqual(["de", "en"]);
  });

  it("17) id listesi boşsa HİÇ sorgu atılmaz", async () => {
    const res = await getFaqTranslations([]);
    expect(res).toEqual({ ok: true, map: {} });
    expect(findManyForLocaleMock).not.toHaveBeenCalled();
  });

  it("18) satırlar faq_id → { en, de } haritasına dönüşür", async () => {
    findManyForLocaleMock.mockImplementation(
      (_e: string, _ids: string[], locale: string) =>
        Promise.resolve({
          data: [
            {
              faq_id: "f1",
              locale,
              question: locale === "en" ? "How?" : "Wie?",
              answer: locale === "en" ? "Like this." : "So.",
            },
          ],
          error: null,
        })
    );
    const res = await getFaqTranslations(["f1"]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.map).toEqual({
      f1: {
        en: { question: "How?", answer: "Like this." },
        de: { question: "Wie?", answer: "So." },
      },
    });
  });

  it("19) DB hatası → ok:false (form çökmez)", async () => {
    findManyForLocaleMock.mockResolvedValue({
      data: null,
      error: new Error("db"),
    });
    const res = await getFaqTranslations(["f1"]);
    expect(res.ok).toBe(false);
  });

  it("20) upsert — EN yazılır, alanlar TRIM edilir", async () => {
    const res = await upsertFaqTranslation({
      faqId: "f1",
      locale: "en",
      question: "  How? ",
      answer: " Like this. ",
    });
    expect(res.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith("faq", "f1", "en", {
      question: "How?",
      answer: "Like this.",
    });
  });

  it("21) upsert — DE yazılır", async () => {
    await upsertFaqTranslation({
      faqId: "f1",
      locale: "de",
      question: "Wie?",
      answer: "So.",
    });
    expect(upsertOneMock.mock.calls[0][2]).toBe("de");
  });

  it("22) BOŞ/whitespace alan → null (TR fallback), hata DEĞİL", async () => {
    const res = await upsertFaqTranslation({
      faqId: "f1",
      locale: "en",
      question: "   ",
      answer: "",
    });
    expect(res.ok).toBe(true);
    expect(upsertOneMock.mock.calls[0][3]).toEqual({
      question: null,
      answer: null,
    });
  });

  it("23) ALAN BAZINDA temizleme — soru dolu, cevap boş", async () => {
    await upsertFaqTranslation({
      faqId: "f1",
      locale: "en",
      question: "How?",
      answer: "  ",
    });
    expect(upsertOneMock.mock.calls[0][3]).toEqual({
      question: "How?",
      answer: null,
    });
  });

  it("24) 'tr' ve geçersiz locale REDDEDİLİR (DB'ye gidilmez)", async () => {
    for (const locale of ["tr", "fr", "", "EN"]) {
      const res = await upsertFaqTranslation({
        faqId: "f1",
        locale,
        question: "Q",
        answer: "A",
      });
      expect(res.ok, locale).toBe(false);
    }
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("25) boş faqId → hata, DB'ye gidilmez", async () => {
    const res = await upsertFaqTranslation({
      faqId: "  ",
      locale: "en",
      question: "Q",
      answer: "A",
    });
    expect(res).toEqual({ ok: false, error: "Geçersiz SSS kaydı" });
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("26) DB hatası kullanıcı mesajına çevrilir", async () => {
    upsertOneMock.mockResolvedValue({ data: null, error: new Error("fk") });
    const res = await upsertFaqTranslation({
      faqId: "f1",
      locale: "en",
      question: "Q",
      answer: "A",
    });
    expect(res).toEqual({ ok: false, error: "Çeviri kaydedilemedi" });
  });
});

/* ===============================================================
   C2) PUBLIC OKUMA — applyFaqTranslations (uçtan uca, gerçek zincir)
   ===============================================================
   `getTranslationsForParents` GERÇEK çalışır; yalnız en alttaki DB
   primitive'i (`translationRepository.findManyForLocale`) mock'lanır.
   Bu bölüm Phase 11'de kurulan yolu TEKRAR YAZMAZ — yalnız TR/EN/DE
   + fallback davranışını bu fazın kilidi olarak doğrular.
   (Ek kapsam: `homepage-i18n.test.ts` C bölümü.) */
import { applyFaqTranslations } from "@/lib/i18n/get-faq-translations.server";

const PUBLIC_FAQS = [
  { id: "f1", question: "TR Soru", answer: "TR Cevap" },
  { id: "f2", question: "TR Soru 2", answer: "TR Cevap 2" },
];

function mockFaqRows(
  rows: Record<string, { en?: [string, string]; de?: [string, string] }>
) {
  findManyForLocaleMock.mockImplementation(
    (_e: string, ids: string[], locale: "en" | "de") =>
      Promise.resolve({
        data: ids
          .filter((id) => rows[id]?.[locale])
          .map((id) => ({
            faq_id: id,
            locale,
            question: rows[id]![locale]![0],
            answer: rows[id]![locale]![1],
          })),
        error: null,
      })
  );
}

describe("applyFaqTranslations — public okuma", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyForLocaleMock.mockResolvedValue({ data: [], error: null });
  });

  it("26a) TR → canonical, sorgu HİÇ atılmaz (multilingual kapalıyken de bu yol)", async () => {
    const out = await applyFaqTranslations(PUBLIC_FAQS, "tr");
    expect(out).toBe(PUBLIC_FAQS);
    expect(findManyForLocaleMock).not.toHaveBeenCalled();
  });

  it("26b) EN → çeviri gösterilir", async () => {
    mockFaqRows({ f1: { en: ["How?", "Like this."] } });
    const out = await applyFaqTranslations(PUBLIC_FAQS, "en");
    expect(out[0]).toEqual({
      id: "f1",
      question: "How?",
      answer: "Like this.",
    });
  });

  it("26c) DE → çeviri gösterilir", async () => {
    mockFaqRows({ f1: { de: ["Wie?", "So."] } });
    const out = await applyFaqTranslations(PUBLIC_FAQS, "de");
    expect(out[0]).toEqual({ id: "f1", question: "Wie?", answer: "So." });
  });

  it("26d) EN çevirisi YOK → TR fallback", async () => {
    mockFaqRows({ f1: { de: ["Wie?", "So."] } });
    const out = await applyFaqTranslations(PUBLIC_FAQS, "en");
    expect(out[0]).toBe(PUBLIC_FAQS[0]);
  });

  it("26e) DE çevirisi YOK → TR fallback", async () => {
    mockFaqRows({ f1: { en: ["How?", "Like this."] } });
    const out = await applyFaqTranslations(PUBLIC_FAQS, "de");
    expect(out[0]).toBe(PUBLIC_FAQS[0]);
  });

  it("26f) BOŞ / WHITESPACE çeviri → TR fallback (alan bazında)", async () => {
    mockFaqRows({ f1: { en: ["   ", ""] } });
    const out = await applyFaqTranslations(PUBLIC_FAQS, "en");
    expect(out[0].question).toBe("TR Soru");
    expect(out[0].answer).toBe("TR Cevap");
  });

  it("26g) N+1 YOK — N SSS için locale başına TEK sorgu", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `f${i}`,
      question: "S",
      answer: "C",
    }));
    await applyFaqTranslations(many, "en");
    expect(findManyForLocaleMock).toHaveBeenCalledTimes(1);
    expect(findManyForLocaleMock.mock.calls[0][1]).toHaveLength(12);
  });
});

/* ===============================================================
   D) ADMIN EKRANI
   =============================================================== */
const getFaqsForAdminMock = vi.fn();
const replaceFaqsActionMock = vi.fn();
vi.mock("@/app/(admin)/maki-admin/faqs/faqs.action", () => ({
  getFaqsForAdminAction: (...a: unknown[]) => getFaqsForAdminMock(...a),
  replaceFaqsAction: (...a: unknown[]) => replaceFaqsActionMock(...a),
}));

const loadFaqTranslationsMock = vi.fn();
const saveFaqTranslationMock = vi.fn();
vi.mock("@/app/(admin)/maki-admin/faqs/faq-translations.action", () => ({
  loadFaqTranslationsAction: (...a: unknown[]) =>
    loadFaqTranslationsMock(...a),
  saveFaqTranslationAction: (...a: unknown[]) => saveFaqTranslationMock(...a),
}));

const revalidateFaqsMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/services/revalidate.actions", () => ({
  revalidateFaqs: (...a: unknown[]) => revalidateFaqsMock(...a),
}));

const notifySuccessMock = vi.fn();
const notifyErrorMock = vi.fn();
vi.mock("@/app/components/admin/notifications/NotificationProvider", () => ({
  useNotify: () => ({
    success: notifySuccessMock,
    error: notifyErrorMock,
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
  useConfirm: () => vi.fn().mockResolvedValue(false),
}));

import FaqsAdminPage from "@/app/(admin)/maki-admin/faqs/page";

const EXISTING_FAQS = [
  { id: "f1", question: "Rezervasyon nasıl yapılır?", answer: "Şöyle." },
  { id: "f2", question: "İptal var mı?", answer: "Evet." },
];

describe("/maki-admin/faqs — çoklu dil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFaqsForAdminMock.mockResolvedValue(EXISTING_FAQS);
    loadFaqTranslationsMock.mockResolvedValue({ ok: true, map: {} });
    replaceFaqsActionMock.mockResolvedValue({ ok: true, ids: ["f1", "f2"] });
    saveFaqTranslationMock.mockResolvedValue({
      ok: true,
      row: { id: "t", faq_id: "f1", locale: "en", question: "", answer: "" },
    });
  });

  async function mountPage() {
    render(<FaqsAdminPage />);
    await screen.findByDisplayValue("Rezervasyon nasıl yapılır?");
  }

  it("27) TR alanları DEĞİŞMEDİ (mevcut CRUD davranışı)", async () => {
    await mountPage();
    expect(screen.getAllByText("Soru").length).toBe(2);
    expect(screen.getAllByText("Cevap").length).toBe(2);
    expect(screen.getByDisplayValue("İptal var mı?")).toBeInTheDocument();
  });

  it("28) çeviriler TEK batch okumada yüklenir (kayıt başına sorgu YOK)", async () => {
    await mountPage();
    expect(loadFaqTranslationsMock).toHaveBeenCalledTimes(1);
    expect(loadFaqTranslationsMock).toHaveBeenCalledWith(["f1", "f2"]);
  });

  it("29) EN/DE alanları varsayılan KAPALI, 'Çeviriler' ile açılır", async () => {
    await mountPage();
    expect(screen.queryByLabelText("English Question")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByText("Çeviriler")[0]);
    expect(screen.getByLabelText("English Question")).toBeInTheDocument();
    expect(screen.getByLabelText("English Answer")).toBeInTheDocument();
    expect(screen.getByLabelText("Deutsch Frage")).toBeInTheDocument();
    expect(screen.getByLabelText("Deutsch Antwort")).toBeInTheDocument();
  });

  it("30) mevcut çeviriler forma YÜKLENİR", async () => {
    loadFaqTranslationsMock.mockResolvedValue({
      ok: true,
      map: {
        f1: {
          en: { question: "How to book?", answer: "Like this." },
          de: { question: "Wie buchen?", answer: "So." },
        },
      },
    });
    await mountPage();
    fireEvent.click(screen.getAllByText("Çeviriler")[0]);
    expect(screen.getByLabelText("English Question")).toHaveValue(
      "How to book?"
    );
    expect(screen.getByLabelText("Deutsch Antwort")).toHaveValue("So.");
  });

  it("31) KAYDET — canonical payload `id` TAŞIR (satır korunur)", async () => {
    await mountPage();
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(replaceFaqsActionMock).toHaveBeenCalled());
    expect(replaceFaqsActionMock.mock.calls[0][0]).toEqual([
      { id: "f1", question: "Rezervasyon nasıl yapılır?", answer: "Şöyle." },
      { id: "f2", question: "İptal var mı?", answer: "Evet." },
    ]);
  });

  it("32) KAYDET — girilen EN/DE çevirileri doğru faqId ile yazılır", async () => {
    await mountPage();
    fireEvent.click(screen.getAllByText("Çeviriler")[0]);
    fireEvent.change(screen.getByLabelText("English Question"), {
      target: { value: "How to book?" },
    });
    fireEvent.change(screen.getByLabelText("English Answer"), {
      target: { value: "Like this." },
    });
    fireEvent.click(screen.getByText("Kaydet"));

    await waitFor(() => expect(saveFaqTranslationMock).toHaveBeenCalled());
    expect(saveFaqTranslationMock).toHaveBeenCalledWith({
      faqId: "f1",
      locale: "en",
      question: "How to book?",
      answer: "Like this.",
    });
  });

  it("33) YENİ satır + boş çeviri → çeviri isteği ATILMAZ", async () => {
    getFaqsForAdminMock.mockResolvedValue([]);
    loadFaqTranslationsMock.mockResolvedValue({ ok: true, map: {} });
    replaceFaqsActionMock.mockResolvedValue({ ok: true, ids: ["n1"] });
    render(<FaqsAdminPage />);
    await screen.findByText("Yeni Soru Ekle");
    fireEvent.change(screen.getAllByPlaceholderText(/Rezervasyon nasıl/)[0], {
      target: { value: "Yeni soru" },
    });
    fireEvent.change(screen.getAllByPlaceholderText("Cevabı buraya yazın…")[0], {
      target: { value: "Yeni cevap" },
    });
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(replaceFaqsActionMock).toHaveBeenCalled());
    expect(saveFaqTranslationMock).not.toHaveBeenCalled();
  });

  it("34) KAYDET sonrası MEVCUT cache invalidation çağrılır", async () => {
    await mountPage();
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(revalidateFaqsMock).toHaveBeenCalled());
  });

  it("35) canonical kayıt BAŞARISIZSA çeviri hiç denenmez", async () => {
    replaceFaqsActionMock.mockResolvedValue({ ok: false, error: "boom" });
    await mountPage();
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(saveFaqTranslationMock).not.toHaveBeenCalled();
    expect(revalidateFaqsMock).not.toHaveBeenCalled();
  });

  it("36) çeviri hatası canonical kaydı BOZMAZ (best-effort)", async () => {
    saveFaqTranslationMock.mockResolvedValue({ ok: false, error: "Yetkisiz" });
    await mountPage();
    fireEvent.click(screen.getAllByText("Çeviriler")[0]);
    fireEvent.change(screen.getByLabelText("English Question"), {
      target: { value: "How?" },
    });
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(revalidateFaqsMock).toHaveBeenCalled());
    expect(notifyErrorMock).toHaveBeenCalled();
  });

  it("37) boş satır kaydedilmez ve çeviri isteği doğurmaz", async () => {
    getFaqsForAdminMock.mockResolvedValue([]);
    replaceFaqsActionMock.mockResolvedValue({ ok: true, ids: [] });
    render(<FaqsAdminPage />);
    await screen.findByText("Yeni Soru Ekle");
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(replaceFaqsActionMock).toHaveBeenCalled());
    expect(replaceFaqsActionMock.mock.calls[0][0]).toEqual([]);
    expect(saveFaqTranslationMock).not.toHaveBeenCalled();
  });

  it("38) SIRALAMA korunur — satır silince kalanlar sırayla gider", async () => {
    await mountPage();
    fireEvent.click(screen.getByLabelText("Soru 1'i sil"));
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(replaceFaqsActionMock).toHaveBeenCalled());
    expect(replaceFaqsActionMock.mock.calls[0][0]).toEqual([
      { id: "f2", question: "İptal var mı?", answer: "Evet." },
    ]);
  });
});
