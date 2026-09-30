import { describe, it, expect, vi, beforeEach } from "vitest";

/* ===============================================================
   🛡️ SEC-06 — POST /api/public/reservations UÇTAN UCA (route seviyesi)
   ===============================================================
   Gerçek route + gerçek price-verify + gerçek fiyat motoru çalışır;
   yalnız DB erişimi (fiyat/kur/settings/indirim/villa okuma), rate-limit,
   orphan-gap kontrolü ve INSERT (createReservation) mock'lanır.
   `createReservation`'a giden `body`, DB'ye yazılacak değerlerin
   kendisidir (payload-create yalnız alan kopyalar).
   =============================================================== */

const findVillaCleaningConfig = vi.fn();
const getVillaPrices = vi.fn();
const getExchangeRatesMap = vi.fn();
const getPublicSettings = vi.fn();
const getVillaDiscounts = vi.fn();
const createReservation = vi.fn();
const verifyStay = vi.fn();

vi.mock("@/lib/db/reservation.repository", () => ({
  reservationRepository: {
    findVillaCleaningConfig: (...a: unknown[]) => findVillaCleaningConfig(...a),
  },
}));
vi.mock("@/app/services/villa-price.service", () => ({
  getVillaPrices: (...a: unknown[]) => getVillaPrices(...a),
}));
vi.mock("@/app/services/exchange-rate.service", () => ({
  getExchangeRatesMap: (...a: unknown[]) => getExchangeRatesMap(...a),
}));
vi.mock("@/app/services/settings.service", () => ({
  getPublicSettings: (...a: unknown[]) => getPublicSettings(...a),
}));
vi.mock("@/app/services/villa-discount.service", () => ({
  getVillaDiscounts: (...a: unknown[]) => getVillaDiscounts(...a),
}));
vi.mock("@/app/services/reservation.service", () => ({
  createReservation: (...a: unknown[]) => createReservation(...a),
}));
vi.mock("@/lib/db/reservation.repository.server", () => ({
  reservationServerRepository: { insert: vi.fn() },
}));
vi.mock("@/app/services/reservation/_helpers/stay-verify", () => ({
  verifyPublicReservationStayRules: (...a: unknown[]) => verifyStay(...a),
}));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: async () => null,
}));

import { POST } from "@/app/api/public/reservations/route";
import baseline from "./__fixtures__/sec06-price-baseline.json";
import { SEC06_SCENARIOS, SEC06_RATES, SEC06_BASE_VILLA } from "./_sec06-price-scenarios";

type Json = Record<string, unknown>;
const BASELINE = baseline as Record<string, { authoritative: Json | null }>;

const FUTURE_START = "2027-06-02";
const FUTURE_END = "2027-06-05";
const EUR_PRICES = [{ start_date: "2027-06-01", end_date: "2027-06-30", price: 200, currency: "EUR" }];

function body(over: Json = {}): Json {
  return {
    villa_id: "villa-sec06",
    start_date: FUTURE_START,
    end_date: FUTURE_END,
    name: "SEC06 Test",
    phone: "+905551112233",
    phone2: "+905551112244",
    email: "t@example.test",
    guests: 2,
    total_price: 1,
    total_price_try: 1,
    prepayment_amount: 1,
    remaining_payment: 0,
    paid_amount: 0,
    damage_deposit: 5000,
    payment_preference: "prepayment",
    ...over,
  };
}

async function post(b: Json) {
  const res = await POST(
    new Request("http://localhost/api/public/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(b),
    })
  );
  return { status: res.status, json: (await res.json()) as Json };
}

const inserted = () => createReservation.mock.calls[0]?.[0] as Json | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  findVillaCleaningConfig.mockResolvedValue({
    data: { ...SEC06_BASE_VILLA, deposit: 5000 },
    error: null,
  });
  getVillaPrices.mockResolvedValue(EUR_PRICES);
  getExchangeRatesMap.mockResolvedValue({ rates: SEC06_RATES, updatedAt: null });
  getPublicSettings.mockResolvedValue({ prepayment_rate: 20 });
  getVillaDiscounts.mockResolvedValue([]);
  verifyStay.mockResolvedValue(undefined);
  createReservation.mockResolvedValue({ id: "r1", reservation_no: "TY-1" });
});

describe("normal akış — fiyat sonucu değişmedi", () => {
  it("YYYY-MM-DD rezervasyon → 200; DB'ye giden tutarlar baseline ile BİREBİR", async () => {
    const s = SEC06_SCENARIOS.find((x) => x.name.startsWith("25 "))!;
    findVillaCleaningConfig.mockResolvedValue({
      data: { ...SEC06_BASE_VILLA, ...s.villa, deposit: 5000 },
      error: null,
    });
    getVillaPrices.mockResolvedValue(s.prices);
    getVillaDiscounts.mockResolvedValue(s.discounts);

    const r = await post(body({ start_date: s.start, end_date: s.end, pool_heating_selected: true }));
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, reservation: { id: "r1", reservation_no: "TY-1" } });

    const row = inserted()!;
    for (const [k, val] of Object.entries(BASELINE[s.name].authoritative!)) {
      expect(row[k]).toEqual(val);
    }
    expect(row.custom_price).toBe(false);
    expect(row.custom_price_note).toBeNull();
    expect(row.start_date).toBe(s.start);
    expect(row.end_date).toBe(s.end);
  });

  it("dürüst client (paid_amount 0, deposit = villa.deposit) → değerler aynen", async () => {
    await post(body());
    expect(inserted()!.paid_amount).toBe(0);
    expect(inserted()!.damage_deposit).toBe(5000);
    expect(inserted()!.payment_preference).toBe("prepayment");
    expect(inserted()!.guests).toBe(2);
  });
});

