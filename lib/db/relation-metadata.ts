/* ===============================================================
   🛡️ STATİK İLİŞKİ METADATA KATMANI (project-scoped)
   ===============================================================
   AMAÇ:
     Repository'lerin embed-select string'lerinde kullandığı SONLU
     ilişki kümesini AÇIKÇA, EL İLE tanımlar. Native provider (pgQuery)
     JOIN sorgularını YALNIZ bu metadata'yı okuyarak üretir.

   ⚠️ NE DEĞİLDİR (bilinçli):
     - ORM DEĞİL.
     - Genel amaçlı ilişki çözücü / resource-embedding motoru DEĞİL.
     - Otomatik FK keşfi / reflection / schema taraması YOK.
     Yalnız bu projenin BUGÜN kullandığı ilişkiler burada tanımlıdır.
     Yeni bir embed gerekiyorsa BURAYA açıkça eklenir (niyetli + review'lı).

   ⚠️ REPOSITORY DOKUNULMAZ:
     Repo'lar select string'lerini aynen tutar. "İlişki nasıl çözülür"
     bilgisi buraya (DB katmanı) taşınır — repo'ya değil.

   ⚠️ SAF MODÜL:
     `pg` import etmez; runtime bağımlılığı yoktur → client/server her
     bağlamda güvenli, TSC/ESLint temiz. Provider bunu tüketir.

   KAPSAM (embed-select kullanan 6 repo'nun tükettiği ilişkiler):
     villa               → location (1) / villa_images (N) / villa_prices (N)
     reservations        → villa (1)
     discount_collections→ villa (1)   [villa iç içe: location/images/prices]
     homepage_collections→ villa (1)   [villa iç içe]
     villa_reviews       → villa (1)   [villa iç içe: location/images]
   =============================================================== */

/** İlişki kardinalitesi: tekil nesne mi, dizi mi. */
export type RelationCardinality = "one" | "many";

/** Tek bir yönlü ilişkinin statik tanımı (parent → target). */
export interface RelationDef {
  /** Embed alias'ı — repo select string'inde geçen ad
   *  (ör. "location", "villa_images", "villa"). */
  readonly alias: string;
  /** Hedef fiziksel tablo adı. */
  readonly table: string;
  /** one → tekil JSON obje; many → json_agg dizi. */
  readonly cardinality: RelationCardinality;
  /** JOIN koşulu — PARENT tablodaki kolon. */
  readonly localKey: string;
  /** JOIN koşulu — TARGET tablodaki kolon. */
  readonly foreignKey: string;
  /** `many` için embed içi varsayılan sıralama (opsiyonel). */
  readonly orderBy?: ReadonlyArray<{
    readonly column: string;
    readonly direction: "asc" | "desc";
  }>;
}

/* ---------------------------------------------------------------
   İLİŞKİ KAYDI — parent tablo → sonlu, el ile tanımlı ilişki listesi.
   Buradaki DIŞINDA hiçbir ilişki tanımlı DEĞİLDİR (bilerek).
   --------------------------------------------------------------- */
