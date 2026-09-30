import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 4 S1 — external-calendar domaini) — native
   provider'a alındı. READ yolları artık server action arkasında
   (external-reservations.action / external-calendar.admin.action). eski sağlayıcı
   importu tamamen kaldırıldı. `server-only` defansif sınır. Method yüzeyi +
   embed select string'leri (source:source_id, villa:villa_id — relation-
   metadata'da kayıtlı) + count/head/range/gt/lt/ilike + SQL davranışı AYNEN. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ EXTERNAL CALENDAR EVENTS — REPOSITORY (native, READ-side)
   ===============================================================
   `external_calendar_events` tablosu READ-side I/O. `db` = native provider
   (`dbNative`); tek app rolü → RLS/session-DI YOK.

   ⚠️ AUTH PATH KORUNUR:
     `db` = dbNative (anon, RLS aktif) → helper/service'in
     kullandığı `@/lib/db` ile aynı PostgrestQueryBuilder →
     BYTE-IDENTICAL. Bu repo service-role `.server` repo'nun
     KARŞITIDIR (upgrade/downgrade YOK): read yolları anon kalır.

   DAVRANIŞ:
     - Native eski sağlayıcı `{ data, error }` döner; repo sessiz (throw/log
       YOK). Embed narrowing / expansion / detail-map / fail-soft
       caller'da KALIR. Embedded select string AYNEN (byte-identical).
   =============================================================== */

export const externalCalendarEventRepository = {
  /** Aktif external event'ler (+source_name embed) — villa bazlı,
   *  is_active=true, start_date ASC. Admin helper (tooltip detail)
   *  delege. */
  async findActiveWithSourceByVilla(villaId: string) {
    return await db
      .from("external_calendar_events")
      .select(
        `start_date, end_date, summary, status,
         last_seen_at,
         source:source_id ( source_name )`
      )
      .eq("villa_id", villaId)
      .eq("is_active", true)
      .order("start_date", { ascending: true });
  },

  /** Aktif event'lerin source_id'leri — villa bazlı (source event-count
   *  agregasyonu caller'da). source.service list metadata. */
  async findActiveSourceIdsByVilla(villaId: string) {
    return await db
      .from("external_calendar_events")
      .select("source_id")
      .eq("villa_id", villaId)
      .eq("is_active", true);
  },

  /** Admin list — embed (source + villa) + count exact + start_date ASC +
   *  range pagination; opsiyonel filtreler (villa_id/source_id/is_active/
   *  from/to/search) YALNIZ verilirse zincire eklenir → service'teki
   *  conditional chain BİREBİR. Clamp (limit/offset) + narrowing caller'da. */
  async list(opts: {
    limit: number;
    offset: number;
    villa_id?: string;
    source_id?: string;
    is_active?: boolean | null;
    from?: string | null;
    to?: string | null;
    search?: string | null;
  }) {
    let q = db
      .from("external_calendar_events")
      .select(
        `id, villa_id, source_id, external_uid,
         start_date, end_date, summary, status, is_active,
         last_seen_at, created_at,
         source:source_id ( id, source_name, is_active,
                            last_success_at, last_error ),
         villa:villa_id ( id, title, slug )`,
        { count: "exact" }
      )
      .order("start_date", { ascending: true })
      .range(opts.offset, opts.offset + opts.limit - 1);

    if (opts.villa_id) q = q.eq("villa_id", opts.villa_id);
    if (opts.source_id) q = q.eq("source_id", opts.source_id);
    if (typeof opts.is_active === "boolean") {
      q = q.eq("is_active", opts.is_active);
    }
    if (opts.from) q = q.gt("end_date", opts.from);
    if (opts.to) q = q.lt("start_date", opts.to);
    if (opts.search && opts.search.trim()) {
      q = q.ilike("summary", `%${opts.search.trim()}%`);
    }

    return await q;
  },

  /** Count — aktif event'ler (head:true, count exact). KPI. */
  async countActive() {
    return await db
      .from("external_calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
  },

  /** Count — source bazlı pasif event'ler (head:true, count exact).
   *  "Pasifleri Temizle (N)" label. */
  async countInactiveBySource(sourceId: string) {
    return await db
      .from("external_calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("source_id", sourceId)
      .eq("is_active", false);
  },
};
