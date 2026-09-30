/* ===============================================================
   🛡️ PHASE 12C — SAYFA ÇEVİRİLERİ (pages) UI TESTLERİ
   ===============================================================
   `TypesPage.test.tsx` (Phase 10D Batch 3) ile AYNI mock-katman
   prensibi ve AYNI senaryo seti — Pages'in 5 çevrilebilir alanına
   (title / excerpt / body / seo_title / seo_description) uyarlandı.

   Kart `/maki-admin/pages/[id]` (Sayfayı düzenle) ekranında render
   edilir; testler gerçek edit sayfasını mount ederek hem
   `multilingual_enabled` kapısını hem kartın davranışını doğrular.

   ⚠️ Bu kart ADMIN ARAYÜZ DİLİNİ DEĞİŞTİRMEZ — admin Türkçe kalır.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/* ---------- mock katmanı ---------- */

const loadPageTranslationsMock = vi.fn();
const savePageTranslationMock = vi.fn();
vi.mock("@/app/(admin)/maki-admin/pages/[id]/page-translations.action", () => ({
  loadPageTranslationsAction: (...a: unknown[]) =>
    loadPageTranslationsMock(...a),
  savePageTranslationAction: (...a: unknown[]) => savePageTranslationMock(...a),
}));

const getPublicSettingsMock = vi.fn();
vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: () => getPublicSettingsMock(),
}));

const adminFetchMock = vi.fn();
vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: (...a: unknown[]) => adminFetchMock(...a),
}));

const notifyErrorMock = vi.fn();
const notifySuccessMock = vi.fn();
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

vi.mock("@/app/services/revalidate.actions", () => ({
  revalidateMenu: vi.fn().mockResolvedValue(undefined),
  revalidateTaxonomy: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/activity-log.client", () => ({ logActivity: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ id: "page-uuid-1" }),
  usePathname: () => "/maki-admin/pages/page-uuid-1",
}));
vi.mock("@/lib/storage", () => ({ storageProvider: { upload: vi.fn() } }));
vi.mock("@/lib/storage.helpers", () => ({
  getPageCoverPublicUrl: () => null,
  buildPageCoverPath: () => "pages/x.webp",
  SITE_ASSETS_BUCKET_NAME: "site-assets",
}));
vi.mock("@/lib/image.helpers", () => ({ convertImageToWebP: vi.fn() }));

import EditPagePage from "@/app/(admin)/maki-admin/pages/[id]/page";

/* ---------- fixtures ---------- */

const PAGE_ID = "page-uuid-1";

const PAGE_ROW = {
  id: PAGE_ID,
  title: "Kaş'ta Unutulmaz Bir Tatil",
  slug: "kasta-unutulmaz-bir-tatil",
  body: "Türkçe gövde",
  excerpt: "Türkçe özet",
  seo_title: "TR SEO",
  seo_description: "TR SEO açıklama",
  noindex: false,
  is_active: true,
  show_in_menu: false,
  cover_image: null,
};

const EN_ROW = {
  id: "t-en",
  page_id: PAGE_ID,
  locale: "en",
  title: "An Unforgettable Holiday in Kas",
  excerpt: "EN excerpt",
  body: "EN body",
  seo_title: "EN seo",
  seo_description: "EN seo desc",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const DE_ROW = {
  ...EN_ROW,
  id: "t-de",
  locale: "de",
  title: "Ein unvergesslicher Urlaub in Kaş",
  excerpt: "DE excerpt",
  body: "DE body",
  seo_title: "DE seo",
  seo_description: "DE seo desc",
};

beforeEach(() => {
  vi.clearAllMocks();
  adminFetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data: PAGE_ROW }),
  });
  getPublicSettingsMock.mockResolvedValue({ multilingual_enabled: true });
  loadPageTranslationsMock.mockResolvedValue({ ok: true, rows: [] });
  savePageTranslationMock.mockResolvedValue({
    ok: true,
    row: { ...EN_ROW },
  });
});

