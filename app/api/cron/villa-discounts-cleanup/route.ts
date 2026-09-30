import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/cron-auth";
import { villaDiscountRepository } from "@/lib/db/villa-discount.repository.server";

/* ===============================================================
   🛡️ CRON — VILLA DISCOUNTS CLEANUP (thin wrapper)
   ===============================================================
   Coolify Scheduled Task: `15 0 * * *` (00:15 UTC = 03:15 TR) → tamamen
   geçmiş indirim kayıtlarını (villa_discounts, `end_date < CURRENT_DATE`)
   siler.

   ⚠️ `/api/cron/villa-prices-cleanup` route'unun BİREBİR KARDEŞİ —
     authorizeCronRequest (Bearer CRON_SECRET, fail-closed) + server-only
     repo + tek DELETE + JSON yanıt. Admin context / activity log YOK
     (cron operasyonu admin değildir). Yeni mimari YOK.

   ⚠️ TASARIM:
     - `end_date < today` STRICT `<`. BUGÜN biten indirim KORUNUR;
       ertesi gün silinir. `<=` KULLANILMAZ.
       Örnek: indirim 10–17 Eylül → 17 Eylül'de KALIR, 18 Eylül'de SİLİNİR.
     - Bu eşik, public (cache.helpers > getCachedDiscountCollectionVillas)
       ve admin (discount-collection.service > listDiscountCollection)
       görünürlük filtreleriyle (`end_date >= bugün` → görünür) TAM
       SİMETRİK. Yani silinen kayıtlar zaten hiçbir yerde görünmüyordu.
     - `today` = CURRENT_DATE eşdeğeri; indirim tarihleri admin tarafından
       TR-local girildiğinden Europe/Istanbul takvim günü ("YYYY-MM-DD")
       baz alınır (villa-prices-cleanup ile BİREBİR aynı ifade).
     - Idempotent: eşleşen satır yoksa `deleted: 0`, hata yok.
     - `discount_collections` tablosuna DOKUNMAZ (okumaz/yazmaz/silmez);
       `is_active` ve küratörlük alanları KORUNUR.
     - reservation snapshot (migration 080) / price engine / booking
       engine / availability / cache tag'lerine DOKUNMAZ.

   Yanıt: { ok, deleted (silinen satır), date (bugün) }.
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

  /* CURRENT_DATE eşdeğeri — TR takvim günü (indirim tarihleri TR-local).
     en-CA locale "YYYY-MM-DD" üretir → date kolonuyla doğru karşılaştırma. */
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Istanbul",
  });

  const { count, error } =
    await villaDiscountRepository.deletePastDiscounts(today);

  if (error) {
    console.error("[cron.villa-discounts-cleanup] FAILED", {
      date: today,
      message: error.message,
    });
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const deleted = count ?? 0;
  console.log("[cron.villa-discounts-cleanup] OK", { deleted, date: today });
  return NextResponse.json({ ok: true, deleted, date: today });
}
