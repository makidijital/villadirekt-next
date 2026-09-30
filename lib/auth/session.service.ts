import {
  getCurrentAdmin as _getCurrentAdmin,
  lookupCurrentAdmin as _lookupCurrentAdmin,
  requireAdmin as _requireAdmin,
  signOutAdmin as _signOutAdmin,
  type AdminAuthRecord,
  type AdminLookupResult,
} from "@/lib/admin-auth";

/* ===============================================================
   🛡️ FAZ 32 — AUTH SESSION SERVICE (Abstraction Layer)
   ===============================================================
   AMAÇ:
     Auth / session retrieval için tek entry point. Üst katmanlar
     (admin route'ları, server components, client island'lar) artık
     `lib/auth/session.service` üzerinden geçer.

   DAVRANIŞ BYTE-IDENTICAL:
     - `lib/admin-auth.ts` SOURCE-OF-TRUTH olarak duruyor:
         * auth_user_id öncelikli + email fallback lookup
         * is_active kontrolü
         * permissions normalize
         * native oturum doğrulama / signOut çağrıları
     - Bu service yalnız ince bir re-export katmanı; iç davranış
       AYNEN aynı, identical function reference.

   MIDDLEWARE DOKUNULMADI:
     - middleware.ts route koruma davranışı: AYNI
     - admin-route-auth.ts: AYNI
     - admin-fetch.ts: AYNI

   IMPORT GRAFIĞI:
     Şu an:
       app/* → @/lib/admin-auth
     FAZ 32 sonrası tercih edilen yol (yeni kod için):
       app/* → @/lib/auth/session.service
                 ↓
              @/lib/admin-auth → @/lib/db

     Mevcut kod path'leri ZORLA değiştirilmedi (minimal diff).
     İleride incremental olarak yeni service'e taşınabilir.

   GELECEK MIGRATION ZEMINI:
     native auth → başka bir provider (NextAuth, Clerk, custom JWT)
     geçişinde sadece `lib/admin-auth.ts` ve bu wrapper değişir.
     Service ve route'lar aynı interface ile çalışmaya devam eder.
   =============================================================== */

/* ---------------------------------------------------------------
   🛡️ READ — current admin (or null if unauth / inactive / not_admin)
   ---------------------------------------------------------------
   Çoğu admin sayfası bu helper'ı çağırır; null dönerse layout
   logout + redirect uygular. Internal davranış lib/admin-auth.ts'te.
*/
export async function getCurrentAdmin(): Promise<AdminAuthRecord | null> {
  return _getCurrentAdmin();
}

/* ---------------------------------------------------------------
   🛡️ READ — lookup with reason
   ---------------------------------------------------------------
   Login flow için: kullanıcı auth oldu ama admin değil / inactive
   ise UI mesajı farklılaştırılır. */
export async function lookupCurrentAdmin(): Promise<AdminLookupResult> {
  return _lookupCurrentAdmin();
}

/* ---------------------------------------------------------------
   🛡️ GUARD — throws if not admin
   ---------------------------------------------------------------
   Server actions ve route handler'lar için. throw → 500 / redirect.
   Caller ihtiyacına göre try/catch sarması yapar. */
export async function requireAdmin(): Promise<AdminAuthRecord> {
  return _requireAdmin();
}

/* ---------------------------------------------------------------
   🛡️ WRITE — sign out
   ---------------------------------------------------------------
   Client tarafında çağrılır; cookie + local session temizlenir.
   Internal davranış lib/admin-auth.ts'te (native signOut). */
export async function signOutAdmin(): Promise<void> {
  return _signOutAdmin();
}

/* ---------------------------------------------------------------
   🛡️ TYPE RE-EXPORT — single import path for new code
   --------------------------------------------------------------- */
export type { AdminAuthRecord, AdminLookupResult };
