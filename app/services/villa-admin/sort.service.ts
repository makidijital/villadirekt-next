/* 🛡️ FAZ 2 STABILIZATION — server-role villaAdminRepository (dbAdmin).
   Mutation flow; RLS bypass için server-only repo (BYTE-IDENTICAL
   imzalar). Service AST intact. */
import { villaAdminRepository } from "@/lib/db/villa.repository.server";

import type {
  VillaSortOrderUpdate,
  VillaServiceResult,
} from "./types";

/* ===============================================================
   🛡️ FAZ 3 — BULK SORT ORDER — setVillaSortOrders
   ===============================================================
   Drag-drop sonrası N satırı tek round-trip'te günceller. RPC
   `set_villa_sort_orders` (db/migrations/006) jsonb array alır ve
   tek transaction'da UPDATE eder; Promise.all ile N parallel call
   yerine kullanılır.

   INPUT FORMAT:
     VillaSortOrderUpdate[]  — explicit typed payload
   =============================================================== */

export async function setVillaSortOrders(
  updates: VillaSortOrderUpdate[]
): Promise<VillaServiceResult> {
  if (!updates || updates.length === 0) return { ok: true };

  const payload: VillaSortOrderUpdate[] = updates.map((u) => ({
    id: String(u.id),
    sort_order: Number.isFinite(u.sort_order) ? Number(u.sort_order) : 0,
  }));

  /* FAZ 37: RPC delegation; parameter shape ({ p_updates }) AYNEN
     repo içinde. Boş array early return service edge'de. */
  const { error } = await villaAdminRepository.rpcSetVillaSortOrders(
    payload
  );

  if (error) {
    console.error("[villa.setSortOrders] FAILED", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
