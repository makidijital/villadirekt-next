import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (pilotlar PASS). maybeSingle()/
   single()/SQLSTATE(23505)/text[] parity hazır; method yüzeyi + dönüş
   şekli aynen. Runtime testi yeşil olmadan production'a deploy edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ ADMIN USERS — SERVER-ONLY REPOSITORY (service-role)
   ===============================================================
   `admin_users` tablosu service-role DB I/O. `/api/admin-users/[id]`
   (DELETE) ve `/api/admin/create-user` (POST) route'ları bu repo
   üzerinden service-role ile okur/yazar/siler. Anon repository
   (`lib/db/admin-user.repository.ts`) admin browser CRUD'ını (RLS
   authenticated) AYNEN sürdürür — bu server repo ONUN DUPLİKASYONU
   DEĞİL, service-role karşılığıdır.

   ⚠️ NEDEN SERVICE-ROLE:
     Route'lar aynı zamanda `admin.auth.admin.createUser/deleteUser`
     (native auth Admin API) çağırır — bu service-role gerektirir ve
     route sunucu context'inde browser JWT taşımaz. DB query'leri de
     aynı service-role client ile gitmeli. `dbAdmin.from` ≡
     `dbAdmin.from` (dbAdmin wrapper) → route'ların eski
     inline çağrılarıyla BYTE-IDENTICAL. Anon `db`'ye düşürmek EXECUTION
     PATH / permission semantiğini değiştirir; ASLA yapılmaz.

   ⚠️ AUTH ADMIN API BU REPO'DA DEĞİL:
     `auth.admin.createUser/deleteUser` `.from()` DB query'si DEĞİLDİR —
     route'larda INLINE kalır (bu repo yalnız `admin_users` tablo I/O'su).

   GÜVENLİK SINIRI (pages/menu/blog .server konvansiyonu):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` → service-role (service-role kimlik bilgisi, NEXT_PUBLIC_
       prefix yok) → yalnız server runtime.

   DAVRANIŞ:
     - Native eski sağlayıcı `{ data, error }` döner; repo sessiz (throw/log
       YOK). Self-delete guard / rollback / dup-check kararı / audit /
       status / log caller'da (route) KALIR.
   =============================================================== */

export const adminUserServerRepository = {
  /** DELETE route — target fetch (id, auth_user_id, email),
   *  .maybeSingle(). Bağlı auth kaydı temizliği için auth_user_id lazım. */
  async findByIdForDelete(id: string) {
    return await dbAdmin
      .from("admin_users")
      .select("id, auth_user_id, email")
      .eq("id", id)
      .maybeSingle();
  },

  /** Delete by id. auth.admin.deleteUser SONRASI çağrılır (route
   *  orchestration). */
  async deleteById(id: string) {
    return await dbAdmin.from("admin_users").delete().eq("id", id);
  },

  /** CREATE route — duplicate check (email → id), .maybeSingle().
   *  409 kararı caller'da. */
  async findIdByEmail(email: string) {
    return await dbAdmin
      .from("admin_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
  },

  /** Insert — eklenen satırın id'sini döner (.select("id").single()).
   *  Caller payload'ı (auth_user_id dahil; password kolonu YOK) kurar;
   *  insert fail → route auth.admin.deleteUser rollback yapar. */
  async insert(payload: {
    full_name: string;
    email: string;
    sidebar_permissions: string[];
    is_active: boolean;
    auth_user_id: string;
  }) {
    return await dbAdmin
      .from("admin_users")
      .insert(payload)
      .select("id")
      .single();
  },

  /* 🛡️ AR-P1 — admin auth lookup (native twin). authorizeAdminToken'ın
     `dbAdmin.from("admin_users").select("id, email, is_active")`
     lookup'ının BYTE-IDENTICAL native karşılıkları (auth_user_id öncelik +
     email fallback). Row generic authorizeAdminToken'ın `row` tipiyle uyumlu
     → repoint'te (AR-P2) tip köprüsü gerekmez. maybeSingle davranışı aynen.
     ⚠️ ADDITIVE — henüz wire edilmedi. */
  async findAuthByAuthUserId(authUserId: string) {
    return await dbAdmin
      .from<{ id: string; email: string | null; is_active: boolean | null }>(
        "admin_users"
      )
      .select("id, email, is_active")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
  },

  async findAuthByEmail(email: string) {
    return await dbAdmin
      .from<{ id: string; email: string | null; is_active: boolean | null }>(
        "admin_users"
      )
      .select("id, email, is_active")
      .eq("email", email)
      .maybeSingle();
  },

  /* 🛡️ FAZ 1 (NATIVE AUTH) — ADDITIVE, henüz wire edilmedi.
     Native login için kimlik + parola state projeksiyonu. `password_hash`
     ve login-state kolonları migration 068 ile eklendi (nullable →
     mevcut eski sağlayıcı yolu etkilenmez). */
  async findCredentialsByEmail(email: string) {
    return await dbAdmin
      .from<{
        id: string;
        email: string | null;
        full_name: string | null;
        is_active: boolean | null;
        password_hash: string | null;
        sidebar_permissions: unknown;
        failed_attempts: number | null;
        locked_until: string | null;
        /* 🛡️ TOTP 2FA — ADDITIVE. login.service.ts'in şifre-doğru
           sonrası tek ek dallanması (issueSession mi, yoksa
           totp_required mı) için buradan okunur; ayrı round-trip
           gerekmez (hot path). Diğer TOTP state'i (secret, failed
           attempts, lock) yalnız totp_enabled=true iken, TOTP verify
           akışında admin-totp.repository.server.ts'ten ayrı çekilir. */
        totp_enabled: boolean | null;
      }>("admin_users")
      .select(
        "id, email, full_name, is_active, password_hash, sidebar_permissions, failed_attempts, locked_until, totp_enabled"
      )
      .eq("email", email)
      .maybeSingle();
  },

  /* 🛡️ FAZ 1 (NATIVE AUTH) — ADDITIVE. Native admin oluşturma:
     eski sağlayıcı auth.admin.createUser YOK; parola `password_hash` olarak
     yerel saklanır (auth_user_id gerekmez). Mevcut `insert()` (eski sağlayıcı
     yolu) AYNEN korunur; bu ayrı native yol. */
  async insertNative(payload: {
    full_name: string;
    email: string;
    password_hash: string;
    sidebar_permissions: string[];
    is_active: boolean;
  }) {
    return await dbAdmin
      .from("admin_users")
      .insert(payload)
      .select("id")
      .single();
  },

  /* 🛡️ FAZ 1 (NATIVE AUTH) — ADDITIVE. Refresh re-issue için id ile
     admin claim projeksiyonu (email + is_active + permissions). */
  async findByIdForSession(id: string) {
    return await dbAdmin
      .from<{
        id: string;
        email: string | null;
        full_name: string | null;
        is_active: boolean | null;
        sidebar_permissions: unknown;
        /* 🛡️ TOTP 2FA — ADDITIVE. /api/auth/me ve "Hesabım" ekranının
           mevcut 2FA durumunu göstermesi için (yalnız boolean — secret
           YOK). Mevcut caller'lar (refreshSession, totp-verify.service)
           bu alanı yok sayabilir. */
        totp_enabled: boolean | null;
      }>("admin_users")
      .select(
        "id, email, full_name, is_active, sidebar_permissions, totp_enabled"
      )
      .eq("id", id)
      .maybeSingle();
  },

  /* 🛡️ FAZ 1 (NATIVE AUTH) — ADDITIVE. Upgrade-on-login / şifre değişimi
     için password_hash güncelle (+ password_changed_at). */
  async updatePasswordHash(
    id: string,
    passwordHash: string,
    changedAtIso: string
  ) {
    return await dbAdmin
      .from("admin_users")
      .update({
        password_hash: passwordHash,
        password_changed_at: changedAtIso,
      })
      .eq("id", id);
  },

  /* 🛡️ FAZ 2 (NATIVE AUTH) — ADDITIVE. Login brute-force state.
     Sayaç caller'da hesaplanır (findCredentialsByEmail failed_attempts
     döndürür); query-builder SQL-expr desteklemediği için mutlak değer
     yazılır. */
  async recordLoginFailure(
    id: string,
    failedAttempts: number,
    lockedUntilIso: string | null
  ) {
    return await dbAdmin
      .from("admin_users")
      .update({ failed_attempts: failedAttempts, locked_until: lockedUntilIso })
      .eq("id", id);
  },

  async recordLoginSuccess(id: string, loginAtIso: string) {
    return await dbAdmin
      .from("admin_users")
      .update({
        failed_attempts: 0,
        locked_until: null,
        last_login_at: loginAtIso,
      })
      .eq("id", id);
  },
};
