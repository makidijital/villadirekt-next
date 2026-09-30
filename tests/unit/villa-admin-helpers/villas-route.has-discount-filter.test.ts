/* ===============================================================
   🛡️ /api/admin/villas GET — hasDiscount=1 (opt-in) filtre testleri
   ===============================================================
   AMAÇ: /maki-admin/discount-collection "Villa Ekle" seçicisinin
   dayandığı yeni opt-in query param'ı doğrulamak:
     - hasDiscount YOKSA → davranış BYTE-IDENTICAL (discount repo'su
       hiç çağrılmaz, tüm villalar döner) — homepage-collection /
       reservation formları gibi diğer consumer'lar ETKİLENMEZ.
     - hasDiscount=1 → yalnızca villa_discounts'ta EN AZ 1 kaydı olan
       villalar döner; discount repo TEK SEFER çağrılır (villa sayısı
       ne olursa olsun) — N+1 YOK.

   Mock convention: proje genelinde kullanılan `vi.mock` + module-level
   spy deseni (bkz. tests/unit/villa-admin-helpers/discount-action.
   currency-enforcement.test.ts, tests/unit/reservation-service/*.test.ts).
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";

const authorizeAdminCallerMock = vi.fn();
const findAdminSelectListMock = vi.fn();
const findDistinctVillaIdsWithDiscountsMock = vi.fn();
const createVillaFullMock = vi.fn();

vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminCaller: (...args: unknown[]) =>
    authorizeAdminCallerMock(...args),
}));

vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findAdminSelectList: (...args: unknown[]) =>
      findAdminSelectListMock(...args),
  },
}));

vi.mock("@/lib/db/villa-discount.repository.server", () => ({
  villaDiscountRepository: {
    findDistinctVillaIdsWithDiscounts: (...args: unknown[]) =>
      findDistinctVillaIdsWithDiscountsMock(...args),
  },
}));

vi.mock("@/app/services/villa-admin.service", () => ({
  createVillaFull: (...args: unknown[]) => createVillaFullMock(...args),
}));

/* 🛡️ Admin yetki — route artık `callerHasPermission` (DB izin kümesi)
   ister; bu dosya filtre davranışını test eder → çağıran admin'e villa
   listesi okuma izni ("villas") verilir. İzin senaryoları:
   tests/unit/admin-api-permission.test.ts. */
vi.mock("@/lib/db/admin-user.repository.server", () => ({
  adminUserServerRepository: {
    findByIdForSession: async (id: string) => ({
      data: { id, is_active: true, sidebar_permissions: ["villas"] },
      error: null,
    }),
  },
}));

const ALL_VILLAS = [
  { id: "v1", title: "Villa Bir", slug: "villa-bir", is_active: true, deleted_at: null },
  { id: "v2", title: "Villa İki", slug: "villa-iki", is_active: true, deleted_at: null },
  { id: "v3", title: "Villa Üç", slug: "villa-uc", is_active: true, deleted_at: null },
];

describe("GET /api/admin/villas — hasDiscount opt-in filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeAdminCallerMock.mockResolvedValue({
      ok: true,
      caller: { id: "admin-1", authUserId: "au-1", email: "a@a.com", is_active: true },
    });
    findAdminSelectListMock.mockResolvedValue({ data: ALL_VILLAS, error: null });
  });

  it("1) hasDiscount YOK → discount repo hiç çağrılmaz, tüm villalar döner (byte-identical eski davranış)", async () => {
    const { GET } = await import("@/app/api/admin/villas/route");
    const res = await GET(new Request("http://localhost/api/admin/villas?activeOnly=1"));
    const json = await res.json();

    expect(findDistinctVillaIdsWithDiscountsMock).not.toHaveBeenCalled();
    expect(json.ok).toBe(true);
    expect(json.villas).toEqual(ALL_VILLAS);
  });

  it("2) hasDiscount=1 → yalnızca discount kaydı olan villalar döner", async () => {
    findDistinctVillaIdsWithDiscountsMock.mockResolvedValue({
      data: [{ villa_id: "v2" }, { villa_id: "v2" }, { villa_id: "v3" }],
      error: null,
    });

    const { GET } = await import("@/app/api/admin/villas/route");
    const res = await GET(
      new Request("http://localhost/api/admin/villas?activeOnly=1&hasDiscount=1")
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.villas.map((v: { id: string }) => v.id)).toEqual(["v2", "v3"]);
    expect(findDistinctVillaIdsWithDiscountsMock).toHaveBeenCalledTimes(1);
  });

  it("3) hasDiscount=1 + hiç discount yok → boş liste, N+1 yok (tek ek sorgu)", async () => {
    findDistinctVillaIdsWithDiscountsMock.mockResolvedValue({ data: [], error: null });

    const { GET } = await import("@/app/api/admin/villas/route");
    const res = await GET(
      new Request("http://localhost/api/admin/villas?hasDiscount=1")
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.villas).toEqual([]);
    expect(findDistinctVillaIdsWithDiscountsMock).toHaveBeenCalledTimes(1);
  });

  it("4) discount repo hata dönerse → 500 + hata mesajı, villa listesi sızmaz", async () => {
    findDistinctVillaIdsWithDiscountsMock.mockResolvedValue({
      data: null,
      error: { message: "DB patladı" },
    });

    const { GET } = await import("@/app/api/admin/villas/route");
    const res = await GET(
      new Request("http://localhost/api/admin/villas?hasDiscount=1")
    );
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.villas).toBeUndefined();
  });

  it("5) admin auth başarısızsa → discount repo/villa repo hiç çağrılmaz", async () => {
    authorizeAdminCallerMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Oturum bulunamadı",
    });

    const { GET } = await import("@/app/api/admin/villas/route");
    const res = await GET(
      new Request("http://localhost/api/admin/villas?hasDiscount=1")
    );

    expect(res.status).toBe(401);
    expect(findAdminSelectListMock).not.toHaveBeenCalled();
    expect(findDistinctVillaIdsWithDiscountsMock).not.toHaveBeenCalled();
  });
});
