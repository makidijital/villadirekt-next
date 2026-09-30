import { NextResponse } from "next/server";

import { exchangeRateServerRepository } from "@/lib/db/exchange-rate.repository.server";
import { applyRateLimit } from "@/lib/rate-limit";

/* ===============================================================
   🛡️ PUBLIC EXCHANGE RATES — READ-ONLY
   ===============================================================
   Önceki davranış: her GET → TCMB XML fetch → parse → upsert →
   response. Bu pattern public read endpoint'ini bir write side-
   effect taşıyıcısına çeviriyordu (her ziyaret = 3 service-role
   upsert + dış fetch). Artık:
     • TCMB fetch + parse + upsert görevini cron yapıyor
       (`/api/cron/exchange-rates-refresh`, günlük 06:00)
     • Manuel refresh admin endpoint'i kalıyor
       (`/api/admin/exchange-rates/refresh`)
     • Bu public endpoint SADECE `exchange_rates` tablosundan
       okuyup mevcut JSON shape'ini byte-identical döner.

   RESPONSE SHAPE (DEĞİŞMEDİ):
     Success → { TRY: 1, USD: number, EUR: number, GBP: number }
     DB hatası → { error: string } + 500
     Bir currency satırı yoksa o code için 0 döner (mevcut
     `getRate` fallback davranışı ile parity).

   SERVICE-ROLE NEDEN:
     `exchange_rates` tablosu admin-only RLS pattern'ine uyduğunda
     anon SELECT boş döner. Service-role bypass + bu endpoint
     public read-only olduğu için risk yok (yalnız 4 sayısal değer
     dönüyor; secret içerik değil). Admin `current` route da aynı
     service-role pattern'ini kullanıyor.

   CACHE SEMANTICS:
     `runtime=nodejs` + `dynamic=force-dynamic` + `Cache-Control:
     no-store` → Next/proxy/CDN cache'lemesin. exchange_rates
     güncellenince public sayfa anında yeni değeri görsün.
     (Rate-limit zaten request başına çalışıyor; cache olsa idi
     limit anlamsızlaşırdı.)

   RATE-LIMIT KORUNDU:
     30 req/dk/IP. TCMB yükü kalktığı için artık daha çok
     "abuse koruması" rolünde; davranış parite için aynı limit.
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedCode = "USD" | "EUR" | "GBP";
const ALLOWED: AllowedCode[] = ["USD", "EUR", "GBP"];

export async function GET(req: Request) {
  const limited = await applyRateLimit(req, "exchange");
  if (limited) return limited;

  const { data, error } = await exchangeRateServerRepository.findCodeRate();

  if (error) {
    console.error("[public.exchange-rates] SELECT FAILED", error.message);
    return NextResponse.json(
      { error: error.message || "Kur alınamadı" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  type Row = { code: string | null; rate: number | string | null };
  const rows = (data || []) as Row[];

  /* Eski `getRate(code)` fallback'i ile parity: bilinmeyen ya da
     parse edilemeyen değer için 0. Frontend (CurrencyContext +
     reservations/* sayfaları) bu 0'ı bekleyebiliyor. */
  const lookup: Partial<Record<AllowedCode, number>> = {};
  for (const r of rows) {
    if (!r?.code) continue;
    const code = String(r.code).toUpperCase() as AllowedCode;
    if (!ALLOWED.includes(code)) continue;
    const num = Number(r.rate);
    if (Number.isFinite(num) && num > 0) lookup[code] = num;
  }

  const rates = {
    TRY: 1,
    USD: lookup.USD ?? 0,
    EUR: lookup.EUR ?? 0,
    GBP: lookup.GBP ?? 0,
  };

  return NextResponse.json(rates, {
    headers: { "Cache-Control": "no-store" },
  });
}
