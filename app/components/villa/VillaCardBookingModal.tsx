"use client";

/* ===============================================================
   🛡️ VillaCardBookingModal — villa kartından booking experience
   ===============================================================
   AMAÇ:
     Villa detail sayfasına gitmeden, villa kartı üzerinden premium
     booking flow başlat. BookingSidebar ile AYNI useBookingEngine
     + AYNI child component'leri (BookingCalendar / BookingSummary /
     BookingMinStayWarning) kullanır → codebase'de TEK booking
     state machine.

   DATA PIPELINE (DRIFT-PROOF):
     Modal, engine input setinin %100'ünü SERVER-SIDE API route'tan
     alır (/api/public/villas/[id]/availability). VillaCard caller'ları
     prices/cleaning_* prop'larını her zaman geçmediği için (örn.
     anasayfa collection, favoriler), bu prop'lar engine'e
     gönderilmez — API response source-of-truth'tur.

     BookingSidebar prop                 ↔  Modal kaynağı
     ────────────────────────────────────────────────────────
     prices                               ↔  apiData.prices
     deposit                              ↔  apiData.config.deposit
     cleaning_fee                         ↔  apiData.config.cleaning_fee
     cleaning_currency                    ↔  apiData.config.cleaning_currency
     cleaning_limit                       ↔  apiData.config.cleaning_limit
     custom_prepayment_rate               ↔  apiData.config.custom_prepayment_rate
     minimum_stay_nights                  ↔  apiData.config.minimum_stay_nights
     pool_heating_fee                     ↔  apiData.config.pool_heating_fee
     pool_heating_currency                ↔  apiData.config.pool_heating_currency
     externalBlocks                       ↔  apiData.externalBlocks
     villaId / villaSlug                  ↔  Parent (VillaCard) prop

   PERFORMANCE:
     - Lazy mount: parent (VillaCard) bu component'i next/dynamic
       (ssr:false) ile import eder; isOpen=false iken bundle parse
       gecikir.
     - Modal kapalıyken NETWORK YOK: bu component yalnız mount
       olduğunda fetch eder.
     - Engine yalnız apiData hazır olduğunda mount olur (flicker yok:
       boş prices ile 0-fiyatlı kısa-flash engellenir).
     - Engine kendi reservations fetch'ini villaId değişince
       tetikler (BookingSidebar ile aynı pattern).
     - Toplam mount-açılış: 1 API round-trip + engine'in 1 reservations
       round-trip'i.

   UX:
     - Mobile: bottom drawer (slide-up, full width, rounded-t)
     - Desktop: centered modal
     - Backdrop click → close
     - ESC → close
     - Body scroll lock (mount/unmount cleanup)
     - role="dialog" aria-modal
     - Keyboard accessible
     - apiData yüklenirken minimal skeleton (header + spinner)

   DOMAIN:
     - useBookingEngine return değerleri BookingSidebar ile birebir
     - Selection / pricing / prepayment / minimum stay /
       availability merge — hepsi hook'tan
     - CTA "Rezervasyon Yap" → engine.handleReservation()
       → /rezervasyon/[slug]?... navigation (aynı URL formatı)

   ARCHITECTURE BOUNDARY:
     `fetchExternalCalendarStringsForVilla` SERVER-ONLY (dbAdmin
     kullanır). Modal client component olduğu için bu helper'ı doğrudan
     import EDEMEZ — service role key client bundle'a sızar / browser'da
     "service-role kimlik bilgisi tanımlı değil" exception atar.
     Çözüm: yalnız TYPE + EMPTY constant import. Veri için server-side
     API route çağrılır.
   =============================================================== */

import { useEffect, useState } from "react";

import {
  X,
  Users,
  ChevronDown,
} from "lucide-react";

import type { VillaPriceEmbed } from "@/lib/villa-row.types";
import {
  EMPTY_EXTERNAL_STRING_ARRAYS,
  type ExternalCalendarStringArrays,
} from "@/lib/external-calendar.public.shared";

import { useBookingEngine } from "@/app/components/villa/booking/useBookingEngine";
import type { DiscountRange } from "@/lib/price.engine";
import BookingCalendar from "@/app/components/villa/booking/BookingCalendar";
import BookingSummary from "@/app/components/villa/booking/BookingSummary";
import BookingMinStayWarning from "@/app/components/villa/booking/BookingMinStayWarning";

