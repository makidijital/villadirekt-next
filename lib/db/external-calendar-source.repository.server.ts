import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (pilotlar PASS). maybeSingle/update/
   timestamptz/SQLSTATE parity hazır; method yüzeyi + dönüş şekli aynen.
   Runtime testi yeşil olmadan production'a deploy edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ EXTERNAL CALENDAR SOURCES — SERVER-ONLY REPOSITORY (service-role)
   ===============================================================
   `external_calendar_sources` tablosu service-role read/write I/O.
   Sync engine (`app/services/external-calendar.service.ts`) ve admin
   route'ları (purge / deactivate-enrich / cron) bu repo üzerinden
   service-role ile çalışır. Anon repository
   (`lib/db/external-calendar-source.repository.ts`) admin browser CRUD'ını
   (RLS authenticated) AYNEN sürdürür — bu server repo ONUN DUPLİKASYONU
   DEĞİL, service-role karşılığıdır.

   ⚠️ AUTH PATH KORUNUR:
     `dbAdmin.from` ≡ `dbAdmin.from` (dbAdmin wrapper) →
     route'ların eski inline çağrılarıyla BYTE-IDENTICAL. Anon `db`'ye
     düşürmek EXECUTION PATH / permission semantiğini değiştirir; ASLA
     yapılmaz.

   GÜVENLİK SINIRI (pages/menu/blog .server konvansiyonu):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` → service-role (service-role kimlik bilgisi, NEXT_PUBLIC_
       prefix yok) → yalnız server runtime.

   DAVRANIŞ:
     - Native eski sağlayıcı `{ data, error }` döner; repo sessiz (throw/log
       YOK). Guard / karar / error-mapping / status / log / audit
       caller'da KALIR.
   =============================================================== */

export const externalCalendarSourceServerRepository = {
  /** Purge guard fetch — source verify (id, source_name, is_active,
   *  villa_id), .maybeSingle(). "Yalnız pasif kaynak purge edilebilir"
   *  kararı caller'da. */
  async findPurgeGuardById(id: string) {
    return await dbAdmin
      .from("external_calendar_sources")
      .select("id, source_name, is_active, villa_id")
      .eq("id", id)
      .maybeSingle();
  },

  /** Enrich fetch — yalnız source_name, .maybeSingle(). Deactivate route
   *  audit entity_title kozmetiği (fail-soft; caller catch'ler). */
  async findSourceNameById(id: string) {
    return await dbAdmin
      .from("external_calendar_sources")
      .select("source_name")
      .eq("id", id)
      .maybeSingle();
  },

  /** Aktif source id'leri — cron sync loop input'u (.select("id")
   *  .eq("is_active", true)). Pasif source'lar sync edilmez. */
  async findActiveIds() {
    return await dbAdmin
      .from("external_calendar_sources")
      .select("id")
      .eq("is_active", true);
  },

  /** Sync — source row fetch (id, villa_id, source_name, ical_url,
   *  is_active), .maybeSingle(). Sync engine giriş noktası. */
  async findForSync(id: string) {
    return await dbAdmin
      .from("external_calendar_sources")
      .select("id, villa_id, source_name, ical_url, is_active")
      .eq("id", id)
      .maybeSingle();
  },

  /** Update by id — generic patch (metadata: last_synced_at /
   *  last_success_at / last_error / last_event_count / updated_at).
   *  `.select()` YOK; caller payload'ı (updated_at spread dahil) kurar. */
  async updateById(id: string, patch: Record<string, unknown>) {
    return await dbAdmin
      .from("external_calendar_sources")
      .update(patch)
      .eq("id", id);
  },
};
