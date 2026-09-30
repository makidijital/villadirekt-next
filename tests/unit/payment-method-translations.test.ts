/* ===============================================================
   🛡️ MIGRATION 088 — ÖDEME YÖNTEMİ ÇEVİRİLERİ (servis + action + şema)
   ===============================================================
   Mock convention: `type-translations-action.test.ts` (Phase 10H) ve
   `translation-schema.test.ts` (Phase 3) ile AYNI desen — yeni bir test
   mimarisi İCAT EDİLMEDİ. Canlı DB KULLANILMAZ.

   Mevcut price-engine / reservation / *OrchestrationContract
   testlerine HİÇ dokunulmadı.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* ---------------- Mocks ---------------- */

const upsertOneMock = vi.fn();
const findAllForParentMock = vi.fn();

vi.mock("@/lib/db/translation.repository.server", () => ({
  translationRepository: {
    upsertOne: (...args: unknown[]) => upsertOneMock(...args),
    findAllForParent: (...args: unknown[]) => findAllForParentMock(...args),
  },
}));

const authorizeAdminSessionMock = vi.fn();
/* 🛡️ SERVER ACTION AUTHZ — permission kaynağı (admin_users.sidebar_permissions).
   Action'lara eklenen izin kontrolü bu mevcut repository fonksiyonunu okur;
   testte "yetkili admin" artık AKTİF + İZİNLİ demek. Assertion'lar aynen kaldı. */
const findByIdForSessionMock = vi.fn();
vi.mock("@/lib/db/admin-user.repository.server", () => ({
  adminUserServerRepository: {
    findByIdForSession: (...a: unknown[]) => findByIdForSessionMock(...a),
  },
}));

vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminSession: (...args: unknown[]) =>
    authorizeAdminSessionMock(...args),
}));

import {
  getPaymentMethodTranslations,
  upsertPaymentMethodTranslation,
} from "@/app/services/payment-method-translation.service";
import {
  loadPaymentMethodTranslationsAction,
  savePaymentMethodTranslationAction,
} from "@/app/(admin)/maki-admin/payment-methods/payment-method-translations.action";
import { TRANSLATION_ENTITY_CONFIG } from "@/lib/i18n/translations.types";

const PM_ID = "pm-uuid-1";

beforeEach(() => {
  vi.clearAllMocks();
  findByIdForSessionMock.mockResolvedValue({
    data: {
      id: "admin-1",
      is_active: true,
      sidebar_permissions: ["payment_methods"],
    },
    error: null,
  });
  authorizeAdminSessionMock.mockResolvedValue({
    ok: true,
    caller: { id: "admin-1" },
  });
  upsertOneMock.mockResolvedValue({
    data: {
      id: "t-1",
      payment_method_id: PM_ID,
      locale: "en",
      name: "Credit Card",
    },
    error: null,
  });
  findAllForParentMock.mockResolvedValue({ data: [], error: null });
});

/* ===============================================================
   1) SERVİS
   =============================================================== */

