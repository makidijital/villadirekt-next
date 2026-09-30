"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import { externalCalendarEventRepository } from "@/lib/db/external-calendar-event.repository";
import { externalCalendarSourceRepository } from "@/lib/db/external-calendar-source.repository";
import type {
  ExternalEventListItem,
  ExternalEventListFilters,
  ExternalEventListResult,
  ExternalCalendarKpi,
  FilterOption,
} from "@/app/services/external-calendar-events.service";

/* ===============================================================
   🛡️ EXTERNAL RESERVATIONS — READ SERVER ACTIONS (FAZ 4 S1)
   ===============================================================
   Eski `external-calendar-events.service` READ helper'ları (list/kpi/
   filter/count) native repo (server-only) kullandığı için buraya taşındı.
   Logic BİREBİR (limit clamp, embed narrowing, 4-paralel KPI, filter merge)
   — davranış + dönüş şekilleri değişmedi. ExternalReservationList (client)
   bu action'ları çağırır; mutation'lar (purge/deactivate, adminFetch)
   events.service'te kalır.
   =============================================================== */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function listExternalCalendarEventsAction(
  filters: ExternalEventListFilters = {}
): Promise<ExternalEventListResult> {
  await requirePermission("external_calendars");
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, Number(filters.limit) || DEFAULT_LIMIT)
  );
  const offset = Math.max(0, Number(filters.offset) || 0);

  const { data, error, count } = await externalCalendarEventRepository.list({
    limit,
    offset,
    villa_id: filters.villa_id,
    source_id: filters.source_id,
    is_active: filters.is_active,
    from: filters.from,
    to: filters.to,
    search: filters.search,
  });
  if (error) {
    console.error("[external-calendar-events.list] FAILED", error.message);
    return { items: [], total: 0 };
  }

  /* Embed-select TS narrowing. */
  const items = ((data as unknown) as ExternalEventListItem[]) || [];
  return { items, total: count ?? 0 };
}

export async function getExternalCalendarKpiAction(): Promise<ExternalCalendarKpi> {
  await requirePermission("external_calendars");
  /* Tek round-trip yerine 4 paralel head-count query — minimal payload. */
  const [eventsRes, activeSourcesRes, errorSourcesRes, latestSourceRes] =
    await Promise.all([
      externalCalendarEventRepository.countActive(),
      externalCalendarSourceRepository.countActive(),
      externalCalendarSourceRepository.countWithError(),
      externalCalendarSourceRepository.findLatestSuccessAt(),
    ]);

  return {
    activeEventsCount: eventsRes.count ?? 0,
    activeSourcesCount: activeSourcesRes.count ?? 0,
    errorSourcesCount: errorSourcesRes.count ?? 0,
    lastSuccessAt:
      (latestSourceRes.data as { last_success_at: string | null } | null)
        ?.last_success_at ?? null,
  };
}

export async function getExternalCalendarFilterOptionsAction(): Promise<{
  villas: FilterOption[];
  sources: FilterOption[];
}> {
  await requirePermission("external_calendars");
  const [villasRes, sourcesRes] = await Promise.all([
    externalCalendarSourceRepository.findActiveVillaEmbeds(),
    externalCalendarSourceRepository.findAllWithVillaTitle(),
  ]);

  type VillaRow = { villa: { id: string; title: string | null } | null };
  type SourceRow = {
    id: string;
    source_name: string;
    is_active: boolean | null;
    villa: { title: string | null } | null;
  };

  const villaMap = new Map<string, FilterOption>();
  for (const r of ((villasRes.data as unknown) as VillaRow[]) || []) {
    const v = r?.villa;
    if (v?.id) {
      villaMap.set(v.id, { id: v.id, label: v.title || v.id });
    }
  }

  const sources: FilterOption[] = (
    ((sourcesRes.data as unknown) as SourceRow[]) || []
  ).map((s) => ({
    id: s.id,
    label: s.source_name + (s.villa?.title ? " · " + s.villa.title : ""),
    is_active: s.is_active ?? true,
  }));

  return {
    villas: Array.from(villaMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "tr")
    ),
    sources,
  };
}

export async function countInactiveEventsForSourceAction(
  sourceId: string
): Promise<number> {
  await requirePermission("external_calendars");
  const id = (sourceId || "").toString().trim();
  if (!id) return 0;
  const { count, error } =
    await externalCalendarEventRepository.countInactiveBySource(id);
  if (error) {
    console.warn(
      "[external-calendar-events.countInactive] FAILED",
      error.message
    );
    return 0;
  }
  return count ?? 0;
}
