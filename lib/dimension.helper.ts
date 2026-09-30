/* ===============================================================
   🛡️ DIMENSION HELPER — havuz ölçü display formatter (Faz 13)
   ===============================================================
   PROBLEM ANALİZİ:
     Admin form input placeholder'ı "Derinlik (örn: 1.5m)" idi.
     Admin kullanıcılar placeholder kopyalayarak değer yazıyor:
       - "1.5m", "4 metre", "8 mt", "1.5M" — inkonsistent string'ler
     Frontend villa detay sayfası ham değeri direkt render ediyor
     → "(4m × 8 metre × 1.5)" gibi karışık görünüm.

   ÇÖZÜM (minimal invasive):
     1) Admin placeholder'ı numeric-only örnek göster ("1.5", "4", "8")
     2) Bu helper render anında akıllı formatla:
          - Harf içeren legacy değer → AS-IS (eski görünüm korunur)
          - Temiz numeric → "X m" append (yeni admin girdileri için)

   DB SCHEMA: dokunulmadı. Mevcut data: bozulmadı.

   BACKWARD-COMPATIBILITY:
     - Eski "4m" kaydı → "4m" render (değişmedi)
     - Eski "4 metre" kaydı → "4 metre" render (değişmedi)
     - Yeni "4" kaydı → "4 m" render (YENİ DAVRANIŞ)
     - Boş/null → "" render (değişmedi)

   PURE & SERVER-SAFE: React/DOM bağımlılığı yok; SSR'da çalışır.
   =============================================================== */

/**
 * Havuz ölçü değerini frontend gösterimi için formatla.
 *
 *   ""                  → ""
 *   "4"                 → "4 m"
 *   "1.5"               → "1.5 m"
 *   "4,5"               → "4,5 m"  (TR comma decimal)
 *   "4m"                → "4m"     (legacy as-is)
 *   "4 m"               → "4 m"    (legacy as-is)
 *   "4 metre"           → "4 metre" (legacy as-is)
 *   "8 mt"              → "8 mt"   (legacy as-is)
 *   "  4  "             → "4 m"    (trim + append)
 *   null / undefined    → ""
 *
 * Tek pure fonksiyon; çağrı maliyeti O(1) regex match.
 */
export function formatPoolDimension(
  value: string | number | null | undefined
): string {
  if (value === null || value === undefined) return "";
  const raw = String(value).trim();
  if (raw.length === 0) return "";

  /* Harf var mı? (Türkçe karakterler dahil — "metre", "mt", "M", vs.)
     Varsa LEGACY değer → as-is. Yeni format eklemek backward-compat'i
     bozar. */
  if (/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(raw)) {
    return raw;
  }

  /* Sadece sayı + opsiyonel virgül/nokta → numeric. "m" append.
     Tek boşluk ile ayrı yazılır (typographic clean): "4 m" / "1.5 m". */
  return `${raw} m`;
}
