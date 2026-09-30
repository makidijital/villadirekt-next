import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 2 — anon repo) — importer zinciri KANITLI
   client-safe (exchange-rate.service + 2 public RSC page + price-verify
   [server-only]; hiçbir "use client" yok). Salt-okunur 2 düz metod;
   write/upsert/rpc/embed yok (upsert server sürümünde, PASS). numeric
   (rate) / timestamptz (updated_at) parser hazır → provider değişmedi.
   `server-only` defansif sınır. Dönüş şekli aynen. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ EXCHANGE RATES REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `exchange-rate.service.ts` içindeki inline `db.from(...)`
   read'lerinin BİREBİR taşınmış hali (single table: exchange_rates).
   Davranış değişmez:
     - `db` = dbNative (anon, RLS aktif); `db.from` ≡
       `db.from` (bind) → byte-identical.
     - Method'lar ham native sonucu (`{ data, error }`) döner;
       map/aggregate/return/log SERVICE'te.

   NOT: Bu service yalnız READ. Refresh/upsert /api/exchange-rates
        route'unda; burada DOKUNULMADI.
   İki ayrı select projeksiyonu → iki method (merge YOK).
=============================================================== */

export const exchangeRateRepository = {
  /** select("*") — getExchangeRates. */
  async findAll() {
    return await db.from("exchange_rates").select("*");
  },

  /** select("code, rate, updated_at") — getExchangeRatesMap. */
  async findCodeRateUpdated() {
    return await db
      .from("exchange_rates")
      .select("code, rate, updated_at");
  },
};
