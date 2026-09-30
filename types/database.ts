/* ===============================================================
   🛡️ DATABASE TYPE — PostgreSQL şemasının elle tutulan aynası
   ===============================================================
   Projede tip üretimi (codegen) pipeline'ı yoktur; aktif kullanılan
   tabloların Row / Insert / Update tipleri bu dosyada ELLE tutulur.
   Şema değiştiğinde bu dosya da güncellenmelidir — her tablonun
   başında ilgili migration referansı vardır (`db/migrations/NNN`).

   PHILOSOPHY:
     - Row: read tarafı; nullable kolonlar `| null` ile işaretli.
       Bilinmeyen alanlar için defansif geniş tipler kullanıldı
       (örn. enumlar `string`, daterange'lar `string`).
     - Insert / Update: `Partial<Row>` — service layer zaten partial
       payload geçiyor (örn. `updateSettings(Partial<Settings>)`).
     - Functions: yalnız uygulamada çağrılan PL/pgSQL fonksiyonları
       (RPC) tanımlı; Args + Returns shape'i ile.

   USE:
     Repository katmanı (`lib/db/*.repository*.ts`) native `pg`
     üzerinden çalışır; bu tipler QueryBuilder sonuçlarını
     daraltmak ve dokümantasyon için kullanılır:

       const { data } = await db.from("villa").select("*");
       data?.[0]?.title  // string | null

     Embedded select (`*, location:villa_locations(name)`) için
     otomatik tip çıkarımı yapılmaz; gerek olan call-site'larda
     local interface ile narrow edilir.
   =============================================================== */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/* ---------- COMMON ROW SHAPES ---------- */

export interface VillaRow {
  id: string;
  title: string;
  description: string | null;
  location_id: string | null;
  badge: string | null;
  slug: string | null;
  guests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  deposit: number | null;
  cleaning_fee: number | null;
  cleaning_currency: string | null;
  cleaning_limit: number | null;
  price: number | null;
  currency: string | null;
  /* Pool */
  pool_type: string | null;
  pool_depth: string | null;
  pool_width: string | null;
  pool_length: string | null;
  indoor_pool: boolean | null;
  indoor_pool_depth: string | null;
  indoor_pool_width: string | null;
  indoor_pool_length: string | null;
  child_pool: boolean | null;
  child_pool_depth: string | null;
  child_pool_width: string | null;
  child_pool_length: string | null;
  pool_sheltered: boolean | null;
  /* 🛡️ Migration 074 — Havuz Isıtma (opsiyonel ücretli hizmet, İLK ADIM).
   *  NULL veya 0 → villa havuz ısıtma hizmeti SUNMUYOR kabul edilecek.
   *  Hesaplama mantığı bu adımda uygulanmadı — sadece veri modeli. */
  pool_heating_fee: number | null;
  pool_heating_currency: string | null;
  /* 🛡️ Migration 076 — Havuz Isıtma sezonluk ay kısıtı.
   *  NULL → ay kısıtlaması YOK, 12 ay aktif (geriye dönük uyumlu).
   *  [1..12] → yalnız listelenen aylarda aktif. Ay numarası: 1=Ocak. */
  pool_heating_months: number[] | null;
  /* Map */
  map_type: string | null;
  latitude: number | null;
  longitude: number | null;
  map_embed: string | null;
  /* SEO */
  seo_title: string | null;
  seo_description: string | null;
  noindex: boolean | null;
  /* Reservation overrides */
  custom_prepayment_rate: number | null;
  /* Visibility — migration 003 */
  is_active: boolean | null;
  deleted_at: string | null;
  /* Ordering — migration 006 */
  sort_order: number;
  /* 🛡️ Migration 017 — T.C. Kültür ve Turizm Bakanlığı belge no.
   *  Opsiyonel; eski kayıtlarda NULL. Read path'leri etkilenmez. */
  tourism_document_number: string | null;
  /* 🛡️ FAZ 26B — Minimum konaklama gece sayısı.
   *  NULL veya <=1 → enforcement YOK (eski davranış aynen).
   *  >=2 → BookingSidebar selection validation aktif. */
  minimum_stay_nights?: number | null;
  /* 🛡️ FAZ 31 — Private / Temporary Villa URL token.
   *  Public listelerde görünmeyen (is_active=false) villalar dahil
   *  bir villaya `/p/[token]` route üzerinden erişim için kullanılan
   *  unguessable secret. NULL → henüz token üretilmedi.
   *  DB: text nullable + partial unique index (token IS NOT NULL).
   *  Erişim semantiği: deleted_at IS NULL koşulu korunur; is_active
   *  filtresi UYGULANMAZ (off-market preview).
   *  Token üretim formülü: crypto.randomUUID().replace(/-/g, "").slice(0, 20)
   */
  private_access_token?: string | null;
  created_at: string | null;
}

