/* ===============================================================
   🛡️ PHASE 10L — settings-translations.action.ts AUTH + CACHE TESTLERİ
   ===============================================================
   `tests/unit/type-translations-action.test.ts` (Phase 10H) ile
   BİREBİR AYNI mock deseni.

   KANITLANAN (§4/§11/§13):
     • Yazma action'ı `authorizeAdminSession()`'ı İLK çağırır;
       yetkisizde servise/DB'ye HİÇ ulaşılmaz.
     • `revalidateSettings()` YALNIZ başarılı yazmadan sonra çağrılır
       ve tag "settings" (yeni cache sistemi/tag YOK).
     • Okuma action'ı (sayfa middleware korumalı) ekstra auth
       ÇAĞIRMAZ.

   ⚠️ Production kodu test için GEVŞETİLMEDİ.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const authorizeAdminSessionMock = vi.fn();
const getSettingsTranslationsMock = vi.fn();
const upsertSettingsTranslationMock = vi.fn();
const deleteSettingsTranslationMock = vi.fn();
const revalidateSettingsMock = vi.fn();

/* 🛡️ SERVER ACTION AUTHZ — permission kaynağı (admin_users.sidebar_permissions).
   "yetkili oturum" artık AKTİF + "settings" izinli demek. Assertion'lar aynen. */
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

vi.mock("@/app/services/settings-translation.service", () => ({
  getSettingsTranslations: (...args: unknown[]) =>
    getSettingsTranslationsMock(...args),
  upsertSettingsTranslation: (...args: unknown[]) =>
    upsertSettingsTranslationMock(...args),
  deleteSettingsTranslation: (...args: unknown[]) =>
    deleteSettingsTranslationMock(...args),
}));

vi.mock("@/app/services/revalidate.actions", () => ({
  revalidateSettings: (...args: unknown[]) => revalidateSettingsMock(...args),
}));

import {
  loadSettingsTranslationsAction,
  saveSettingsTranslation,
  deleteSettingsTranslationAction,
} from "@/app/(admin)/maki-admin/settings/ceviriler/settings-translations.action";

const OK_VALUES = {
  footer_copyright: "© {year} {site_name} · All rights reserved",
  default_meta_title: null,
  default_meta_description: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  findByIdForSessionMock.mockResolvedValue({
    data: {
      id: "admin-1",
      is_active: true,
      sidebar_permissions: ["settings"],
    },
    error: null,
  });
  authorizeAdminSessionMock.mockResolvedValue({
    ok: true,
    caller: { id: "admin-1" },
  });
  upsertSettingsTranslationMock.mockResolvedValue({
    ok: true,
    locale: "en",
    values: OK_VALUES,
  });
  deleteSettingsTranslationMock.mockResolvedValue({ ok: true });
  getSettingsTranslationsMock.mockResolvedValue({ ok: true, translations: {} });
  revalidateSettingsMock.mockResolvedValue(undefined);
});

describe("saveSettingsTranslation — auth İLK kontrol", () => {
  it("1) yetkisiz oturum → { ok:false, error:'Yetkisiz' }; servis ÇAĞRILMAZ", async () => {
    authorizeAdminSessionMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "Oturum bulunamadı",
    });

    const result = await saveSettingsTranslation({
      locale: "en",
      footer_copyright: "X",
    });

    expect(result).toEqual({ ok: false, error: "Yetkisiz" });
    expect(upsertSettingsTranslationMock).not.toHaveBeenCalled();
  });

  it("2) yetkisiz oturumda cache DE invalidate edilmez", async () => {
    authorizeAdminSessionMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "forbidden",
    });
    await saveSettingsTranslation({ locale: "de", footer_copyright: "X" });
    expect(revalidateSettingsMock).not.toHaveBeenCalled();
  });

  it("3) yetkili oturum → servise AYNEN delege", async () => {
    const input = {
      locale: "en",
      footer_copyright: "A",
      default_meta_title: "C",
      default_meta_description: "D",
    };
    const result = await saveSettingsTranslation(input);

    expect(authorizeAdminSessionMock).toHaveBeenCalledTimes(1);
    expect(upsertSettingsTranslationMock).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: true, locale: "en", values: OK_VALUES });
  });
});

