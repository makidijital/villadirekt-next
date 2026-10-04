/* ===============================================================
   🛡️ DICTIONARY TYPE — PHASE 2 (UI Translation Dictionary Core)
   ===============================================================
   Tek source-of-truth şema. TR/EN/DE dictionary'leri (tr.ts/en.ts/
   de.ts) bu tipe göre yazılır — eksik veya fazladan bir key varsa
   TypeScript derleme hatası verir (object literal + explicit type
   annotation → excess/missing property check).

   KAPSAM (bilinçli olarak dar): yalnız merkezi, tekrar eden ve
   birden çok component'te kullanılacak UI metinleri. Villa title/
   description gibi DB içeriği BURADA YOK (DB-çeviri, ayrı bir
   fazın konusu — bkz. audit raporu Bölüm D/N). Zaten onaylanmış/
   sabit ürün metinleri (örn. "Hemen Rezervasyon Yap", "Gecelik NNN₺
   indirimli") de BURADA YOK — bu fazda hiçbir component'e dokunulmadı,
   dolayısıyla o metinler şu an dictionary'den beslenmiyor.
   =============================================================== */

/* 🛡️ PHASE 10E — yatak/banyo tipi enum'larının TEK doğruluk kaynağı
   lib/villa-layout.helper.ts'tir (migration 047). BED_TYPES/BATHROOM_TYPES
   `as const` tanımlı olduğu için literal union'lar oradan TÜRETİLEBİLİYOR
   (distanceLabels'ta bu mümkün değildi — DISTANCE_OPTIONS `ReadonlyArray<string>`).
   Böylece aşağıdaki iki Record alanı derleme zamanında EKSİKSİZ olmak
   zorunda; enum'a yeni bir değer eklenirse tr/en/de.ts derleme hatası verir.
   `import type` → sıfır runtime etkisi, çevrim (circular import) riski yok
   (villa-layout.helper.ts hiçbir şey import etmiyor). */
import type { BedType, BathroomType } from "@/lib/villa-layout.helper";
/* 🛡️ PHASE 10E BATCH 5 — havuz tipi union'ı da tek canonical kaynaktan
   (lib/pool.helper.ts) türetilir; POOL_TYPE_KEYS `as const` olduğu için
   literal union elde edilir → tr/en/de.ts'te eksik key derleme hatası verir. */
import type { PoolTypeKey } from "@/lib/pool.helper";

/* ===============================================================
   🛡️ PHASE 10D — BATCH 4: CANONICAL DISTANCE TITLE UNION
   ===============================================================
   DB'deki 12 canonical mesafe title'ının (bkz. lib/distance.helper.ts
   → DISTANCE_OPTIONS/isCanonicalDistanceTitle) literal union'ı —
   YALNIZ aşağıdaki `distanceLabels` alanının exhaustiveness kontrolü
   için (tr.ts/en.ts/de.ts'te eksik/fazla key varsa derleme hatası).

   Tek runtime doğruluk kaynağı `lib/distance.helper.ts`'teki
   DISTANCE_OPTIONS'tır — bu union onunla SENKRON tutulmalı.
   DISTANCE_OPTIONS `ReadonlyArray<string>` (as const DEĞİL) olarak
   tanımlı olduğundan buradan otomatik türetilemiyor (literal daralması
   olmuyor); bu yüzden senkronizasyon runtime'da
   tests/unit/distance-label.helper.test.ts içinde doğrulanır.
   lib/distance.helper.ts Batch 4 kapsamında DEĞİŞTİRİLMEDİ. */
export type DistanceCanonicalTitle =
  | "Restoran"
  | "Market"
  | "Plaj"
  | "Deniz"
  | "Şehir Merkezi"
  | "Havaalanı (Antalya)"
  | "Havaalanı (Dalaman)"
  | "Otobüs Terminali"
  | "Sağlık Merkezi"
  | "Eczane"
  | "Benzin İstasyonu"
  | "Okul";