describe("F1 — tarih", () => {
  const BAD: Array<[string, string]> = [
    ["20270918", "20270922"],
    ["2027-09-23 00:00", "2027-09-27 00:00"],
    ["2027/09/27", "2027/09/30"],
    ["Aug 27 2027", "Aug 31 2027"],
    ["2027-08-23T00:00:00", "2027-08-27T00:00:00"],
    ["2027-02-30", "2027-03-02"],
  ];
  for (const [s, e] of BAD) {
    it(`geçersiz biçim "${s}" → 400, INSERT yok`, async () => {
      const r = await post(body({ start_date: s, end_date: e }));
      expect(r.status).toBe(400);
      expect(r.json.ok).toBe(false);
      expect(createReservation).not.toHaveBeenCalled();
      expect(getVillaPrices).not.toHaveBeenCalled();
    });
  }

  it("0 gece (giriş == çıkış) → 400 'Tarih aralığı hatalı'", async () => {
    const r = await post(body({ start_date: "2027-09-05", end_date: "2027-09-05" }));
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("Tarih aralığı hatalı");
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("ters aralık → 400", async () => {
    const r = await post(body({ start_date: "2027-09-06", end_date: "2027-09-05" }));
    expect(r.status).toBe(400);
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("tamamı geçmişte kalan konaklama → 400", async () => {
    const r = await post(body({ start_date: "2020-06-01", end_date: "2020-06-05" }));
    expect(r.status).toBe(400);
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("tarih eksik → 400 'Tarih zorunlu' (eski mesaj)", async () => {
    const r = await post(body({ start_date: undefined }));
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("Tarih zorunlu");
  });
});

describe("F2 — paid_amount", () => {
  it("sahte paid_amount 99999 etkisiz → 0 yazılır", async () => {
    const r = await post(body({ paid_amount: 99999 }));
    expect(r.status).toBe(200);
    expect(inserted()!.paid_amount).toBe(0);
  });

  it("paid_amount hiç gönderilmese de 0", async () => {
    const b = body();
    delete b.paid_amount;
    await post(b);
    expect(inserted()!.paid_amount).toBe(0);
  });
});

describe("F3 — eksik kur", () => {
  it("EUR kuru yok → 400, INSERT yok", async () => {
    getExchangeRatesMap.mockResolvedValue({ rates: { USD: 32.5, GBP: 41.2 }, updatedAt: null });
    const r = await post(body());
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("Seçilen tarihler için fiyat hesaplanamadı");
    expect(createReservation).not.toHaveBeenCalled();
  });
});

describe("F4 — damage_deposit", () => {
  it("sahte damage_deposit 0 etkisiz → villa.deposit (5000) yazılır", async () => {
    await post(body({ damage_deposit: 0 }));
    expect(inserted()!.damage_deposit).toBe(5000);
  });

  it("sahte yüksek damage_deposit etkisiz", async () => {
    await post(body({ damage_deposit: 1 }));
    expect(inserted()!.damage_deposit).toBe(5000);
  });
});

describe("F5 — fail-closed", () => {
  it("villa ayarları okunamadı → 400, INSERT yok", async () => {
    findVillaCleaningConfig.mockResolvedValue({ data: null, error: { message: "db down" } });
    const r = await post(body());
    expect(r.status).toBe(400);
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("recompute beklenmeyen hata → 400, INSERT yok (client tutarı ASLA yazılmaz)", async () => {
    getVillaPrices.mockRejectedValue(new Error("boom"));
    const r = await post(body());
    expect(r.status).toBe(400);
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("settings okunamadı (villa override yok) → 400", async () => {
    getPublicSettings.mockResolvedValue(null);
    const r = await post(body());
    expect(r.status).toBe(400);
    expect(createReservation).not.toHaveBeenCalled();
  });
});

describe("korunan davranışlar", () => {
  it("fiyatı olmayan gece → mevcut 400 mesajı aynen", async () => {
    getVillaPrices.mockResolvedValue([]);
    const r = await post(body());
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("Seçilen tarihler için fiyat hesaplanamadı");
  });

  it("orphan-gap ihlali → mevcut 400 aynen", async () => {
    verifyStay.mockRejectedValue(new Error("ORPHAN"));
    const r = await post(body());
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("ORPHAN");
  });

  it("'Bu tarihler dolu' → mevcut 409 aynen", async () => {
    createReservation.mockRejectedValue(new Error("Bu tarihler dolu"));
    const r = await post(body());
    expect(r.status).toBe(409);
  });

  it("telefon doğrulaması tarih kontrolünden ÖNCE (mevcut sıra)", async () => {
    const r = await post(body({ phone: "", start_date: "bad" }));
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("Geçerli bir telefon numarası gir");
  });

  it("guests / payment_preference client'tan aynen (değiştirilmedi)", async () => {
    await post(body({ guests: 4, payment_preference: "full_payment" }));
    expect(inserted()!.guests).toBe(4);
    expect(inserted()!.payment_preference).toBe("full_payment");
  });
});
