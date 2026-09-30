import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { manualReservationServerRepository } from "@/lib/db/manual-reservation.repository.server";

/* ===============================================================
   🛡️ /api/admin/manual-reservations — MANUAL RESERVATION LIST (admin-only)
   ===============================================================
   GET → admin "Bloklanan tarihler" liste sayfası için.

   ⚠️ NEDEN BU ROUTE VAR?
     manual_reservations PHASE 3 (migration 040) sonrası admin-only
     RLS aktif. Eski yol:

       app/(admin)/maki-admin/manual-reservations/page.tsx (RSC)
         └─→ getManualReservations() (service)
              └─→ manualReservationRepository.findList()  // db (anon)
                   └─→ db.from("manual_reservations").select(...)
                        └─→ ❌ RLS DENY (RSC no JWT) → [] silent fail

     RSC içinden anon `db` (module-level @/lib/db) session
     cookie/JWT TAŞIMAZ → RLS reddeder → liste sessizce boş döner;
     hata UI'a yansımaz.

     Bu route, /api/admin/reservations ile birebir aynı pattern'i
     uygular: adminFetch (Bearer) → server route → service-role
     repository. Admin sidebar listesi yine doğru veriyle render
     edilir; PII anon'a sıfır.

   ⚠️ BYTE-IDENTICAL CONTRACT:
     - SELECT shape: `id, start_date, end_date, note, created_at,
       villa:villa_id ( title )` — anon repo `findList()` ile aynen.
     - Order: `.order("created_at", { ascending: false })` aynen.
     - Response shape: `{ ok: true, manual_reservations: [...] }`
       caller eski `initialData` shape'i ile uyumlu (array of rows).
     - Error path: 500 + `{ ok: false, error }` — caller eski path'te
       de service `console.error + []` döndürüyordu; UI fallback yine
       boş liste.

   ⚠️ KAPSAM:
     Yalnız GET (read list). Manual reservation CRUD (create/edit/
     delete) client-side admin form'lardan service üzerinden anon
     `db` (browser session JWT) ile çalışmaya devam eder; o pathler
     `is_active_admin()` true olduğu için RLS izin verir. Bu route
     SADECE RSC-only path'i kapatmak için.

   AUTH:
     `authorizeAdminCaller` — Bearer token doğrulama + admin_users
     is_active kontrolü. /api/admin/reservations ile aynı pattern.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (manual_reservations) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "manual_reservations"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  /* 🧹 Migration 059 — geçmiş manuel blok cleanup (FAIL-SAFE).
     Fonksiyon kendi içinde atomik 24h throttle uygular → her açılışta
     değil, 24 saatte bir kez çalışır. Hata olursa SADECE loglanır;
     liste yanıtı (mevcut API contract) ASLA bozulmaz. */
  /* Cleanup metadata — fonksiyon dönüşü: >=0 silinen sayı, -1 throttle skip.
     ran=false (skip/hata) ya da deletedCount=0 ise UI statik kutuyu korur. */
  let cleanup: { ran: boolean; deletedCount: number } = {
    ran: false,
    deletedCount: 0,
  };
  try {
    const { data: cleanupData, error: cleanupError } =
      await manualReservationServerRepository.runThrottledCleanup();
    if (cleanupError) {
      console.error(
        "[admin.manual-reservations.cleanup] SKIPPED",
        cleanupError.message
      );
    } else if (typeof cleanupData === "number" && cleanupData >= 0) {
      cleanup = { ran: true, deletedCount: cleanupData };
    }
  } catch (e) {
    console.error("[admin.manual-reservations.cleanup] EXCEPTION", e);
  }

  const { data, error } =
    await manualReservationServerRepository.findList();

  if (error) {
    console.error(
      "[admin.manual-reservations.list] FAILED",
      error.message
    );
    return NextResponse.json(
      { ok: false, error: error.message || "Liste alınamadı" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    manual_reservations: data || [],
    cleanup,
  });
}
