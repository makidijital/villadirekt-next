"use client";

/* ===============================================================
   🛡️ BookingSidebar — CONTAINER/RENDER LAYER
   ===============================================================
   Domain logic'i (selection state, availability fetch, merged
   arrays, pricing, prepayment, minimum stay, navigation URL inşası)
   `useBookingEngine` hook'una delege edildi → codebase'de TEK booking
   state machine.

   Bu container yalnız:
     - UI state'i (openCalendar, openGuests, currentMonth, freshSelection)
     - DOM refs (click-outside)
     - Üst-seviye layout (price head + date pill + guests pill +
       summary + warning + CTA)

   Calendar/summary/warning gövdeleri paylaşılan child component'lere
   delege edildi (BookingCalendar, BookingSummary, BookingMinStayWarning)
   → modal aynı component'leri kullanır, drift YOK.

   DOKUNULMAYAN ÖZELLİKLER (BYTE-IDENTICAL kontrat):
     - DayPicker handler davranışı (BookingCalendar içinde)
     - Selection lifecycle (freshSelection / hasConflict / getValidEndDate)
     - Half-open `[)` semantic, adjacent reservation rule
     - alert davranışı
     - Network query'leri (engine içinde, aynı SQL)
     - Navigation URL formatı
     - Currency / pricing / prepayment hesap sonuçları
     - onClick/disabled/submit/validation handler'ları

   🎨 UI REVİZYONU (bu tur): "Booking Desk" editorial tasarım — sticky
   kaldırıldı (page.tsx'te), ağır kart yerine soft/minimal panel, ince
   separator'lar, CHECK-IN/CHECK-OUT kompozisyonu, marka gradienti CTA'da.
   Yalnız JSX/className; state/handler/prop kontratı DEĞİŞMEDİ.
   =============================================================== */

import { useEffect, useRef, useState } from "react";

import { ChevronDown, CalendarDays, Users } from "lucide-react";

import { type VillaPriceEmbed } from "@/lib/villa-row.types";
import type { DiscountRange } from "@/lib/price.engine";
import {
  EMPTY_EXTERNAL_STRING_ARRAYS,
  type ExternalCalendarStringArrays,
} from "@/lib/external-calendar.public.shared";

import { useBookingEngine } from "@/app/components/villa/booking/useBookingEngine";
/* 🛡️ Aşama 7B — BookingCalendar (react-day-picker + date-fns + RDP CSS)
   artık STATİK import EDİLMEZ → villa detayının ilk JS bundle'ından çıktı.
   Takvim zaten yalnız `openCalendar` true iken render ediliyordu (SSR'da
   hiç yok); chunk ilk açılış niyetinde (hover / pointerdown / click)
   yüklenir, dropdown ancak bileşen HAZIR olunca açılır → boş/yarım takvim
   kutusu veya layout shift OLUŞMAZ, ilk tıklama kaybolmaz. */
import type BookingCalendarComponent from "@/app/components/villa/booking/BookingCalendar";
import BookingSummary from "@/app/components/villa/booking/BookingSummary";
import BookingMinStayWarning from "@/app/components/villa/booking/BookingMinStayWarning";
/* 🛡️ PHASE 10B — locale-aware UI stringleri. `locale` opsiyonel,
   default "tr" — mevcut TR call-site'ı (kiralik-villa/[slug]/page.tsx)
   hiç değişmeden byte-identical render eder. Selection/pricing/
   navigation mantığına (useBookingEngine) DOKUNULMADI — yalnız
   `locale` engine'e ve child component'lere iletiliyor. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import { LOCALE_BCP47, type Locale } from "@/lib/i18n/config";

/* 🛡️ HAVUZ ISITMA — yerleşim turu. Satır BookingSummary'nin içine
   taşındı (bkz. o dosyadaki yorum); bu dosyada artık formatCurrency/
   useCurrency import'una gerek yok — poolHeatingFee/Currency/Total
   AYNEN prop olarak BookingSummary'ye geçiliyor, dönüşüm/format
   YENİDEN BURADA YAPILMAZ. */

/* 🛡️ PURE UI FORMAT HELPER — CHECK-IN/CHECK-OUT pill'lerinde tek bir
   tarihin gösterim biçimi. Eski tek-pill kodundaki
   `toLocaleDateString("tr-TR", { day: "numeric", month: "short" })`
   çağrısıyla BİREBİR aynı; state/hesaplama YOK, yalnız display format. */
