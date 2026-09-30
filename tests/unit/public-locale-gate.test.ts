/* ===============================================================
   🛡️ PHASE 4A — PUBLIC LOCALE ROUTING CORE: GATE TESTS
   ===============================================================
   Hedef: lib/i18n/public-locale-gate.server.ts (requirePublicLocaleEnabled)

   `next/navigation`'ın notFound() ve `lib/cache.helpers`'ın
   getCachedSettings() çağrıları mock'lanır — gerçek DB/Next request
   context'i KULLANILMAZ (aynı desen: translation-repository.test.ts).
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const getCachedSettingsMock = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));

vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: () => getCachedSettingsMock(),
}));

beforeEach(() => {
  notFoundMock.mockClear();
  getCachedSettingsMock.mockReset();
});

describe("requirePublicLocaleEnabled", () => {
  it("multilingual_enabled=false → notFound() çağrılır (bugünkü production ayarı)", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
    const { requirePublicLocaleEnabled } = await import(
      "@/lib/i18n/public-locale-gate.server"
    );

    await expect(requirePublicLocaleEnabled()).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("multilingual_enabled=null/undefined → notFound() (fail-safe KAPALI, isMultilingualEnabled ile aynı)", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: null });
    const { requirePublicLocaleEnabled } = await import(
      "@/lib/i18n/public-locale-gate.server"
    );

    await expect(requirePublicLocaleEnabled()).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  it("settings okunamıyor (catch) → notFound() (fail-safe KAPALI)", async () => {
    getCachedSettingsMock.mockRejectedValue(new Error("db unreachable"));
    const { requirePublicLocaleEnabled } = await import(
      "@/lib/i18n/public-locale-gate.server"
    );

    await expect(requirePublicLocaleEnabled()).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  it("multilingual_enabled=true → notFound() ÇAĞRILMAZ, sessizce döner", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
    const { requirePublicLocaleEnabled } = await import(
      "@/lib/i18n/public-locale-gate.server"
    );

    await expect(requirePublicLocaleEnabled()).resolves.toBeUndefined();
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
