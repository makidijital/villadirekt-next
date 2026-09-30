/* ===============================================================
   🛡️ PHASE 10D — Batch 1 — rule-item-translation.service.ts TESTLERİ
   ===============================================================
   villa-translation-service.test.ts (Phase 10A) ile AYNI desen —
   parent-existence pre-check YOK (rule-item repository'de findById
   yok). Çevrilebilir kolon `title` (`name` DEĞİL).
   translationRepository MOCK'LANIR.
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
  rule_id: "rule-uuid-1",
  locale: "en",
  title: "Test Rule",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  findAllForParentMock.mockReset();
  upsertOneMock.mockReset();

  upsertOneMock.mockResolvedValue({ data: VALID_ROW, error: null });
  findAllForParentMock.mockResolvedValue({ data: [], error: null });
});

describe("upsertRuleTranslation", () => {
  it("EN upsert — geçerli girdi repository.upsertOne'a doğru argümanlarla ulaşır", async () => {
    const { upsertRuleTranslation } = await import(
      "@/app/services/rule-item-translation.service"
    );

    const result = await upsertRuleTranslation({
      ruleId: "rule-uuid-1",
      locale: "en",
      title: "Test Rule",
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith(
      "rule_item",
      "rule-uuid-1",
      "en",
      { title: "Test Rule" }
    );
  });

  it("DE upsert — geçerli girdi repository.upsertOne'a doğru argümanlarla ulaşır", async () => {
    const { upsertRuleTranslation } = await import(
      "@/app/services/rule-item-translation.service"
    );

    const result = await upsertRuleTranslation({
      ruleId: "rule-uuid-1",
      locale: "de",
      title: "Test Regel",
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith(
      "rule_item",
      "rule-uuid-1",
      "de",
      { title: "Test Regel" }
    );
  });

  it("mevcut EN çeviriyi günceller", async () => {
    const { upsertRuleTranslation } = await import(
      "@/app/services/rule-item-translation.service"
    );

    await upsertRuleTranslation({ ruleId: "rule-uuid-1", locale: "en", title: "V1" });
    await upsertRuleTranslation({ ruleId: "rule-uuid-1", locale: "en", title: "V2 güncel" });

    expect(upsertOneMock).toHaveBeenCalledTimes(2);
    expect(upsertOneMock).toHaveBeenLastCalledWith(
      "rule_item",
      "rule-uuid-1",
      "en",
      { title: "V2 güncel" }
    );
  });

  it("locale 'fr' reddedilir — repository çağrılmaz", async () => {
    const { upsertRuleTranslation } = await import(
      "@/app/services/rule-item-translation.service"
    );

    const result = await upsertRuleTranslation({
      ruleId: "rule-uuid-1",
      locale: "fr",
      title: "Règle",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("locale 'tr' reddedilir", async () => {
    const { upsertRuleTranslation } = await import(
      "@/app/services/rule-item-translation.service"
    );

    const result = await upsertRuleTranslation({
      ruleId: "rule-uuid-1",
      locale: "tr",
      title: "Türkçe Başlık",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("boş/geçersiz ruleId reddedilir — repository çağrılmaz", async () => {
    const { upsertRuleTranslation } = await import(
      "@/app/services/rule-item-translation.service"
    );

    const result = await upsertRuleTranslation({
      ruleId: "   ",
      locale: "en",
      title: "Test",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("boş başlık reddedilir (trim sonrası boş)", async () => {
    const { upsertRuleTranslation } = await import(
      "@/app/services/rule-item-translation.service"
    );

    const result = await upsertRuleTranslation({
      ruleId: "rule-uuid-1",
      locale: "en",
      title: "   ",
    });

    expect(result.ok).toBe(false);
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("geçerli girdi repository'ye başarıyla ulaşır ve { ok: true, row } döner", async () => {
    const { upsertRuleTranslation } = await import(
      "@/app/services/rule-item-translation.service"
    );

    const result = await upsertRuleTranslation({
      ruleId: "rule-uuid-1",
      locale: "en",
      title: "Test Rule",
    });

    expect(result).toEqual({ ok: true, row: VALID_ROW });
  });
});

describe("getRuleTranslations", () => {
  it("yalnız en/de satırlarını döner (tr varsa filtrelenir)", async () => {
    findAllForParentMock.mockResolvedValueOnce({
      data: [
        { ...VALID_ROW, locale: "tr" },
        { ...VALID_ROW, locale: "en" },
        { ...VALID_ROW, locale: "de" },
      ],
      error: null,
    });

    const { getRuleTranslations } = await import(
      "@/app/services/rule-item-translation.service"
    );

    const result = await getRuleTranslations("rule-uuid-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.map((r) => r.locale).sort()).toEqual(["de", "en"]);
    }
  });

  it("boş/geçersiz ruleId reddedilir — repository çağrılmaz", async () => {
    const { getRuleTranslations } = await import(
      "@/app/services/rule-item-translation.service"
    );

    const result = await getRuleTranslations("   ");

    expect(result.ok).toBe(false);
    expect(findAllForParentMock).not.toHaveBeenCalled();
  });
});
