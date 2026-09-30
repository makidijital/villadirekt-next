/* ===============================================================
   🛡️ KISA SÜRELİ TARİHLER — PURE HELPERS (server + client safe)
   ===============================================================
   Salt-okuma modül yardımcıları. minimum_stay_nights KULLANILMAZ;
   yalnız tarih/ay matematiği. Hiçbir mevcut sistemi etkilemez.

   - Ay slug ↔ ay numarası (ASCII slug, TR görünen ad).
   - Slug → bucket_month tarihi (ufuk içi, doğru yıl).
   - Boşluk tarih aralığı formatı (kart etiketi).
   - Kova sabitleri (2..6 gece).
   =============================================================== */

/** Desteklenen kısa boşluk kovaları (gece). 053 CHECK ile aynı. */
export const SHORT_GAP_NIGHTS = [2, 3, 4, 5, 6] as const;
export type ShortGapNights = (typeof SHORT_GAP_NIGHTS)[number];

/** Ufuk: 053 refresh fonksiyonu ile aynı (bugün → +6 ay). */
export const SHORT_GAP_HORIZON_MONTHS = 6;

/* ASCII URL slug'ları (TR karakter yok) — index 0 = Ocak ... 11 = Aralık. */
const MONTH_SLUGS = [
  "ocak",
  "subat",
  "mart",
  "nisan",
  "mayis",
  "haziran",
  "temmuz",
  "agustos",
  "eylul",
  "ekim",
  "kasim",
  "aralik",
] as const;

/* Görünen TR ay adları (doğru diakritikler). */
const MONTH_NAMES_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

/** 1..12 ay numarasını ASCII slug'a çevirir. Geçersizde "". */
export function monthNumberToSlug(month: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) return "";
  return MONTH_SLUGS[month - 1];
}

/** ASCII slug'ı 1..12 ay numarasına çevirir. Geçersizde null. */
export function slugToMonthNumber(slug: string): number | null {
  const idx = MONTH_SLUGS.indexOf(
    (slug || "").trim().toLowerCase() as (typeof MONTH_SLUGS)[number]
  );
  return idx === -1 ? null : idx + 1;
}

/** 1..12 ay numarasının görünen TR adı. Geçersizde "". */
export function monthNumberToNameTr(month: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) return "";
  return MONTH_NAMES_TR[month - 1];
}

/** "YYYY-MM-DD" (bucket_month) → ASCII slug. */
export function bucketMonthToSlug(bucketMonth: string): string {
  const m = parseBucketMonthNumber(bucketMonth);
  return m ? monthNumberToSlug(m) : "";
}

/** "YYYY-MM-DD" → ay numarası (1..12) | null. */
export function parseBucketMonthNumber(bucketMonth: string): number | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec((bucketMonth || "").trim());
  if (!match) return null;
  const m = Number(match[2]);
  return m >= 1 && m <= 12 ? m : null;
}

/** "YYYY-MM-DD" → görünen "Haziran 2026". */
export function bucketMonthLabelTr(bucketMonth: string): string {
  return bucketMonthLabel(bucketMonth, (m) => monthNumberToNameTr(m));
}

/**
 * 🛡️ PHASE 11 — `bucketMonthLabelTr`'nin DİL BAĞIMSIZ çekirdeği.
 * Ay adını dışarıdan bir çözücüyle alır (ana sayfa `home.months`
 * sözlüğünü geçirir), çıktı biçimi (`"<Ay> <Yıl>"`) AYNEN korunur.
 * `bucketMonthLabelTr` bunun TR sarmalayıcısıdır → o fonksiyonun
 * davranışı ve mevcut çağıranları (`/kisa-sureli-tarihler/[ay]/[gece]`)
 * BİT-BİRE AYNI kalır.
 */
export function bucketMonthLabel(
  bucketMonth: string,
  monthName: (month: number) => string
): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec((bucketMonth || "").trim());
  if (!match) return "";
  const year = match[1];
  const m = Number(match[2]);
  if (!Number.isInteger(m) || m < 1 || m > 12) return "";
  const name = monthName(m);
  return name ? `${name} ${year}` : "";
}

/**
 * Ay slug'ını ufuk [bugün → +6 ay] içindeki TEK bucket_month tarihine
 * ("YYYY-MM-01") çözer. 6 aylık ufukta her ay adı en fazla bir kez
 * geçtiği için belirsizlik yoktur. Hedef ay bu yılki ay >= içinde
 * bulunulan ay ise bu yıl, değilse gelecek yıl seçilir.
 * Geçersiz slug → null.
 */
export function resolveBucketMonthFromSlug(
  slug: string,
  today: Date = new Date()
): string | null {
  const month = slugToMonthNumber(slug);
  if (month === null) return null;

  const curYear = today.getFullYear();
  const curMonth = today.getMonth() + 1; // 1..12
  const year = month >= curMonth ? curYear : curYear + 1;

  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-01`;
}

/** "Gece" path segment'ini geçerli kovaya çevirir (2..6) | null. */
export function parseGapNights(raw: string): ShortGapNights | null {
  const n = Number((raw || "").trim());
  return (SHORT_GAP_NIGHTS as readonly number[]).includes(n)
    ? (n as ShortGapNights)
    : null;
}

/**
 * Boşluk aralığını kart etiketine çevirir: "14 Haziran - 16 Haziran".
 * Girdiler "YYYY-MM-DD". Geçersizde "".
 */
export function formatGapRangeTr(gapStart: string, gapEnd: string): string {
  return formatGapRange(gapStart, gapEnd, (m) => monthNumberToNameTr(m));
}

/**
 * 🛡️ `formatGapRangeTr`'nin DİL BAĞIMSIZ çekirdeği — `bucketMonthLabel`
 * ile AYNI desen. Ay adını dışarıdan bir çözücüyle alır (kart listesi
 * `home.months` sözlüğünü geçirir), çıktı biçimi (`"<gün> <Ay> - <gün>
 * <Ay>"`) ve geçersiz girdi davranışı (`""`) AYNEN korunur.
 * `formatGapRangeTr` bunun TR sarmalayıcısıdır → mevcut çağıranlar
 * BİT-BİRE AYNI sonucu alır.
 */
export function formatGapRange(
  gapStart: string,
  gapEnd: string,
  monthName: (month: number) => string
): string {
  const s = parseYmd(gapStart);
  const e = parseYmd(gapEnd);
  if (!s || !e) return "";
  const sLabel = `${s.day} ${monthName(s.month)}`;
  const eLabel = `${e.day} ${monthName(e.month)}`;
  return `${sLabel} - ${eLabel}`;
}

function parseYmd(
  value: string
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value || "").trim());
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}
