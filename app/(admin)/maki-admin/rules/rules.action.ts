"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  getRuleItems as getRuleItemsService,
  addRuleItem as addRuleItemService,
  updateRuleItem as updateRuleItemService,
  deleteRuleItem as deleteRuleItemService,
  type RuleItem,
} from "@/app/services/rule-item.service";

/* ===============================================================
   🛡️ RULE ITEMS — SERVER ACTIONS (thin wrapper)
   ===============================================================
   Admin `rules/page.tsx` (client) → bu server action'lar →
   `rule-item.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service ile BİREBİR (davranış değişmez); amaç yalnız
     client→server sınırını oluşturup native repo'yu client bundle'a
     sızdırmamak.
   =============================================================== */

export async function getRuleItemsAction(): Promise<RuleItem[]> {
  await requirePermission("rules");
  return getRuleItemsService();
}

export async function addRuleItemAction(title: string): Promise<boolean> {
  await requirePermission("rules");
  return addRuleItemService(title);
}

export async function updateRuleItemAction(
  id: string,
  title: string
): Promise<boolean> {
  await requirePermission("rules");
  return updateRuleItemService(id, title);
}

export async function deleteRuleItemAction(id: string): Promise<boolean> {
  await requirePermission("rules");
  return deleteRuleItemService(id);
}
