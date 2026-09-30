import "server-only";

/* 🛡️ FAZ 1 (NATIVE AUTH) — admin_sessions native repo. Mevcut
   `.server.ts` repo konvansiyonu (dbAdminNative, sessiz {data,error},
   karar caller'da) BİREBİR. ⚠️ Henüz wire edilmedi. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ ADMIN SESSIONS — SERVER-ONLY REPOSITORY (native)
   ===============================================================
   `admin_sessions` tablosu I/O. Refresh/session yaşam döngüsü:
     create → findActiveByRefreshHash → rotate/touch → revoke.
   Refresh token DB'de HAM tutulmaz; caller `hashRefreshToken` ile
   SHA-256 geçirir. is_active/expiry/rotation KARARI caller'da (session
   service). Repo sessiz {data,error} döner (throw/log YOK) — mevcut
   repo deseni.
   =============================================================== */

export interface AdminSessionRow {
  id: string;
  admin_id: string;
  refresh_token_hash: string;
  user_agent: string | null;
  ip: string | null;
  remember: boolean;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export const adminSessionServerRepository = {
  /** Yeni session — eklenen satırı döner (.select().single()). */
  async create(payload: {
    admin_id: string;
    refresh_token_hash: string;
    user_agent: string | null;
    ip: string | null;
    remember: boolean;
    expires_at: string;
  }) {
    return await dbAdmin
      .from<AdminSessionRow>("admin_sessions")
      .insert(payload)
      .select(
        "id, admin_id, refresh_token_hash, user_agent, ip, remember, created_at, last_used_at, expires_at, revoked_at"
      )
      .single();
  },

  /** Aktif (revoked değil + süresi geçmemiş) session'ı refresh hash ile bul. */
  async findActiveByRefreshHash(refreshTokenHash: string, nowIso: string) {
    return await dbAdmin
      .from<AdminSessionRow>("admin_sessions")
      .select(
        "id, admin_id, refresh_token_hash, user_agent, ip, remember, created_at, last_used_at, expires_at, revoked_at"
      )
      .eq("refresh_token_hash", refreshTokenHash)
      .is("revoked_at", null)
      .gt("expires_at", nowIso)
      .maybeSingle();
  },

  /** Refresh rotation — yeni hash + last_used_at (+ opsiyonel expires_at). */
  async rotate(
    id: string,
    payload: {
      refresh_token_hash: string;
      last_used_at: string;
      expires_at?: string;
    }
  ) {
    return await dbAdmin
      .from("admin_sessions")
      .update(payload)
      .eq("id", id);
  },

  /** Tek session iptal (logout). */
  async revokeById(id: string, revokedAtIso: string) {
    return await dbAdmin
      .from("admin_sessions")
      .update({ revoked_at: revokedAtIso })
      .eq("id", id);
  },

  /** Bir admin'in TÜM aktif session'larını iptal (pasifleştirme /
   *  "tüm cihazlardan çık"). */
  async revokeAllForAdmin(adminId: string, revokedAtIso: string) {
    return await dbAdmin
      .from("admin_sessions")
      .update({ revoked_at: revokedAtIso })
      .eq("admin_id", adminId)
      .is("revoked_at", null);
  },

  /** Süresi geçmiş kayıt temizliği (cleanup job). */
  async deleteExpired(beforeIso: string) {
    return await dbAdmin
      .from("admin_sessions")
      .delete()
      .lt("expires_at", beforeIso);
  },
};
