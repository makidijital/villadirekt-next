import { XMLParser } from "fast-xml-parser";

/* ===============================================================
   🛡️ FAZ 53 — TCMB EXCHANGE RATE FETCHER (pure helper)
   ===============================================================
   TCMB (Türkiye Cumhuriyet Merkez Bankası) günlük döviz XML
   feed'ini çekip kanonik bir rate map'ine çevirir. DB'ye DOKUNMAZ;
   yalnız network fetch + parse. Caller upsert sorumluluğunu alır.

   KAYNAK:
     https://tcmb.gov.tr/kurlar/today.xml
     - Ücretsiz, API key gerektirmez
     - TRY base (her satır "1 X = N TRY")
     - Stabil; production'da yıllardır kullanılan endpoint
     - User-Agent gerekli (default Node UA bazen 403 alıyor)

   RATE SEMANTIC:
     ForexSelling: TCMB'nin "1 birim foreign currency için kaç TRY"
     değeri. Bu değer mevcut `currency.ts > convertPrice`'ın
     beklediği rate tipiyle birebir uyumlu:
       USD→TRY: amount * rate
       TRY→USD: amount / rate

   ÇIKTI:
     { TRY: 1, USD: number, EUR: number, GBP: number }
     - TRY hep 1 (base)
     - Bir kur çekilemezse 0 döner; caller decision yapar
       (mevcut /api/exchange-rates davranışı ile parity)
=============================================================== */

export type TcmbRates = {
  TRY: 1;
  USD: number;
  EUR: number;
  GBP: number;
};

export type TcmbFetchResult =
  | { ok: true; rates: TcmbRates }
  | { ok: false; error: string };

const TCMB_URL = "https://tcmb.gov.tr/kurlar/today.xml";
const REQUEST_TIMEOUT_MS = 8000;

type CurrencyRow = {
  ["@_CurrencyCode"]?: string;
  ForexSelling?: string | number;
};

function parseRate(currencies: CurrencyRow[], code: string): number {
  const row = currencies.find((c) => c?.["@_CurrencyCode"] === code);
  if (!row) return 0;
  const raw = String(row.ForexSelling ?? 0).trim();
  /* TCMB virgülle decimal yazıyor; Number() reddeder → "," → "." */
  const num = Number(raw.replace(",", "."));
  return Number.isFinite(num) && num > 0 ? num : 0;
}

export async function fetchTcmbRates(): Promise<TcmbFetchResult> {
  /* AbortController ile timeout — TCMB nadiren yavaş yanıt verebilir;
     8s sonra istemciyi yormamak için bağlantıyı düşürürüz. */
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(TCMB_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `TCMB HTTP ${response.status} ${response.statusText}`,
      };
    }
    const xml = await response.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const json = parser.parse(xml);
    const currencies = (json?.Tarih_Date?.Currency ||
      []) as CurrencyRow[];
    if (!Array.isArray(currencies) || currencies.length === 0) {
      return { ok: false, error: "TCMB XML boş veya parse edilemedi" };
    }
    const rates: TcmbRates = {
      TRY: 1,
      USD: parseRate(currencies, "USD"),
      EUR: parseRate(currencies, "EUR"),
      GBP: parseRate(currencies, "GBP"),
    };
    /* En azından USD ve EUR sıfır olmamalı — TCMB her zaman bunları
       döner. Üçü de 0 ise XML format'ı değişmiş demektir. */
    if (rates.USD === 0 && rates.EUR === 0 && rates.GBP === 0) {
      return { ok: false, error: "TCMB yanıtı tanınmayan formatta" };
    }
    return { ok: true, rates };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.name === "AbortError"
          ? "TCMB zaman aşımı"
          : err.message
        : "Bilinmeyen hata";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
