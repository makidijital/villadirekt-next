import "server-only";

/* ===============================================================
   🛡️ FAZ 39 — AUTH SERVER BARREL (SERVER-ONLY)
   ===============================================================
   Server-only auth artefaktları:
     • `authVerifier` — Bearer token doğrulama (server route'larında
       authorizeAdminToken/Caller tarafından kullanılır).
     • `adminAuthProvider` — service-role createUser (admin user
       oluşturma route'unda).

   ⚠️ `import "server-only"` direktifi: bu barrel CLIENT bundle'a
   sızarsa BUILD HATA. Implementation `./native/native-auth.server`
   içinde; o dosya da `import "server-only"` korumalı.

   Provider seçimi tek noktada — gelecekte farklı auth provider
   eklenirse burada switch:
     export const authVerifier: AuthTokenVerifier = isCustomEnabled
       ? customAuthVerifier
       : legacyAuthVerifier;
   =============================================================== */

/* Native auth — tek sağlayıcı; flag/branch YOK. */
import {
  nativeAuthVerifier,
  nativeAdminAuthProvider,
} from "./native/native-auth.server";

/** Server-side token verifier (SERVER-ONLY) — native (lokal jose verify). */
export const authVerifier = nativeAuthVerifier;

/** Admin provider (SERVER-ONLY) — native (Argon2id + admin_users insert). */
export const adminAuthProvider = nativeAdminAuthProvider;
