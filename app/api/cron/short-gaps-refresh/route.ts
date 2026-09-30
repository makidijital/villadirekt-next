import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/cron-auth";
import { shortGapsServerRepository } from "@/lib/db/short-gaps.repository.server";

/* ===============================================================
   🛡️ CRON — SHORT GAPS REFRESH (thin wrapper)
   ===============================================================
   Coolify Scheduled Task: `0 4 * * *` (UTC) → Kısa Süreli Tarihler
   precompute tablosunu (villa_short_gaps) tazeler ve ufku bir gün
   ileri kaydırır.

   ⚠️ TASARIM PRENSİBİ:
     Boşluk hesabı tamamen DB tarafında (053 migration
     `refresh_villa_short_gaps()` SECURITY DEFINER fonksiyonu). Bu cron
     yalnız o fonksiyonu çağıran ince bir wrapper — gap hesap mantığına,
     migration'a, availability/booking/iCal sistemlerine DOKUNMAZ.

   ⚠️ Diğer cron route'larıyla (exchange-rates / *-cleanup) BİREBİR aynı
     desen: authorizeCronRequest (Bearer CRON_SECRET) + service-role
     client + tek RPC + JSON yanıt. Admin context / activity log YOK
     (cron operasyonu admin değildir).

   RPC dönüşü: integer (yazılan boşluk satırı sayısı) → `count`.
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

  const { data, error } =
    await shortGapsServerRepository.refreshVillaShortGaps();

  if (error) {
    console.error("[cron.short-gaps-refresh] FAILED", {
      message: error.message,
    });
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const count = Number(data ?? 0);
  console.log("[cron.short-gaps-refresh] OK", { count });
  return NextResponse.json({ ok: true, count });
}
