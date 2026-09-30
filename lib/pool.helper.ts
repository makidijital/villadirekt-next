/* ===============================================================
   🛡️ POOL HELPER — PHASE 10E BATCH 5
   ===============================================================
   Havuz kartlarının TEK canonical kaynağı.

   NEDEN: `pool_type` projede hiçbir yerde tiplenmemiş (`string`);
   "Özel Havuz" / "Özel Korunaklı Havuz" / "Ortak Havuz" /
   "Kapalı Havuz" / "Çocuk Havuzu" TR literal'leri İKİ ayrı sayfada
   (kiralik-villa/[slug] ve v/[token]) inline tekrarlanıyordu. Bu dosya
   o türetmeyi tek yere alır; ETİKET üretmez, yalnız CANONICAL TİP
   döndürür.

   ⚠️ ETİKET BU DOSYADA YOK — locale'e göre çözüm
   lib/pool-label.helper.ts'te (dictionary üzerinden). Böylece
   "çevrilmiş metinden tip/ikon çıkarma" HİÇBİR ZAMAN mümkün olmaz:
   tip önce belirlenir, etiket sonra türetilir, ters yön YOKTUR.

   DB / veri modeli DEĞİŞMEDİ: `villa.pool_type` ("ozel"|"ortak"|"yok")
   ve `pool_sheltered`/`indoor_pool`/`child_pool` boolean'ları AYNEN
   okunur, hiçbiri yazılmaz.

   PURE & SSR-SAFE: React/DOM/DB/i18n bağımlılığı yok.
   =============================================================== */

/** Canonical havuz tipi — dictionary key'i olarak da kullanılır. */
export const POOL_TYPE_KEYS = [
  "private",
  "private_sheltered",
  "shared",
  "indoor",
  "child",
] as const;
export type PoolTypeKey = (typeof POOL_TYPE_KEYS)[number];

/** Mevcut React `key` değerleri — DOM çıktısı değişmesin diye KORUNDU. */
export type PoolCardKey = "main" | "indoor" | "child";

export type PoolCard = {
  key: PoolCardKey;
  type: PoolTypeKey;
  width: string | null | undefined;
  length: string | null | undefined;
  depth: string | null | undefined;
};

/** `buildPoolCards`'ın okuduğu villa alanları (salt-okunur). */
export type PoolCardSource = {
  pool_type?: string | null;
  pool_sheltered?: boolean | null;
  pool_width?: string | null;
  pool_length?: string | null;
  pool_depth?: string | null;
  indoor_pool?: boolean | null;
  indoor_pool_width?: string | null;
  indoor_pool_length?: string | null;
  indoor_pool_depth?: string | null;
  child_pool?: boolean | null;
  child_pool_width?: string | null;
  child_pool_length?: string | null;
  child_pool_depth?: string | null;
};

export type BuildPoolCardsOptions = {
  /** `pool_sheltered` true iken ana havuzu "private_sheltered" olarak
   *  ayırt eder. Varsayılan: true (kiralik-villa/[slug]'ın BUGÜNKÜ
   *  davranışı).
   *
   *  ⚠️ `v/[token]` sayfası bugün `pool_sheltered`'ı HİÇ OKUMUYOR ve
   *  korunaklı havuzu da "Özel Havuz" olarak gösteriyor. O sayfanın
   *  kullanıcıya görünen TR metni DEĞİŞMESİN diye orada `false`
   *  geçilir. İki sayfayı aynı davranışa getirmek AYRI bir karardır
   *  (bkz. Batch 5 raporu) — bu helper o kararı ZORLAMAZ. */
  distinguishSheltered?: boolean;
};

/**
 * Villa alanlarından gösterilecek havuz kartlarını türetir.
 * Sıra ve React key'leri iki sayfanın BUGÜNKÜ davranışıyla birebir
 * aynıdır: ana havuz → kapalı havuz → çocuk havuzu.
 * Hiç havuz yoksa boş dizi döner (çağıran taraf section çizmez).
 */
export function buildPoolCards(
  villa: PoolCardSource,
  options?: BuildPoolCardsOptions
): PoolCard[] {
  const distinguishSheltered = options?.distinguishSheltered ?? true;
  const cards: PoolCard[] = [];

  if (villa.pool_type && villa.pool_type !== "yok") {
    const isPrivate = villa.pool_type === "ozel";
    const type: PoolTypeKey = isPrivate
      ? distinguishSheltered && villa.pool_sheltered
        ? "private_sheltered"
        : "private"
      : "shared";
    cards.push({
      key: "main",
      type,
      width: villa.pool_width,
      length: villa.pool_length,
      depth: villa.pool_depth,
    });
  }

  if (villa.indoor_pool) {
    cards.push({
      key: "indoor",
      type: "indoor",
      width: villa.indoor_pool_width,
      length: villa.indoor_pool_length,
      depth: villa.indoor_pool_depth,
    });
  }

  if (villa.child_pool) {
    cards.push({
      key: "child",
      type: "child",
      width: villa.child_pool_width,
      length: villa.child_pool_length,
      depth: villa.child_pool_depth,
    });
  }

  return cards;
}

/** Havuz section'ı hiç render edilmeli mi? (iki sayfadaki AYNI koşul) */
export function hasAnyPool(villa: PoolCardSource): boolean {
  return buildPoolCards(villa).length > 0;
}
