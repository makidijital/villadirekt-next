"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  MapPin,
  BedDouble,
  Bath,
  Users,
  ArrowUpRight,
  Star,
  CalendarRange,
  Sparkles,
} from "lucide-react";

import { convertPrice, formatCurrency } from "@/lib/currency";
import { useCurrency } from "@/app/context/CurrencyContext";
import {
  calculateNights,
  calculateGrandTotal,
  /* 🛡️ SALT-OKUNUR KARŞILAŞTIRMA — "indirim uygulanmasaydı toplam ne
     olurdu" sorusunun cevabı için motorun ZATEN export ettiği pure
     fonksiyon. Villa detaydaki `useBookingEngine` (satır ~797) ile
     BİREBİR AYNI desen; yeni formül/motor YOK. */
  calculateStayTotal,
  applyDiscountToDailyPrice,
  type DiscountRange,
} from "@/lib/price.engine";
import type { MonthNumber } from "@/lib/i18n/dictionaries/types";
import {
  formatDiscountDateRange,
  formatLocalDate,
  parseLocalDate,
} from "@/lib/date-format";
/* 🛡️ Seçilen tarih aralığı etiketi — Hero/arama panelinin KULLANDIĞI
   pure helper'ın AYNISI ("8 Eki – 11 Eki"). Yeni tarih formatlama
   sistemi YAZILMADI; locale etiketi (LOCALE_BCP47) helper içinde. */
import { buildHeroDateLabel } from "@/app/components/ui/hero/_helpers/date-label";
/* 🛡️ PHASE 10G — locale-aware kart metinleri + locale-prefixed detay
   linki. `locale` OPSİYONEL, default "tr" → TR çıktısı (metin + href)
   BİREBİR AYNI. Fiyat/indirim/availability mantığı DEĞİŞMEDİ. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
import type { Locale } from "@/lib/i18n/config";
/* 🛡️ FAZ 36 — Guest favorites button. localStorage-only;
   no DB / no API / no server action / no auth. */
import FavoriteButton from "@/app/components/favorites/FavoriteButton";
/* Tip-only import → bundle'a modal kodunu SOKMAZ (7C lazy yükleme). */
import type BookingModalComponent from "./VillaCardBookingModal";

/* ===============================================================
   🛡️ VillaCardBookingModal — LAZY import (Aşama 7C: GERÇEK lazy)
   ===============================================================
   Önceki durum: `next/dynamic(ssr:false)` + modal `isOpen={false}` ile
   HER kartta render ediliyordu → modal chunk'ı (+ BookingCalendar,
   react-day-picker, date-fns, RDP CSS) hydration'dan hemen sonra,
   kullanıcı hiç tıklamadan indiriliyordu; SSR HTML'e de her kart için
   boş bir BAILOUT_TO_CLIENT_SIDE_RENDERING <template> yazılıyordu.

   Şimdi: modal modülü yalnız açılış niyetinde (fare üstüne gelme /
   basma / klavye odağı / tıklama) `import()` ile yüklenir ve modal
   YALNIZ `isBookingOpen && modül hazır` iken mount edilir. Suspense/
   next/dynamic kullanılmaz → React'in Suspense yeniden-deneme
   gecikmesi (fallback throttle) yok; modül hazır olduğu an açılır.
   Modal kapalıyken zaten `null` döndürüyor ve her açılışta içeriğini
   sıfırdan kuruyordu (apiData reset + ModalContent yeniden mount) →
   kapanma/yeniden açılma davranışı AYNI kalır. Aynı useBookingEngine
   + child component'leri kullanır (BookingSidebar ile TEK
   source-of-truth).
   =============================================================== */
type LazyBookingModalType = typeof BookingModalComponent;
let bookingModalPromise: Promise<LazyBookingModalType> | null = null;
let loadedBookingModal: LazyBookingModalType | null = null;
function loadVillaCardBookingModal(): Promise<LazyBookingModalType> {
  if (!bookingModalPromise) {
    bookingModalPromise = import("./VillaCardBookingModal").then(
      (mod) => {
        loadedBookingModal = mod.default;
        return mod.default;
      },
      (err: unknown) => {
        /* Hata → promise sıfırlanır; sonraki niyet/tıklama yeniden dener. */
        bookingModalPromise = null;
        throw err;
      }
    );
  }
  return bookingModalPromise;
}
function preloadVillaCardBookingModal() {
  loadVillaCardBookingModal().catch(() => {
    /* Önyükleme başarısızsa sessiz geç; tıklama yeniden dener. */
  });
}

type StayPrice = {
  price: number;
  currency: string;
  start_date: string;
  end_date: string;
};

type Props = {
  /* 🛡️ FAZ 36 — villa.id (favorites identity).
     Eski caller'lar `id` geçmezse favorite buton render edilmez
     (defansif). Yeni caller'lar id'yi VillaDTO'dan geçer. */
  id?: string;
  slug: string;
  title: string;
  location: string;
  price?: number;
  currency?: string;
  images?: string[];
  badge?: string;
  bedrooms?: number;
  bathrooms?: number;
  guests?: number;
  /* 🛡️ DATE-SCOPED STAY PRICING — opsiyonel.
     Kullanıcı /arama'ya start+end ile geldiyse caller bu üçlüyü
     birlikte geçer; VillaCard mevcut pricing engine
     (lib/price.engine > calculateGrandTotal) ile aynı semantic'te
     toplam fiyat üretir (stay + cleaning_fee).
     VillaDetail/BookingSidebar/reservation create ile byte-identical
     hesap. Tarih yoksa eski "gecelik" davranış aynen devam eder. */
  stayStart?: string;
  stayEnd?: string;
  prices?: StayPrice[];
  /* 🛡️ OPSİYONEL — seçilen tarih aralığındaki aktif indirimler
     (villa_discounts). `prices` ile BİRLİKTE geçilir; AŞAĞIDAKİ
     MEVCUT `calculateGrandTotal` çağrısının ZATEN var olan opsiyonel
     `discounts` parametresine olduğu gibi iletilir — fiyat motoru,
     indirim mantığı ve currency/tarih hesabı DEĞİŞMEDİ. Verilmezse
     (undefined) motorun `discounts = null` default'u devreye girer →
     bu prop'u geçmeyen TÜM mevcut çağrı yerlerinde davranış BİREBİR
     aynı kalır. `discount` (tekil) prop'u ile KARIŞTIRILMAMALI: o
     yalnız "discount" variant'ının gecelik gösterimi içindir. */
  stayDiscounts?: DiscountRange[];
  /** Temizlik ücreti (orijinal currency). calculateGrandTotal kendi
   *  cleaning_limit kuralını uygular (nights >= limit ise muaf). */
  cleaningFee?: number;
  cleaningCurrency?: string;
  cleaningLimit?: number;
  /* 🛡️ FAZ 35 — REVIEW TRUST META (Airbnb / boutique hotel feel).
     Caller approved-only stats geçer; villa başına 1 tek meta satır.
     Eski caller'lar undefined geçerse hiçbir şey render edilmez —
     conditional, eski layout AYNEN korunur, layout shift YOK.
       reviewAverage: 1..5 (1 ondalık)
       reviewCount  : tamsayı; 0 ise hiç render etme (fake 5.0 yok). */
  reviewAverage?: number;
  reviewCount?: number;
  /* 🛡️ DISPLAY VARIANT — caller surface'ine göre layout density.
     "default" (eski + public davranış): editorial büyük kart,
       FavoriteButton + booking trigger + zengin tipografi.
     "curation" (admin Villa Listesi): compact taranabilir kart,
       FavoriteButton + booking trigger HIDE, küçük spacing/tipografi,
       daha sıkı image aspect. Logic (pricing/data/image selection)
       AYNEN — sadece presentation katmanı koşullu. */
  variant?: "default" | "curation" | "discount";
  /* 🛡️ OPSİYONEL — "Müsaitlik / Tarih Seç" butonunun HEMEN ALTINA gap
     bilgi alanı (açık yeşil) + tam genişlik "Hemen Rezervasyon Yap" CTA
     için VERİ. Verilmezse HİÇBİR ŞEY render edilmez → /arama, homepage ve
     diğer VillaCard kullanımları AYNEN korunur. CTA bir <button>'dır
     (kart Link'i içinde nested <a> olmaması için) → onClick router.push +
     stopPropagation (kartın detay navigasyonu tetiklenmez). */
  reserveInfo?: { label: string; nights: number; href: string };
  /** 🛡️ ADDITIVE — /arama "esnek" EK sonuç işareti. true ise fiyat
   *  GÖSTERİLMEZ (villa ana tarihte müsait değil); yerine "Esnek Tarih
   *  Fırsatı · ±3 gün içinde müsait" premium etiketi. Ana tarih/fiyat/
   *  href akışı DEĞİŞMEZ (yalnız bu kartın fiyat sunumu). Default false
   *  → mevcut kartlar birebir aynı. Yalnız default (public) variant. */
  isFlexible?: boolean;
  /* 🛡️ AKTİF İNDİRİM (yalnız "discount" variant tüketir) — ham
     villa_discounts kaydı (lib/cache.helpers > getCachedDiscountCollectionVillas
     tarafından price.engine > getActiveDiscount ile ÖNCEDEN seçilmiş,
     "bugün start_date..end_date arasında" tek kayıt). Nihai indirimli
     fiyat (currency-aware) burada, client tarafında (useCurrency rates
     ile) price.engine > applyDiscountToDailyPrice reuse edilerek
     hesaplanır — yeni bir fiyat hesaplama mantığı YOK. Verilmezse
     (undefined/null) davranış ESKİSİYLE aynı (indirim gösterimi yok). */
  discount?: {
    start_date: string;
    end_date: string;
    discount_type: "percent" | "fixed";
    discount_value: number;
    currency: string | null;
  } | null;
  /* 🛡️ İndirim penceresinin TAMAMI müsait mi? (server-side hesaplanır:
     lib/cache.helpers > getCachedDiscountCollectionVillas → toplu
     get_blocked_villa_ids RPC). YALNIZ "Hemen Rezervasyon Yap" CTA'sının
     HEDEF URL'ini etkiler; fiyat/indirim/tasarım/diğer variant'lar
     ETKİLENMEZ. `undefined` (prop verilmemiş) → kontrol uygulanmamış →
     MEVCUT davranış (geriye dönük uyumlu). */
  discountAvailable?: boolean;
  /** 🛡️ PHASE 10G — opsiyonel; verilmezse "tr" (eski davranış).
   *  Kart metinlerini ve detay linkinin locale prefix'ini belirler. */
  locale?: Locale;
  /** 🛡️ OPSİYONEL — yalnız "default" variant kart görselinin `sizes`
   *  değeri. Verilmezse mevcut değer AYNEN kullanılır → prop geçmeyen
   *  tüm çağrı noktaları (arama, ana sayfa, favoriler, …) birebir aynı.
   *  Görsel kaynağı/kalite/boyut/CSS'e etkisi YOK; yalnız tarayıcının
   *  srcset'ten seçeceği genişliği belirler. */
  sizes?: string;
  /** 🛡️ OPSİYONEL — liste sayfalarında yalnız İLK kart (olası LCP
   *  görseli) için. true → görsel `loading="eager"` + `fetchPriority="high"`
   *  (Next 16'da deprecated `priority` yerine önerilen yöntem). Verilmezse
   *  mevcut `loading="lazy"` AYNEN. Görsel kaynağı / sizes / srcSet /
   *  kalite / CSS'e etkisi YOK; yalnız yükleme zamanı ve önceliği. */
  isLcp?: boolean;
};

