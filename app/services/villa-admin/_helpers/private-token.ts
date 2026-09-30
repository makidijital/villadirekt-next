/* ===============================================================
   🛡️ FAZ 2 — generatePrivateTokenString (PURE)
   ===============================================================
   Eski villa-admin.service.ts içinde inline tanımlı internal helper.
   Pure crypto; zero DB; zero side-effect.

   FORMAT:
     - `crypto.randomUUID()` UUID v4 (WebCrypto, Node ≥19)
     - Hyphenless 20-char prefix (hexadecimal alfa-numeric)
     - URL-safe
     - ~80 bit entropi

   USAGE:
     private-token.service.ts > generatePrivateAccessToken orchestrator.
=============================================================== */

export function generatePrivateTokenString(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}
