/* ===============================================================
   🛡️ EXTERNAL CALENDAR ADMIN — client-safe tipler + sabit
   ===============================================================
   `external-calendar.admin.helper` (server-only, native repo) client
   bundle'a sızmasın diye tip'ler ve `EMPTY_EXTERNAL_ADMIN_ARRAYS` sabiti
   ayrı client-safe modülde (yalnız saf-veri/tip; server importu YOK).
   Reservation-form client component'leri (ManualReservationForm,
   reservations ekle/[id], ReservationCalendar) bunları buradan alır.
   Değerler + tip şekilleri AYNEN.
=============================================================== */

export type ExternalEventDetail = {
  source_name: string;
  summary: string | null;
  status: string | null;
  start_date: string;
  end_date: string;
  last_seen_at: string | null;
};

export type ExternalCalendarAdminArrays = {
  externalCheckinDates: Date[];
  externalCheckoutDates: Date[];
  externalMiddleDates: Date[];
  /** "YYYY-MM-DD" → o güne ait İLK external event detayı (tooltip). */
  detailByDate: Record<string, ExternalEventDetail>;
};

export const EMPTY_EXTERNAL_ADMIN_ARRAYS: ExternalCalendarAdminArrays = {
  externalCheckinDates: [],
  externalCheckoutDates: [],
  externalMiddleDates: [],
  detailByDate: {},
};