/* 🛡️ HAVUZ ISITMA — yerleşim turu. Checkbox artık BookingSummary'nin
   içinde render ediliyor (bkz. o dosyadaki gerekçe); bu dosyada ayrı
   format/currency import'una gerek kalmadı — apiData.config.
   pool_heating_fee/currency ve poolHeatingTotal AYNEN prop olarak
   BookingSummary'ye geçiliyor. apiData.config.pool_heating_fee hâlâ
   /api/public/villas/[id]/availability route'u üzerinden GERÇEK villa
   değerini taşır (veri zinciri değişmedi). */

/* 🛡️ PHASE 10G — locale-aware modal metinleri. `locale` OPSİYONEL,
   default "tr" → TR çıktısı (metin + tarih formatı) BİREBİR AYNI.
   Booking engine / fetch / fiyat mantığı DEĞİŞMEDİ. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { Locale } from "@/lib/i18n/config";

type Props = {
  /* Modal open/close (parent owned). false ise content render
     edilmez → mount maliyeti yok. */
  isOpen: boolean;
  onClose: () => void;

  /* VillaCard'dan zaten geçilen identity — fetch yok. */
  villaId: string;
  villaSlug: string;
  villaTitle: string;
  /** 🛡️ PHASE 10G — opsiyonel; verilmezse "tr" (eski davranış). */
  locale?: Locale;
  /** 🛡️ ADDITIVE — /arama URL'inden gelen konaklama aralığı
   *  ("YYYY-MM-DD"). Takvim bu aralık SEÇİLİ açılır; kullanıcı yeni
   *  seçim yaparsa mevcut seçim davranışı AYNEN çalışır. Verilmezse
   *  (veya tek taraflıysa) takvim BOŞ açılır — mevcut davranış.
   *  `useBookingEngine`in ZATEN var olan `initialStart`/`initialEnd`
   *  parametreleri kullanılır (BookingSidebar ile AYNI yol); yeni
   *  tarih/rezervasyon mantığı YAZILMADI. */
  initialStart?: string | null;
  initialEnd?: string | null;
};

/* API response shape — /api/public/villas/[id]/availability. */
type VillaConfig = {
  deposit: number | null;
  cleaning_fee: number | null;
  cleaning_currency: string | null;
  cleaning_limit: number | null;
  custom_prepayment_rate: number | null;
  minimum_stay_nights: number | null;
  /* 🛡️ HAVUZ ISITMA — API route (availability) bu alanları artık
     villa'nın gerçek değerleriyle döndürüyor (bkz. route.ts). */
  pool_heating_fee: number | null;
  pool_heating_currency: string | null;
  /* 🛡️ Migration 076 — sezonluk ay kısıtı. NULL = kısıtlama yok. */
  pool_heating_months: number[] | null;
};

const EMPTY_CONFIG: VillaConfig = {
  deposit: null,
  cleaning_fee: null,
  cleaning_currency: null,
  cleaning_limit: null,
  custom_prepayment_rate: null,
  minimum_stay_nights: null,
  pool_heating_fee: null,
  pool_heating_currency: null,
  pool_heating_months: null,
};

type AvailabilityApiResponse = {
  config: VillaConfig;
  prices: VillaPriceEmbed[];
  externalBlocks: ExternalCalendarStringArrays;
  /* 🛡️ ADDITIVE — route'un ZATEN var olan public servisinden
     (`getVillaDiscounts`) gelir. Eski response'larda alan yoksa
     defansif `?? []` ile "indirim yok" davranışına düşer. */
  discounts?: DiscountRange[];
};

const EMPTY_API_DATA: AvailabilityApiResponse = {
  config: EMPTY_CONFIG,
  prices: [],
  externalBlocks: EMPTY_EXTERNAL_STRING_ARRAYS,
  discounts: [],
};