export default function VillaCard({
  id,
  slug,
  title,
  location,
  price,
  currency: villaCurrency = "TRY",
  images = [],
  badge,
  bedrooms = 1,
  bathrooms = 1,
  guests = 2,
  stayStart,
  stayEnd,
  prices,
  stayDiscounts,
  cleaningFee,
  cleaningCurrency,
  cleaningLimit,
  reviewAverage,
  reviewCount,
  variant = "default",
  reserveInfo,
  isFlexible = false,
  discount = null,
  discountAvailable,
  locale,
  sizes: imageSizes,
  isLcp = false,
}: Props) {
  const dict = getDictionary(locale);
  const effectiveLocale: Locale = locale ?? "tr";
  const router = useRouter();
  /* Compact variant flag — curation flow için presentation density.
     Logic (price/state/handlers/modal) hiç dokunulmaz. */
  const isCuration = variant === "curation";
  /* 🛡️ Discount variant — default editorial layout + İndirimli badge +
     soft coral/turquoise accent. Logic (pricing/data/handlers) AYNEN. */
  const isDiscount = variant === "discount";
  /* Cover image: ilk geçerli URL'i seç.
     eski sağlayıcıdan null/empty değerler gelebileceği için filter. */
  const cover = (images || []).find(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );

  /* Broken URL fallback: <img onError> tetiklenirse premium
     "Görsel yakında" state'ine geç. (onLoad opacity oyununa girmiyoruz
     — gradient bg zaten skeleton görevi görüyor, hydration-safe.) */
  const [imgFailed, setImgFailed] = useState(false);

  /* 🛡️ Booking modal — lazy mount. isBookingOpen=false iken
     VillaCardBookingModal HİÇ mount edilmez (Aşama 7C) ve modülü
     indirilmez; bu yüzden fetch/engine de çalışmaz. */
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  /* 🛡️ Aşama 7C — lazy yüklenen modal bileşeni (null → henüz hazır
     değil). Tıklamada `isBookingOpen` HEMEN true olur (niyet kaybolmaz);
     bileşen hazır olduğu an modal açılır. Bu sayfada modül daha önce
     yüklendiyse (başka kart) anında hazırdır. */
  const [VillaCardBookingModal, setVillaCardBookingModal] =
    useState<LazyBookingModalType | null>(() => loadedBookingModal);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const ensureBookingModal = () => {
    if (VillaCardBookingModal) return;
    if (loadedBookingModal) {
      setVillaCardBookingModal(() => loadedBookingModal);
      return;
    }
    loadVillaCardBookingModal()
      .then((Modal) => {
        /* Unmount sonrası state güncellemesi YAPILMAZ. */
        if (isMountedRef.current) setVillaCardBookingModal(() => Modal);
      })
      .catch(() => {
        /* Yüklenemezse modal açılmaz; sonraki tıklama yeniden dener. */
      });
  };

  const { currency, rates } = useCurrency();

  const convertedPrice = convertPrice(
    Number(price || 0),
    villaCurrency,
    currency,
    rates
  );

  /* 🛡️ AKTİF İNDİRİM — yalnız "discount" variant'ta anlamlı; diğer
     variant'lar `discount` prop'unu hiç almaz (undefined) → bu blok
     no-op. Hesaplama TAMAMEN mevcut price.engine > applyDiscountToDailyPrice
     ile yapılır — yeni bir fiyat mantığı YAZILMADI.

     🔄 KÖK NEDEN DÜZELTMESİ (bu tur): Burada ÖNCEDEN, fixed tipte
     `discount.currency !== villaCurrency` ise indirim SESSİZCE iptal
     ediliyordu (kart yalnız düz fiyatı gösteriyordu — ekranda "₺5.000"
     görünüp üstü çizili eski fiyat/tarih aralığı HİÇ çıkmıyordu). Bu
     kontrol `discount-day-map.ts`'teki (admin fiyat takvimi önizlemesi)
     AYNI deseni kopyalamıştı, ANCAK oradaki gerekçe BURADA geçerli
     DEĞİL: discount-day-map.ts kasıtlı olarak `rates={}` (boş kur)
     ile çağırıyor, çünkü yanlış 1:1 dönüşüm üretmesin diye uyuşmayan
     günleri SESSİZCE atlıyor. Bu kartta ise `useCurrency()`'den GERÇEK
     `rates` zaten mevcut — `applyDiscountToDailyPrice` (DEĞİŞTİRİLMEDİ)
     zaten `discount.currency !== daily.original_currency` durumunda
     `convertPrice` ile DOĞRU dönüşümü kendisi yapıyor (bkz. public
     rezervasyon server-authoritative price-verify.ts'in AYNI senaryoyu
     — dövizli villa + farklı currency'de fixed özel fiyat — zaten
     doğru şekilde çözdüğü test edilmiş akış). Bu yüzden ön-kontrol
     kaldırıldı; currency uyuşmazlığı olsa bile indirim artık DOĞRU
     şekilde (gerekirse dönüştürülerek) gösterilir — yeni bir dönüşüm
     mantığı YAZILMADI, yalnızca gereksiz/hatalı bir erken-iptal kaldırıldı. */
  const isDiscountVariant = variant === "discount";
  const activeDiscount: DiscountRange | null =
    isDiscountVariant && discount && Number(price) > 0
      ? {
          start_date: discount.start_date,
          end_date: discount.end_date,
          discount_type: discount.discount_type,
          discount_value: discount.discount_value,
          currency: discount.currency,
        }
      : null;

  const discountedPrice = activeDiscount
    ? applyDiscountToDailyPrice(
        {
          converted: convertedPrice,
          original: Number(price || 0),
          original_currency: villaCurrency,
        },
        activeDiscount,
        currency,
        rates
      )
    : null;

  /* 🛡️ PUBLIC ÇOKLU DİL — indirim geçerlilik metni artık locale-aware.
     MEVCUT `formatDiscountDateRange` çekirdeği + MEVCUT `home.months`
     sözlüğü + `card.discountValid*` şablonları kullanılır; tarih
     matematiği, dal koşulları ve indirim/fiyat hesabı DEĞİŞMEDİ.
     TR şablonları `formatDiscountDateRangeTr` metniyle BİREBİR aynı →
     TR çıktısı korunur. */
  const discountDateRangeLabel = activeDiscount
    ? formatDiscountDateRange(
        activeDiscount.start_date,
        activeDiscount.end_date,
        (month) => dict.home.months[month as MonthNumber] ?? "",
        {
          sameMonth: dict.card.discountValidSameMonth,
          sameYear: dict.card.discountValidSameYear,
          full: dict.card.discountValidFull,
        }
      )
    : "";

  const showDiscountPricing =
    !!activeDiscount && !!discountedPrice && !!discountDateRangeLabel;

  /* 🏷️ İNDİRİM ROZETİ YÜZDESİ (bu tur) — sağ üst köşedeki "%NN İNDİRİM"
     rozetinin göstereceği değer. SABIT bir yüzde YAZILMADI:
     - discount_type === "percent" ise `discount_value` DOĞRUDAN kullanılır
       (örn. 20 → %20).
     - discount_type === "fixed" ise gerçek yüzde, normal (convertedPrice)
       ile indirimli (discountedPrice.converted) fiyat arasındaki farktan
       hesaplanır — yeni bir fiyat mantığı YOK, yalnızca mevcut iki
       değerin oranı alınıyor.
     Hesaplanamıyorsa (fiyat sıfır/negatif, indirim yoksa vb.) badge HİÇ
     render edilmez — uydurma yüzde YOK. */
  const discountBadgePercent: number | null = (() => {
    if (!showDiscountPricing || !activeDiscount || !discountedPrice) return null;
    if (activeDiscount.discount_type === "percent") {
      const pct = Math.round(Number(activeDiscount.discount_value) || 0);
      return pct > 0 ? pct : null;
    }
    if (convertedPrice > 0 && discountedPrice.converted < convertedPrice) {
      const pct = Math.round(
        ((convertedPrice - discountedPrice.converted) / convertedPrice) * 100
      );
      return pct > 0 ? pct : null;
    }
    return null;
  })();

  /* 💰 GECELİK TASARRUF ETİKETİ (bu tur) — fiyat satırının hemen altında
     gösterilen "Gecelik NNN₺ indirimli" metni. SABİT tutar YAZILMADI:
     mevcut convertedPrice (normal, zaten hesaplanmış) ile
     discountedPrice.converted (indirimli, zaten hesaplanmış) arasındaki
     farktan TÜRETİLİR — yeni bir fiyat/indirim hesaplama mantığı YOK,
     yalnızca iki mevcut değerin farkı görsel amaçla alınıyor. Fark
     pozitif değilse (indirimli fiyat normal fiyattan düşük değilse)
     veya showDiscountPricing/discountedPrice yoksa bu satır HİÇ
     render edilmez. Para birimi mevcut formatCurrency() ile AYNI
     mantıkla gösterilir — yeni bir currency formatlama YOK. */
  const nightlySavingsLabel: string | null = (() => {
    if (!showDiscountPricing || !discountedPrice) return null;
    const savings = convertedPrice - discountedPrice.converted;
    if (!(savings > 0)) return null;
    return formatDictionaryString(dict.card.nightlySavings, {
      amount: formatCurrency(savings, currency, effectiveLocale),
    });
  })();

  /* 🛡️ GRAND TOTAL — mevcut price.engine reuse (calculateGrandTotal).
     Aktif olması için: stayStart + stayEnd + prices[] üçlüsü
     birlikte verilmeli ve nights > 0 olmalı.

     calculateGrandTotal:
       - stay     = günlük fiyatlar toplamı (user currency)
       - cleaning = calculateCleaningFee(nights, fee, limit)
                    convertPrice ile user currency'sine çevrilmiş
       - total    = stay + cleaning
     Yani temizlik ücreti AYNI semantic ile (cleaning_limit muafiyeti
     dahil) hesaba dahil. VillaDetail/BookingSidebar/reservation
     create ile byte-identical. cleaning_fee=0 ise total = stay
     (eski davranışla aynı sonuç). */
  let stayNights = 0;
  let stayTotal: number | null = null;
  let hasCleaning = false;
  /* Temizlik payı — `hasCleaning`'in geldiği AYNI `result.cleaning`
     değeri; indirimsiz toplamı kurarken tekrar hesaplanmasın diye
     sayı olarak da saklanır (yeni hesap YOK). */
  let stayCleaning = 0;
  if (stayStart && stayEnd && Array.isArray(prices) && prices.length > 0) {
    stayNights = calculateNights(stayStart, stayEnd);
    if (stayNights > 0) {
      const result = calculateGrandTotal({
        start: stayStart,
        end: stayEnd,
        prices,
        currency,
        rates,
        cleaning_fee: Number(cleaningFee || 0),
        cleaning_currency: cleaningCurrency || "TRY",
        cleaning_limit: Number(cleaningLimit || 0),
        /* 🛡️ TEK EKLENEN SATIR — motorun ZATEN var olan opsiyonel
           parametresi. undefined ise motor `null` default'una düşer
           (eski davranış birebir). */
        discounts: stayDiscounts,
      });
      if (result.total > 0) {
        stayTotal = result.total;
        hasCleaning = result.cleaning > 0;
        stayCleaning = result.cleaning;
      }
    }
  }

  /* ===============================================================
     🛡️ İNDİRİMSİZ TOPLAM — YALNIZ GÖRSEL KARŞILAŞTIRMA (UI-only)
     ===============================================================
     Yukarıdaki `calculateGrandTotal` çağrısı ve dönen `stayTotal`
     HİÇ DEĞİŞMEDİ — gösterilen/ödenecek tutar AYNEN o hesaptan gelir.
     Burada yalnız "indirim olmasaydı ne olurdu" karşılaştırması için
     AYRI, salt-okunur bir çağrı yapılır: motorun ZATEN export ettiği
     `calculateStayTotal`, AYNI start/end/prices/currency/rates — tek
     fark son parametrenin `null` olması (indirim yokmuş gibi).
     Villa detay sayfasındaki `useBookingEngine` deseninin BİREBİR
     aynısı; yeni indirim FORMÜLÜ YAZILMADI.

     • Yalnız tarih seçili (stayTotal !== null) VE karta indirim verisi
       geçilmişse çalışır → indirimsiz kartlarda EK MALİYET SIFIR.
     • Temizlik her iki tarafta da aynı olduğu için mevcut
       `stayCleaning` iki toplama da eklenir.
     • 0.01 epsilon: kur yuvarlamasından doğan mikro farkı "sahte
       indirim" olarak göstermemek için (detay sayfasıyla aynı eşik).
     • `uncoveredNights > 0` → karşılaştırma güvenilmez, gösterilmez.
     =============================================================== */
  let stayTotalBeforeDiscount: number | null = null;
  if (
    stayTotal !== null &&
    Array.isArray(stayDiscounts) &&
    stayDiscounts.length > 0 &&
    stayStart &&
    stayEnd
  ) {
    const undiscountedStay = calculateStayTotal(
      stayStart,
      stayEnd,
      prices || [],
      currency,
      rates,
      null
    );
    const candidate = undiscountedStay.stay + stayCleaning;
    if (undiscountedStay.uncoveredNights === 0 && candidate - stayTotal > 0.01) {
      stayTotalBeforeDiscount = candidate;
    }
  }

  /* 🛡️ SEÇİLEN TARİHLER — yalnız tarih seçiliyken (stayTotal !== null)
     fiyatın ÜSTÜNDE gösterilir. Tarih matematiği/parse mevcut
     `parseLocalDate` + `buildHeroDateLabel` ile; YENİ format YOK. */
  const stayDateLabel =
    stayTotal !== null && stayStart && stayEnd
      ? buildHeroDateLabel(
          parseLocalDate(stayStart),
          parseLocalDate(stayEnd),
          effectiveLocale
        )
      : null;

  /* 🛡️ İNDİRİM TUTARI — ZATEN hesaplanmış iki değerin FARKI
     (indirimsiz toplam − indirimli toplam). Yeni indirim algoritması,
     yeni motor çağrısı, yeni yuvarlama/epsilon YOK: gösterim koşulu
     `stayTotalBeforeDiscount`in kendi 0.01 eşiğidir (yukarıda). */
  const stayDiscountSavings =
    stayTotalBeforeDiscount !== null && stayTotal !== null
      ? stayTotalBeforeDiscount - stayTotal
      : null;

  const showImage = !!cover && !imgFailed;
  const initial = (title?.trim()?.[0] || "·").toUpperCase();

  /* 🛡️ DATE CONTINUITY — /arama → detail geçişinde URL'de gelen
     start/end paramlarını detail href'ine append et. BookingSidebar
     URL'den initial state'i hydrate eder; refresh-safe. Tarih yoksa
     href eski formatta kalır (`/kiralik-villa/<slug>`). */
  /* 🛡️ PHASE 10G — locale prefix'i `buildLocaleAlternates` (Phase 7B,
     saf helper) üretir; "tr" için sonuç `/kiralik-villa/<slug>` —
     ESKİ DEĞERLE BİREBİR AYNI. Query-string mantığı DEĞİŞMEDİ. */
  let detailHref = buildLocaleAlternates(
    `/kiralik-villa/${slug}`,
    effectiveLocale
  ).canonical;
  if (stayStart && stayEnd) {
    const qs = new URLSearchParams();
    qs.set("start", stayStart);
    qs.set("end", stayEnd);
    detailHref = `${detailHref}?${qs.toString()}`;
  }

  /* 🛡️ İNDİRİM KARTI CTA — FIRSAT TARİHLERİNİ REZERVASYONA TAŞI
     ===============================================================
     Yalnız `variant === "discount"` (ana sayfa "İndirimli Kiralık
     Villalar") için türetilir. Kaynak: `discount` prop'u — yani
     `villa_discounts` kaydının KENDİSİ (lib/cache.helpers >
     getCachedDiscountCollectionVillas, RSC + unstable_cache). YENİ DB
     SORGUSU YOK, yeni veri modeli YOK, tarih TAHMİN EDİLMEZ.

     URL STANDARDI — projede ZATEN kullanılan desen (yeni sözleşme
     İCAT EDİLMEDİ):
       ShortGapsPageBody.tsx:466 →
         `${localePrefix}/rezervasyon/${slug}?start=...&end=...`
       useBookingEngine.ts:995   → aynı `start`/`end` param adları
     Locale öneki `buildLocaleAlternates` ile üretilir (detailHref ile
     AYNI helper; "tr" → öneksiz, "en"/"de" → /en, /de — üç route da
     mevcut).

     ⚠️ TARİH SEMANTİĞİ — GÜN EKLEME/ÇIKARMA YOK (İŞ KURALI, ürün
     sahibi tarafından doğrulandı):
       `discount.end_date` bu üründe kullanıcıya gösterilen ÇIKIŞ
       tarihidir. Kart üzerindeki "İndirim geçerli: …" etiketi
       (discountDateRangeLabel) start_date/end_date'i AYNEN basar;
       /rezervasyon özet paneli de `start`/`end` param'larını AYNEN
       basar (ReservationPageBody → ReservationForm). Dolayısıyla iki
       ekranın BİREBİR aynı tarihleri göstermesi için değerler
       DEĞİŞTİRİLMEDEN taşınır.
       ⛔ `+ 1 gün` UYGULANMAZ. Gece sayısı burada YENİDEN
          HESAPLANMAZ — rezervasyon sayfası kendi mevcut mantığıyla
          (ReservationForm > getNights / price.engine) hesaplar; o
          mantığa DOKUNULMADI.

     Geçersiz/eksik veri (slug yok, tarih parse edilemiyor, ters
     aralık) → `null` → CTA MEVCUT davranışına (detailHref) düşer.
     Buton JSX'i, className, metin ve tasarımı DEĞİŞMEDİ. */
  const discountReserveHref: string | null = (() => {
    if (!isDiscountVariant) return null;
    /* 🛡️ TAM ARALIK MÜSAİTLİK KAPISI — indirim penceresinde TEK BİR
       GECE bile doluysa rezervasyon sayfasına YÖNLENDİRME YOK; CTA
       aşağıdaki mevcut `detailHref` fallback'ine düşer.
       `undefined` (kontrol yapılmamış / fail-soft) → eski davranış. */
    if (discountAvailable === false) return null;
    const startRaw = discount?.start_date;
    const endRaw = discount?.end_date;
    if (!startRaw || !endRaw) return null;

    const cleanSlug = String(slug || "").trim();
    if (!cleanSlug) return null;

    const s = parseLocalDate(startRaw);
    const e = parseLocalDate(endRaw);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
    if (e.getTime() < s.getTime()) return null;

    const base = buildLocaleAlternates(
      `/rezervasyon/${cleanSlug}`,
      effectiveLocale
    ).canonical;

    const qs = new URLSearchParams();
    qs.set("start", formatLocalDate(s));
    /* Normalize ("YYYY-MM-DDT…" → "YYYY-MM-DD"); gün DEĞİŞMEZ. */
    qs.set("end", formatLocalDate(e));
    return `${base}?${qs.toString()}`;
  })();

  /* 🛡️ Rezervasyon bilgi alanı + CTA — yalnız reserveInfo verilince
     (kısa-süreli tarihler sayfası). CTA <button> (kart Link'i içinde
     nested <a> olmasın) + preventDefault/stopPropagation → kartın detay
     navigasyonu tetiklenmez; router.push ile /rezervasyon'a gider. */
  const reserveBlock = reserveInfo ? (
    <div className="mt-2.5 flex flex-col gap-2">
      <div className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-[13px] font-medium text-emerald-800">
        {reserveInfo.label} ·{" "}
        {formatDictionaryString(dict.card.reserveNights, {
          n: reserveInfo.nights,
        })}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          router.push(reserveInfo.href);
        }}
        aria-label={dict.card.bookNowAriaLabel}
        className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-emerald-700 text-white uppercase font-medium text-[11px] tracking-[0.08em] hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 transition-colors duration-200 motion-reduce:transition-none"
      >
        {dict.card.bookNow}
      </button>
    </div>
  ) : null;

  return (
    <>
    <CardOuter isCuration={isCuration} href={detailHref}>
      {/* ════════════════════════════════════════════════════
          🛡️ KART YAPISI — Variant dispatch
          ════════════════════════════════════════════════════
          Default variant (public list): yeni kompakt yapı —
            image aspect-[16/10] + alt content area + tek satır
            amenities. Kart yüksekliği ~%40 azaldı.
          Curation variant (admin curator): mevcut "image-dominant
            + amenity mini-cards" yapısı AYNEN korundu.
          State/props/handlers ve booking modal AYNI; sadece
          render path'i farklılaşır. ───────────────────────── */}
      {isCuration ? (
      <article
        className={
          "relative overflow-hidden bg-white " +
          /* Curation: static shadow, hover lift YOK — "selection
             workspace" UX'i. Image hover scale yine fire eder
             (image bloğunun kendi group-hover'ı). */
          "rounded-[20px] shadow-[0_8px_20px_-14px_rgba(27,26,23,0.18)] " +
          "transition-shadow duration-300 motion-reduce:transition-none"
        }
      >
        {/* ── IMAGE BLOCK with overlay content ────────────── */}
        <div
          className={
            "relative overflow-hidden " +
            "bg-gradient-to-br from-[var(--color-sand-100)] via-[var(--color-sand-50)] to-[var(--color-sand-100)] " +
            (isCuration ? "aspect-[4/5]" : "aspect-[5/6]")
          }
        >
          {showImage ? (
            <>
              {/* 🛡️ SCALE HARDENING — next/Image (responsive + lazy +
                 WebP/AVIF auto). Eski `<img>` davranışı korunur:
                   - aspect-locked parent → CLS=0 (Image fill mode)
                   - object-cover, object-center, group-hover scale aynen
                   - onError → setImgFailed (premium fallback'e geç)
                   - lazy default (above-the-fold yalnız bir kart varsa
                     parent caller priority verir; bu turda priority YOK).
                 SIZES:
                   - Mobile (default ≤640px): 100vw (tek kolon)
                   - sm (≥640): 50vw (2 col)
                   - xl (≥1280): 33vw (3 col)
                 max-w ~1280px / 3 col ≈ 420px image gen; R2 storage
                 + Next image optimizer (cdn-image) bunları auto. */}
              <Image
                src={cover}
                alt={title || dict.card.villaAlt}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                loading="lazy"
                onError={() => setImgFailed(true)}
                className="
                  object-cover object-center
                  transition-transform duration-[1200ms] ease-out
                  group-hover:scale-[1.04]
                  motion-reduce:transition-none motion-reduce:group-hover:scale-100
                "
              />
            </>
          ) : (
            /* PREMIUM FALLBACK — large serif initial */
            <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
              <div className="font-display text-[88px] md:text-[104px] leading-none text-[var(--color-stone-300)] tracking-[-0.03em]">
                {initial}
              </div>
              <p className="mt-3 text-[10px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-400)]">
                {dict.card.imageComing}
              </p>
            </div>
          )}

          {/* Bottom editorial scrim — text readability */}
          <div
            aria-hidden="true"
            className="
              absolute inset-x-0 bottom-0 h-[65%]
              bg-gradient-to-t from-black/78 via-black/42 to-transparent
              pointer-events-none
            "
          />
          {/* Hover scrim deepen — subtle */}
          <div
            aria-hidden="true"
            className="
              absolute inset-x-0 bottom-0 h-[65%]
              bg-gradient-to-t from-black/14 to-transparent
              pointer-events-none
              opacity-0 group-hover:opacity-100
              transition-opacity duration-500 motion-reduce:transition-none
            "
          />
          {/* Top vignette — badge legibility */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/[0.18] via-black/[0.04] to-transparent pointer-events-none"
          />
          {/* Inner premium ring stroke */}
          <div
            aria-hidden="true"
            className="absolute inset-0 ring-1 ring-inset ring-white/15 pointer-events-none"
          />

          {/* BADGE — glass pill + coral indicator dot.
              🛡️ Curation variant: admin curator listesinde "Öne Çıkan"
              tarzı pazarlama etiketi görsel noise → render edilmez. */}
          {badge && !isCuration && (
            <span className="absolute top-4 left-4 z-10 inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm text-[var(--color-stone-900)] text-[10px] tracking-[0.18em] uppercase font-medium px-3 py-1.5 rounded-full shadow-[0_6px_18px_-6px_rgb(27_26_23/0.30)] ring-1 ring-white/40">
              <span
                aria-hidden="true"
                className="inline-block w-1 h-1 rounded-full bg-[var(--brand-coral)]"
              />
              {badge}
            </span>
          )}

          {/* FAV BUTTON — top-right (FAZ 36 white glass).
              🛡️ Curation variant: admin curator listesinde favori
              gereksiz → render edilmez. */}
          {id && !isCuration && (
            <FavoriteButton villaId={id} variant="card" alwaysVisible />
          )}

          {/* ════════════════════════════════════════════════
              OVERLAY CONTENT (bottom editorial)
              location → title → review → price + arrow
              ════════════════════════════════════════════════ */}
          <div
            className={
              "absolute inset-x-0 bottom-0 z-10 " +
              (isCuration ? "p-4" : "p-5 md:p-6")
            }
          >
            {/* LOCATION */}
            <p className="flex items-center gap-1.5 text-[10.5px] tracking-[0.18em] uppercase font-medium text-white/75 min-w-0 truncate">
              <MapPin
                size={11}
                className="text-white/70 shrink-0"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="truncate">{location || dict.card.noLocation}</span>
            </p>

            {/* TITLE — editorial white serif */}
            <h3
              className={
                "font-display text-white " +
                (isCuration
                  ? "text-[17px] md:text-[18px] mt-2 "
                  : "text-[22px] md:text-[26px] mt-2.5 ") +
                "leading-[1.08] tracking-[-0.022em] line-clamp-2 " +
                "group-hover:text-white/95 " +
                "transition-colors motion-reduce:transition-none " +
                "drop-shadow-[0_1px_2px_rgba(0,0,0,0.30)]"
              }
            >
              {title}
            </h3>

            {/* REVIEW META — amber star + compact */}
            {typeof reviewCount === "number" && reviewCount > 0 &&
              typeof reviewAverage === "number" && reviewAverage > 0 && (
                <div
                  className="flex items-center gap-1.5 mt-2 text-[12px] text-white/85"
                  aria-label={formatDictionaryString(
                    dict.card.ratingAriaLabel,
                    {
                      value: reviewAverage.toFixed(1),
                      count: reviewCount,
                    }
                  )}
                >
                  <Star
                    size={11}
                    className="text-amber-400 shrink-0"
                    fill="currentColor"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span className="font-display text-[13px] text-white tracking-[-0.01em] tabular-nums leading-none">
                    {reviewAverage.toFixed(1)}
                  </span>
                  <span aria-hidden="true" className="text-white/40">·</span>
                  <span className="text-white/70 tabular-nums">
                    {formatDictionaryString(dict.card.reviewCount, {
                      n: reviewCount,
                    })}
                  </span>
                </div>
              )}

            {/* PRICE LINE + glass arrow CTA.
                stayTotal branch: 2 satır editorial layout
                  Üst: TOPLAM eyebrow + büyük fiyat
                  Alt: "N gece · Temizlik dahil" meta
                Tek satır truncate (kırpılma) sorunu kapanır; kullanıcı
                breakdown'u net görür. Gecelik branch tek satır eski
                davranış. calculateGrandTotal/hasCleaning/stayNights
                değerleri aynen reuse — yeni hesap YOK. */}
            <div
              className={
                "flex items-center justify-between gap-3 " +
                (isCuration ? "mt-2.5" : "mt-3.5 md:mt-4")
              }
            >
              <div className="flex flex-col min-w-0">
                {stayTotal !== null ? (
                  <>
                    {/* Üst satır: eyebrow + büyük fiyat */}
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-[10.5px] tracking-[0.14em] uppercase font-medium text-white/65">
                        {dict.card.total}
                      </span>
                      <span
                        className={
                          "font-display text-white tracking-[-0.015em] tabular-nums " +
                          (isCuration ? "text-[17px]" : "text-[22px]")
                        }
                      >
                        {formatCurrency(stayTotal, currency, effectiveLocale)}
                      </span>
                    </div>
                    {/* Alt satır: meta — gece + temizlik dahil bilgisi */}
                    <p
                      className={
                        "text-white/70 leading-snug " +
                        (isCuration ? "text-[11px] mt-0.5" : "text-[12px] mt-1")
                      }
                    >
                      <span className="tabular-nums">
                        {formatDictionaryString(dict.card.nights, {
                          n: stayNights,
                        })}
                      </span>
                      {hasCleaning ? (
                        <>
                          <span
                            aria-hidden
                            className="text-white/40 mx-1.5"
                          >
                            ·
                          </span>
                          <span className="text-white/65">
                            {dict.card.cleaningIncluded}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </>
                ) : (
                  <div className="flex flex-col min-w-0">
                    <span
                      className={
                        "font-display text-white tracking-[-0.015em] tabular-nums " +
                        (isCuration ? "text-[17px]" : "text-[22px]")
                      }
                    >
                      {price
                        ? formatCurrency(convertedPrice, currency, effectiveLocale)
                        : dict.card.priceOnRequest}
                    </span>
                    {price ? (
                      <span
                        className={
                          "text-white/65 " +
                          (isCuration ? "text-[11px]" : "text-[12px]")
                        }
                      >
                        {dict.card.startingFromUpper}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
              {/* Glass arrow CTA */}
              <span
                aria-hidden="true"
                className={
                  "inline-flex items-center justify-center rounded-full shrink-0 " +
                  (isCuration ? "w-8 h-8 " : "w-9 h-9 ") +
                  "bg-white/10 backdrop-blur-md ring-1 ring-inset ring-white/30 text-white " +
                  "group-hover:bg-[var(--brand-coral)] group-hover:ring-[var(--brand-coral)] " +
                  "transition-[background-color,color,box-shadow] duration-300 motion-reduce:transition-none"
                }
              >
                <ArrowUpRight size={isCuration ? 13 : 14} strokeWidth={1.75} />
              </span>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════
            🛡️ BOOKING TRIGGER — "Müsaitlik / Tarih Seç"
            ════════════════════════════════════════════════
            Card içinde tek booking entry point butonu. Tıklayınca:
              - e.preventDefault + stopPropagation → outer Link'in
                detail navigation'ı tetiklenmez
              - setIsBookingOpen(true) → lazy modal mount
            Modal kapalıyken VillaCardBookingModal HİÇ mount edilmez
            (next/dynamic ssr:false + erken-return).
            DOM konum: image bloğunun ALTINDA, amenity strip'in ÜSTÜNDE
            → mevcut layout'a dokunulmaz, sabit yükseklik. */}
        {/* 🛡️ Booking trigger — admin curation'da admin "müşterinin
            ne göreceğini" hızlıca önizleyebilsin diye CTA korunur,
            sadece sizing/spacing compact'lenir. */}
        <div
          className={
            "bg-white " + (isCuration ? "px-2 pt-2" : "px-3 pt-3")
          }
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsBookingOpen(true);
              ensureBookingModal();
            }}
            onPointerEnter={preloadVillaCardBookingModal}
            onPointerDown={preloadVillaCardBookingModal}
            onFocus={preloadVillaCardBookingModal}
            aria-label={dict.card.availabilityAriaLabel}
            className={
              "w-full inline-flex items-center justify-center gap-2 " +
              "bg-[var(--color-stone-900)] text-white uppercase font-medium " +
              "hover:bg-[var(--color-stone-800)] " +
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40 " +
              "transition-colors duration-200 motion-reduce:transition-none " +
              (isCuration
                ? "h-9 rounded-xl text-[11px] tracking-[0.06em]"
                : "h-11 rounded-2xl text-[12px] tracking-[0.08em]")
            }
          >
            <CalendarRange
              size={isCuration ? 12 : 14}
              strokeWidth={1.75}
              aria-hidden
            />
            {dict.card.availabilityCta}
          </button>
        </div>

        {/* ════════════════════════════════════════════════
            🛡️ FAZ 39K — AMENITY MINI-CARDS (3 luxury pastel)
            ════════════════════════════════════════════════
            Image bloğunun altında, article içinde sabit
            yükseklikli (h-24) 3-col luxury amenity strip.
            Tonlar:
              - Yatak  : coral  (#FFF1EB · #c84a20)
              - Banyo  : green  (#EEF8F0 · #1f7a4d)
              - Kişi   : blue   (#EEF4FF · #1d6492)
            Hover: subtle brighten (-translate-y-[1px]).
            CSS soup yok — tek tone map + helper component. */}
        <div
          className={
            "grid grid-cols-3 bg-white " +
            (isCuration ? "gap-1.5 p-2" : "gap-2 p-3")
          }
        >
          <AmenityMini
            tone="coral"
            icon={<BedDouble size={18} strokeWidth={1.6} aria-hidden />}
            value={bedrooms}
            label={dict.card.bedroom}
          />
          <AmenityMini
            tone="green"
            icon={<Bath size={18} strokeWidth={1.6} aria-hidden />}
            value={bathrooms}
            label={dict.card.bathroom}
          />
          <AmenityMini
            tone="blue"
            icon={<Users size={18} strokeWidth={1.6} aria-hidden />}
            value={guests}
            label={dict.card.person}
          />
        </div>
      </article>
      ) : (
      /* ════════════════════════════════════════════════════
         🛡️ DEFAULT (PUBLIC) — KOMPAKT KART
         ════════════════════════════════════════════════════
         Yapı:
           <article>
             ├─ image (aspect-[16/10]) + badge/fav overlay
             └─ content area
                 ├─ row 1: title (sol) + price (sağ)
                 ├─ row 2: location (📍)
                 ├─ row 3: review meta (opsiyonel)
                 └─ row 4: amenities ince satır (separator üstte)
         Booking modal'a kart üzerinden erişim YOK (detail
         sayfası BookingSidebar üzerinden açılır); modal state'i
         hâlâ mount edilebilir ama isOpen=false sabit → 0 maliyet.
         ──────────────────────────────────────────────────── */
      isDiscount ? (
      <div
        className={
          "relative rounded-[28px] p-[1.5px] overflow-hidden dc-glow-ring " +
          "shadow-[0_14px_34px_-18px_rgba(11,31,58,0.24)] " +
          "group-hover:shadow-[0_28px_54px_-22px_rgba(9,115,186,0.32)] " +
          "transition-[box-shadow,transform] duration-500 motion-reduce:transition-none " +
          "group-hover:-translate-y-[3px]"
        }
      >
      <article className="relative overflow-hidden bg-white rounded-[26.5px]">
        {/* ── IMAGE BLOCK — aspect-[4/3], premium showcase, dominant görsel ── */}
        <div className="relative overflow-hidden aspect-[4/3] bg-gradient-to-br from-[var(--color-sand-100)] via-[var(--color-sand-50)] to-[var(--color-sand-100)]">
          {showImage ? (
            <Image
              src={cover}
              alt={title || dict.card.villaAlt}
              fill
              sizes="(max-width: 640px) 78vw, (max-width: 1024px) 340px, 380px"
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="
                object-cover object-center
                transition-transform duration-[900ms] ease-out
                group-hover:scale-[1.05]
                motion-reduce:transition-none motion-reduce:group-hover:scale-100
              "
            />
          ) : (
            /* PREMIUM FALLBACK — serif initial */
            <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
              <div className="font-display text-[64px] leading-none text-[var(--color-stone-300)] tracking-[-0.03em]">
                {initial}
              </div>
              <p className="mt-2 text-[10px] tracking-[0.24em] uppercase font-medium text-[var(--color-stone-400)]">
                {dict.card.imageComing}
              </p>
            </div>
          )}

          {/* Bottom scrim — başlık/bölge legibility */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/[0.78] via-black/[0.28] to-transparent pointer-events-none"
          />
          {/* Top vignette — badge legibility */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/[0.24] via-black/[0.04] to-transparent pointer-events-none"
          />
          {/* Inner premium ring stroke */}
          <div
            aria-hidden="true"
            className="absolute inset-0 ring-1 ring-inset ring-white/15 pointer-events-none"
          />

          {/* 🔄 SADELEŞTİRME (bu tur): "Özel Fırsat · İndirimli" rozeti VE
              favori kalp butonu, kullanıcı talebiyle YALNIZ bu discount
              variant'ta kaldırıldı — normal/curation branch'lerdeki badge
              ve FavoriteButton kullanımlarına (satır ~438, ~1005) HİÇ
              dokunulmadı, onlar AYNEN duruyor. */}

          {/* 🏷️ İNDİRİM ROZETİ (bu tur) — sağ üst köşe, kırmızı zemin +
              beyaz yazı. Yüzde SABİT DEĞİL: discountBadgePercent (yukarıda,
              discount_type/discount_value'den hesaplandı) null ise badge HİÇ
              render edilmez. Kartın içine taşmaması için image bloğunun kendi
              `relative overflow-hidden` alanına, `absolute top-3 right-3` ile
              konumlandırıldı. */}
          {discountBadgePercent !== null && (
            <div
              className="absolute top-3 right-3 z-10 inline-flex items-center rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em] text-white shadow-[0_4px_10px_-2px_rgba(220,38,38,0.5)]"
              aria-label={formatDictionaryString(
                dict.card.discountBadgeAriaLabel,
                { percent: discountBadgePercent }
              )}
            >
              {formatDictionaryString(dict.card.discountBadge, {
                percent: discountBadgePercent,
              })}
            </div>
          )}

          {/* TITLE + LOCATION — görsel üzerinde alt overlay, brand accent çizgisi.
              Normal public karttan (VillaCard default) ayırt etmek için altina
              turuncu→mavi ince accent çizgisi eklendi. */}
          <div className="absolute inset-x-0 bottom-0 p-4 pointer-events-none text-center">
            <h3 className="font-display text-[19px] md:text-[20px] font-semibold leading-[1.15] tracking-[-0.02em] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)] line-clamp-1">
              {title}
            </h3>
            <p className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-white/85 uppercase tracking-[0.05em]">
              <MapPin size={11} className="shrink-0" strokeWidth={2} aria-hidden />
              <span className="truncate">{location || dict.card.noLocation}</span>
            </p>
            <div
              aria-hidden="true"
              className="mt-2 h-[3px] w-12 rounded-full bg-gradient-to-r from-[#ED7926] to-[#0973BA] mx-auto"
            />
          </div>
        </div>

        {/* ── CONTENT AREA — kampanya hissi veren hafif gradient wash ── */}
        <div className="p-3.5 md:p-4 bg-gradient-to-br from-[#FFF6F0] via-white to-[#F0F8FC]">
          {/* 🔄 SADELEŞTİRME (bu tur): yıldız/puan/yorum sayısı bloğu
              kullanıcı talebiyle YALNIZ bu discount variant'ta kaldırıldı
              — default/curation branch'lerdeki review meta AYNEN duruyor
              (bu dosyadaki diğer <Star .../> kullanımları, satır ~487 ve
              ~1056, dokunulmadı). AMENITIES artık content area'nın İLK
              elemanı → üst margin'e gerek yok (review varken kullanılan
              "mt-3" koşulu da kaldırıldı, review hiç render edilmediği
              için AYNI sonuç zaten hep margin'siz durumdu). */}
          <div className="flex items-center justify-center gap-x-4 gap-y-1.5 flex-wrap text-[12.5px] font-medium text-[var(--color-stone-800)]">
            <span
              className="inline-flex items-center gap-1.5"
              aria-label={formatDictionaryString(dict.card.guestsAriaLabel, {
                n: guests,
              })}
            >
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-[#0973BA]/10 text-[#0973BA] shrink-0" aria-hidden>
                <Users size={17} strokeWidth={2.2} />
              </span>
              <span className="tabular-nums">
                {formatDictionaryString(dict.card.guestsValue, { n: guests })}
              </span>
            </span>
            <span
              className="inline-flex items-center gap-1.5"
              aria-label={formatDictionaryString(dict.card.bedroomsAriaLabel, {
                n: bedrooms,
              })}
            >
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-[#0973BA]/10 text-[#0973BA] shrink-0" aria-hidden>
                <BedDouble size={17} strokeWidth={2.2} />
              </span>
              <span className="tabular-nums">
                {formatDictionaryString(dict.card.bedroomsValue, {
                  n: bedrooms,
                })}
              </span>
            </span>
            <span
              className="inline-flex items-center gap-1.5"
              aria-label={formatDictionaryString(dict.card.bathroomsAriaLabel, {
                n: bathrooms,
              })}
            >
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-[#0973BA]/10 text-[#0973BA] shrink-0" aria-hidden>
                <Bath size={17} strokeWidth={2.2} />
              </span>
              <span className="tabular-nums">
                {formatDictionaryString(dict.card.bathroomsValue, {
                  n: bathrooms,
                })}
              </span>
            </span>
          </div>

          {/* Divider */}
          <div aria-hidden="true" className="mt-3.5 h-px bg-[var(--color-stone-200)]/70" />

          {/* BOTTOM ROW — yalnız fiyat gösterimi (CTA kaldırıldı: kart
              artık booking modalı açmıyor, yalnız fiyat/indirim bilgisi
              gösteriyor). Fiyat hesabı (stayTotal / convertedPrice /
              showDiscountPricing) BİREBİR mevcut price.engine reuse'u —
              yeni bir hesaplama mantığı YOK. */}
          <div className="mt-3.5">
            <div className="min-w-0 text-center">
              {stayTotal !== null ? (
                <>
                  <div className="font-display font-bold text-[18px] md:text-[19px] text-[#ED7926] tracking-[-0.015em] tabular-nums leading-none">
                    {formatCurrency(stayTotal, currency, effectiveLocale)}
                  </div>
                  <div className="mt-1 text-[10.5px] tracking-[0.04em] uppercase text-[var(--color-stone-500)] tabular-nums">
                    {formatDictionaryString(dict.card.nights, { n: stayNights })}
                    {hasCleaning ? dict.card.cleaningIncludedSuffix : ""}
                  </div>
                </>
              ) : showDiscountPricing ? (
                <>
                  {/* İndirim tarih aralığı — villa_discounts kaydından
                      DİNAMİK (bkz. formatDiscountDateRangeTr). Sabit
                      metin YOK. */}
                  <p className="text-[13px] font-semibold text-red-600 tracking-[0.01em] text-center">
                    {discountDateRangeLabel}
                  </p>
                  {/* İnce yatay ayırıcı — tam genişlik, nötr (mevcut
                      kart divider'larıyla AYNI dil: h-px + stone-200). */}
                  <div
                    aria-hidden="true"
                    className="mt-1.5 mb-1.5 h-px w-full bg-[var(--color-stone-200)]"
                  />
                  {/* Üstü çizili normal fiyat + vurgulu indirimli fiyat +
                      indirimli fiyatın SAĞINDA küçük/zarif "GECELİK" etiketi
                      — kullanıcı talebiyle bu turda eklendi. Fiyat hesabı
                      (convertedPrice / discountedPrice) DEĞİŞMEDİ, yalnız
                      görsel bir etiket eklendi. */}
                  <div className="flex items-baseline gap-2 justify-center">
                    <span className="text-[13px] text-[var(--color-stone-400)] line-through tabular-nums">
                      {formatCurrency(convertedPrice, currency, effectiveLocale)}
                    </span>
                    <span className="inline-flex items-baseline gap-1">
                      <span className="font-display font-bold text-[18px] md:text-[19px] text-green-600 tracking-[-0.015em] tabular-nums leading-none">
                        {formatCurrency(discountedPrice!.converted, currency, effectiveLocale)}
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-stone-500)]">
                        {dict.card.nightly}
                      </span>
                    </span>
                  </div>
                  {/* 💰 GECELİK TASARRUF SATIRI (bu tur) — fiyat satırının
                      HEMEN ALTINDA, marka mavisi (#0973BA), fiyat satırından
                      daha küçük punto. Tutar SABİT DEĞİL: nightlySavingsLabel
                      (yukarıda hesaplandı) null ise satır HİÇ render edilmez. */}
                  {nightlySavingsLabel && (
                    <p className="mt-1 text-[11.5px] font-medium text-[#0973BA] text-center">
                      {nightlySavingsLabel}
                    </p>
                  )}
                </>
              ) : (
                <div className="font-display font-bold text-[18px] md:text-[19px] text-[#ED7926] tracking-[-0.015em] tabular-nums leading-none">
                  {price
                    ? formatCurrency(convertedPrice, currency, effectiveLocale)
                    : dict.card.priceOnRequest}
                </div>
              )}
            </div>
          </div>
          {/* 🛡️ CTA — "Hemen Rezervasyon Yap" (kullanıcı referans tasarımı:
              her indirim kartında KORUNACAK, sabit/koşulsuz CTA). Kart zaten
              CardOuter üzerinden <Link href={detailHref}> ile sarmalı;
              nested <button> + preventDefault/stopPropagation +
              router.push (reserveBlock ile AYNI, mevcut, kanıtlanmış desen)
              kartın kendi navigasyonuyla ÇAKIŞMAZ. reserveInfo verilmişse
              (kısa-süreli tarihler sayfası) mevcut reserveBlock (gece bilgisi
              + CTA) AYNEN kullanılır — yeni bir CTA/route mantığı YOK. */}
          {reserveInfo ? (
            reserveBlock
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                /* 🛡️ Fırsat tarihleri varsa /rezervasyon'a ÖN-SEÇİLİ
                   tarihlerle; yoksa MEVCUT davranış (villa detayı). */
                router.push(discountReserveHref ?? detailHref);
              }}
              className="mt-3 w-full inline-flex items-center justify-center h-11 rounded-xl bg-[#ED7926] hover:bg-[#D96A1F] text-white uppercase font-semibold text-[11.5px] tracking-[0.08em] shadow-[0_10px_24px_-8px_rgba(237,121,38,0.45)] hover:shadow-[0_14px_30px_-10px_rgba(237,121,38,0.55)] hover:-translate-y-px active:translate-y-0 transition-[box-shadow,transform,background-color] duration-200 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ED7926]/40"
            >
              {dict.card.bookNow}
            </button>
          )}
        </div>
      </article>
      </div>
      ) : (
      <article
        className={
          "relative overflow-hidden bg-white " +
          "rounded-[22px] border border-[var(--color-stone-100)] " +
          "shadow-[0_14px_34px_-22px_rgba(11,31,58,0.22)] " +
          "group-hover:shadow-[0_28px_56px_-24px_rgba(11,31,58,0.32),0_0_0_1px_rgba(9,115,186,0.14)] " +
          "group-hover:border-[#0973BA]/25 " +
          "transition-[box-shadow,transform,border-color] duration-500 motion-reduce:transition-none " +
          "group-hover:-translate-y-[3px]"
        }
      >
        {/* ── IMAGE BLOCK — aspect-[4/3] (büyük, premium) ── */}
        <div
          className={
            "relative overflow-hidden " +
            "aspect-[4/3] " +
            "bg-gradient-to-br from-[var(--color-sand-100)] via-[var(--color-sand-50)] to-[var(--color-sand-100)]"
          }
        >
          {showImage ? (
            <Image
              src={cover}
              alt={title || dict.card.villaAlt}
              fill
              sizes={
                imageSizes ??
                "(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
              }
              loading={isLcp ? "eager" : "lazy"}
              fetchPriority={isLcp ? "high" : undefined}
              onError={() => setImgFailed(true)}
              className="
                object-cover object-center
                transition-transform duration-[1000ms] ease-out
                group-hover:scale-[1.06]
                motion-reduce:transition-none motion-reduce:group-hover:scale-100
              "
            />
          ) : (
            /* PREMIUM FALLBACK — serif initial */
            <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
              <div className="font-display text-[72px] leading-none text-[var(--color-stone-300)] tracking-[-0.03em]">
                {initial}
              </div>
              <p className="mt-2 text-[10px] tracking-[0.24em] uppercase font-medium text-[var(--color-stone-400)]">
                {dict.card.imageComing}
              </p>
            </div>
          )}

          {/* Top vignette — badge/fav buton legibility */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/[0.22] via-black/[0.05] to-transparent pointer-events-none"
          />
          {/* Inner premium ring stroke */}
          <div
            aria-hidden="true"
            className="absolute inset-0 ring-1 ring-inset ring-white/15 pointer-events-none"
          />

          {/* BADGE — glass pill + turuncu→mavi gradient indicator dot. */}
          {badge && (
            <span className="absolute top-3.5 left-3.5 z-10 inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-md text-[var(--color-stone-900)] text-[10px] tracking-[0.16em] uppercase font-semibold px-2.5 py-1.5 rounded-full shadow-[0_6px_18px_-6px_rgb(27_26_23/0.28)] ring-1 ring-white/50">
              <span
                aria-hidden="true"
                className="inline-block w-1.5 h-1.5 rounded-full bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
              />
              {badge}
            </span>
          )}

          {/* FAV BUTTON — top-right (mevcut FavoriteButton, davranış/API AYNEN) */}
          {id && <FavoriteButton villaId={id} variant="card" alwaysVisible />}

          {/* ════════════════════════════════════════════════
              🛡️ OVERLAY — villa adı + bölge, görselin sol altında.
              Public kart redesign: eskiden CONTENT AREA'nın (beyaz
              panel) en üstünde ayrı satırlardı; şimdi görsel üzerinde,
              okunabilirlik için zarif koyu gradient scrim üzerinde.
              Diğer her şey (review/amenities/fiyat/CTA/favori) AYNEN
              CONTENT AREA'da kalmaya devam ediyor — yalnız bu iki alan
              taşındı. Discount/curation variant'ları ETKİLENMEDİ. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black/75 via-black/30 to-transparent pointer-events-none"
          />
          <div className="absolute inset-x-0 bottom-0 z-10 p-3.5 md:p-4 pr-20 md:pr-24">
            <h3
              className={
                "font-display text-white font-semibold " +
                "text-[17px] md:text-[19px] leading-[1.15] tracking-[-0.02em] " +
                "line-clamp-1 group-hover:text-white/90 " +
                "transition-colors duration-300 motion-reduce:transition-none " +
                "drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
              }
            >
              {title}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 text-[10.5px] tracking-[0.14em] uppercase font-medium text-white/80 min-w-0">
              <MapPin
                size={11}
                className="text-white/75 shrink-0"
                strokeWidth={1.9}
                aria-hidden
              />
              <span className="truncate">{location || dict.card.noLocation}</span>
            </p>
          </div>

          {/* REVIEW BADGE — görselin sağ altı (villa adı/bölge sol altta
              olduğu için ayrık köşe). Zarif glass pill; format birebir
              korunur ("X.X · N yorum"), gerçek reviewAverage/reviewCount —
              0/undefined'da render edilmez (eski davranışla aynı guard).
              CONTENT AREA'daki eski REVIEW META bloğunun YERİNE bu geldi
              (aşağıda o blok kaldırılıp price satırına dönüştürüldü). */}
          {typeof reviewCount === "number" && reviewCount > 0 &&
            typeof reviewAverage === "number" && reviewAverage > 0 && (
              <div
                className="absolute bottom-3.5 md:bottom-4 right-3.5 md:right-4 z-10 inline-flex items-center gap-1 bg-white/90 backdrop-blur-md text-[var(--color-stone-900)] text-[11px] font-medium px-2.5 py-1 rounded-full shadow-[0_4px_14px_-4px_rgba(0,0,0,0.28)] ring-1 ring-white/50"
                aria-label={formatDictionaryString(
                  dict.card.ratingAriaLabel,
                  {
                    value: reviewAverage.toFixed(1),
                    count: reviewCount,
                  }
                )}
              >
                <Star
                  size={11}
                  className="text-amber-500 shrink-0"
                  fill="currentColor"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span className="tabular-nums">{reviewAverage.toFixed(1)}</span>
                <span aria-hidden="true" className="text-[var(--color-stone-400)]">·</span>
                <span className="tabular-nums">
                  {formatDictionaryString(dict.card.reviewCount, {
                    n: reviewCount,
                  })}
                </span>
              </div>
            )}
        </div>

        {/* ── CONTENT AREA ── */}
        <div className="p-4 md:p-5">
          {/* PRICE — "X başlayan fiyatlarla" sade satırı; REVIEW META'nın
              eski konumu (review artık görsel üzerinde sağ altta, bkz.
              yukarıdaki REVIEW BADGE). Aynı convertedPrice/formatCurrency/
              currency BOTTOM ROW'daki mevcut hesaptan reuse edilir — yeni
              fiyat hesabı YOK. Yalnız stayTotal===null (tarih aralığı
              seçilmemiş "başlangıç fiyatı" senaryosu) VE isFlexible===false
              iken render edilir; BOTTOM ROW'daki aynı metin ÇİFT gösterim
              olmasın diye oradan kaldırıldı (stayTotal!==null tarih-seçili
              toplam ve isFlexible esnek-sonuç senaryoları BOTTOM ROW'da
              AYNEN kalmaya devam ediyor — mutually exclusive, çakışma yok). */}
          {!isFlexible &&
            (stayTotal !== null ? (
              /* 🛡️ TARİH SEÇİLİ — konaklama TOPLAMI artık BU alanda
                 gösterilir (eskiden BOTTOM ROW'da, müsaitlik CTA'sının
                 solundaydı; çift gösterim olmasın diye oradan kaldırıldı).
                 SADECE KONUM DEĞİŞTİ: aynı `stayTotal` / `stayNights` /
                 `hasCleaning` değerleri, aynı `formatCurrency`, aynı
                 currency ve aynı sözlük anahtarları. calculateGrandTotal
                 çağrısına, indirim/kur/temizlik hesabına DOKUNULMADI. */
              <div className="mt-2">
                {/* ÜST SATIR — seçilen giriş/çıkış tarihleri. */}
                {stayDateLabel && (
                  <p className="text-[11.5px] tracking-[0.04em] text-[var(--color-stone-500)] tabular-nums">
                    {stayDateLabel}
                  </p>
                )}

                {/* ORTA SATIR — fiyat. "N gece" KALDIRILDI (tarih artık
                    üst satırda); "Temizlik dahil" MEVCUT koşuluyla
                    (hasCleaning) ve MEVCUT sözlük metniyle aynen kalır. */}
                <p className="mt-0.5 text-[13px] text-[var(--color-stone-500)]">
                  {/* 🛡️ İNDİRİMSİZ TOPLAM — yalnız gerçek bir fark varsa
                      render edilir (bkz. stayTotalBeforeDiscount). Üstü
                      çizili stil villa detaydaki BookingSummary ile aynı
                      dil: küçük punto + stone-400 + line-through. */}
                  {stayTotalBeforeDiscount !== null && (
                    <>
                      <span className="text-[12px] text-[var(--color-stone-400)] line-through tabular-nums">
                        {formatCurrency(
                          stayTotalBeforeDiscount,
                          currency,
                          effectiveLocale
                        )}
                      </span>{" "}
                    </>
                  )}
                  <span className="font-display text-[15px] font-semibold text-[#ED7926] tabular-nums">
                    {formatCurrency(stayTotal, currency, effectiveLocale)}
                  </span>
                  {hasCleaning ? (
                    <span>{dict.card.cleaningIncludedSuffix}</span>
                  ) : null}
                </p>

                {/* ALT SATIR — indirim tutarı. Yalnız gerçek indirim
                    varsa; yoksa bu satır HİÇ render edilmez. */}
                {stayDiscountSavings !== null && (
                  <p className="mt-0.5 text-[12px] font-medium text-red-600 tabular-nums">
                    {formatDictionaryString(dict.card.totalSavings, {
                      amount: formatCurrency(
                        stayDiscountSavings,
                        currency,
                        effectiveLocale
                      ),
                    })}
                  </p>
                )}
              </div>
            ) : (
              /* Tarih seçilmemiş — MEVCUT davranış BİREBİR:
                 "X başlayan fiyatlarla" veya "Fiyat sorunuz". */
              <p className="mt-2 text-[13px] text-[var(--color-stone-500)]">
                {price ? (
                  <>
                    <span className="font-display text-[15px] font-semibold text-[#ED7926] tabular-nums">
                      {formatCurrency(convertedPrice, currency, effectiveLocale)}
                    </span>{" "}
                    {dict.card.startingFromLower}
                  </>
                ) : (
                  dict.card.priceOnRequest
                )}
              </p>
            ))}

          {/* Divider — üst bilgi bloğu ↔ özellikler */}
          <div aria-hidden="true" className="mt-3.5 h-px bg-[var(--color-stone-100)]" />

          {/* AMENITIES — guests / bedrooms / bathrooms, marka rengi ikon vurgusu */}
          <div className="mt-3.5 flex items-center gap-x-4 gap-y-1.5 flex-wrap text-[12.5px] font-medium text-[var(--color-stone-800)]">
            <span
              className="inline-flex items-center gap-1.5"
              aria-label={formatDictionaryString(dict.card.guestsAriaLabel, {
                n: guests,
              })}
            >
              <Users size={15} className="text-[#0973BA]" strokeWidth={1.9} aria-hidden />
              <span className="tabular-nums">
                {formatDictionaryString(dict.card.guestsValue, { n: guests })}
              </span>
            </span>
            <span
              className="inline-flex items-center gap-1.5"
              aria-label={formatDictionaryString(dict.card.bedroomsAriaLabel, {
                n: bedrooms,
              })}
            >
              <BedDouble size={15} className="text-[#0973BA]" strokeWidth={1.9} aria-hidden />
              <span className="tabular-nums">
                {formatDictionaryString(dict.card.bedroomsValue, {
                  n: bedrooms,
                })}
              </span>
            </span>
            <span
              className="inline-flex items-center gap-1.5"
              aria-label={formatDictionaryString(dict.card.bathroomsAriaLabel, {
                n: bathrooms,
              })}
            >
              <Bath size={15} className="text-[#0973BA]" strokeWidth={1.9} aria-hidden />
              <span className="tabular-nums">
                {formatDictionaryString(dict.card.bathroomsValue, {
                  n: bathrooms,
                })}
              </span>
            </span>
          </div>

          {/* Marka rengi imza çizgisi — küçük vurgu */}
          <div
            aria-hidden="true"
            className="mt-3.5 h-[2px] w-10 rounded-full bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
          />

          {/* BOTTOM ROW — fiyat (sol, varsa) + booking CTA. Handler/aria-label/
              lazy modal mantığı AYNEN; fiyat hesabı (stayTotal / convertedPrice)
              üst tanımdan BİREBİR reuse — yeni hesap YOK.
              🛡️ CTA HİZALAMA — justify-between kaldırıldı; buton `mx-auto`
              ile fiyat/chip bloğunun (varsa) SAĞINDAKİ boşlukta ortalanır.
              Fiyat/chip bloğu solda AYNI konumunda kalır (taşınmadı); boş
              olduğu yaygın durumda (stayTotal===null, isFlexible=false)
              satırın tamamı boş kaldığı için buton satırın tam ortasına
              gelir. Buton genişlik/yükseklik/renk/hover/metin AYNEN. */}
          <div className="mt-3.5 flex items-end gap-3">
            {isFlexible ? (
              /* 🛡️ ESNEK EK SONUÇ — fiyat gösterilmez; fiyat motoru
                 çağrılmaz, ana tarih/href akışı korunur. */
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ED7926]/10 to-[#0973BA]/10 ring-1 ring-[#0973BA]/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#0973BA]">
                  <Sparkles size={11} strokeWidth={2} className="text-[#ED7926]" aria-hidden />
                  {dict.card.flexibleTitle}
                </div>
                <div className="mt-1 text-[11px] font-medium text-[var(--color-stone-600)]">
                  {dict.card.flexibleSubtitle}
                </div>
              </div>
            ) : (
              /* 🛡️ FİYAT ARTIK BURADA GÖSTERİLMİYOR (bu tur): hem
                 tarihsiz "başlayan fiyatlarla" hem de tarih seçili
                 KONAKLAMA TOPLAMI artık CONTENT AREA'nın üstündeki tek
                 fiyat alanında gösterilir → müsaitlik CTA'sının yanında
                 ÇİFT fiyat yok. Sarmalayıcı `div` KORUNDU: CTA'nın
                 `mx-auto` hizalaması ve satır yüksekliği DEĞİŞMESİN.
                 Fiyat hesabı (stayTotal/hasCleaning/stayNights) YUKARIDA
                 AYNEN duruyor — motor ve değerler DEĞİŞMEDİ. */
              <div className="min-w-0" />
            )}

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsBookingOpen(true);
                ensureBookingModal();
              }}
              onPointerEnter={preloadVillaCardBookingModal}
              onPointerDown={preloadVillaCardBookingModal}
              onFocus={preloadVillaCardBookingModal}
              aria-label={dict.card.availabilityAriaLabel}
              className={
                "shrink-0 mx-auto inline-flex items-center justify-center gap-1.5 whitespace-nowrap " +
                "h-9 px-4 rounded-full " +
                "text-white uppercase font-medium text-[11px] tracking-[0.06em] " +
                "bg-gradient-to-r from-[#ED7926] to-[#0973BA] " +
                "shadow-[0_10px_22px_-10px_rgba(9,115,186,0.45)] " +
                "hover:shadow-[0_14px_28px_-10px_rgba(9,115,186,0.55)] hover:-translate-y-[1px] " +
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40 focus-visible:ring-offset-1 " +
                "transition-[box-shadow,transform] duration-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              }
            >
              <CalendarRange size={13} strokeWidth={1.9} aria-hidden />
              {dict.card.availabilityCta}
            </button>
          </div>
          {reserveBlock}
        </div>
      </article>
      )
      )}

    </CardOuter>

    {/* ════════════════════════════════════════════════════
        🛡️ BOOKING MODAL — LAZY MOUNT (Link DIŞINDA)
        ════════════════════════════════════════════════════
        Modal Link'in dışında render edilir → `<a>` içine
        fixed-positioned interactive content nesting'i YOK,
        HTML semantic temiz, screen reader doğru announce.

        Performance:
          - isOpen=false iken VillaCardBookingModal erken-return
            yapar (early null) → engine YOK, fetch YOK, DOM YOK
          - next/dynamic ssr:false → modal bundle parse user
            tıklayana kadar gecikir
          - Modal kendi fixed inset-0 portal-like davranışıyla
            DOM hiyerarşisinden bağımsız render olur
        Erişim:
          - villaId yoksa modal hiç render edilmez (defansif).
            Trigger butonu da id yokken set state'i tetiklerse
            buton görsel olarak çalışır ama modal mount olmaz —
            UX'i bozmaz, sadece açılmaz.
        ──────────────────────────────────────────────────── */}
    {id && isBookingOpen && VillaCardBookingModal && (
      /* Modal artık `prices` / `cleaning_*` prop'larını ALMAZ — kendi
         server-side API çağrısıyla (BookingSidebar ile birebir aynı
         kaynaktan) çeker. Bu drift kapatır: VillaCard caller'ları
         (anasayfa collection, favoriler, /arama-tarihsiz) bu prop'ları
         zaten geçmiyordu → eski implementasyonda engine boş prices
         ile mount oluyor, fiyat 0 görünüyordu. */
      <VillaCardBookingModal
        isOpen={isBookingOpen}
        onClose={() => setIsBookingOpen(false)}
        villaId={id}
        villaSlug={slug}
        villaTitle={title}
        locale={locale}
        /* 🛡️ ADDITIVE — /arama URL'inden gelen konaklama aralığı
           (`stayStart`/`stayEnd`, AramaPageBody'de zaten doğrulanmış)
           modal takviminde SEÇİLİ açılsın. Yalnız İKİSİ de varsa
           geçilir; aksi halde undefined → takvim BOŞ (mevcut davranış).
           Yeni URL parse/tarih hesabı YOK — mevcut prop zinciri. */
        initialStart={stayStart && stayEnd ? stayStart : undefined}
        initialEnd={stayStart && stayEnd ? stayEnd : undefined}
      />
    )}
    </>
  );
}

/* ===============================================================
   🛡️ CARD OUTER WRAPPER — variant-aware
   ===============================================================
   Default variant: <Link> — public detail page navigation aktif.
   Curation variant: <div> — admin "selection workspace" UX'i.
     - href yok → navigation YOK
     - cursor / focus ring YOK (clickable hissi vermez)
     - `group` class yine duruyor → image hover scale (group-hover:scale-[1.04])
       ve overlay scrim hover'ı korunur; sadece kart wrapper'ı interactive
       değil.
=============================================================== */
function CardOuter({
  isCuration,
  href,
  children,
}: {
  isCuration: boolean;
  href: string;
  children: React.ReactNode;
}) {
  if (isCuration) {
    return (
      <div className="block group rounded-[20px]">{children}</div>
    );
  }
  return (
    <Link
      href={href}
      className="
        block group rounded-[28px]
        focus:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--brand-coral)]/40
      "
    >
      {children}
    </Link>
  );
}

/* ===============================================================
   🛡️ FAZ 39K — AMENITY MINI-CARD (luxury pastel tile)
   ===============================================================
   3 tone variant — VillaCard bottom strip. Sabit yükseklik (h-24),
   kompakt typography hierarchy: büyük tabular sayı + küçük label.
   No hover scale (cinematic restraint); subtle brighten only.
=============================================================== */
type AmenityTone = "coral" | "green" | "blue";

const AMENITY_TONE: Record<
  AmenityTone,
  { surface: string; icon: string; numText: string; label: string }
> = {
  coral: {
    surface: "bg-[#FFF1EB] group-hover:bg-[#FFE6D9]",
    icon: "text-[#c84a20]",
    numText: "text-[#7a2c12]",
    label: "text-[#c25a30]",
  },
  green: {
    surface: "bg-[#EEF8F0] group-hover:bg-[#E2F2E6]",
    icon: "text-[#1f7a4d]",
    numText: "text-[#0f4429]",
    label: "text-[#36805a]",
  },
  blue: {
    surface: "bg-[#EEF4FF] group-hover:bg-[#E1ECFB]",
    icon: "text-[#1d6492]",
    numText: "text-[#0e3a59]",
    label: "text-[#356f96]",
  },
};

function AmenityMini({
  tone,
  icon,
  value,
  label,
}: {
  tone: AmenityTone;
  icon: React.ReactNode;
  value: number | string;
  label: string;
}) {
  const t = AMENITY_TONE[tone];
  return (
    <div
      className={
        "h-24 rounded-2xl px-3.5 py-3 flex flex-col justify-between " +
        "transition-colors duration-300 motion-reduce:transition-none " +
        t.surface
      }
    >
      <span className={t.icon}>{icon}</span>
      <div className="leading-none">
        <p
          className={
            "font-display text-[22px] tracking-[-0.015em] tabular-nums " +
            t.numText
          }
        >
          {value}
        </p>
        <p
          className={
            "text-[10.5px] tracking-[0.06em] mt-1 font-medium " + t.label
          }
        >
          {label}
        </p>
      </div>
    </div>
  );
}