function formatDatePillLabel(date: Date, bcp47: string): string {
  return date.toLocaleDateString(bcp47, {
    day: "numeric",
    month: "short",
  });
}

type Props = {
  villaSlug: string;
  villaId: string;
  prices: VillaPriceEmbed[];
  /* Public-safe villa_discounts (villa-discount.service.ts). */
  discounts?: DiscountRange[];
  deposit?: number;
  cleaning_fee?: number;
  cleaning_currency?: string;
  cleaning_limit?: number;
  /* 🛡️ HAVUZ ISITMA — 5. adım (migration 074, villa.service.ts →
     page.tsx zincirinden gelir). NULL/undefined/0 → seçenek hiç
     render edilmez (useBookingEngine ile aynı semantik). */
  pool_heating_fee?: number | null;
  pool_heating_currency?: string | null;
  /* 🛡️ Migration 076 — sezonluk ay kısıtı. NULL/undefined = "ay
     kısıtlaması yok" (12 ay aktif). */
  pool_heating_months?: number[] | null;
  /* Villaya özel ön ödeme oranı (override).
     null/undefined ise global settings kullanılır. */
  custom_prepayment_rate?: number | null;
  /* Minimum konaklama gece sayısı.
     null veya <=1 → enforcement YOK. Detay: useBookingEngine. */
  minimum_stay_nights?: number | null;
  /* 🛡️ Orphan-gap kuralı (admin ayarı). Default false → geçilmezse
     mevcut davranış. Villa page settings'ten değeri geçer. */
  orphanGapRuleEnabled?: boolean;
  /* /arama → detail navigasyonunda URL üzerinden gelen tarihler.
     Engine ilk render'da hidrate eder (lazy initializer). */
  initialStart?: string | null;
  initialEnd?: string | null;
  /* External iCal block date strings (server-fetched).
     Engine reservation/manual array'leriyle merge eder. */
  externalBlocks?: ExternalCalendarStringArrays;
  /* 🛡️ PHASE 10B — opsiyonel, default "tr". */
  locale?: Locale;
  /* 🛡️ Gizli villa linki (/v/[token]) — villa pasif/yayında değil;
     amaç yalnız "göster + tarih seç + fiyat hesapla". true → yalnız
     "Rezervasyon Yap" butonu render EDİLMEZ (normal rezervasyon sayfası
     pasif villayı bulamaz). Tarih seçimi, fiyat hesabı ve özet AYNEN.
     Default false → normal villa sayfaları DEĞİŞMEZ. */
  hideReservationCta?: boolean;
};

/* 🛡️ Aşama 7B — lazy BookingCalendar yükleyici (modül seviyesi, tek
   promise). Aynı sayfada tekrar tekrar indirilmez; hata olursa promise
   sıfırlanır → sonraki açılış denemesi yeniden yükler. `loadedBookingCalendar`
   client-side navigasyonla sayfaya yeniden gelindiğinde bileşenin
   anında hazır olmasını sağlar (openCalendar=false başladığı için SSR/
   hydration çıktısını etkilemez). */
type LazyCalendarComponentType = typeof BookingCalendarComponent;
let bookingCalendarPromise: Promise<LazyCalendarComponentType> | null = null;
let loadedBookingCalendar: LazyCalendarComponentType | null = null;
function loadBookingCalendar(): Promise<LazyCalendarComponentType> {
  if (!bookingCalendarPromise) {
    bookingCalendarPromise = import(
      "@/app/components/villa/booking/BookingCalendar"
    ).then(
      (mod) => {
        loadedBookingCalendar = mod.default;
        return mod.default;
      },
      (err: unknown) => {
        bookingCalendarPromise = null;
        throw err;
      }
    );
  }
  return bookingCalendarPromise;
}

