import "server-only";

/* ===============================================================
   🛡️ ADMIN USERS — PANEL NATIVE TWIN (SERVER-ONLY, Migration AU-P1)
   ===============================================================
   Anon `lib/db/admin-user.repository.ts` (`adminUserRepository`;
   dbNative, RLS-authenticated browser CRUD) yerine native
   PostgreSQL karşılığı. Provider `dbAdminNative` (native pg, tek app
   rolü; RLS-free — admin_users authz app-layer'a taşınır).

   ⚠️ NEDEN AYRI DOSYA (AU-P0 kararı):
     `admin-user.repository.server.ts` (`adminUserServerRepository`)
     AYRI concern: create/delete route'ları + `auth.admin` API (route-
     only). Bu twin ise panel browser-CRUD'ının (list/detail/update)
     native karşılığı. Karıştırılmaz — net ayrım.

   ⚠️ AUTHORIZATION:
     admin_users RLS (migration 038) `authenticated + is_active_admin()`;
     anon erişim yok. Native `dbAdmin` RLS-free → `is_active_admin()`
     gate BYPASS edilir. Bu twin'i çağıran route handler MUTLAKA
     `authorizeAdminCaller(req)` arkasında olmalı (RLS gate'inin app-layer
     karşılığı; aynı yetki kümesi = aktif admin).

   ⚠️ `import "server-only"`: client bundle'a sızarsa BUILD HATA.

   ⚠️ Method'lar anon repo ile BYTE-IDENTICAL: SELECT projeksiyonu
     (LIST_SELECT, password HARİÇ), `.eq`/`.order`/`.maybeSingle` AYNEN;
     tek fark `db` (anon) → `dbAdmin` (native). Return HAM `{ data, error }`
     / maybeSingle; validation / payload build / normalize caller'da.
   =============================================================== */

import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/** Liste + detail için ortak slim projeksiyon (password HARİÇ).
 *  🛡️ TOTP 2FA — `totp_enabled` eklendi (additive, boolean-only —
 *  secret/hash İÇERMEZ) → /maki-admin/users listesinde her satırın
 *  2FA rozetini göstermek için. Backend mantığı (enroll/confirm/
 *  disable/reset) DEĞİŞMEDİ, yalnız bu READ projeksiyonu genişledi. */
const LIST_SELECT =
  "id, full_name, email, sidebar_permissions, is_active, last_login_at, created_at, totp_enabled";

export const adminUserPanelServerRepository = {
  /** LIST — password hariç kolonlar, created_at DESC. */
  async findAllForList() {
    return await dbAdmin
      .from<Record<string, unknown>>("admin_users")
      .select(LIST_SELECT)
      .order("created_at", { ascending: false });
  },

  /** BY ID — password hariç kolonlar, .maybeSingle(). */
  async findById(id: string) {
    return await dbAdmin
      .from<Record<string, unknown>>("admin_users")
      .select(LIST_SELECT)
      .eq("id", id)
      .maybeSingle();
  },

  /** UPDATE by id — generic patch. `.select()` YOK. updateAdminUser
   *  (full_name/email/password/sidebar_permissions/is_active) VE
   *  setAdminUserActive ({ is_active }) İKİSİ de bu tek method (aynı
   *  query shape); payload build caller'da. */
  async updateById(id: string, payload: Record<string, unknown>) {
    return await dbAdmin.from("admin_users").update(payload).eq("id", id);
  },
};
