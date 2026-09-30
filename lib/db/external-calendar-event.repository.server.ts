import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (pilotlar PASS). bulk upsert
   (onConflict "villa_id,external_uid") + delete/update RETURNING +
   PostgREST IN-list (.not in) parity hazır; method yüzeyi + dönüş şekli
   aynen. Runtime testi yeşil olmadan production'a deploy edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ EXTERNAL CALENDAR EVENTS — SERVER-ONLY REPOSITORY (service-role)
   ===============================================================
   `external_calendar_events` tablosu service-role read/write I/O.
   Public availability helper (`lib/external-calendar.public.helper.ts`)
   ve sync engine / admin route'ları bu repo üzerinden service-role ile
   çalışır. `external_calendar_events` RLS authenticated INSERT/UPDATE/
   DELETE policy YOK; public side anon ile OKUYAMAZ → bu path'ler
   service-role (`dbAdmin`, RLS bypass) gerektirir.

   ⚠️ AUTH PATH KORUNUR:
     `dbAdmin.from` ≡ `dbAdmin.from` (dbAdmin wrapper) →
     helper'ın eski inline çağrısıyla BYTE-IDENTICAL. Anon `db`'ye
     düşürmek RLS DENY → boş sonuç olurdu; ASLA yapılmaz.

   GÜVENLİK SINIRI (pages/menu/blog .server konvansiyonu):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` → service-role (service-role kimlik bilgisi, NEXT_PUBLIC_
       prefix yok) → yalnız server runtime.

   DAVRANIŞ:
     - Native eski sağlayıcı `{ data, error }` döner; repo sessiz (throw/log
       YOK). Expansion / validation / fail-soft / log caller'da KALIR.
     - SELECT yalnız `start_date, end_date` — PII (summary/description/
       raw_ical) taşınmaz (public consumer yalnız "blocked" görür).
   =============================================================== */

export const externalCalendarEventServerRepository = {
  /** Aktif external event date range'leri — villa bazlı, is_active=true.
   *  SELECT yalnız start_date,end_date. Public availability helper
   *  delege (fetchExternalCalendarArraysForVilla /
   *  fetchExternalCalendarStringsForVilla — İKİSİ de bu tek query). */
  async findActiveDateRangesByVilla(villaId: string) {
    return await dbAdmin
      .from("external_calendar_events")
      .select("start_date, end_date")
      .eq("villa_id", villaId)
      .eq("is_active", true);
  },

  /** Purge — source bazlı pasif event'leri HARD DELETE; silinen id'leri
   *  döner (.select("id")). Yalnız is_active=false; aktif event'ler ASLA
   *  silinmez. deleted_count caller'da. */
  async deleteInactiveBySource(sourceId: string) {
    return await dbAdmin
      .from("external_calendar_events")
      .delete()
      .eq("source_id", sourceId)
      .eq("is_active", false)
      .select("id");
  },

  /** Deactivate route — event existence + state fetch (core kolonlar),
   *  .maybeSingle(). manually_deactivated/embed BURADA YOK (route
   *  yorumu). */
  async findByIdForDeactivate(id: string) {
    return await dbAdmin
      .from("external_calendar_events")
      .select(
        "id, villa_id, source_id, external_uid, start_date, end_date, summary, is_active"
      )
      .eq("id", id)
      .maybeSingle();
  },

  /** Update by id — generic patch (deactivate payload caller'da kurulur:
   *  is_active/manually_deactivated/updated_at). `.select()` YOK. */
  async updateById(id: string, patch: Record<string, unknown>) {
    return await dbAdmin
      .from("external_calendar_events")
      .update(patch)
      .eq("id", id);
  },

  /** Sync — upsert events (onConflict "villa_id,external_uid"); eklenen/
   *  güncellenen id'leri döner (.select("id")). ⚠️ onConflict key'i
   *  BİREBİR korunur. Row build (buildUpsertRows) caller'da. */
  async upsertByVillaUid(
    rows: Array<{
      source_id: string;
      villa_id: string;
      external_uid: string;
      start_date: string;
      end_date: string;
      summary: string | null;
      description: string | null;
      status: string | null;
      raw_ical: string;
      is_active: boolean;
      last_seen_at: string;
      updated_at: string;
    }>
  ) {
    return await dbAdmin
      .from("external_calendar_events")
      .upsert(rows, { onConflict: "villa_id,external_uid" })
      .select("id");
  },

  /** Sync — manual override sweep: admin'in pasifleştirdiği (manually_
   *  deactivated=true) hâlâ aktif event'leri tekrar is_active=false yapar.
   *  ⚠️ Filtre zinciri BİREBİR (source_id + manually_deactivated=true +
   *  is_active=true). updatedAt caller'da (paylaşılan `now`). */
  async deactivateManualOverrideBySource(
    sourceId: string,
    updatedAt: string
  ) {
    return await dbAdmin
      .from("external_calendar_events")
      .update({ is_active: false, updated_at: updatedAt })
      .eq("source_id", sourceId)
      .eq("manually_deactivated", true)
      .eq("is_active", true);
  },

  /** Sync — stale deactivate: bu sync'te GÖRÜLMEYEN aktif event'leri
   *  pasifleştir. ⚠️ seenUids doluysa `.not("external_uid","in",(...))`
   *  ile hariç tut — PostgREST IN quoting BİREBİR (çift-tırnak sarma +
   *  içteki `"` → `""` escape); boşsa TÜM aktif satırlar. Silinen/
   *  etkilenen id'leri döner (.select("id")). updatedAt (`now`) + seenUids
   *  (parsed.events) caller'da. */
  async deactivateStaleBySource(
    sourceId: string,
    updatedAt: string,
    seenUids: string[]
  ) {
    const deactivateQuery = dbAdmin
      .from("external_calendar_events")
      .update({ is_active: false, updated_at: updatedAt })
      .eq("source_id", sourceId)
      .eq("is_active", true);

    const finalQuery =
      seenUids.length > 0
        ? deactivateQuery.not(
            "external_uid",
            "in",
            "(" + seenUids.map((u) => `"${u.replace(/"/g, '""')}"`).join(",") + ")"
          )
        : deactivateQuery;

    return await finalQuery.select("id");
  },
};
