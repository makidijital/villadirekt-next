"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import { getBlockedVillaIds } from "@/lib/availability.helper";

/* ===============================================================
   🛡️ AVAILABILITY — SERVER ACTION (thin wrapper, FAZ 4 S2 hotfix)
   ===============================================================
   `VillaListesiClient` (client) → bu server action → `availability.helper`
   (server; reservation.repository RPC `get_blocked_villa_ids`). Helper
   `Set<string>` döner; server action sınırında serializable kalması için
   burada `string[]`'e çevrilir. Set client tarafında yeniden kurulur
   (`new Set(await ...)`). Helper mantığı/RPC/algoritma AYNEN — yalnız
   wrapper + array serialize.
   =============================================================== */

export async function getBlockedVillaIdsAction(
  ...args: Parameters<typeof getBlockedVillaIds>
): Promise<string[]> {
  await requirePermission("villas");
  const set = await getBlockedVillaIds(...args);
  return Array.from(set);
}
