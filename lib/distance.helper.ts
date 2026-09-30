/* ===============================================================
   🛡️ DISTANCE HELPER — Villa mesafe preset + icon mapping (Faz 19)
   ===============================================================
   AMAÇ:
     1) Admin yeni villa formunda standart mesafe satırları otomatik
        gelsin → typo/inconsistency düşer ("market", "Market",
        "Süpermarket" karmaşası önlenir).
     2) Frontend villa detay sayfasında title'a göre anlamlı icon
        render edilebilsin (premium amenity card pattern).

   DB SCHEMA: HİÇ DOKUNULMADI.
     - `villa_distances.title` (text) ve `.distance` (text) aynen
     - `setVillaDistances` RPC replace-all aynen
     - `getVillaDistances` order: created_at ASC aynen

   BACKWARD-COMPATIBILITY:
     - Mevcut villaların kayıtları etkilenmez (helper sadece "yeni
       villa formu seed" ve "frontend icon mapping" için).
     - Custom title'lar her zaman geçerli; bilinmeyen title icon
       fallback'ine düşer (generic MapPin).
     - Kullanıcı preset'i silebilir, isim/değer değiştirebilir,
       ekstra satır ekleyebilir.

   PURE & SSR-SAFE: React/DOM bağımlılığı yok. Yalnız string + array
   sabitleri. Frontend renderer bu key'i lucide icon'a çevirir.
   =============================================================== */

/** Admin yeni villa formunda otomatik gelen standart mesafe satırları.
 *  `distance` boş bırakılır — admin doldurur. Sıra anlamlıdır
 *  (en sık aranan üstte). */
export const DEFAULT_DISTANCE_PRESETS: ReadonlyArray<{
  title: string;
  distance: string;
}> = [
  { title: "Restoran", distance: "" },
  { title: "Market", distance: "" },
  { title: "Plaj", distance: "" },
  { title: "Havaalanı (Antalya)", distance: "" },
  { title: "Havaalanı (Dalaman)", distance: "" },
  { title: "Otobüs Terminali", distance: "" },
  { title: "Şehir Merkezi", distance: "" },
  { title: "Sağlık Merkezi", distance: "" },
];

/* ===============================================================
   🛡️ FAZ 41 — CANONICAL DISTANCE TITLE OPTIONS
   ===============================================================
   Admin distance form select dropdown'ı için tek doğruluk kaynağı.
   Tüm yeni satırlar bu listeden seçilir → typo/inconsistency
   ("market" / "Market" / "MARKET" / "Migros") elimine olur.

   BACKWARD-COMPAT:
     - Eski kayıtlarda title bu listede olmayabilir (Migros, vb.).
     - LocationStep render path'i custom legacy title'ı RENDER
       eder (input opsiyonu olarak görünür); kullanıcı isterse
       canonical option'a değiştirebilir, isterse silebilir.
     - Hiçbir mevcut row otomatik dönüşmez (immutable history).

   PRESETS subset'i: aşağıdaki list DEFAULT_DISTANCE_PRESETS
   içeriğinin canonical versiyonu + ek opsiyonlar. Title'lar
   getDistanceIconKey matcher'ı tarafından zaten tanınır.
=============================================================== */
export const DISTANCE_OPTIONS: ReadonlyArray<string> = [
  "Restoran",
  "Market",
  "Plaj",
  "Deniz",
  "Şehir Merkezi",
  "Havaalanı (Antalya)",
  "Havaalanı (Dalaman)",
  "Otobüs Terminali",
  "Sağlık Merkezi",
  "Eczane",
  "Benzin İstasyonu",
  "Okul",
];

export function isCanonicalDistanceTitle(t: string | null | undefined): boolean {
  if (!t) return false;
  return DISTANCE_OPTIONS.includes(String(t).trim());
}

