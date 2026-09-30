import "server-only";

import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ TOTP 2FA — SERVER-ONLY REPOSITORY (native)
   ===============================================================
   `admin_users`'ın TOTP kolonları + `admin_totp_recovery_codes`
   tablosu I/O. Mevcut `.server.ts` repo konvansiyonu (dbAdminNative,
   sessiz {data,error}, karar caller'da) BİREBİR — `admin-session.
   repository.server.ts` ile aynı desen.

   ⚠️ `totp_secret` kolonunda YALNIZ ŞİFRELİ (AES-256-GCM, bkz.
     `lib/auth/native/totp.ts`) değer tutulur — bu repo şifreleme/
     çözme YAPMAZ, ham string'i olduğu gibi yazar/okur. Encrypt/
     decrypt caller'ın (route/service) sorumluluğu.

   ⚠️ `admin_totp_recovery_codes.code_hash` — Argon2id hash (mevcut
     `lib/auth/native/password.ts` reuse). Bu repo hash'leme/doğrulama
     YAPMAZ; yalnız satır I/O.
   =============================================================== */

export interface AdminTotpState {
  id: string;
  totp_secret: string | null;
  totp_enabled: boolean;
  totp_enrolled_at: string | null;
  totp_failed_attempts: number;
  totp_locked_until: string | null;
}

export interface AdminTotpRecoveryCodeRow {
  id: string;
  admin_id: string;
  code_hash: string;
  created_at: string;
  used_at: string | null;
}

export const adminTotpServerRepository = {
  /** Enrollment/verify/disable akışları için admin'in TOTP durumu. */
  async getStateById(id: string) {
    return await dbAdmin
      .from<AdminTotpState>("admin_users")
      .select(
        "id, totp_secret, totp_enabled, totp_enrolled_at, totp_failed_attempts, totp_locked_until"
      )
      .eq("id", id)
      .maybeSingle();
  },

  /** Enrollment/start — şifreli secret yazılır, `totp_enabled` DEĞİŞMEZ
   *  (ilk doğru kod onaylanana kadar false kalır). */
  async setPendingSecret(id: string, encryptedSecret: string) {
    return await dbAdmin
      .from("admin_users")
      .update({ totp_secret: encryptedSecret })
      .eq("id", id);
  },

  /** Enrollment/confirm başarılı — 2FA aktif edilir + brute-force
   *  sayaçları sıfırlanır. */
  async enable(id: string, nowIso: string) {
    return await dbAdmin
      .from("admin_users")
      .update({
        totp_enabled: true,
        totp_enrolled_at: nowIso,
        totp_failed_attempts: 0,
        totp_locked_until: null,
      })
      .eq("id", id);
  },

  /** Disable/reset — secret silinir, enabled=false, sayaçlar sıfırlanır.
   *  Recovery code'lar İÇERMEZ (caller ayrıca `deleteAllRecoveryCodes`
   *  çağırmalı — iki ayrı tablo, tek transaction garantisi yok ama
   *  sıralama: önce codes silinir, sonra bu — bkz. route orkestrasyonu). */
  async disable(id: string) {
    return await dbAdmin
      .from("admin_users")
      .update({
        totp_enabled: false,
        totp_secret: null,
        totp_enrolled_at: null,
        totp_failed_attempts: 0,
        totp_locked_until: null,
      })
      .eq("id", id);
  },

  /** TOTP brute-force state — `login.service.ts`'teki
   *  `recordLoginFailure`'ın TOTP karşılığı. */
  async recordTotpFailure(
    id: string,
    failedAttempts: number,
    lockedUntilIso: string | null
  ) {
    return await dbAdmin
      .from("admin_users")
      .update({
        totp_failed_attempts: failedAttempts,
        totp_locked_until: lockedUntilIso,
      })
      .eq("id", id);
  },

  /** Başarılı TOTP/recovery doğrulama — sayaç sıfırlanır. */
  async recordTotpSuccess(id: string) {
    return await dbAdmin
      .from("admin_users")
      .update({ totp_failed_attempts: 0, totp_locked_until: null })
      .eq("id", id);
  },

  /* ---------------------------------------------------------------
     RECOVERY CODES
  --------------------------------------------------------------- */

  /** Toplu insert — enrollment/confirm ve "kodları yenile" akışlarında
   *  kullanılır. `hashes` zaten Argon2id ile hash'lenmiş olmalı. */
  async insertRecoveryCodes(adminId: string, hashes: string[]) {
    const rows = hashes.map((code_hash) => ({ admin_id: adminId, code_hash }));
    return await dbAdmin.from("admin_totp_recovery_codes").insert(rows);
  },

  /** Kullanılmamış (used_at IS NULL) tüm kodlar — recovery-code verify
   *  akışında caller her birine karşı `verifyPassword` (Argon2id) dener. */
  async findUnusedRecoveryCodes(adminId: string) {
    return await dbAdmin
      .from<AdminTotpRecoveryCodeRow>("admin_totp_recovery_codes")
      .select("id, admin_id, code_hash, created_at, used_at")
      .eq("admin_id", adminId)
      .is("used_at", null);
  },

  /** Eşleşen kodu tüketir (tek kullanımlık) — 🛡️ M-2 SECURITY FIX:
   *  ATOMİK compare-and-swap. `used_at IS NULL` WHERE koşulu + tek
   *  UPDATE...RETURNING statement'ı (Postgres'te tek statement zaten
   *  atomik — ayrı transaction/lock GEREKMEZ). İki concurrent request
   *  aynı satırı aynı anda tüketmeye çalışırsa yalnız BİRİ RETURNING'de
   *  satır alır (`data` dolu); kaybeden `data: null` görür (satır ya
   *  yok ya da `used_at` artık NULL değil). Caller (totp-verify.
   *  service.ts) `data` null ise kodu "zaten kullanılmış/geçersiz"
   *  kabul ETMELİ, session AÇMAMALI — önceki (non-atomik) davranışta
   *  iki concurrent request aynı kodla İKİ ayrı session alabiliyordu
   *  (TOCTOU race), bu artık imkansız. */
  async markRecoveryCodeUsed(id: string, usedAtIso: string) {
    return await dbAdmin
      .from<{ id: string }>("admin_totp_recovery_codes")
      .update({ used_at: usedAtIso })
      .eq("id", id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
  },

  /** Kullanılmamış kod sayısı — "hesabım" ekranında uyarı göstermek için
   *  (ör. "3 kurtarma kodunuz kaldı"). */
  async countUnusedRecoveryCodes(adminId: string) {
    const { data, error } = await dbAdmin
      .from<{ id: string }>("admin_totp_recovery_codes")
      .select("id")
      .eq("admin_id", adminId)
      .is("used_at", null);
    return { count: data ? data.length : 0, error };
  },

  /** Admin'in TÜM kurtarma kodlarını siler — disable/reset ve
   *  "kodları yenile" (eskiler geçersiz olur) akışlarında kullanılır. */
  async deleteAllRecoveryCodes(adminId: string) {
    return await dbAdmin
      .from("admin_totp_recovery_codes")
      .delete()
      .eq("admin_id", adminId);
  },
};
