import "server-only";

import { externalCalendarEventRepository } from "@/lib/db/external-calendar-event.repository";
import { parseLocalDate, formatLocalDate } from "@/lib/date-format";
import {
  type ExternalEventDetail,
  type ExternalCalendarAdminArrays,
  EMPTY_EXTERNAL_ADMIN_ARRAYS,
} from "@/lib/external-calendar.admin.types";

/* ===============================================================
   🛡️ FAZ 56H-A — EXTERNAL CALENDAR ARRAYS (ADMIN, client-side)
   ===============================================================
   ADMIN tarafında calendar.engine'e bağımsız external arrays geçer
   → engine bunları VIOLET renkte render eder (lowest priority).
   Çakışma durumunda: confirmed/manual (red) > pending (yellow)
   > external (violet); engine check sırası priority sağlar.

   AUTH:
     Authenticated eski sağlayıcı client (admin browser session JWT).
     RLS authenticated SELECT migration 029'da açık. Service-role
     gerekmez.

   ÇIKTI:
     • externalCheckinDates / externalCheckoutDates / externalMiddleDates
       → engine'e geçirilecek Date[] arrays
     • detailByDate (Record<"YYYY-MM-DD", EventDetail>)
       → admin UI tooltip/badge için source_name + summary
       (aynı güne birden fazla source çakışırsa İLK görülen kullanılır;
       admin context'te overlap nadirdir, edge case sentinel)

   FAIL-SOFT:
     Auth context yok / RLS değişti / network → console.warn +
     boş arrays döner. Admin calendar mevcut reservation/manual
     render etkilenmez.
=============================================================== */

/* Tipler + EMPTY sabiti client-safe `external-calendar.admin.types`
   modülüne taşındı (yukarıda import edildi). Değerler/şekiller AYNEN. */

export async function fetchExternalCalendarArraysForVillaAdmin(
  villaId: string
): Promise<ExternalCalendarAdminArrays> {
  if (!villaId || typeof villaId !== "string") {
    return EMPTY_EXTERNAL_ADMIN_ARRAYS;
  }
  try {
    const { data, error } =
      await externalCalendarEventRepository.findActiveWithSourceByVilla(
        villaId
      );
    if (error) {
      console.warn(
        "[external-calendar.admin.helper] SELECT failed:",
        error.message
      );
      return EMPTY_EXTERNAL_ADMIN_ARRAYS;
    }
    type Row = {
      start_date: string | null;
      end_date: string | null;
      summary: string | null;
      status: string | null;
      last_seen_at: string | null;
      source: { source_name: string | null } | null;
    };
    return expandWithDetail(((data as unknown) as Row[]) || []);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.warn("[external-calendar.admin.helper] EXCEPTION:", msg);
    return EMPTY_EXTERNAL_ADMIN_ARRAYS;
  }
}

/* ---------------------------------------------------------------
   EXPANSION + DETAIL MAP
--------------------------------------------------------------- */
type RawEvent = {
  start_date: string | null;
  end_date: string | null;
  summary: string | null;
  status: string | null;
  last_seen_at: string | null;
  source: { source_name: string | null } | null;
};

function expandWithDetail(
  events: RawEvent[]
): ExternalCalendarAdminArrays {
  const checkin: Date[] = [];
  const checkout: Date[] = [];
  const middle: Date[] = [];
  const detailByDate: Record<string, ExternalEventDetail> = {};

  for (const e of events) {
    if (!e?.start_date || !e?.end_date) continue;
    const start = parseLocalDate(e.start_date);
    const end = parseLocalDate(e.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      continue;
    }
    if (!(start < end)) continue;

    const detail: ExternalEventDetail = {
      source_name: e.source?.source_name?.trim() || "Harici",
      summary: e.summary,
      status: e.status,
      start_date: e.start_date,
      end_date: e.end_date,
      last_seen_at: e.last_seen_at,
    };

    /* CHECKIN — start_date day */
    checkin.push(new Date(start));
    setDetailIfAbsent(detailByDate, formatLocalDate(start), detail);

    /* CHECKOUT — end_date day */
    checkout.push(new Date(end));
    setDetailIfAbsent(detailByDate, formatLocalDate(end), detail);

    /* MIDDLE — strict between (start, end) */
    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor < end) {
      middle.push(new Date(cursor));
      setDetailIfAbsent(detailByDate, formatLocalDate(cursor), detail);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return {
    externalCheckinDates: checkin,
    externalCheckoutDates: checkout,
    externalMiddleDates: middle,
    detailByDate,
  };
}

function setDetailIfAbsent(
  map: Record<string, ExternalEventDetail>,
  key: string,
  value: ExternalEventDetail
): void {
  if (!map[key]) map[key] = value;
}
