/* ===============================================================
   🛡️ MIGRATION 088 — /api/public/payment-methods ADDITIVE SÖZLEŞMESİ
   ===============================================================
   Bu route'u HEM public rezervasyon formu HEM admin rezervasyon
   oluşturma ekranı kullanıyor. Bu yüzden mevcut alanların (özellikle
   canonical `name`) DEĞİŞMEMESİ bir regresyon guard'ıdır.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const findPaymentMethodsPublicMock = vi.fn();
vi.mock("@/lib/db/payment.repository.server", () => ({
  paymentServerRepository: {
    findPaymentMethodsPublic: (...a: unknown[]) =>
      findPaymentMethodsPublicMock(...a),
  },
}));

const getCachedSettingsMock = vi.fn();
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: (...a: unknown[]) => getCachedSettingsMock(...a),
}));

const getPaymentMethodNamesByLocaleMock = vi.fn();
vi.mock("@/lib/i18n/get-payment-method-translations.server", () => ({
  getPaymentMethodNamesByLocale: (...a: unknown[]) =>
    getPaymentMethodNamesByLocaleMock(...a),
}));

import { GET } from "@/app/api/public/payment-methods/route";

const ROWS = [
  { id: "pm-1", name: "Kredi Kartı", type: "credit_card", is_active: true },
  { id: "pm-2", name: "Havale / EFT", type: null, is_active: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  findPaymentMethodsPublicMock.mockResolvedValue({ data: ROWS, error: null });
  getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
  getPaymentMethodNamesByLocaleMock.mockResolvedValue({
    "pm-2": { en: "Bank Transfer", de: "Banküberweisung" },
  });
});

async function callRoute() {
  const res = await GET();
  return (await res.json()) as {
    ok: boolean;
    payment_methods: Record<string, unknown>[];
  };
}

describe("/api/public/payment-methods — additive name_by_locale", () => {
  it("1) canonical `name` / `type` / `is_active` / `id` AYNEN döner", async () => {
    const json = await callRoute();

    expect(json.ok).toBe(true);
    expect(json.payment_methods).toHaveLength(2);
    for (let i = 0; i < ROWS.length; i++) {
      expect(json.payment_methods[i]).toMatchObject(ROWS[i]);
    }
  });

  it("2) `name_by_locale` EKLENİR; çevirisi olmayan satırda boş obje", async () => {
    const json = await callRoute();

    expect(json.payment_methods[0].name_by_locale).toEqual({});
    expect(json.payment_methods[1].name_by_locale).toEqual({
      en: "Bank Transfer",
      de: "Banküberweisung",
    });
  });

  it("3) multilingual_enabled=false → çeviri sorgusu HİÇ atılmaz", async () => {
    getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });

    const json = await callRoute();

    expect(getPaymentMethodNamesByLocaleMock).not.toHaveBeenCalled();
    expect(json.payment_methods[0].name).toBe("Kredi Kartı");
    expect(json.payment_methods[0].name_by_locale).toEqual({});
  });

  it("4) çeviri okuma hatası cevabı BOZMAZ (fail-soft)", async () => {
    getPaymentMethodNamesByLocaleMock.mockRejectedValue(new Error("boom"));

    const json = await callRoute();

    expect(json.ok).toBe(true);
    expect(json.payment_methods[1].name).toBe("Havale / EFT");
    expect(json.payment_methods[1].name_by_locale).toEqual({});
  });

  it("5) repository hatası → { ok:true, payment_methods: [] } (eski davranış)", async () => {
    findPaymentMethodsPublicMock.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });

    const json = await callRoute();

    expect(json).toEqual({ ok: true, payment_methods: [] });
  });

  it("6) çeviri batch'i TEK çağrı + tüm id'lerle (N+1 yok)", async () => {
    await callRoute();

    expect(getPaymentMethodNamesByLocaleMock).toHaveBeenCalledTimes(1);
    expect(getPaymentMethodNamesByLocaleMock).toHaveBeenCalledWith([
      "pm-1",
      "pm-2",
    ]);
  });
});