/* ===============================================================
   🛡️ DISTANCE UNIT — m / km
   ===============================================================
   Mesafe için iki birim destekliyoruz:
     • "m"  → metre (1-999 aralığında anlamlı, ör. "500 m", "750 m")
     • "km" → kilometre (1, 1.2, 3, 12.5 vb.)

   Default unit: "km" (geriye uyumluluk — eski kayıtlar her zaman
   km kabul edilir; admin değiştirmedikçe bu davranış aynı).
=============================================================== */
export type DistanceUnit = "m" | "km";

export const DISTANCE_UNITS: ReadonlyArray<DistanceUnit> = ["m", "km"];
export const DEFAULT_DISTANCE_UNIT: DistanceUnit = "km";

/* ===============================================================
   🛡️ DISTANCE VALUE NORMALIZER (unit-aware, FAZ 41 + m/km extension)
   ===============================================================
   Hedef format: "{N} {unit}" (örn. "500 m", "1.2 km").
   Kabul edilen input:
     - "5"             → "5 km"      (default unit)
     - "5 km"          → "5 km"
     - "5km"           → "5 km"
     - "5 KM"          → "5 km"
     - "500 m"         → "500 m"
     - "500m"          → "500 m"
     - "500 M"         → "500 m"
     - "  1.2  km  "   → "1.2 km"
     - "5.5"           → "5.5 km"
     - "5,5"           → "5.5 km"   (TR ondalık virgülü)
     - "1,5 km"        → "1.5 km"
     - "0"             → "0 km"
     - "" / null       → ""         (boş aynen — service-layer prune eder)
     - "yakın"         → "yakın"    (free-text fallback — eski legacy
                                      kayıtlarda olabilir; pattern yoksa
                                      olduğu gibi döner → bozulmaz)

   IDEMPOTENT: aynı string'i iki kez geçirmek sorunsuz.
   PURE: side-effect yok; SSR-safe.

   İKİNCİ SİGNATÜR (overload — explicit unit):
     normalizeDistanceValue(500, "m")  → "500 m"
     normalizeDistanceValue(1.2, "km") → "1.2 km"
     normalizeDistanceValue("500", "m") → "500 m"
     Bu form admin formundan gelen {value, unit} çiftini text'e
     serialize etmek için. Backward-compat: ikinci argüman
     verilmezse eski davranış (text parse + km default).
=============================================================== */
export function normalizeDistanceValue(
  raw: string | number | null | undefined,
  explicitUnit?: DistanceUnit
): string {
  if (raw === null || raw === undefined) return "";
  const str = String(raw).trim();
  if (!str) return "";

  /* TR ondalık virgülü → nokta. */
  const tr = str.replace(",", ".");

  /* Explicit unit verilmişse direkt serialize et — number/string fark etmez. */
  if (explicitUnit) {
    const numMatch = tr.match(/^(\d+(?:\.\d+)?)$/);
    if (numMatch) {
      const safeUnit: DistanceUnit =
        explicitUnit === "m" ? "m" : "km";
      return `${numMatch[1]} ${safeUnit}`;
    }
    /* Sayı değilse (legacy free-text) → olduğu gibi dön. */
    return str;
  }

  /* Sayı + opsiyonel "m" veya "km" pattern'i. */
  const m = tr.match(/^(\d+(?:\.\d+)?)\s*(m|km|M|KM|Km|kM|mM|Mm)?$/);
  if (m) {
    const value = m[1];
    const rawUnit = (m[2] || "").toLowerCase();
    /* Tek harf "m" → metre. "km" → kilometre. Yoksa default. */
    const unit: DistanceUnit =
      rawUnit === "m"
        ? "m"
        : rawUnit === "km"
          ? "km"
          : DEFAULT_DISTANCE_UNIT;
    return `${value} ${unit}`;
  }

  /* Free-text legacy ("yakın", "5 dakika") — olduğu gibi dön. */
  return str;
}

