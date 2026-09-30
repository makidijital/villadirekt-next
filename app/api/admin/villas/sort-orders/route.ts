import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { setVillaSortOrders } from "@/app/services/villa-admin.service";
import type { VillaSortOrderUpdate } from "@/app/services/villa-admin/types";

/* ===============================================================
   🛡️ /api/admin/villas/sort-orders — VILLA BULK SORT (admin-only)
   ===============================================================
   POST { updates: [{ id, sort_order }, ...] }
     → setVillaSortOrders service delege
     → RPC `set_villa_sort_orders` (migration 006) tek transaction'da
       N satırı UPDATE eder

   FAZ 2 frontend purge — VillaSortableGrid (CLIENT) daha önce
   `setVillaSortOrders` service'ini DİREKT import ediyordu;
   `villa-admin.service` barrel'ı `hard-delete.service` (server-only
   `admin-gateway/server` chain) re-export ettiği için client bundle'a
   server-only direktifi sızıyordu. Bu route adminFetch (Bearer)
   arkasında SAME service delege; davranış BYTE-IDENTICAL:
     - aynı RPC, aynı payload shape (id + sort_order),
     - service'in `{ ok: boolean, error?: string }` return'u JSON.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (villas) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    updates?: unknown;
  };
  const updates = Array.isArray(body.updates)
    ? (body.updates as VillaSortOrderUpdate[])
    : null;
  if (!updates) {
    return NextResponse.json(
      { ok: false, error: "updates dizisi gerekli" },
      { status: 400 }
    );
  }

  const result = await setVillaSortOrders(updates);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error || "Sıralama kaydedilemedi" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
