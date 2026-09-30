import "server-only";

import { operationsRepository } from "@/lib/db/operations.repository";

/* 🛡️ PHASE 3 (migration 040): reservations admin-only RLS. Bu servis
   YALNIZ server dashboard'dan (server component) çağrılır — client
   component (UpcomingOperations) yalnız `import type` ile tip alır,
   fonksiyonu çağırmaz. `import "server-only"` + service_role güvenli:
   client bundle'a sızmaz, RLS bypass ile server-anon kırılması önlenir.
   Response yalnız operasyonel snapshot (villa başlığı + misafir adı/
   sayısı + tarih); admin dashboard'da zaten gösterilen alanlar. */

/* ===============================================================
   🏨 OPERATIONS SERVICE — admin dashboard read-only layer
   ===============================================================
   "Yaklaşan Operasyonlar" paneli: günlük villa giriş/çıkış (check-in
   / check-out) hareketleri. Operasyon ekibi (temizlik, key handover,
   karşılama) için kritik.

   KESIN SINIRLAR (zero-impact contract):
     ❌ Reservation create/update/insert YOK.
     ❌ Booking engine, pricing engine, availability merge, payment
        flow, finance snapshot — DOKUNULMADI.
     ❌ analytics.service & finance.service bağımsız çalışıyor;
        bu service ayrı endpoint olarak tek SELECT yapar.
     ✅ Tek sorumluluk: read-only operasyonel snapshot
        (counts + detail items, tek query'de birleşik).

   STATUS FILTER:
     `status IN ('pending','confirmed')` — rejected/cancelled
     dahil EDİLMEZ (gelmeyecek misafir = operasyona yansımaz).
     analytics.service ile aynı allow-list.

   DATE COLUMNS:
     `reservations.start_date` = check-in (DATE / YYYY-MM-DD)
     `reservations.end_date`   = check-out (DATE / YYYY-MM-DD)

   TIMEZONE:
     DATE kolonları TZ taşımaz. "Bugün" hesabı server local TZ ile
     yapılır (Türkiye prod → Asia/Istanbul). YYYY-MM-DD string
     comparison TZ-drift'siz: Date objesi üzerinden Y/M/D pad ile
     deterministik key üretir.

   PERFORMANS:
     - Tek SELECT (id, dates, name, guests, status, villa.title) —
       7 günlük pencere içinde check-in VEYA check-out olan
       rezervasyonlar.
     - eski sağlayıcı `.or()` ile (start_date in [today, +7)) OR
       (end_date in [today, +7)).
     - JS-side counter + bucket aynı pass içinde — counts ve
       items tek loop'ta üretilir, duplicate query YOK.
     - N+1 yok.
   =============================================================== */

const OPERATIONS_INCLUDED_STATUSES = ["pending", "confirmed"] as const;

/* Pencere uzunluğu — "önümüzdeki 7 gün" = [today, today+7) yarı-açık
   aralık (7 gün total). today inclusive, today+7 exclusive. */
const WINDOW_DAYS = 7;

/* ---------------- TYPES ---------------- */

export type OperationStatus = "pending" | "confirmed";

export type OperationItem = {
  id: string;
  villaTitle: string | null;
  guestName: string | null;
  guests: number | null;
  startDate: string;
  endDate: string;
  status: OperationStatus;
};

export type OperationsCounts = {
  checkinToday: number;
  checkinTomorrow: number;
  checkinNext7Days: number;
  checkoutToday: number;
  checkoutTomorrow: number;
  checkoutNext7Days: number;
};

export type OperationsLists = {
  checkinToday: OperationItem[];
  checkinTomorrow: OperationItem[];
  checkinNext7Days: OperationItem[];
  checkoutToday: OperationItem[];
  checkoutTomorrow: OperationItem[];
  checkoutNext7Days: OperationItem[];
};

export type OperationCategoryKey = keyof OperationsCounts;

export type OperationsSnapshot = {
  counts: OperationsCounts;
  items: OperationsLists;
};

const EMPTY_SNAPSHOT: OperationsSnapshot = {
  counts: {
    checkinToday: 0,
    checkinTomorrow: 0,
    checkinNext7Days: 0,
    checkoutToday: 0,
    checkoutTomorrow: 0,
    checkoutNext7Days: 0,
  },
  items: {
    checkinToday: [],
    checkinTomorrow: [],
    checkinNext7Days: [],
    checkoutToday: [],
    checkoutTomorrow: [],
    checkoutNext7Days: [],
  },
};

/* YYYY-MM-DD key — server local TZ. UTC normalize EDİLMEZ
   (DB date kolonu da TZ taşımaz; analytics.service ile aynı
   konvansiyon). */
