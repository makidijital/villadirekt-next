/* ===============================================================
   🛡️ PHASE 10D — Batch 3 — Types Admin Sayfası + Çeviri Paneli TESTLERİ
   ===============================================================
   FeaturesPage.test.tsx (Batch 2) ile AYNI mock-katman prensibi ve
   senaryo seti — Villa Type field'larına (`name`) uyarlandı. Types
   sayfası cover-upload / sort-mode / homepage-toggle gibi ek özellikler
   içerir — bu testler yalnız Batch 3'ün çeviri UI'ını hedefler, mevcut
   CRUD/cover/sort davranışına dokunmaz (regresyon testi #13 mevcut
   temel elemanların hâlâ render edildiğini doğrular).
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const getVillaTypesMock = vi.fn();
const addVillaTypeMock = vi.fn();
const updateVillaTypeMock = vi.fn();
const deleteVillaTypeMock = vi.fn();
const setVillaTypeCoverMock = vi.fn();
const setVillaTypeHomepageMock = vi.fn();
const setVillaTypeSortOrdersMock = vi.fn();

vi.mock("@/app/(admin)/maki-admin/types/types.action", () => ({
  getVillaTypesAction: (...args: unknown[]) => getVillaTypesMock(...args),
  addVillaTypeAction: (...args: unknown[]) => addVillaTypeMock(...args),
  updateVillaTypeAction: (...args: unknown[]) => updateVillaTypeMock(...args),
  deleteVillaTypeAction: (...args: unknown[]) => deleteVillaTypeMock(...args),
  setVillaTypeCoverAction: (...args: unknown[]) => setVillaTypeCoverMock(...args),
  setVillaTypeHomepageAction: (...args: unknown[]) =>
    setVillaTypeHomepageMock(...args),
  setVillaTypeSortOrdersAction: (...args: unknown[]) =>
    setVillaTypeSortOrdersMock(...args),
}));

const loadTypeTranslationsMock = vi.fn();
const saveTypeTranslationMock = vi.fn();

vi.mock("@/app/(admin)/maki-admin/types/type-translations.action", () => ({
  loadTypeTranslationsAction: (...args: unknown[]) =>
    loadTypeTranslationsMock(...args),
  saveTypeTranslationAction: (...args: unknown[]) =>
    saveTypeTranslationMock(...args),
}));

const getPublicSettingsMock = vi.fn();
vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: () => getPublicSettingsMock(),
}));

/* 🛡️ PHASE 10H — çeviri kaydı ARTIK public Header/Footer'ı etkiliyor;
   bu yüzden TR adı güncellemesiyle AYNI invalidation çifti çağrılmalı.
   Mock'lar `vi.fn()` referansları olarak dışarı alındı ki çağrıldıkları
   DOĞRULANABİLSİN (önceki inline `vi.fn()`'ler erişilemiyordu). */
const revalidateTaxonomyMock = vi.fn().mockResolvedValue(undefined);
const revalidateMenuMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/services/revalidate.actions", () => ({
  revalidateTaxonomy: (...args: unknown[]) => revalidateTaxonomyMock(...args),
  revalidateMenu: (...args: unknown[]) => revalidateMenuMock(...args),
}));

const notifyErrorMock = vi.fn();
const notifySuccessMock = vi.fn();
const confirmMock = vi.fn();

vi.mock("@/app/components/admin/notifications/NotificationProvider", () => ({
  useNotify: () => ({
    success: notifySuccessMock,
    error: notifyErrorMock,
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  }),
  useConfirm: () => confirmMock,
}));

import TypesPage from "@/app/(admin)/maki-admin/types/page";

const TYPES = [
  {
    id: "type-1",
    name: "Lüks Villa",
    slug: "luks-villa",
    cover_image: null,
    show_on_homepage: true,
  },
  {
    id: "type-2",
    name: "Aile Villası",
    slug: "aile-villasi",
    cover_image: null,
    show_on_homepage: true,
  },
];

function settingsWith(multilingual_enabled: boolean | null) {
  return { multilingual_enabled };
}

