import type { Dispatch, SetStateAction } from "react";

import type {
  VillaFormShape,
  VillaFormSetter,
  VillaMapData,
  VillaMapDataSetter,
  VillaLocationOption,
  VillaTypeOption,
  VillaFeatureOption,
  VillaRuleOption,
  VillaPriceIncludeOption,
  VillaDistanceItem,
  VillaWizardStep,
} from "@/app/components/admin/villa-form/types";

/* ===============================================================
   🛡️ FAZ 1 — VILLA ADMIN FORM TYPES (shared between ekle + [id])
   ===============================================================
   Eski:
     - villas/ekle/page.tsx: useState<any>(...30+ field initial)
     - villas/[id]/page.tsx: useState<any>(...30+ field initial)
   Her iki sayfada **alan-alan aynı** initial object (tek fark:
   `commission_rate: 20` ekle'de var, [id]'de yok — DB spread getirir).

   Bu dosya HER İKİ SAYFA tarafından import edilir. Tek source-of-truth.

   ÇOCUK COMPONENT CONTRACT UYUMU:
     Wizard step component'leri (`BasicInfoStep`, `AmenitiesStep`,
     `LocationStep`, `PricingStep`, `RulesAndIncludesStep`, `SeoStep`,
     `VideoStep`) prop'ta `VillaFormShape & Record<string, unknown>`
     loose contract bekler. `VillaFormData`'yı `VillaFormShape` ile
     intersect ediyoruz; required override'ları narrow ediyoruz.
     Bu sayede:
       - Page level: typed strict state
       - Child level: structural subtype assignment compile-time
         başarılı (covariance)
       - setData prop'u: `VillaFormSetter` ile cast edilir (variance;
         contravariant pozisyon)

   ⚠️ KESIN SINIRLAR:
     ❌ Runtime davranışı değişmez.
     ❌ Initial state alan SIRASI byte-identical (conditional spread
        ile commission_rate insertion order korunur).
     ❌ Default değerler aynen.
     ✅ Sadece TypeScript compile-time güvenliği artar; silent drift'i
        azaltır.
=============================================================== */

/* ---------------- VILLA FORM DATA ----------------
   Page-level strict state shape. `VillaFormShape` (loose) tabanlı,
   create/edit her iki context'te initial value sahibi alanları
   required (narrow) hale getirir.

   `commission_rate?: number | null` — OPTIONAL kalır çünkü:
     - ekle: initial 20 (var)
     - [id]: initial yok (DB spread sonrası set olur)
   Strict required yaparsak [id] initial state DB'den önce eksik
   olur — runtime davranışı değişirdi. */
export type VillaFormData = VillaFormShape & {
  /* Basic */
  title: string;
  /* 🛡️ Migration 072 — admin-only, bilgi amaçlı. Public'e aktarılmaz,
     slug üretiminde kullanılmaz, title davranışını etkilemez. */
  real_title: string;
  description: string;
  guests: number;
  bedrooms: number;
  bathrooms: number;
  deposit: number;

  /* Cleaning */
  cleaning_fee: number;
  cleaning_currency: string;
  cleaning_limit: number;

  /* 🛡️ Havuz Isıtma — 3. adım (admin form hazırlığı, hesaplama YOK).
     OPTIONAL kalır (cleaning_fee'nin aksine): initial değer "" (boş
     string) — NULL semantiğini korumak için custom_prepayment_rate
     ile aynı desen; required + concrete number narrow YAPILMAZ. */
  pool_heating_fee?: number | string | null;
  pool_heating_currency?: string | null;

  /* 🛡️ Migration 076 — sezonluk ay kısıtı. Create modunda önerilen
     varsayılan ([1,2,3,4,5,9,10,11,12]) ile initialize edilir; edit
     modunda key YOK — fetchVilla setForm spread DB'nin gerçek
     değerini (mevcut ~1595 villada NULL) atar. commission_rate ile
     BİREBİR AYNI conditional-initial deseni. */
  pool_heating_months?: number[] | null;

  /* Badge */
  badge: string;

  /* Pool (4 × 3 havuz) */
  pool_type: string;
  pool_depth: string;
  pool_width: string;
  pool_length: string;
  indoor_pool: boolean;
  indoor_pool_depth: string;
  indoor_pool_width: string;
  indoor_pool_length: string;
  child_pool: boolean;
  child_pool_depth: string;
  child_pool_width: string;
  child_pool_length: string;
  pool_sheltered: boolean;

  /* SEO */
  seo_title: string;
  seo_description: string;
  noindex: boolean;

  /* Reservation cfg — boş string runtime'da "global fallback" */
  custom_prepayment_rate: string | number;

  /* Accounting — OPTIONAL (create'te 20 initial, edit'te DB'den) */
  commission_rate?: number | null;

  /* 🛡️ MÜLK SAHİBİ — OPTIONAL (edit'te DB owner_id spread'inden hydrate;
     create'te undefined → payload'da null). property_owners FK (044). */
  owner_id?: string | null;

  /* Legal */
  tourism_document_number: string;

  /* Booking cfg */
  minimum_stay_nights: number | null;
};

