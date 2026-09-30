/* ===============================================================
   🛡️ SLUG UTIL — Türkçe-aware URL-safe slug üretici
   ===============================================================
   Migration 008 (villa_types.slug) ile birlikte FE/admin layer'da
   yeni kayıt yaratırken otomatik slug üretmek için. DB tarafındaki
   backfill (DO block içindeki translate + regex) ile birebir aynı
   semantic — server ile DB davranışı drift etmesin.

   KULLANIM:
     slugifyTr("Balayı Villaları")      → "balayi-villalari"
     slugifyTr("Müstakil / Korunaklı")  → "mustakil-korunakli"
     slugifyTr("  Lüx — Suit  ")        → "lux-suit"
     slugifyTr("")                      → ""

   GÜVENLİK:
     - Sadece [a-z0-9-] üretir; URL injection riski yok.
     - Boş string için boş string döner (caller karar versin).

   IsUuid helper'ı /arama page'inde token tipini ayırt etmek için
   (UUID'ler eskinin desteği, slug'lar yeni canonical). Hem v4 hem
   genel UUID format'ını match eder (case-insensitive).
   =============================================================== */

const TR_MAP: Record<string, string> = {
  ı: "i",
  İ: "i",
  ş: "s",
  Ş: "s",
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ü: "u",
  Ü: "u",
  ö: "o",
  Ö: "o",
  â: "a",
  Â: "a",
  î: "i",
  Î: "i",
  û: "u",
  Û: "u",
};

export function slugifyTr(input: string | null | undefined): string {
  if (!input) return "";
  let out = "";
  for (const ch of String(input)) {
    out += TR_MAP[ch] ?? ch;
  }
  out = out
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // remaining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
