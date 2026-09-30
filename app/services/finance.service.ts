import { financeRepository } from "@/lib/db/finance.repository";

import {
  DEFAULT_FINANCE_RANGE,
  type FinanceRangePreset,
} from "./finance.constants";

/* ===============================================================
   🛡️ FINANCE SERVICE — read-only aggregation layer
   ===============================================================
   "Maki Finans" admin modülünün foundation katmanı. Şu an sadece
   KPI snapshot agregasyonu döndürür; ileride komisyon raporları,
   tahsilat tabloları, owner payout vb. buraya eklenecek.

   KESIN SINIRLAR:
     - READ-ONLY: bu service ASLA reservation/insert/update yapmaz.
     - Reservation logic (overlap, status transitions, paid_amount,
       commission snapshot, prepayment hesabı) DOKUNULMADI.
     - Booking engine, pricing engine, availability merge — sıfır
       etkileşim.

   AVAILABILITY ALLOW-LIST KONTRATI:
     `status IN ('pending','confirmed')` filter — `rejected` ve
     `cancelled` rezervasyonlar finans toplamlarında YER ALMAZ.
     reservation.service ve availability.helper'daki Faz 2B allow-
     list contract'ı ile lockstep.

   PERFORMANS:
     - Tek SELECT, in('status',...) filter ile rejected/cancelled
       DB-side elenir.
     - JS-side aggregate (sum/count). Foundation kapasite (~5k row
       milestone'una kadar trivial). Volume artarsa eski sağlayıcı RPC
       aggregate function'a geçiş kolay (signature aynı kalır).
     - N+1 yok: single query.
   =============================================================== */

/* Availability allow-list — reservation.service ile aynı kontrat. */
const FINANCE_BLOCKING_STATUSES = ["pending", "confirmed"] as const;

/* ===============================================================
   📅 PRESET DATE RANGE FILTER
   ===============================================================
   Maki Finans dashboard sade tutulması için custom date picker
   YERINE 4 hazır preset:
     - 7d  : Son 7 Gün
     - 30d : Son 30 Gün (default)
     - 1y  : Son 1 Yıl
     - all : Tüm Zamanlar (filter YOK)

   Filtre alanı: `reservations.created_at` (timestamptz).
   Hesap UTC-safe (`Date.now()` epoch ms + Date `.toISOString()`).
   ÖNEMLİ:
     - Custom range, calendar picker, URL search param → YOK
     - Tek query: aynı SELECT'e koşullu `.gte("created_at", ...)`
       ekleniyor; duplicate fetch yok.
   =============================================================== */
/* FinanceRangePreset / DEFAULT_FINANCE_RANGE / FINANCE_RANGE_PRESETS
   client-safe modüle taşındı (./finance.constants) — client bundle bu
   service'i (native repo/server-only) çekmesin diye. Değerler AYNEN;
   burada import edilip kullanılır. */

/* Preset → ISO start string. "all" → undefined (filter uygulanmaz).
   Pure helper; SSR-safe; side effect yok. */
function rangeStartISO(preset: FinanceRangePreset): string | undefined {
  if (preset === "all") return undefined;
  const days = preset === "7d" ? 7 : preset === "1y" ? 365 : 30;
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

export type FinanceKpiSnapshot = {
  /** Toplam satış (TRY snapshot) — YALNIZ status='confirmed'.
   *  Pending rezervasyon = satış henüz GERÇEKLEŞMEMIŞ; finansal
   *  toplama dahil edilmez. Operasyonel pending sayısı `pendingCount`
   *  alanında ayrı raporlanır. */
  totalSalesTry: number;
  /** Toplam komisyon (TRY) — YALNIZ status='confirmed'.
   *  Her rezervasyonun commit anındaki villa.commission_rate ile
   *  hesaplanmış snapshot (reservation_commission_amount). Pending
   *  henüz satış oluşturmadığı için komisyon toplamına dahil değil. */
  totalCommission: number;
  /** status='confirmed' rezervasyon sayısı (operasyonel KPI). */
  confirmedCount: number;
  /** status='pending' rezervasyon sayısı (operasyonel KPI). */
  pendingCount: number;
};

const EMPTY_SNAPSHOT: FinanceKpiSnapshot = {
  totalSalesTry: 0,
  totalCommission: 0,
  confirmedCount: 0,
  pendingCount: 0,
};

/* ---------------------------------------------------------------
   🔥 getFinanceKpiSnapshot — 4 KPI'ı tek query'de aggregate eder
   ---------------------------------------------------------------
   AGGREGATION KURALI — FİNANSAL vs OPERASYONEL AYRIMI:

     FİNANSAL (yalnız status='confirmed'):
       - totalSalesTry        : sum(total_price_try)
       - totalCommission      : sum(reservation_commission_amount)
       Mantık: pending rezervasyon = satış henüz GERÇEKLEŞMEMIŞ.
       Müşteri ödeme tamamlamamış olabilir, admin onaylamamış,
       iptal olabilir. Pending'in finans toplamlarına dahil edilmesi
       yanıltıcı finansal yorum oluşturur ("Toplam Satış X" yazıyor
       ama gerçek tahsilat çok daha düşük).

     OPERASYONEL (status bazlı sayım):
       - confirmedCount       : count where status='confirmed'
       - pendingCount         : count where status='pending'

   Query optimizasyonu: tek SELECT, `status IN ('pending','confirmed')`
   ile DB-side filter. JS-side gate her satırın status'üne göre
   sum/count'a dahil edip etmemeyi belirler — duplicate query YOK.

   DATE RANGE FILTER:
     `preset` (default "30d") `reservations.created_at` üzerinde
     `.gte()` filter uygular. "all" → filter yok. Tek query üzerinde
     koşullu eklenir; duplicate fetch yok.

   Hata durumunda EMPTY_SNAPSHOT döner (UI tarafı çökmez; log'a yazılır).
--------------------------------------------------------------- */
export async function getFinanceKpiSnapshot(
  preset: FinanceRangePreset = DEFAULT_FINANCE_RANGE
): Promise<FinanceKpiSnapshot> {
  const sinceISO = rangeStartISO(preset);

  const { data, error } = await financeRepository.findReservationsForKpi(
    FINANCE_BLOCKING_STATUSES,
    sinceISO
  );

  if (error) {
    console.error("[finance.kpi] FAILED", {
      message: error.message,
      code: error.code,
    });
    return EMPTY_SNAPSHOT;
  }

  if (!data || data.length === 0) {
    return EMPTY_SNAPSHOT;
  }

  type Row = {
    status: string;
    total_price_try: number | null;
    reservation_commission_amount: number | null;
  };

  let totalSalesTry = 0;
  let totalCommission = 0;
  let confirmedCount = 0;
  let pendingCount = 0;

  for (const row of data as Row[]) {
    /* Operasyonel sayım (status bazlı). */
    if (row.status === "confirmed") {
      confirmedCount += 1;

      /* 🛡️ Finansal toplamlar YALNIZ confirmed'da birikir.
         Pending rezervasyon = satış gerçekleşmedi → finans
         toplamlarına dahil edilmez (kullanıcı kuralı). */
      const total = Number(row.total_price_try);
      const comm = Number(row.reservation_commission_amount);
      if (Number.isFinite(total)) totalSalesTry += total;
      if (Number.isFinite(comm)) totalCommission += comm;
    } else if (row.status === "pending") {
      pendingCount += 1;
      /* Pending: sadece operasyonel sayım — finansal toplam YOK. */
    }
  }

  return { totalSalesTry, totalCommission, confirmedCount, pendingCount };
}
