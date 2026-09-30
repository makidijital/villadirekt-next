/* ===============================================================
   🛡️ TUR 3 — saveAll extraction helper (pure, zero behavior change)
   ===============================================================
   `requestedStatus` ve `baselineStatus` derivation pattern'i saveAll
   içinde 2 yerde aynen kullanılıyordu:
     `(value || "").toString().toLowerCase().trim()`
   Yan etki yok; aynı string normalization aynen.
=============================================================== */

export function normalizeStatusKey(value: unknown): string {
  return (value || "").toString().toLowerCase().trim();
}