/** 1..12 — `home.months` sözlüğünün exhaustiveness anahtarı. */
export type MonthNumber =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type Dictionary = {
  common: {
    search: string;
    close: string;
    cancel: string;
    save: string;
    continue: string;
    back: string;
    next: string;
    previous: string;
    loading: string;
    /** 🛡️ Canlı arama sonuçları beklenirken (VillaSearchBox). */
    searching: string;
    /** 🛡️ Yatay carousel ok butonları (HorizontalCarousel varsayılanları). */
    carouselPrev: string;
    carouselNext: string;
    error: string;
    success: string;
    viewAll: string;
    /* 🛡️ PHASE 10B — MobileBookingCta.tsx */
    checkAvailability: string;
    perNight: string;
    /* 🛡️ PHASE 10C — TopBar dil değiştirici (aria-label/erişilebilirlik) */
    language: string;
  };
  header: {
    home: string;
    villas: string;
    regions: string;
    villaTypes: string;
    blog: string;
    contact: string;
    offer: string;
    favorites: string;
    support: string;
    menuOpen: string;
    menuClose: string;
    /** 🛡️ Logo `alt` metni. */
    logoAlt: string;
    /** `formatDictionaryString` — `{label}`. Alt menü aç/kapa aria-label. */
    submenuOpenAriaLabel: string;
    /** `formatDictionaryString` — `{label}`. */
    submenuCloseAriaLabel: string;
  };
  footer: {
    explore: string;
    villas: string;
    regions: string;
    allCategories: string;
    allRegions: string;
    exploreAllRegions: string;
    phone: string;
    email: string;
    address: string;
    checkReservation: string;
    legalLinks: {
      about: string;
      privacy: string;
      cancellation: string;
      cookies: string;
      distanceSales: string;
    };
    webDevelopment: string;
    /** 🛡️ Marka tanıtım paragrafı. */
    tagline: string;
    /** `formatDictionaryString` — `{year}`, `{site_name}`. Yalnız
     *  `settings.footer_copyright` BOŞSA kullanılan varsayılan. */
    copyrightFallback: string;
    ariaLabel: string;
    villaCategoriesAriaLabel: string;
    popularRegionsAriaLabel: string;
    corporateAriaLabel: string;
    tursabAlt: string;
    paymentMethodsAlt: string;
  };
  booking: {
    reservation: string;
    checkIn: string;
    checkOut: string;
    guests: string;
    accommodation: string;
    total: string;
    prepayment: string;
    remainingPayment: string;
    cleaningFee: string;
    poolHeating: string;
    discount: string;
    discountedTotal: string;
    nights: string;
    /* 🛡️ PHASE 10B — BookingSidebar/BookingSummary/BookingMinStayWarning/
       BookingCalendar/useBookingEngine/MobileBookingCta UI stringleri.
       Yukarıdaki 13 anahtar (Phase 2) DEĞİŞMEDİ — bunlar EKLEME. */
    sidebarEyebrow: string;
    sidebarTitle: string;
    /** Villa detay booking paneli ana başlığı ("Hızlı Rezervasyon"). */
    sidebarQuickTitle: string;
    sidebarSubtitle: string;
    checkInPillLabel: string;
    checkOutPillLabel: string;
    selectDatePlaceholder: string;
    guestsLabel: string;
    /** template: {adults}, {children} */
    guestsSummary: string;
    adultsLabel: string;
    childrenLabel: string;
    confirm: string;
    gapOverrideNotice: string;
    /** 🛡️ Seçilen aralıkta fiyatı tanımlı olmayan gece var →
     *  toplam hesaplanamaz. Yanlış/düşük fiyat göstermek yerine
     *  durum açıkça bildirilir. */
    priceUnavailableNotice: string;
    bookNow: string;
    feeAutoCalculated: string;
    installmentEyebrow: string;
    payNowPerk: string;
    payAtCheckinPerk: string;
    minStayWarningTitle: string;
    /** template: {n} */
    minStayWarningBody: string;
    /** template: {n} */
    minStayWarningSelected: string;
    /** template: {n} */
    accommodationAmountLabel: string;
    /* 🛡️ PHASE 10B — BookingSummary.tsx "Kısa Süreli Konaklama Ücreti"
       satırı. `booking.cleaningFee` ("Temizlik Ücreti") ile KASITLI
       olarak AYRI tutuldu — component'in bugünkü gerçek metni farklı;
       mevcut `cleaningFee` anahtarı/değeri DEĞİŞTİRİLMEDİ. */
    shortStayFeeLabel: string;
    poolHeatingFeeLabel: string;
    poolHeatingPerNightSuffix: string;
    /** template: {n} */
    poolHeatingNightsMultiplier: string;
    /** template: {rate} */
    prepaymentAmountLabel: string;
    dueAtCheckinLabel: string;
    depositLabel: string;
    depositNote: string;
    reservationErrorSelectDate: string;
    /** template: {n} */
    reservationErrorMinStay: string;
    /** template: {n} */
    reservationErrorOrphanGap: string;
    conflictError: string;
    calendarToday: string;
    mobileCtaAriaLabel: string;
    /* 🛡️ PHASE 10G — VillaCardBookingModal.tsx (villa detay "Benzer
       Villalar" kartlarından açılır). */
    perNightSuffix: string;
    dateLabel: string;
    modalEyebrow: string;
    modalAriaLabel: string;
    modalLoadingAriaLabel: string;
    modalLoading: string;
  };
  filters: {
    filter: string;
    date: string;
    guestCount: string;
    region: string;
    villaType: string;
    apply: string;
    clear: string;
  };
  /* 🛡️ PHASE 10B — AvailabilityInlineCalendar + BookingCalendar
     (legend/nav/hafta günleri) ortak anahtarları. */
  availability: {
    /** Pzt/Sal/Çar/Per/Cum/Cmt/Paz sırasıyla — 7 eleman sabit. */
    weekdayShort: readonly [
      string,
      string,
      string,
      string,
      string,
      string,
      string
    ];
    prevMonth: string;
    nextMonth: string;
    legendConfirmed: string;
    legendConfirmedTitle: string;
    legendPending: string;
    legendPendingTitle: string;
    legendAvailable: string;
    legendAvailableTitle: string;
  };
  /* 🛡️ PHASE 10B — Gallery.tsx UI stringleri. */
  gallery: {
    noImages: string;
    playVideo: string;
    /** template: {title} */
    playVideoAriaLabelWithTitle: string;
    playVideoAriaLabel: string;
    /** template: {count} */
    viewAllPhotos: string;
    /** template: {count} */
    viewAllPhotosAriaLabel: string;
    /** template: {title} */
    coverPhotoAlt: string;
    /** template: {title}, {index} */
    photoAlt: string;
    /** template: {title}, {index}, {total} */
    photoAltWithTotal: string;
    /** template: {index} */
    photoAriaLabel: string;
    /* 🛡️ PHASE 10G — VillaVideoModal.tsx */
    closeVideoAriaLabel: string;
    otherVideosAriaLabel: string;
    /* 🛡️ VillaVideoModal.tsx — modal dialog `aria-label`'ı ve YouTube
       iframe `title`'ı. `playVideoAriaLabel*` ile AYNI çift desen:
       villa adı varsa `…WithTitle`, yoksa düz varyant. */
    /** template: {title} */
    videoModalAriaLabelWithTitle: string;
    videoModalAriaLabel: string;
    /** template: {title} */
    videoFrameTitleWithTitle: string;
    videoFrameTitle: string;
  };
  /* 🛡️ PHASE 10B — PriceList.tsx UI stringleri. */
  price: {
    noPriceInfo: string;
    nightly: string;
    /** template: {percent} */
    discountedBadgeWithPercent: string;
    discountedBadge: string;
    infoAriaLabel: string;
    /** template: {n} */
    minNights: string;
    /** template: {amount} */
    damageDeposit: string;
  };
  /* 🛡️ PHASE 10B — EN/DE villa detail sayfası, TR page.tsx'in özel
     "Villa bulunamadı" bloğunun ve boş açıklama fallback'inin
     locale-aware karşılığı. */
  villa: {
    notFoundTitle: string;
    notFoundBody: string;
    notFoundCta: string;
    descriptionEmpty: string;
    /* 🛡️ PHASE 10G — TR villa detay sayfasının (kiralik-villa/[slug])
       BUGÜNKÜ hardcoded section metinleri. TR değerleri o dosyadaki
       literal'lerle BİREBİR aynıdır (byte-identical TR davranışı). */
    aboutTitle: string;
    seasonPricesTitle: string;
    calendarTitle: string;
    distancesEyebrow: string;
    distancesTitle: string;
    distancesSubtitle: string;
    distancesEmpty: string;
    featuresTitle: string;
    featuresEmpty: string;
    priceIncludesTitle: string;
    rulesTitle: string;
    detailPricingTitle: string;
    detailDistancesTitle: string;
    detailFeaturesTitle: string;
    detailPriceIncludesTitle: string;
    detailRulesTitle: string;
    checkInOutTitle: string;
    checkInLabel: string;
    checkOutLabel: string;
    similarVillasTitle: string;
    /* 🛡️ PHASE 10G — CollapsibleDescription.tsx */
    readMore: string;
    readLess: string;
    tourismCertificate: string;
    /** template: {n} */
    documentNumber: string;
  };
  /* 🛡️ PHASE 10D — BATCH 4: LocationStep canonical mesafe başlıklarının
     (yalnız TITLE — mesafe DEĞERİ "5 km"/"500 m" ASLA buraya girmez)
     EN/DE public karşılıkları. BİLİNÇLİ kapsam genişletmesi: bu
     dosyanın üst yorumu "DB içeriği BURADA YOK" der — ancak bu 12
     başlık serbest DB metni DEĞİL, sabit/canonical bir enum'dur
     (DISTANCE_OPTIONS). Batch 4 görev tanımının AÇIK talimatı üzerine
     eklendi. Key'ler DB'deki TR canonical title'ların KENDİSİ. Legacy/
     custom (canonical OLMAYAN) title'lar bu haritaya HİÇ girmez —
     getTranslatedDistanceLabel() (lib/distance-label.helper.ts) onları
     olduğu gibi döner, dictionary'de aranmaz. */
  distanceLabels: Record<DistanceCanonicalTitle, string>;
  /* 🛡️ PHASE 10E — Konaklama Düzeni (migration 047) ENUM etiketleri.
     distanceLabels ile AYNI gerekçe: bunlar serbest DB metni DEĞİL,
     kapalı küme enum'lardır. Oda/banyo ADLARI buraya GİRMEZ (villa
     bazlı serbest metin → villa_translations, migration 083). */
  bedTypeLabels: Record<BedType, string>;
  bathroomTypeLabels: Record<BathroomType, string>;
  /* 🛡️ PHASE 10E — AccommodationLayout component'inin UI metinleri.
     `{n}` şablonları formatDictionaryString() ile doldurulur
     (lib/i18n/format-dictionary-string.ts — mevcut desen).
     TR değerleri component'in BUGÜNKÜ hardcoded metinleriyle BİREBİR
     aynıdır (byte-identical TR davranışı). */
  accommodation: {
    sectionTitle: string;
    noDetail: string;
    /** template: {n} */
    bedroomFallback: string;
    /** template: {n} */
    bathroomFallback: string;
  };
  /* 🛡️ PHASE 10E BATCH 5 — havuz tipi etiketleri. bedTypeLabels ile AYNI
     gerekçe: kapalı küme canonical enum (serbest DB metni DEĞİL).
     Key'ler lib/pool.helper.ts'teki PoolTypeKey ile type-safe bağlı. */
  /* 🛡️ PHASE 10F — Konaklama düzeni ODA/BANYO ADLARI.
     Villa bazlı admin çevirisi KALDIRILDI; adlar artık yalnız bu
     sözlükten çözülür. Key'ler AccommodationLayoutStep'in sunduğu
     canonical TR adlardır (lib/villa-layout.helper.ts →
     BEDROOM_NAME_SUGGESTIONS) + numarasız temel biçimler.
     Numaralı adlar ("3. Yatak Odası") ayrıca desteklenir: mevcut
     `accommodation.bedroomFallback`/`bathroomFallback` şablonlarıyla
     üretilir — yeni şablon EKLENMEDİ.
     Sözlükte olmayan serbest adlar (örn. "Deniz Manzaralı Süit")
     olduğu gibi döner (doğal TR fallback). */
  roomNameLabels: Record<string, string>;
  poolTypeLabels: Record<PoolTypeKey, string>;
  /* 🛡️ PHASE 10E BATCH 5 — havuz bölümünün UI metinleri. TR değerleri
     kiralik-villa/[slug] sayfasının BUGÜNKÜ hardcoded metinleriyle
     BİREBİR aynıdır (byte-identical TR davranışı). */
  pool: {
    sectionTitle: string;
    width: string;
    length: string;
    depth: string;
    noDimensions: string;
  };
  /* 🛡️ PHASE 10G — VillaDetailTabs.tsx (sekme etiketleri + nav aria). */
  villaTabs: {
    navAriaLabel: string;
    prices: string;
    availability: string;
    location: string;
    features: string;
  };
  /* 🛡️ PHASE 10G — VillaMapModal.tsx. `embedLanguage` Google Maps embed
     URL'indeki `hl=` parametresidir (UI metni DEĞİL, dil kodu). */
  map: {
    openMap: string;
    directions: string;
    directionsUnavailableTitle: string;
    /** template: {title} */
    modalAriaLabel: string;
    modalAriaLabelFallback: string;
    closeAriaLabel: string;
    whereTitle: string;
    poweredByGoogle: string;
    noLocation: string;
    embedLanguage: string;
  };
  /* 🛡️ PHASE 10G — ShortStayFeeNotice.tsx. */
  shortStay: {
    /** template: {n} */
    ariaLabel: string;
    /** template: {n} */
    body: string;
    hint: string;
  };
  /* 🛡️ PHASE 10G — FavoriteButton.tsx. */
  favorites: {
    add: string;
    remove: string;
    saved: string;
    save: string;
    /** 🛡️ Header favori kısayolu (HeaderFavoritesLink). */
    myFavorites: string;
  };
  /* 🛡️ PHASE 10G — VillaReviewsSection.tsx. */
  reviews: {
    eyebrow: string;
    title: string;
    outOfFive: string;
    /** template: {n} */
    countLabel: string;
    empty: string;
    featuredAriaLabel: string;
    featuredBadge: string;
    formOpen: string;
    formClose: string;
    /** template: {value} */
    ratingAriaLabel: string;
    ratingPickerAriaLabel: string;
    /** template: {n} */
    starAriaLabel: string;
    formTitle: string;
    formSubtitle: string;
    nameLabel: string;
    namePlaceholder: string;
    ratingLabel: string;
    commentLabel: string;
    commentPlaceholder: string;
    /** template: {n} */
    minChars: string;
    successMessage: string;
    submitting: string;
    submit: string;
    /** 🛡️ Sunucu ham hata metni yerine gösterilen locale-aware mesaj
        (`reservation.form.errorGeneric` / `contact.form.errorGeneric`
        ile AYNI desen). */
    errorGeneric: string;
  };
  /* 🛡️ PHASE 10G — VillaCard.tsx (villa detay "Benzer Villalar" bölümü
     bu kartı EN/DE'de de render eder). TR değerleri component'in
     BUGÜNKÜ hardcoded metinleriyle BİREBİR aynıdır. */
  card: {
    villaAlt: string;
    imageComing: string;
    noLocation: string;
    priceOnRequest: string;
    startingFromUpper: string;
    startingFromLower: string;
    total: string;
    nightly: string;
    /** template: {n} */
    nights: string;
    cleaningIncluded: string;
    cleaningIncludedSuffix: string;
    /** template: {n} */
    reviewCount: string;
    /** template: {value}, {count} */
    ratingAriaLabel: string;
    availabilityCta: string;
    availabilityAriaLabel: string;
    bedroom: string;
    bathroom: string;
    person: string;
    /** template: {n} */
    guestsAriaLabel: string;
    /** template: {n} */
    bedroomsAriaLabel: string;
    /** template: {n} */
    bathroomsAriaLabel: string;
    /** template: {n} */
    guestsValue: string;
    /** template: {n} */
    bedroomsValue: string;
    /** template: {n} */
    bathroomsValue: string;
    /** template: {percent} */
    discountBadge: string;
    /** İndirimli kart köşe etiketi — üst satır (oran). template: {percent} */
    discountBadgeValue: string;
    /** İndirimli kart köşe etiketi — alt satır. */
    discountBadgeLabel: string;
    /** template: {percent} */
    discountBadgeAriaLabel: string;
    /** template: {amount} */
    nightlySavings: string;
    /** template: {amount} — /arama kartı: konaklama toplamındaki indirim. */
    totalSavings: string;
    bookNow: string;
    bookNowAriaLabel: string;
    /** İndirimli kart (discount variant) CTA metni. */
    discountRentNow: string;
    /** template: {n} */
    reserveNights: string;
    flexibleTitle: string;
    flexibleSubtitle: string;
    /* 🛡️ İndirim geçerlilik aralığı — `formatDiscountDateRange`
       çekirdeğinin üç dalı. Token'lar: {sDay} {sMonth} {sYear}
       {eDay} {eMonth} {eYear}. Ay adları `home.months`'tan gelir.
       TR değerleri `formatDiscountDateRangeTr` çıktısıyla BİREBİR. */
    /** template: {sDay}, {eDay}, {sMonth} — aynı ay + aynı yıl */
    discountValidSameMonth: string;
    /** template: {sDay}, {sMonth}, {eDay}, {eMonth} — aynı yıl */
    discountValidSameYear: string;
    /** template: {sDay}, {sMonth}, {sYear}, {eDay}, {eMonth}, {eYear} */
    discountValidFull: string;
  };
  /* ===============================================================
     🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — /blog ve /blog/[slug]
     ===============================================================
     Yazı BAŞLIĞI / ÖZETİ / GÖVDESİ ve SEO alanları DB'den gelir
     (`blog_post_translations`, migration 089) — burada YALNIZ statik
     UI metinleri vardır. TR değerleri sayfaların BUGÜNKÜ hardcoded
     metinleriyle BİREBİR aynıdır. `slug` ve `category` ÇEVRİLMEZ. */
  blog: {
    metaTitle: string;
    metaDescription: string;
    ogDescription: string;
    breadcrumbHome: string;
    breadcrumbBlog: string;
    eyebrow: string;
    heroTitle: string;
    heroDescription: string;
    listEmpty: string;
    /** Detay sayfası — yazı bulunamadığında metadata başlığı. */
    detailNotFoundTitle: string;
    /** Detay sayfası — gövde ve özet boşsa. */
    contentComing: string;
  };
  /* ===============================================================
     🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — /v/[token] (özel paylaşım linki)
     ===============================================================
     Off-market villa önizleme sayfası. `noindex`'tir ama EN/DE
     müşteriye de gönderilebildiği için görünen metinler dictionary'den
     gelir. Bölüm başlıkları MEVCUT `villa` / `pool` / `map` /
     `villaTabs` / `price` / `layout` anahtarlarından REUSE edilir;
     burada YALNIZ bu sayfaya ÖZGÜ metinler tutulur. TR değerleri
     sayfanın BUGÜNKÜ hardcoded metinleriyle BİREBİR aynıdır. */
  privateVilla: {
    metaInvalidTitle: string;
    metaTitleFallback: string;
    metaDescription: string;
    badge: string;
    badgeNote: string;
    detailsEyebrow: string;
    /** Havuz ölçü kartının alt açıklaması. */
    dimensionsCaption: string;
    priceIncludesEyebrow: string;
    rulesEyebrow: string;
    locationEyebrow: string;
    approximateLocation: string;
    openInGoogleMaps: string;
    tourismAuthority: string;
    documentNumberLabel: string;
  };
  /* ===============================================================
     🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — /liste/[token]
     ===============================================================
     Admin'in "Villa Listesi" ekranından ürettiği kısa token URL'i.
     Sayfa `noindex`'tir ama EN/DE müşteriye de gönderilebildiği için
     görünen metinler dictionary'den gelir. TR değerleri sayfanın
     BUGÜNKÜ hardcoded metinleriyle BİREBİR aynıdır. Liste başlığı ve
     notu ADMIN'İN GİRDİĞİ veridir → çevrilmez, aynen gösterilir. */
  sharedList: {
    eyebrow: string;
    titleFallback: string;
    /** Villa sayısının yanındaki birim. */
    villaUnit: string;
    /** template: {n} */
    guestsLabel: string;
    footerNote: string;
    footerCta: string;
    /** template: {n} */
    staleNotice: string;
  };
  /* ===============================================================
     🛡️ PHASE 11 — ANA SAYFA (homepage) UI METİNLERİ
     ===============================================================
     Yalnız STATİK UI metni. Admin'in girdiği içerik (hero_*,
     settings_translations) ve DB içeriği (villa adı, bölge adı,
     villa tipi adı, SSS soru/cevap) BURADA YOKTUR — onlar kendi
     çeviri kaynaklarından gelir.

     `hero.*` alanları ADMIN BOŞ BIRAKIRSA kullanılan varsayılanlardır
     (lib/hero.helpers.ts > HERO_DEFAULTS / HERO_CTA_DEFAULTS ile TR'de
     BİREBİR aynı değerler).
     =============================================================== */
  home: {
    hero: {
      badge: string;
      /** `\n` ile çok satırlı olabilir (Hero ilk satırı beyaz render eder). */
      title: string;
      subtitle: string;
      primaryCtaText: string;
      secondaryCtaText: string;
      /** Hero arka plan görselinin alt metni (başlık boşsa kullanılır). */
      imageAlt: string;
    };
    search: {
      dateLabel: string;
      datePlaceholder: string;
      typeLabel: string;
      villaType: string;
      /** template: {n} */
      typesSelected: string;
      regionLabel: string;
      allRegions: string;
      /** template: {n} */
      regionsSelected: string;
      guestsLabel: string;
      /** template: {n} — kişi sayısı dropdown seçenekleri (1..10) */
      guestsOption: string;
      optionsLoading: string;
      advanced: string;
      flexibleHint: string;
      /** 🛡️ ADDITIVE — "Gelişmiş Arama" villa özellikleri filtresi. */
      featuresLabel: string;
      /** template: {n} */
      featuresSelected: string;
      featuresEmpty: string;
      submit: string;
    };
    advantages: {
      sectionAriaLabel: string;
      priceTitle: string;
      priceDescription: string;
      easyTitle: string;
      easyDescription: string;
      secureTitle: string;
      secureDescription: string;
      /** Güvenli Rezervasyon kartındaki iptal koşulları linki. */
      cancellationLink: string;
    };
    discount: {
      title: string;
      carouselAriaLabel: string;
    };
    villaTypes: {
      sectionAriaLabel: string;
      title: string;
      subtitle: string;
      carouselAriaLabel: string;
      /** template: {count} */
      countBadge: string;
    };
    /** 🛡️ Ana sayfa "kategoriye göre villalar" — kategori kartları +
     *  seçili kategorinin ilk 8 villası (aynı sayfada, route değişmez). */
    categoryVillas: {
      sectionAriaLabel: string;
      title: string;
      tabsAriaLabel: string;
      /** template: {name} */
      resultsAriaLabel: string;
      empty: string;
      /** template: {name} */
      viewAll: string;
    };
    villas: {
      title: string;
      ctaAll: string;
      emptyEyebrow: string;
      emptyTitle: string;
      emptyBody: string;
    };
    regions: {
      sectionAriaLabel: string;
      title: string;
      subtitle: string;
      carouselAriaLabel: string;
      ctaAll: string;
    };
    shortGaps: {
      title: string;
      subtitle: string;
      carouselAriaLabel: string;
      /** template: {n} */
      nightsLabel: string;
      /** template: {count} */
      villaCount: string;
    };
    faq: {
      eyebrow: string;
      title: string;
      subtitle: string;
    };
    reviews: {
      sectionAriaLabel: string;
      eyebrow: string;
      title: string;
      subtitle: string;
      /** Uzun yorumu genişleten buton. */
      readMore: string;
      readLess: string;
      /** İsim rail'inin aria-label'ı. */
      navigationLabel: string;
      /** template: {name} — rail butonu aria-label'ı. */
      showReview: string;
    };
    /** Yatay kaydırmalı bölümlerin (HorizontalCarousel) ok butonları.
     *  Yalnız accessibility metni — görsel davranış DEĞİŞMEZ. */
    carousel: {
      previous: string;
      next: string;
    };
    seo: {
      /** WebSite JSON-LD `description` alanı. */
      websiteDescription: string;
    };
    /** Ay adları (1=Ocak … 12=Aralık). ShortGaps kart başlıkları.
     *  `lib/short-gaps.helpers.ts > MONTH_NAMES_TR` ile TR'de BİREBİR. */
    months: Record<MonthNumber, string>;
  };
  /* ===============================================================
     🛡️ PHASE 11 — PUBLIC LAYOUT KABUĞU (app/(public)/layout.tsx)
     ===============================================================
     BottomNav · SearchBottomSheet · VillaSearchBox · CookieConsent ·
     FloatingSocial metinleri.

     ⚠️ Bu componentler LAYOUT'tan render edilir; layout bir server
     component olduğu ve request locale'ini okuyamadığı için (Phase 7E)
     locale, Header/Footer ile AYNI şekilde client tarafında
     `usePathname()` + `localeFromPathname()` ile türetilir.

     REUSE (yeni key AÇILMADI): "Anasayfa" → `header.home`,
     "Telefon" → `footer.phone`, "Kapat" → `common.close`.
     =============================================================== */
  layout: {
    bottomNav: {
      ariaLabel: string;
      search: string;
      searchAriaLabel: string;
      /** ⚠️ `header.offer` ("Teklif Al") ile BİLEREK BİRLEŞTİRİLMEDİ —
       *  alt gezinmedeki mevcut TR metni "Öneri Al" (ürün kararı). */
      offer: string;
    };
    search: {
      sheetTitle: string;
      dialogAriaLabel: string;
      closeBackdropAriaLabel: string;
      /** `VillaSearchBox` varsayılan placeholder'ı. */
      placeholder: string;
      /** Bottom-sheet variant'ının daha uzun placeholder'ı. */
      sheetPlaceholder: string;
      emptyTitle: string;
      emptyBody: string;
      noResultsTitle: string;
      noResultsBody: string;
      noResultsCompactTitle: string;
      noResultsCompactBody: string;
    };
    cookie: {
      ariaLabel: string;
      message: string;
      details: string;
      accept: string;
    };
    floatingSocial: {
      ariaLabel: string;
      call: string;
      whatsapp: string;
    };
  };

  /* ===============================================================
     🛡️ PHASE 13 — PUBLIC ARAMA (/arama · /en/arama · /de/arama)
     ===============================================================
     `app/components/search/AramaPageBody.tsx` + `app/(public)/arama/
     FilterSidebar.tsx` içindeki KULLANICIYA GÖRÜNEN sabit metinler.

     KAPSAM DIŞI (bilinçli):
       • URL query parametreleri (`villa-turleri`, `bolgeler`, `start`,
         `end`, `guests`, `page`, `pageSize`, `sort`, `flexible`) ve
         legacy `categories`/`regions` — ÇEVRİLMEZ, URL kontratı sabit.
       • `lib/pagination.ts` (`PUBLIC_SORT_LABELS` dahil) — DOKUNULMADI;
         locale-aware etiketler aşağıdaki `sortOptions` üzerinden gelir,
         TR değerleri o dosyayla BİREBİR aynıdır.
       • Villa adı / bölge adı / tip adı — DB canonical, çevrilmez.

     Fallback: mevcut public i18n davranışı — `getDictionary(locale)`
     saf statik lookup; eksik key DERLEME HATASI (Dictionary exhaustive).
     Yeni provider/context/fallback mekanizması EKLENMEDİ. */
  search: {
    breadcrumbHome: string;
    breadcrumbVillas: string;
    heroEyebrow: string;
    /** Sayı AYRI `<span class="tabular-nums">` içinde kalır. */
    heroTitleFound: string;
    heroTitleIdleLead: string;
    heroTitleIdleAccent: string;
    /** Sayı AYRI span'de; bu yalnız takip eden metin. */
    heroFlexibleFound: string;
    /** `formatDictionaryString` — `{n}`. */
    pillRegions: string;
    /** `formatDictionaryString` — `{n}`. */
    pillTypes: string;
    /** `formatDictionaryString` — `{n}`. */
    pillGuests: string;
    errorEyebrow: string;
    errorTitle: string;
    errorBody: string;
    errorRetry: string;
    showAllVillas: string;
    emptyEyebrow: string;
    emptyTitleLead: string;
    emptyTitleAccent: string;
    emptyBody: string;
    emptyClearFilters: string;
    sortLabel: string;
    sortAriaLabel: string;
    /** `PublicSort` allow-list'inin locale-aware etiketleri.
     *  TR değerleri `lib/pagination.ts > PUBLIC_SORT_LABELS` ile BİREBİR. */
    sortOptions: {
      smart: string;
      priceAsc: string;
      priceDesc: string;
      capacityAsc: string;
      capacityDesc: string;
    };
    pageSizeLabel: string;
    pageSizeAriaLabel: string;
    paginationAriaLabel: string;
    paginationPrev: string;
    paginationNext: string;
    flexibleEyebrow: string;
    flexibleTitle: string;
    flexibleBody: string;
    /** Sayı AYRI span'de; bu yalnız takip eden metin. */
    flexibleCountSuffix: string;
    /** FilterSidebar (client island) — `/arama` ve `/kiralik-villalar`
     *  tarafından PAYLAŞILAN panel. */
    filters: {
      title: string;
      closeAriaLabel: string;
      dateLabel: string;
      dateSummaryEmpty: string;
      datePlaceholder: string;
      guestsLabel: string;
      /** `formatDictionaryString` — `{n}`. */
      guestsSummary: string;
      guestsCounterLabel: string;
      guestsCounterHint: string;
      /** Sayı AYRI span'de; bu yalnız takip eden metin. */
      guestsHint: string;
      regionLabel: string;
      regionAll: string;
      regionEmpty: string;
      /** `formatDictionaryString` — `{n}`. */
      selectedCount: string;
      /** `formatDictionaryString` — `{group}` (bölge adı ÇEVRİLMEZ). */
      regionGroupAll: string;
      typeLabel: string;
      typeAll: string;
      typeEmpty: string;
      /** 🛡️ ADDITIVE — sidebar "Villa Özellikleri" bölümü. */
      featuresLabel: string;
      featuresAll: string;
      featuresEmpty: string;
      advancedTitle: string;
      advancedCheckbox: string;
      advancedHint: string;
      reset: string;
      apply: string;
      applying: string;
      findVillas: string;
      /** `formatDictionaryString` — `{n}`. */
      showResults: string;
      mobileTriggerEyebrow: string;
      mobileTriggerLabel: string;
      /** 🛡️ Tarih aralığını sıfırlayan küçük "X" butonunun aria-label'ı. */
      clearDateAriaLabel: string;
      /** `formatDictionaryString` — `{label}`. */
      increaseAriaLabel: string;
      /** `formatDictionaryString` — `{label}`. */
      decreaseAriaLabel: string;
    };
  };

  /* ===============================================================
     🛡️ /rezervasyon/[slug] + /rezervasyon/basarili STATİK UI METİNLERİ
     ===============================================================
     `app/components/reservation/ReservationPageBody.tsx`,
     `ReservationForm.tsx`, `ReservationSuccessBody.tsx` ve
     `_helpers/validatePublicReservationForm.ts` içindeki hardcoded
     TR metinler.

     ⚠️ BİLİNÇLİ REUSE — burada TEKRARLANMADI (mevcut `booking`
     namespace'i BİREBİR aynı metinleri taşıyor):
       accommodation · nights · guests · accommodationAmountLabel ·
       discountedTotal · shortStayFeeLabel · poolHeatingFeeLabel ·
       total · dueAtCheckinLabel · prepaymentAmountLabel ·
       guestsSummary · reservation
     Ayrıca `search.breadcrumbHome` ve `villasArchive.breadcrumbCurrent`.

     ⚠️ KAPSAM DIŞI (bilinçli — VERİ, çevrilmez):
       villa adı (özel isim) · fiyatlar · para birimi biçimi ·
       tarih biçimi · ödeme yöntemi adı (`payment_methods.name`) ·
       ülke/şehir adları · referans numarası · WhatsApp bağlantısı. */
  reservation: {
    page: {
      breadcrumbCurrent: string;
      title: string;
      description: string;
      badgeEyebrow: string;
      badgeLine1: string;
      badgeLine2: string;
      badgeLine3: string;
      invalidUrl: string;
      notFoundEyebrow: string;
      notFoundTitle: string;
    };
    summary: {
      eyebrow: string;
      /** `formatDictionaryString` — `{n}`. */
      guestsCount: string;
      /** `formatDictionaryString` — `{n}`. */
      nightsCount: string;
      payNowAll: string;
    };
    form: {
      step1Eyebrow: string;
      step1Title: string;
      step1Subtitle: string;
      step2Eyebrow: string;
      step2Title: string;
      step2Subtitle: string;
      step3Eyebrow: string;
      step3Title: string;
      step3Subtitle: string;
      step4Eyebrow: string;
      step4Title: string;
      step4Subtitle: string;
      step5Eyebrow: string;
      step5Title: string;
      step5Subtitle: string;
      namePlaceholder: string;
      emailPlaceholder: string;
      phonePlaceholder: string;
      /** 🛡️ İki telefonlu iletişim bloğu etiketleri. */
      phoneLabel: string;
      phone2Label: string;
      phone2Placeholder: string;
      phoneCountryAriaLabel: string;
      identityPlaceholder: string;
      addressPlaceholder: string;
      notePlaceholder: string;
      countrySelect: string;
      citySelect: string;
      citySelectDisabled: string;
      totalGuestsLabel: string;
      /** `formatDictionaryString` — `{n}`. */
      guestsPersonCount: string;
      otherGuests: string;
      /** `formatDictionaryString` — `{n}`. */
      guestNamePlaceholder: string;
      noPaymentMethod: string;
      prepaymentOption: string;
      /** `formatDictionaryString` — `{rate}`. */
      prepaymentHint: string;
      fullPaymentOption: string;
      fullPaymentHint: string;
      submit: string;
      submitting: string;
      errorDismissAriaLabel: string;
      /** Sunucudan gelen HAM hata mesajı kullanıcıya BASILMAZ; bu
       *  generic metin gösterilir (locale dışı "Too many requests",
       *  TR server mesajları ve ham DB hatalarının UI'a sızmasını
       *  engeller). */
      errorGeneric: string;
      /** HTTP 409 — kullanıcı için anlamlı tek server durumu. */
      errorDatesUnavailable: string;
      /* 🛡️ SÖZLEŞME ONAYI — gönderim öncesi zorunlu checkbox.
         `termsLabel` ÜÇ placeholder içerir: `{cancellation}`,
         `{distanceSales}`, `{privacy}`. ReservationForm bu şablonu
         placeholder'lardan bölüp yerlerine `/p/...` link'lerini koyar
         (link hedefleri `localeHref` ile aktif locale'i taşır). */
      termsLabel: string;
      termsCancellationLink: string;
      termsDistanceSalesLink: string;
      termsPrivacyLink: string;
      /** Checkbox işaretlenmeden gönderim denenirse gösterilen hata. */
      termsRequired: string;
    };
    validation: {
      nameRequired: string;
      phoneRequired: string;
      phoneInvalid: string;
      /** 🛡️ İkinci telefon — YENİ public rezervasyonlarda zorunlu. */
      phone2Required: string;
      phone2Invalid: string;
      emailRequired: string;
      emailInvalid: string;
      identityRequired: string;
      identityInvalid: string;
      paymentMethodRequired: string;
      dateRequired: string;
    };
    success: {
      metaTitle: string;
      eyebrow: string;
      title: string;
      description: string;
      referenceLabel: string;
      referenceHint: string;
      whatsappCta: string;
      homeCta: string;
      villaCta: string;
    };
  };

  /* ===============================================================
     🛡️ /iletisim — PUBLIC İLETİŞİM SAYFASI STATİK UI METİNLERİ
     ===============================================================
     `app/components/contact/ContactPageBody.tsx` + `ContactForm.tsx`
     içindeki hardcoded TR metinler.

     ⚠️ KAPSAM DIŞI (bilinçli — VERİ, çevrilmez):
       telefon · e-posta · adres · WhatsApp bağlantısı · sosyal medya
       URL'leri ve handle'ları · marka adları (Instagram/Facebook/
       YouTube/TikTok/WhatsApp). Bunlar `settings` tablosundan gelir
       ve her dilde AYNI kalır.

     ⚠️ `business_hours` DEĞERİ buraya GİRMEZ — o admin'in girdiği
     dinamik bir metindir; çevirisi `settings_translations`
     (migration 087) + `resolveSettingsText` ile çözülür. Buradaki
     `info.businessHours` yalnız ETİKETtir.

     ⚠️ `faq` bloğu bu sayfaya ÖZEL 3 statik soru/cevaptır — anasayfadaki
     DB tabanlı SSS sistemiyle (`faqs` / `faq_translations`) İLGİSİ
     YOKTUR ve o sisteme bağlanmaz. */
  contact: {
    meta: {
      /** `formatDictionaryString` — `{brand}`. */
      title: string;
      description: string;
      /** `formatDictionaryString` — `{brand}`. */
      ogTitle: string;
      ogDescription: string;
    };
    hero: {
      eyebrow: string;
      title: string;
      description: string;
    };
    info: {
      /** "Doğrudan ulaşın" — iletişim kartları başlığı. */
      title: string;
      socialMedia: string;
      /* Kart ETİKETLERİ (değerler settings'ten gelir, çevrilmez). */
      phone: string;
      email: string;
      businessHours: string;
      location: string;
    };
    form: {
      eyebrow: string;
      title: string;
      description: string;
      nameLabel: string;
      namePlaceholder: string;
      phoneLabel: string;
      phonePlaceholder: string;
      emailLabel: string;
      emailPlaceholder: string;
      messageLabel: string;
      messagePlaceholder: string;
      submit: string;
      submitting: string;
      submitted: string;
      success: string;
      /** Sunucudan gelen HAM hata mesajı kullanıcıya BASILMAZ; bu
       *  generic metin gösterilir (locale dışı "Too many requests" /
       *  TR server mesajlarının UI'a sızmasını engeller). */
      errorGeneric: string;
      validation: {
        nameRequired: string;
        /** `formatDictionaryString` — `{n}`. */
        messageMinLength: string;
        phoneOrEmailRequired: string;
      };
      privacy: string;
    };
    map: {
      eyebrow: string;
      title: string;
      /** `<iframe title>` — ekran okuyucu için. */
      iframeTitle: string;
    };
    faq: {
      eyebrow: string;
      title: string;
      items: {
        responseTime: { question: string; answer: string };
        dates: { question: string; answer: string };
        customOffer: { question: string; answer: string };
      };
    };
    cta: {
      eyebrow: string;
      /** Başlık 2 satır: lead + (gri) accent — `<br />` ile ayrılır. */
      titleLead: string;
      titleAccent: string;
      description: string;
      button: string;
    };
  };

  /* ===============================================================
     🛡️ PUBLIC ARŞİV SAYFASI (/kiralik-villalar) STATİK UI METİNLERİ
     ===============================================================
     `app/components/search/KiralikVillalarPageBody.tsx` içindeki
     hardcoded TR arayüz metinleri (metadata, hero, boş koleksiyon
     durumu, "Hakkında" editorial bloğu, JSON-LD adları).

     ⚠️ BİLİNÇLİ REUSE — burada TEKRARLANMADI: sıralama (`search
     .sortLabel` / `sortAriaLabel` / `sortOptions`), sayfa boyutu
     (`search.pageSizeLabel` / `pageSizeAriaLabel`), pagination
     (`search.paginationAriaLabel` / `paginationPrev` /
     `paginationNext`) ve FilterSidebar (`search.filters`).
     Bu arayüz parçaları `/arama` ile BİREBİR AYNI component/metin
     olduğundan TR değerleri de birebir örtüşür; ikinci bir kopya
     üretmek çeviri kayması (drift) riski yaratırdı.

     ⚠️ Villa tipi / bölge ADLARI buraya GİRMEZ — onlar DB canonical
     (villa_type_translations / Phase 10I özel isim kuralı). */
  villasArchive: {
    /** `formatDictionaryString` — `{brand}`. */
    metaTitle: string;
    metaDescription: string;
    breadcrumbHome: string;
    breadcrumbCurrent: string;
    heroEyebrow: string;
    heroTitle: string;
    /** PageHero `stat.label` — sayı AYRI alanda. */
    heroStatLabel: string;
    /** JSON-LD CollectionPage `name`. */
    collectionName: string;
    /** JSON-LD CollectionPage `description`. */
    collectionDescription: string;
    emptyEyebrow: string;
    emptyTitle: string;
    emptyBody: string;
    aboutEyebrow: string;
    /** Başlık 2 satır: lead + (gri) accent — `<br />` ile ayrılır. */
    aboutTitleLead: string;
    aboutTitleAccent: string;
    aboutParagraph1: string;
    aboutParagraph2: string;
    /** 3. paragraf link etrafında 3 parçaya bölünür (lead + link + trail). */
    aboutParagraph3Lead: string;
    aboutParagraph3LinkLabel: string;
    aboutParagraph3Trail: string;
  };

  /* ===============================================================
     🛡️ SEO LANDING — /villa-turleri/[slug] + /bolgeler/[slug]
     ===============================================================
     Kategori ve bölge GRUBU giriş sayfalarının metin şablonları.
     Tüm şablonlar `formatDictionaryString` ile doldurulur:
       {name}  → kategori adı (locale çevirisi) / bölge grubu adı
       {brand} → settings.site_name
     Liste/sidebar/pagination metinleri `villasArchive` + `search`
     namespace'lerinden PAYLAŞILIR (ikinci kopya yok). */
  taxonomyLanding: {
    categoryMetaTitle: string;
    categoryMetaDescription: string;
    categoryHeroEyebrow: string;
    categoryHeroTitle: string;
    regionMetaTitle: string;
    regionMetaDescription: string;
    regionHeroEyebrow: string;
    regionHeroTitle: string;
  };

  /* ===============================================================
     🛡️ PHASE 12E — PUBLIC CMS SAYFASI (/p/[slug]) STATİK UI METİNLERİ
     ===============================================================
     `app/components/cms/CmsPageBody.tsx` içindeki hardcoded TR
     arayüz metinleri (breadcrumb, eyebrow, hero rozeti, boş içerik
     durumu). CMS'in ASIL içeriği (title/excerpt/body/seo_*) bu
     namespace'ten GELMEZ — o, `page_translations` tablosundan
     `resolvePageContent` ile çözülür (Phase 12D). Burada yalnız
     sabit arayüz etiketleri vardır.

     Fallback: mevcut public i18n davranışı — `getDictionary(locale)`
     saf statik lookup, eksik key DERLEME HATASI (Dictionary tipi
     exhaustive). Yeni bir fallback mekanizması EKLENMEDİ. */
  cms: {
    /** Breadcrumb'ın ilk halkası. ⚠️ `header.home` ("Anasayfa") ile
     *  BİLEREK BİRLEŞTİRİLMEDİ — CMS sayfasındaki mevcut TR metin
     *  "Ana sayfa" (ayrı yazım); birleştirmek TR çıktısını bozardı. */
    breadcrumbHome: string;
    /** Editorial (cover'lı) hero'nun üst eyebrow'u. */
    eyebrowContent: string;
    /** Kurumsal/yasal sayfaların PageHero eyebrow'u. */
    eyebrowCorporate: string;
    /** SSS sayfalarının rozet eyebrow'u. */
    badgeHelpEyebrow: string;
    /** SSS sayfalarının rozet satırı. */
    badgeFaq: string;
    /** Politika/şart sayfalarının rozet satırı. */
    badgePolicy: string;
    /** Başlık boşsa kullanılan yedek başlık. */
    fallbackTitle: string;
    /** Ne section ne body varsa gösterilen boş durum metni. */
    contentComingSoon: string;
    /** Sayfa bulunamadığında `generateMetadata`'nın döndüğü başlık.
     *  TR değeri ESKİ hardcoded metinle BİREBİR. */
    notFoundMetaTitle: string;
  };

  /* ===============================================================
     🛡️ PHASE 12 — MAKI ADMIN / PAGES (Seçenek A: locale kaynağı YOK)
     ===============================================================
     Admin panelinin İLK i18n namespace'i. Bu fazda admin tarafında
     locale KAYNAĞI EKLENMEDİ (cookie / localStorage / middleware /
     DB alanı YOK) — call-site'lar bilinçli olarak
     `getDictionary(DEFAULT_LOCALE)` çağırır. Yani render çıktısı TR
     ve Phase 12 öncesiyle BYTE-IDENTICAL'dir.

     EN/DE değerleri burada HAZIR ve `Dictionary` exhaustiveness'i
     ile compile-time kilitlidir; ileride tek bir admin locale
     kaynağı bağlandığında call-site'larda yalnız `DEFAULT_LOCALE`
     argümanı değişir (yeni mekanizma gerekmez).

     `common.*` (public namespace) BİLEREK kirletilmedi. Tek yeniden
     kullanım `common.save` ("Kaydet" — admin metniyle birebir aynı).
     `common.loading` ("Yükleniyor") admin'deki "Yükleniyor…"
     varyantıyla BYTE-IDENTICAL DEĞİL → `admin.common.loadingEllipsis`
     AYRI key olarak tutuldu (public TR regresyonu riski sıfır). */
  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — /teklif-al (concierge teklif formu).
     TR değerleri `app/(public)/teklif-al/page.tsx` + `OfferRequestForm.tsx`
     içindeki ESKİ hardcoded metinlerin BİREBİR kopyasıdır.
     ⚠️ KAPSAM DIŞI (VERİ, çevrilmez): taxonomy seçenek adları
     (bölge/villa tipi/özellik — kendi çeviri sistemleri var), para birimi
     kodları, telefon/e-posta placeholder formatları. */
  offer: {
    metaTitle: string;
    metaDescription: string;
    heroEyebrow: string;
    heroTitle: string;
    heroDescription: string;
    trust1Title: string;
    trust1Description: string;
    trust2Title: string;
    trust2Description: string;
    trust3Title: string;
    trust3Description: string;
    groupHoneymoon: string;
    groupHoneymoonDescription: string;
    groupCoreFamily: string;
    groupCoreFamilyDescription: string;
    groupExtendedFamily: string;
    groupExtendedFamilyDescription: string;
    groupFriends: string;
    groupFriendsDescription: string;
    step1Title: string;
    step1Subtitle: string;
    travelGroupAriaLabel: string;
    step2Title: string;
    step2Subtitle: string;
    dateRangeLabel: string;
    datePlaceholder: string;
    adultsLabel: string;
    childrenLabel: string;
    /** `formatDictionaryString` — `{label}`. */
    stepperDecreaseAriaLabel: string;
    /** `formatDictionaryString` — `{label}`. */
    stepperIncreaseAriaLabel: string;
    step3Title: string;
    step3Subtitle: string;
    regionsLabel: string;
    regionsEmpty: string;
    villaTypesLabel: string;
    villaTypesEmpty: string;
    featuresLabel: string;
    featuresEmpty: string;
    budgetLabel: string;
    budgetMin: string;
    budgetMax: string;
    currencyLabel: string;
    step4Title: string;
    step4Subtitle: string;
    fullNameLabel: string;
    fullNamePlaceholder: string;
    phoneLabel: string;
    emailLabel: string;
    emailPlaceholder: string;
    noteLabel: string;
    notePlaceholder: string;
    privacyNote: string;
    submit: string;
    submitting: string;
    errorGeneric: string;
    successTitle: string;
    successBody: string;
  };

  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — /rezervasyon-kontrol.
     TR değerleri `page.tsx` + `ReservationLookup.tsx` +
     `ReservationShareView.tsx` içindeki ESKİ hardcoded metinlerin BİREBİR
     kopyasıdır. ⚠️ KAPSAM DIŞI (VERİ): villa adı, rezervasyon kodu,
     tutarlar, tarih biçimi, telefon/e-posta değerleri. */
  reservationLookup: {
    metaTitle: string;
    metaDescription: string;
    ogDescription: string;
    breadcrumbCurrent: string;
    heroEyebrow: string;
    heroTitle: string;
    heroDescription: string;
    heroTitleShare: string;
    heroDescriptionShare: string;
    cancelledTitle: string;
    cancelledBody: string;
    invalidTitle: string;
    invalidBody: string;
    formEyebrow: string;
    formTitle: string;
    codeLabel: string;
    codePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    submit: string;
    submitting: string;
    formHint: string;
    errorMissingFields: string;
    errorNotFound: string;
    errorNetwork: string;
    emptyTitle: string;
    emptyBody: string;
    statusPendingLabel: string;
    statusPendingMessage: string;
    statusConfirmedLabel: string;
    statusConfirmedMessage: string;
    statusPrepaymentLabel: string;
    statusPrepaymentMessage: string;
    statusCancelledLabel: string;
    statusCancelledMessage: string;
    detailVilla: string;
    detailCode: string;
    detailCheckIn: string;
    detailCheckOut: string;
    detailGuests: string;
    /** `formatDictionaryString` — `{n}`. */
    detailGuestsValue: string;
    shareTitle: string;
    shareSubtitle: string;
    shareReservationNo: string;
    /** `formatDictionaryString` — `{n}`. */
    shareNights: string;
    /** `formatDictionaryString` — `{n}`. */
    shareGuests: string;
    shareIncludedInPrice: string;
    shareStayHeading: string;
    shareCheckIn: string;
    shareCheckOut: string;
    sharePaymentHeading: string;
    shareTotal: string;
    sharePaid: string;
    shareCleaningFee: string;
    sharePoolHeatingFee: string;
    shareRemaining: string;
    shareDeposit: string;
    shareDepositNote: string;
    shareOwnerHeading: string;
    shareOwnerEmpty: string;
    shareGuestHeading: string;
    shareGuestName: string;
    shareGuestPhone: string;
    shareGuestEmail: string;
    shareContactNote: string;
    shareWhatsappCta: string;
    sharePhoneCta: string;
    shareWhatsappAriaLabel: string;
    sharePhoneAriaLabel: string;
    shareLookupAgain: string;
  };

  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — /favoriler ve /favoriler/paylas/[token].
     Mevcut `favorites` namespace'i (kalp butonu etiketleri) DEĞİŞTİRİLMEDİ;
     bunlar SAYFA metinleridir. */
  favoritesPage: {
    metaTitle: string;
    metaDescription: string;
    heroEyebrow: string;
    heroTitle: string;
    heroDescription: string;
    /** Araç çubuğu: "<n> villa koleksiyonunuzda" sonek metni. */
    countSuffix: string;
    shareError: string;
    emptyTitle: string;
    emptyBody: string;
    emptyExploreCta: string;
    emptySearchCta: string;
    unavailableTitle: string;
    unavailableBody: string;
    unavailableExploreCta: string;
    unavailableClearCta: string;
    shareAriaLabel: string;
    shareCta: string;
    sharePreparing: string;
    clearAriaLabel: string;
    clearCta: string;
    clearConfirm: string;
    shareCopied: string;
    shareReady: string;
    sharePreview: string;
    sharedMetaInvalidTitle: string;
    sharedMetaTitle: string;
    sharedMetaDescription: string;
    sharedEyebrow: string;
    sharedBadge: string;
    sharedTitle: string;
    /** Başlığın ikinci satırı (vurgu rengi). */
    sharedTitleAccent: string;
    sharedVillaUnit: string;
    sharedBody: string;
    /** `formatDictionaryString` — `{date}`. */
    sharedCreatedAt: string;
    /** `formatDictionaryString` — `{visible}`, `{total}`. */
    sharedVisibleCount: string;
    sharedEmptyTitle: string;
    sharedEmptyBody: string;
    sharedCtaTitle: string;
    sharedCtaBody: string;
    sharedExploreCta: string;
    sharedFavoritesCta: string;
  };

  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — /kisa-sureli-tarihler/[ay]/[gece].
     Mevcut `shortStay` namespace'i (villa detay rozeti) DEĞİŞTİRİLMEDİ. */
  shortGaps: {
    /** `formatDictionaryString` — `{month}`, `{n}`. */
    metaTitle: string;
    /** `formatDictionaryString` — `{month}`, `{n}`. */
    metaDescription: string;
    heroEyebrow: string;
    /** `formatDictionaryString` — `{month}`, `{n}`. */
    heroTitle: string;
    /** `formatDictionaryString` — `{n}`, `{count}`. */
    heroSubtitle: string;
    emptyBody: string;
    /* 🛡️ Filtre paneli metinlerinin ÇOĞU `search.filters`'tan REUSE
       edilir (GapFilterSidebar, /arama FilterSidebar'ın replikasıdır).
       Burada YALNIZ o namespace'te karşılığı OLMAYAN metinler var. */
    filterTitle: string;
    filterSubtitle: string;
    filterApplyCta: string;
    /** `formatDictionaryString` — `{n}`. */
    showResults: string;
    mobileTrigger: string;
    mobileSummaryPlaceholder: string;
    filtersAriaLabel: string;
  };

  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — global 404 (app/not-found.tsx). */
  notFound: {
    metaTitle: string;
    metaDescription: string;
    title: string;
    body: string;
    homeCta: string;
    villasCta: string;
    suggestionsEyebrow: string;
    suggestionsTitle: string;
  };

  /* 🛡️ PUBLIC ÇOKLU DİL TAMAMLAMA — bakım ekranı ((public)/layout.tsx).
     ⚠️ `settings.maintenance_message` CANONICAL kalır (migration 084 kararı
     DEĞİŞMEDİ) — yalnız admin mesaj GİRMEDİĞİNDE gösterilen varsayılan
     metin ve "Bakım" etiketi locale-aware olur. */
  maintenance: {
    eyebrow: string;
    defaultMessage: string;
  };

  admin: {
    /** Admin genelinde tekrar eden mikro metinler. Phase 13+'te
     *  `admin.blog` / `admin.villas` eklendiğinde yeniden kullanılır. */
    common: {
      /** ⚠️ `common.loading` ("Yükleniyor") DEĞİL — admin varyantı
       *  U+2026 ellipsis içerir. */
      loadingEllipsis: string;
      saving: string;
      deleting: string;
      delete: string;
      edit: string;
      moveUp: string;
      moveDown: string;
      networkError: string;
      requestFailed: string;
      updateFailed: string;
      saveFailed: string;
      unknownError: string;
      unknownErrorCheckNetwork: string;
      networkOrRuntimeError: string;
      /** `formatDictionaryString` — `{hint}` parametreli. */
      hintPrefix: string;
    };
    pages: {
      list: {
        eyebrow: string;
        title: string;
        subtitle: string;
        newPageCta: string;
        emptyTitle: string;
        emptyDescription: string;
        view: string;
        inMenu: string;
        addToMenu: string;
        removeFromMenu: string;
        addToTopMenu: string;
      };
      form: {
        newTitle: string;
        newSubtitle: string;
        editTitle: string;
        editSubtitle: string;
        viewPage: string;
        backToList: string;
        fieldTitle: string;
        titlePlaceholder: string;
        fieldSlug: string;
        slugPlaceholder: string;
        /** `formatDictionaryString` — `{url}` parametreli. */
        slugChangedWarning: string;
        fieldExcerpt: string;
        excerptPlaceholder: string;
        fieldCover: string;
        slugRequiredFirst: string;
        uploadOrReplaceImage: string;
        removeCover: string;
        coverHint: string;
        fieldBody: string;
        bodyPlaceholder: string;
        bodyHint: string;
        editBodyHint: string;
        seoHeading: string;
        seoTitleLabel: string;
        seoDescriptionLabel: string;
        noindexLabel: string;
        showInMenuLabel: string;
      };
      sections: {
        label: string;
        typeRichtext: string;
        typeImage: string;
        typeQuote: string;
        empty: string;
        richtextPlaceholder: string;
        imageHint: string;
        altTextPlaceholder: string;
        quoteTextPlaceholder: string;
        quoteAuthorPlaceholder: string;
      };
      publish: {
        heading: string;
        published: string;
        draft: string;
        publishTitle: string;
        unpublishTitle: string;
        /** `formatDictionaryString` — `{url}` parametreli. */
        hint: string;
        showInTopMenu: string;
        /** `formatDictionaryString` — `{url}` parametreli. */
        showInMenuHint: string;
      };
      toast: {
        listFailed: string;
        publishFailed: string;
        published: string;
        drafted: string;
        deleteFailed: string;
        deleted: string;
        menuAdded: string;
        menuRemoved: string;
        imageUploadFailed: string;
        coverUploaded: string;
        imageAdded: string;
        titleSlugRequired: string;
        saveFailed: string;
        saveFailedRuntime: string;
        created: string;
        loadFailed: string;
        updated: string;
      };
      confirm: {
        deleteTitle: string;
        deleteDescription: string;
        deleteLabel: string;
      };
      notFound: {
        title: string;
        description: string;
      };
    };
  };
};
