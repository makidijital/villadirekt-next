import type { Locale } from "@/lib/i18n/config";
/* 🛡️ Saf `{token}` interpolation helper'ı (Phase 10B) — yeni bağımlılık
   DEĞİL, MEVCUT dictionary altyapısının parçası. */
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";

/* ===============================================================
   🔥 DATE FORMAT/PARSE — TEK MERKEZİ HELPER
   ===============================================================
   Tüm projede tarihle ilgili display/parse rutinleri için tek
   source-of-truth. Önceden bu fonksiyonlar kanvas, mail route'ları,
   voucher data builder, reservations admin sayfaları içinde
   birebir kopyalanmıştı.

   Bu modül DAVRANIŞI DEĞİŞTİRMEZ — yalnız mevcut implementasyonu
   tek noktaya taşır. UTC vs local semantiği, "checkout = next
   checkin" mantığı, "—" fallback'ı, try/catch koruması: hepsi
   aynen korunur.
   =============================================================== */

/* ---------------------------------------------
   🔥 formatLocalDate(date) → "YYYY-MM-DD"
   - LOCAL alanları okur (getFullYear/getMonth/getDate).
   - UTC dönüşümü YOK — TZ kaymalarını engeller.
   - Pricing canvas + admin reservation create/edit aynı.
---------------------------------------------- */
export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ---------------------------------------------
   🔥 parseLocalDate(s) → local Date
   - "YYYY-MM-DD" veya "YYYY-MM-DDT..." kabul eder.
   - new Date(y, m-1, d) ile LOCAL alanlardan kurar.
   - UTC parse YAPMAZ — calendar grid'i Türkiye dışında bile
     doğru günü gösterir.

   🛡️ DEFENSIVE GUARANTEES (Faz 2A):
   Aşağıdaki invalid input sınıfları için **deterministic Invalid
   Date** döner (`new Date(NaN)`); explicit fallback Date (örn.
   1970-01-01) ÜRETMEZ — fallback Date üretmek `while (current <
   endD)` döngülerini onbinlerce iteration sürdürebilir (browser
   donması). Invalid Date getTime()===NaN olduğu için tüm
   karşılaştırmalar false döner; mevcut tüketiciler (price.engine
   loop'u, calendar render, reservation classification) sessizce
   skip eder. Davranış: önceden Invalid Date üreten input'lar yine
   Invalid Date üretir; geçerli input'lar BYTE-IDENTICAL aynı
   Date'i döner.

   Yakalanan defektif input sınıfları:
     - undefined / null
     - "" (boş string)
     - whitespace-only
     - non-string (Number, object) — toString fallback
     - "YYYY-MM" gibi eksik parçalar
     - "YYYY-MM-DD-extra" gibi fazla parçalar
     - rakam olmayan parça ("abcd-12-34")
     - Number.isFinite olmayan değerler
     - ay 1-12 dışı, gün 1-31 dışı

   Signature ve return type DEĞİŞMEDİ:
     parseLocalDate(s: string): Date
   Çağıran taraflar dokunulmadı.
---------------------------------------------- */
export function parseLocalDate(s: string): Date {
  // 1) null/undefined/non-string toleransı (signature: string ama
  //    runtime'da DB'den null gelebilir; mevcut davranış da
  //    `(s || "")` koruması yapıyordu — buradan miras).
  const raw = (s ?? "").toString().trim();
  if (!raw) return new Date(NaN);

  // 2) "T" sonrası saat/zone bölümünü at (mevcut davranış).
  const trimmed = raw.split("T")[0];

  // 3) "YYYY-MM-DD" üç parça olmalı.
  const parts = trimmed.split("-");
  if (parts.length !== 3) return new Date(NaN);

  const [y, m, d] = parts.map(Number);

  // 4) Hepsi finite numeric mi?
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d)
  ) {
    return new Date(NaN);
  }

  // 5) Ay/gün makul aralıkta mı? (Date constructor 13. ayı
  //    sonraki yıla taşır → silent drift; explicit reject.)
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return new Date(NaN);
  }

  // 6) LOCAL midnight Date — mevcut behavior, byte-identical.
  return new Date(y, m - 1, d);
}

