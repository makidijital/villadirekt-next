/* ===============================================================
   🛡️ SEC-05 — GTM CONTAINER ID DOĞRULAMA (saf / edge-safe)
   ===============================================================
   `gtm_container_id` admin ayarı, root layout'ta inline GTM bootstrap
   script'inin string literal'ine interpolate ediliyordu
   (`...'dataLayer','${gtmId}');`). Doğrulanmadığı için `');<js>//`
   gibi bir değer script literal'inden ÇIKIP keyfi JS enjekte
   edebiliyordu (Stored XSS — SEC-05 runtime'da kanıtlandı).

   Bu helper, değerin GERÇEK bir GTM container ID formatında olduğunu
   doğrular. Geçerli GTM ID'leri YALNIZ `GTM-` + büyük harf/rakam
   içerir; tırnak, parantez, noktalı virgül, boşluk vb. İÇEREMEZ →
   dolayısıyla doğrulanan değer script context'inde breakout yapamaz.

   Saf fonksiyon: `server-only` YOK, Node/DOM API YOK → hem server
   (layout) hem client import edebilir.
   =============================================================== */

/* Google GTM container ID: `GTM-` + 4–15 büyük harf/rakam.
   (Tipik ID'ler `GTM-XXXXXXX` ~7 karakter; üst sınır geniş tutuldu
   ki meşru uzun ID'ler reddedilmesin. Karakter sınıfı [A-Z0-9]
   olduğundan hiçbir script-breakout karakteri geçemez.) */
const GTM_ID_RE = /^GTM-[A-Z0-9]{4,15}$/;

/**
 * Ham `gtm_container_id` değerini doğrular.
 * @returns Geçerliyse trim'lenmiş ID; değilse `null` (GTM render EDİLMEZ).
 */
export function normalizeGtmId(
  raw: string | null | undefined
): string | null {
  if (!raw || typeof raw !== "string") return null;
  const value = raw.trim();
  return GTM_ID_RE.test(value) ? value : null;
}

/** Boolean kısayol (test/okunabilirlik için). */
export function isValidGtmId(raw: string | null | undefined): boolean {
  return normalizeGtmId(raw) !== null;
}
