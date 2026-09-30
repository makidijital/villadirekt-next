import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (pilotlar PASS). delete({count})
   parity hazır (mail-log deleteOlderThan ile aynı sınıf, kanıtlı):
   affectedCount → { count }. Method yüzeyi + dönüş şekli aynen. Runtime
   testi yeşil olmadan production'a deploy edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ VILLA PRICE — SERVER-ONLY REPOSITORY (service-role; cleanup)
   ===============================================================
   `/api/cron/villa-prices-cleanup` (Coolify Scheduled Task) bu repo
   üzerinden geçmişte kalan sezon fiyatlarını temizler. Mevcut cron
   server-repo deseninin (mail-log / short-gaps / exchange-rate
   .repository.server.ts) birebir kardeşi — yeni mimari YOK.

   GÜVENLİK SINIRI (diğer .server repo'larla aynı konvansiyon):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` → service-role (service-role kimlik bilgisi, NEXT_PUBLIC_
       prefix YOK) → RLS bypass, yalnız server runtime.

   DAVRANIŞ:
     - `delete({ count: "exact" })` → silinen satır sayısını döndürür
       (native `{ count, error }`). mail-log deleteOlderThan ile
       BİREBİR aynı desen; yalnız tablo + kolon farklı.
=============================================================== */

export const villaPriceServerRepository = {
  /** Geçmişte kalan sezonlar — `end_date < today` satırlarını siler
   *  (count exact). STRICT `<`: bugün biten sezon KORUNUR (aynı gün
   *  kullanılmaya devam eder), ertesi gün silinir. Idempotent: eşleşen
   *  satır yoksa count 0, hata yok. WHERE'li DELETE (safe-updates OK). */
  async deletePastSeasons(today: string) {
    return await dbAdmin
      .from("villa_prices")
      .delete({ count: "exact" })
      .lt("end_date", today);
  },
};
