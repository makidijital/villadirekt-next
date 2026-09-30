/* ===============================================================
   🛡️ GERÇEK POSTGRES ARRAY KOLONLARI — jsonb parity istisna listesi
   ===============================================================
   PROBLEM:
     `node-pg` bir JS dizisini Postgres ARRAY LİTERALİ (`{a,b}`) olarak
     serialize eder. Bu, gerçek `text[]`/`uuid[]` kolonlar için DOĞRU;
     ancak dizi tutan `jsonb` kolonlar (ör. admin_users.sidebar_permissions)
     için YANLIŞTIR — jsonb JSON bekler (`["a","b"]`). eski sağlayıcı/PostgREST
     her ikisini de kolon tipine göre doğru serialize eder.

   ÇÖZÜM (query-compiler):
     INSERT/UPDATE değeri JS dizisi/objesi ise VARSAYILAN `jsonb` kabul
     edilir (JSON + `::jsonb`). Bu liste, GERÇEK Postgres array-tipi
     kolonların İSTİSNASIDIR — onlarda node-pg'nin array-literal davranışı
     KORUNUR.

   ⚠️ TAHMİN YOK — KAYNAK: db/migrations/*.sql'deki `<tip>[]` TABLO kolon
     tanımlarının EKSİKSİZ + dosya:satır ile DOĞRULANMIŞ taraması
     (fonksiyon param'ları `p_*` HARİÇ — onlar rpc yoluyla zaten dizi
     geçer). Şemadaki tüm gerçek array TABLO kolonları:
       admin_activity_logs.diff_summary   (028:74, text[])
       offer_requests.region_tokens       (022:29, text[])
       offer_requests.villa_type_tokens   (022:30, text[])
       offer_requests.feature_tokens      (022:31, text[])
       shared_favorite_lists.villa_ids    (021:44, uuid[])
       shared_villa_lists.villa_ids       (035:58, uuid[])
     Yeni gerçek array kolonu eklenirse BURAYA açıkça eklenir; aksi halde
     JS dizisi jsonb'a serialize edilir.
   =============================================================== */

/** `table.column` — gerçek Postgres array-tipi (text[]/uuid[]) kolonlar. */
export const REAL_ARRAY_COLUMNS: ReadonlySet<string> = new Set([
  "admin_activity_logs.diff_summary",
  "offer_requests.region_tokens",
  "offer_requests.villa_type_tokens",
  "offer_requests.feature_tokens",
  "shared_favorite_lists.villa_ids",
  "shared_villa_lists.villa_ids",
]);

/** Bu kolon gerçek Postgres array-tipi mi? (değilse JS dizisi jsonb'dır). */
export function isRealArrayColumn(table: string, column: string): boolean {
  return REAL_ARRAY_COLUMNS.has(`${table}.${column}`);
}