describe("upsertPaymentMethodTranslation", () => {
  it("1) generic translationRepository'yi 'payment_method' entity'siyle çağırır", async () => {
    await upsertPaymentMethodTranslation({
      paymentMethodId: PM_ID,
      locale: "en",
      name: "Credit Card",
    });

    expect(upsertOneMock).toHaveBeenCalledTimes(1);
    expect(upsertOneMock).toHaveBeenCalledWith("payment_method", PM_ID, "en", {
      name: "Credit Card",
    });
  });

  it("2) boş/whitespace değer HATA DEĞİL — null yazılır (TR fallback)", async () => {
    upsertOneMock.mockResolvedValue({
      data: { id: "t-1", payment_method_id: PM_ID, locale: "de", name: null },
      error: null,
    });

    const result = await upsertPaymentMethodTranslation({
      paymentMethodId: PM_ID,
      locale: "de",
      name: "   ",
    });

    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledWith("payment_method", PM_ID, "de", {
      name: null,
    });
  });

  it("3) değer trim edilir", async () => {
    await upsertPaymentMethodTranslation({
      paymentMethodId: PM_ID,
      locale: "en",
      name: "  Credit Card  ",
    });

    expect(upsertOneMock).toHaveBeenCalledWith("payment_method", PM_ID, "en", {
      name: "Credit Card",
    });
  });

  it.each(["tr", "fr", "", null, undefined])(
    "4) yazılabilir olmayan locale (%s) reddedilir — DB'ye HİÇ gidilmez",
    async (locale) => {
      const result = await upsertPaymentMethodTranslation({
        paymentMethodId: PM_ID,
        locale: locale as unknown as string,
        name: "X",
      });

      expect(result.ok).toBe(false);
      expect(upsertOneMock).not.toHaveBeenCalled();
    }
  );

  it("5) boş paymentMethodId reddedilir — DB'ye HİÇ gidilmez", async () => {
    const result = await upsertPaymentMethodTranslation({
      paymentMethodId: "   ",
      locale: "en",
      name: "X",
    });

    expect(result).toEqual({ ok: false, error: "Geçersiz ödeme yöntemi" });
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("6) repository hatası → { ok:false } (throw YOK)", async () => {
    upsertOneMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await upsertPaymentMethodTranslation({
      paymentMethodId: PM_ID,
      locale: "en",
      name: "Credit Card",
    });

    expect(result).toEqual({ ok: false, error: "Çeviri kaydedilemedi" });
  });
});

describe("getPaymentMethodTranslations", () => {
  it("7) 'payment_method' entity'siyle okur", async () => {
    await getPaymentMethodTranslations(PM_ID);
    expect(findAllForParentMock).toHaveBeenCalledWith("payment_method", PM_ID);
  });

  it("8) yalnız en/de satırları döner (tr filtrelenir)", async () => {
    findAllForParentMock.mockResolvedValue({
      data: [
        { locale: "tr", name: "Kredi Kartı" },
        { locale: "en", name: "Credit Card" },
        { locale: "de", name: "Kreditkarte" },
      ],
      error: null,
    });

    const result = await getPaymentMethodTranslations(PM_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((r) => r.locale)).toEqual(["en", "de"]);
  });

  it("9) okuma hatası → { ok:false }", async () => {
    findAllForParentMock.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const result = await getPaymentMethodTranslations(PM_ID);
    expect(result).toEqual({ ok: false, error: "Çeviriler okunamadı" });
  });
});

/* ===============================================================
   2) SERVER ACTION — auth ilk kontrol
   =============================================================== */

describe("savePaymentMethodTranslationAction — authorizeAdminSession İLK", () => {
  it("10) yetkisiz → { ok:false, error:'Yetkisiz' }, DB'ye HİÇ ulaşılmaz", async () => {
    authorizeAdminSessionMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "unauthorized",
    });

    const result = await savePaymentMethodTranslationAction({
      paymentMethodId: PM_ID,
      locale: "en",
      name: "Credit Card",
    });

    expect(result).toEqual({ ok: false, error: "Yetkisiz" });
    expect(upsertOneMock).not.toHaveBeenCalled();
  });

  it("11) yetkili → servise delege eder", async () => {
    const result = await savePaymentMethodTranslationAction({
      paymentMethodId: PM_ID,
      locale: "en",
      name: "Credit Card",
    });

    expect(authorizeAdminSessionMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(upsertOneMock).toHaveBeenCalledTimes(1);
  });

  /* 🛡️ DAVRANIŞ DEĞİŞİKLİĞİ (Server Action authz sprint'i): okuma
     action'ı ARTIK "payment_methods" izni ister. Eski assertion
     ("ekstra auth GEREKTİRMEZ") kapatılan açığı kodluyordu; gevşetilmedi,
     TERSİNE ÇEVRİLDİ — servis çağrısı assertion'ı aynen korundu. */
  it("12) okuma action'ı da yetki ister → yetkili admin servise delege edilir", async () => {
    await loadPaymentMethodTranslationsAction(PM_ID);

    expect(authorizeAdminSessionMock).toHaveBeenCalledTimes(1);
    expect(findAllForParentMock).toHaveBeenCalledTimes(1);
  });
});

/* ===============================================================
   3) ENTITY REGISTRY + MIGRATION 088 ŞEMASI
   =============================================================== */

describe("payment_method entity — registry", () => {
  it("13) TRANSLATION_ENTITY_CONFIG doğru tablo/kolonu taşır", () => {
    expect(TRANSLATION_ENTITY_CONFIG.payment_method).toEqual({
      table: "payment_method_translations",
      parentIdColumn: "payment_method_id",
    });
  });
});

describe("migration 088 — payment_method_translations şeması", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "db/migrations/088_payment_method_translations.sql"),
    "utf-8"
  );

  it("14) CREATE TABLE IF NOT EXISTS (idempotent)", () => {
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS public.payment_method_translations"
    );
  });

  it("15) parent FK + ON DELETE CASCADE", () => {
    expect(sql).toMatch(
      /payment_method_id\s+uuid NOT NULL REFERENCES public\.payment_methods \(id\) ON DELETE CASCADE/
    );
  });

  it("16) locale CHECK (tr/en/de)", () => {
    expect(sql).toContain("CHECK (locale IN ('tr', 'en', 'de'))");
  });

  it("17) UNIQUE (payment_method_id, locale)", () => {
    expect(sql).toContain("UNIQUE (payment_method_id, locale)");
  });

  it("18) touch trigger REUSE (yeni fonksiyon adı YOK)", () => {
    expect(sql).toContain("EXECUTE FUNCTION public.trg_touch_updated_at()");
    expect(sql).toContain(
      "DROP TRIGGER IF EXISTS payment_method_translations_touch_updated_at"
    );
  });

  it("19) `name` nullable (boşsa TR fallback)", () => {
    expect(sql).toMatch(/\n\s*name\s+text,\n/);
  });

  it("20) payment_methods tablosuna ALTER/UPDATE YOK (additive)", () => {
    const body = sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(body).not.toMatch(/ALTER TABLE\s+public\.payment_methods/i);
    expect(body).not.toMatch(/UPDATE\s+public\.payment_methods/i);
    expect(body).not.toMatch(/INSERT INTO\s+public\.payment_method_translations/i);
  });
});
