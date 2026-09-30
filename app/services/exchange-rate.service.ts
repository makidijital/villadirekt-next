import { exchangeRateRepository } from "@/lib/db/exchange-rate.repository";

export async function getExchangeRates() {
  const { data, error } = await exchangeRateRepository.findAll();

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}

/* ===============================================================
   🛡️ FAZ 53 — STRUCTURED RATE MAP (admin Döviz Kurları kartı)
   ===============================================================
   Admin /maki-admin/settings/entegrasyonlar kartında render etmek
   için kanonik shape. Mevcut `getExchangeRates()` davranışı
   DEĞİŞMEDİ; bu yeni helper ek bir export.

   ÇIKTI:
     {
       rates: { USD: number, EUR: number, GBP: number },
       updatedAt: string | null,
     }
   - Tek satırın "en yeni" updated_at değerini döndürür (TCMB tüm
     kodları aynı anda upsert ettiği için tüm rate'ler eş zamanlı).
   - Hata veya boş tablo durumunda rates={ }, updatedAt=null döner;
     UI "—" gösterir.

   DB COLUMN ASSUMPTIONS (mevcut /api/exchange-rates upsert pattern):
     code (PK), rate (numeric), updated_at (timestamptz)
=============================================================== */

export type ExchangeRatesMap = {
  rates: Partial<Record<"USD" | "EUR" | "GBP", number>>;
  updatedAt: string | null;
};

export async function getExchangeRatesMap(): Promise<ExchangeRatesMap> {
  const { data, error } = await exchangeRateRepository.findCodeRateUpdated();

  if (error) {
    console.error("[exchangeRate.getMap] FAILED", error.message);
    return { rates: {}, updatedAt: null };
  }

  type Row = {
    code: string | null;
    rate: number | string | null;
    updated_at: string | null;
  };

  const rows = (data || []) as Row[];
  const result: ExchangeRatesMap = { rates: {}, updatedAt: null };

  for (const r of rows) {
    if (!r?.code) continue;
    const code = String(r.code).toUpperCase();
    if (code !== "USD" && code !== "EUR" && code !== "GBP") continue;
    const num = Number(r.rate);
    if (!Number.isFinite(num) || num <= 0) continue;
    result.rates[code] = num;
    /* En yeni updated_at'i tak. */
    if (r.updated_at) {
      if (!result.updatedAt || r.updated_at > result.updatedAt) {
        result.updatedAt = r.updated_at;
      }
    }
  }

  return result;
}