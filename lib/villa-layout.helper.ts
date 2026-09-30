/* ===============================================================
   🛡️ VILLA ACCOMMODATION LAYOUT HELPER (migration 047)
   ===============================================================
   Airbnb tarzı "Konaklama Düzeni": yatak odaları + banyolar.
   `lib/youtube.helper.ts` paterniyle birebir: pure tip + normalize
   + label map. DB'ye DOKUNMAZ; yalnız parse/validate/etiket.

   KULLANIM:
     - Admin form (AccommodationLayoutStep): tip + label map
     - Service normalize (villa-admin normalizers): DB-yazım öncesi
       sanitize → boşsa null
     - Public detay (AccommodationLayout): DB JSONB → güvenli render

   GERİYE DÖNÜK UYUM:
     normalizeBedroomLayout(null) → []   (section render edilmez)
     normalizeBathroomLayout(null) → []
=============================================================== */

/* ---------------- BED TYPES ---------------- */
export const BED_TYPES = [
  "double",
  "single",
  "queen",
  "king",
  "bunk",
  "sofa",
] as const;
export type BedType = (typeof BED_TYPES)[number];

export const BED_TYPE_LABELS: Record<BedType, string> = {
  double: "Çift Kişilik Yatak",
  single: "Tek Kişilik Yatak",
  queen: "Queen Bed",
  king: "King Bed",
  bunk: "Ranza",
  sofa: "Çekyat",
};

/* ---------------- BATHROOM TYPES ---------------- */
export const BATHROOM_TYPES = ["full", "shower_wc", "wc"] as const;
export type BathroomType = (typeof BATHROOM_TYPES)[number];

export const BATHROOM_TYPE_LABELS: Record<BathroomType, string> = {
  full: "Tam Banyo",
  shower_wc: "Duş + WC",
  wc: "WC",
};

/* ---------------- ROOM NAME SUGGESTIONS (datalist) ---------------- */
export const BEDROOM_NAME_SUGGESTIONS: string[] = [
  "Ana Yatak Odası",
  "1. Yatak Odası",
  "2. Yatak Odası",
  "3. Yatak Odası",
  "Çocuk Odası",
  "Misafir Odası",
];

/* ---------------- CANONICAL SHAPES ---------------- */
export type BedEntry = { type: BedType; count: number };
export type BedroomLayoutItem = { name: string; beds: BedEntry[] };
export type BathroomLayoutItem = { name: string; type: BathroomType };

/* ---------------- TYPE GUARDS ---------------- */
function isBedType(v: unknown): v is BedType {
  return typeof v === "string" && (BED_TYPES as readonly string[]).includes(v);
}
function isBathroomType(v: unknown): v is BathroomType {
  return (
    typeof v === "string" &&
    (BATHROOM_TYPES as readonly string[]).includes(v)
  );
}

/* ---------------- NORMALIZERS ----------------
   Defansif: bilinmeyen tip / geçersiz count / boş satır düşürülür.
   count: 1..20 arası integer'a clamp; geçersizse satır atılır.
   Sonuç caller'a temiz array döner (boş olabilir). */

export function normalizeBedroomLayout(raw: unknown): BedroomLayoutItem[] {
  if (!Array.isArray(raw)) return [];
  const out: BedroomLayoutItem[] = [];
  for (const room of raw) {
    if (!room || typeof room !== "object") continue;
    const r = room as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const rawBeds = Array.isArray(r.beds) ? r.beds : [];
    const beds: BedEntry[] = [];
    for (const b of rawBeds) {
      if (!b || typeof b !== "object") continue;
      const be = b as Record<string, unknown>;
      if (!isBedType(be.type)) continue;
      const count = Math.floor(Number(be.count));
      if (!Number.isFinite(count) || count < 1) continue;
      beds.push({ type: be.type, count: Math.min(count, 20) });
    }
    /* İsimsiz + yataksız satır anlamsız → düşür. İsim varsa yatak
       boş olsa bile koru (admin henüz doldurmamış olabilir). */
    if (!name && beds.length === 0) continue;
    out.push({ name, beds });
  }
  return out;
}

export function normalizeBathroomLayout(raw: unknown): BathroomLayoutItem[] {
  if (!Array.isArray(raw)) return [];
  const out: BathroomLayoutItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!isBathroomType(r.type)) continue;
    out.push({ name, type: r.type });
  }
  return out;
}

/* ---------------- DB-WRITE NORMALIZERS ----------------
   Service katmanı kullanır: normalize + boşsa null ("düzen yok"
   semantic'i; youtube_videos ile aynı). */
export function normalizeBedroomLayoutForDb(
  raw: unknown
): BedroomLayoutItem[] | null {
  const n = normalizeBedroomLayout(raw);
  return n.length > 0 ? n : null;
}
export function normalizeBathroomLayoutForDb(
  raw: unknown
): BathroomLayoutItem[] | null {
  const n = normalizeBathroomLayout(raw);
  return n.length > 0 ? n : null;
}

/* ---------------- DISPLAY HELPERS ---------------- */
export function bedLabel(type: BedType): string {
  return BED_TYPE_LABELS[type] ?? type;
}
export function bathroomLabel(type: BathroomType): string {
  return BATHROOM_TYPE_LABELS[type] ?? type;
}
