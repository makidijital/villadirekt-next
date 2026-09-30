import { NextResponse } from "next/server";

import { reservationRepository } from "@/lib/db/reservation.repository";
import { applyRateLimit } from "@/lib/rate-limit";

/* ===============================================================
   🛡️ /api/public/villas/[id]/blocked-ranges — PUBLIC AVAILABILITY
   ===============================================================
   GET → `get_villa_blocked_ranges(p_villa_id)` SECURITY DEFINER RPC
   delegation. Yalnız blocked date range'leri döner; PII (name/phone/
   total_price) browser'a ASLA gelmez (RPC içi enforcement, migration
   039).

   FAZ 2 frontend purge — daha önce `useBookingEngine.ts` ve
   `lib/villa-availability.helper.ts` DOĞRUDAN anon `db.rpc(...)`
   çağırıyordu. Bu route fetch boundary arkasında aynı RPC'yi delege
   eder; davranış BYTE-IDENTICAL:
     - Aynı RPC, aynı `p_villa_id` argümanı
     - Aynı return shape: `{ kind, status, start_date, end_date }[]`
     - Empty array fallback aynen (hata → ranges: [])
     - Status allow-list (pending+confirmed) + manual ayrımı RPC içinde
     - SECURITY DEFINER context korunur (`grant execute ... to anon,
       authenticated, service_role` — 039)

   CACHE: `no-store` (availability gerçek-zamanlı; mevcut
   `/api/public/villas/[id]/availability` ile simetrik).

   CONCURRENCY: read-only; booking conflict yine `check_villa_
   availability_conflict` RPC + DB EXCLUDE constraint ile INSERT
   anında enforce edilir (POST /api/public/reservations).
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  /* 🛡️ RATE LIMIT — public availability bucket (mevcut /availability
     route'u ile aynı pattern + threshold). Bot/scraper abuse koruması;
     normal booking calendar render başına 1 fetch yaptığından 30/dk/IP
     gerçek kullanıcıyı asla etkilemez. Threshold lib/rate-limit.ts'te
     centralized. */
  const limited = await applyRateLimit(req, "availability");
  if (limited) return limited;

  const { id } = await ctx.params;

  /* Defansif id validation — UUID enforcement yapılmaz (RPC zaten
     geçersiz formatta empty döner) ama tip + boş string erken-reddi. */
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return NextResponse.json(
      { ok: true, ranges: [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const { data, error } = await reservationRepository.getBlockedRanges(id);

  if (error) {
    /* Eski client davranışı: `console.error("❌ rezervasyon çekme:", error)`
       sonra `return` (state'i set etmedi). Route empty array döner;
       caller eski path'le BYTE-IDENTICAL fail-soft uygular. */
    console.error(
      "[public.blocked-ranges] get_villa_blocked_ranges FAILED",
      error.message
    );
    return NextResponse.json(
      { ok: true, ranges: [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { ok: true, ranges: data || [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}
