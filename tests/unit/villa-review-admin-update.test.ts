/* ===============================================================
   🛡️ ADMIN MEVCUT YORUM DÜZENLEME — updateVillaReviewByAdmin
   ===============================================================
   KAPSAM (kullanıcı senaryoları 6-21):
     • Sadece tarih / geçmiş / bugün → başarılı; yarın / geçersiz → RED
     • update payload'ında created_at bulunur (tarih değişince)
     • Diğer alanlar (ad/puan/yorum) mevcut validasyonla korunur
     • is_featured / is_approved / approved_at / villa_id ASLA yazılmaz
     • AUTH: reviews izni yoksa service ve repository'ye ULAŞILMAZ
     • REGRESYON: public createVillaReview + createVillaReviewAction
       + homepage newest-10 + approve/delete/featured bozulmadı

   ⚠️ Sabit saat: bugün = 22.09.2026 (Istanbul). Testler gerçek
     takvimden BAĞIMSIZ.
=============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const updateByIdMock = vi.fn();
const insertMock = vi.fn();
const deleteByIdMock = vi.fn();
const findFeaturedStateByIdMock = vi.fn();
const clearFeaturedByVillaMock = vi.fn();

vi.mock("@/lib/db/villa-review.repository.server", () => ({
  villaReviewServerRepository: {
    updateById: (...a: unknown[]) => updateByIdMock(...a),
    insert: (...a: unknown[]) => insertMock(...a),
    deleteById: (...a: unknown[]) => deleteByIdMock(...a),
    findFeaturedStateById: (...a: unknown[]) =>
      findFeaturedStateByIdMock(...a),
    clearFeaturedByVilla: (...a: unknown[]) => clearFeaturedByVillaMock(...a),
    findApprovedByVilla: vi.fn(),
    findAllApprovedRatings: vi.fn(),
    findApprovedRatingsAllVillas: vi.fn(),
    findApprovedRatingsByVilla: vi.fn(),
    findFeaturedHomepage: vi.fn(),
    findAllForAdmin: vi.fn(),
  },
}));

import {
  updateVillaReviewByAdmin,
  createVillaReview,
  approveVillaReview,
  deleteVillaReview,
  toggleFeaturedReview,
} from "@/app/services/villa-review.service";

const SERVICE_SRC = readFileSync(
  join(process.cwd(), "app/services/villa-review.service.ts"),
  "utf-8"
);
const ACTION_SRC = readFileSync(
  join(process.cwd(), "app/services/villa-review.action.ts"),
  "utf-8"
);

const FROZEN_NOW = new Date("2026-09-22T10:00:00.000Z");

const VALID = {
  id: "rev-1",
  guest_name: "Ayşe Yılmaz",
  rating: 5,
  comment: "Harika bir tatil oldu, ev çok temizdi.",
};

/** updateById'ye giden payload. */
function payload(): Record<string, unknown> {
  return updateByIdMock.mock.calls[0][1] as Record<string, unknown>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
  vi.clearAllMocks();
  updateByIdMock.mockResolvedValue({ error: null });
  insertMock.mockResolvedValue({ error: null });
  deleteByIdMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

/* ===============================================================
   6-8) TARİH — geçmiş / bugün / sadece tarih değişikliği
   =============================================================== */
describe("6-8) tarih güncelleme — kabul senaryoları", () => {
  it("6a) sadece tarih değiştir → başarılı, doğru id'ye yazılır", async () => {
    const res = await updateVillaReviewByAdmin({
      ...VALID,
      created_at: "2025-06-01",
    });
    expect(res.ok).toBe(true);
    expect(updateByIdMock).toHaveBeenCalledTimes(1);
    expect(updateByIdMock.mock.calls[0][0]).toBe("rev-1");
  });

  it("7a) GEÇMİŞ tarih (2025-06-01) → created_at yazılır", async () => {
    await updateVillaReviewByAdmin({ ...VALID, created_at: "2025-06-01" });
    expect(payload().created_at).toBe("2025-06-01T12:00:00.000Z");
  });

  it("7b) çok eski tarih (2020-01-01) → kabul", async () => {
    const res = await updateVillaReviewByAdmin({
      ...VALID,
      created_at: "2020-01-01",
    });
    expect(res.ok).toBe(true);
  });

  it("8a) BUGÜN (2026-09-22) → kabul", async () => {
    const res = await updateVillaReviewByAdmin({
      ...VALID,
      created_at: "2026-09-22",
    });
    expect(res.ok).toBe(true);
    expect(payload().created_at).toBe("2026-09-22T12:00:00.000Z");
  });

  it("8b) DÜN (2026-09-21) → kabul", async () => {
    const res = await updateVillaReviewByAdmin({
      ...VALID,
      created_at: "2026-09-21",
    });
    expect(res.ok).toBe(true);
  });

  it("8c) senaryo: 15.09.2026 → 01.06.2025 gerçekten güncellenir", async () => {
    const res = await updateVillaReviewByAdmin({
      ...VALID,
      created_at: "2025-06-01",
    });
    expect(res.ok).toBe(true);
    expect(payload().created_at).toBe("2025-06-01T12:00:00.000Z");
  });
});

/* ===============================================================
   9-10) TARİH — RED senaryoları
   =============================================================== */
describe("9-10) tarih güncelleme — RED senaryoları", () => {
  it("9a) YARIN (2026-09-23) → RED, updateById ÇAĞRILMAZ", async () => {
    const res = await updateVillaReviewByAdmin({
      ...VALID,
      created_at: "2026-09-23",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Yorum tarihi bugünden ileri olamaz.");
    expect(updateByIdMock).not.toHaveBeenCalled();
  });

  it("9b) gelecek yıl → RED", async () => {
    const res = await updateVillaReviewByAdmin({
      ...VALID,
      created_at: "2030-01-01",
    });
    expect(res.ok).toBe(false);
    expect(updateByIdMock).not.toHaveBeenCalled();
  });

  it("9c) ileri tarihli ISO timestamp (action'a doğrudan enjekte) → RED", async () => {
    const res = await updateVillaReviewByAdmin({
      ...VALID,
      created_at: "2026-09-30T00:00:00.000Z",
    });
    expect(res.ok).toBe(false);
    expect(updateByIdMock).not.toHaveBeenCalled();
  });

  const BAD = [
    "01.06.2025",
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "2025-08-32",
    "abc",
  ];
  for (const bad of BAD) {
    it(`10) geçersiz tarih "${bad}" → RED, updateById ÇAĞRILMAZ`, async () => {
      const res = await updateVillaReviewByAdmin({
        ...VALID,
        created_at: bad,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("Geçerli bir yorum tarihi seçin.");
      expect(updateByIdMock).not.toHaveBeenCalled();
    });
  }
});

/* ===============================================================
   11) PAYLOAD — created_at bulunur / bulunmaz
   =============================================================== */
describe("11) update payload", () => {
  it("11a) tarih verilince created_at payload'da VAR", async () => {
    await updateVillaReviewByAdmin({ ...VALID, created_at: "2025-06-01" });
    expect(Object.keys(payload())).toContain("created_at");
  });

  it("11b) tarih BOŞ → created_at payload'da YOK (mevcut tarih korunur)", async () => {
    await updateVillaReviewByAdmin({ ...VALID, created_at: "" });
    expect(Object.keys(payload())).not.toContain("created_at");
  });

  it("11c) tarih verilmemiş → created_at payload'da YOK", async () => {
    await updateVillaReviewByAdmin(VALID);
    expect(Object.keys(payload())).not.toContain("created_at");
  });

  it("11d) tarih null → created_at payload'da YOK", async () => {
    await updateVillaReviewByAdmin({ ...VALID, created_at: null });
    expect(Object.keys(payload())).not.toContain("created_at");
  });
});

/* ===============================================================
   12) DİĞER ALANLAR — mevcut validasyon davranışı korunuyor
   =============================================================== */
describe("12) ad / puan / yorum", () => {
  it("12a) üç alan da payload'a yazılır", async () => {
    await updateVillaReviewByAdmin(VALID);
    const p = payload();
    expect(p.guest_name).toBe("Ayşe Yılmaz");
    expect(p.rating).toBe(5);
    expect(p.comment).toBe("Harika bir tatil oldu, ev çok temizdi.");
  });

  it("12b) id boş → 'ID gerekli', updateById ÇAĞRILMAZ", async () => {
    const res = await updateVillaReviewByAdmin({ ...VALID, id: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("ID gerekli");
    expect(updateByIdMock).not.toHaveBeenCalled();
  });

  it("12c) kısa ad → RED (create ile AYNI mesaj)", async () => {
    const res = await updateVillaReviewByAdmin({ ...VALID, guest_name: "A" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Ad Soyad en az 2 karakter olmalı.");
    expect(updateByIdMock).not.toHaveBeenCalled();
  });

  it("12d) 80+ karakter ad → RED", async () => {
    const res = await updateVillaReviewByAdmin({
      ...VALID,
      guest_name: "A".repeat(81),
    });
    expect(res.ok).toBe(false);
    expect(updateByIdMock).not.toHaveBeenCalled();
  });

  it("12e) puan 0 ve 6 → RED", async () => {
    for (const r of [0, 6]) {
      vi.clearAllMocks();
      updateByIdMock.mockResolvedValue({ error: null });
      const res = await updateVillaReviewByAdmin({ ...VALID, rating: r });
      expect(res.ok).toBe(false);
      expect(updateByIdMock).not.toHaveBeenCalled();
    }
  });

  it("12f) kısa yorum → RED", async () => {
    const res = await updateVillaReviewByAdmin({ ...VALID, comment: "kısa" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Yorum en az 10 karakter olmalı.");
    expect(updateByIdMock).not.toHaveBeenCalled();
  });

  it("12g) 1500+ karakter yorum → RED", async () => {
    const res = await updateVillaReviewByAdmin({
      ...VALID,
      comment: "x".repeat(1501),
    });
    expect(res.ok).toBe(false);
    expect(updateByIdMock).not.toHaveBeenCalled();
  });

  it("12h) sanitize uygulanır (create ile AYNI helper)", async () => {
    await updateVillaReviewByAdmin({
      ...VALID,
      guest_name: "  Ayşe   Yılmaz  ",
    });
    expect(payload().guest_name).toBe("Ayşe Yılmaz");
  });

  it("12i) repo hatası → ham DB mesajı SIZDIRILMAZ", async () => {
    updateByIdMock.mockResolvedValue({
      error: { message: 'violates check constraint "villa_reviews_rating_check"' },
    });
    const res = await updateVillaReviewByAdmin(VALID);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("Yorum güncellenemedi. Lütfen tekrar deneyin.");
      expect(res.error).not.toContain("constraint");
    }
  });
});

/* ===============================================================
   13) is_featured / is_approved DOKUNULMAZ
   =============================================================== */
describe("13) yasak alanlar payload'a ASLA konulmaz", () => {
  const FORBIDDEN = [
    "is_featured",
    "is_approved",
    "approved_at",
    "villa_id",
    "id",
  ];

  it("13a) tarihli update — yasak alan YOK", async () => {
    await updateVillaReviewByAdmin({ ...VALID, created_at: "2025-06-01" });
    for (const k of FORBIDDEN) {
      expect(Object.keys(payload())).not.toContain(k);
    }
  });

  it("13b) tarihsiz update — yasak alan YOK", async () => {
    await updateVillaReviewByAdmin(VALID);
    for (const k of FORBIDDEN) {
      expect(Object.keys(payload())).not.toContain(k);
    }
  });

  it("13c) payload anahtar kümesi TAM: tarihsiz 3, tarihli 4", async () => {
    await updateVillaReviewByAdmin(VALID);
    expect(Object.keys(payload()).sort()).toEqual([
      "comment",
      "guest_name",
      "rating",
    ]);

    vi.clearAllMocks();
    updateByIdMock.mockResolvedValue({ error: null });
    await updateVillaReviewByAdmin({ ...VALID, created_at: "2025-06-01" });
    expect(Object.keys(payload()).sort()).toEqual([
      "comment",
      "created_at",
      "guest_name",
      "rating",
    ]);
  });

  it("13d) 🔒 SOURCE-LOCK — update gövdesinde is_featured/is_approved YOK", () => {
    const start = SERVICE_SRC.indexOf(
      "export async function updateVillaReviewByAdmin("
    );
    expect(start).toBeGreaterThan(-1);
    const body = SERVICE_SRC.slice(start, SERVICE_SRC.indexOf("\n}\n", start));
    expect(body).not.toContain("is_featured:");
    expect(body).not.toContain("is_approved:");
    expect(body).not.toContain("approved_at:");
    expect(body).not.toContain("clearFeaturedByVilla");
  });

  it("13e) featured toggle akışı AYNEN duruyor", async () => {
    findFeaturedStateByIdMock.mockResolvedValue({
      data: { id: "r1", villa_id: "v1", is_featured: false, is_approved: true },
      error: null,
    });
    clearFeaturedByVillaMock.mockResolvedValue({ error: null });
    const res = await toggleFeaturedReview("r1");
    expect(res.ok).toBe(true);
    expect(clearFeaturedByVillaMock).toHaveBeenCalledWith("v1");
  });
});

/* ===============================================================
   14-15) AUTHORIZATION
   =============================================================== */
describe("14-15) yetki", () => {
  it("14a) reviews izni yoksa service ve repository'ye ULAŞILMAZ", async () => {
    vi.resetModules();
    const requirePermissionMock = vi.fn(async () => {
      throw new Error("Yetkisiz: bu işlem için izniniz yok");
    });
    const repoUpdateMock = vi.fn();
    vi.doMock("@/lib/auth/action-authz", () => ({
      requirePermission: requirePermissionMock,
      callerHasPermission: vi.fn(),
    }));
    vi.doMock("@/lib/db/villa-review.repository.server", () => ({
      villaReviewServerRepository: {
        updateById: repoUpdateMock,
        insert: vi.fn(),
        deleteById: vi.fn(),
        findApprovedByVilla: vi.fn(),
        findAllApprovedRatings: vi.fn(),
        findApprovedRatingsAllVillas: vi.fn(),
        findApprovedRatingsByVilla: vi.fn(),
        findFeaturedHomepage: vi.fn(),
        findAllForAdmin: vi.fn(),
        findFeaturedStateById: vi.fn(),
        clearFeaturedByVilla: vi.fn(),
      },
    }));
    const mod = await import("@/app/services/villa-review.action");
    await expect(
      mod.updateVillaReviewByAdminAction({ ...VALID, created_at: "2025-06-01" })
    ).rejects.toThrow(/Yetkisiz/);
    expect(requirePermissionMock).toHaveBeenCalledWith("reviews");
    expect(repoUpdateMock).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/auth/action-authz");
    vi.doUnmock("@/lib/db/villa-review.repository.server");
    vi.resetModules();
  });

  it("14b) 🔒 SOURCE-LOCK — action requirePermission('reviews') uyguluyor", () => {
    expect(ACTION_SRC).toMatch(
      /updateVillaReviewByAdminAction[\s\S]{0,260}requirePermission\("reviews"\)/
    );
  });

  it("14c) 🔒 YENİ permission İCAT EDİLMEDİ", () => {
    const perms = ACTION_SRC.match(/requirePermission\("([^"]+)"\)/g) || [];
    for (const p of perms) expect(p).toBe('requirePermission("reviews")');
  });

  it("15a) izin varsa update başarılı (pass-through imza)", async () => {
    expect(ACTION_SRC).toContain(
      "...args: Parameters<typeof updateVillaReviewByAdmin>"
    );
    const res = await updateVillaReviewByAdmin({
      ...VALID,
      created_at: "2025-06-01",
    });
    expect(res.ok).toBe(true);
    expect(updateByIdMock).toHaveBeenCalledTimes(1);
  });
});

/* ===============================================================
   16-21) REGRESYON
   =============================================================== */
describe("16-21) regresyon", () => {
  it("16a) public createVillaReview payload'ı DEĞİŞMEDİ", async () => {
    await createVillaReview({
      villa_id: "villa-1",
      guest_name: "Misafir Kişi",
      rating: 4,
      comment: "Guest tarafından gönderilen yorum metni.",
    });
    const p = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(p).sort()).toEqual([
      "comment",
      "guest_name",
      "is_approved",
      "is_featured",
      "rating",
      "villa_id",
    ]);
    expect(p.is_approved).toBe(false);
    expect(p.is_featured).toBe(false);
  });

  it("16b) 🔒 public createVillaReview tarih/ileri-tarih mantığına DOKUNMADI", () => {
    const start = SERVICE_SRC.indexOf(
      "export async function createVillaReview("
    );
    const body = SERVICE_SRC.slice(start, SERVICE_SRC.indexOf("\n}\n", start));
    expect(body).not.toContain("created_at");
    expect(body).not.toContain("normalizeAdminReviewDate");
  });

  it("17a) 🔒 public createVillaReviewAction PERMISSION'SIZ kalmalı", () => {
    const start = ACTION_SRC.indexOf(
      "export async function createVillaReviewAction("
    );
    const body = ACTION_SRC.slice(start, ACTION_SRC.indexOf("\n}\n", start));
    expect(body).not.toContain("requirePermission");
  });

  it("17b) 🔒 public VillaReviewsSection'da admin update izi YOK", () => {
    const pub = readFileSync(
      join(process.cwd(), "app/components/villa/VillaReviewsSection.tsx"),
      "utf-8"
    );
    expect(pub).not.toContain("updateVillaReviewByAdmin");
    expect(pub).not.toContain("created_at:");
    expect(pub).not.toContain("AdminDateInput");
  });

  it("18a) 🔒 homepage newest-10 sistemi bozulmadı", () => {
    expect(SERVICE_SRC).toMatch(/const HOMEPAGE_REVIEW_LIMIT = 10;/);
    const repo = readFileSync(
      join(process.cwd(), "lib/db/villa-review.repository.server.ts"),
      "utf-8"
    );
    const start = repo.indexOf("async findFeaturedHomepage(");
    const body = repo.slice(start, repo.indexOf("\n  },", start));
    expect(body).toContain('.eq("is_approved", true)');
    expect(body).toContain('.order("created_at", { ascending: false })');
    expect(body).not.toContain('.order("is_featured"');
  });

  it("19a) approveVillaReview çalışıyor", async () => {
    const res = await approveVillaReview("r1");
    expect(res.ok).toBe(true);
    const p = updateByIdMock.mock.calls[0][1] as Record<string, unknown>;
    expect(p.is_approved).toBe(true);
    expect(p.approved_at).toBe(FROZEN_NOW.toISOString());
  });

  it("20a) deleteVillaReview çalışıyor", async () => {
    const res = await deleteVillaReview("r1");
    expect(res.ok).toBe(true);
    expect(deleteByIdMock).toHaveBeenCalledWith("r1");
  });

  it("21a) 🔒 YENİ repository metodu eklenmedi (mevcut updateById)", () => {
    const repo = readFileSync(
      join(process.cwd(), "lib/db/villa-review.repository.server.ts"),
      "utf-8"
    );
    const methods = (repo.match(/^  async (\w+)\(/gm) || []).map((m) =>
      m.trim().replace("async ", "").replace("(", "")
    );
    expect(methods.sort()).toEqual(
      [
        "clearFeaturedByVilla",
        "deleteById",
        "findAllApprovedRatings",
        "findAllForAdmin",
        "findApprovedByVilla",
        "findApprovedRatingsAllVillas",
        "findApprovedRatingsByVilla",
        "findFeaturedHomepage",
        "findFeaturedStateById",
        "insert",
        "updateById",
      ].sort()
    );
  });

  it("21b) 🔒 tarih doğrulama TEK yerde (kopyalanmadı)", () => {
    const occurrences = (
      SERVICE_SRC.match(/function normalizeAdminReviewDate/g) || []
    ).length;
    expect(occurrences).toBe(1);
    const calls = (
      SERVICE_SRC.match(/normalizeAdminReviewDate\(input\?\.created_at\)/g) || []
    ).length;
    expect(calls).toBe(2); // create + update
  });

  it("21c) 🔒 MIGRATION eklenmedi — villa_reviews DDL dosyası yok", () => {
    const files = readFileSync(
      join(process.cwd(), "package.json"),
      "utf-8"
    );
    expect(files.length).toBeGreaterThan(0);
    expect(SERVICE_SRC).not.toContain("ALTER TABLE");
    expect(SERVICE_SRC).not.toContain("CREATE TABLE");
  });
});

/* ===============================================================
   22) UI — inline düzenleme mevcut desenlerle
   =============================================================== */
describe("22) admin UI kilidi", () => {
  const UI_SRC = readFileSync(
    join(process.cwd(), "app/(admin)/maki-admin/reviews/ReviewAdminList.tsx"),
    "utf-8"
  );

  it("22a) 'Düzenle' butonu ve inline alanlar var", () => {
    expect(UI_SRC).toContain("Düzenle");
    expect(UI_SRC).toContain("function ReviewEditFields(");
    expect(UI_SRC).toContain("updateVillaReviewByAdminAction");
  });

  it("22b) mevcut AdminDateInput yeniden kullanıldı, yeni picker YOK", () => {
    expect(UI_SRC).toContain(
      'import AdminDateInput from "@/app/components/admin/shared/AdminDateInput"'
    );
    expect(UI_SRC).not.toContain('type="date"');
    expect(UI_SRC).not.toContain("react-datepicker");
    expect(UI_SRC).not.toContain("Modal");
  });

  it("22c) UI'da da ileri tarih kapalı (maxDate) — ama service asıl kontrol", () => {
    expect(UI_SRC).toContain("maxDate={todayIstanbulYmd()}");
    expect(SERVICE_SRC).toContain('reason: "future"');
  });

  it("22d) düzenleme formunda 'Öne Çıkan' alanı YOK", () => {
    const start = UI_SRC.indexOf("function ReviewEditFields(");
    const body = UI_SRC.slice(start, UI_SRC.indexOf("\n/* ====", start));
    expect(body).not.toContain("is_featured");
    expect(body).not.toContain("Öne çıkar");
    expect(body).not.toContain("is_approved");
  });

  it("22e) mevcut admin desenleri korundu", () => {
    expect(UI_SRC).toContain("admin-card");
    expect(UI_SRC).toContain("admin-btn-primary");
    expect(UI_SRC).toContain("admin-btn-ghost");
    expect(UI_SRC).toContain("revalidateVillaReviews");
    expect(UI_SRC).toContain('action: "review.updated"');
  });
});
