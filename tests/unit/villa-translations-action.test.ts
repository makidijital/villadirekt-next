/* ===============================================================
   🛡️ PHASE 10A — villa-translations.action.ts TESTLERİ
   ===============================================================
   AMAÇ: saveVillaTranslationAction'ın authorizeAdminSession() İLK
   kontrol olarak çağırdığını, yetkisiz durumda servise/DB'ye HİÇ
   ulaşılmadığını; loadVillaTranslationsAction'ın (sayfa zaten
   middleware korumalı — gallery.action.ts'in loadGalleryImages
   deseniyle AYNI) ekstra auth OLMADAN servise ulaştığını doğrular.

   Mock convention: discount-action.delete.test.ts ile AYNI desen
   (`authorizeAdminSession` module-level mock + beforeEach'te
   mockResolvedValue({ok:true,...})).
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";

const authorizeAdminSessionMock = vi.fn();
const getVillaTranslationsMock = vi.fn();
const upsertVillaTranslationMock = vi.fn();

/* 🛡️ SERVER ACTION AUTHZ — permission kaynağı (admin_users.sidebar_permissions).
   "yetkili oturum" artık AKTİF + "villas" izinli demek. Assertion'lar aynen. */
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

vi.mock("@/app/services/villa-translation.service", () => ({
  getVillaTranslations: (...args: unknown[]) =>
    getVillaTranslationsMock(...args),
  upsertVillaTranslation: (...args: unknown[]) =>
    upsertVillaTranslationMock(...args),
}));

import {
  loadVillaTranslationsAction,
  saveVillaTranslationAction,
} from "@/app/(admin)/maki-admin/villas/[id]/_components/villa-translations.action";

const VILLA_ID = "villa-uuid-1";

beforeEach(() => {
  vi.clearAllMocks();
  findByIdForSessionMock.mockResolvedValue({
    data: { id: "admin-1", is_active: true, sidebar_permissions: ["villas"] },
    error: null,
  });
  authorizeAdminSessionMock.mockResolvedValue({
    ok: true,
    caller: { id: "admin-1" },
  });
});

describe("saveVillaTranslationAction — authorizeAdminSession İLK kontrol", () => {
  it("1) yetkisiz oturum → { ok:false } döner, servis HİÇ çağrılmaz", async () => {
    authorizeAdminSessionMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "unauthorized",
    });

    const result = await saveVillaTranslationAction({
      villaId: VILLA_ID,
      locale: "en",
      description: "Test",
    });

    expect(result).toEqual({ ok: false, error: "Yetkisiz" });
    expect(upsertVillaTranslationMock).not.toHaveBeenCalled();
  });

  it("2) yetkisiz oturum → servise/DB'ye SIFIR yazma çağrısı yapılır", async () => {
    authorizeAdminSessionMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: "unauthorized",
    });

    await saveVillaTranslationAction({
      villaId: VILLA_ID,
      locale: "de",
      description: "Test DE",
    });

    expect(upsertVillaTranslationMock).toHaveBeenCalledTimes(0);
  });

  it("3) yetkili oturum → servise ulaşır, input aynen iletilir", async () => {
    upsertVillaTranslationMock.mockResolvedValueOnce({
      ok: true,
      row: { id: "row-1", villa_id: VILLA_ID, locale: "en" },
    });

    const input = { villaId: VILLA_ID, locale: "en", description: "Test Villa" };
    const result = await saveVillaTranslationAction(input);

    expect(authorizeAdminSessionMock).toHaveBeenCalledTimes(1);
    expect(upsertVillaTranslationMock).toHaveBeenCalledWith(input);
    expect(result).toEqual({
      ok: true,
      row: { id: "row-1", villa_id: VILLA_ID, locale: "en" },
    });
  });

  it("4) servis sonucu (başarı/hata) aynen caller'a geri iletilir", async () => {
    upsertVillaTranslationMock.mockResolvedValueOnce({
      ok: false,
      error: "Villa bulunamadı",
    });

    const result = await saveVillaTranslationAction({
      villaId: "villa-yok",
      locale: "en",
      description: "Test",
    });

    expect(result).toEqual({ ok: false, error: "Villa bulunamadı" });
  });
});

describe("loadVillaTranslationsAction — okuma da \"villas\" izni ister (Server Action authz)", () => {
  it("yetkili admin → authorizeAdminSession çağrılır ve servise ulaşır", async () => {
    getVillaTranslationsMock.mockResolvedValueOnce({ ok: true, rows: [] });

    const result = await loadVillaTranslationsAction(VILLA_ID);

    /* 🛡️ DAVRANIŞ DEĞİŞİKLİĞİ (Server Action authz sprint'i): okuma
       action'ı ARTIK "villas" izni ister. Eski assertion kapatılan
       açığı kodluyordu; gevşetilmedi, TERSİNE ÇEVRİLDİ. */
    expect(authorizeAdminSessionMock).toHaveBeenCalledTimes(1);
    expect(getVillaTranslationsMock).toHaveBeenCalledWith(VILLA_ID);
    expect(result).toEqual({ ok: true, rows: [] });
  });
});