async function renderEdit() {
  render(<EditPagePage />);
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Sayfayı düzenle" })
    ).toBeTruthy()
  );
}

const CARD_HEADING = "Çeviriler (EN / DE)";

/** Kart görünür VE `loading` bitmiş (alanlar render edilmiş) olana
 *  kadar bekler — `findBy*` deterministiktir, `waitFor(heading)` kartın
 *  yalnız başlığını (yükleniyor durumunda da var) yakalar. */
async function cardReady() {
  await screen.findByText(CARD_HEADING);
  await screen.findByText("English sürümünü kaydet");
}

describe("Phase 12C — multilingual_enabled kapısı", () => {
  it("1) multilingual_enabled=false → Çeviriler kartı RENDER EDİLMEZ", async () => {
    getPublicSettingsMock.mockResolvedValue({ multilingual_enabled: false });
    await renderEdit();
    await waitFor(() => expect(getPublicSettingsMock).toHaveBeenCalled());
    expect(screen.queryByText(CARD_HEADING)).toBeNull();
    expect(loadPageTranslationsMock).not.toHaveBeenCalled();
  });

  it("2) settings null → fail-safe KAPALI", async () => {
    getPublicSettingsMock.mockResolvedValue(null);
    await renderEdit();
    await waitFor(() => expect(getPublicSettingsMock).toHaveBeenCalled());
    expect(screen.queryByText(CARD_HEADING)).toBeNull();
  });

  it("3) multilingual_enabled=true → kart render edilir ve çeviriler yüklenir", async () => {
    await renderEdit();
    await cardReady();
    expect(loadPageTranslationsMock).toHaveBeenCalledWith(PAGE_ID);
    expect(screen.getByText("English")).toBeTruthy();
    expect(screen.getByText("Deutsch")).toBeTruthy();
    /* TR referans salt okunur gösterilir */
    expect(screen.getByText("Türkçe (referans, salt okunur)")).toBeTruthy();
    expect(screen.getAllByText(PAGE_ROW.title).length).toBeGreaterThan(0);
  });
});

describe("Phase 12C — kayıtlı çevirilerin yüklenmesi", () => {
  it("4) kayıtlı EN çevirisi forma gelir", async () => {
    loadPageTranslationsMock.mockResolvedValue({
      ok: true,
      rows: [EN_ROW, DE_ROW],
    });
    await renderEdit();
    await cardReady();

    expect(
      (screen.getByLabelText("English başlık") as HTMLInputElement).value
    ).toBe(EN_ROW.title);
    expect(
      (screen.getByLabelText("English kısa açıklama") as HTMLTextAreaElement)
        .value
    ).toBe("EN excerpt");
    expect(
      (screen.getByLabelText("English içerik") as HTMLTextAreaElement).value
    ).toBe("EN body");
    expect(
      (screen.getByLabelText("English SEO başlık") as HTMLInputElement).value
    ).toBe("EN seo");
    expect(
      (screen.getByLabelText("English SEO açıklama") as HTMLTextAreaElement)
        .value
    ).toBe("EN seo desc");
  });

  it("5) DE sekmesine geçilince DE değerleri gösterilir", async () => {
    loadPageTranslationsMock.mockResolvedValue({
      ok: true,
      rows: [EN_ROW, DE_ROW],
    });
    await renderEdit();
    await cardReady();

    fireEvent.click(screen.getByText("Deutsch"));
    expect(
      (screen.getByLabelText("Deutsch başlık") as HTMLInputElement).value
    ).toBe(DE_ROW.title);
    expect(
      (screen.getByLabelText("Deutsch içerik") as HTMLTextAreaElement).value
    ).toBe("DE body");
  });

  it("6) çeviri yoksa alanlar boş gelir", async () => {
    await renderEdit();
    await cardReady();
    expect(
      (screen.getByLabelText("English başlık") as HTMLInputElement).value
    ).toBe("");
  });

  it("7) yükleme hatası → toast.error 'Çeviriler yüklenemedi'", async () => {
    loadPageTranslationsMock.mockResolvedValue({
      ok: false,
      error: "Çeviriler okunamadı",
    });
    await renderEdit();
    await waitFor(() =>
      expect(
        notifyErrorMock.mock.calls.some(
          (c) => c[0] === "Çeviriler yüklenemedi"
        )
      ).toBe(true)
    );
  });
});

