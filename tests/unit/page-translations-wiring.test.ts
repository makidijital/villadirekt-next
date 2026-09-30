/* ===============================================================
   🛡️ PHASE 12C — PAGES ÇEVİRİ ZİNCİRİ: UÇTAN UCA WIRING TESTİ
   ===============================================================
   AMAÇ: "Çeviri gerçekten girilip kaydedilebiliyor mu?" sorusunu,
   yalnız EN ALT katmanı (`dbNative` / `dbAdminNative`) mock'layarak
   doğrulamak. Bu testte GERÇEK kod çalışır:

     savePageTranslationAction  (server action)
       → upsertPageTranslation  (servis: validation + normalize)
         → translationRepository.upsertOne  (generic repository)
           → db.from("page_translations").upsert(...)   ← burada mock

   Böylece tablo adı, FK kolonu, kolon isimleri ve `onConflict`
   migration 082 ile BİREBİR mi doğrulanır. Gerçek DB bağlantısı bu
   ortamdan erişilebilir DEĞİL (DNS/egress kapalı) — bu yüzden
   `translation-repository.test.ts` ile AYNI mock-katman prensibi
   kullanıldı; yeni bir test mimarisi İCAT EDİLMEDİ.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  TRANSLATION_ENTITY_CONFIG,
  type PageTranslationRow,
} from "@/lib/i18n/translations.types";

/* ---------- auth: yetkili ---------- */
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
  authorizeAdminSession: (...a: unknown[]) => authorizeAdminSessionMock(...a),
}));

/* ---------- EN ALT KATMAN: native db ---------- */
const fromMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const upsertMock = vi.fn();
const singleMock = vi.fn();
const maybeSingleMock = vi.fn();

const adminFromMock = vi.fn();
const adminSelectMock = vi.fn();
const adminEqMock = vi.fn();
const adminMaybeSingleMock = vi.fn();

vi.mock("@/lib/db/native", () => ({
  dbNative: { from: (...a: unknown[]) => fromMock(...a) },
  dbAdminNative: { from: (...a: unknown[]) => adminFromMock(...a) },
}));

const PAGE_ID = "page-uuid-1";

const SAVED_ROW: PageTranslationRow = {
  id: "row-1",
  page_id: PAGE_ID,
  locale: "en",
  title: "An Unforgettable Holiday in Kas",
  body: "EN body",
  excerpt: "EN excerpt",
  seo_title: "EN seo",
  seo_description: "EN seo desc",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

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

  /* translation tablosu zinciri: from → upsert → select → single
     ve from → select → eq (findAllForParent, thenable). */
  const chain: Record<string, unknown> = {};
  chain.select = (...a: unknown[]) => {
    selectMock(...a);
    return chain;
  };
  chain.eq = (...a: unknown[]) => {
    eqMock(...a);
    return chain;
  };
  chain.upsert = (...a: unknown[]) => {
    upsertMock(...a);
    return chain;
  };
  chain.single = (...a: unknown[]) => {
    singleMock(...a);
    return Promise.resolve({ data: SAVED_ROW, error: null });
  };
  chain.maybeSingle = (...a: unknown[]) => {
    maybeSingleMock(...a);
    return Promise.resolve({ data: null, error: null });
  };
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [SAVED_ROW], error: null }).then(resolve);
  fromMock.mockReturnValue(chain);

  /* pages tablosu zinciri (parent existence pre-check). */
  const adminChain: Record<string, unknown> = {};
  adminChain.select = (...a: unknown[]) => {
    adminSelectMock(...a);
    return adminChain;
  };
  adminChain.eq = (...a: unknown[]) => {
    adminEqMock(...a);
    return adminChain;
  };
  adminChain.maybeSingle = (...a: unknown[]) => {
    adminMaybeSingleMock(...a);
    return Promise.resolve({ data: { id: PAGE_ID }, error: null });
  };
  adminFromMock.mockReturnValue(adminChain);
});

describe("Phase 12C — registry", () => {
  it("`page` entity migration 082 ile eşleşiyor", () => {
    expect(TRANSLATION_ENTITY_CONFIG.page).toEqual({
      table: "page_translations",
      parentIdColumn: "page_id",
    });
  });
});

