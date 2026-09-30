import "server-only";

import { randomBytes, createHash } from "crypto";

/* ===============================================================
   🛡️ NATIVE AUTH — REFRESH TOKEN (server-only, Node crypto)
   ===============================================================
   Opaque yüksek-entropi refresh token üretimi + DB için SHA-256 hash.
   Node `crypto` kullandığından EDGE'de çalışmaz → `jwt.ts`'ten AYRILDI
   (jwt.ts edge-safe kalsın diye; middleware jose-only verify import eder).
   Bunlar standart kütüphane primitifleridir (algoritma elle yazımı DEĞİL).
   =============================================================== */

/** Yüksek-entropi opaque refresh token (client cookie'sine gider). */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/** DB'de saklanacak hash (refresh token yüksek-entropili → SHA-256 yeterli). */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
