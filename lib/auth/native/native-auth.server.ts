import "server-only";

import { verifyAccessToken } from "./jwt";
import { hashPassword } from "./password";
import { adminUserServerRepository } from "@/lib/db/admin-user.repository.server";

import type {
  AdminAuthProvider,
  AuthTokenVerifier,
} from "../auth.provider";
import type {
  AuthResult,
  AuthUser,
  CreateAdminUserInput,
  CreatedAdminUser,
} from "../auth.types";

/* ===============================================================
   🛡️ FAZ 1 (NATIVE AUTH) — NATIVE SERVER PROVIDERS
   ===============================================================
   Mevcut `AuthTokenVerifier` + `AdminAuthProvider` interface'lerinin
   NATIVE implementasyonu. önceki auth implementasyonunun birebir
   yapısal karşılığı → FAZ 2/3'te `lib/auth/server.ts` switch'i
   native'e çevrilerek aktive edilecek.

   ⚠️ HENÜZ WIRE EDİLMEDİ — `lib/auth/server.ts` hâlâ eski sağlayıcı
     verifier/admin provider export ediyor. Bu dosyayı kimse import
     etmiyor; altyapı hazır bekliyor.

   FARK (eski sağlayıcı → native):
     • verifyToken: `dbAdmin.auth.getUser(token)` (network)
       yerine LOKAL JWT imza doğrulaması (`verifyAccessToken`) → hızlı,
       eski sağlayıcıya round-trip YOK.
     • createUser: harici auth sağlayıcısı YERİNE
       `admin_users`'a `password_hash` ile tek-adım insert (native'de
       auth user = admin_users satırı).
   =============================================================== */

function mapUser(email: string | null, id: string): AuthUser {
  return { id, email: email ?? null };
}

/* ===============================================================
   🛡️ TOKEN VERIFIER (server-only) — lokal JWT doğrulama
   =============================================================== */
export const nativeAuthVerifier: AuthTokenVerifier = {
  async verifyToken(token: string): Promise<AuthResult<AuthUser>> {
    const result = await verifyAccessToken(token);
    if (!result.ok) {
      return { ok: false, error: "Oturum doğrulanamadı" };
    }
    const { sub, email } = result.claims;
    if (!sub) {
      return { ok: false, error: "Kullanıcı okunamadı" };
    }
    return { ok: true, value: mapUser(email, sub) };
  },
};

/* ===============================================================
   🛡️ ADMIN PROVIDER (server-only) — native admin_users insert
   ===============================================================
   Native'de "auth user" ile "admin_users" AYNI tablodur → tek adımda
   password_hash ile satır oluşturulur. `fullName`/`sidebarPermissions`
   (CreateAdminUserInput ADDITIVE opsiyonel alanları) verilmezse güvenli
   default'lar kullanılır. `emailConfirm` native'de anlamsız (harici mail
   doğrulama yok) → yok sayılır.
   =============================================================== */
export const nativeAdminAuthProvider: AdminAuthProvider = {
  async createUser(
    input: CreateAdminUserInput
  ): Promise<AuthResult<CreatedAdminUser>> {
    const email = (input.email || "").toLowerCase().trim();
    if (!email || !input.password) {
      return { ok: false, error: "E-posta ve şifre zorunlu" };
    }

    const passwordHash = await hashPassword(input.password);
    const fullName =
      (input.fullName || "").trim() || email.split("@")[0] || email;

    const { data, error } = await adminUserServerRepository.insertNative({
      full_name: fullName,
      email,
      password_hash: passwordHash,
      sidebar_permissions: input.sidebarPermissions ?? [],
      is_active: input.isActive ?? true,
    });
    if (error || !data) {
      return {
        ok: false,
        error: error?.message || "Kullanıcı oluşturulamadı",
      };
    }

    return {
      ok: true,
      value: { id: (data as { id: string }).id, email },
    };
  },
};
