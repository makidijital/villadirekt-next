/* ===============================================================
   🛡️ discount.action.ts — saveDiscountData SERVER-AUTHORITATIVE
   CURRENCY ENFORCEMENT testleri
   ===============================================================
   AMAÇ: Fixed özel fiyatın currency'sinin villa.currency ile AYNI
   olmasını sunucu tarafında (client'a güvenmeden) zorlayan yeni
   mantığı doğrulamak:
     - fixed + eşleşen currency  → kaydedilir, server'ın kendi
       okuduğu villaCurrency yazılır.
     - fixed + eşleşmeyen/eksik currency → REJECT, Türkçe hata.
     - percent + herhangi bir client currency'si → server null'a
       zorlar, kaydedilir.
     - villa currency okunamazsa → REJECT.
     - batch içinde TEK bir uyumsuz kayıt bile TÜM batch'i reddeder
       (RPC hiç çağrılmaz — atomic replace-all bozulmaz).
     - REGRESSION (villa.currency NULL fallback): villa.currency NULL
       ama villa_prices'ta geçerli fiyat/currency varsa → getVillaPrices +
       getStartingPrice (GERÇEK, mock'lanmamış — price.engine.ts'in
       kendisi çalışır) ile fallback currency belirlenir, fixed indirim
       kaydı/silmesi (saveDiscountData replace-all deseni ikisi için de
       AYNI çağrı) BAŞARILI olur. villa.currency doluysa fallback'e HİÇ
       başvurulmaz (mevcut davranış korunur).
     - REGRESSION (KÖK NEDEN FIX — villa satırı okuma HATASI artık
       fallback'i ENGELLEMEZ): findIdTitleCurrencyById `error` dönerse
       (ör. geçici DB hatası) eskiden fonksiyon ORADA dururdu, fallback'e
       HİÇ düşülmezdi — takvimin AYNI getVillaPrices'la normal fiyatı
       gösterdiği bir villada bile indirim reddediliyordu. Artık villa
       satırı hata dönse BİLE villa_prices fallback'i denenir; fallback
       geçerli bir currency bulursa kayıt BAŞARILI olur.

   Mock convention: proje genelinde kullanılan `vi.mock` + module-level
   spy deseni (bkz. tests/unit/reservation-service/*.test.ts).
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findIdTitleCurrencyByIdMock = vi.fn();
const rpcReplaceVillaDiscountsMock = vi.fn();
const authorizeAdminSessionMock = vi.fn();

vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findIdTitleCurrencyById: (...args: unknown[]) =>
      findIdTitleCurrencyByIdMock(...args),
  },
}));

vi.mock("@/lib/db/villa-discount.repository.server", () => ({
  villaDiscountRepository: {
    findDiscountsByVillaId: vi.fn(),
    rpcReplaceVillaDiscounts: (...args: unknown[]) =>
      rpcReplaceVillaDiscountsMock(...args),
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

/* 🛡️ REGRESSION MOCK — discount.action.ts'in villa.currency NULL fallback'i
   için eklediği `getVillaPrices` importu. `getStartingPrice` (price.engine)
   BİLEREK mock'LANMAZ — gerçek fonksiyon çalışır, testin fallback zincirini
   uçtan uca (getVillaPrices → getStartingPrice → villaCurrency) doğrulaması
   için. */
const getVillaPricesMock = vi.fn();

vi.mock("@/app/services/villa-price.service", () => ({
  getVillaPrices: (...args: unknown[]) => getVillaPricesMock(...args),
}));

import { saveDiscountData } from "@/app/components/admin/villa/discount.action";

const VILLA_ID = "villa-1";

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
  rpcReplaceVillaDiscountsMock.mockResolvedValue({ error: null });
});

