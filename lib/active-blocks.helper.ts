/* ===============================================================
   🎯 AKTİF BLOKLAR — SEGMENT MODELİ (saf, client-safe)
   ===============================================================
   AMAÇ:
     "Aktif Bloklar" panelinin verisini üretir. Manuel bloklar ile
     iCal (external) rezervasyon aralıklarını GECE bazında çözüp
     segmentlere böler:
       "manual" | "ical" | "both".

   ⚠️ SADECE UI TÜRETME — İŞ MANTIĞI YOK:
     Availability/booking/renk-önceliği kararı YOKTUR. Takvim render'ı,
     rezervasyon akışı ve engine renk öncelikleri bu dosyadan
     ETKİLENMEZ.

   SEGMENT MANTIĞI (aralık KORUNUR, örtüşme bölünür):
     Aralıklar merge EDİLMEZ. Bunun yerine her GECE (yarı-açık
     [start, end) → geceler start .. end-1) tek tek sınıflandırılır:
       - yalnız manuel gece  → "manual"
       - yalnız iCal gece     → "ical"
       - ikisi de kapatmışsa  → "both"
     Ardışık ve AYNI imzalı (kind + aynı manuel blok + aynı iCal kaynak)
     geceler tek segmentte birleştirilir. Böylece kullanıcı tam olarak
     hangi günlerin çift kaynak tarafından kapatıldığını görür; manuel
     ve iCal'ın örtüşmeyen kısımları kendi tiplerinde kalır.

   SİLME (parça silme YOK):
     Segment görsel; silme fiziksel manuel bloğun TAMAMINI hedefler.
     Bu yüzden "manual"/"both" segment, ait olduğu manuel bloğun tam
     aralığını (manualStartDate/manualEndDate) taşır → confirm dialog
     ve delete payload gerçek bloğu gösterir.

   TARİH:
     "YYYY-MM-DD" → UTC gün-numarası (integer). TZ/DST yok; gece
     enumerasyonu ve karşılaştırma tam-sayı aritmetiğiyle güvenli.
=============================================================== */

export type ActiveBlockKind = "manual" | "ical" | "both";

/** Manuel blok girdisi (fetchBlockedDates snapshot projeksiyonu). */
export interface ManualBlockInput {
  id: string;
  start_date: string;
  end_date: string;
  note: string | null;
}

/** iCal aralık girdisi (external detailByDate'ten türetilir). */
export interface IcalRangeInput {
  start_date: string;
  end_date: string;
  source_name: string | null;
  summary: string | null;
}

/** Panelde render edilen segment. */
export interface UnifiedActiveBlock {
  /** Stabil React key. */
  key: string;
  /** Segment aralığı (checkout-dışı end). */
  start_date: string;
  end_date: string;
  kind: ActiveBlockKind;
  /** Silme için — "manual"/"both" segmentlerde dolu. iCal salt-okunur. */
  manualId: string | null;
  /** Ait olduğu manuel bloğun TAM aralığı (silme/confirm için). */
  manualStartDate: string | null;
  manualEndDate: string | null;
  note: string | null;
  /** iCal kaynak adı — "ical"/"both" segmentlerde dolu. */
  sourceName: string | null;
  summary: string | null;
}

/** detailByDate map değerinin beklenen (kısmi) şekli. */
interface DetailByDateValue {
  start_date?: string | null;
  end_date?: string | null;
  source_name?: string | null;
  summary?: string | null;
}

const MS_PER_DAY = 86_400_000;

