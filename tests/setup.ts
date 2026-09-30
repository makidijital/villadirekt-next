/* ===============================================================
   🛡️ FAZ 51 — TEST GLOBAL SETUP (ESM-safe)
   ===============================================================
   • jest-dom matchers (toBeInTheDocument, toHaveAttribute…)
     — yalnız @testing-library/jest-dom yüklüyse aktive edilir.
     İlk faz testleri (price.engine, availability, date-range,
     currency, humanize) pure helper olduğu için jest-dom matchers
     kullanmıyor; eksikliği test runner'ı kırmasın diye defansif
     dynamic ESM import. Component testleri eklendiğinde paket
     zaten devDep'te.
   • No network: hiçbir test fetch/eski sağlayıcı tetiklemez.
=============================================================== */

/* Module marker — top-level await ESM module shape gerektirir. */
export {};

try {
  await import("@testing-library/jest-dom/vitest");
} catch {
  /* jest-dom henüz yüklü değil — pure helper testleri etkilenmez. */
}