export default function VillaCardBookingModal({
  isOpen,
  onClose,
  villaId,
  villaSlug,
  villaTitle,
  locale,
  initialStart,
  initialEnd,
}: Props) {
  /* === Modal mount sonrası TEK API fetch ===
     Response = BookingSidebar'ın aldığı tüm engine input'ları
     (drift-proof). isOpen=false iken fetch ASLA çalışmaz. */
  const [apiData, setApiData] = useState<AvailabilityApiResponse | null>(
    null
  );

  useEffect(() => {
    if (!isOpen) return;

    /* Her açılışta state reset — eski (stale) veri ile yeni villa
       fetch'i karışmasın. Farklı villaId ile yeniden açılırsa
       önceki villa'nın engine input'ları kısa süreliğine render
       edilirdi (flicker). null'a setlemek skeleton'a düşürür.
       React 19 `set-state-in-effect` rule trivial cascade'i flag
       eder; burada KASITLI reset — apiData prev ile next villa
       arasında karışmasın diye gerekli. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiData(null);

    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `/api/public/villas/${encodeURIComponent(villaId)}/availability`,
          {
            method: "GET",
            cache: "no-store",
            signal: ac.signal,
          }
        );
        if (!res.ok) {
          console.error(
            "[VillaCardBookingModal] availability HTTP",
            res.status
          );
          /* Defansif fallback: engine yine mount olsun (boş inputs
             ile), UI tamamen kilitlenmesin. Kullanıcı tarih seçer,
             pricing 0 görünür → en azından feedback verir. */
          if (!cancelled) setApiData(EMPTY_API_DATA);
          return;
        }
        const data = (await res.json()) as Partial<AvailabilityApiResponse>;

        if (cancelled) return;

        const sanitizedConfig: VillaConfig = {
          deposit:
            typeof data?.config?.deposit === "number"
              ? data.config.deposit
              : null,
          cleaning_fee:
            typeof data?.config?.cleaning_fee === "number"
              ? data.config.cleaning_fee
              : null,
          cleaning_currency:
            typeof data?.config?.cleaning_currency === "string"
              ? data.config.cleaning_currency
              : null,
          cleaning_limit:
            typeof data?.config?.cleaning_limit === "number"
              ? data.config.cleaning_limit
              : null,
          custom_prepayment_rate:
            typeof data?.config?.custom_prepayment_rate === "number"
              ? data.config.custom_prepayment_rate
              : null,
          minimum_stay_nights:
            typeof data?.config?.minimum_stay_nights === "number"
              ? data.config.minimum_stay_nights
              : null,
          /* 🛡️ HAVUZ ISITMA — route artık gerçek villa değerini
             döndürür; defansif parse aynı desende korunur. */
          pool_heating_fee:
            typeof data?.config?.pool_heating_fee === "number"
              ? data.config.pool_heating_fee
              : null,
          pool_heating_currency:
            typeof data?.config?.pool_heating_currency === "string"
              ? data.config.pool_heating_currency
              : null,
          /* 🛡️ Migration 076 — sezonluk ay kısıtı. Defansif parse:
             yalnız gerçek bir dizi ise geçirilir, aksi halde null. */
          pool_heating_months: Array.isArray(
            data?.config?.pool_heating_months
          )
            ? (data.config.pool_heating_months as number[])
            : null,
        };

        setApiData({
          config: sanitizedConfig,
          prices: Array.isArray(data?.prices) ? data.prices : [],
          externalBlocks:
            data?.externalBlocks || EMPTY_EXTERNAL_STRING_ARRAYS,
          /* 🛡️ ADDITIVE — mevcut alanların sanitizasyonu DEĞİŞMEDİ.
             Alan yoksa/dizi değilse [] → "indirim yok" (eski davranış). */
          discounts: Array.isArray(data?.discounts) ? data.discounts : [],
        });
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        console.error(
          "[VillaCardBookingModal] availability EXCEPTION:",
          err
        );
        if (!cancelled) setApiData(EMPTY_API_DATA);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [isOpen, villaId]);

  /* === ESC tuşu → close === */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  /* === Body scroll lock === */
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  /* Modal kapalıyken HİÇBİR ŞEY render etme. */
  if (!isOpen) return null;

  /* API hazır değilken minimal skeleton — backdrop + header + spinner.
     Engine ASLA mount olmaz (boş prices ile 0-fiyat flicker'ı önlenir). */
  if (!apiData) {
    return (
      <ModalSkeleton
        villaTitle={villaTitle}
        onClose={onClose}
        locale={locale}
      />
    );
  }

  return (
    <ModalContent
      onClose={onClose}
      villaId={villaId}
      villaSlug={villaSlug}
      villaTitle={villaTitle}
      apiData={apiData}
      locale={locale}
      initialStart={initialStart}
      initialEnd={initialEnd}
    />
  );
}