beforeEach(() => {
  getVillaTypesMock.mockReset();
  addVillaTypeMock.mockReset();
  updateVillaTypeMock.mockReset();
  deleteVillaTypeMock.mockReset();
  setVillaTypeCoverMock.mockReset();
  setVillaTypeHomepageMock.mockReset();
  setVillaTypeSortOrdersMock.mockReset();
  loadTypeTranslationsMock.mockReset();
  saveTypeTranslationMock.mockReset();
  revalidateTaxonomyMock.mockClear();
  revalidateMenuMock.mockClear();
  getPublicSettingsMock.mockReset();
  notifyErrorMock.mockReset();
  notifySuccessMock.mockReset();
  confirmMock.mockReset();

  getVillaTypesMock.mockResolvedValue(TYPES);
  loadTypeTranslationsMock.mockResolvedValue({ ok: true, rows: [] });
  saveTypeTranslationMock.mockResolvedValue({
    ok: true,
    row: {
      id: "row-1",
      type_id: "type-1",
      locale: "en",
      name: "Luxury Villa",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  });
});

describe("TypesPage — Phase 10D Batch 3 — çeviri UI görünürlüğü", () => {
  it("1) multilingual_enabled=false → 'Çeviriler' butonu RENDER EDİLMEZ", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(false));
    render(<TypesPage />);

    expect(await screen.findByDisplayValue("Lüks Villa")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /çevirileri/i })
    ).not.toBeInTheDocument();
  });

  it("2) multilingual_enabled=null → fail-safe KAPALI, buton görünmez", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(null));
    render(<TypesPage />);

    expect(await screen.findByDisplayValue("Lüks Villa")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /çevirileri/i })
    ).not.toBeInTheDocument();
  });

  it("3) multilingual_enabled=true → 'Çeviriler' butonları render edilir", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<TypesPage />);

    const btns = await screen.findAllByRole("button", { name: /çevirileri/i });
    expect(btns.length).toBe(2);
  });
});

describe("TypesPage — Phase 10D Batch 3 — panel açma/kapama + tab mekaniği", () => {
  it("4) 'Çeviriler' butonuna tıklanınca panel açılır", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<TypesPage />);

    const btns = await screen.findAllByRole("button", { name: /çevirileri/i });
    fireEvent.click(btns[0]);

    expect(await screen.findByText("Türkçe (referans, salt okunur)")).toBeInTheDocument();
  });

  it("5) Yalnız ilgili satırın paneli açılır", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<TypesPage />);

    const btns = await screen.findAllByRole("button", { name: /çevirileri/i });
    fireEvent.click(btns[0]);
    await screen.findByText("Türkçe (referans, salt okunur)");

    expect(screen.getAllByText("Türkçe (referans, salt okunur)").length).toBe(1);
  });

  it("6) İkinci satıra basınca önceki panel kapanır (tek panel açık)", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<TypesPage />);

    const btns = await screen.findAllByRole("button", { name: /çevirileri/i });
    fireEvent.click(btns[0]);
    await screen.findByText("Türkçe (referans, salt okunur)");
    fireEvent.click(btns[1]);

    await waitFor(() => {
      expect(screen.getAllByText("Türkçe (referans, salt okunur)").length).toBe(1);
    });
    expect(screen.getByText("Aile Villası", { selector: "p" })).toBeInTheDocument();
  });

  it("7) EN tab çalışıyor (varsayılan aktif)", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<TypesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);

    expect(await screen.findByLabelText("English")).toBeInTheDocument();
    expect(screen.queryByLabelText("Deutsch")).not.toBeInTheDocument();
  });

  it("8) DE tab çalışıyor", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<TypesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);
    await screen.findByLabelText("English");
    fireEvent.click(screen.getByRole("button", { name: "Deutsch" }));

    expect(await screen.findByLabelText("Deutsch")).toBeInTheDocument();
    expect(screen.queryByLabelText("English")).not.toBeInTheDocument();
  });
});