export default function BookingSidebar({
  villaSlug,
  villaId,
  prices,
  discounts = [],
  deposit = 0,
  cleaning_fee = 0,
  cleaning_currency = "TRY",
  cleaning_limit = 0,
  pool_heating_fee = null,
  pool_heating_currency = "TRY",
  pool_heating_months = null,
  custom_prepayment_rate = null,
  minimum_stay_nights = null,
  orphanGapRuleEnabled = false,
  externalBlocks = EMPTY_EXTERNAL_STRING_ARRAYS,
  initialStart = null,
  initialEnd = null,
  locale,
  hideReservationCta = false,
}: Props) {
  const dict = getDictionary(locale);
  const bcp47 = LOCALE_BCP47[locale ?? "tr"];

  /* === DOMAIN — TEK SOURCE-OF-TRUTH === */
  const engine = useBookingEngine({
    villaSlug,
    villaId,
    prices,
    discounts,
    deposit,
    cleaning_fee,
    cleaning_currency,
    cleaning_limit,
    pool_heating_fee,
    pool_heating_currency,
    pool_heating_months,
    custom_prepayment_rate,
    minimum_stay_nights,
    orphanGapRuleEnabled,
    externalBlocks,
    initialStart,
    initialEnd,
    locale,
  });

  const {
    startDate,
    endDate,
    adults,
    children,
    setAdults,
    setChildren,
    prepaymentRate,
    selectedNights,
    minStayThreshold,
    minimumStayValid,
    priceUnavailable,
    isGapOverride,
    result,
    activeStayDiscount,
    prepayment,
    convertedDeposit,
    parseLocalDate,
    handleReservation,
    /* 🛡️ alert() yerine inline banner — null → gizli. */
    reservationError,
    /* 🛡️ Başlangıç aralığının müsaitliği doğrulanana kadar CTA bekler. */
    availabilityPending,
    initialRangeConflict,
    /* 🛡️ HAVUZ ISITMA — 5. adım. YENİ bir hesaplama YOK; üçü de
       useBookingEngine'den (4. adım) geldiği gibi kullanılır. */
    poolHeatingSelected,
    setPoolHeatingSelected,
    poolHeatingTotal,
    /* 🛡️ Migration 076 — sezonluk ay kısıtı (checkbox görünürlüğü). */
    poolHeatingActiveForRange,
  } = engine;


  /* === UI STATE — CONTAINER OWNS === */
  const [openGuests, setOpenGuests] = useState(false);
  const [openCalendar, setOpenCalendar] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /* 🛡️ Aşama 7B — lazy takvim bileşeni. null → henüz yüklenmedi.
     Dropdown yalnız `openCalendar && BookingCalendar` iken render edilir:
     kullanıcı tıkladığında `openCalendar` HEMEN true olur (niyet
     kaybolmaz); bileşen hazır olduğu an takvim açılır. Bu arada dışarı
     tıklanırsa mevcut click-outside handler'ı `openCalendar`'ı kapatır →
     bekleyen açılış da iptal olur (eski davranışla aynı semantik). */
  const [BookingCalendar, setBookingCalendar] =
    useState<LazyCalendarComponentType | null>(() => loadedBookingCalendar);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const ensureBookingCalendar = () => {
    if (BookingCalendar) return;
    loadBookingCalendar()
      .then((Cal) => {
        /* Unmount sonrası state güncellemesi YAPILMAZ. */
        if (isMountedRef.current) setBookingCalendar(() => Cal);
      })
      .catch(() => {
        /* Chunk yüklenemezse takvim açılmaz; sonraki tıklama yeniden
           dener (promise sıfırlandı). */
      });
  };
  const guestsRef = useRef<HTMLDivElement>(null);

  /* currentMonth: takvim ilk açıldığında hangi ayı göstereceği.
     initialStart varsa o ay açılır → kullanıcı tarihlerini
     hemen görür. Yoksa bugünün ayı (eski davranış). */
  const [currentMonth, setCurrentMonth] = useState<Date>(() =>
    initialStart ? parseLocalDate(initialStart) : new Date()
  );
  /* freshSelection state'i kaldırıldı (UX polish — Booking.com pattern).
     Eskiden: pill açılışında freshSelection=true → calendar ilk click
     reset yapardı. Karmaşık state machine'di.
     Yeni: completed range varsa BookingCalendar onSelect kendi içinde
     resetler (selectedDay yeni `from` olur). Pill açılışında özel state
     gerekmiyor — kullanıcı önceki range'i görür, yeni güne tıklayınca
     reset olur (Booking.com/Airbnb davranışı). */

  /* === CLICK-OUTSIDE — UI dropdown close === */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (ref.current && target && !ref.current.contains(target)) {
        setOpenCalendar(false);
      }
      if (
        guestsRef.current &&
        target &&
        !guestsRef.current.contains(target)
      ) {
        setOpenGuests(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      className="
        relative rounded-[22px]
        bg-white border border-[var(--color-stone-200)]/70
        shadow-[0_18px_44px_-30px_rgba(10,22,51,0.38)]
        px-5 py-5 md:px-6 md:py-6
        space-y-4
      "
    >
      {/* İnce marka accent'i — kartın üst kenarında (gradient/glow YOK). */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-6 right-6 top-0 h-[3px] rounded-b-full bg-brand"
      />
      {/* ═══ EDİTORYAL GİRİŞ — "Booking Desk" başlığı (yeni, kısa/genel
          UI metni; gerçek işlev/metinlere dokunulmadı). ═══ */}
      <div>
        <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-stone-400)]">
          <span
            aria-hidden="true"
            className="inline-block w-3.5 h-px bg-brand "
          />
          {dict.booking.sidebarEyebrow}
        </span>
        <h2 className="mt-1.5 font-display font-bold text-[20px] leading-tight tracking-[-0.02em] text-[#0A1633]">
          {dict.booking.sidebarTitle}
        </h2>
        <p className="mt-1 text-[12.5px] text-[var(--color-stone-500)] leading-snug">
          {dict.booking.sidebarSubtitle}
        </p>
      </div>

      {/* DATE — mevcut tarih seçim state/behavior/handler AYNEN; yalnız
         CHECK-IN / CHECK-OUT kompozisyonuna çevrildi. */}
      {/* 🛡️ id="booking-date-field" — MobileBookingCta scroll hedefi.
         Yalnız anchor; tasarım/tarih-seçim mantığı DEĞİŞMEZ. */}
      <div ref={ref} id="booking-date-field" className="relative">
        <div
          /* 🛡️ Aşama 7B — açılış niyetinde (fare üstüne gelme / basma)
             chunk'ı önceden yükle; yalnız network isteği başlatır,
             UI/state DEĞİŞMEZ. */
          onPointerEnter={ensureBookingCalendar}
          onPointerDown={ensureBookingCalendar}
          onClick={() => {
            /* 🛡️ Başlangıç aralığı dolu çıkıp seçim temizlendiyse takvim
               yine aranan ayda açılır (bugünün ayına düşmez). Seçim varsa
               veya URL tarihi yoksa davranış AYNEN. */
            const targetMonth =
              endDate ||
              startDate ||
              (initialRangeConflict && initialStart
                ? parseLocalDate(initialStart)
                : new Date());
            setCurrentMonth(targetMonth);
            setOpenCalendar(true);
            ensureBookingCalendar();
          }}
          className={
            "group relative flex flex-col cursor-pointer rounded-2xl border px-4 py-3 pr-10 " +
            "transition-colors duration-200 motion-reduce:transition-none " +
            (openCalendar
              ? "border-brand bg-brand/[0.04]"
              : "border-[var(--color-stone-200)] hover:border-brand/40")
          }
        >
          <CalendarDays
            size={15}
            strokeWidth={1.8}
            aria-hidden
            className="absolute right-4 bottom-3.5 text-brand/70"
          />
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)] group-hover:text-brand transition-colors duration-200 motion-reduce:transition-none">
              {dict.booking.checkInPillLabel}
            </div>
            <div className="mt-0.5 text-[16px] font-semibold text-[var(--color-stone-900)] truncate">
              {startDate
                ? formatDatePillLabel(startDate, bcp47)
                : dict.booking.selectDatePlaceholder}
            </div>
          </div>

          <span
            aria-hidden="true"
            className="my-2.5 h-px w-full bg-[var(--color-stone-100)]"
          />

          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)] group-hover:text-brand transition-colors duration-200 motion-reduce:transition-none">
              {dict.booking.checkOutPillLabel}
            </div>
            <div className="mt-0.5 text-[16px] font-semibold text-[var(--color-stone-900)] truncate">
              {endDate
                ? formatDatePillLabel(endDate, bcp47)
                : dict.booking.selectDatePlaceholder}
            </div>
          </div>

          <ChevronDown
            size={15}
            className={`absolute right-4 top-3.5 text-[var(--color-stone-400)] transition-transform duration-200 motion-reduce:transition-none ${
              openCalendar ? "rotate-180" : ""
            }`}
          />
        </div>

        {openCalendar && BookingCalendar && (
          <div
            className="
              absolute right-0 z-[999] mt-3 bg-white border border-[var(--color-stone-100)]
              rounded-2xl shadow-[0_16px_40px_-16px_rgba(0,0,0,0.16)]
              p-4 md:p-5
              w-[min(22rem,calc(100vw-2.5rem))]
            "
          >
            <BookingCalendar
              engine={engine}
              currentMonth={currentMonth}
              onCurrentMonthChange={setCurrentMonth}
              onSelectComplete={() => setOpenCalendar(false)}
              locale={locale}
            />
          </div>
        )}
      </div>

      {/* GUESTS — mevcut guest selector state/behavior/handler AYNEN. */}
      <div ref={guestsRef} className="relative">
        <div
          onClick={() => setOpenGuests(!openGuests)}
          className={
            "group flex items-center gap-3 cursor-pointer rounded-2xl border px-4 py-3 " +
            "transition-colors duration-200 motion-reduce:transition-none " +
            (openGuests
              ? "border-brand bg-brand/[0.04]"
              : "border-[var(--color-stone-200)] hover:border-brand/40")
          }
        >
          <span
            aria-hidden="true"
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand/[0.08] text-brand"
          >
            <Users size={15} strokeWidth={1.8} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)] group-hover:text-brand transition-colors duration-200 motion-reduce:transition-none">
              {dict.booking.guestsLabel}
            </div>
            <div className="mt-0.5 text-[14.5px] font-semibold text-[var(--color-stone-900)]">
              {formatDictionaryString(dict.booking.guestsSummary, {
                adults,
                children,
              })}
            </div>
          </div>
          <ChevronDown
            size={15}
            className={`shrink-0 text-[var(--color-stone-400)] transition-transform duration-200 motion-reduce:transition-none ${
              openGuests ? "rotate-180" : ""
            }`}
          />
        </div>

        {openGuests && (
          <div className="absolute z-50 mt-2 w-full bg-white border border-[var(--color-stone-100)] rounded-2xl shadow-[0_16px_40px_-16px_rgba(0,0,0,0.16)] p-5 space-y-4">
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
              className="w-full rounded-full bg-[var(--color-stone-900)] hover:bg-[var(--color-stone-800)] text-white text-[13px] font-semibold py-2.5 transition-colors duration-200 motion-reduce:transition-none"
            >
              {dict.booking.confirm}
            </button>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════
          🛡️ FAZ 26B — MINIMUM STAY WARNING CARD
          ═══════════════════════════════════════════════════════
          Yalnız: threshold>0 + BOTH dates selected + nights<threshold.
          Konum: SUMMARY yerine aynı blokta render olur → layout
          shift YOK (warning ile summary mutually exclusive). Koşul AYNEN. */}
      {minStayThreshold > 0 &&
        !!startDate &&
        !!endDate &&
        selectedNights < minStayThreshold &&
        !isGapOverride && (
          <BookingMinStayWarning
            minStayThreshold={minStayThreshold}
            selectedNights={selectedNights}
            locale={locale}
          />
        )}

      {/* 🛡️ EKSİK SEZON FİYATI — yanlış/düşük tutar göstermek yerine
          durumu açıkça bildir. Yalnız fiyatı tanımlı olmayan gece
          varken render edilir; diğer TÜM durumlarda hiçbir şey
          değişmez (additive blok). */}
      {priceUnavailable && (
        <p
          role="status"
          className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2"
        >
          {dict.booking.priceUnavailableNotice}
        </p>
      )}

      {/* 🛡️ GAP OVERRIDE bilgi metni — koşul AYNEN. */}
      {isGapOverride && (
        <p className="text-[12px] text-emerald-700 bg-emerald-50/70 border border-emerald-100 rounded-xl px-3 py-2">
          {dict.booking.gapOverrideNotice}
        </p>
      )}

      {/* SUMMARY — minimum stay valid + result mevcut ise (koşul AYNEN).
         İnce üst-ayraç ile akışa entegre; BookingSummary'nin kendi
         içeriğine/hesabına dokunulmadı. */}
      {startDate && endDate && result && (
        <div className="rounded-2xl bg-[var(--color-stone-50)] px-4 py-4">
          <BookingSummary
            result={result}
            activeStayDiscount={activeStayDiscount}
            prepayment={prepayment}
            prepaymentRate={prepaymentRate}
            convertedDeposit={convertedDeposit}
            deposit={deposit}
            /* 🛡️ HAVUZ ISITMA — yerleşim turu. Satır artık SUMMARY'nin
               içinde (Kısa Süreli Konaklama Ücreti altında); değerler
               AYNEN engine'den (poolHeatingSelected/setPoolHeatingSelected/
               poolHeatingTotal — YENİ hesaplama YOK, yalnız konum değişti). */
            poolHeatingFee={pool_heating_fee}
            poolHeatingCurrency={pool_heating_currency}
            poolHeatingSelected={poolHeatingSelected}
            onPoolHeatingChange={setPoolHeatingSelected}
            poolHeatingTotal={poolHeatingTotal}
            poolHeatingActiveForRange={poolHeatingActiveForRange}
            locale={locale}
          />
        </div>
      )}

      {/* 🛡️ INLINE RESERVATION ERROR — alert() yerine modern banner
          (koşul AYNEN). */}
      {reservationError && (
        <div
          role="alert"
          className="
            rounded-xl border border-red-200 bg-red-50
            px-3 py-2 text-[12.5px] text-red-700
            flex items-center gap-2
          "
        >
          <span aria-hidden>⚠️</span>
          <span className="flex-1">{reservationError}</span>
        </div>
      )}

      {/* CTA — FAZ 26B: minimum stay invalid → disabled (koşul AYNEN).
          onClick/disabled/handler DEĞİŞMEDİ; yalnız görünüm yenilendi. */}
      <div className="space-y-2.5">
        {!hideReservationCta && (
          <button
            onClick={handleReservation}
            disabled={!minimumStayValid || priceUnavailable || availabilityPending || initialRangeConflict}
            className={`
              w-full h-[50px] rounded-[15px]
              text-[13.5px] font-bold tracking-[0.02em] text-white
              transition-all duration-200 motion-reduce:transition-none
              ${
                !minimumStayValid || priceUnavailable || availabilityPending || initialRangeConflict
                  ? "bg-[var(--color-stone-300)] cursor-not-allowed"
                  : "bg-brand hover:bg-brand-strong shadow-[0_10px_22px_-12px_color-mix(in_srgb,var(--color-brand)_55%,transparent)] hover:shadow-[0_14px_28px_-12px_color-mix(in_srgb,var(--color-brand)_60%,transparent)] hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
              }
            `}
          >
            {dict.booking.bookNow}
          </button>
        )}

        <p className="text-[11px] text-[var(--color-stone-400)] text-center leading-relaxed">
          {dict.booking.feeAutoCalculated}
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════
          🛡️ ÖDEME FIRSATI — "Öne Çıkan" alanının YERİNE geldi.
          ═══════════════════════════════════════════════════════
          Oran ARTIK DİNAMİK: mevcut `prepaymentRate` (useBookingEngine'den,
          BookingSummary'nin de kullandığı AYNI değer — villa override →
          global settings → engine'in kendi fallback'i; kanonik hesap
          BookingSidebar/engine içinde zaten var, burada YENİDEN
          hesaplanmadı/fetch edilmedi). Görünürlük guard'ı PrepaymentBadge
          ile AYNI kural: yalnız 0 < oran < 100 iken gösterilir (aksi halde
          "%0" / "%100 şimdi..." gibi anlamsız metin render edilmez).
          Bu, galerinin sol-üstündeki eski PrepaymentBadge overlay'inin
          YERİNE geçen TEK gösterim — aynı kampanya artık iki yerde
          render edilmiyor. Hesaplama/API/DB çağrısı hâlâ YOK; yalnız
          UI text/data-binding düzeltmesi. Konum: rezervasyon formunun
          EN ALTI (değişmedi). */}
      {prepaymentRate > 0 && prepaymentRate < 100 && (
        <div>
          {/* Kompakt ödeme fırsatı satırı — içerik/oran AYNEN, büyük blok yerine. */}
          <div className="rounded-2xl border border-[var(--color-stone-100)] bg-accent/[0.06] px-4 py-3">
            <span className="inline-flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-[var(--color-stone-400)]">
              {dict.booking.installmentEyebrow}
            </span>

            <div className="mt-1.5 flex items-center gap-3">
              <span
                className="
                  shrink-0 font-display font-bold text-[28px]
                  leading-none tracking-[-0.02em] text-brand
                "
              >
                %{prepaymentRate}
              </span>
              <span
                aria-hidden="true"
                className="h-8 w-px shrink-0 bg-[var(--color-stone-200)]"
              />
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-[var(--color-stone-900)] leading-snug">
                  {dict.booking.payNowPerk}
                </p>
                <p className="mt-0.5 text-[12.5px] text-[var(--color-stone-500)] leading-snug">
                  {dict.booking.payAtCheckinPerk}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
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
          className="w-8 h-8 rounded-full border border-[var(--color-stone-200)] flex items-center justify-center text-[var(--color-stone-700)] hover:border-accent/60 hover:text-brand transition disabled:opacity-30"
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
          className="w-8 h-8 rounded-full border border-[var(--color-stone-200)] flex items-center justify-center text-[var(--color-stone-700)] hover:border-accent/60 hover:text-brand transition"
        >
          +
        </button>
      </div>
    </div>
  );
}