export const RELATION_METADATA: Readonly<Record<string, ReadonlyArray<RelationDef>>> = {
  /* villa: kart/detay embed'lerinin çekirdeği; discount/homepage/review
     içinde İÇ İÇE de kullanılır (aşağıdaki parent'lar "villa" alias'ıyla
     bu tabloya bağlanır; nested çözüm yine bu kayda bakar). */
  villa: [
    {
      alias: "location",
      table: "villa_locations",
      cardinality: "one",
      localKey: "location_id",
      foreignKey: "id",
    },
    {
      alias: "villa_images",
      table: "villa_images",
      cardinality: "many",
      localKey: "id",
      foreignKey: "villa_id",
      /* is_cover öncelikli + sort_order tie-break (mevcut embed davranışı). */
      orderBy: [
        { column: "is_cover", direction: "desc" },
        { column: "sort_order", direction: "asc" },
      ],
    },
    {
      alias: "villa_prices",
      table: "villa_prices",
      cardinality: "many",
      localKey: "id",
      foreignKey: "villa_id",
    },
    {
      /* 🛡️ villa → villa_discounts (migration 079). `villa_prices`
         relation'ının BİREBİR yapısal ikizi — yalnız tablo adı farklı.
         Public discount-collection kartında (VillaCard "discount"
         variant) aktif indirim tarih aralığı + indirimli fiyat
         göstermek için kullanılır (bkz. discount.repository.ts >
         findActivePublicCards, lib/cache.helpers.ts >
         getCachedDiscountCollectionVillas). Tarih filtresi YOK — tüm
         kayıtlar embed edilir, "aktif" seçimi caller'da
         `price.engine > getActiveDiscount` ile yapılır (yeni bir
         DB filtre/sorgu mantığı İCAT EDİLMEDİ). */
      alias: "villa_discounts",
      table: "villa_discounts",
      cardinality: "many",
      localKey: "id",
      foreignKey: "villa_id",
      orderBy: [{ column: "start_date", direction: "asc" }],
    },
    {
      /* villa → property_owners (villa.owner_id FK, migration 044).
         Yalnız güvenli alanlar (first_name/last_name/phone) embed edilir;
         email/iban PII ASLA public read'e çıkmaz (caller select'i sınırlar).
         Rezervasyon paylaşım sayfası için reservations→villa→owner nested. */
      alias: "owner",
      table: "property_owners",
      cardinality: "one",
      localKey: "owner_id",
      foreignKey: "id",
    },
  ],

  /* reservations → villa (operations + reservation detay embed'i) +
     payment_method (mail snapshot read'leri: request/cancelled mail
     `payment_method:payment_method_id ( name[, type] )` embed'i). */
  reservations: [
    {
      alias: "villa",
      table: "villa",
      cardinality: "one",
      localKey: "villa_id",
      foreignKey: "id",
    },
    {
      alias: "payment_method",
      table: "payment_methods",
      cardinality: "one",
      localKey: "payment_method_id",
      foreignKey: "id",
    },
  ],

  /* discount_collections → villa (kart; villa iç içe location/images/prices). */
  discount_collections: [
    {
      alias: "villa",
      table: "villa",
      cardinality: "one",
      localKey: "villa_id",
      foreignKey: "id",
    },
  ],

  /* homepage_collections → villa (kart; villa iç içe). */
  homepage_collections: [
    {
      alias: "villa",
      table: "villa",
      cardinality: "one",
      localKey: "villa_id",
      foreignKey: "id",
    },
  ],

  /* villa_reviews → villa (public/admin liste; villa iç içe location/images). */
  villa_reviews: [
    {
      alias: "villa",
      table: "villa",
      cardinality: "one",
      localKey: "villa_id",
      foreignKey: "id",
    },
  ],

  /* external_calendar_events → villa (admin liste: villa:villa_id(...)) +
     source (external_calendar_sources) — anon event-repo embed'i
     `source:source_id ( source_name[, id, is_active, last_success_at,
     last_error] )`; her event TEK source'a bağlanır → cardinality "one".
     external-calendar-event.repository (findActiveWithSourceByVilla / list)
     tüketir. */
  external_calendar_events: [
    {
      alias: "villa",
      table: "villa",
      cardinality: "one",
      localKey: "villa_id",
      foreignKey: "id",
    },
    {
      alias: "source",
      table: "external_calendar_sources",
      cardinality: "one",
      localKey: "source_id",
      foreignKey: "id",
    },
  ],

  /* external_calendar_sources → villa (admin liste: villa:villa_id(...)). */
  external_calendar_sources: [
    {
      alias: "villa",
      table: "villa",
      cardinality: "one",
      localKey: "villa_id",
      foreignKey: "id",
    },
  ],

  /* manual_reservations → villa (liste: villa:villa_id(title)). */
  manual_reservations: [
    {
      alias: "villa",
      table: "villa",
      cardinality: "one",
      localKey: "villa_id",
      foreignKey: "id",
    },
  ],

  /* villa_rule_relations → rule_items (public villa sayfası kural embed'i:
     `rule_items ( id, title )`; her relation satırı TEK rule_item'a bağlanır
     → cardinality "one"). rule-item.repository.findRulesByVilla tüketir. */
  villa_rule_relations: [
    {
      alias: "rule_items",
      table: "rule_items",
      cardinality: "one",
      localKey: "rule_id",
      foreignKey: "id",
    },
  ],

  /* villa_price_include_relations → price_include_items (public villa sayfası
     "fiyata dahil" embed'i: `price_include_items ( id, title )`; her relation
     satırı TEK item'a bağlanır → cardinality "one"). relation kolonu
     "include_id". price-include-item.repository.findIncludesByVilla tüketir. */
  villa_price_include_relations: [
    {
      alias: "price_include_items",
      table: "price_include_items",
      cardinality: "one",
      localKey: "include_id",
      foreignKey: "id",
    },
  ],

  /* villa_feature_relations → villa_features (public villa sayfası olanak
     embed'i: `villa_features ( id, name )`; her relation satırı TEK feature'a
     bağlanır → cardinality "one"). relation kolonu "feature_id".
     villa-feature.repository.findFeaturesByVilla tüketir. */
  villa_feature_relations: [
    {
      alias: "villa_features",
      table: "villa_features",
      cardinality: "one",
      localKey: "feature_id",
      foreignKey: "id",
    },
  ],
};

/* ---------------------------------------------------------------
   SAF LOOKUP HELPER'LARI (runtime sihir yok — düz map erişimi).
   --------------------------------------------------------------- */

/** Parent tablonun tanımlı ilişkileri (yoksa boş dizi). */
export function getRelationsFor(
  parentTable: string
): ReadonlyArray<RelationDef> {
  return RELATION_METADATA[parentTable] ?? [];
}

/** Parent tablo + alias → ilişki tanımı (yoksa undefined). */
export function getRelation(
  parentTable: string,
  alias: string
): RelationDef | undefined {
  return getRelationsFor(parentTable).find((r) => r.alias === alias);
}

/** Bu tablo için tanımlı embed ilişkisi var mı? */
export function hasRelations(parentTable: string): boolean {
  return getRelationsFor(parentTable).length > 0;
}
