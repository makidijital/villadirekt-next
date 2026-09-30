import "server-only";

import { externalCalendarEventServerRepository } from "@/lib/db/external-calendar-event.repository.server";
import { parseLocalDate } from "@/lib/date-format";

import {
  EMPTY_EXTERNAL_ARRAYS,
  EMPTY_EXTERNAL_STRING_ARRAYS,
  type ExternalCalendarArrays,
  type ExternalCalendarStringArrays,
} from "@/lib/external-calendar.public.shared";

/* ===============================================================
   🛡️ FAZ 56H-A — EXTERNAL CALENDAR FETCHES (SERVER-ONLY)
   ===============================================================
   external_calendar_events tablosundan service-role ile date range
   fetch + half-open [start, end) → engine array expansion.

   🛡️ SERVER-ONLY: `import "server-only"` direktifi + dbAdmin
   transitive guard. Bu modül CLIENT bundle'a sızarsa BUILD HATA.
   Client component'ler tip ve pure helper için
   `lib/external-calendar.public.shared.ts`'i import etmeli.

   GÜVENLİK:
     • Service-role — RLS bypass YOK; tablo authenticated-only,
       public side anon ile okuyamaz. Bu helper SADECE server
       component'lerden çağrılır (RSC içinden) ve service-role
       kullanır.
     • SELECT yalnız `start_date`, `end_date` — PII (summary,
       description, raw_ical) HİÇ döndürülmez. Public consumer
       yalnız "blocked" görür; source ayrımı yok.

   HALF-OPEN [start, end) EXPANSION:
     Reservation engine'in canonical render kuralı ile birebir:
       start_date         → checkin (half-day right boundary)
       middle days (n>1)  → blocked full
       end_date           → checkout (half-day left boundary)
     Adjacent rule preserved: checkout günü yeni check-in için açık.

   KULLANIM (PUBLIC consumer):
     Caller (AvailabilityInlineCalendar / BookingSidebar) bu helper
     çıktısını MEVCUT reservation arrays'i ile MERGE eder → engine
     normal kırmızı render eder. Public kullanıcı external ayrımı
     görmez.

   FAIL-SOFT:
     Service-role env yok / network down / RLS değişti → console.error
     + EMPTY_EXTERNAL_ARRAYS döner. Mevcut reservation render
     etkilenmez (caller existing arrays kullanmaya devam eder).

   BACKWARD-COMPAT RE-EXPORTS:
     Mevcut server caller'lar (slug page + availability route)
     bu modülden EMPTY_EXTERNAL_STRING_ARRAYS / ExternalCalendarStringArrays
     import edebilir; davranış aynı kalsın diye burada re-export
     edildi. Yeni caller'lar direkt `.shared.ts`'den almalı.
=============================================================== */

export {
  EMPTY_EXTERNAL_ARRAYS,
  EMPTY_EXTERNAL_STRING_ARRAYS,
  externalStringsToDateArrays,
  mergeExternalIntoConfirmed,
} from "@/lib/external-calendar.public.shared";
export type {
  ExternalCalendarArrays,
  ExternalCalendarStringArrays,
} from "@/lib/external-calendar.public.shared";

/**
 * Server-side fetch: villa için aktif external block date range'leri.
 * Yalnız RSC / server component'lerden çağrılmalı.
 */
export async function fetchExternalCalendarArraysForVilla(
  villaId: string
): Promise<ExternalCalendarArrays> {
  if (!villaId || typeof villaId !== "string") {
    return EMPTY_EXTERNAL_ARRAYS;
  }
  try {
    const { data, error } =
      await externalCalendarEventServerRepository.findActiveDateRangesByVilla(
        villaId
      );
    if (error) {
      console.error(
        "[external-calendar.public.helper] FAILED:",
        error.message
      );
      return EMPTY_EXTERNAL_ARRAYS;
    }
    return expandExternalEvents(
      (data || []) as Array<{
        start_date: string | null;
        end_date: string | null;
      }>
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[external-calendar.public.helper] EXCEPTION:", msg);
    return EMPTY_EXTERNAL_ARRAYS;
  }
}

export async function fetchExternalCalendarStringsForVilla(
  villaId: string
): Promise<ExternalCalendarStringArrays> {
  if (!villaId || typeof villaId !== "string") {
    return EMPTY_EXTERNAL_STRING_ARRAYS;
  }
  try {
    const { data, error } =
      await externalCalendarEventServerRepository.findActiveDateRangesByVilla(
        villaId
      );
    if (error) {
      console.error(
        "[external-calendar.public.helper] strings FAILED:",
        error.message
      );
      return EMPTY_EXTERNAL_STRING_ARRAYS;
    }
    return expandToStrings(
      (data || []) as Array<{
        start_date: string | null;
        end_date: string | null;
      }>
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[external-calendar.public.helper] strings EXCEPTION:", msg);
    return EMPTY_EXTERNAL_STRING_ARRAYS;
  }
}

/* ---------------------------------------------------------------
   INTERNAL EXPANSION HELPERS — yalnız bu modülden çağrılır
   ---------------------------------------------------------------
   Date math LOCAL midnight; UTC drift YOK (parseLocalDate kullanır).
   Mevcut reservation expansion mantığı ile birebir.
--------------------------------------------------------------- */

/* String expansion (LOCAL midnight, UTC drift yok). */
function expandToStrings(
  events: Array<{ start_date: string | null; end_date: string | null }>
): ExternalCalendarStringArrays {
  const checkin: string[] = [];
  const checkout: string[] = [];
  const middle: string[] = [];
  for (const e of events) {
    if (!e?.start_date || !e?.end_date) continue;
    const start = parseLocalDate(e.start_date);
    const end = parseLocalDate(e.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      continue;
    }
    if (!(start < end)) continue;

    checkin.push(toYmd(start));
    checkout.push(toYmd(end));

    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor < end) {
      middle.push(toYmd(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return { checkin, checkout, middle };
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function expandExternalEvents(
  events: Array<{ start_date: string | null; end_date: string | null }>
): ExternalCalendarArrays {
  const checkin: Date[] = [];
  const checkout: Date[] = [];
  const middle: Date[] = [];

  for (const e of events) {
    if (!e?.start_date || !e?.end_date) continue;
    const start = parseLocalDate(e.start_date);
    const end = parseLocalDate(e.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      continue;
    }
    if (!(start < end)) continue; // half-open zero-night reddi

    /* CHECKIN — start_date günü (half-day right pattern) */
    checkin.push(new Date(start));
    /* CHECKOUT — end_date günü (half-day left pattern; exclusive) */
    checkout.push(new Date(end));

    /* MIDDLE — strictly between (start, end) — exclusive both */
    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor < end) {
      middle.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return {
    externalCheckinDates: checkin,
    externalCheckoutDates: checkout,
    externalMiddleDates: middle,
  };
}
