/* ===============================================================
   🛡️ SHARED VILLA LIST — client-safe sabitler
   ===============================================================
   Link expiration allow-list + default key. Hem `shared-villa-list.service`
   (server) hem `VillaListesiClient` (client) kullanır. Service native repo
   (server-only) import ettiği için bu sabitler ayrı client-safe modülde
   (yalnız saf-veri; server importu YOK). Değerler AYNEN.

   ALLOWED_EXPIRATIONS: frontend opaque key gönderir; backend saate çevirir
   (raw saat client'tan gelmez → adversarial TTL engeli).
=============================================================== */
export const ALLOWED_EXPIRATIONS = {
  "1h": 1,
  "3h": 3,
  "6h": 6,
  "24h": 24,
} as const;

export type ExpirationKey = keyof typeof ALLOWED_EXPIRATIONS;

export const DEFAULT_EXPIRATION_KEY: ExpirationKey = "24h";