export interface VillaImageRow {
  id: string;
  villa_id: string;
  image_url: string;
  sort_order: number | null;
  is_cover: boolean | null;
  created_at: string | null;
}

export interface VillaLocationRow {
  id: string;
  name: string;
  /** SEO-friendly slug (migration 009). Eski kayıtlar için NULL
   *  olabilir; FE/URL layer NULL'da UUID fallback'ine düşer. */
  slug: string | null;
  /** R2 bucket-relative path (migration 011) — bucket
   *  `site-assets`. Örnek: "location-covers/kalkan.webp".
   *  Public URL runtime'da getPublicUrl ile üretilir; bucket/domain
   *  değişimine immune. NULL → bölge görseli yok. Migration 010
   *  (villa_types.cover_image) ile birebir paralel mimari. */
  cover_image: string | null;
  created_at: string | null;
}

/** Firma banka hesap bilgileri (mevcut public.payment_accounts).
 *  Reservation EFT/Havale akışında source-of-truth. Multi-row;
 *  is_active true olan kayıt "varsayılan" aktif hesap (single-active
 *  semantic service tarafından enforce edilir). */
export interface PaymentAccountRow {
  id: string;
  bank_name: string | null;
  account_holder: string | null;
  iban: string | null;
  branch_name: string | null;
  branch_code: string | null;
  swift_code: string | null;
  currency: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Public /iletisim form submit kayıtları (migration 015).
 *  Admin /maki-admin/messages üzerinden yönetir.
 *  RLS: anon INSERT, authenticated full CRUD.
 *
 *  🛡️ FAZ 42 — `replied_at` kolonu kaldırıldı (migration 023).
 *  Exhaustive audit: hiçbir consumer okumuyordu; `is_read` +
 *  `archived_at` mevcut lifecycle'ı tek başlarına yönetir.
 */
export interface ContactMessageRow {
  id: string;
  created_at: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  message: string;
  is_read: boolean;
  archived_at: string | null;
  source_page: string | null;
}

/** Manuel anasayfa koleksiyon kaydı (migration 012). Eğer aktif
 *  kayıt varsa VillaList sadece bu listeyi gösterir; yoksa
 *  mevcut getCachedVillas() otomatik fallback'ine düşer. */
export interface HomepageCollectionRow {
  id: string;
  villa_id: string;
  sort_order: number;
  is_active: boolean;
  custom_title: string | null;
  /** Bucket-relative path (site-assets). NULL → villa'nın kendi
   *  cover image fallback'i. Kategori/bölge cover semantic'iyle aynı. */
  custom_cover_image: string | null;
  created_at: string | null;
}

export interface VillaTypeRow {
  id: string;
  name: string;
  /** SEO-friendly slug (migration 008). Eski kayıtlar için NULL
   *  olabilir; FE/URL layer NULL'da UUID fallback'ine düşer. */
  slug: string | null;
  /** R2 bucket-relative path (migration 010) — bucket
   *  `site-assets`. Örnek: "category-covers/balayi-villalari.webp".
   *  Public URL runtime'da getPublicUrl ile üretilir; bucket/domain
   *  değişimine immune. NULL → kategori görseli yok. */
  cover_image: string | null;
  created_at: string | null;
}

export interface VillaTypeRelationRow {
  villa_id: string;
  type_id: string;
}

export interface VillaFeatureRow {
  id: string;
  name: string;
  created_at: string | null;
}

export interface VillaFeatureRelationRow {
  villa_id: string;
  feature_id: string;
}

export interface VillaRuleRow {
  id: string;
  name: string;
  created_at: string | null;
}

export interface VillaRuleRelationRow {
  villa_id: string;
  rule_id: string;
}

export interface PriceIncludeItemRow {
  id: string;
  name: string;
  created_at: string | null;
}

export interface VillaPriceIncludeRelationRow {
  villa_id: string;
  include_id: string;
}

/* 🛡️ FAZ 41 — VillaDistanceRow canonical shape.
   Mevcut runtime kolonları (kod tarafı `.from("villa_distances")` +
   `replace_villa_distances` RPC ile uyumlu): id, villa_id, title,
   distance, created_at. Eski `name/value/unit` type kalıntısı stale
   şema referansı idi → kaldırıldı. DB row'larına dokunulmadı. */
export interface VillaDistanceRow {
  id: string;
  villa_id: string;
  title: string;
  distance: string;
  created_at: string | null;
}

export interface VillaPriceRow {
  id: string;
  villa_id: string;
  price: number;
  currency: string;
  start_date: string;
  end_date: string | null;
}

/* 🛡️ Migration 079 — villa_discounts (ADIM 1: veri modeli).
 *  villa_prices'ın ÜZERİNE hesap anında uygulanacak bağımsız indirim
 *  katmanı. Tarih semantiği villa_prices ile BİREBİR AYNI (kapalı
 *  interval, start_date/end_date ikisi de dahil). Bu tip HENÜZ
 *  hiçbir hesaplama/UI kodu tarafından tüketilmiyor — yalnız veri
 *  modeli hazır (bkz. lib/db/villa-discount.repository.server.ts). */
export interface VillaDiscountRow {
  id: string;
  villa_id: string;
  start_date: string;
  end_date: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  currency: string | null;
  created_at: string | null;
}

/* Reservations — migration 001 EXCLUDE constraint */
export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "cancelled";

export interface ReservationRow {
  id: string;
  reservation_no: string | null;
  villa_id: string;
  start_date: string;
  end_date: string;
  total_price: number | null;
  original_price: number | null;
  original_currency: string | null;
  exchange_rate: number | null;
  total_price_try: number | null;
  original_cleaning_fee: number | null;
  original_cleaning_currency: string | null;
  cleaning_fee_try: number | null;
  /* 🛡️ Migration 075 — Havuz Isıtma snapshot alanları (İLK ADIM).
   *  Gece sayısı ayrıca saklanmaz (start_date/end_date'ten türetilir).
   *  Hesaplama mantığı bu adımda uygulanmadı — sadece veri modeli. */
  pool_heating_selected: boolean;
  original_pool_heating_total: number | null;
  original_pool_heating_currency: string | null;
  pool_heating_total_try: number | null;
  /* 🛡️ Migration 080 — İndirim/özel fiyat SNAPSHOT alanları (FAZ 4).
   *  Rezervasyon oluşturulduğu anda server'ın villa_discounts'tan
   *  hesapladığı sonuç DONDURULUR (izlenebilirlik amaçlı — hesaplama/
   *  enforcement bu kolonlara bağlı DEĞİL, zaten total_price_try vb.
   *  içine gömülü). Discount uygulanmadıysa TÜMÜ null (discount_applied
   *  hariç — o zaman false). Admin sonradan villa_discounts'ı değiştirse/
   *  silse bile bu satır DEĞİŞMEZ (snapshot). */
  discount_applied: boolean;
  discount_type: "percent" | "fixed" | null;
  discount_value: number | null;
  discount_currency: string | null;
  original_stay_total_try: number | null;
  stay_discount_amount_try: number | null;
  name: string;
  phone: string;
  /** 🛡️ Migration 094 — ikinci iletişim telefonu (E.164).
   *  Eski kayıtlarda NULL; zorunluluk uygulama katmanında. */
  phone2: string | null;
  email: string | null;
  identity_number: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  guests: number | null;
  guest_names: string[] | null;
  note: string | null;
  status: ReservationStatus;
  payment_method_id: string | null;
  prepayment_amount: number | null;
  remaining_payment: number | null;
  paid_amount: number | null;
  custom_price: boolean | null;
  custom_price_note: string | null;
  payment_preference: "prepayment" | "full_payment" | null;
  payment_link: string | null;
  payment_link_status: string | null;
  payment_link_sent_at: string | null;
  damage_deposit: number | null;
  created_at: string | null;
}

export interface ManualReservationRow {
  id: string;
  villa_id: string;
  start_date: string;
  end_date: string;
  note: string | null;
  source: string | null;
  status: string | null;
  created_at: string | null;
}

/* Pages — CMS, migration 004 menu_parent_id */
export interface PageRow {
  id: string;
  title: string;
  slug: string;
  body: string | null;
  /** Migration 014 — hero altı kısa açıklama (lead/excerpt). */
  excerpt: string | null;
  /** Migration 014 — R2 bucket-relative path
   *  ("page-covers/..."). Public URL runtime'da getPublicUrl ile. */
  cover_image: string | null;
  /** Migration 014 — typed section array (JSONB).
   *  Shape: PageSection[] (bkz. lib/page-sections.ts).
   *  Boş array → public render body'yi tek prose block gösterir. */
  sections: unknown[] | null;
  is_active: boolean | null;
  menu_order: number | null;
  menu_parent_id: string | null;
  /** Migration 045 — header menü auto-include görünürlüğü. Yeni
   *  sayfalar default false (menüde görünmez); admin true yaparsa
   *  görünür. /p/{slug} route + SEO + sitemap bundan BAĞIMSIZ. */
  show_in_menu: boolean | null;
  seo_title: string | null;
  seo_description: string | null;
  noindex: boolean | null;
  created_at: string | null;
}

/* Menu — migration 005 source_type/source_id */
export type MenuSourceType = "manual" | "page" | "category" | "region";

export interface MenuRow {
  id: string;
  name: string | null;
  href: string | null;
  order: number | null;
  parent_id: string | null;
  source_type: MenuSourceType | string | null;
  source_id: string | null;
  is_active: boolean | null;
  created_at: string | null;
}

/* Settings — single row; migration 007 hero fields */
export type WatermarkPosition =
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface SettingsRow {
  id: string;
  site_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  prepayment_rate: number | null;
  /* 🛡️ Migration 071 — Orphan-gap / minimum konaklama boşluk kuralı.
   *  true → min-stay'den kısa kullanılamaz boşluk bırakan public seçim
   *  engellenir. NULL → fail-safe AÇIK kabul edilir (public tarafta). */
  orphan_gap_rule_enabled: boolean | null;
  site_logo: string | null;
  /* 🛡️ mig 048 — footer'a özel logo (koyu zemin). NULL → footer
   *  site_logo'ya fallback eder. */
  footer_logo: string | null;
  watermark_logo: string | null;
  watermark_enabled: boolean | null;
  watermark_opacity: number | null;
  watermark_position: WatermarkPosition | string | null;
  watermark_size: number | null;
  resend_api_key: string | null;
  mail_from: string | null;
  mail_from_name: string | null;
  /* Homepage hero — migration 007 */
  hero_enabled: boolean | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_background_image: string | null;
  hero_overlay_opacity: number | null;
  hero_primary_cta_text: string | null;
  hero_primary_cta_href: string | null;
  hero_secondary_cta_text: string | null;
  hero_secondary_cta_href: string | null;
  hero_badge_text: string | null;
  /* 🛡️ Migration 051 — settings_touch_updated_at BEFORE UPDATE trigger
   *  ile auto-touch. Anasayfa Hero görsel cache-bust mekanizmasının
   *  kaynağı: page.tsx > heroCacheKey > lib/hero.helpers.ts >
   *  withCacheBust. Admin save sonrası bu değer değişir → `?ts=` query
   *  param yenilenir → browser / CDN / Next/Image
   *  optimizer cache hepsi cache-miss eder. get_public_settings() RPC
   *  whitelist'inde mevcut (mig 051). */
  updated_at: string | null;
}

export interface PaymentMethodRow {
  id: string;
  name: string | null;
  type: string | null;
  is_active: boolean | null;
  created_at: string | null;
}

export interface PaymentAccountRow {
  id: string;
  payment_method_id: string | null;
  bank_name: string | null;
  account_holder: string | null;
  iban: string | null;
  currency: string | null;
  notes: string | null;
  created_at: string | null;
}

/* FAZ 53A — Stale shape (id/base/quote/fetched_at) düzeltildi.
   Gerçek DB ve mevcut /api/exchange-rates upsert payload pattern'i:
     code (PK, text), rate (numeric), updated_at (timestamptz)
   Davranışsal etki YOK: DB client `<Database>` generic'ine bağlı
   değildir — runtime sözleşmesi SQL tarafındadır. Bu type yalnız
   dokümantasyon + isteğe bağlı tip-aware service helper'ları için
   doğru shape'i bildirir. */
export interface ExchangeRateRow {
  code: string;
  rate: number;
  updated_at: string | null;
}

/* ===============================================================
   🛡️ FAQ (Faz 25) — Global Site Frequently Asked Questions
   ===============================================================
   public.faqs — site geneli (villa-bağımsız) SSS. Homepage'de
   accordion ile render edilir. Admin /maki-admin/faqs sayfasından
   yönetilir; replace-all save pattern (admin tek formla CRUD).
   =============================================================== */
export interface FaqRow {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_active: boolean | null;
  created_at: string | null;
}

/* ===============================================================
   🛡️ VILLA REVIEWS (Faz 33) — Guest reviews per villa
   ===============================================================
   public.villa_reviews — Login GEREKMEZ; guest yorumdur.
   Moderation: is_approved=false default → admin onayından sonra
   public villa detay sayfasında görünür.
   Featured: villa başına yalnız 1 featured review (DB partial
   unique index `(villa_id) WHERE is_featured` ile enforce).
   AggregateRating SEO: yalnız approved review'lardan hesaplanır.
   =============================================================== */
export interface VillaReviewRow {
  id: string;
  villa_id: string;
  /** Yorum sahibinin görünür adı (free text; trim normalize edilir). */
  guest_name: string;
  /** 1-5 (int). DB constraint: check (rating between 1 and 5). */
  rating: number;
  comment: string;
  /** Admin onayı; default false → public görünmez. */
  is_approved: boolean;
  /** Villa detay sayfasında "öne çıkan" yorum (1/villa). */
  is_featured: boolean;
  approved_at: string | null;
  created_at: string | null;
}

/* ===============================================================
   🛡️ SHARED FAVORITE LISTS (Faz 37) — Guest paylaşılabilir liste
   ===============================================================
   public.shared_favorite_lists — guest kullanıcının localStorage
   favori snapshot'ı; URL ile paylaşılabilir. IMMUTABLE; auth yok.
   Token: kısa ~12 hex char (URL-safe, unguessable).
   =============================================================== */
export interface SharedFavoriteListRow {
  id: string;
  token: string;
  villa_ids: string[];
  created_at: string;
  expires_at: string | null;
}

/* ===============================================================
   🛡️ OFFER REQUESTS (Faz 40) — Guest concierge teklif submissions
   ===============================================================
   public.offer_requests — /teklif-al sayfası submission'larını
   saklar. Admin /maki-admin/offer-requests'te status takibi.
   =============================================================== */
export type OfferRequestStatus =
  | "pending"
  | "contacted"
  | "offered"
  | "closed";

export interface OfferRequestRow {
  id: string;
  travel_group: string | null;
  start_date: string | null;
  end_date: string | null;
  adults: number | null;
  children: number | null;
  region_tokens: string[] | null;
  villa_type_tokens: string[] | null;
  feature_tokens: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  budget_currency: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  note: string | null;
  status: OfferRequestStatus;
  created_at: string;
  updated_at: string | null;
}

/* ===============================================================
   DATABASE — tablo/fonksiyon şemasının toplu tip haritası.
   =============================================================== */

export type Database = {
  public: {
    Tables: {
      villa: {
        Row: VillaRow;
        Insert: Partial<VillaRow> & { title: string };
        Update: Partial<VillaRow>;
      };
      villa_images: {
        Row: VillaImageRow;
        Insert: Partial<VillaImageRow> & { villa_id: string; image_url: string };
        Update: Partial<VillaImageRow>;
      };
      villa_locations: {
        Row: VillaLocationRow;
        Insert: Partial<VillaLocationRow> & { name: string };
        Update: Partial<VillaLocationRow>;
      };
      villa_types: {
        Row: VillaTypeRow;
        Insert: Partial<VillaTypeRow> & { name: string };
        Update: Partial<VillaTypeRow>;
      };
      villa_type_relations: {
        Row: VillaTypeRelationRow;
        Insert: VillaTypeRelationRow;
        Update: Partial<VillaTypeRelationRow>;
      };
      villa_features: {
        Row: VillaFeatureRow;
        Insert: Partial<VillaFeatureRow> & { name: string };
        Update: Partial<VillaFeatureRow>;
      };
      villa_feature_relations: {
        Row: VillaFeatureRelationRow;
        Insert: VillaFeatureRelationRow;
        Update: Partial<VillaFeatureRelationRow>;
      };
      villa_rules: {
        Row: VillaRuleRow;
        Insert: Partial<VillaRuleRow> & { name: string };
        Update: Partial<VillaRuleRow>;
      };
      villa_rule_relations: {
        Row: VillaRuleRelationRow;
        Insert: VillaRuleRelationRow;
        Update: Partial<VillaRuleRelationRow>;
      };
      price_include_items: {
        Row: PriceIncludeItemRow;
        Insert: Partial<PriceIncludeItemRow> & { name: string };
        Update: Partial<PriceIncludeItemRow>;
      };
      villa_price_include_relations: {
        Row: VillaPriceIncludeRelationRow;
        Insert: VillaPriceIncludeRelationRow;
        Update: Partial<VillaPriceIncludeRelationRow>;
      };
      villa_distances: {
        Row: VillaDistanceRow;
        Insert: Partial<VillaDistanceRow> & { villa_id: string };
        Update: Partial<VillaDistanceRow>;
      };
      villa_prices: {
        Row: VillaPriceRow;
        Insert: Partial<VillaPriceRow> & {
          villa_id: string;
          price: number;
          currency: string;
          start_date: string;
        };
        Update: Partial<VillaPriceRow>;
      };
      /* 🛡️ Migration 079 — villa_discounts (ADIM 1: veri modeli).
       *  villa_prices'ın yapısal ikizi; bkz. VillaDiscountRow yorumu. */
      villa_discounts: {
        Row: VillaDiscountRow;
        Insert: Partial<VillaDiscountRow> & {
          villa_id: string;
          start_date: string;
          end_date: string;
          discount_type: "percent" | "fixed";
          discount_value: number;
        };
        Update: Partial<VillaDiscountRow>;
      };
      reservations: {
        Row: ReservationRow;
        Insert: Partial<ReservationRow> & {
          villa_id: string;
          start_date: string;
          end_date: string;
          name: string;
          phone: string;
        };
        Update: Partial<ReservationRow>;
      };
      manual_reservations: {
        Row: ManualReservationRow;
        Insert: Partial<ManualReservationRow> & {
          villa_id: string;
          start_date: string;
          end_date: string;
        };
        Update: Partial<ManualReservationRow>;
      };
      pages: {
        Row: PageRow;
        Insert: Partial<PageRow> & { title: string; slug: string };
        Update: Partial<PageRow>;
      };
      menu: {
        Row: MenuRow;
        Insert: Partial<MenuRow>;
        Update: Partial<MenuRow>;
      };
      settings: {
        Row: SettingsRow;
        Insert: Partial<SettingsRow>;
        Update: Partial<SettingsRow>;
      };
      payment_methods: {
        Row: PaymentMethodRow;
        Insert: Partial<PaymentMethodRow>;
        Update: Partial<PaymentMethodRow>;
      };
      payment_accounts: {
        Row: PaymentAccountRow;
        Insert: Partial<PaymentAccountRow>;
        Update: Partial<PaymentAccountRow>;
      };
      exchange_rates: {
        Row: ExchangeRateRow;
        Insert: Partial<ExchangeRateRow> & {
          code: string;
          rate: number;
        };
        Update: Partial<ExchangeRateRow>;
      };
      faqs: {
        Row: FaqRow;
        Insert: Partial<FaqRow> & { question: string; answer: string };
        Update: Partial<FaqRow>;
      };
      villa_reviews: {
        Row: VillaReviewRow;
        Insert: Partial<VillaReviewRow> & {
          villa_id: string;
          guest_name: string;
          rating: number;
          comment: string;
        };
        Update: Partial<VillaReviewRow>;
      };
      shared_favorite_lists: {
        Row: SharedFavoriteListRow;
        Insert: Partial<SharedFavoriteListRow> & {
          token: string;
          villa_ids: string[];
        };
        Update: Partial<SharedFavoriteListRow>;
      };
      offer_requests: {
        Row: OfferRequestRow;
        Insert: Partial<OfferRequestRow> & {
          full_name: string;
          phone: string;
        };
        Update: Partial<OfferRequestRow>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      set_villa_sort_orders: {
        Args: { p_updates: Json };
        Returns: void;
      };
      replace_villa_type_relations: {
        Args: { p_villa_id: string; p_type_ids: string[] };
        Returns: void;
      };
      replace_villa_feature_relations: {
        Args: { p_villa_id: string; p_feature_ids: string[] };
        Returns: void;
      };
      /* 🛡️ FAZ 41 — replace_villa_distances RPC (db/migrations/002).
         DELETE+INSERT replace-all pattern; jsonb array kabul eder
         (title + distance). villa-distance.service.ts kullanır. */
      replace_villa_distances: {
        Args: { p_villa_id: string; p_distances: Json };
        Returns: void;
      };
      replace_villa_rule_relations: {
        Args: { p_villa_id: string; p_rule_ids: string[] };
        Returns: void;
      };
      replace_villa_price_include_relations: {
        Args: { p_villa_id: string; p_include_ids: string[] };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/* ---------- CONVENIENCE TYPE ALIASES ----------
   Service ve resolver dosyaları doğrudan bu alias'ları import
   edebilir; tablo isim drift'i tek noktada. */
export type Tables = Database["public"]["Tables"];
export type TableName = keyof Tables;
export type RowOf<T extends TableName> = Tables[T]["Row"];
export type InsertOf<T extends TableName> = Tables[T]["Insert"];
export type UpdateOf<T extends TableName> = Tables[T]["Update"];
