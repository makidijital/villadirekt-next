/* ===============================================================
   🛡️ cloneVilla — INSERT payload regresyon kilidi
   ===============================================================
   `select("*")` ile okunan kaynak satır blacklist ile INSERT
   payload'ına taşınır. GENERATED ALWAYS kolonlar (search_title —
   mig 065, real_title_search — mig 078) payload'a GİRMEMELİ; aksi
   halde PostgreSQL "cannot insert a non-DEFAULT value into column"
   hatası verir. DB default'lu id/created_at/sort_order ve güvenlik
   gereği private_access_token da taşınmaz.
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { insertVilla, emptyList, SOURCE_ROW } = vi.hoisted(() => ({
  insertVilla: vi.fn(),
  emptyList: async () => ({ data: [], error: null }),
  SOURCE_ROW: {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Villa Aydoğdu",
    slug: "villa-aydogdu",
    real_title: "Villa Aydoğdu Gerçek",
    search_title: "villa aydogdu",
    real_title_search: "villa aydogdu gercek",
    is_active: true,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    sort_order: 7,
    private_access_token: "secret-token",
    description: "Açıklama",
    guests: 6,
    bedrooms: 3,
    owner_id: "owner-1",
    pool_sheltered: true,
  } as Record<string, unknown>,
}));

vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findRawById: async () => ({ data: SOURCE_ROW, error: null }),
    findTypeRelationIds: emptyList,
    findFeatureRelationIds: emptyList,
    findRuleRelationIds: emptyList,
    findPriceIncludeRelationIds: emptyList,
    findPricesForClone: emptyList,
    findDistancesForClone: emptyList,
    insertVilla: (payload: Record<string, unknown>) => insertVilla(payload),
  },
}));
vi.mock("@/app/services/villa-admin/_helpers/slug", () => ({
  generateUniqueSlug: async () => "villa-aydogdu-kopya",
}));
vi.mock("@/app/services/villa-admin/_helpers/relations", () => ({
  insertVillaTypeRelations: vi.fn(),
  insertVillaFeatureRelations: vi.fn(),
  insertVillaRuleRelations: vi.fn(),
  insertVillaPriceIncludeRelations: vi.fn(),
}));
vi.mock("@/app/services/villa-price.service.server", () => ({
  setVillaPricesServer: vi.fn(),
}));
vi.mock("@/app/services/villa-distance.service.server", () => ({
  setVillaDistancesServer: vi.fn(),
}));

import { cloneVilla } from "@/app/services/villa-admin/clone.service";

describe("cloneVilla — INSERT payload", () => {
  beforeEach(() => {
    insertVilla.mockReset();
    insertVilla.mockResolvedValue({ data: { id: "new-villa-id" }, error: null });
  });

  it("generated / default / gizli kolonlar payload'a girmez", async () => {
    const res = await cloneVilla(String(SOURCE_ROW.id));
    expect(res).toEqual({ ok: true, id: "new-villa-id" });
    expect(insertVilla).toHaveBeenCalledTimes(1);

    const payload = insertVilla.mock.calls[0][0] as Record<string, unknown>;
    for (const key of [
      "search_title",
      "real_title_search",
      "id",
      "created_at",
      "sort_order",
      "private_access_token",
      "deleted_at",
    ]) {
      expect(payload, key).not.toHaveProperty(key);
    }
  });

  it("title '… - Kopya', is_active false, real_title ve diğer alanlar kopyalanır", async () => {
    await cloneVilla(String(SOURCE_ROW.id));
    const payload = insertVilla.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.title).toBe("Villa Aydoğdu - Kopya");
    expect(payload.slug).toBe("villa-aydogdu-kopya");
    expect(payload.is_active).toBe(false);
    expect(payload.real_title).toBe("Villa Aydoğdu Gerçek");
    expect(payload).toMatchObject({
      description: "Açıklama",
      guests: 6,
      bedrooms: 3,
      owner_id: "owner-1",
      pool_sheltered: true,
    });
  });
});