/* ===============================================================
   🛡️ PARSE DISTANCE — text → structured object
   ===============================================================
   Admin formu için kullanılır: DB'den text okuyup form state'e
   value + unit ayırmak gerekir.

   Output:
     { value: "5",      unit: "km", isLegacy: false }    ← "5 km"
     { value: "500",    unit: "m",  isLegacy: false }    ← "500 m"
     { value: "5",      unit: "km", isLegacy: false }    ← "5" (unit yoksa default)
     { value: "1.2",    unit: "km", isLegacy: false }    ← "1.2 km"
     { value: "",       unit: "km", isLegacy: true  }    ← "yakın" (legacy free-text)
     { value: "",       unit: "km", isLegacy: false }    ← "" (boş, yeni satır)

   `value` string olarak döner (form input'u string bekliyor;
   TR virgül kullanıcı görselinde input handler'da yönetilir).
=============================================================== */
export type ParsedDistance = {
  value: string;
  unit: DistanceUnit;
  isLegacy: boolean;
};

export function parseDistance(
  raw: string | null | undefined
): ParsedDistance {
  if (!raw) {
    return { value: "", unit: DEFAULT_DISTANCE_UNIT, isLegacy: false };
  }
  const str = String(raw).trim();
  if (!str) {
    return { value: "", unit: DEFAULT_DISTANCE_UNIT, isLegacy: false };
  }
  const tr = str.replace(",", ".");
  const m = tr.match(/^(\d+(?:\.\d+)?)\s*(m|km|M|KM|Km|kM|mM|Mm)?$/);
  if (m) {
    const value = m[1];
    const rawUnit = (m[2] || "").toLowerCase();
    const unit: DistanceUnit =
      rawUnit === "m"
        ? "m"
        : rawUnit === "km"
          ? "km"
          : DEFAULT_DISTANCE_UNIT;
    return { value, unit, isLegacy: false };
  }
  /* Free-text legacy — value boş, unit default, isLegacy true. */
  return { value: "", unit: DEFAULT_DISTANCE_UNIT, isLegacy: true };
}

/* Numeric input ↔ canonical display ayrımı için (legacy backward-compat).
 *   stripDistanceUnit("5 km") → "5"
 *   stripDistanceUnit("5km")  → "5"
 *   stripDistanceUnit("500 m") → "500"
 *   stripDistanceUnit("yakın") → ""   (numeric değil)
 * YENI KOD parseDistance().value KULLANSIN — bu helper backward-compat. */
export function stripDistanceUnit(
  raw: string | null | undefined
): string {
  return parseDistance(raw).value;
}

/* Display-side unit getter — frontend renderer parsedDistance.unit
 * okumak istemiyorsa bu helper'la unit alabilir. */
export function getDistanceUnit(
  raw: string | null | undefined
): DistanceUnit {
  return parseDistance(raw).unit;
}

/* ---------------------------------------------------------------
   🎨 ICON KEY ENUM — Frontend renderer bu string'i lucide
   import'una map'ler.
   --------------------------------------------------------------- */
export type DistanceIconKey =
  | "restaurant"
  | "store"
  | "waves"
  | "plane"
  | "bus"
  | "building"
  | "cross"
  | "fuel"
  | "school"
  | "pin";

/* ---------------------------------------------------------------
   🛡️ Title → icon key matcher.
   ---------------------------------------------------------------
   Türkçe-aware. Lowercased + diakritik strip ile yapılır
   (slugifyTr ile aynı semantic'in mini versiyonu — helper'ın
   bağımsız çalışması için inline).

   ÖNCELİK: en spesifik match en başta. Bilinmeyen → "pin".
   Custom mesafeler için fallback safe.
*/
const TR_DIACRITIC_MAP: Record<string, string> = {
  ı: "i", İ: "i", ş: "s", Ş: "s", ç: "c", Ç: "c",
  ğ: "g", Ğ: "g", ü: "u", Ü: "u", ö: "o", Ö: "o",
  â: "a", Â: "a", î: "i", Î: "i", û: "u", Û: "u",
};

function normalizeTitle(title: string): string {
  if (!title) return "";
  let out = "";
  for (const ch of String(title)) {
    out += TR_DIACRITIC_MAP[ch] ?? ch;
  }
  return out.toLowerCase().trim();
}