/* ---------------- INITIAL STATE FACTORY ----------------
   useState init için tek source-of-truth. ekle + [id] inline initial
   object'lerinin BYTE-IDENTICAL kopyası.

   ⚠️ KESIN KURAL: Alan SIRASI ekle/[id] inline ile aynı. Conditional
   spread (`...(mode === "create" ? { commission_rate: 20 } : {})`)
   JS object insertion order'ını korur:
     - mode="create": ..., custom_prepayment_rate, COMMISSION_RATE,
                       tourism_document_number, minimum_stay_nights
     - mode="edit"  : ..., custom_prepayment_rate, tourism_document_number,
                       minimum_stay_nights (commission_rate KEY YOK)

   commission_rate runtime davranışı:
     - create: ekle initial 20, admin değiştirmezse service-side 20 fallback
       devreye girer (DEFAULT_COMMISSION_RATE) — aynı sonuç. Form initial 20
       olduğunda input'a hemen yazılır.
     - edit: initial state'te YOK. fetchVilla useEffect DB'den `commission_rate`
       getirir; setForm spread ile state'e geçer. Eski davranış aynen. */
export function initialVillaFormData(
  mode: "create" | "edit"
): VillaFormData {
  return {
    title: "",
    real_title: "",
    description: "",
    guests: 0,
    bedrooms: 0,
    bathrooms: 0,
    deposit: 0,

    cleaning_fee: 0,
    /* 🔥 cleaning_currency — edit page'iyle birebir parity.
       villa-admin.service.ts payload'ı zaten form.cleaning_currency
       okuyor; "TRY" default form-side. */
    cleaning_currency: "TRY",
    cleaning_limit: 0,

    /* 🛡️ Havuz Isıtma — 3. adım (admin form hazırlığı, hesaplama YOK).
       Boş string → normalizePoolHeatingFee payload'da NULL'a çevirir
       ("hizmet sunulmuyor" — migration 074 semantiği). Currency
       default'u migration'daki DEFAULT 'TRY' ile tutarlı. */
    pool_heating_fee: "",
    pool_heating_currency: "TRY",

    /* 🛡️ Migration 076 — sezonluk ay kısıtı. commission_rate ile
       BİREBİR AYNI desen: yalnız create modunda initial değer var
       (önerilen varsayılan: Ocak-Mayıs + Eylül-Aralık aktif, Haziran/
       Temmuz/Ağustos pasif). Edit modunda key YOK — fetchVilla setForm
       spread DB'nin gerçek değerini atar (mevcut villalarda NULL =
       "ay kısıtlaması yok", BU VARSAYILANA OTOMATİK ÇEVRİLMEZ). */
    ...(mode === "create"
      ? { pool_heating_months: [1, 2, 3, 4, 5, 9, 10, 11, 12] }
      : {}),

    badge: "",

    pool_type: "",
    pool_depth: "",
    pool_width: "",
    pool_length: "",

    indoor_pool: false,
    indoor_pool_depth: "",
    indoor_pool_width: "",
    indoor_pool_length: "",

    child_pool: false,
    child_pool_depth: "",
    child_pool_width: "",
    child_pool_length: "",
    pool_sheltered: false,

    /* 🔥 SEO */
    seo_title: "",
    seo_description: "",
    noindex: false,

    /* 🔥 CUSTOM PREPAYMENT RATE (boş = global fallback) */
    custom_prepayment_rate: "",

    /* 🛡️ COMMISSION RATE — yalnız create modunda initial 20.
       Edit modunda key YOK (fetchVilla setForm spread DB değerini
       atar). Conditional spread ile insertion order korunur. */
    ...(mode === "create" ? { commission_rate: 20 } : {}),

    /* 🛡️ TOURISM DOCUMENT NO (db/migrations/017 — Faz 22).
       Form state'inde initialize; UI input bu fazda eklenmedi.
       Boş string → service katmanında null'a normalize edilir. */
    tourism_document_number: "",

    /* 🛡️ MINIMUM STAY NIGHTS (Faz 26C).
       null = "enforcement yok" canonical. PricingStep UI input
       null/positive integer atar; service katmanı normalize eder. */
    minimum_stay_nights: null,
  };
}

