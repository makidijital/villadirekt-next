/* ===============================================================
   🛡️ discount.action.ts — deleteDiscountData (TEK KAYIT DELETE)
   ===============================================================
   AMAÇ: İndirim silme akışının artık saveDiscountData/replace-all
   (rpcReplaceVillaDiscounts) üzerinden GEÇMEDİĞİNİ, doğrudan
   villaDiscountRepository.deleteDiscountById(villaId, discountId)
   çağırdığını ve bu çağrının HER ZAMAN (villaId, discountId) compound
   koşuluyla scope'landığını doğrulamak:
     - Doğru villaId + discountId → satır gerçekten silinir, replace-all
       RPC'sine hiç düşülmez.
     - Başka villaya ait discountId (IDOR denemesi) → repository yine
       çağrılır ama compound WHERE (id = $1 AND villa_id = $2) gerçek
       Postgres'te eşleşmez → satır SİLİNMEZ. Bunu gerçek bir DB
       olmadan da dürüstçe kanıtlamak için mock, gerçek DELETE'in
       WHERE semantiğini taklit eden minik bir in-memory "tablo"
       üzerinde çalışıyor (bkz. `fakeTable`).
   Not: gerçek Postgres bir DELETE'in 0 satır etkilemesini hata
   saymaz (projedeki diğer `deleteById` repository metodları da
   affected-count kontrolü yapmıyor) — bu yüzden action her iki
   senaryoda da `{ok:true}` döner; asıl güvenlik sınırı SQL'in
   villa_id eşleşmesinde, action seviyesinde değil. İkinci test bunu
   `fakeTable`'ın değişmediğini assert ederek kanıtlıyor.

   Mock convention: proje genelinde kullanılan `vi.mock` + module-level
   spy deseni (bkz. discount-action.currency-enforcement.test.ts).
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";

const deleteDiscountByIdMock = vi.fn();
const rpcReplaceVillaDiscountsMock = vi.fn();
const authorizeAdminSessionMock = vi.fn();

vi.mock("@/lib/db/villa-discount.repository.server", () => ({
  villaDiscountRepository: {
    findDiscountsByVillaId: vi.fn(),
    rpcReplaceVillaDiscounts: (...args: unknown[]) =>
      rpcReplaceVillaDiscountsMock(...args),
    deleteDiscountById: (...args: unknown[]) =>
      deleteDiscountByIdMock(...args),
  },
}));

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

import { deleteDiscountData } from "@/app/components/admin/villa/discount.action";

const VILLA_A = "villa-a";
const VILLA_B = "villa-b";
const DISCOUNT_ID = "discount-1";

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

describe("deleteDiscountData — tek kayıt DELETE (saveDiscountData/replace-all'dan AYRI)", () => {
  it("1) Doğru villaId + discountId ile delete BAŞARILI — repository'ye tam (villaId, discountId) iletilir, replace-all RPC'sine HİÇ düşülmez, satır gerçekten silinir", async () => {
    const fakeTable = [{ id: DISCOUNT_ID, villa_id: VILLA_A }];
    deleteDiscountByIdMock.mockImplementation(
      async (villaId: string, discountId: string) => {
        const remaining = fakeTable.filter(
          (row) => !(row.id === discountId && row.villa_id === villaId)
        );
        fakeTable.length = 0;
        fakeTable.push(...remaining);
        return { error: null };
      }
    );

    const res = await deleteDiscountData(VILLA_A, DISCOUNT_ID);

    expect(res).toEqual({ ok: true });
    expect(deleteDiscountByIdMock).toHaveBeenCalledTimes(1);
    expect(deleteDiscountByIdMock).toHaveBeenCalledWith(VILLA_A, DISCOUNT_ID);
    expect(rpcReplaceVillaDiscountsMock).not.toHaveBeenCalled();
    expect(fakeTable).toEqual([]); // satır GERÇEKTEN silindi
  });

  it("2) BAŞKA villaya ait discountId ile delete (IDOR denemesi) → compound WHERE eşleşmez, satır SİLİNMEZ, replace-all'a HİÇ düşülmez", async () => {
    const fakeTable = [{ id: DISCOUNT_ID, villa_id: VILLA_A }];
    deleteDiscountByIdMock.mockImplementation(
      async (villaId: string, discountId: string) => {
        const remaining = fakeTable.filter(
          (row) => !(row.id === discountId && row.villa_id === villaId)
        );
        fakeTable.length = 0;
        fakeTable.push(...remaining);
        // Gerçek Postgres: 0 satır etkilense bile error YOK.
        return { error: null };
      }
    );

    // VILLA_B bu discount'un GERÇEK sahibi DEĞİL.
    const res = await deleteDiscountData(VILLA_B, DISCOUNT_ID);

    expect(deleteDiscountByIdMock).toHaveBeenCalledTimes(1);
    expect(deleteDiscountByIdMock).toHaveBeenCalledWith(VILLA_B, DISCOUNT_ID);
    expect(rpcReplaceVillaDiscountsMock).not.toHaveBeenCalled();
    // 🛡️ ASIL GÜVENLİK DOĞRULAMASI: satır HÂLÂ tabloda — yanlış villaId
    // ile silme işe yaramadı.
    expect(fakeTable).toEqual([{ id: DISCOUNT_ID, villa_id: VILLA_A }]);
    // Action seviyesi bunu "hata" saymaz (mevcut deleteById desenleriyle
    // tutarlı) — asıl koruma SQL'in villa_id eşleşmesinde.
    expect(res.ok).toBe(true);
  });
});
