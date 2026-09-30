import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/cron-auth";
import { exchangeRateServerRepository } from "@/lib/db/exchange-rate.repository.server";
import { fetchTcmbRates } from "@/lib/exchange-rate.tcmb";

/* ===============================================================
   🛡️ CRON — EXCHANGE RATES REFRESH (thin wrapper)
   ===============================================================
   Zamanlama: `0 6 * * *` (UTC) → 09:00 TR saati (Coolify Scheduled Task).
   TCMB merkez bankası gün içi 15:30 TR'ye kadar günceller; sabah
   ilk refresh ile günlük başlangıç kuru DB'de hazır olur.

   ⚠️ TASARIM PRENSİBİ:
     Mevcut `/api/admin/exchange-rates/refresh` route'u (admin manuel
     trigger) AYNEN korunur. Bu cron wrapper paralel endpoint —
     business logic (TCMB fetch + upsert) BYTE-IDENTICAL.

   ⚠️ FAZ 53 admin route'undan kopya MİNİMUM iş yapan kısım:
     1. TCMB XML fetch (fetchTcmbRates)
     2. service-role upsert (TRY hariç USD/EUR/GBP)
     3. JSON yanıt
     Admin route'undaki `extractAdminContextFromRequest` + activity
     log YOK (cron context admin değil).

   ⚠️ BEFORE SNAPSHOT diff log YOK:
     Admin route activity log için before/after diff hesaplıyordu.
     Cron için bu gereksiz; refresh sonucu uygulama log'ları +
     console.log'da görünür. DB upsert davranışı aynen.
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = authorizeCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* TCMB fetch */
  const tcmb = await fetchTcmbRates();
  if (!tcmb.ok) {
    console.error(
      "[cron.exchange-rates-refresh] TCMB_FAILED",
      tcmb.error
    );
    return NextResponse.json(
      { ok: false, error: tcmb.error },
      { status: 502 }
    );
  }

  /* Upsert — admin route ile birebir aynı pattern. Tek timestamp
     atomic batch'te uygulanır. */
  const updatedAt = new Date().toISOString();
  const writes: Array<{ code: string; rate: number; updated_at: string }> = [];
  for (const [code, rate] of Object.entries(tcmb.rates) as Array<
    [string, number]
  >) {
    if (code === "TRY") continue;
    writes.push({ code, rate, updated_at: updatedAt });
  }

  const { error } = await exchangeRateServerRepository.upsert(writes);

  if (error) {
    console.error(
      "[cron.exchange-rates-refresh] UPSERT_FAILED",
      error.message
    );
    return NextResponse.json(
      { ok: false, error: "Veritabanı güncellenemedi: " + error.message },
      { status: 500 }
    );
  }

  console.log(
    "[cron.exchange-rates-refresh] DONE",
    `codes=${writes.map((w) => w.code).join(",")}`
  );

  return NextResponse.json({
    ok: true,
    rates: tcmb.rates,
    updated_at: updatedAt,
  });
}
