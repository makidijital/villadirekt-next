import "server-only";

import { analyticsRepository } from "@/lib/db/analytics.repository";

/* 🛡️ PHASE 3 (migration 040): reservations admin-only RLS. Bu servis
   YALNIZ server dashboard'dan (server component) çağrılır — client
   component'ler (ReservationsChart) yalnız `import type` ile tip alır,
   fonksiyonu çağırmaz. `import "server-only"` + service_role güvenli:
   client bundle'a sızmaz, RLS bypass ile server-anon kırılması önlenir.
   PII açılmaz (yalnız created_at okunur; response aggregate sayılar). */

/* ===============================================================
   📊 ANALYTICS SERVICE — admin dashboard read-only layer
   ===============================================================
   Admin dashboard'a "canlı analytics" hissi vermek için light-weight
   read-only aggregation layer. Şu an sadece son N gün için günlük
   rezervasyon sayısı döndürür (area chart için seri).

   KESIN SINIRLAR (zero-impact contract):
     ❌ Reservation flow, booking engine, payment, pricing, availability
        merge ve finance snapshot logic'ine DOKUNULMADI.
     ❌ Insert/update YOK — yalnız SELECT.
     ❌ Maki Finans service'i (finance.service.ts) bağımsız çalışıyor;
        ayrı status filter + ayrı semantic. Bu service operasyonel
        rezervasyon hacmi (pending + confirmed) izler; finans
        totalları izlemiyor.

   STATUS FILTER — operasyonel hacim:
     `status IN ('pending','confirmed')` — rejected ve cancelled
     dahil EDİLMEZ. Sebep: bunlar operasyonel rezervasyon hacmini
     yansıtmıyor; ölü request'ler. Finance service ile aynı allow-
     list ama farklı semantik (finans = sadece confirmed para; analytics
     = pending+confirmed talep hacmi).

   PERFORMANS:
     - Tek SELECT, sadece `created_at` döner. `.in('status',...)` ve
       `.gte('created_at', sinceISO)` DB-side filter.
     - JS-side groupBy (YYYY-MM-DD bucket, server local TZ).
     - 0-rezervasyon olan günler fill ile dolu seri olarak döner —
       UI tarafı boş gün kontrolü yapmak zorunda kalmaz.
     - N+1 yok.
   =============================================================== */

const ANALYTICS_INCLUDED_STATUSES = ["pending", "confirmed"] as const;

/* Türkçe kısa ay etiketleri — "01 May" formatı için.
   Date prototype TR locale `toLocaleDateString` lokasyona bağlı olduğu
   için manuel sabit tablo: SSR ortamında deterministik çıktı garantisi. */
const TR_MONTHS_SHORT = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
] as const;

export type DailyReservationPoint = {
  /** ISO date string YYYY-MM-DD — chart x ekseni key'i. */
  date: string;
  /** UI'de gösterilen kısa label — "01 May" formatı. */
  label: string;
  /** O gün oluşturulan rezervasyon sayısı (pending+confirmed). */
  count: number;
};

/* YYYY-MM-DD bucket key — server local TZ.
   `toISOString().slice(0,10)` UTC'ye normalize eder; bu da Türkiye
   gibi +03 TZ'de gece yarısı kaymalarına yol açar. Bunun yerine
   `Date` objesinin yerel y-m-d alanlarını kullanıyoruz. */
function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTrShortLabel(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const mon = TR_MONTHS_SHORT[d.getMonth()];
  return `${day} ${mon}`;
}

/* ---------------------------------------------------------------
   🔥 getDailyReservationCounts — son N gün günlük rezervasyon sayısı
   ---------------------------------------------------------------
   Algorithm:
     1. `since` = (bugün - days+1) günün başlangıcı (local 00:00:00).
        N=30 → bugün dahil 30 gün, son 30 günü tam olarak kapsar.
     2. Tek SELECT: created_at, status filter + gte(since).
     3. JS-side groupBy: row.created_at → local date key bucket.
     4. Fill: since'ten bugüne kadar her gün için key oluştur; eksik
        bucket'lara 0 yaz. Sonuç eksiksiz N-elemanlı dizi.

   Dönüş: chronological order (eski → yeni). UI tarafı reverse YAPMAZ.

   Hata: boş seri (N gün, hepsi 0) döner; dashboard çökmez.
--------------------------------------------------------------- */
export async function getDailyReservationCounts(
  days: number = 30
): Promise<DailyReservationPoint[]> {
  /* Gün başlangıcına normalize — bugünün 00:00:00 - (days-1) gün.
     N=30 → bugün dahil 30 günlük pencere. */
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const since = new Date(today);
  since.setDate(since.getDate() - (days - 1));

  const { data, error } = await analyticsRepository.findReservationsSince(
    since.toISOString(),
    ANALYTICS_INCLUDED_STATUSES
  );

  /* Empty skeleton — fill helper. Hem hata hem data-null durumda
     N-elemanlı sıfır seri döner; UI tarafı varlığı garanti edebilir. */
  const skeleton: DailyReservationPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    skeleton.push({
      date: toLocalDateKey(d),
      label: toTrShortLabel(d),
      count: 0,
    });
  }

  if (error) {
    console.error("[analytics.daily-reservations] FAILED", {
      message: error.message,
      code: error.code,
    });
    return skeleton;
  }

  if (!data || data.length === 0) {
    return skeleton;
  }

  /* Bucket'la — local date key. */
  const buckets = new Map<string, number>();
  for (const row of data as Array<{ created_at: string | null }>) {
    if (!row.created_at) continue;
    const d = new Date(row.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = toLocalDateKey(d);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  /* Skeleton'ı bucket count'larıyla doldur. */
  return skeleton.map((point) => ({
    ...point,
    count: buckets.get(point.date) || 0,
  }));
}
