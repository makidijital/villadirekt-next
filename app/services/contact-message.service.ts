import { contactMessageRepository } from "@/lib/db/contact-message.repository";
import type { ContactMessageRow } from "@/types/database";

/* ===============================================================
   🛡️ CONTACT MESSAGE SERVICE (migration 015)
   ===============================================================
   /iletisim form submit + /maki-admin/messages CRUD.
   Mevcut service pattern'lerine uyumlu (boolean return + error
   logging). RLS:
     - createContactMessage anon-friendly (anon INSERT policy)
     - listMessages / markAsRead / archiveMessage authenticated
       (admin native auth ile authenticate'lı)

   Pricing / reservation / availability'e SIFIR dokunuş.
   =============================================================== */

export type ContactMessageInput = {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  message: string;
  source_page?: string | null;
};

/* ----- CREATE (public form submit) -----
   Native provider (tek app rolü) → RLS/session-DI gerekmez; validation/
   payload AYNEN. Public API route'u bu fonksiyonu doğrudan çağırır. */
export async function createContactMessage(
  input: ContactMessageInput
): Promise<{ ok: boolean; error?: string }> {
  const payload = {
    full_name: input.full_name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    message: input.message.trim(),
    source_page: input.source_page?.trim() || null,
    is_read: false,
  };
  const { error } = await contactMessageRepository.create(payload);
  if (error) {
    console.error("❌ createContactMessage error:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/* ----- LIST (admin) — created_at DESC, archived hariç ----- */
export async function listMessages(opts?: {
  includeArchived?: boolean;
}): Promise<ContactMessageRow[]> {
  const { data, error } = await contactMessageRepository.findAll(
    opts?.includeArchived
  );
  if (error) {
    console.error("❌ listMessages error:", error.message);
    return [];
  }
  return (data || []) as ContactMessageRow[];
}

/* ----- READ TOGGLE ----- */
export async function markAsRead(
  id: string,
  isRead: boolean
): Promise<boolean> {
  const { error } = await contactMessageRepository.updateById(id, {
    is_read: isRead,
  });
  if (error) {
    console.error("❌ markAsRead error:", error.message);
    return false;
  }
  return true;
}

/* ----- ARCHIVE / UNARCHIVE ----- */
export async function archiveMessage(
  id: string,
  archived: boolean
): Promise<boolean> {
  const { error } = await contactMessageRepository.updateById(id, {
    archived_at: archived ? new Date().toISOString() : null,
  });
  if (error) {
    console.error("❌ archiveMessage error:", error.message);
    return false;
  }
  return true;
}

/* ----- DELETE (kalıcı silme) ----- */
export async function deleteMessage(id: string): Promise<boolean> {
  const { error } = await contactMessageRepository.deleteById(id);
  if (error) {
    console.error("❌ deleteMessage error:", error.message);
    return false;
  }
  return true;
}
