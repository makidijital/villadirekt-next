import { parseLocalDate } from "@/lib/date-format";

/* ===============================================================
   🛡️ EXTERNAL CALENDAR PUBLIC — CLIENT-SAFE SHARED MODULE
   ===============================================================
   PURPOSE:
     `lib/external-calendar.public.helper.ts` artık server-only
     (`dbAdmin` → `import "server-only"` chain). Client
     component'ler tip ve pure helper ihtiyacı için bu modülü
     import eder; service-role bundle'a sızmaz.

   CONTENT (yalnız vendor-agnostic, side-effect'siz):
     • type ExternalCalendarArrays / ExternalCalendarStringArrays
     • EMPTY_EXTERNAL_ARRAYS / EMPTY_EXTERNAL_STRING_ARRAYS
     • externalStringsToDateArrays — string[] → Date[] dönüşümü
     • mergeExternalIntoConfirmed — reservation arrays merge helper

   SERVER-ONLY (bu modüle TAŞINMAZ):
     • fetchExternalCalendarArraysForVilla
     • fetchExternalCalendarStringsForVilla
     → İkisi de service-role DB fetch yapar; `.helper.ts`'de kalır.

   DAVRANIŞ BYTE-IDENTICAL:
     • Tüm exported symbol shape'leri ve runtime davranışı eski
       helper.ts ile birebir aynı; sadece dosya konumu ayrıldı.
     • parseLocalDate / Date math semantic'i aynen (LOCAL midnight,
       UTC drift yok).
   =============================================================== */

export type ExternalCalendarArrays = {
  externalCheckinDates: Date[];
  externalCheckoutDates: Date[];
  externalMiddleDates: Date[];
};

export const EMPTY_EXTERNAL_ARRAYS: ExternalCalendarArrays = Object.freeze({
  externalCheckinDates: [],
  externalCheckoutDates: [],
  externalMiddleDates: [],
}) as ExternalCalendarArrays;

/* ===============================================================
   SERIALIZATION-SAFE VARIANT — server→client prop passing
   ===============================================================
   Server component'tan client component'e Date[] geçirmek
   serialization (JSON.stringify) sırasında ISO string'e çevirir →
   client tarafında reconstruction gerekir. Bu varyant DOĞRUDAN
   YYYY-MM-DD string[] döner; client tarafında parseLocalDate ile
   Date[]'e dönüştürülür (externalStringsToDateArrays). */
export type ExternalCalendarStringArrays = {
  checkin: string[]; // YYYY-MM-DD
  checkout: string[]; // YYYY-MM-DD
  middle: string[]; // YYYY-MM-DD
};

export const EMPTY_EXTERNAL_STRING_ARRAYS: ExternalCalendarStringArrays =
  Object.freeze({
    checkin: [],
    checkout: [],
    middle: [],
  }) as ExternalCalendarStringArrays;

/* Client-side: string[] → Date[] (parseLocalDate UTC-drift-safe).
   Hem AvailabilityInlineCalendar hem BookingSidebar bunu çağırır. */
export function externalStringsToDateArrays(
  s: ExternalCalendarStringArrays
): ExternalCalendarArrays {
  return {
    externalCheckinDates: s.checkin.map((v) => parseLocalDate(v)),
    externalCheckoutDates: s.checkout.map((v) => parseLocalDate(v)),
    externalMiddleDates: s.middle.map((v) => parseLocalDate(v)),
  };
}

/* ===============================================================
   PUBLIC MERGE HELPER — caller'ın mevcut reservation array'leriyle
   external'ı birleştirmesi için tek satır helper.
   PUBLIC consumer:
     const arrays = await fetchAndExpandVillaAvailability(villaId);
     const external = await fetchExternalCalendarArraysForVilla(villaId);
     const merged = mergeExternalIntoConfirmed(arrays, external);
     // merged.checkinDates artık external start_date'leri de içerir
     // engine SAME kırmızı render → public ayrım görmez
=============================================================== */
export function mergeExternalIntoConfirmed<
  T extends {
    checkinDates: Date[];
    checkoutDates: Date[];
    blockedDates: Date[];
  }
>(base: T, external: ExternalCalendarArrays): T {
  return {
    ...base,
    checkinDates: [...base.checkinDates, ...external.externalCheckinDates],
    checkoutDates: [...base.checkoutDates, ...external.externalCheckoutDates],
    blockedDates: [...base.blockedDates, ...external.externalMiddleDates],
  };
}
