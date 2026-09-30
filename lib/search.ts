/* ===============================================================
   🔎 SEARCH NORMALIZE — Türkçe-aware, aksan-duyarsız arama katmanı
   ===============================================================
   AMAÇ:
     Villa adı aramasının Türkçe harf toleransı olması. PostgreSQL
     `ILIKE` ve JS `String.toLowerCase()` Türkçe noktalı/noktasız i
     (i / ı / İ / I) çiftini AYNI kabul etmez — "ırmak" (noktasız)
     ile "Irmak" farklı Unicode codepoint'leridir → eşleşmez.

     Bu helper HEM sorguyu HEM aranan alanı aynı kanona indirger:
       - Türkçe karakter fold (ç→c, ğ→g, ı→i, İ→i, ö→o, ş→s, ü→u, …)
       - kalan diakritikleri strip (NFKD + combining mark temizliği)
       - lowercase + whitespace sadeleştirme

     ⚠️ SIRA KRİTİK: TR fold ÖNCE, lowercase SONRA. Aksi halde
        "İ".toLowerCase() → "i̇" (i + U+0307 combining dot) drift üretir.

   SONUÇ — şunların hepsi aynı villaya eşleşir:
     irmak · ırmak · Irmak · IRMAK · İrmak   → "irmak"
   =============================================================== */

const TR_FOLD: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
  â: "a",
  Â: "a",
  î: "i",
  Î: "i",
  û: "u",
  Û: "u",
};

/** Arama kanonu: TR fold → diakritik strip → lowercase → tek boşluk. */
export function normalizeSearchText(input: string | null | undefined): string {
  if (!input) return "";
  let out = "";
  for (const ch of String(input)) out += TR_FOLD[ch] ?? ch;
  return out
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // kalan combining diacritics
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize edilmiş substring eşleşmesi. Boş sorgu → tüm satırlar
 *  geçer (eski `includes("")` davranışıyla uyumlu). */
export function searchTextIncludes(
  haystack: string | null | undefined,
  needle: string | null | undefined
): boolean {
  const n = normalizeSearchText(needle);
  if (n.length === 0) return true;
  return normalizeSearchText(haystack).includes(n);
}

/** LIKE/ILIKE metakarakterlerini literal'e escape eder (backslash
 *  default escape). DB-level `search_title ILIKE '%<q>%'` sorgusunda
 *  kullanıcı girdisindeki `%` `_` `\` karakterlerinin wildcard olarak
 *  yorumlanmasını önler. Normalize edilmiş needle'a uygulanır. */
export function escapeLikePattern(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}
