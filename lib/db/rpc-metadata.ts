/* ===============================================================
   🛡️ STATİK RPC-RETURN METADATA — PostgREST/eski sağlayıcı rpc() parity
   ===============================================================
   AMAÇ:
     DB client `.rpc(fn, args)` çağrısı, fonksiyonun PostgreSQL
     RETURNS tipine göre FARKLI `data` şekli döndürür:
       scalar (boolean/int/uuid/jsonb) → data = DEĞER
       setof scalar                    → data = DEĞER[]
       table / setof composite         → data = SATIR[]
       void                            → data = null
     Native provider ise ham `SELECT * FROM fn(...)` satırlarını
     (`{fn: value}` sarımlı) döndürür → şekil UYUŞMAZ. Bu registry,
     her fonksiyonun dönüş TÜRÜNÜ açıkça tanımlar; provider sonucu
     buna göre eski sağlayıcı ile BİREBİR şekle sokar.

   ⚠️ TAHMİN YOK — KAYNAK: db/migrations/*.sql RETURNS cümleleri.
     Yeni RPC eklenirse buraya AÇIKÇA eklenir (relation-metadata
     ile aynı disiplin). Registry'de OLMAYAN fonksiyon → "table"
     (ham satır dizisi) varsayılır (en güvenli/geriye-uyumlu).
   =============================================================== */

/** Fonksiyonun dönüş türü → sonuç şekillendirme kuralı. */
export type RpcReturnKind =
  | "scalar" //  tek değer      → data = value        (boolean/int/uuid/jsonb)
  | "scalar_set" //  değer kümesi   → data = value[]       (setof <scalar>)
  | "table" //  satır kümesi   → data = row[]         (table / setof composite)
  | "void"; //  değer yok      → data = null

/* KAYNAK (db/migrations): her fonksiyonun RETURNS cümlesi. */
export const RPC_RETURN_KIND: Readonly<Record<string, RpcReturnKind>> = {
  /* scalar */
  check_villa_availability_conflict: "scalar", // returns boolean
  cleanup_past_manual_reservations: "scalar", // returns integer
  consume_villa_zip_token: "scalar", // returns uuid
  resolve_reservation_share_token: "scalar", // returns uuid
  get_public_settings: "scalar", // returns jsonb
  refresh_villa_short_gaps: "scalar", // returns integer

  /* setof scalar */
  get_blocked_villa_ids: "scalar_set", // returns setof uuid

  /* table / setof composite */
  get_short_gap_counts: "table", // returns table(...)
  get_villa_blocked_ranges: "table", // returns table(...)

  /* void */
  replace_villa_distances: "void", // returns void
  replace_villa_feature_relations: "void", // returns void
  replace_villa_prices: "void", // returns void
  replace_villa_discounts: "void", // returns void — migration 079 (villa_discounts)
  replace_villa_rule_relations: "void", // returns void
  replace_villa_type_relations: "void", // returns void
  replace_villa_price_include_relations: "void", // returns void
  set_villa_sort_orders: "void", // returns void
  set_villa_type_sort_orders: "void", // returns void
};

/** Fonksiyonun dönüş türü (kayıtlı değilse "table" → ham satır dizisi). */
export function getRpcReturnKind(fn: string): RpcReturnKind {
  return RPC_RETURN_KIND[fn] ?? "table";
}

/* ===============================================================
   🛡️ JSONB FONKSİYON ARGÜMANLARI — rpc() arg serialize parity
   ===============================================================
   `SELECT * FROM fn(arg => $n)` çağrısında `jsonb` tipli argümanlara
   JS dizisi/objesi geçilir. node-pg diziyi Postgres ARRAY LİTERALİ
   (`{...}`) yapar → `jsonb` parametre "invalid input syntax for type
   json" HATASI verir (kolon INSERT/UPDATE'iyle AYNI sorun, ama arg
   tarafında). Bu registry'deki argümanlar `JSON.stringify + ::jsonb`
   ile gönderilir. `uuid[]`/`text[]` argümanları (p_*_ids) BURADA
   OLMADIĞINDAN node-pg array-literal'ı korunur (doğru).

   ⚠️ TAHMİN YOK — KAYNAK: db/migrations RPC imzalarındaki `<arg> jsonb`.
     replace_villa_prices(p_prices jsonb)
     replace_villa_distances(p_distances jsonb)
     set_villa_sort_orders(p_updates jsonb)
     set_villa_type_sort_orders(p_updates jsonb)
   =============================================================== */
export const RPC_JSONB_ARGS: ReadonlySet<string> = new Set([
  "replace_villa_prices.p_prices",
  "replace_villa_discounts.p_discounts",
  "replace_villa_distances.p_distances",
  "set_villa_sort_orders.p_updates",
  "set_villa_type_sort_orders.p_updates",
]);

/** Bu fonksiyon argümanı `jsonb` mı? (JSON + `::jsonb` ile gönderilmeli). */
export function isJsonbRpcArg(fn: string, arg: string): boolean {
  return RPC_JSONB_ARGS.has(`${fn}.${arg}`);
}
