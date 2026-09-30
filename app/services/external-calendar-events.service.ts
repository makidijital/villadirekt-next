import { adminFetch } from "@/lib/admin-fetch";

/* ===============================================================
   🛡️ EXTERNAL CALENDAR EVENTS — MUTATIONS (admin, client-safe)
   ===============================================================
   /maki-admin/external-reservations admin ekranının MUTASYON
   helper'ları — YALNIZ `adminFetch` (client-session Bearer) ile
   korunan admin route'larına gider (purge-inactive / deactivate).
   Route service-role ile yazar; auth/sync davranışı BİREBİR korunur.

   ⚠️ FAZ 4 S1 — READ helper'ları (list/kpi/filter/count) native repo
     kullandığı için server action'a taşındı:
       → app/(admin)/maki-admin/external-reservations/external-reservations.action.ts
     Bu modül repo IMPORT ETMEZ → client-safe kalır (ExternalReservationList
     purge/deactivate'i doğrudan buradan çağırır; adminFetch tarayıcı
     session'ıyla çalışır).

   READ-side tip'ler burada TANIMLI kalır (client + action ortak tüketir).
=============================================================== */

/* ---------------- READ-side tip'ler (action + client ortak) ---------------- */
export type ExternalEventListItem = {
  id: string;
  villa_id: string;
  source_id: string;
  external_uid: string;
  start_date: string;
  end_date: string;
  summary: string | null;
  status: string | null;
  is_active: boolean;
  last_seen_at: string;
  created_at: string;
  source: {
    id: string;
    source_name: string;
    is_active: boolean | null;
    last_success_at: string | null;
    last_error: string | null;
  } | null;
  villa: {
    id: string;
    title: string | null;
    slug: string | null;
  } | null;
};

export type ExternalEventListFilters = {
  villa_id?: string;
  source_id?: string;
  is_active?: boolean | null;
  /** ISO date YYYY-MM-DD; overlap filter: start_date < to AND end_date > from */
  from?: string | null;
  to?: string | null;
  /** summary veya villa title substring */
  search?: string | null;
  limit?: number;
  offset?: number;
};

export type ExternalEventListResult = {
  items: ExternalEventListItem[];
  total: number;
};

export type ExternalCalendarKpi = {
  activeEventsCount: number;
  activeSourcesCount: number;
  lastSuccessAt: string | null;
  errorSourcesCount: number;
};

export type FilterOption = { id: string; label: string; is_active?: boolean };

/* ===============================================================
   🛡️ FAZ 56G+ — PURGE INACTIVE (source-scoped, hard delete)
   ===============================================================
   YALNIZ: source.is_active=false + event.is_active=false. Aktif kaynaklar/
   eventler dokunulmaz. UPDATE/DELETE policy yok → admin client direkt
   yazamaz; route service-role ile çalışır. (adminFetch → client Bearer.)
=============================================================== */
export type PurgeInactiveEventsResult =
  | { ok: true; sourceId: string; deletedCount: number }
  | { ok: false; error: string };

export async function purgeInactiveEventsForSource(
  sourceId: string
): Promise<PurgeInactiveEventsResult> {
  const id = (sourceId || "").toString().trim();
  if (!id) return { ok: false, error: "source id gerekli" };
  try {
    const res = await adminFetch(
      `/api/admin/external-calendars/sources/${encodeURIComponent(id)}/purge-inactive`,
      { method: "POST" }
    );
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      source_id?: string;
      deleted_count?: number;
      error?: string;
    };
    if (!res.ok || !json.ok) {
      return {
        ok: false,
        error: json.error || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      sourceId: json.source_id || id,
      deletedCount: Number(json.deleted_count) || 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
    return { ok: false, error: msg };
  }
}

/* ===============================================================
   🛡️ FAZ 56G+ — DEACTIVATE EVENT (admin soft toggle)
   ===============================================================
   Soft-deactivate. Route (POST .../events/:id/deactivate) service-role
   ile UPDATE atar (manually_deactivated=true, migration 032). IDEMPOTENT:
   zaten pasifse `already_inactive:true`. Activity log route içinde.
   (adminFetch → client Bearer.)
=============================================================== */
export type DeactivateExternalEventResult =
  | { ok: true; id: string; alreadyInactive: boolean }
  | { ok: false; error: string };

export async function deactivateExternalCalendarEvent(
  eventId: string
): Promise<DeactivateExternalEventResult> {
  const id = (eventId || "").toString().trim();
  if (!id) return { ok: false, error: "event id gerekli" };
  try {
    const res = await adminFetch(
      `/api/admin/external-calendars/events/${encodeURIComponent(id)}/deactivate`,
      { method: "POST" }
    );
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      id?: string;
      already_inactive?: boolean;
      error?: string;
    };
    if (!res.ok || !json.ok) {
      return {
        ok: false,
        error: json.error || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      id: json.id || id,
      alreadyInactive: !!json.already_inactive,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
    return { ok: false, error: msg };
  }
}