/** "YYYY-MM-DD" → UTC gün-numarası (integer) | null. */
function toDayNumber(ymd: string | null | undefined): number | null {
  if (!ymd) return null;
  const parts = ymd.split("-");
  if (parts.length < 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

/** UTC gün-numarası → "YYYY-MM-DD". */
function fromDayNumber(n: number): string {
  const dt = new Date(n * MS_PER_DAY);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ---------------------------------------------------------------
   iCal detailByDate (gün-bazlı) → tekil aralık listesi.
   Aynı event birden çok güne yayıldığından değerler tekrarlar;
   (start|end|source) anahtarıyla dedupe edilir.
--------------------------------------------------------------- */
export function deriveIcalRanges(
  detailByDate: Record<string, DetailByDateValue> | null | undefined
): IcalRangeInput[] {
  if (!detailByDate) return [];
  const seen = new Set<string>();
  const ranges: IcalRangeInput[] = [];

  for (const detail of Object.values(detailByDate)) {
    const start = detail?.start_date ?? null;
    const end = detail?.end_date ?? null;
    if (!start || !end) continue;

    const sourceName = detail?.source_name ?? null;
    const dedupeKey = `${start}|${end}|${sourceName ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    ranges.push({
      start_date: start,
      end_date: end,
      source_name: sourceName,
      summary: detail?.summary ?? null,
    });
  }

  return ranges;
}

interface ManualNight {
  manualId: string;
  mStart: string;
  mEnd: string;
  note: string | null;
}
interface IcalNight {
  sourceName: string | null;
  summary: string | null;
}

/* ---------------------------------------------------------------
   SEGMENTASYON
--------------------------------------------------------------- */
export function buildActiveBlocks(
  manualBlocks: ReadonlyArray<ManualBlockInput>,
  icalRanges: ReadonlyArray<IcalRangeInput>
): UnifiedActiveBlock[] {
  /* Gece haritaları — manuel blokların (villa içinde) çakışmadığı
     varsayılır; ilk gören kazanır (deterministik). */
  const manualNight = new Map<number, ManualNight>();
  for (const m of manualBlocks) {
    const s = toDayNumber(m.start_date);
    const e = toDayNumber(m.end_date);
    if (s === null || e === null || e <= s) continue;
    for (let d = s; d < e; d++) {
      if (!manualNight.has(d)) {
        manualNight.set(d, {
          manualId: m.id,
          mStart: m.start_date,
          mEnd: m.end_date,
          note: m.note,
        });
      }
    }
  }

  const icalNight = new Map<number, IcalNight>();
  for (const ic of icalRanges) {
    const s = toDayNumber(ic.start_date);
    const e = toDayNumber(ic.end_date);
    if (s === null || e === null || e <= s) continue;
    for (let d = s; d < e; d++) {
      if (!icalNight.has(d)) {
        icalNight.set(d, {
          sourceName: ic.source_name,
          summary: ic.summary,
        });
      }
    }
  }

  const nights = Array.from(
    new Set<number>([...manualNight.keys(), ...icalNight.keys()])
  ).sort((a, b) => a - b);

  const classify = (d: number): {
    kind: ActiveBlockKind;
    manualId: string | null;
    sourceName: string | null;
  } => {
    const man = manualNight.get(d);
    const ic = icalNight.get(d);
    const kind: ActiveBlockKind = man && ic ? "both" : man ? "manual" : "ical";
    return { kind, manualId: man?.manualId ?? null, sourceName: ic?.sourceName ?? null };
  };

  const rows: UnifiedActiveBlock[] = [];
  let i = 0;
  while (i < nights.length) {
    const startNight = nights[i];
    const head = classify(startNight);

    /* Ardışık + aynı imza (kind + manuel blok + iCal kaynak) genişlet. */
    let j = i;
    while (j + 1 < nights.length) {
      const next = nights[j + 1];
      if (next !== nights[j] + 1) break; // gün boşluğu
      const c = classify(next);
      if (
        c.kind !== head.kind ||
        c.manualId !== head.manualId ||
        c.sourceName !== head.sourceName
      ) {
        break;
      }
      j++;
    }

    const lastNight = nights[j];
    const man = manualNight.get(startNight);
    const ic = icalNight.get(startNight);

    rows.push({
      key: `${head.kind}-${startNight}-${lastNight}-${head.manualId ?? ""}-${head.sourceName ?? ""}`,
      start_date: fromDayNumber(startNight),
      end_date: fromDayNumber(lastNight + 1), // checkout (yarı-açık)
      kind: head.kind,
      manualId: man?.manualId ?? null,
      manualStartDate: man?.mStart ?? null,
      manualEndDate: man?.mEnd ?? null,
      note: man?.note ?? null,
      sourceName: ic?.sourceName ?? null,
      summary: ic?.summary ?? null,
    });

    i = j + 1;
  }

  return rows;
}

/** Filtre sekmeleri için tip-bazlı adetler (+ toplam). */
export interface ActiveBlockCounts {
  all: number;
  manual: number;
  ical: number;
  both: number;
}

export function countActiveBlocks(
  blocks: ReadonlyArray<UnifiedActiveBlock>
): ActiveBlockCounts {
  let manual = 0;
  let ical = 0;
  let both = 0;
  for (const b of blocks) {
    if (b.kind === "manual") manual += 1;
    else if (b.kind === "ical") ical += 1;
    else both += 1;
  }
  return { all: blocks.length, manual, ical, both };
}
