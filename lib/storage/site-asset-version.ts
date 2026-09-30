/* ===============================================================
   🛡️ SITE-ASSETS GÖRSEL VERSİYONU — saf yardımcılar (client-safe)
   ===============================================================
   Server tarafı (R2 HEAD + cache): `site-asset-version.server.ts`.
   Bu dosya yalnız path normalize / tag / map okuma içerir; hem
   server component'lerde hem admin client sayfalarında kullanılır.
   =============================================================== */

const MAX_PATH_LENGTH = 200;

/** Bucket-relative path'i normalize eder; versiyonlanamıyorsa null. */
export function normalizeSiteAssetPath(
  value: string | null | undefined
): string | null {
  if (typeof value !== "string") return null;
  const p = value.trim().replace(/^\/+/, "");
  if (!p || p.length > MAX_PATH_LENGTH) return null;
  /* Legacy tam URL, query/hash veya dizin atlama → versiyonlanmaz. */
  if (/^[a-z][a-z0-9+.-]*:/i.test(p) || /[?#\\]/.test(p) || p.includes("..")) {
    return null;
  }
  return p;
}

/** Path'e özel invalidation tag'i (upload/remove sonrası). */
export function siteAssetVersionTag(path: string): string {
  return `site-asset-version:${path}`;
}

/** Versiyon map'inden bir değerin versiyonu (path normalize edilerek). */
export function versionFor(
  versions: Readonly<Record<string, string>> | null | undefined,
  value: string | null | undefined
): string | undefined {
  const path = normalizeSiteAssetPath(value);
  return path && versions ? versions[path] : undefined;
}

/* ===============================================================
   🛡️ withVersionParam — `v` query parametresini TEK kez yazar
   ===============================================================
   Mevcut davranış (query yoksa `?v=`, varsa `&v=`, değer
   encodeURIComponent) BİREBİR korunur. Tek fark: URL'de zaten bir
   `v` parametresi varsa (örn. DB'de `?v=` ile saklanmış legacy tam
   URL) ikinci bir `v` EKLENMEZ, mevcut olanın yerine yazılır →
   `image.webp?v=1&v=2` oluşamaz. Diğer query parametreleri ve
   `#hash` sırası/değeri aynen kalır.
   =============================================================== */
export function withVersionParam(url: string, cacheKey: string | number): string {
  const encoded = `v=${encodeURIComponent(String(cacheKey))}`;
  const hashAt = url.indexOf("#");
  const hash = hashAt === -1 ? "" : url.slice(hashAt);
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  const queryAt = base.indexOf("?");
  if (queryAt === -1) return `${base}?${encoded}${hash}`;
  const path = base.slice(0, queryAt);
  const params = base
    .slice(queryAt + 1)
    .split("&")
    .filter((p) => p.length > 0 && !/^v(=|$)/.test(p));
  params.push(encoded);
  return `${path}?${params.join("&")}${hash}`;
}

/** URL'ye (map'te varsa) path'in versiyonunu ekler; yoksa URL AYNEN. */
export function versionedAssetUrl(
  url: string | null | undefined,
  versions: Readonly<Record<string, string>> | null | undefined,
  value: string | null | undefined
): string | null {
  if (!url) return null;
  const v = versionFor(versions, value);
  return v ? withVersionParam(url, v) : url;
}
