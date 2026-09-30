/* ===============================================================
   🛡️ PHASE 10B — DICTIONARY STRING INTERPOLATION
   ===============================================================
   Saf (pure), framework'ten bağımsız `{token}` interpolation
   helper'ı. Dictionary değerleri (tr.ts/en.ts/de.ts) düz string
   kalır (Dictionary tipi DEĞİŞMEDİ — hâlâ Record<string,string>
   şekilli); dinamik değerler (misafir sayısı, gece sayısı, yüzde,
   tutar) şablon token'ları (`{adults}`, `{n}`, `{percent}` vb.) ile
   ifade edilir ve bu fonksiyonla enjekte edilir.

   Bilinmeyen bir token (params'ta karşılığı olmayan) OLDUĞU GİBİ
   bırakılır (sessizce boşa düşürülmez) — geliştirme sırasında eksik
   bir param fark edilsin diye.
   =============================================================== */

export function formatDictionaryString(
  template: string,
  params: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(params, key)
      ? String(params[key])
      : match;
  });
}