describe("Phase 12C — EN çeviri kaydı uçtan uca", () => {
  it("action → servis → repository → page_translations UPSERT", async () => {
    const { savePageTranslationAction } = await import(
      "@/app/(admin)/maki-admin/pages/[id]/page-translations.action"
    );

    const result = await savePageTranslationAction({
      pageId: PAGE_ID,
      locale: "en",
      title: "  An Unforgettable Holiday in Kas  ",
      excerpt: "EN excerpt",
      body: "EN body",
      seoTitle: "EN seo",
      seoDescription: "EN seo desc",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row).toEqual(SAVED_ROW);

    /* parent existence pre-check GERÇEKTEN çalıştı */
    expect(adminFromMock).toHaveBeenCalledWith("pages");
    expect(adminEqMock).toHaveBeenCalledWith("id", PAGE_ID);

    /* doğru tablo */
    expect(fromMock).toHaveBeenCalledWith("page_translations");

    /* doğru payload — trim uygulanmış, migration 082 kolon adları */
    expect(upsertMock).toHaveBeenCalledWith(
      {
        page_id: PAGE_ID,
        locale: "en",
        title: "An Unforgettable Holiday in Kas",
        excerpt: "EN excerpt",
        body: "EN body",
        seo_title: "EN seo",
        seo_description: "EN seo desc",
      },
      { onConflict: "page_id,locale" }
    );
    expect(selectMock).toHaveBeenCalledWith("*");
    expect(singleMock).toHaveBeenCalled();
  });

  it("DE çevirisi de aynı tabloya locale='de' ile yazılır", async () => {
    const { savePageTranslationAction } = await import(
      "@/app/(admin)/maki-admin/pages/[id]/page-translations.action"
    );

    await savePageTranslationAction({
      pageId: PAGE_ID,
      locale: "de",
      title: "Ein unvergesslicher Urlaub in Kaş",
    });

    expect(fromMock).toHaveBeenCalledWith("page_translations");
    expect(upsertMock).toHaveBeenCalledWith(
      {
        page_id: PAGE_ID,
        locale: "de",
        title: "Ein unvergesslicher Urlaub in Kaş",
        excerpt: null,
        body: null,
        seo_title: null,
        seo_description: null,
      },
      { onConflict: "page_id,locale" }
    );
  });

  it("yetkisiz oturumda DB'ye HİÇ gidilmez", async () => {
    authorizeAdminSessionMock.mockResolvedValue({ ok: false });
    const { savePageTranslationAction } = await import(
      "@/app/(admin)/maki-admin/pages/[id]/page-translations.action"
    );

    const result = await savePageTranslationAction({
      pageId: PAGE_ID,
      locale: "en",
      title: "x",
    });

    expect(result).toEqual({ ok: false, error: "Yetkisiz" });
    expect(fromMock).not.toHaveBeenCalled();
    expect(adminFromMock).not.toHaveBeenCalled();
  });

  it("locale='tr' DB'ye ulaşmaz (TR canonical korunur)", async () => {
    const { savePageTranslationAction } = await import(
      "@/app/(admin)/maki-admin/pages/[id]/page-translations.action"
    );

    const result = await savePageTranslationAction({
      pageId: PAGE_ID,
      locale: "tr",
      title: "Hakkımızda",
    });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
    expect(adminFromMock).not.toHaveBeenCalled();
  });
});

describe("Phase 12C — kayıtlı çevirilerin okunması uçtan uca", () => {
  it("load → page_translations SELECT … WHERE page_id = $1", async () => {
    const { loadPageTranslationsAction } = await import(
      "@/app/(admin)/maki-admin/pages/[id]/page-translations.action"
    );

    const result = await loadPageTranslationsAction(PAGE_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([SAVED_ROW]);
    expect(fromMock).toHaveBeenCalledWith("page_translations");
    expect(selectMock).toHaveBeenCalledWith("*");
    expect(eqMock).toHaveBeenCalledWith("page_id", PAGE_ID);
    /* 🛡️ DAVRANIŞ DEĞİŞİKLİĞİ (Server Action authz sprint'i): okuma
       yolu ARTIK "pages" izni ister. Eski assertion kapatılan açığı
       kodluyordu; gevşetilmedi, TERSİNE ÇEVRİLDİ. */
    expect(authorizeAdminSessionMock).toHaveBeenCalledTimes(1);
  });
});
