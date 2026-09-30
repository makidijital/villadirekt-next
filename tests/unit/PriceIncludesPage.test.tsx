/* ===============================================================
   🛡️ PHASE 10D — Batch 3 — Price-Includes Admin Sayfası + Çeviri Paneli
   TESTLERİ
   ===============================================================
   FeaturesPage.test.tsx (Batch 2) ile AYNI mock-katman prensibi ve
   senaryo seti — Price-Include field'larına (title) uyarlandı.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const getPriceIncludeItemsMock = vi.fn();
const addPriceIncludeItemMock = vi.fn();
const updatePriceIncludeItemMock = vi.fn();
const deletePriceIncludeItemMock = vi.fn();

vi.mock("@/app/(admin)/maki-admin/price-includes/price-includes.action", () => ({
  getPriceIncludeItemsAction: (...args: unknown[]) =>
    getPriceIncludeItemsMock(...args),
  addPriceIncludeItemAction: (...args: unknown[]) =>
    addPriceIncludeItemMock(...args),
  updatePriceIncludeItemAction: (...args: unknown[]) =>
    updatePriceIncludeItemMock(...args),
  deletePriceIncludeItemAction: (...args: unknown[]) =>
    deletePriceIncludeItemMock(...args),
}));

const loadPriceIncludeTranslationsMock = vi.fn();
const savePriceIncludeTranslationMock = vi.fn();

vi.mock(
  "@/app/(admin)/maki-admin/price-includes/price-include-translations.action",
  () => ({
    loadPriceIncludeTranslationsAction: (...args: unknown[]) =>
      loadPriceIncludeTranslationsMock(...args),
    savePriceIncludeTranslationAction: (...args: unknown[]) =>
      savePriceIncludeTranslationMock(...args),
  })
);

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

import PriceIncludesPage from "@/app/(admin)/maki-admin/price-includes/page";

const ITEMS = [
  { id: "inc-1", title: "WiFi" },
  { id: "inc-2", title: "Otopark" },
];

function settingsWith(multilingual_enabled: boolean | null) {
  return { multilingual_enabled };
}

beforeEach(() => {
  getPriceIncludeItemsMock.mockReset();
  addPriceIncludeItemMock.mockReset();
  updatePriceIncludeItemMock.mockReset();
  deletePriceIncludeItemMock.mockReset();
  loadPriceIncludeTranslationsMock.mockReset();
  savePriceIncludeTranslationMock.mockReset();
  getPublicSettingsMock.mockReset();
  notifyErrorMock.mockReset();
  notifySuccessMock.mockReset();
  confirmMock.mockReset();

  getPriceIncludeItemsMock.mockResolvedValue(ITEMS);
  loadPriceIncludeTranslationsMock.mockResolvedValue({ ok: true, rows: [] });
  savePriceIncludeTranslationMock.mockResolvedValue({
    ok: true,
    row: {
      id: "row-1",
      include_id: "inc-1",
      locale: "en",
      title: "WiFi",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  });
});

describe("PriceIncludesPage — Phase 10D Batch 3 — çeviri UI görünürlüğü", () => {
  it("1) multilingual_enabled=false → 'Çeviriler' butonu RENDER EDİLMEZ", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(false));
    render(<PriceIncludesPage />);

    expect(await screen.findByDisplayValue("WiFi")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /çevirileri/i })
    ).not.toBeInTheDocument();
  });

  it("2) multilingual_enabled=null → fail-safe KAPALI, buton görünmez", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(null));
    render(<PriceIncludesPage />);

    expect(await screen.findByDisplayValue("WiFi")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /çevirileri/i })
    ).not.toBeInTheDocument();
  });

  it("3) multilingual_enabled=true → 'Çeviriler' butonları render edilir", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<PriceIncludesPage />);

    const btns = await screen.findAllByRole("button", { name: /çevirileri/i });
    expect(btns.length).toBe(2);
  });
});

describe("PriceIncludesPage — Phase 10D Batch 3 — panel açma/kapama + tab mekaniği", () => {
  it("4) 'Çeviriler' butonuna tıklanınca panel açılır", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<PriceIncludesPage />);

    const btns = await screen.findAllByRole("button", { name: /çevirileri/i });
    fireEvent.click(btns[0]);

    expect(await screen.findByText("Türkçe (referans, salt okunur)")).toBeInTheDocument();
  });

  it("5) Yalnız ilgili satırın paneli açılır", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<PriceIncludesPage />);

    const btns = await screen.findAllByRole("button", { name: /çevirileri/i });
    fireEvent.click(btns[0]);
    await screen.findByText("Türkçe (referans, salt okunur)");

    expect(screen.getAllByText("Türkçe (referans, salt okunur)").length).toBe(1);
  });

  it("6) İkinci satıra basınca önceki panel kapanır (tek panel açık)", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<PriceIncludesPage />);

    const btns = await screen.findAllByRole("button", { name: /çevirileri/i });
    fireEvent.click(btns[0]);
    await screen.findByText("Türkçe (referans, salt okunur)");
    fireEvent.click(btns[1]);

    await waitFor(() => {
      expect(screen.getAllByText("Türkçe (referans, salt okunur)").length).toBe(1);
    });
    expect(screen.getByText("Otopark", { selector: "p" })).toBeInTheDocument();
  });

  it("7) EN tab çalışıyor (varsayılan aktif)", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<PriceIncludesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);

    expect(await screen.findByLabelText("English")).toBeInTheDocument();
    expect(screen.queryByLabelText("Deutsch")).not.toBeInTheDocument();
  });

  it("8) DE tab çalışıyor", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<PriceIncludesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);
    await screen.findByLabelText("English");
    fireEvent.click(screen.getByRole("button", { name: "Deutsch" }));

    expect(await screen.findByLabelText("Deutsch")).toBeInTheDocument();
    expect(screen.queryByLabelText("English")).not.toBeInTheDocument();
  });
});

describe("PriceIncludesPage — Phase 10D Batch 3 — mevcut çeviri yükleme + kaydet", () => {
  it("9) Mevcut EN/DE çevirileri input'a yüklenir", async () => {
    loadPriceIncludeTranslationsMock.mockResolvedValue({
      ok: true,
      rows: [
        {
          id: "row-en",
          include_id: "inc-1",
          locale: "en",
          title: "WiFi",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "row-de",
          include_id: "inc-1",
          locale: "de",
          title: "WLAN",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<PriceIncludesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);

    const enInput = (await screen.findByLabelText("English")) as HTMLInputElement;
    await waitFor(() => expect(enInput.value).toBe("WiFi"));

    fireEvent.click(screen.getByRole("button", { name: "Deutsch" }));
    const deInput = (await screen.findByLabelText("Deutsch")) as HTMLInputElement;
    await waitFor(() => expect(deInput.value).toBe("WLAN"));
  });

  it("10) Kaydet → savePriceIncludeTranslationAction doğru includeId/locale/title ile çağrılır", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<PriceIncludesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);
    const input = await screen.findByLabelText("English");
    fireEvent.change(input, { target: { value: "WiFi" } });
    fireEvent.click(screen.getByRole("button", { name: /sürümünü kaydet/i }));

    await waitFor(() =>
      expect(savePriceIncludeTranslationMock).toHaveBeenCalledWith({
        includeId: "inc-1",
        locale: "en",
        title: "WiFi",
      })
    );
  });

  it("11) Boş/trim input → action ÇAĞRILMAZ, hata toast gösterilir", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<PriceIncludesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);
    const input = await screen.findByLabelText("English");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /sürümünü kaydet/i }));

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(savePriceIncludeTranslationMock).not.toHaveBeenCalled();
  });

  it("12) Action hata döndürürse hata gösterilir", async () => {
    savePriceIncludeTranslationMock.mockResolvedValue({
      ok: false,
      error: "Yetkisiz",
    });
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<PriceIncludesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);
    const input = await screen.findByLabelText("English");
    fireEvent.change(input, { target: { value: "WiFi" } });
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

describe("PriceIncludesPage — Phase 10D Batch 3 — regresyon + TR referans kuralı", () => {
  it("13) Mevcut Price-Include CRUD UI temel elemanları hâlâ render ediliyor", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<PriceIncludesPage />);

    expect(await screen.findByDisplayValue("WiFi")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Kaydet$/i }).length).toBe(2);
    expect(screen.getAllByRole("button", { name: /^Sil$/i }).length).toBe(2);
    expect(
      screen.getByPlaceholderText("Madde adı (Örn: WiFi)")
    ).toBeInTheDocument();
  });

  it("TR referansı düzenlenebilir input olarak SUNULMUYOR — yalnız salt metin", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<PriceIncludesPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);

    const trLabel = await screen.findByText("Türkçe (referans, salt okunur)");
    const panel = trLabel.closest("div")?.parentElement as HTMLElement;
    expect(panel).toBeTruthy();

    const trText = within(panel).getByText("WiFi");
    expect(trText.tagName).not.toBe("INPUT");
    expect(trText.tagName).not.toBe("TEXTAREA");

    const inputs = within(panel).getAllByRole("textbox");
    expect(inputs.length).toBe(1);
  });
});
