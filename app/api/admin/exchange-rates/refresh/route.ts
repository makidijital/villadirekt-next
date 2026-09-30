import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { exchangeRateServerRepository } from "@/lib/db/exchange-rate.repository.server";
import { fetchTcmbRates } from "@/lib/exchange-rate.tcmb";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";

/* ===============================================================
   🛡️ FAZ 53 — ADMIN EXCHANGE RATES REFRESH (POST, auth-guarded)
   ===============================================================
   Manuel olarak admin tarafından çalıştırılan kur güncelleme
   endpoint'i. Public /api/exchange-rates GET DEĞİŞMEDİ —
   reservation form / CurrencyContext aynı kontrat üzerinden
   çalışmaya devam eder.

   FLOW:
     1) Authorization: Bearer <access_token> doğrula (admin_users
        is_active true)
     2) TCMB XML fetch + parse (lib/exchange-rate.tcmb.ts)
     3) service-role ile upsert (TRY hariç USD/EUR/GBP)
     4) JSON yanıt: { ok, rates, updated_at }

   GÜVENLİK:
     - Yalnız authenticated admin (eski sağlayıcı JWT + admin_users lookup)
     - Service-role key sadece sunucu tarafında; client'a hiç çıkmaz
     - TCMB token gerektirmiyor — public veri kaynağı
     - Rate limit YOK (manuel admin tetiklemesi; sayfa yenilemekle
       sınırlı pratik trafik)

   CACHE INVALIDATION:
     - exchange_rates direkt fetch ediliyor (cache wrapper yok şu an;
       cache.helpers.ts'te `exchange-rates` tag tanımlı değil)
     - Public CurrencyContext useEffect ile fetch ediyor; refresh
       sonrası sayfa yenilenince güncel görünür.
     - Eğer ileride `getCachedExchangeRates` eklenirse, burada
       `revalidateTag("exchange-rates")` çağrılır.
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  /* 1) Admin authorization */
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (settings) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "settings"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  /* 🛡️ FAZ 55B — BEFORE SNAPSHOT (activity log diff için)
     TCMB fetch'inden ÖNCE mevcut DB rate'lerini çek. Hata olursa
     before null kalır (logger fail-safe; ana operation etkilenmez). */
  let beforeRates: Record<string, number> | null = null;
  try {
    const { data: beforeRows } =
      await exchangeRateServerRepository.findCodeRate();
    if (Array.isArray(beforeRows)) {
      const acc: Record<string, number> = {};
      for (const r of beforeRows as Array<{
        code: string | null;
        rate: number | string | null;
      }>) {
        if (!r?.code) continue;
        const n = Number(r.rate);
        if (Number.isFinite(n) && n > 0) acc[String(r.code).toUpperCase()] = n;
      }
      beforeRates = acc;
    }
  } catch {
    /* before snapshot best-effort; ana operation etkilenmez */
  }

  /* 2) TCMB fetch */
  const tcmb = await fetchTcmbRates();
  if (!tcmb.ok) {
    return NextResponse.json(
      { ok: false, error: tcmb.error },
      { status: 502 }
    );
  }

  /* 3) Upsert — service-role, RLS bypass; iki çağrı arasında time-
        stamp tutarlı olsun diye tek timestamp kullanılır. */
  const updatedAt = new Date().toISOString();
  const writes: Array<{ code: string; rate: number; updated_at: string }> = [];
  for (const [code, rate] of Object.entries(tcmb.rates) as Array<
    [string, number]
  >) {
    if (code === "TRY") continue;
    writes.push({ code, rate, updated_at: updatedAt });
  }

  /* Single batch upsert (mevcut /api/exchange-rates loop pattern'i
     yerine atomic batch — daha az round-trip, aynı sonuç). */
  const { error } = await exchangeRateServerRepository.upsert(writes);

  if (error) {
    console.error(
      "[admin.exchange-rates.refresh] UPSERT FAILED",
      error.message
    );
    return NextResponse.json(
      { ok: false, error: "Veritabanı güncellenemedi: " + error.message },
      { status: 500 }
    );
  }

  /* 🛡️ FAZ 55B — AUDIT LOG (additive, fail-safe)
     Refresh başarılı olduktan sonra activity log insert. Logger
     try/catch kaplı; fail durumunda console.warn dışında etki yok.
     Çıktı: before/after rate map'leri ile diff_summary otomatik
     compute edilir (örn. "USD: 45.4123 → 45.6210"). */
  const ctx = extractAdminContextFromRequest(req, auth.caller);
  /* await ediyoruz — küçük DB write, response'tan önce yazılsın
     (UI re-fetch ettiğinde audit kayıt zaten DB'de). */
  await insertAdminActivityLog(ctx, {
    action: "exchange_rates.refreshed",
    entity_type: "exchange_rates",
    entity_title: "TCMB Exchange Rates",
    before_data: beforeRates,
    after_data: {
      USD: tcmb.rates.USD,
      EUR: tcmb.rates.EUR,
      GBP: tcmb.rates.GBP,
    },
  });

  return NextResponse.json({
    ok: true,
    rates: tcmb.rates,
    updated_at: updatedAt,
  });
}
