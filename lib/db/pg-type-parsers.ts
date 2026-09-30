import "server-only";

import { types } from "pg";

/* ===============================================================
   🛡️ PG TİP-PARSER'LARI — PostgREST/DB clientON-shape PARITY
   ===============================================================
   AMAÇ:
     `pg` sürücüsünün VARSAYILAN tip dönüşleri, eski sağlayıcının kullandığı
     PostgREST JSON çıktısından FARKLIDIR. Native provider'ın eski sağlayıcı
     ile BİREBİR aynı JS değerlerini üretmesi için bu farklar burada,
     provider seviyesinde kapatılır (repository/consumer'a DOKUNMADAN).

   FARKLAR (pg default → PostgREST/eski sağlayıcı):
     numeric/decimal (1700)  string   → number
     int8/bigint     (  20)  string   → number   (>2^53 için caveat, altta)
     date            (1082)  JS Date  → "YYYY-MM-DD" (string)
     timestamp       (1114)  JS Date  → "YYYY-MM-DDTHH:MM:SS[.ffffff]"
     timestamptz     (1184)  JS Date  → "YYYY-MM-DDTHH:MM:SS[.ffffff]±HH:MM"

   ⚠️ TİP KORUMA (precision):
     timestamp/timestamptz için Date'e ÇEVİRMEDEN ham metin yeniden
     biçimlendirilir → PostgREST'in mikro-saniye (6 hane) hassasiyeti
     KAYBEDİLMEZ (JS Date yalnız ms taşır). Yalnız boşluk→"T" ve tz
     offset "+00" → "+00:00" normalize edilir.

   ⚠️ UTC VARSAYIMI:
     PostgREST timestamptz'i UTC (+00:00) döndürür. eski sağlayıcı Pooler
     bağlantısı timezone=UTC'dir → ham metin "...+00" gelir, normalize
     "+00:00" olur (birebir). Bağlantı UTC değilse offset yerel gelir;
     Pooler default UTC olduğundan parity korunur.

   ⚠️ int8 CAVEAT:
     PostgREST de int8'i JSON number döndürür (aynı >2^53 riski). Bu
     projede id'ler uuid (string); int8 kolon nadir. Birebir parity için
     number seçildi; gerekirse ilgili kolon açıkça string'e alınabilir.

   ⚠️ GLOBAL ETKİ SINIRI:
     `pg.types.setTypeParser` pg modülüne globaldir; ancak eski sağlayıcı REST
     istemcisi pg KULLANMAZ → yalnız native yol etkilenir, eski sağlayıcı yolu
     ETKİLENMEZ. Idempotent (register bir kez).
   =============================================================== */

/** numeric/decimal/int8 → number | null (PostgREST JSON number parity). */
function toNumberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/** date (1082) → ham "YYYY-MM-DD" string (PostgREST ile birebir). */
function toDateString(value: string | null): string | null {
  return value;
}

/** timestamp (1114) → "YYYY-MM-DDTHH:MM:SS[.ffffff]" (boşluk→T). */
function toTimestampString(value: string | null): string | null {
  return value === null ? null : value.replace(" ", "T");
}

/** timestamptz (1184) → "…T…±HH:MM" (boşluk→T + offset "+00"→"+00:00"). */
function toTimestamptzString(value: string | null): string | null {
  if (value === null) return null;
  const iso = value.replace(" ", "T");
  /* Sondaki "+00" / "-03" → "+00:00" / "-03:00". Yarım-saatli offset'ler
     (ör. "+05:30") zaten ":" içerir → bu regex onları etkilemez. */
  return iso.replace(/([+-]\d{2})$/, "$1:00");
}

let registered = false;

/** pg tip-parser'larını (PostgREST parity) bir kez register eder.
 *  `getPgPool()` içinde Pool kurulmadan önce çağrılır. */
export function registerPgTypeParsers(): void {
  if (registered) return;
  types.setTypeParser(types.builtins.NUMERIC, toNumberOrNull);
  types.setTypeParser(types.builtins.INT8, toNumberOrNull);
  types.setTypeParser(types.builtins.DATE, toDateString);
  types.setTypeParser(types.builtins.TIMESTAMP, toTimestampString);
  types.setTypeParser(types.builtins.TIMESTAMPTZ, toTimestamptzString);
  registered = true;
}

/* İzole test/doğrulama için parser fonksiyonlarını dışa aç (saf, DB'siz
   runtime doğrulaması yapılabilsin). */
export const __parityParsers = {
  toNumberOrNull,
  toDateString,
  toTimestampString,
  toTimestamptzString,
};
