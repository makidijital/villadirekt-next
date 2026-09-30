/* ===============================================================
   🛡️ PHASE 10D — Batch 1 — villa-feature-translation.service.ts TESTLERİ
   ===============================================================
   villa-translation-service.test.ts (Phase 10A) ile AYNI desen —
   parent-existence pre-check YOK (villa-feature repository'de findById
   yok). translationRepository MOCK'LANIR.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const findAllForParentMock = vi.fn();
const upsertOneMock = vi.fn();

vi.mock("@/lib/db/translation.repository.server", () => ({
  translationRepository: {
    findAllForParent: (...args: unknown[]) => findAllForParentMock(...args),
    upsertOne: (...args: unknown[]) => upsertOneMock(...args),
  },
}));

const VALID_ROW = {
  id: "row-1",
  feature_id: "feature-uuid-1",
  locale: "en",
  name: "Test Feature",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  findAllForParentMock.mockReset();
  upsertOneMock.mockReset();

  upsertOneMock.mockResolvedValue({ data: VALID_ROW, error: null });
  findAllForParentMock.mockResolvedValue({ data: [], error: null });
});

describe("upsertFeatureTranslation", () => {
  it("EN upsert — geçerli girdi repository.upsertOne'a doğru argümanlarla ulaşır", async () => {
    const { upsertFeatureTranslation } = await import(
      "@/app/services/villa-feature-translation.service"
    );

    const result = await upsertFeatureTranslation({
      featureId: "feature-uuid-1",
      locale: "en",
      name: "Test Feature",
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith(
      "villa_feature",
      "feature-uuid-1",
      "en",
      { name: "Test Feature" }
    );
  });

  it("DE upsert — geçerli girdi repository.upsertOne'a doğru argümanlarla ulaşır", async () => {
    const { upsertFeatureTranslation } = await import(
      "@/app/services/villa-feature-translation.service"
    );

    const result = await upsertFeatureTranslation({
      featureId: "feature-uuid-1",
      locale: "de",
      name: "Test Merkmal",
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith(
      "villa_feature",
      "feature-uuid-1",
      "de",
      { name: "Test Merkmal" }
    );
  });

  it("mevcut EN çeviriyi günceller", async () => {
    const { upsertFeatureTranslation } = await import(
      "@/app/services/villa-feature-translation.service"
    );

    await upsertFeatureTranslation({ featureId: "feature-uuid-1", locale: "en", name: "V1" });
    await upsertFeatureTranslation({ featureId: "feature-uuid-1", locale: "en", name: "V2 güncel" });

    expect(upsertOneMock).toHaveBeenCalledTimes(2);
    expect(upsertOneMock).toHaveBeenLastCalledWith(
      "villa_feature",
      "feature-uuid-1",
      "en",
      { name: "V2 güncel" }
    );
  });

  it("locale 'fr' reddedilir — repository çağrılmaz", async () => {
    const { upsertFeatureTranslation } = await import(
      "@/app/services/villa-feature-translation.service"
    );

    const result = await upsertFeatureTranslation({
      featureId: "feature-uuid-1",
      locale: "fr",
      name: "Caractéristique",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("locale 'tr' reddedilir", async () => {
    const { upsertFeatureTranslation } = await import(
      "@/app/services/villa-feature-translation.service"
    );

    const result = await upsertFeatureTranslation({
      featureId: "feature-uuid-1",
      locale: "tr",
      name: "Türkçe İsim",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("boş/geçersiz featureId reddedilir — repository çağrılmaz", async () => {
    const { upsertFeatureTranslation } = await import(
      "@/app/services/villa-feature-translation.service"
    );

    const result = await upsertFeatureTranslation({
      featureId: "   ",
      locale: "en",
      name: "Test",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("boş isim reddedilir (trim sonrası boş)", async () => {
    const { upsertFeatureTranslation } = await import(
      "@/app/services/villa-feature-translation.service"
    );

    const result = await upsertFeatureTranslation({
      featureId: "feature-uuid-1",
      locale: "en",
      name: "   ",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("geçerli girdi repository'ye başarıyla ulaşır ve { ok: true, row } döner", async () => {
    const { upsertFeatureTranslation } = await import(
      "@/app/services/villa-feature-translation.service"
    );

    const result = await upsertFeatureTranslation({
      featureId: "feature-uuid-1",
      locale: "en",
      name: "Test Feature",
    });

    expect(result).toEqual({ ok: true, row: VALID_ROW });
  });
});

describe("getFeatureTranslations", () => {
  it("yalnız en/de satırlarını döner (tr varsa filtrelenir)", async () => {
    findAllForParentMock.mockResolvedValueOnce({
      data: [
        { ...VALID_ROW, locale: "tr" },
        { ...VALID_ROW, locale: "en" },
        { ...VALID_ROW, locale: "de" },
      ],
      error: null,
    });

    const { getFeatureTranslations } = await import(
      "@/app/services/villa-feature-translation.service"
    );

    const result = await getFeatureTranslations("feature-uuid-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.map((r) => r.locale).sort()).toEqual(["de", "en"]);
    }
  });

  it("boş/geçersiz featureId reddedilir — repository çağrılmaz", async () => {
    const { getFeatureTranslations } = await import(
      "@/app/services/villa-feature-translation.service"
    );

    const result = await getFeatureTranslations("   ");

    expect(result.ok).toBe(false);
    expect(findAllForParentMock).not.toHaveBeenCalled();
  });
});
