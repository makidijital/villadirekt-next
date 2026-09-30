/* ===============================================================
   🛡️ Ayarlar UploadField önizlemesi — `?v=<R2 ETag>`
   ===============================================================
   - Açılışta R2 versiyonu varsa `?v=<etag>` (settings.updated_at'ten
     öncelikli; görsel kayıt beklemeden değişmiş olabilir).
   - Versiyon alınamazsa mevcut `version` prop'u (updated_at) — eski
     davranış.
   - Upload sonrası aynı path'in YENİ versiyonu → src değişir (sayfa
     yenilemeden). Path / onChange değeri AYNI (`logo/logo.webp`).
   =============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
import { useState } from "react";

const versionsAction = vi.fn();
vi.mock("@/app/services/site-asset-version.action", () => ({
  getSiteAssetVersionsAction: (...a: unknown[]) => versionsAction(...a),
}));
const uploadMock = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/storage", () => ({
  storageProvider: { upload: (...a: unknown[]) => uploadMock(...(a as [])) },
  STORAGE_BUCKETS: { SITE_ASSETS: "tatilinyeri-site-assets", VILLA_IMAGES: "tatilinyeri-villa-images" },
}));
vi.mock("@/lib/storage.helpers", () => ({
  SITE_ASSETS_BUCKET_NAME: "tatilinyeri-site-assets",
  resolveAssetUrlVersioned: (v: string | null, k?: string | null) =>
    v ? `https://cdn.test/${v}${k ? `?v=${k}` : ""}` : null,
}));
vi.mock("@/lib/image.helpers", () => ({
  convertImageToWebP: async (f: File) => f,
}));

import { UploadField } from "@/app/(admin)/maki-admin/settings/_components/SettingsField";

function Harness({ version }: { version?: string }) {
  const [url, setUrl] = useState<string | null>("logo/logo.webp");
  return (
    <UploadField label="Logo" currentUrl={url} onChange={setUrl} folder="logo" slug="logo" version={version} />
  );
}

beforeEach(() => {
  versionsAction.mockReset();
  uploadMock.mockClear();
});

describe("UploadField önizleme versiyonu", () => {
  it("açılışta R2 ETag versiyonu kullanılır (updated_at'ten öncelikli)", async () => {
    versionsAction.mockResolvedValue({ "logo/logo.webp": "etagA" });
    const { container } = render(<Harness version="2026-01-01" />);
    await waitFor(() =>
      expect(container.querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/logo/logo.webp?v=etagA")
    );
    expect(versionsAction).toHaveBeenCalledWith(["logo/logo.webp"]);
  });

  it("versiyon alınamazsa mevcut davranış: ?v=<updated_at>", async () => {
    versionsAction.mockRejectedValue(new Error("x"));
    const { container } = render(<Harness version="2026-01-01" />);
    await act(async () => {});
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/logo/logo.webp?v=2026-01-01");
  });

  it("upload sonrası yeni versiyon → src değişir; path aynı kalır", async () => {
    versionsAction.mockResolvedValueOnce({ "logo/logo.webp": "etagA" });
    const { container } = render(<Harness />);
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toContain("?v=etagA"));
    versionsAction.mockResolvedValueOnce({ "logo/logo.webp": "etagB" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], "b.webp", { type: "image/webp" })] } });
    });
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toContain("?v=etagB"));
    expect(uploadMock).toHaveBeenCalledWith(
      "tatilinyeri-site-assets",
      "logo/logo.webp",
      expect.anything(),
      { upsert: true, contentType: "image/webp", cacheControl: "3600" }
    );
  });
});