/**
 * Title'a göre uygun icon key'i dön.
 *
 * Örnekler:
 *   getDistanceIconKey("Restoran")           → "restaurant"
 *   getDistanceIconKey("market")             → "store"
 *   getDistanceIconKey("Süpermarket")        → "store"
 *   getDistanceIconKey("Plaj")               → "waves"
 *   getDistanceIconKey("Havaalanı (Dalaman)")→ "plane"
 *   getDistanceIconKey("Otobüs Terminali")   → "bus"
 *   getDistanceIconKey("Şehir Merkezi")      → "building"
 *   getDistanceIconKey("Sağlık Merkezi")     → "cross"
 *   getDistanceIconKey("Hastane")            → "cross"
 *   getDistanceIconKey("Eczane")             → "cross"
 *   getDistanceIconKey("Benzin İstasyonu")   → "fuel"
 *   getDistanceIconKey("Okul")               → "school"
 *   getDistanceIconKey("Custom anything")    → "pin"  (fallback)
 */
export function getDistanceIconKey(
  title: string | null | undefined
): DistanceIconKey {
  const t = normalizeTitle(String(title || ""));
  if (!t) return "pin";

  /* Sıralı match — en spesifik önce. Sözcük "includes" mantığı:
     "supermarket", "mini market", "marketim" → hepsi "market" yakalar. */

  if (/restoran|restaurant|cafe|kafe|kahvalti/.test(t)) return "restaurant";

  if (/havaalani|havalimani|airport|hava limani|ucak/.test(t)) return "plane";

  if (/otobus|terminal|otogar|bus station|bus/.test(t)) return "bus";

  if (/saglik|hastane|doktor|eczane|klinik|hospital|pharmacy|saglk/.test(t))
    return "cross";

  if (/plaj|kumsal|deniz|beach|sahil|koy/.test(t)) return "waves";

  if (/sehir merkezi|merkez|city center|downtown|carsi|capa/.test(t))
    return "building";

  if (/market|bakkal|magaza|store|supermarket|alisveris|shop/.test(t))
    return "store";

  if (/benzin|akaryakit|petrol|gas|fuel/.test(t)) return "fuel";

  if (/okul|school|universite|kindergarten|kres|anaokulu/.test(t))
    return "school";

  return "pin";
}

/* ---------------------------------------------------------------
   🎨 DISTANCE TONE MAP — kategori bazlı kart paleti
   ---------------------------------------------------------------
   Her DistanceIconKey için soft pastel ton seti. Villa detail
   "Yakındaki Noktalar" kartında reuse edilir; UI tarafında
   inline ternary karmaşası YOK — tek truth source.

   PALET KURALI:
     - Tailwind core scale (50/100/200/300/600) — `/60` opacity
       ile bg yumuşatılır. Cheap "dashboard widget" / "alert box"
       hissinden kaçınılır.
     - Class string'leri LITERAL (Tailwind JIT static extraction
       için). Concat yok; bütün class isimleri burada yazılı.

   KATEGORİ → TON eşlemesi:
     waves (Plaj/Sahil) → sky      — su/deniz hissi
     plane (Havalimanı) → sky      — uçuş/gökyüzü hissi
     store (Market)     → emerald  — taze/grocery
     restaurant         → amber    — sıcak/yemek
     cross (Sağlık)     → rose     — medikal (soft, alert değil)
     building (Merkez)  → violet   — urban
     bus (Terminal)     → slate    — transit/neutral
     fuel (Benzin)      → orange   — sıcak akaryakıt
     school (Okul)      → blue     — eğitim
     pin (fallback)     → stone    — nötr/generic
--------------------------------------------------------------- */
export type DistanceTone = {
  /** Outer card background (örn. `bg-sky-50/60`). */
  cardBg: string;
  /** Outer card border (örn. `border-sky-100`). */
  cardBorder: string;
  /** Outer card hover border (örn. `hover:border-sky-300`). */
  cardHoverBorder: string;
  /** Icon wrapper background. */
  iconBg: string;
  /** Icon wrapper border. */
  iconBorder: string;
  /** Icon SVG color. */
  iconText: string;
};

