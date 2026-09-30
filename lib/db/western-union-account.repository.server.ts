import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (pilotlar PASS). payment-account
   kardeşiyle aynı desen: maybeSingle + order/limit + numeric/jsonb read +
   error(code/details/hint) parity hazır. `status` (PostgREST HTTP
   artefaktı) native'de yok, consumer yalnız log'da okur (fonksiyonel etki
   YOK). Method yüzeyi + dönüş şekli aynen. Runtime testi yeşil olmadan
   production'a deploy edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ WESTERN UNION ACCOUNT — SERVER-ONLY READ REPOSITORY (service-role)
   ===============================================================
   `western-union-account.server.ts` içindeki inline
   `dbAdmin.from("western_union_accounts")...` çağrısının
   BİREBİR taşınmış hali (Phase 1 repo consolidation).

   GÜVENLİK SINIRI (mail-log / admin-activity-log repo'ları ile aynı):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` (service-role, service-role kimlik bilgisi) → RLS bypass
       (migration 060: western_union_accounts anon erişim yok).

   DAVRANIŞ:
     - select / eq / order / limit / maybeSingle AYNEN.
     - native cevabı OLDUĞU GİBİ döner: `{ data, error, status,
       ... }`. `status` DROP EDİLMEZ — caller log'unda kullanılıyor.
     - throw YOK, log YOK; fail-safe try/catch + logging SERVICE'te.
=============================================================== */

export const westernUnionAccountRepository = {
  async findActive() {
    return await dbAdmin
      .from("western_union_accounts")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  },
};