describe("TypesPage — Phase 10D Batch 3 — mevcut çeviri yükleme + kaydet", () => {
  it("9) Mevcut EN/DE çevirileri input'a yüklenir", async () => {
    loadTypeTranslationsMock.mockResolvedValue({
      ok: true,
      rows: [
        {
          id: "row-en",
          type_id: "type-1",
          locale: "en",
          name: "Luxury Villa",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "row-de",
          type_id: "type-1",
          locale: "de",
          name: "Luxusvilla",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<TypesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);

    const enInput = (await screen.findByLabelText("English")) as HTMLInputElement;
    await waitFor(() => expect(enInput.value).toBe("Luxury Villa"));

    fireEvent.click(screen.getByRole("button", { name: "Deutsch" }));
    const deInput = (await screen.findByLabelText("Deutsch")) as HTMLInputElement;
    await waitFor(() => expect(deInput.value).toBe("Luxusvilla"));
  });

  it("10) Kaydet → saveTypeTranslationAction doğru typeId/locale/name ile çağrılır", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<TypesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);
    const input = await screen.findByLabelText("English");
    fireEvent.change(input, { target: { value: "Luxury Villa" } });
    fireEvent.click(screen.getByRole("button", { name: /sürümünü kaydet/i }));

    await waitFor(() =>
      expect(saveTypeTranslationMock).toHaveBeenCalledWith({
        typeId: "type-1",
        locale: "en",
        name: "Luxury Villa",
      })
    );
  });

  it("11) Boş/trim input → action ÇAĞRILMAZ, hata toast gösterilir", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<TypesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);
    const input = await screen.findByLabelText("English");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /sürümünü kaydet/i }));

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(saveTypeTranslationMock).not.toHaveBeenCalled();
  });

  it("12) Action hata döndürürse hata gösterilir", async () => {
    saveTypeTranslationMock.mockResolvedValue({ ok: false, error: "Yetkisiz" });
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<TypesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);
    const input = await screen.findByLabelText("English");
    fireEvent.change(input, { target: { value: "Luxury Villa" } });
    fireEvent.click(screen.getByRole("button", { name: /sürümünü kaydet/i }));

    await waitFor(() =>
      expect(notifyErrorMock).toHaveBeenCalledWith(
        "Kaydedilemedi",
        expect.objectContaining({ description: "Yetkisiz" })
      )
    );
    expect(notifySuccessMock).not.toHaveBeenCalled();
  });

  /* ===============================================================
     🛡️ PHASE 10H — CACHE INVALIDATION
     ===============================================================
     Villa tipi adının EN/DE karşılığı artık public Header + Footer'da
     okunuyor. Bu yüzden çeviri kaydı, TR adı değiştirildiğinde
     (`handleUpdate`) çağrılan AYNI invalidation çiftini çağırmalı —
     aksi halde admin çeviriyi kaydeder ama public taraf stale kalır.
     =============================================================== */
  it("14) 🛡️ PHASE 10H — başarılı çeviri kaydı revalidateTaxonomy + revalidateMenu çağırır", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<TypesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);
    const input = await screen.findByLabelText("English");
    fireEvent.change(input, { target: { value: "Luxury Villa" } });
    fireEvent.click(screen.getByRole("button", { name: /sürümünü kaydet/i }));

    await waitFor(() => expect(revalidateTaxonomyMock).toHaveBeenCalled());
    expect(revalidateMenuMock).toHaveBeenCalled();
  });

  it("15) 🛡️ PHASE 10H — kayıt BAŞARISIZ ise invalidation çağrılmaz", async () => {
    saveTypeTranslationMock.mockResolvedValue({ ok: false, error: "Yetkisiz" });
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<TypesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);
    const input = await screen.findByLabelText("English");
    fireEvent.change(input, { target: { value: "Luxury Villa" } });
    fireEvent.click(screen.getByRole("button", { name: /sürümünü kaydet/i }));

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(revalidateTaxonomyMock).not.toHaveBeenCalled();
    expect(revalidateMenuMock).not.toHaveBeenCalled();
  });
});

describe("TypesPage — Phase 10D Batch 3 — regresyon + TR referans kuralı", () => {
  it("13) Mevcut Type CRUD UI temel elemanları (input/Kaydet/Sil/Sıralamayı Düzenle) hâlâ render ediliyor", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<TypesPage />);

    expect(await screen.findByDisplayValue("Lüks Villa")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Kaydet$/i }).length).toBe(2);
    expect(screen.getAllByRole("button", { name: /^Sil$/i }).length).toBe(2);
    expect(
      screen.getByPlaceholderText("Tip adı (Örn: Lüks Villa)")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sıralamayı Düzenle/i })
    ).toBeInTheDocument();
  });

  it("TR referansı düzenlenebilir input olarak SUNULMUYOR — yalnız salt metin", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<TypesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);

    const trLabel = await screen.findByText("Türkçe (referans, salt okunur)");
    const panel = trLabel.closest("div")?.parentElement as HTMLElement;
    expect(panel).toBeTruthy();

    const trText = within(panel).getByText("Lüks Villa");
    expect(trText.tagName).not.toBe("INPUT");
    expect(trText.tagName).not.toBe("TEXTAREA");

    const inputs = within(panel).getAllByRole("textbox");
    expect(inputs.length).toBe(1);
  });
});