describe("Phase 12C — kayıt", () => {
  it("8) EN kaydet → doğru pageId/locale/5 alan ile çağrılır", async () => {
    await renderEdit();
    await cardReady();

    fireEvent.change(screen.getByLabelText("English başlık"), {
      target: { value: "An Unforgettable Holiday in Kas" },
    });
    fireEvent.change(screen.getByLabelText("English kısa açıklama"), {
      target: { value: "EN excerpt" },
    });
    fireEvent.change(screen.getByLabelText("English içerik"), {
      target: { value: "EN body" },
    });
    fireEvent.change(screen.getByLabelText("English SEO başlık"), {
      target: { value: "EN seo" },
    });
    fireEvent.change(screen.getByLabelText("English SEO açıklama"), {
      target: { value: "EN seo desc" },
    });

    fireEvent.click(screen.getByText("English sürümünü kaydet"));

    await waitFor(() => expect(savePageTranslationMock).toHaveBeenCalled());
    expect(savePageTranslationMock).toHaveBeenCalledWith({
      pageId: PAGE_ID,
      locale: "en",
      title: "An Unforgettable Holiday in Kas",
      excerpt: "EN excerpt",
      body: "EN body",
      seoTitle: "EN seo",
      seoDescription: "EN seo desc",
      /* 🛡️ MIGRATION 091 — kart artık bölüm çevirisini de gönderir.
         Bu testte `canonicalSections` prop'u VERİLMEDİĞİ için canonical
         yapı boştur → `buildTranslatedSections` `null` döner ve public
         taraf canonical TR bölümlerine düşer. */
      sections: null,
    });
    await waitFor(() =>
      expect(notifySuccessMock).toHaveBeenCalledWith(
        "English çevirisi kaydedildi",
        expect.anything()
      )
    );
  });

  it("9) DE kaydet → locale 'de' gider", async () => {
    savePageTranslationMock.mockResolvedValue({ ok: true, row: { ...DE_ROW } });
    await renderEdit();
    await cardReady();

    fireEvent.click(screen.getByText("Deutsch"));
    fireEvent.change(screen.getByLabelText("Deutsch başlık"), {
      target: { value: "Ein unvergesslicher Urlaub in Kaş" },
    });
    fireEvent.click(screen.getByText("Deutsch sürümünü kaydet"));

    await waitFor(() => expect(savePageTranslationMock).toHaveBeenCalled());
    expect(savePageTranslationMock.mock.calls[0][0]).toMatchObject({
      pageId: PAGE_ID,
      locale: "de",
      title: "Ein unvergesslicher Urlaub in Kaş",
    });
    await waitFor(() =>
      expect(notifySuccessMock).toHaveBeenCalledWith(
        "Deutsch çevirisi kaydedildi",
        expect.anything()
      )
    );
  });

  it("10) BOŞ çeviri kaydı güvenli — boş alanlarla çağrılır, hata yok", async () => {
    savePageTranslationMock.mockResolvedValue({
      ok: true,
      row: {
        ...EN_ROW,
        title: null,
        excerpt: null,
        body: null,
        seo_title: null,
        seo_description: null,
      },
    });
    await renderEdit();
    await cardReady();

    fireEvent.click(screen.getByText("English sürümünü kaydet"));
    await waitFor(() => expect(savePageTranslationMock).toHaveBeenCalled());
    expect(savePageTranslationMock).toHaveBeenCalledWith({
      pageId: PAGE_ID,
      locale: "en",
      title: "",
      excerpt: "",
      body: "",
      seoTitle: "",
      seoDescription: "",
      /* 🛡️ MIGRATION 091 — boş kayıtta bölüm çevirisi de null. */
      sections: null,
    });
    await waitFor(() =>
      expect(
        (screen.getByLabelText("English başlık") as HTMLInputElement).value
      ).toBe("")
    );
    expect(notifyErrorMock).not.toHaveBeenCalled();
  });

  it("11) kayıt sonrası sunucunun normalize ettiği değerlerle senkronlanır", async () => {
    savePageTranslationMock.mockResolvedValue({
      ok: true,
      row: { ...EN_ROW, title: "About Us" },
    });
    await renderEdit();
    await cardReady();

    fireEvent.change(screen.getByLabelText("English başlık"), {
      target: { value: "   About Us   " },
    });
    fireEvent.click(screen.getByText("English sürümünü kaydet"));

    await waitFor(() =>
      expect(
        (screen.getByLabelText("English başlık") as HTMLInputElement).value
      ).toBe("About Us")
    );
  });

  it("12) hata (Yetkisiz) → toast.error, form kaybolmaz", async () => {
    savePageTranslationMock.mockResolvedValue({
      ok: false,
      error: "Yetkisiz",
    });
    await renderEdit();
    await cardReady();

    fireEvent.click(screen.getByText("English sürümünü kaydet"));
    await waitFor(() =>
      expect(notifyErrorMock).toHaveBeenCalledWith(
        "Kaydedilemedi",
        expect.objectContaining({ description: "Yetkisiz" })
      )
    );
    expect(notifySuccessMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("English başlık")).toBeTruthy();
  });

  it("13) TEKRAR kaydetme çalışır (idempotent, 2. çağrı)", async () => {
    await renderEdit();
    await cardReady();

    fireEvent.change(screen.getByLabelText("English başlık"), {
      target: { value: "v1" },
    });
    fireEvent.click(screen.getByText("English sürümünü kaydet"));
    await waitFor(() =>
      expect(savePageTranslationMock).toHaveBeenCalledTimes(1)
    );

    fireEvent.change(screen.getByLabelText("English başlık"), {
      target: { value: "v2" },
    });
    fireEvent.click(screen.getByText("English sürümünü kaydet"));
    await waitFor(() =>
      expect(savePageTranslationMock).toHaveBeenCalledTimes(2)
    );
    expect(savePageTranslationMock.mock.calls[1][0]).toMatchObject({
      title: "v2",
      locale: "en",
    });
  });
});