/* ---------------- SETTER ALIAS ----------------
   React useState dispatch — page.tsx içinde typed strict.
   Child wizard step component'lere geçerken `VillaFormSetter`
   (loose) cast edilir (variance; setter contravariant pozisyon).
   Cast tek noktada; runtime'da aynı fonksiyon referansı; davranış
   byte-identical. */
export type VillaFormDataSetter = Dispatch<
  SetStateAction<VillaFormData>
>;

/* ---------------- COMPANION STATE TYPES (hand-narrow) ----------------
   Page'deki `useState<any[]>` state'leri için narrow shape'ler.
   eski sağlayıcı `.from(table).select("*")` döner; child component'ler
   yalnız `id + name/title` okur. Repository write-side genişletme
   bu refactor scope'unun DIŞINDA; sadece UI tarafında typing.

   Child contract'larıyla uyumlu (Section'da listed VillaTypeOption,
   VillaFeatureOption, vb. with `& Record<string, unknown>` loose):
   strict narrow burada; cast at JSX boundary olmadan structural
   subtype assignment olarak geçer. */

/** villa_locations.id+name (BasicInfoStep) */
export type VillaLocationRowLite = {
  id: string;
  name: string;
  /** Migration 050 — filtre grup başlığı. Grup kökü tespiti
      (name === filter_group_name) için villa lokasyon seçicisinde
      kullanılır; grup kökleri dropdown'da gizlenir. */
  filter_group_name?: string | null;
};

/** villa_types.id+name (AmenitiesStep) */
export type VillaTypeRowLite = {
  id: string;
  name: string;
};

/** villa_features.id+name (AmenitiesStep) */
export type VillaFeatureRowLite = {
  id: string;
  name: string;
};

/** rule_items.id+title (RulesAndIncludesStep) */
export type VillaRuleItemRowLite = {
  id: string;
  title: string;
};

/** price_include_items.id+title (RulesAndIncludesStep) */
export type VillaPriceIncludeItemRowLite = {
  id: string;
  title: string;
};

/* ---------------- PRICES + DISTANCES state shape ----------------
   Şu an ekle/[id] inline tanımlı. Buraya alıyoruz; createVillaFull +
   updateVillaFull service typed payload (VillaPriceInput,
   VillaDistanceInput) ile uyumlu.

   `VillaDistanceItem` zaten components/admin/villa-form/types.ts'te;
   re-export ediyoruz convenience için. */

export type VillaPriceRowState = {
  start_date: string;
  end_date: string;
  price: number;
  currency: string;
};

/* ---------------- RE-EXPORTS ----------------
   Child component contract'larıyla uyumlu kalmak için. Page tek
   noktadan import alır; cross-route type drift'i kapalı kalır. */
export type {
  VillaFormShape,
  VillaFormSetter,
  VillaMapData,
  VillaMapDataSetter,
  VillaLocationOption,
  VillaTypeOption,
  VillaFeatureOption,
  VillaRuleOption,
  VillaPriceIncludeOption,
  VillaDistanceItem,
  VillaWizardStep,
};
