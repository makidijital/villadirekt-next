/* ===============================================================
   🛡️ VillaZipShareButton — modal katmanlama (portal) regresyon kilidi
   ===============================================================
   Sorun: modal, villa kartı ACTION TOOLBAR'ının (`relative z-[2]`)
   içinde inline render ediliyordu → z-[60] o stacking context'e
   hapsoluyor, sonraki kartların butonları overlay'in üstünde
   görünüyordu. Çözüm: modal en yakın `.admin-shell` köküne portal.
   Bu test yalnız DOM konumunu + mevcut davranışın korunduğunu kilitler.
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const adminFetchMock = vi.fn();
vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: (...args: unknown[]) => adminFetchMock(...args),
}));

const notifySuccess = vi.fn();
vi.mock("@/app/components/admin/notifications/NotificationProvider", () => ({
  useNotify: () => ({
    success: notifySuccess,
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  }),
}));

import { VillaZipShareButton } from "@/app/(admin)/maki-admin/villas/VillaZipShareButton";

function jsonRes(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

function renderInCardToolbar() {
  return render(
    <div className="admin-shell" data-testid="shell">
      <article className="admin-card relative">
        <div className="relative z-[2]" data-testid="toolbar">
          <VillaZipShareButton villaId="v-1" villaTitle="Villa Test" />
        </div>
      </article>
      <article className="admin-card relative">
        <div className="relative z-[2]" data-testid="toolbar-2">
          <button type="button">Düzenle</button>
        </div>
      </article>
    </div>
  );
}

describe("VillaZipShareButton — modal katmanı", () => {
  beforeEach(() => {
    adminFetchMock.mockReset();
    notifySuccess.mockReset();
    document.body.style.overflow = "";
  });

  it("modal kart toolbar'ının DIŞINDA, .admin-shell köküne render edilir", async () => {
    adminFetchMock.mockResolvedValue(jsonRes({ ok: true, links: [] }));
    renderInCardToolbar();

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /ZIP paylaşım linki/ }));

    const dialog = await screen.findByRole("dialog");
    const shell = screen.getByTestId("shell");
    expect(dialog.parentElement).toBe(shell);
    expect(screen.getByTestId("toolbar").contains(dialog)).toBe(false);
    /* Overlay sınıfları aynen korunur. */
    expect(dialog.className).toContain("fixed inset-0 z-[60]");
    /* Body scroll lock mevcut mantıkla. */
    expect(document.body.style.overflow).toBe("hidden");
    await waitFor(() => expect(screen.getByText("Henüz link yok.")).toBeTruthy());
  });

  it("modal içi butonlar çalışır; kapatınca DOM'dan kalkar ve scroll geri gelir", async () => {
    adminFetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return jsonRes({ ok: true, download_path: "/api/public/villa-zip/tok" });
      }
      return jsonRes({ ok: true, links: [] });
    });
    renderInCardToolbar();

    fireEvent.click(screen.getByRole("button", { name: /ZIP paylaşım linki/ }));
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "6 saat" }));
    fireEvent.click(screen.getByRole("button", { name: /ZIP Link Oluştur/ }));

    await waitFor(() => expect(notifySuccess).toHaveBeenCalled());
    const post = adminFetchMock.mock.calls.find((c) => c[1]?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      villa_id: "v-1",
      duration_hours: 6,
    });
    expect(
      (screen.getByDisplayValue(/\/api\/public\/villa-zip\/tok$/) as HTMLInputElement)
        .readOnly
    ).toBe(true);

    /* Header "Kapat" (X) butonu */
    const closeButtons = screen.getAllByRole("button", { name: "Kapat" });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByTestId("shell").lastElementChild?.tagName).toBe("ARTICLE");
  });

  it("ESC ve backdrop tıklaması modalı kapatır", async () => {
    adminFetchMock.mockResolvedValue(jsonRes({ ok: true, links: [] }));
    renderInCardToolbar();

    fireEvent.click(screen.getByRole("button", { name: /ZIP paylaşım linki/ }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /ZIP paylaşım linki/ }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getAllByRole("button", { name: "Kapat" })[0]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it(".admin-shell yoksa document.body'ye düşer", async () => {
    adminFetchMock.mockResolvedValue(jsonRes({ ok: true, links: [] }));
    render(<VillaZipShareButton villaId="v-2" villaTitle="Villa B" />);
    fireEvent.click(screen.getByRole("button", { name: /ZIP paylaşım linki/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.parentElement).toBe(document.body);
  });
});