describe("saveDiscountData — server-authoritative currency enforcement", () => {
  it("1) fixed + villa.currency ile BİREBİR AYNI client currency → kaydedilir", async () => {
    findIdTitleCurrencyByIdMock.mockResolvedValue({
      data: { id: VILLA_ID, title: "Villa", currency: "USD" },
      error: null,
    });

    const res = await saveDiscountData(VILLA_ID, [
      {
        start_date: "2026-10-01",
        end_date: "2026-10-05",
        discount_type: "fixed",
        discount_value: 5000,
        currency: "USD",
      },
    ]);

    expect(res).toEqual({ ok: true });
    expect(rpcReplaceVillaDiscountsMock).toHaveBeenCalledTimes(1);
    expect(rpcReplaceVillaDiscountsMock).toHaveBeenCalledWith(VILLA_ID, [
      expect.objectContaining({ discount_type: "fixed", currency: "USD" }),
    ]);
  });

  it("2) fixed + client'ın gönderdiği FARKLI currency → REJECT, Türkçe hata, RPC HİÇ çağrılmaz", async () => {
    findIdTitleCurrencyByIdMock.mockResolvedValue({
      data: { id: VILLA_ID, title: "Villa", currency: "USD" },
      error: null,
    });

    const res = await saveDiscountData(VILLA_ID, [
      {
        start_date: "2026-10-01",
        end_date: "2026-10-05",
        discount_type: "fixed",
        discount_value: 5000,
        // 🛡️ Sahte/yanlış client currency — server bunu KABUL ETMEMELİ.
        currency: "TRY",
      },
    ]);

    expect(res).toEqual({
      ok: false,
      error: "Özel fiyat para birimi mülkün fiyat para birimiyle aynı olmalıdır.",
    });
    expect(rpcReplaceVillaDiscountsMock).not.toHaveBeenCalled();
  });

  it("3) fixed + currency EKSİK (null/undefined) → REJECT", async () => {
    findIdTitleCurrencyByIdMock.mockResolvedValue({
      data: { id: VILLA_ID, title: "Villa", currency: "TRY" },
      error: null,
    });

    const res = await saveDiscountData(VILLA_ID, [
      {
        start_date: "2026-10-01",
        end_date: "2026-10-05",
        discount_type: "fixed",
        discount_value: 5000,
        currency: null,
      },
    ]);

    expect(res.ok).toBe(false);
    expect(rpcReplaceVillaDiscountsMock).not.toHaveBeenCalled();
  });

  it("4) percent + client sahte bir currency göndermiş olsa bile → server null'a zorlar, kaydedilir", async () => {
    findIdTitleCurrencyByIdMock.mockResolvedValue({
      data: { id: VILLA_ID, title: "Villa", currency: "EUR" },
      error: null,
    });

    const res = await saveDiscountData(VILLA_ID, [
      {
        start_date: "2026-10-01",
        end_date: "2026-10-05",
        discount_type: "percent",
        discount_value: 20,
        // 🛡️ Percent'te currency kavramı yok — client göndermiş olsa bile yok sayılmalı.
        currency: "USD",
      },
    ]);

    expect(res).toEqual({ ok: true });
    expect(rpcReplaceVillaDiscountsMock).toHaveBeenCalledWith(VILLA_ID, [
      expect.objectContaining({ discount_type: "percent", currency: null }),
    ]);
  });

  it("5) villa currency okunamazsa (error veya null) → REJECT, RPC çağrılmaz", async () => {
    findIdTitleCurrencyByIdMock.mockResolvedValue({
      data: null,
      error: { message: "DB patladı" },
    });

    const res = await saveDiscountData(VILLA_ID, [
      {
        start_date: "2026-10-01",
        end_date: "2026-10-05",
        discount_type: "fixed",
        discount_value: 5000,
        currency: "TRY",
      },
    ]);

    expect(res.ok).toBe(false);
    expect(rpcReplaceVillaDiscountsMock).not.toHaveBeenCalled();
  });

  it("6) batch içinde TEK bir uyumsuz kayıt → TÜM batch reddedilir (atomic, kısmi yazma yok)", async () => {
    findIdTitleCurrencyByIdMock.mockResolvedValue({
      data: { id: VILLA_ID, title: "Villa", currency: "USD" },
      error: null,
    });

    const res = await saveDiscountData(VILLA_ID, [
      {
        start_date: "2026-10-01",
        end_date: "2026-10-05",
        discount_type: "percent",
        discount_value: 20,
        currency: null,
      },
      {
        start_date: "2026-11-01",
        end_date: "2026-11-05",
        discount_type: "fixed",
        discount_value: 3000,
        currency: "TRY", // villa USD, bu kayıt uyumsuz
      },
    ]);

    expect(res.ok).toBe(false);
    expect(rpcReplaceVillaDiscountsMock).not.toHaveBeenCalled();
  });

  it("7) auth başarısızsa currency kontrolüne hiç gelinmez (mevcut davranış korunur)", async () => {
    authorizeAdminSessionMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Oturum bulunamadı",
    });

    const res = await saveDiscountData(VILLA_ID, [
      {
        start_date: "2026-10-01",
        end_date: "2026-10-05",
        discount_type: "fixed",
        discount_value: 5000,
        currency: "TRY",
      },
    ]);

    expect(res).toEqual({ ok: false, error: "Oturum bulunamadı" });
    expect(findIdTitleCurrencyByIdMock).not.toHaveBeenCalled();
    expect(rpcReplaceVillaDiscountsMock).not.toHaveBeenCalled();
  });

  it("8) REGRESSION — villa.currency NULL, villa_prices'ta geçerli currency var → fallback ile fixed discount BAŞARILI (saveDiscountData ekleme/silme ikisinde de AYNI çağrı — replace-all)", async () => {
    findIdTitleCurrencyByIdMock.mockResolvedValue({
      data: { id: VILLA_ID, title: "Villa", currency: null },
      error: null,
    });

    // getStartingPrice EN DÜŞÜK POZİTİF fiyatı seçer (8000 < 12000) —
    // fallback currency o satırın KENDİ currency'si: "EUR".
    getVillaPricesMock.mockResolvedValue([
      {
        id: "vp-1",
        villa_id: VILLA_ID,
        start_date: "2026-06-01",
        end_date: "2026-06-30",
        price: 8000,
        currency: "EUR",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "vp-2",
        villa_id: VILLA_ID,
        start_date: "2026-07-01",
        end_date: "2026-07-31",
        price: 12000,
        currency: "EUR",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);

    // "remaining" listesi — DiscountsSection.tsx'in handleDelete'inin
    // saveDiscountData(villaId, remaining) çağrısıyla BİREBİR aynı şekil
    // (silinen kayıt listeden çıkarılmış, kalanlar tekrar gönderiliyor).
    const res = await saveDiscountData(VILLA_ID, [
      {
        start_date: "2026-10-01",
        end_date: "2026-10-05",
        discount_type: "fixed",
        discount_value: 5000,
        currency: "EUR",
      },
    ]);

    expect(res).toEqual({ ok: true });
    expect(getVillaPricesMock).toHaveBeenCalledTimes(1);
    expect(getVillaPricesMock).toHaveBeenCalledWith(VILLA_ID);
    expect(rpcReplaceVillaDiscountsMock).toHaveBeenCalledTimes(1);
    expect(rpcReplaceVillaDiscountsMock).toHaveBeenCalledWith(VILLA_ID, [
      expect.objectContaining({ discount_type: "fixed", currency: "EUR" }),
    ]);
  });

  it("9) REGRESSION — villa.currency DOLU ise villa_prices fallback'e HİÇ başvurulmaz (mevcut davranış korunur)", async () => {
    findIdTitleCurrencyByIdMock.mockResolvedValue({
      data: { id: VILLA_ID, title: "Villa", currency: "USD" },
      error: null,
    });

    const res = await saveDiscountData(VILLA_ID, [
      {
        start_date: "2026-10-01",
        end_date: "2026-10-05",
        discount_type: "fixed",
        discount_value: 5000,
        currency: "USD",
      },
    ]);

    expect(res).toEqual({ ok: true });
    expect(getVillaPricesMock).not.toHaveBeenCalled();
    expect(rpcReplaceVillaDiscountsMock).toHaveBeenCalledTimes(1);
    expect(rpcReplaceVillaDiscountsMock).toHaveBeenCalledWith(VILLA_ID, [
      expect.objectContaining({ discount_type: "fixed", currency: "USD" }),
    ]);
  });

  it("10) KÖK NEDEN FIX — villa satırı okuma HATASI (findIdTitleCurrencyById error döner) villa_prices fallback'ini ENGELLEMEZ; fallback geçerli currency bulursa kayıt BAŞARILI olur (takvimin gösterdiği fiyatla TUTARLI)", async () => {
    // Takvimin (loadPricingData) kullandığı getVillaPrices AYNI villaId
    // için gerçek/pozitif fiyat döndürüyor — bu villada normal fiyat VAR.
    findIdTitleCurrencyByIdMock.mockResolvedValue({
      data: null,
      error: { message: "geçici bağlantı hatası" },
    });
    getVillaPricesMock.mockResolvedValue([
      {
        id: "vp-1",
        villa_id: VILLA_ID,
        start_date: "2026-06-01",
        end_date: "2026-06-30",
        price: 5000,
        currency: "TRY",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const res = await saveDiscountData(VILLA_ID, [
      {
        start_date: "2026-10-01",
        end_date: "2026-10-05",
        discount_type: "fixed",
        discount_value: 500,
        currency: "TRY",
      },
    ]);

    expect(res).toEqual({ ok: true });
    expect(getVillaPricesMock).toHaveBeenCalledTimes(1);
    expect(getVillaPricesMock).toHaveBeenCalledWith(VILLA_ID);
    expect(rpcReplaceVillaDiscountsMock).toHaveBeenCalledTimes(1);
    expect(rpcReplaceVillaDiscountsMock).toHaveBeenCalledWith(VILLA_ID, [
      expect.objectContaining({ discount_type: "fixed", currency: "TRY" }),
    ]);
  });

  it("11) villa satırı HATA döner VE villa_prices de boş/geçersiz → hâlâ REJECT (iş kuralı: normal fiyat hiç yoksa indirim eklenemez)", async () => {
    findIdTitleCurrencyByIdMock.mockResolvedValue({
      data: null,
      error: { message: "geçici bağlantı hatası" },
    });
    getVillaPricesMock.mockResolvedValue([]);

    const res = await saveDiscountData(VILLA_ID, [
      {
        start_date: "2026-10-01",
        end_date: "2026-10-05",
        discount_type: "fixed",
        discount_value: 500,
        currency: "TRY",
      },
    ]);

    expect(res.ok).toBe(false);
    expect(rpcReplaceVillaDiscountsMock).not.toHaveBeenCalled();
  });
});