function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ---------------------------------------------------------------
   🔥 getOperationsSnapshot — tek query, counts + items birlikte
   ---------------------------------------------------------------
   Pencere: [today, today+7) — yarı-açık (7 gün).
   Row classify: her satır için start_date ve end_date bağımsız
   değerlendirilir; aynı rezervasyon hem check-in hem check-out
   sayımına dahil olabilir (örn. 1 günlük rezervasyon).

   Filter logic:
     `.in('status', ['pending','confirmed'])`
     `.or(
        and(start_date.gte.today, start_date.lt.plus7),
        and(end_date.gte.today,   end_date.lt.plus7)
      )`

   Sıralama (UI-friendly):
     - checkin bucket'larında start_date ASC, sonra villa adı
     - checkout bucket'larında end_date ASC, sonra villa adı

   Hata: EMPTY_SNAPSHOT döner; dashboard çökmez.
--------------------------------------------------------------- */
export async function getOperationsSnapshot(): Promise<OperationsSnapshot> {
  /* Gün başlangıcı normalize. */
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + WINDOW_DAYS);

  const todayKey = toLocalDateKey(today);
  const tomorrowKey = toLocalDateKey(tomorrow);
  const windowEndKey = toLocalDateKey(windowEnd); /* exclusive */

  /* eski sağlayıcı .or() syntax: virgül = OR, and(...) ile branch içi AND. */
  const orFilter =
    `and(start_date.gte.${todayKey},start_date.lt.${windowEndKey}),` +
    `and(end_date.gte.${todayKey},end_date.lt.${windowEndKey})`;

  const { data, error } = await operationsRepository.findOperationsWindow(
    OPERATIONS_INCLUDED_STATUSES,
    orFilter
  );

  if (error) {
    console.error("[operations.snapshot] FAILED", {
      message: error.message,
      code: error.code,
    });
    return EMPTY_SNAPSHOT;
  }

  if (!data || data.length === 0) {
    return EMPTY_SNAPSHOT;
  }

  /* eski sağlayıcı embed select'i `villa` alanını object DA array DA
     döndürebilir; ikisini de safe handle ediyoruz. */
  type Row = {
    id: string;
    start_date: string | null;
    end_date: string | null;
    name: string | null;
    guests: number | null;
    status: OperationStatus;
    villa:
      | { title: string | null }
      | Array<{ title: string | null }>
      | null;
  };

  function readVillaTitle(v: Row["villa"]): string | null {
    if (!v) return null;
    if (Array.isArray(v)) return v[0]?.title ?? null;
    return v.title ?? null;
  }

  /* Fresh empty buckets — EMPTY_SNAPSHOT.items'i mutate etme!
     EMPTY_SNAPSHOT modüle-level shared constant olduğu için
     diziye push edersek subsequent çağrılar kontamine olur. */
  const items: OperationsLists = {
    checkinToday: [],
    checkinTomorrow: [],
    checkinNext7Days: [],
    checkoutToday: [],
    checkoutTomorrow: [],
    checkoutNext7Days: [],
  };
  const counts: OperationsCounts = {
    checkinToday: 0,
    checkinTomorrow: 0,
    checkinNext7Days: 0,
    checkoutToday: 0,
    checkoutTomorrow: 0,
    checkoutNext7Days: 0,
  };

  for (const row of data as Row[]) {
    const item: OperationItem = {
      id: row.id,
      villaTitle: readVillaTitle(row.villa),
      guestName: row.name,
      guests: row.guests,
      startDate: row.start_date ?? "",
      endDate: row.end_date ?? "",
      status: row.status,
    };

    /* Check-in (start_date) — bucket(s). */
    if (
      row.start_date &&
      row.start_date >= todayKey &&
      row.start_date < windowEndKey
    ) {
      items.checkinNext7Days.push(item);
      counts.checkinNext7Days += 1;
      if (row.start_date === todayKey) {
        items.checkinToday.push(item);
        counts.checkinToday += 1;
      } else if (row.start_date === tomorrowKey) {
        items.checkinTomorrow.push(item);
        counts.checkinTomorrow += 1;
      }
    }

    /* Check-out (end_date) — bucket(s). */
    if (
      row.end_date &&
      row.end_date >= todayKey &&
      row.end_date < windowEndKey
    ) {
      items.checkoutNext7Days.push(item);
      counts.checkoutNext7Days += 1;
      if (row.end_date === todayKey) {
        items.checkoutToday.push(item);
        counts.checkoutToday += 1;
      } else if (row.end_date === tomorrowKey) {
        items.checkoutTomorrow.push(item);
        counts.checkoutTomorrow += 1;
      }
    }
  }

  /* UI-friendly sıralama. */
  const byStartDate = (a: OperationItem, b: OperationItem) =>
    a.startDate.localeCompare(b.startDate) ||
    (a.villaTitle || "").localeCompare(b.villaTitle || "");
  const byEndDate = (a: OperationItem, b: OperationItem) =>
    a.endDate.localeCompare(b.endDate) ||
    (a.villaTitle || "").localeCompare(b.villaTitle || "");

  items.checkinToday.sort(byStartDate);
  items.checkinTomorrow.sort(byStartDate);
  items.checkinNext7Days.sort(byStartDate);
  items.checkoutToday.sort(byEndDate);
  items.checkoutTomorrow.sort(byEndDate);
  items.checkoutNext7Days.sort(byEndDate);

  return { counts, items };
}