/* ===============================================================
   🛡️ APP TIMEZONE STANDARD: Europe/Istanbul (UTC+3, NO DST)
   ===============================================================
   DB UTC timestamptz olarak saklar. Render katmanı (UI, mail,
   voucher, admin) tek timezone'da hizalanır — Europe/Istanbul.

   🛡️ MANUAL OFFSET (Intl-INDEPENDENT) — NEDEN:
   Üst üste yapılan denemelerde Intl.DateTimeFormat'in `dateStyle/
   timeStyle` ve hatta granular options + `timeZone` kombinasyonları
   bazı production runtime'larda (edge runtime, Next.js minified
   bundle, ICU-small) sessizce `timeZone`'u yutuyor → UTC bleed.

   Çözüm: hiç Intl'a girmeden manuel matematik. Türkiye 2016'da
   DST'yi kaldırdı; sabit UTC+3 ofset (Turkey Time, TRT). Bu
   kararname değişene kadar deterministik:
     ist = utc + 3 saat (ms cinsinden)
   Sonra ist.getUTCXxx() çağrılarıyla "yeni UTC" alanları okunur —
   `getUTCHours()` ile dönen değer aslında Istanbul saatidir.

   Böylece HİÇBİR Intl ambiguity yok; Node TZ env yok; browser TZ
   yok. Output sabit "DD Mon YYYY HH:mm" tr-TR short ay isimleriyle.
=============================================================== */
export const APP_TIMEZONE = "Europe/Istanbul";

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

/* tr-TR `month: "short"` çıktısıyla birebir uyumlu kısaltmalar
   (Intl tr-TR short ay isimleri): Oca, Şub, Mar, Nis, May, Haz,
   Tem, Ağu, Eyl, Eki, Kas, Ara. Türkiye'de yaygın mail/voucher
   formatı. */
