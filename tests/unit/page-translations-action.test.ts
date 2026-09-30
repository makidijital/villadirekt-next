/* ===============================================================
   🛡️ PHASE 12C — page-translations.action.ts AUTH TESTLERİ
   ===============================================================
   `type-translations-action.test.ts` (Phase 10H) ile BİREBİR AYNI
   desen — yeni test mimarisi İCAT EDİLMEDİ.

   AMAÇ: `savePageTranslationAction`'ın `authorizeAdminSession()`'ı
   İLK kontrol olarak çağırdığını, yetkisiz durumda servise/DB'ye HİÇ
   ulaşılmadığını; `loadPageTranslationsAction`'ın (sayfa zaten
   middleware korumalı) ekstra auth OLMADAN servise ulaştığını
   doğrular.
   =============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";

const authorizeAdminSessionMock = vi.fn();
const getPageTranslationsMock = vi.fn();
const upsertPageTranslationMock = vi.fn();

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

vi.mock("@/app/services/page-translation.service", () => ({
  getPageTranslations: (...args: unknown[]) => getPageTranslationsMock(...args),
  upsertPageTranslation: (...args: unknown[]) =>
    upsertPageTranslationMock(...args),
}));

import {
  loadPageTranslationsAction,
  savePageTranslationAction,
} from "@/app/(admin)/maki-admin/pages/[id]/page-translations.action";

const PAGE_ID = "page-uuid-1";

beforeEach(() => {
  vi.clearAllMocks();
  findByIdForSessionMock.mockResolvedValue({
    data: {
      id: "admin-1",
      is_active: true,
      sidebar_permissions: ["pages"],
    },
    error: null,
  });
  authorizeAdminSessionMock.mockResolvedValue({
    ok: true,
    caller: { id: "admin-1" },
  });
  getPageTranslationsMock.mockResolvedValue({ ok: true, rows: [] });
  upsertPageTranslationMock.mockResolvedValue({ ok: true, row: {} });
});

describe("savePageTranslationAction", () => {
  it("1) yetkisiz oturum → { ok:false, error:'Yetkisiz' }, servis HİÇ çağrılmaz", async () => {
    authorizeAdminSessionMock.mockResolvedValue({ ok: false });
    const result = await savePageTranslationAction({
      pageId: PAGE_ID,
      locale: "en",
      title: "About",
    });
    expect(result).toEqual({ ok: false, error: "Yetkisiz" });
    expect(upsertPageTranslationMock).not.toHaveBeenCalled();
  });

  it("2) yetkisiz oturumda DE için de yazma yapılmaz", async () => {
    authorizeAdminSessionMock.mockResolvedValue({ ok: false });
    const result = await savePageTranslationAction({
      pageId: PAGE_ID,
      locale: "de",
      title: "Über uns",
    });
    expect(result.ok).toBe(false);
    expect(upsertPageTranslationMock).not.toHaveBeenCalled();
  });

  it("3) yetkili oturum → servise AYNEN delege edilir (EN)", async () => {
    const input = {
      pageId: PAGE_ID,
      locale: "en",
      title: "About Us",
      excerpt: "Intro",
      body: "Body",
      seoTitle: "SEO",
      seoDescription: "Meta",
    };
    await savePageTranslationAction(input);
    expect(authorizeAdminSessionMock).toHaveBeenCalledTimes(1);
    expect(upsertPageTranslationMock).toHaveBeenCalledWith(input);
  });

  it("4) yetkili oturum → DE de delege edilir", async () => {
    await savePageTranslationAction({
      pageId: PAGE_ID,
      locale: "de",
      title: "Über uns",
    });
    expect(upsertPageTranslationMock).toHaveBeenCalledWith({
      pageId: PAGE_ID,
      locale: "de",
      title: "Über uns",
    });
  });
});

describe("loadPageTranslationsAction", () => {
  /* 🛡️ DAVRANIŞ DEĞİŞİKLİĞİ (Server Action authz sprint'i): okuma
     action'ı ARTIK "pages" izni ister. Eski assertion ("ekstra auth
     ÇAĞRILMAZ") tam olarak kapatılan açığı kodluyordu; gevşetilmedi,
     TERSİNE ÇEVRİLDİ — delege + sonuç assertion'ları aynen korundu. */
  it("5) okuma action'ı da yetki ister → yetkili admin servise delege edilir", async () => {
    const result = await loadPageTranslationsAction(PAGE_ID);
    expect(authorizeAdminSessionMock).toHaveBeenCalledTimes(1);
    expect(getPageTranslationsMock).toHaveBeenCalledWith(PAGE_ID);
    expect(result).toEqual({ ok: true, rows: [] });
  });
});
