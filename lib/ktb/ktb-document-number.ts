/* ===============================================================
   🛡️ KTB BELGE NUMARASI — normalize + format doğrulama + URL (SAF)
   ===============================================================
   Kaynak: `villa.tourism_document_number` (serbest text, mig 017).
   KTB "Turizm amaçlı kiralanan konut" sorgusu yalnız BELGE NUMARASI
   ile yapılır: `<il kodu>-<sıra no>` (örn. "07-6195").

   NORMALİZASYON — yalnız açıkça güvenli dönüşümler:
     • baş/son boşluk kırpılır
     • tire benzeri Unicode karakterler (‐ ‑ ‒ – — ― −) → "-"
     • tirenin YANINDAKİ boşluklar silinir ("07 - 6195" → "07-6195")
   Rakamlar, sıfırlar, sıra DEĞİŞTİRİLMEZ. Bunun dışında kalan her
   değer `unsupported_format` → KTB'ye istek GÖNDERİLMEZ.

   Bu dosya server/client ortak (UI "KTB'de Aç" linki de buradan).
=============================================================== */

/** Resmi KTB sorgu sayfası (sabit host — string birleştirme YOK). */
export const KTB_LICENSE_QUERY_URL =
  "https://www.ktb.gov.tr/genel/bakanlikbelgelikonutlardemo.aspx";
export const KTB_LICENSE_QUERY_HOST = "www.ktb.gov.tr";
export const KTB_LICENSE_QUERY_PARAM = "belgeno";

/** İl kodu 01–81, tire, 1–7 haneli sıra numarası. */
export const KTB_DOCUMENT_NUMBER_PATTERN =
  /^(0[1-9]|[1-7][0-9]|8[01])-[0-9]{1,7}$/;

const DASH_LIKE = /[‐‑‒–—―−]/g;

export type KtbDocumentNumberResult =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "unsupported_format" };

export function normalizeKtbDocumentNumber(
  raw: unknown
): KtbDocumentNumberResult {
  if (raw === null || raw === undefined) return { ok: false, reason: "empty" };
  const trimmed = String(raw).trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  const value = trimmed.replace(DASH_LIKE, "-").replace(/\s*-\s*/g, "-");
  if (!KTB_DOCUMENT_NUMBER_PATTERN.test(value)) {
    return { ok: false, reason: "unsupported_format" };
  }
  return { ok: true, value };
}

/** Normalize edilmiş numara için resmi sorgu URL'i (URLSearchParams ile). */
export function buildKtbLicenseUrl(normalized: string): URL {
  const url = new URL(KTB_LICENSE_QUERY_URL);
  url.searchParams.set(KTB_LICENSE_QUERY_PARAM, normalized);
  return url;
}

/** UI "KTB'de Aç": yalnız geçerli formatta numara için link (yoksa null). */
export function ktbLicenseLinkFor(raw: unknown): string | null {
  const n = normalizeKtbDocumentNumber(raw);
  return n.ok ? buildKtbLicenseUrl(n.value).toString() : null;
}