/* ───────────────────────────────────────────────────────────────
   ModalSkeleton — API yüklenirken backdrop + header + minimal spinner.
   Aynı outer DOM yapısı → açılış-anı layout shift YOK.
─────────────────────────────────────────────────────────────── */
function ModalSkeleton({
  villaTitle,
  onClose,
  locale,
}: {
  villaTitle: string;
  onClose: () => void;
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={dict.booking.modalLoadingAriaLabel}
      className="fade-in fixed inset-0 z-[1000] flex items-end sm:items-center justify-center"
    >
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />
      <div
        className="
          relative
          w-full sm:w-[min(28rem,calc(100vw-2.5rem))]
          bg-white
          rounded-t-3xl sm:rounded-3xl
          border-t sm:border border-[var(--color-stone-100)]
          shadow-[0_-24px_48px_-16px_rgb(27_26_23/0.24)] sm:shadow-[0_24px_48px_-16px_rgb(27_26_23/0.24)]
          p-5 md:p-6
          space-y-5
        "
      >
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-[var(--color-stone-100)]">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)]">
              {dict.booking.modalEyebrow}
            </p>
            <h2 className="font-display text-xl text-[var(--color-stone-900)] tracking-[-0.02em] mt-1 line-clamp-2">
              {villaTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.common.close}
            className="w-9 h-9 shrink-0 rounded-full border border-[var(--color-stone-200)] flex items-center justify-center text-[var(--color-stone-600)] hover:bg-[var(--color-sand-50)] hover:text-[var(--color-stone-900)] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <span
            className="w-8 h-8 rounded-full border-2 border-[var(--color-stone-200)] border-t-[var(--color-champagne-500)] animate-spin motion-reduce:animate-none"
            aria-hidden
          />
          <p className="text-[12px] tracking-[0.04em] text-[var(--color-stone-500)]">
            {dict.booking.modalLoading}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   ModalContent — useBookingEngine'i kullanan iç render layer.
   Yalnızca apiData hazır olunca mount edilir.
─────────────────────────────────────────────────────────────── */
type ContentProps = {
  onClose: () => void;
  villaId: string;
  villaSlug: string;
  villaTitle: string;
  apiData: AvailabilityApiResponse;
  locale?: Locale;
  /** Bkz. `Props.initialStart` — aynen aktarılır. */
  initialStart?: string | null;
  initialEnd?: string | null;
};

function ModalContent({
  onClose,
  villaId,
  villaSlug,
  villaTitle,
  apiData,
  locale,
  initialStart,
  initialEnd,
}: ContentProps) {
  const dict = getDictionary(locale);
  /* === DOMAIN — AYNI engine, TEK source-of-truth ===
     Input set BookingSidebar ile birebir aynı kaynaktan (API). */
  const engine = useBookingEngine({
    villaSlug,
    villaId,
    prices: apiData.prices,
    deposit: apiData.config.deposit ?? 0,
    cleaning_fee: apiData.config.cleaning_fee ?? 0,
    cleaning_currency: apiData.config.cleaning_currency ?? "TRY",
    cleaning_limit: apiData.config.cleaning_limit ?? 0,
    pool_heating_fee: apiData.config.pool_heating_fee,
    pool_heating_currency: apiData.config.pool_heating_currency,
    pool_heating_months: apiData.config.pool_heating_months,
    custom_prepayment_rate: apiData.config.custom_prepayment_rate,
    minimum_stay_nights: apiData.config.minimum_stay_nights,
    externalBlocks: apiData.externalBlocks,
    /* 🛡️ villa_discounts — BookingSidebar (villa detay) ile AYNI engine
       parametresi. Takvim günlük indirimli fiyatı bununla gösterir;
       özet toplam da villa detay + server-side `price-verify` ile
       TUTARLI hale gelir. Motor/hesap mantığı DEĞİŞMEDİ. */
    discounts: apiData.discounts ?? [],
    /* 🛡️ Yalnız İKİSİ de varsa hidrate edilir; tek taraflı aralıkta
       engine eski davranışına (boş seçim) düşer. */
    initialStart: initialStart && initialEnd ? initialStart : null,
    initialEnd: initialStart && initialEnd ? initialEnd : null,
  });

  const {
    startDate,
    endDate,
    /* Engine'in ZATEN döndürdüğü helper — takvim ayını konumlamak
       için kullanılır (BookingSidebar ile aynı kullanım). */
    parseLocalDate,
    adults,
    children,
    setAdults,
    setChildren,
    prepaymentRate,
    selectedNights,
    minStayThreshold,
    minimumStayValid,
    isGapOverride,
    result,
    /* 🛡️ Engine'in ZATEN ürettiği indirim karşılaştırması (originalStay /
       discountedStay). BookingSidebar ile AYNI değer; burada YENİDEN
       hesaplanmaz, yalnız paylaşılan BookingSummary'ye aktarılır. */
    activeStayDiscount,
    prepayment,
    convertedDeposit,
    handleReservation,
    /* 🛡️ HAVUZ ISITMA — apiData.config.pool_heating_fee artık gerçek
       villa değeri olduğundan poolHeatingTotal/selected aktif çalışır. */
    poolHeatingSelected,
    setPoolHeatingSelected,
    poolHeatingTotal,
    /* 🛡️ Migration 076 — sezonluk ay kısıtı (checkbox görünürlüğü). */
    poolHeatingActiveForRange,
    /* 🛡️ Başlangıç aralığı müsaitlik doğrulaması (engine). */
    availabilityPending,
    initialRangeConflict,
  } = engine;

  /* Calendar always-visible (modal'da popup pattern yok).
     currentMonth — modal local UI state. freshSelection state'i
     UX polish ile kaldırıldı (BookingCalendar onSelect kendi
     içinde completed-range-reset davranışı uygular). */
  /* 🛡️ Takvim, seçili başlangıç tarihinin AYINDA açılır (BookingSidebar
     satır ~201 ile AYNI desen; `parseLocalDate` engine'in ZATEN
     döndürdüğü helper). Tarih yoksa bugünün ayı → eski davranış. */
  const [currentMonth, setCurrentMonth] = useState<Date>(() =>
    initialStart && initialEnd ? parseLocalDate(initialStart) : new Date()
  );

  /* Guests popover — modal içinde inline dropdown. */
  const [openGuests, setOpenGuests] = useState(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={dict.booking.modalAriaLabel}
      className="fade-in fixed inset-0 z-[1000] flex items-end sm:items-center justify-center"
    >
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />

      {/* Panel */}
      <div
        className="
          relative
          w-full sm:w-[min(28rem,calc(100vw-2.5rem))]
          max-h-[92vh] sm:max-h-[88vh]
          overflow-y-auto
          bg-white
          rounded-t-3xl sm:rounded-3xl
          border-t sm:border border-[var(--color-stone-100)]
          shadow-[0_-24px_48px_-16px_rgb(27_26_23/0.24)] sm:shadow-[0_24px_48px_-16px_rgb(27_26_23/0.24)]
          p-5 md:p-6
          space-y-5
        "
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-[var(--color-stone-100)]">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)]">
              {dict.booking.modalEyebrow}
            </p>
            <h2 className="font-display text-xl text-[var(--color-stone-900)] tracking-[-0.02em] mt-1 line-clamp-2">
              {villaTitle}
            </h2>
            {/* 🛡️ GÜNLÜK FİYAT GÖSTERİMİ KALDIRILDI (UI-only, user
                request): başlıktaki "{startingPrice} / gece" satırı
                artık render EDİLMİYOR. Engine `startingPrice`'ı
                hesaplamaya DEVAM EDER (useBookingEngine dokunulmadı);
                toplam tutar / indirim / rezervasyon akışı DEĞİŞMEDİ. */}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.common.close}
            className="w-9 h-9 shrink-0 rounded-full border border-[var(--color-stone-200)] flex items-center justify-center text-[var(--color-stone-600)] hover:bg-[var(--color-sand-50)] hover:text-[var(--color-stone-900)] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
          >
            <X size={16} />
          </button>
        </div>

        {/* 🛡️ TARİH ETİKET BLOĞU KALDIRILDI (UI-only, user request):
            takvim ikonu + "Tarih" başlığı + "Tarih seç" / seçili aralık
            özeti artık render EDİLMİYOR. TARİH SEÇME FONKSİYONU AYNEN
            ÇALIŞIR — seçim aşağıdaki BookingCalendar üzerinden yapılır,
            engine state'i (startDate/endDate) ve URL'den hidrasyon
            DEĞİŞMEDİ. */}
        {/* Calendar — paylaşılan component, AYNI engine.
            UI Polish #3: wrapper w-full + box-border, padding eşit.
            BookingCalendar internally `.rdp-months !justify-center`
            kullanır → desktop + mobile DayPicker ortalanır. */}
        <div className="w-full box-border rounded-2xl border border-[var(--color-stone-100)] p-3 md:p-4">
          <BookingCalendar
            engine={engine}
            currentMonth={currentMonth}
            onCurrentMonthChange={setCurrentMonth}
            /* 🛡️ LOCALE DÜZELTMESİ (bu tur): `locale` GEÇİLMİYORDU →
               BookingCalendar kendi "tr" default'una düşüyor ve takvim
               (ay adı + hafta günleri) EN/DE modallarda da TÜRKÇE
               görünüyordu. BookingSidebar (villa detay) bu prop'u zaten
               geçiyor; modal artık onunla PARİTE. Tarih seçme, state,
               fiyat/indirim gösterimi ve dış-header kaldırma değişikliği
               ETKİLENMEZ — yalnız görünen dil doğru locale'e bağlanır. */
            locale={locale}
            /* onSelectComplete verilmedi → modal calendar açık kalır,
               selection sonrası popup close DAVRANIŞI sidebar'a özgü. */
          />
        </div>

        {/* GUESTS */}
        <div className="relative">
          <div
            onClick={() => setOpenGuests(!openGuests)}
            className="
              border border-[var(--color-stone-100)] rounded-xl
              px-4 py-3
              flex items-center gap-3
              hover:border-[var(--color-champagne-500)] transition cursor-pointer
              bg-white
            "
          >
            <Users size={16} className="text-[var(--color-champagne-500)]" />
            <div className="flex-1 min-w-0">
              <div className="text-[10.5px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)]">
                {dict.booking.guestsLabel}
              </div>
              <div className="text-sm font-medium text-[var(--color-stone-900)]">
                {formatDictionaryString(dict.booking.guestsSummary, {
                  adults,
                  children,
                })}
              </div>
            </div>
            <ChevronDown
              size={14}
              className={`text-[var(--color-stone-400)] transition ${openGuests ? "rotate-180" : ""
                }`}
            />
          </div>

          {openGuests && (
            <div className="absolute z-50 mt-2 w-full bg-white border border-[var(--color-stone-100)] rounded-2xl shadow-[0_24px_48px_-16px_rgb(27_26_23/0.18)] p-5 space-y-4">
              <Counter
                label={dict.booking.adultsLabel}
                value={adults}
                min={1}
                onChange={setAdults}
              />
              <Counter
                label={dict.booking.childrenLabel}
                value={children}
                min={0}
                onChange={setChildren}
              />
              <button
                onClick={() => setOpenGuests(false)}
                className="btn-dark w-full !py-2.5 mt-2"
              >
                {dict.booking.confirm}
              </button>
            </div>
          )}
        </div>

        {minStayThreshold > 0 &&
          !!startDate &&
          !!endDate &&
          selectedNights < minStayThreshold &&
          !isGapOverride && (
            <BookingMinStayWarning
              minStayThreshold={minStayThreshold}
              selectedNights={selectedNights}
            />
          )}

        {/* 🛡️ GAP OVERRIDE bilgi metni — gerçek boşluğun tamamı dolduruluyor →
            min_stay esnetildi. Yeni kart/modal yok; sade inline not. */}
        {isGapOverride && (
          <p className="text-[12px] text-emerald-700 bg-emerald-50/70 border border-emerald-100 rounded-xl px-3 py-2">
            {dict.booking.gapOverrideNotice}
          </p>
        )}

        {startDate && endDate && result && (
          <BookingSummary
            result={result}
            /* 🛡️ İNDİRİMLİ TUTAR — villa detay (BookingSidebar) ile AYNI
               prop, AYNI paylaşılan component, AYNI sözlük anahtarları.
               null ise satır BİREBİR eski (indirimsiz) haliyle render
               edilir; yeni markup/duplicate özet YAZILMADI. */
            activeStayDiscount={activeStayDiscount}
            prepayment={prepayment}
            prepaymentRate={prepaymentRate}
            convertedDeposit={convertedDeposit}
            deposit={apiData.config.deposit ?? 0}
            /* 🛡️ HAVUZ ISITMA — yerleşim turu. Satır artık SUMMARY'nin
               içinde (BookingSidebar ile AYNI yerleşim); değerler AYNEN
               engine'den (poolHeatingSelected/setPoolHeatingSelected/
               poolHeatingTotal — YENİ hesaplama YOK, yalnız konum değişti). */
            poolHeatingFee={apiData.config.pool_heating_fee}
            poolHeatingCurrency={apiData.config.pool_heating_currency}
            poolHeatingSelected={poolHeatingSelected}
            onPoolHeatingChange={setPoolHeatingSelected}
            poolHeatingTotal={poolHeatingTotal}
            poolHeatingActiveForRange={poolHeatingActiveForRange}
            /* 🛡️ BookingSidebar ile parite: özet metinleri modalin
               locale'inden gelsin (prop yoksa component "tr" default'una
               düşüyordu → EN/DE'de TR metin). TR çıktısı DEĞİŞMEZ. */
            locale={locale}
          />
        )}

        {/* 🛡️ Başlangıç aralığı dolu çıktı → seçim temizlendi; MEVCUT
            `conflictError` mesajı (takvimdeki çakışma uyarısıyla aynı metin
            ve görünüm). Diğer durumlarda hiçbir şey render edilmez. */}
        {initialRangeConflict && (
          <div
            role="alert"
            className="
              rounded-xl border border-red-200 bg-red-50
              px-3 py-2 text-[12.5px] text-red-700
              flex items-center gap-2
            "
          >
            <span aria-hidden>⚠️</span>
            <span className="flex-1">{dict.booking.conflictError}</span>
          </div>
        )}

        <button
          onClick={handleReservation}
          disabled={!minimumStayValid || availabilityPending || initialRangeConflict}
          /* 🛡️ DÜZ TURUNCU CTA (UI-only): `.btn-primary`nin turkuaz
             zemini + glow shadow'ları YALNIZ BU BUTONDA ezilir (global
             sınıfa DOKUNULMADI → diğer tüm butonlar aynı). Marka
             turuncusu #ED7926, beyaz metin; hover sade koyu ton,
             gradient/glass/translate efekti yok. */
          className={`btn-primary w-full !py-3.5 !text-sm !bg-[#ED7926] !bg-none !shadow-none !transform-none hover:!bg-[#d96d1f] hover:!shadow-none ${
            !minimumStayValid || availabilityPending || initialRangeConflict ? "!opacity-50 !cursor-not-allowed" : ""
          }`}
        >
          {dict.booking.bookNow}
        </button>

        <p className="text-[11px] text-[var(--color-stone-400)] text-center leading-relaxed">
          {dict.booking.feeAutoCalculated}
        </p>
      </div>
    </div>
  );
}

/* ── Helpers ── */

function Counter({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm font-medium text-[var(--color-stone-700)]">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-8 h-8 rounded-full border border-[var(--color-stone-200)] flex items-center justify-center text-[var(--color-stone-700)] hover:border-[var(--color-champagne-500)] hover:text-[var(--color-champagne-600)] transition disabled:opacity-30"
          disabled={value <= min}
        >
          −
        </button>
        <span className="w-6 text-center font-medium text-[var(--color-stone-900)]">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="w-8 h-8 rounded-full border border-[var(--color-stone-200)] flex items-center justify-center text-[var(--color-stone-700)] hover:border-[var(--color-champagne-500)] hover:text-[var(--color-champagne-600)] transition"
        >
          +
        </button>
      </div>
    </div>
  );
}