export const DISTANCE_TONE_MAP: Record<DistanceIconKey, DistanceTone> = {
  waves: {
    cardBg: "bg-sky-50/60",
    cardBorder: "border-sky-100",
    cardHoverBorder: "hover:border-sky-300",
    iconBg: "bg-sky-100",
    iconBorder: "border-sky-200",
    iconText: "text-sky-600",
  },
  plane: {
    cardBg: "bg-sky-50/60",
    cardBorder: "border-sky-100",
    cardHoverBorder: "hover:border-sky-300",
    iconBg: "bg-sky-100",
    iconBorder: "border-sky-200",
    iconText: "text-sky-600",
  },
  store: {
    cardBg: "bg-emerald-50/60",
    cardBorder: "border-emerald-100",
    cardHoverBorder: "hover:border-emerald-300",
    iconBg: "bg-emerald-100",
    iconBorder: "border-emerald-200",
    iconText: "text-emerald-600",
  },
  restaurant: {
    cardBg: "bg-amber-50/60",
    cardBorder: "border-amber-100",
    cardHoverBorder: "hover:border-amber-300",
    iconBg: "bg-amber-100",
    iconBorder: "border-amber-200",
    iconText: "text-amber-600",
  },
  cross: {
    cardBg: "bg-rose-50/60",
    cardBorder: "border-rose-100",
    cardHoverBorder: "hover:border-rose-300",
    iconBg: "bg-rose-100",
    iconBorder: "border-rose-200",
    iconText: "text-rose-600",
  },
  building: {
    cardBg: "bg-violet-50/60",
    cardBorder: "border-violet-100",
    cardHoverBorder: "hover:border-violet-300",
    iconBg: "bg-violet-100",
    iconBorder: "border-violet-200",
    iconText: "text-violet-600",
  },
  bus: {
    cardBg: "bg-slate-50/60",
    cardBorder: "border-slate-100",
    cardHoverBorder: "hover:border-slate-300",
    iconBg: "bg-slate-100",
    iconBorder: "border-slate-200",
    iconText: "text-slate-600",
  },
  fuel: {
    cardBg: "bg-orange-50/60",
    cardBorder: "border-orange-100",
    cardHoverBorder: "hover:border-orange-300",
    iconBg: "bg-orange-100",
    iconBorder: "border-orange-200",
    iconText: "text-orange-600",
  },
  school: {
    cardBg: "bg-blue-50/60",
    cardBorder: "border-blue-100",
    cardHoverBorder: "hover:border-blue-300",
    iconBg: "bg-blue-100",
    iconBorder: "border-blue-200",
    iconText: "text-blue-600",
  },
  pin: {
    cardBg: "bg-stone-50",
    cardBorder: "border-stone-100",
    cardHoverBorder: "hover:border-stone-300",
    iconBg: "bg-stone-100",
    iconBorder: "border-stone-200",
    iconText: "text-stone-600",
  },
};

/* ---------------------------------------------------------------
   🛡️ FORM SEED HELPER — Faz 19
   ---------------------------------------------------------------
   `villas/ekle/page.tsx` useState initial value için. Preset'in
   mutable kopyasını üretir; downstream `setDistances` mutation'a
   girdiği için readonly array'i mutable shape'e çevirir.

   ÖNEMLİ:
     - SADECE yeni villa formu (ekle) çağırır.
     - Edit flow (`villas/[id]`) bunu KULLANMAZ; DB'den
       `getVillaDistances` ile çeker.
     - Existing villas hiçbir zaman etkilenmez.
*/
export function buildInitialDistances(): {
  title: string;
  distance: string;
}[] {
  return DEFAULT_DISTANCE_PRESETS.map((p) => ({
    title: p.title,
    distance: p.distance,
  }));
}
