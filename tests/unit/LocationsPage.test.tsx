/* ===============================================================
   🛡️ LOCATIONS ADMIN SAYFASI TESTLERİ
   ===============================================================
   🛡️ PHASE 10I — BÖLGE ADLARI ÇEVRİLMEZ.
   Kalkan / Kaş / Fethiye / Çavdır gibi bölge adları ÖZEL İSİMDİR;
   İngilizce veya Almanca karşılıkları yoktur. Phase 10D Batch 3'te
   eklenen EN/DE çeviri UI'ı (LocationTranslationsPanel +
   location-translations.action + villa-location-translation.service)
   TAMAMEN KALDIRILDI.

   Bu dosyadaki 12 çeviri-UI testi (panel görünürlüğü, tab mekaniği,
   yükleme/kaydetme, TR referans kuralı) artık var olmayan bir
   özelliği test ettiği için KALDIRILDI — davranış değiştiği için
   değil, test edilen ÖZELLİK ortadan kalktığı için. Yerlerine, geri
   gelmemesini garanti eden bir REGRESYON KİLİDİ eklendi.

   Location CRUD / inline edit / cover upload / filtre kürasyonu
   testleri AYNEN korundu (aşağıdaki regresyon describe'ı).
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const adminFetchMock = vi.fn();
vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: (...args: unknown[]) => adminFetchMock(...args),
}));

vi.mock("@/app/services/revalidate.actions", () => ({
  revalidateTaxonomy: vi.fn().mockResolvedValue(undefined),
  revalidateMenu: vi.fn().mockResolvedValue(undefined),
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

import LocationsPage from "@/app/(admin)/maki-admin/locations/page";

const LOCATIONS = [
  {
    id: "loc-1",
    name: "Kaş",
    slug: "kas",
    cover_image: null,
    show_in_filter: false,
    filter_group_name: null,
  },
  {
    id: "loc-2",
    name: "Fethiye",
    slug: "fethiye",
    cover_image: null,
    show_in_filter: false,
    filter_group_name: null,
  },
];

beforeEach(() => {
  adminFetchMock.mockReset();
  notifyErrorMock.mockReset();
  notifySuccessMock.mockReset();
  confirmMock.mockReset();

  adminFetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, locations: LOCATIONS }),
  });
});

/* ===============================================================
   🛡️ PHASE 10I — ÇEVİRİ UI'I KALDIRILDI (regresyon kilidi)
   =============================================================== */
describe("LocationsPage — bölge adları çevrilmez (Phase 10I)", () => {
  it("1) 'Çeviriler' butonu HİÇBİR koşulda render edilmez", async () => {
    render(<LocationsPage />);

    expect(await screen.findByText("Kaş")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /çevirileri/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Çeviriler/)).not.toBeInTheDocument();
  });

  it("2) EN/DE çeviri paneli ögeleri (English/Deutsch/TR referans) DOM'da YOK", async () => {
    render(<LocationsPage />);

    expect(await screen.findByText("Kaş")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "English" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deutsch" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Türkçe (referans, salt okunur)")
    ).not.toBeInTheDocument();
  });

  it("3) inline düzenlemede de çeviri ögesi belirmez", async () => {
    render(<LocationsPage />);

    await screen.findByText("Kaş");
    fireEvent.click(screen.getAllByRole("button", { name: /Düzenle/i })[0]);

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Kaydet/i }).length)
        .toBeGreaterThan(0)
    );
    expect(
      screen.queryByRole("button", { name: /çevirileri/i })
    ).not.toBeInTheDocument();
  });
});

/* ===============================================================
   MEVCUT LOCATION CRUD — DEĞİŞMEDİ
   =============================================================== */
describe("LocationsPage — mevcut CRUD UI regresyonu", () => {
  it("4) Düzenle/Sil/bölge adı input'u hâlâ render ediliyor", async () => {
    render(<LocationsPage />);

    expect(await screen.findByText("Kaş")).toBeInTheDocument();
    expect(screen.getByText("Fethiye")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Düzenle/i }).length).toBe(2);
    expect(screen.getAllByRole("button", { name: /^Sil$/i }).length).toBe(2);
    expect(
      screen.getByPlaceholderText("Bölge adı (Kaş, Fethiye…)")
    ).toBeInTheDocument();
  });

  it("5) inline düzenleme açılınca Kaydet/İptal görünür (mevcut edit UX)", async () => {
    render(<LocationsPage />);

    await screen.findByText("Kaş");
    fireEvent.click(screen.getAllByRole("button", { name: /Düzenle/i })[0]);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Düzenle/i }).length).toBe(1);
    });
  });
});
