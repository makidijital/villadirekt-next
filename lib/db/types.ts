/* ===============================================================
   🛡️ FAZ 33 — REPOSITORY LAYER — SHARED TYPES
   ===============================================================
   Minimal abstraction tohumu. Tek bir amaç:
     Repository sınırından dışarı **PostgrestError** tipini
     sızdırmamak. Bunun yerine yapısal olarak compatible bir
     alias (`DbError`) export ediyoruz; mevcut eski sağlayıcı
     `PostgrestError` (code + message) `DbError`'a yapısal
     uyumlu olduğu için runtime'da byte-identical, TS tarafında
     ise repository tüketicilerinin import surface'i daralır.

   ⚠️ KESIN KURAL:
     - `Result<T,E>` GENERIC YAPILMAZ (over-engineering yasak).
     - `{ data, error }` shape native; aynen sürer.
     - Şu an için yalnız reservation repository tüketir; ileride
       diğer domain repository'ler de aynı alias'a yaslanır.

   ⚠️ FAZ KAPSAMI:
     - Bu dosya yalnız TYPE export'u içerir (zero runtime).
     - Generic abstraction VS davranış değişikliği YOK.
   =============================================================== */

/** Repository sınırından dışarı sızabilen minimal hata shape'i.
 *  eski sağlayıcı `PostgrestError` yapısal olarak (`code`, `message`)
 *  buna compatible — repository tüketicileri import'a ihtiyaç
 *  duymadan `error.code` / `error.message` erişimi sürdürür. */
export type DbError = {
  code?: string;
  message?: string;
};
