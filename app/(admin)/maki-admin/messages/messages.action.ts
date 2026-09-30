"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import type { ContactMessageRow } from "@/types/database";
import {
  listMessages as listMessagesService,
  markAsRead as markAsReadService,
  archiveMessage as archiveMessageService,
  deleteMessage as deleteMessageService,
} from "@/app/services/contact-message.service";

/* ===============================================================
   🛡️ MESSAGES — SERVER ACTIONS (thin wrapper)
   ===============================================================
   Admin `messages/page.tsx` (client) → bu server action'lar →
   `contact-message.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder.
     İmzalar + dönüş tipleri service ile BİREBİR (davranış değişmez);
     amaç yalnız client→server sınırını oluşturup native repo'yu
     client bundle'a sızdırmamak.
   =============================================================== */

export async function listMessagesAction(opts?: {
  includeArchived?: boolean;
}): Promise<ContactMessageRow[]> {
  await requirePermission("messages");
  return listMessagesService(opts);
}

export async function markAsReadAction(
  id: string,
  isRead: boolean
): Promise<boolean> {
  await requirePermission("messages");
  return markAsReadService(id, isRead);
}

export async function archiveMessageAction(
  id: string,
  archived: boolean
): Promise<boolean> {
  await requirePermission("messages");
  return archiveMessageService(id, archived);
}

export async function deleteMessageAction(id: string): Promise<boolean> {
  await requirePermission("messages");
  return deleteMessageService(id);
}
