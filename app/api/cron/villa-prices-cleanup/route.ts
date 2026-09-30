import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/cron-auth";
import { villaPriceServerRepository } from "@/lib/db/villa-price.repository.server";

/* ===============================================================
   🛡️ CRON — VILLA PRICES CLEANUP (thin wrapper)
   ===============================================================
   Coolify Scheduled Task: `0 0 * * *` (00:00 UTC = 03:00 TR) → geçmişte
   kalan sezon fiyatlarını (villa_prices, `end_date < CURRENT_DATE`) siler.

   ⚠️ Diğer cron route'larıyla (short-gaps-refresh / *-cleanup) BİREBİR
     aynı desen: authorizeCronRequest (Bearer CRON_SECRET) + service-role
     repo + tek DELETE + JSON yanıt. Admin context / activity log YOK.

   ⚠️ TASARIM:
     - `end_date < today` STRICT `<` (mail-log cleanup `.lt` deseni).
       Bugün biten sezon KORUNUR; ertesi gün silinir. `<=` KULLANILMAZ.
     - `today` = CURRENT_DATE eşdeğeri; sezon tarihleri TR-local
       girildiğinden Europe/Istanbul takvim günü ("YYYY-MM-DD") baz alınır.
     - Idempotent: eşleşen satır yoksa `deleted: 0`, hata yok.
     - reservation / snapshot / booking engine / price-verify / voucher /
       mail / ödeme sistemine DOKUNMAZ — yalnız geçmiş fiyat satırları.

   Yanıt: { ok, deleted (silinen satır), date (bugün), }.
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

  /* CURRENT_DATE eşdeğeri — TR takvim günü (season tarihleri TR-local).
     en-CA locale "YYYY-MM-DD" üretir → date kolonuyla doğru karşılaştırma. */
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Istanbul",
  });

  const { count, error } =
    await villaPriceServerRepository.deletePastSeasons(today);

  if (error) {
    console.error("[cron.villa-prices-cleanup] FAILED", {
      date: today,
      message: error.message,
    });
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const deleted = count ?? 0;
  console.log("[cron.villa-prices-cleanup] OK", { deleted, date: today });
  return NextResponse.json({ ok: true, deleted, date: today });
}
