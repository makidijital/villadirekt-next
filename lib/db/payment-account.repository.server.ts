import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (pilotlar PASS). maybeSingle +
   order/limit + numeric/jsonb read + error(code/details/hint) parity
   hazır. `status` PostgREST HTTP artefaktı olup native'de yoktur
   (consumer yalnız log'da okur; fonksiyonel etki YOK). Method yüzeyi +
   dönüş şekli aynen. Runtime testi yeşil olmadan production'a deploy
   edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ PAYMENT ACCOUNT — SERVER-ONLY READ REPOSITORY (service-role)
   ===============================================================
   `payment-account.server.ts` içindeki inline
   `dbAdmin.from("payment_accounts")...` read'inin BİREBİR
   taşınmış hali (western-union-account.repository.server.ts ile aynı
   pattern). Davranış değişmez:
     - `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     - `dbAdmin` (service-role, service-role kimlik bilgisi) → RLS bypass
       (migration 034: payment_accounts anon erişim sıfır).
     - select / eq / order / limit / maybeSingle AYNEN.
     - native cevabı OLDUĞU GİBİ döner: `{ data, error, status,
       ... }`. `status` DROP EDİLMEZ — caller log'unda kullanılıyor.
     - throw YOK, log YOK; fail-safe try/catch + logging SERVICE'te.
=============================================================== */

export const paymentAccountRepository = {
  async findActive() {
    return await dbAdmin
      .from("payment_accounts")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  },
};