describe("Phase 12C — mevcut TR davranışı korunuyor", () => {
  it("14) TR ana form alanları ve Kaydet butonu DEĞİŞMEDİ", async () => {
    await renderEdit();
    await cardReady();

    expect(screen.getByText("Başlık, içerik, SEO ve yayın durumu.")).toBeTruthy();
    expect(screen.getByDisplayValue(PAGE_ROW.title)).toBeTruthy();
    expect(screen.getByDisplayValue(PAGE_ROW.slug)).toBeTruthy();
    expect(screen.getByDisplayValue("Türkçe gövde")).toBeTruthy();
    expect(screen.getByText("Yayın")).toBeTruthy();
    expect(screen.getByText("Kaydet")).toBeTruthy();
  });

  it("15) ana 'Kaydet' çeviri action'ını ÇAĞIRMAZ (akışlar ayrı)", async () => {
    await renderEdit();
    await cardReady();

    adminFetchMock.mockClear();
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(adminFetchMock).toHaveBeenCalled());
    expect(savePageTranslationMock).not.toHaveBeenCalled();
  });

  it("16) çeviri kaydı ana sayfa PUT'unu tetiklemez", async () => {
    await renderEdit();
    await cardReady();

    adminFetchMock.mockClear();
    fireEvent.click(screen.getByText("English sürümünü kaydet"));
    await waitFor(() => expect(savePageTranslationMock).toHaveBeenCalled());
    expect(adminFetchMock).not.toHaveBeenCalled();
  });
});
