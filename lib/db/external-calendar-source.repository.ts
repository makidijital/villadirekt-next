import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 4 S1 — external-calendar domaini) — native
   provider'a alındı. CRUD yolları artık server action arkasında
   (ical-sync.action / external-reservations.action). eski sağlayıcı importu
   tamamen kaldırıldı. `server-only` defansif sınır. Method yüzeyi +
   embed (villa:villa_id) + count/head/not/maybeSingle/single + SQL AYNEN. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ EXTERNAL CALENDAR SOURCES — REPOSITORY (native, CRUD)
   ===============================================================
   `external_calendar_sources` tablosu CRUD I/O. `db` = native provider
   (`dbNative`); tek app rolü → RLS/session-DI YOK.

   ⚠️ AUTH PATH KORUNUR:
     `db` = dbNative (anon, RLS aktif) → service'in kullandığı
     `@/lib/db` ile aynı PostgrestQueryBuilder → BYTE-IDENTICAL.
     Bu repo, sync pipeline / admin route'ların kullandığı service-role
     `.server` repo'nun KARŞITIDIR (upgrade/downgrade YOK).

   DAVRANIŞ:
     - Native eski sağlayıcı `{ data, error }` döner; repo sessiz (throw/log
       YOK). Validation / sanitize / timestamp / dup-mesaj / fallback /
       aggregation caller'da KALIR. `source_type`/`is_active` sabitleri
       ve `updated_at` üretimi caller'da.
   =============================================================== */

export const externalCalendarSourceRepository = {
  /** Villa için tüm source'lar (`*`), created_at ASC. */
  async findAllByVilla(villaId: string) {
    return await db
      .from("external_calendar_sources")
      .select("*")
      .eq("villa_id", villaId)
      .order("created_at", { ascending: true });
  },

  /** Insert — eklenen satırı döner (.select("*").single()). Caller
   *  payload'ı (source_type "ical", is_active true dahil) kurar. */
  async insert(payload: {
    villa_id: string;
    source_name: string;
    source_type: string;
    ical_url: string;
    is_active: boolean;
  }) {
    return await db
      .from("external_calendar_sources")
      .insert(payload)
      .select("*")
      .single();
  },

  /** Update by id — güncellenen satırı döner (.select("*").single()).
   *  setActive / updateUrl AYNI query shape'i; patch (updated_at dahil)
   *  caller'da kurulur. */
  async updateById(id: string, patch: Record<string, unknown>) {
    return await db
      .from("external_calendar_sources")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
  },

  /** Count — aktif source'lar (head:true, count exact). KPI. */
  async countActive() {
    return await db
      .from("external_calendar_sources")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
  },

  /** Count — last_error dolu source'lar (head:true, count exact). KPI. */
  async countWithError() {
    return await db
      .from("external_calendar_sources")
      .select("id", { count: "exact", head: true })
      .not("last_error", "is", null);
  },

  /** En son başarılı sync zamanı — tek satır (last_success_at not null,
   *  order desc, limit 1, maybeSingle). KPI lastSuccessAt. */
  async findLatestSuccessAt() {
    return await db
      .from("external_calendar_sources")
      .select("last_success_at")
      .not("last_success_at", "is", null)
      .order("last_success_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  },

  /** Filter options — aktif source'ların villa embed'i (id, title). */
  async findActiveVillaEmbeds() {
    return await db
      .from("external_calendar_sources")
      .select("villa:villa_id ( id, title )")
      .eq("is_active", true);
  },

  /** Filter options — tüm source'lar (id, source_name, is_active) + villa
   *  title embed, source_name ASC. */
  async findAllWithVillaTitle() {
    return await db
      .from("external_calendar_sources")
      .select("id, source_name, is_active, villa:villa_id ( title )")
      .order("source_name", { ascending: true });
  },
};