describe("saveSettingsTranslation — cache invalidation (§11)", () => {
  it("4) başarılı yazma → revalidateSettings() TAM 1 kez", async () => {
    await saveSettingsTranslation({ locale: "en", footer_copyright: "A" });
    expect(revalidateSettingsMock).toHaveBeenCalledTimes(1);
  });

  it("5) servis hata döndürürse revalidate ÇAĞRILMAZ", async () => {
    upsertSettingsTranslationMock.mockResolvedValueOnce({
      ok: false,
      error: "Çeviri kaydedilemedi",
    });
    const result = await saveSettingsTranslation({
      locale: "en",
      footer_copyright: "A",
    });
    expect(result.ok).toBe(false);
    expect(revalidateSettingsMock).not.toHaveBeenCalled();
  });

  it("6) EN ve DE bağımsız kaydedilir (iki ayrı çağrı, iki ayrı invalidate)", async () => {
    await saveSettingsTranslation({ locale: "en", footer_copyright: "EN" });
    await saveSettingsTranslation({ locale: "de", footer_copyright: "DE" });

    expect(upsertSettingsTranslationMock).toHaveBeenNthCalledWith(1, {
      locale: "en",
      footer_copyright: "EN",
    });
    expect(upsertSettingsTranslationMock).toHaveBeenNthCalledWith(2, {
      locale: "de",
      footer_copyright: "DE",
    });
    expect(revalidateSettingsMock).toHaveBeenCalledTimes(2);
  });
});

describe("deleteSettingsTranslationAction", () => {
  it("7) yetkisizde silme yapılmaz", async () => {
    authorizeAdminSessionMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "x",
    });
    const result = await deleteSettingsTranslationAction("en");
    expect(result).toEqual({ ok: false, error: "Yetkisiz" });
    expect(deleteSettingsTranslationMock).not.toHaveBeenCalled();
  });

  it("8) başarılı silme → revalidateSettings()", async () => {
    await deleteSettingsTranslationAction("en");
    expect(revalidateSettingsMock).toHaveBeenCalledTimes(1);
  });
});

describe("loadSettingsTranslationsAction — okuma", () => {
  /* 🛡️ DAVRANIŞ DEĞİŞİKLİĞİ (Server Action authz sprint'i): okuma
     action'ı ARTIK "settings" izni ister. Eski assertion ("ekstra auth
     ÇAĞRILMAZ") tam olarak kapatılan açığı kodluyordu; gevşetilmedi,
     TERSİNE ÇEVRİLDİ — delege + sonuç assertion'ları aynen korundu. */
  it("9) okuma action'ı da yetki ister → yetkili admin servise delege edilir", async () => {
    const result = await loadSettingsTranslationsAction();
    expect(authorizeAdminSessionMock).toHaveBeenCalledTimes(1);
    expect(getSettingsTranslationsMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, translations: {} });
  });
});

/* ===============================================================
   §11 — CACHE TAG DEĞİŞMEDİ (regresyon kilidi)
   =============================================================== */
describe("revalidate.actions — 'settings' tag'i DEĞİŞMEDİ", () => {
  it("10) revalidateSettings kaynak metni 'settings' tag'ini kullanır, YENİ tag EKLENMEDİ", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(
      join(process.cwd(), "app/services/revalidate.actions.ts"),
      "utf-8"
    );
    /* 🔄 İkinci argüman `"max"` → `{ expire: 0 }` olarak düzeltildi
       (Next 16.2.4'te "max" purge etmiyor, expire'ı 1 yıl ileri
       atıyordu). Testin AMACI aynı: "settings" tag'i kullanılıyor,
       yeni tag icat edilmedi. Ayrıntılı sözleşme:
       tests/unit/revalidate-actions-invalidation.test.ts */
    expect(src).toMatch(/revalidateTag\("settings", \{ expire: 0 \}\)/);
    expect(src).not.toMatch(/settings-translations/);
    expect(src).not.toMatch(/settings_translations/);
  });
});
