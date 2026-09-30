/* ===============================================================
   🛡️ FAZ 48 — OFFER REQUEST HUMANIZE HELPERS
   ===============================================================
   Admin /maki-admin/offer-requests render layer için saf
   presentation helpers. Hiçbir DB / service / schema değişikliği
   YOK — yalnız ham slug/uuid/text → kullanıcı dostu etiket
   dönüşümü.

   KULLANIM:
     - TRAVEL_GROUP_LABEL         : enum → Türkçe etiket
     - humanizeSlug(slug)         : "balayi-villalari" → "Balayı Villaları"
     - buildLabelMap(rows)        : taxonomy rows → token→name lookup
     - resolveTokenLabel(...)     : token → name; fallback humanize
     - resolveFeatureLabel(...)   : feature UUID → name; fallback "Özel özellik"
     - formatBudgetRange(...)     : (min,max,currency) → "₺5.000 – ₺15.000"

   TASARIM:
     - Side-effect yok; pure functions.
     - Türkçe karakter haritası inline ("villalari" → "Villaları" gibi
       kelime düzeyi düzeltmeler dahil).
     - Currency formatlama mevcut lib/currency.ts formatCurrency'ye
       delege edilir.
=============================================================== */

import { formatCurrency } from "@/lib/currency";

/* ─────── Travel group (enum → TR label) ─────── */
export const TRAVEL_GROUP_LABEL: Record<string, string> = {
  couple: "Çift",
  honeymoon: "Balayı Çifti",
  core_family: "Çekirdek Aile",
  extended_family: "Geniş Aile",
  friends: "Arkadaş Grubu",
};

export function humanizeTravelGroup(raw: string | null | undefined): string {
  if (!raw) return "—";
  return TRAVEL_GROUP_LABEL[raw] || humanizeSlug(raw);
}

/* ─────── Slug humanizer ───────
   "balayi-villalari" → "Balayı Villaları"
   "cocuk-havuzlu-villalar" → "Çocuk Havuzlu Villalar"
   - "-" ile böler, her kelimeyi capitalize eder
   - sık geçen Türkçe karakter eksiklerini ve özel kelime kalıplarını
     düzeltir. (Kelime-level overrides; harf-level aksanlama yapmaz.) */
const WORD_OVERRIDES: Record<string, string> = {
  balayi: "Balayı",
  villalari: "Villaları",
  villalar: "Villalar",
  cocuk: "Çocuk",
  cocuklu: "Çocuklu",
  havuzlu: "Havuzlu",
  ozel: "Özel",
  ozellikli: "Özellikli",
  korunakli: "Korunaklı",
  buyuk: "Büyük",
  kucuk: "Küçük",
  manzarali: "Manzaralı",
  deniz: "Deniz",
  isitmali: "Isıtmalı",
  korumali: "Korumalı",
  guvenlikli: "Güvenlikli",
  bahceli: "Bahçeli",
  muhafazakar: "Muhafazakâr",
  esyali: "Eşyalı",
  lux: "Lüks",
  luks: "Lüks",
  ekonomik: "Ekonomik",
  modern: "Modern",
  klasik: "Klasik",
};

function capitalize(word: string): string {
  if (!word) return word;
  return word[0].toUpperCase() + word.slice(1);
}

export function humanizeSlug(slug: string | null | undefined): string {
  if (!slug) return "";
  const trimmed = String(slug).trim();
  if (!trimmed) return "";
  /* UUID-benzeri token'ı geri ver — çağıran tarafta zaten resolver
     fallback'i bunu kullanmamalı. Yine de güvenlik: humanize sokmasın. */
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(trimmed)) return trimmed;
  return trimmed
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => {
      const key = w.toLowerCase();
      return WORD_OVERRIDES[key] || capitalize(key);
    })
    .join(" ");
}

/* ─────── Taxonomy lookup map builder ───────
   Hem id hem slug ile aynı name'e map'ler (token slug veya uuid
   olabilir; ikisi de aynı label'ı verir). */
export type TaxonomyRow = {
  id: string;
  name: string;
  slug?: string | null;
};

export function buildLabelMap(rows: TaxonomyRow[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (!r || !r.name) continue;
    if (r.id) map[r.id] = r.name;
    if (r.slug && r.slug.trim()) map[r.slug.trim()] = r.name;
  }
  return map;
}

/* ─────── Token → label resolver ───────
   1) Lookup'tan name çıkarsa onu döner.
   2) Yoksa humanizeSlug fallback (sluga benziyorsa).
   3) UUID gibi görünüyorsa "Özel özellik" benzeri jenerik fallback. */
export function resolveTokenLabel(
  token: string,
  lookup: Record<string, string>,
  uuidFallback = "Özel"
): string {
  if (!token) return "";
  const key = token.trim();
  if (lookup[key]) return lookup[key];
  /* UUID benzeri mi? */
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    return uuidFallback;
  }
  return humanizeSlug(key);
}

export function resolveFeatureLabel(
  token: string,
  featureLookup: Record<string, string>
): string {
  return resolveTokenLabel(token, featureLookup, "Özel özellik");
}

/* ─────── Budget formatter ───────
   min/max ikisi de null → "—"
   Currency desteklenenler: TRY, USD, EUR, GBP (formatCurrency
   Intl wrapper'ı zaten halleder; geçersiz code'da fallback). */
export function formatBudgetRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string | null | undefined
): string {
  const cur = (currency || "TRY").toUpperCase();
  const hasMin = typeof min === "number" && Number.isFinite(min);
  const hasMax = typeof max === "number" && Number.isFinite(max);
  if (!hasMin && !hasMax) return "—";

  let safeFmt: (v: number) => string;
  try {
    /* Validate currency code via Intl probe. */
    formatCurrency(0, cur);
    safeFmt = (v) => formatCurrency(v, cur);
  } catch {
    safeFmt = (v) => new Intl.NumberFormat("tr-TR").format(v) + " " + cur;
  }

  if (hasMin && hasMax) return `${safeFmt(min as number)} – ${safeFmt(max as number)}`;
  if (hasMin) return `${safeFmt(min as number)} +`;
  return `< ${safeFmt(max as number)}`;
}
