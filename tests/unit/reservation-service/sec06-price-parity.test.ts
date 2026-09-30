import { describe, it, expect, vi, beforeEach } from "vitest";

/* ===============================================================
   🛡️ SEC-06 — "ÖNCEKİ FİYAT = SONRAKİ FİYAT" PARİTE KİLİDİ
   ===============================================================
   `__fixtures__/sec06-price-baseline.json`, SEC-06 düzeltmesi
   UYGULANMADAN ÖNCEKİ kodla (aynı senaryolar, aynı mock'lar)
   üretildi. Bu test, düzeltme sonrası server recompute'un her
   senaryoda BİREBİR aynı sonucu ürettiğini doğrular:
     - total / total_try / temizlik / ön ödeme / kalan
     - original_price / original_currency / exchange_rate
     - indirim snapshot'ı (percent / fixed / çapraz kur / %100)
     - havuz ısıtma snapshot'ı (sezon içi / dışı / dövizli)
     - priceUnavailable (eksik gece)
   Tek EK alan `damage_deposit` (SEC-06 F4) karşılaştırmadan ayrılır ve
   ayrıca villa.deposit formülüyle doğrulanır.
   =============================================================== */

const findVillaCleaningConfig = vi.fn();
const getVillaPrices = vi.fn();
const getExchangeRatesMap = vi.fn();
const getPublicSettings = vi.fn();
const getVillaDiscounts = vi.fn();

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

import { verifyPublicReservationPrice } from "@/app/services/reservation/_helpers/price-verify";
import type { ReservationCreateInput } from "@/app/services/reservation/types";
import {
  SEC06_SCENARIOS,
  SEC06_RATES,
  SEC06_BASE_VILLA,
  type Sec06Scenario,
} from "./_sec06-price-scenarios";
import baseline from "./__fixtures__/sec06-price-baseline.json";

type Baseline = Record<
  string,
  {
    priceUnavailable: boolean;
    authoritative: Record<string, unknown> | null;
    poolHeating: Record<string, unknown> | null;
  }
>;
const BASELINE = baseline as Baseline;

function arrange(s: Sec06Scenario, villaExtra: Record<string, unknown> = {}) {
  findVillaCleaningConfig.mockResolvedValue({
    data: { ...SEC06_BASE_VILLA, ...(s.villa || {}), ...villaExtra },
    error: null,
  });
  getVillaPrices.mockResolvedValue(s.prices);
  getExchangeRatesMap.mockResolvedValue({ rates: SEC06_RATES, updatedAt: null });
  getPublicSettings.mockResolvedValue(s.settings ?? { prepayment_rate: 20 });
  getVillaDiscounts.mockResolvedValue(s.discounts ?? []);
}

function payload(s: Sec06Scenario): ReservationCreateInput {
  return {
    villa_id: "villa-sec06",
    start_date: s.start,
    end_date: s.end,
    pool_heating_selected: !!s.pool,
    name: "Test",
    phone: "+905551112233",
  } as ReservationCreateInput;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("SEC-06 — fiyat paritesi (düzeltme öncesi baseline ile birebir)", () => {
  it("baseline tüm senaryoları içerir", () => {
    expect(Object.keys(BASELINE).sort()).toEqual(
      SEC06_SCENARIOS.map((s) => s.name).sort()
    );
  });

  for (const s of SEC06_SCENARIOS) {
    it(s.name, async () => {
      arrange(s);
      const v = await verifyPublicReservationPrice(payload(s));
      const before = BASELINE[s.name];

      expect(v.priceUnavailable).toBe(before.priceUnavailable);
      expect(v.poolHeating).toEqual(before.poolHeating);

      if (before.authoritative === null) {
        expect(v.authoritative).toBeNull();
        return;
      }
      expect(v.recomputeFailed).toBe(false);
      expect(v.rateUnavailable).toBe(false);
      const { damage_deposit, ...rest } = v.authoritative!;
      expect(rest).toEqual(before.authoritative);
      // Yeni alan: villa.deposit yok → 0 (client formülü: Number(x) || 0).
      expect(damage_deposit).toBe(0);
    });
  }

  it("damage_deposit villa.deposit'ten gelir; fiyat alanları DEĞİŞMEZ", async () => {
    const s = SEC06_SCENARIOS.find((x) => x.name.startsWith("25 "))!;
    arrange(s, { deposit: 7500 });
    const v = await verifyPublicReservationPrice(payload(s));
    const { damage_deposit, ...rest } = v.authoritative!;
    expect(damage_deposit).toBe(7500);
    expect(rest).toEqual(BASELINE[s.name].authoritative);
  });
});
