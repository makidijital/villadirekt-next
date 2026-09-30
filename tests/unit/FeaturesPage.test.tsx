/* ===============================================================
   🛡️ PHASE 10D — Batch 2 — Features Admin Sayfası + Çeviri Paneli TESTLERİ
   ===============================================================
   Hedef: app/(admin)/maki-admin/features/page.tsx (multilingual gate +
   yeni "Çeviriler" butonu) ve FeatureTranslationsPanel.tsx (EN/DE
   pill-tab panel).

   TopBar.test.tsx (Phase 10C) ile AYNI mock-katman prensibi: gerçek
   DB/RPC/server action'lara ÇIKILMAZ. features.action / feature-
   translations.action / settings.action / NotificationProvider MOCK'LANIR.

   12 kullanıcı-onaylı senaryo:
     1)  multilingual_enabled=false → "Çeviriler" butonu YOK.
     2)  multilingual_enabled=true → "Çeviriler" butonu VAR.
     3)  Butona tıklanınca panel açılıyor.
     4)  Panel açıldığında varsayılan EN tab + EN input gösteriliyor.
     5)  DE tab seçilince DE input gösteriliyor.
     6)  Mevcut EN çevirisi input'a yükleniyor.
     7)  Mevcut DE çevirisi input'a yükleniyor.
     8)  Kaydet → saveFeatureTranslationAction doğru featureId/locale/name.
     9)  Boş/trim input → action ÇAĞRILMAZ (service normalize'ıyla uyumlu).
     10) Yetkisiz action cevabı ({ok:false,error:"Yetkisiz"}) → hata toast.
     11) Mevcut Feature CRUD UI temel elemanları (input/Kaydet/Sil) hâlâ var.
     12) TR referansı DÜZENLENEMEZ input olarak sunulmuyor (salt metin).
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const getVillaFeaturesMock = vi.fn();
const addVillaFeatureMock = vi.fn();
const updateVillaFeatureMock = vi.fn();
const deleteVillaFeatureMock = vi.fn();

vi.mock("@/app/(admin)/maki-admin/features/features.action", () => ({
  getVillaFeaturesAction: (...args: unknown[]) => getVillaFeaturesMock(...args),
  addVillaFeatureAction: (...args: unknown[]) => addVillaFeatureMock(...args),
  updateVillaFeatureAction: (...args: unknown[]) => updateVillaFeatureMock(...args),
  deleteVillaFeatureAction: (...args: unknown[]) => deleteVillaFeatureMock(...args),
}));

const loadFeatureTranslationsMock = vi.fn();
const saveFeatureTranslationMock = vi.fn();

vi.mock("@/app/(admin)/maki-admin/features/feature-translations.action", () => ({
  loadFeatureTranslationsAction: (...args: unknown[]) =>
    loadFeatureTranslationsMock(...args),
  saveFeatureTranslationAction: (...args: unknown[]) =>
    saveFeatureTranslationMock(...args),
}));

const getPublicSettingsMock = vi.fn();
vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: () => getPublicSettingsMock(),
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

import FeaturesPage from "@/app/(admin)/maki-admin/features/page";

const FEATURES = [{ id: "feature-1", name: "Havuzlu" }];

function settingsWith(multilingual_enabled: boolean | null) {
  return { multilingual_enabled };
}

beforeEach(() => {
  getVillaFeaturesMock.mockReset();
  addVillaFeatureMock.mockReset();
  updateVillaFeatureMock.mockReset();
  deleteVillaFeatureMock.mockReset();
  loadFeatureTranslationsMock.mockReset();
  saveFeatureTranslationMock.mockReset();
  getPublicSettingsMock.mockReset();
  notifyErrorMock.mockReset();
  notifySuccessMock.mockReset();
  confirmMock.mockReset();

  getVillaFeaturesMock.mockResolvedValue(FEATURES);
  loadFeatureTranslationsMock.mockResolvedValue({ ok: true, rows: [] });
  saveFeatureTranslationMock.mockResolvedValue({
    ok: true,
    row: {
      id: "row-1",
      feature_id: "feature-1",
      locale: "en",
      name: "Pool",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  });
});

describe("FeaturesPage — Phase 10D Batch 2 — çeviri UI görünürlüğü", () => {
  it("1) multilingual_enabled=false → 'Çeviriler' butonu RENDER EDİLMEZ", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(false));
    render(<FeaturesPage />);

    expect(await screen.findByDisplayValue("Havuzlu")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /çevirileri/i })
    ).not.toBeInTheDocument();
  });

  it("2) multilingual_enabled=true → 'Çeviriler' butonu render edilir", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<FeaturesPage />);

    expect(
      await screen.findByRole("button", { name: /çevirileri/i })
    ).toBeInTheDocument();
  });

  it("multilingual_enabled=null → fail-safe KAPALI, buton görünmez", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(null));
    render(<FeaturesPage />);

    expect(await screen.findByDisplayValue("Havuzlu")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /çevirileri/i })
    ).not.toBeInTheDocument();
  });
});

describe("FeaturesPage — Phase 10D Batch 2 — panel açma/kapama + tab mekaniği", () => {
  it("3) 'Çeviriler' butonuna tıklanınca panel açılır", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<FeaturesPage />);

    const btn = await screen.findByRole("button", { name: /çevirileri/i });
    fireEvent.click(btn);

    expect(await screen.findByText("Türkçe (referans, salt okunur)")).toBeInTheDocument();
  });

  it("4) Panel açıldığında varsayılan olarak EN tab aktif + EN input gösterilir", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<FeaturesPage />);

    fireEvent.click(await screen.findByRole("button", { name: /çevirileri/i }));

    expect(await screen.findByLabelText("English")).toBeInTheDocument();
    expect(screen.queryByLabelText("Deutsch")).not.toBeInTheDocument();
  });

  it("5) DE tab seçilince DE input gösterilir (EN input kaybolur)", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<FeaturesPage />);

    fireEvent.click(await screen.findByRole("button", { name: /çevirileri/i }));
    await screen.findByLabelText("English");

    fireEvent.click(screen.getByRole("button", { name: "Deutsch" }));

    expect(await screen.findByLabelText("Deutsch")).toBeInTheDocument();
    expect(screen.queryByLabelText("English")).not.toBeInTheDocument();
  });
});

describe("FeaturesPage — Phase 10D Batch 2 — mevcut çeviri yükleme", () => {
  it("6) Mevcut EN çevirisi input'a yüklenir", async () => {
    loadFeatureTranslationsMock.mockResolvedValue({
      ok: true,
      rows: [
        {
          id: "row-en",
          feature_id: "feature-1",
          locale: "en",
          name: "Pool",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<FeaturesPage />);

    fireEvent.click(await screen.findByRole("button", { name: /çevirileri/i }));

    const input = (await screen.findByLabelText("English")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("Pool"));
  });

  it("7) Mevcut DE çevirisi input'a yüklenir", async () => {
    loadFeatureTranslationsMock.mockResolvedValue({
      ok: true,
      rows: [
        {
          id: "row-de",
          feature_id: "feature-1",
          locale: "de",
          name: "Schwimmbad",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<FeaturesPage />);

    fireEvent.click(await screen.findByRole("button", { name: /çevirileri/i }));
    await screen.findByLabelText("English");
    fireEvent.click(screen.getByRole("button", { name: "Deutsch" }));

    const input = (await screen.findByLabelText("Deutsch")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("Schwimmbad"));
  });
});

describe("FeaturesPage — Phase 10D Batch 2 — kaydet akışı", () => {
  it("8) Kaydet → saveFeatureTranslationAction doğru featureId/locale/name ile çağrılır", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<FeaturesPage />);

    fireEvent.click(await screen.findByRole("button", { name: /çevirileri/i }));
    const input = await screen.findByLabelText("English");
    fireEvent.change(input, { target: { value: "Pool" } });

    fireEvent.click(screen.getByRole("button", { name: /İngilizce sürümünü kaydet|English sürümünü kaydet/i }));

    await waitFor(() =>
      expect(saveFeatureTranslationMock).toHaveBeenCalledWith({
        featureId: "feature-1",
        locale: "en",
        name: "Pool",
      })
    );
  });

  it("9) Boş/trim input → action ÇAĞRILMAZ, hata toast gösterilir", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<FeaturesPage />);

    fireEvent.click(await screen.findByRole("button", { name: /çevirileri/i }));
    const input = await screen.findByLabelText("English");
    fireEvent.change(input, { target: { value: "   " } });

    fireEvent.click(screen.getByRole("button", { name: /sürümünü kaydet/i }));

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(saveFeatureTranslationMock).not.toHaveBeenCalled();
  });

  it("10) Action 'Yetkisiz' döndürürse hata toast gösterilir, başarı YOK", async () => {
    saveFeatureTranslationMock.mockResolvedValue({ ok: false, error: "Yetkisiz" });
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<FeaturesPage />);

    fireEvent.click(await screen.findByRole("button", { name: /çevirileri/i }));
    const input = await screen.findByLabelText("English");
    fireEvent.change(input, { target: { value: "Pool" } });
    fireEvent.click(screen.getByRole("button", { name: /sürümünü kaydet/i }));

    await waitFor(() =>
      expect(notifyErrorMock).toHaveBeenCalledWith(
        "Kaydedilemedi",
        expect.objectContaining({ description: "Yetkisiz" })
      )
    );
    expect(notifySuccessMock).not.toHaveBeenCalled();
  });
});

describe("FeaturesPage — Phase 10D Batch 2 — regresyon + TR referans kuralı", () => {
  it("11) Mevcut Feature CRUD UI temel elemanları (input/Kaydet/Sil) hâlâ render ediliyor", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<FeaturesPage />);

    expect(await screen.findByDisplayValue("Havuzlu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Kaydet$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Sil$/i })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Özellik adı (Örn: Havuzlu)")
    ).toBeInTheDocument();
  });

  it("12) TR referansı düzenlenebilir input olarak SUNULMUYOR — yalnız salt metin", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<FeaturesPage />);

    fireEvent.click(await screen.findByRole("button", { name: /çevirileri/i }));

    const trLabel = await screen.findByText("Türkçe (referans, salt okunur)");
    const panel = trLabel.closest("div")?.parentElement as HTMLElement;
    expect(panel).toBeTruthy();

    // TR metni salt <p> olarak render edilir — input/textarea DEĞİL.
    const trText = within(panel).getByText("Havuzlu");
    expect(trText.tagName).not.toBe("INPUT");
    expect(trText.tagName).not.toBe("TEXTAREA");

    // Panelde yalnız TEK input olmalı (aktif locale'in inputu) — TR için
    // ayrı bir input YOK, dolayısıyla panel içindeki input sayısı 1.
    const inputs = within(panel).getAllByRole("textbox");
    expect(inputs.length).toBe(1);
  });
});