const MONTHS_TR_SHORT = [
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

/* ===============================================================
   🛡️ NAIVE-DATETIME → UTC NORMALIZE
   ===============================================================
   GERÇEK BUG KÖKÜ:
   eski sağlayıcı tarafından dönen timestamptz değerleri bazı durumlarda
   `2026-05-11T17:41:00.319971` formatında — sonunda `Z` veya
   `+00:00` SUFFIX YOK. ISO 8601 spec'inde böyle bir "naive
   datetime" string'inin TZ'i implementation-defined; JS engine'ler
   bunu **LOCAL TIME** olarak parse eder.

   Etki:
   - Runtime TZ=UTC: naive "17:41" → Date(UTC 17:41) → +3h shift →
     "20:41" Istanbul ✓ doğru görünüyor
   - Runtime TZ=Europe/Istanbul: naive "17:41" → Date(Istanbul 17:41
     = UTC 14:41) → +3h shift → "17:41" Istanbul ✗ UTC bleed gibi
     görünür (gerçekte runtime TZ bleed)
   - Runtime TZ farklı bir zone: tamamen rastgele saat

   Çözüm: render path'inde gelen string ISO datetime ise ve TZ
   suffix yoksa, otomatik `Z` ekle → JS engine UTC olarak parse
   eder. DB'de timestamptz UTC saklandığı için bu doğru semantic.

   Bu helper EXPORTED — başka modüller (UI display, mail, voucher)
   future bir naive timestamp ile karşılaşırsa kullanabilir.
   parseLocalDate / formatLocalDate (date-only domain) dokunulmaz.
=============================================================== */

/**
 * ISO datetime string'inde TZ suffix yoksa (Z / +HH:MM / -HH:MM /
 * +HHMM / -HHMM / +HH / -HH) `Z` ekler. Date-only (`YYYY-MM-DD`)
 * veya non-ISO string'lere DOKUNMAZ.
 *
 * Örnekler:
 *   "2026-05-11T17:41:00.319971" → "2026-05-11T17:41:00.319971Z"
 *   "2026-05-11T17:41:00Z"       → aynı
 *   "2026-05-11T17:41:00+00:00"  → aynı
 *   "2026-05-11T17:41:00+03:00"  → aynı
 *   "2026-05-11"                 → aynı (date-only, T yok)
 *   "Mon May 11 2026"            → aynı (non-ISO)
 */
export function normalizeUtcIso(value: string): string {
  if (typeof value !== "string") return value;
  if (!value.includes("T")) return value; // date-only veya non-ISO
  // Zaten Z veya offset suffix var mı? (+HH, +HH:MM, +HHMM, +HHMM dakika)
  if (/Z$|[+-]\d{2}(?::?\d{2})?$/.test(value)) return value;
  return value + "Z";
}

/**
 * String / Date / number / null / undefined → Date (UTC-correct) veya null.
 * - String: normalizeUtcIso üzerinden geçirir (naive → UTC).
 * - Date: olduğu gibi kabul eder (zaten epoch ms tutuyor).
 * - Number: epoch ms olarak yorumlar (Date.now() çıktısı vb.).
 *
 * Invalid input → null. Caller fallback ile devam eder.
 */
export function parseUtcDate(
  value: string | Date | number | null | undefined
): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = normalizeUtcIso(trimmed);
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Internal: parseUtcDate sonrası UTC+3 shift uygulanmış Date.
    Render zamanı `getUTCXxx()` çağrıları Istanbul alanlarını
    döndürür. */
function toIstanbulDate(value: string | Date): Date | null {
  const d = parseUtcDate(value);
  if (!d) return null;
  return new Date(d.getTime() + ISTANBUL_OFFSET_MS);
}

/* ---------------------------------------------
   🔥 istanbulYmd(value) → "YYYY-MM-DD" veya null
   - Bir instant'ın ISTANBUL TAKVİM GÜNÜ.
   - formatDateTr / formatDateForLocale ile AYNI toIstanbulDate
     mantığını kullanır → yeni timezone sistemi YOK.
   - Karşılaştırma için: sıfır dolgulu ISO gün string'leri
     sözlüksel olarak kronolojik sıralanır ("2026-09-22" < "2026-09-23").
--------------------------------------------- */
export function istanbulYmd(value: string | Date): string | null {
  const ist = toIstanbulDate(value);
  if (!ist) return null;
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Istanbul saatine göre BUGÜN → "YYYY-MM-DD". */
export function todayIstanbulYmd(): string {
  /* toIstanbulDate her zaman geçerli bir Date için değer döndürür. */
  return istanbulYmd(new Date()) as string;
}

/* ---------------------------------------------
   🔥 formatDateTr(value) → "11 May 2026" veya "—"
   - Manuel UTC→Istanbul shift, Intl-bypass-proof
   - Boş/null/invalid → "—"
---------------------------------------------- */
export function formatDateTr(value?: string | null): string {
  if (!value) return "—";
  const ist = toIstanbulDate(value);
  if (!ist) return value;
  const day = ist.getUTCDate();
  const month = MONTHS_TR_SHORT[ist.getUTCMonth()];
  const year = ist.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

/* ---------------------------------------------
   🔥 formatDateTimeTr(value) → "11 May 2026 19:59" veya "—"
   - createdAt / updatedAt / sent_at / paid_at gibi timestamptz alanlar için
   - Manuel UTC→Istanbul shift, Intl-bypass-proof
   - hour:minute → 2-digit padded, hour12 false (24h)
   - Boş/null/invalid → "—"

   ÇIKTI FORMATI: "DD MonShort YYYY HH:mm"
   Önceki Intl tabanlı dönüşümle Türkiye runtime'da BYTE-IDENTICAL.
---------------------------------------------- */
export function formatDateTimeTr(value?: string | null): string {
  if (!value) return "—";
  const ist = toIstanbulDate(value);
  if (!ist) return value;
  const day = ist.getUTCDate();
  const month = MONTHS_TR_SHORT[ist.getUTCMonth()];
  const year = ist.getUTCFullYear();
  const hour = String(ist.getUTCHours()).padStart(2, "0");
  const minute = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} ${hour}:${minute}`;
}

/* ---------------------------------------------
   🔥 formatDiscountDateRangeTr(start, end) → "1 - 10 Ekim arası geçerli"
   ---------------------------------------------
   AMAÇ: villa_discounts.start_date/end_date (villa_prices ile AYNI
   semantik — date-only "YYYY-MM-DD", kapalı interval) için public
   villa kartında (VillaCard "discount" variant) gösterilen Türkçe
   tarih aralığı etiketi. `parseLocalDate` kullanır — price.engine'in
   `getActiveDiscount` fonksiyonunun BU AYNI alanlar için kullandığı
   parser ile TUTARLI (formatDateTr'nin timestamptz-odaklı UTC+3 shift
   mantığı BİLEREK kullanılmadı — date-only kolonlar için gereksiz).

   Format kuralları:
     - Aynı ay + aynı yıl  → "D - D Ay arası geçerli"
     - Farklı ay, aynı yıl → "D Ay - D Ay arası geçerli"
     - Farklı yıl          → "D Ay YYYY - D Ay YYYY arası geçerli"
     - Eksik/geçersiz input → "" (caller boş string'i falsy kontrolüyle
       atlar, hiçbir şey render etmez)
---------------------------------------------- */
const MONTHS_TR_FULL = [
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

export function formatDiscountDateRangeTr(
  startDate?: string | null,
  endDate?: string | null
): string {
  return formatDiscountDateRange(
    startDate,
    endDate,
    (month) => MONTHS_TR_FULL[month - 1] ?? "",
    DISCOUNT_RANGE_TEMPLATES_TR
  );
}

/* 🛡️ `formatDiscountDateRangeTr`'nin BUGÜNKÜ üç çıktı şablonu — birebir
   aynı metin. TR sarmalayıcısı bunları kullandığı için TR çıktısı
   dictionary'den BAĞIMSIZ olarak BİT-BİRE korunur. */
const DISCOUNT_RANGE_TEMPLATES_TR: DiscountDateRangeTemplates = {
  sameMonth: "{sDay} - {eDay} {sMonth} arası geçerli",
  sameYear: "{sDay} {sMonth} - {eDay} {eMonth} arası geçerli",
  full: "{sDay} {sMonth} {sYear} - {eDay} {eMonth} {eYear} arası geçerli",
};

/** İndirim aralığı metninin üç dal şablonu (`{sDay}` `{sMonth}` `{sYear}`
 *  `{eDay}` `{eMonth}` `{eYear}` token'ları). */
export type DiscountDateRangeTemplates = {
  /** Aynı ay + aynı yıl. */
  sameMonth: string;
  /** Farklı ay, aynı yıl. */
  sameYear: string;
  /** Farklı yıl. */
  full: string;
};

/**
 * 🛡️ `formatDiscountDateRangeTr`'nin DİL BAĞIMSIZ çekirdeği —
 * `bucketMonthLabel` / `formatGapRange` ile AYNI desen. Ay adını ve üç
 * şablonu dışarıdan alır (kart `home.months` + `card.discountValid*`
 * değerlerini geçirir). Tarih matematiği, dal koşulları (aynı ay /
 * aynı yıl / farklı yıl), `parseLocalDate` kullanımı ve geçersiz girdi
 * davranışı (`""`) AYNEN korunur. Yeni tarih sistemi İCAT EDİLMEDİ.
 */
export function formatDiscountDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  monthName: (month: number) => string,
  templates: DiscountDateRangeTemplates
): string {
  if (!startDate || !endDate) return "";
  const s = parseLocalDate(startDate);
  const e = parseLocalDate(endDate);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";

  const params = {
    sDay: s.getDate(),
    sMonth: monthName(s.getMonth() + 1),
    sYear: s.getFullYear(),
    eDay: e.getDate(),
    eMonth: monthName(e.getMonth() + 1),
    eYear: e.getFullYear(),
  };

  if (params.sYear === params.eYear && s.getMonth() === e.getMonth()) {
    return formatDictionaryString(templates.sameMonth, params);
  }
  if (params.sYear === params.eYear) {
    return formatDictionaryString(templates.sameYear, params);
  }
  return formatDictionaryString(templates.full, params);
}

/* ---------------------------------------------
   🔥 nightsBetween(start, end) → number
   - parseUtcDate ile naive-safe normalize, sonra ms diff / 86400000
   - Geçersiz input → 0
   - Negatif fark → 0 (Math.max guard)
   - Mail templates ve voucher data builder'da AYNEN aynı.

   PARSE GÜVENLİĞİ:
   start/end alanları DB DATE kolonu (date-only "YYYY-MM-DD") veya
   bazı edge case'lerde naive timestamptz olabilir. parseUtcDate
   her iki durumu da deterministik UTC'ye çevirir → night sayısı
   runtime TZ'sinden bağımsız.

   ETKİ:
   - Date-only inputs: parseUtcDate UTC midnight üretir; her iki
     tarafta aynı offset → diff/86400000 = days. ÖNCEKİ DAVRANIŞ
     BYTE-IDENTICAL.
   - Naive timestamptz: önceden runtime-local parse → farklı offset
     riskli. Şimdi UTC normalize → deterministik.
---------------------------------------------- */
export function nightsBetween(
  start?: string | null,
  end?: string | null
): number {
  if (!start || !end) return 0;
  const sD = parseUtcDate(start);
  const eD = parseUtcDate(end);
  if (!sD || !eD) return 0;
  return Math.max(0, Math.ceil((eD.getTime() - sD.getTime()) / (1000 * 60 * 60 * 24)));
}

/* ===============================================================
   🛡️ PHASE 10B — LOCALE-AWARE KISA TARİH FORMATI (EN/DE villa detail)
   ===============================================================
   `formatDateTr` (yukarıda) DEĞİŞTİRİLMEDİ — mail/voucher/admin gibi
   TÜM mevcut çağıranlar (TR-only, Europe/Istanbul UTC+3 manuel shift
   davranışı) o fonksiyonu AYNEN kullanmaya devam eder.

   Bu, PriceList.tsx'in EN/DE'de "Ocak/Şubat" gibi Türkçe ay adları
   göstermesini önlemek için EKLENEN, AYRI bir fonksiyon —
   `formatDateTr` ile AYNI Istanbul-offset/"—" fallback mantığını
   kullanır (`toIstanbulDate` — bu dosyanın private helper'ı, AYNEN
   reuse), yalnız ay adı dizisi locale'e göre seçilir. `formatDateTr`
   HİÇBİR ŞEKİLDE bu fonksiyonu çağırmaz veya tersi — iki fonksiyon
   birbirinden bağımsız, TR davranışı sıfır risk taşır. */
const MONTHS_EN_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTHS_DE_SHORT = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
] as const;

const MONTHS_SHORT_BY_LOCALE: Record<Locale, readonly string[]> = {
  tr: MONTHS_TR_SHORT,
  en: MONTHS_EN_SHORT,
  de: MONTHS_DE_SHORT,
};

/** `formatDateTr` ile AYNI çıktı şekli ("11 May 2026" / "—"), yalnız
 *  ay adı `locale`'e göre seçilir. `locale` desteklenmiyorsa/geçersizse
 *  TR'ye düşer (`MONTHS_SHORT_BY_LOCALE` her zaman 3 key'in hepsini
 *  içerir — TypeScript `Record<Locale,...>` zaten eksiksizliği
 *  garanti eder). */
export function formatDateForLocale(
  value: string | null | undefined,
  locale: Locale
): string {
  if (!value) return "—";
  const ist = toIstanbulDate(value);
  if (!ist) return value;
  const day = ist.getUTCDate();
  const months = MONTHS_SHORT_BY_LOCALE[locale] || MONTHS_TR_SHORT;
  const month = months[ist.getUTCMonth()];
  const year = ist.getUTCFullYear();
  return `${day} ${month} ${year}`;
}
