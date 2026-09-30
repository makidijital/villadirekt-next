import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (pilotlar PASS). Method yüzeyi +
   dönüş şekli aynen (upsert onConflict "code" dahil). Runtime testi
   yeşil olmadan production'a deploy edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ EXCHANGE RATES — SERVER-ONLY REPOSITORY (service-role)
   ===============================================================
   `exchange_rates` tablosu service-role read/write I/O. Public read
   (`/api/exchange-rates`), admin read (`/api/admin/exchange-rates/
   current`) ve refresh/upsert (`/api/admin/exchange-rates/refresh`,
   `/api/cron/exchange-rates-refresh`) route'ları bu repo üzerinden
   service-role ile çalışır. Anon repository
   (`lib/db/exchange-rate.repository.ts`) service-layer read'lerini
   (`db`, RLS) AYNEN sürdürür — bu server repo ONUN DUPLİKASYONU
   DEĞİL, service-role karşılığıdır.

   ⚠️ NEDEN AYRI (anon repo reuse EDİLEMEZ):
     `exchange_rates` admin-only RLS pattern'ine uyduğunda anon SELECT
     BOŞ döner (route yorumu). Bu yüzden bu path'ler service-role
     (`dbAdmin`, RLS bypass) kullanır; anon `db`'ye düşürmek public
     endpoint'i kırar. `dbAdmin.from` ≡ `dbAdmin.from`
     (dbAdmin wrapper) → route inline çağrısıyla byte-identical.

   GÜVENLİK SINIRI (pages/menu/blog .server konvansiyonu):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` → service-role (service-role kimlik bilgisi, NEXT_PUBLIC_
       prefix yok) → yalnız server runtime.

   DAVRANIŞ — BYTE-IDENTICAL eski inline `dbAdmin.from(
   "exchange_rates")` çağrıları:
     - Native `{ data, error }` döner; repo sessiz. Map / fallback /
       error-mapping / status / log / rate-limit caller (route)
       tarafında AYNEN kalır.
   =============================================================== */

export const exchangeRateServerRepository = {
  /** select("code, rate") — public read (service-role RLS bypass). */
  async findCodeRate() {
    return await dbAdmin.from("exchange_rates").select("code, rate");
  },

  /** select("code, rate, updated_at") — admin current snapshot
   *  (service-role RLS bypass). Anon repo `findCodeRateUpdated`'ın
   *  service-role karşılığı; aynı projeksiyon. */
  async findCodeRateUpdated() {
    return await dbAdmin
      .from("exchange_rates")
      .select("code, rate, updated_at");
  },

  /** Batch upsert — onConflict "code" (refresh flow). ⚠️ onConflict
   *  parametresi BİREBİR korunur; caller batch'i (TRY hariç) hazırlar,
   *  repo yalnız yazar. */
  async upsert(
    rows: Array<{ code: string; rate: number; updated_at: string }>
  ) {
    return await dbAdmin
      .from("exchange_rates")
      .upsert(rows, { onConflict: "code" });
  },
};
