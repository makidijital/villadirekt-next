import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { exchangeRateServerRepository } from "@/lib/db/exchange-rate.repository.server";

/* ===============================================================
   🛡️ FAZ 53A — ADMIN EXCHANGE RATES (GET, current snapshot)
   ===============================================================
   Admin Döviz Kurları kartının mount'ta okuduğu read-only endpoint.
   Refresh endpoint'i ile AYNI auth + service-role pattern; tek farkı
   TCMB fetch ve upsert yapmaz, sadece DB'deki mevcut snapshot'ı
   döner.

   Mevcut anon-client tabanlı `getExchangeRatesMap` service helper'ı
   şu durumlarda boş döndürebiliyordu:
     • exchange_rates tablosunda manuel RLS aktif edilmişse
     • Auth JWT henüz attach olmamışsa
   Bu endpoint service-role kullanarak RLS bypass eder; admin auth
   gate olduğu için public erişim yok.

   FLOW:
     1) Authorization: Bearer <token> doğrula
     2) service-role SELECT code, rate, updated_at
     3) USD/EUR/GBP whitelisted; geriye `{ ok, rates, updated_at }`
        normalize edip döner.
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AllowedCode = "USD" | "EUR" | "GBP";
const ALLOWED: AllowedCode[] = ["USD", "EUR", "GBP"];

export async function GET(req: Request) {
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

  const { data, error } =
    await exchangeRateServerRepository.findCodeRateUpdated();

  if (error) {
    console.error(
      "[admin.exchange-rates.current] SELECT FAILED",
      error.message
    );
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  type Row = {
    code: string | null;
    rate: number | string | null;
    updated_at: string | null;
  };

  const rows = (data || []) as Row[];
  const rates: Partial<Record<AllowedCode, number>> = {};
  let updatedAt: string | null = null;

  for (const r of rows) {
    if (!r?.code) continue;
    const code = String(r.code).toUpperCase() as AllowedCode;
    if (!ALLOWED.includes(code)) continue;
    /* PostgREST numeric(p,s) → string serialize edebilir; Number()
       her iki şekli (string/number) güvenli parse eder. */
    const num = Number(r.rate);
    if (!Number.isFinite(num) || num <= 0) continue;
    rates[code] = num;
    if (r.updated_at && (!updatedAt || r.updated_at > updatedAt)) {
      updatedAt = r.updated_at;
    }
  }

  return NextResponse.json({
    ok: true,
    rates,
    updated_at: updatedAt,
  });
}
