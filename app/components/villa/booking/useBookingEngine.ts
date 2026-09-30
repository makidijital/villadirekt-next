"use client";

/* ===============================================================
   🛡️ useBookingEngine — TEK BOOKING STATE MACHINE
   ===============================================================
   AMAÇ:
     BookingSidebar'ın domain logic'i (selection state, availability
     fetch + parse, merged arrays, pricing pipeline, prepayment,
     minimum stay, navigation URL inşası) bu hook'a taşındı.
     BookingSidebar yalnız container/render katmanı; bu hook'tan
     gelen değerleri ve handler'ları kullanır.

     Aynı hook VillaCardBookingModal tarafından da kullanılır →
     codebase'de **TEK** booking state machine.

   BYTE-IDENTICAL KONTRAT:
     - useState init values: AYNI
     - useEffect deps + body: AYNI
     - eski sağlayıcı query'leri: AYNI
       (reservations.in(['pending','confirmed']) + manual_reservations
        — Faz 2B allow-list contract)
     - parse/merge/expand logic: AYNI
     - hasConflict / isIntersection / getValidEndDate: AYNI
     - calculateGrandTotal / calculatePrepayment çağrı semantic: AYNI
     - handleReservation URL formatı: AYNI
     - alert davranışı: AYNI

   DOKUNULMAYAN PURE HELPER'LAR (re-used aynen):
     - lib/date-range > getValidEndDate
     - lib/price.engine > calculateGrandTotal, calculateNights,
       calculatePrepayment
     - lib/currency > convertPrice, formatCurrency
     - lib/villa-row.types > normalizePriceRanges
     - lib/external-calendar.public.helper > externalStringsToDateArrays,
       EMPTY_EXTERNAL_STRING_ARRAYS
     - app/services/settings.service > getSettings

   🛡️ HAVUZ ISITMA — 4. adım (public booking engine altyapısı, migration
   074 + price.engine 2. adım üzerine).
     - Yeni input (opsiyonel, güvenli default): pool_heating_fee,
       pool_heating_currency. Mevcut caller'lar (BookingSidebar,
       VillaCardBookingModal) bu prop'ları hiç geçmez → BYTE-IDENTICAL
       davranış korunur (pool_heating_fee=0 → calculateGrandTotal
       içindeki calculatePoolHeatingFee 0 döner, total değişmez).
     - Yeni state: poolHeatingSelected (başlangıç false; villaId
       değişince false'a reset — reservations-fetch effect'i ile aynı
       dep). poolHeatingTotal AYRI bir state DEĞİL — result.poolHeating
       üzerinden türetilir (result zaten calculateGrandTotal'ın
       pool_heating_selected/fee/currency parametreleriyle hesaplıyor;
       burada YENİ bir hesaplama YAZILMADI).
     - calculateGrandTotal / accommodationBase çağrı semantic'i: pool
       heating parametreleri EKLENDİ (mevcut cleaning_fee/cleaning_currency/
       cleaning_limit parametreleri AYNEN); accommodationBase artık 3.
       parametre (poolHeating) ile çağrılıyor — prepayment yine SADECE
       konaklama bedelinden hesaplanır (cleaning + pool heating hariç).
     - UI bağlantısı bu adımda YOK — poolHeatingSelected/setPoolHeatingSelected/
       poolHeatingTotal yalnız return'de expose edilir; BookingSidebar/
       VillaCardBookingModal/ReservationForm bu adımda DOKUNULMADI.
   =============================================================== */

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

/* 🛡️ FAZ 2 frontend purge — `import { eski sağlayıcı }` KALDIRILDI.
   `get_villa_blocked_ranges` RPC artık /api/public/villas/[id]/blocked-ranges
   fetch boundary'sinden çekilir; SECURITY DEFINER semantic ve PII-safe
   payload aynen korunur. */
import { useCurrency } from "@/app/context/CurrencyContext";
import { convertPrice, formatCurrency } from "@/lib/currency";

import { getPublicSettingsAction as getPublicSettings } from "@/app/services/settings.action";

import {
  calculateGrandTotal,
  calculateStayTotal,
  calculateNights,
  calculatePrepayment,
  accommodationBase,
  isPoolHeatingActiveForRange,
  getActiveDiscount,
  /* 🛡️ Takvim hücresindeki İNDİRİMLİ günlük fiyat için — `PriceList.tsx`
     (villa detay sezon listesi) ve VillaCard discount variant'ının
     KULLANDIĞI AYNI pure fonksiyon. Yeni indirim formülü YAZILMADI. */
  applyDiscountToDailyPrice,
  type DiscountRange,
} from "@/lib/price.engine";

/* getValidEndDate → lib/date-range (TEK source-of-truth).
   BookingSidebar'da kullanıldığı şekliyle aynen burada da
   re-export edilir; consumer'lar engine üzerinden alabilir. */
import { getValidEndDate } from "@/lib/date-range";

import {
  normalizePriceRanges,
  type VillaPriceEmbed,
  type PriceRange,
} from "@/lib/villa-row.types";

import {
  externalStringsToDateArrays,
  EMPTY_EXTERNAL_STRING_ARRAYS,
  type ExternalCalendarStringArrays,
} from "@/lib/external-calendar.public.shared";

/* 🛡️ Orphan-gap kontrolü — SAF helper (availability toplamaz; occupied
   gece kümesi + minStay + today verilir, karar döner). Mevcut min-stay/
   gap-fill mantığını BOZMAZ; yalnız orphan bırakan seçimi ek olarak eler. */
import { evaluateOrphanGap } from "@/lib/stay-rules.helper";

/* 🛡️ PHASE 10B — YALNIZ 3 reservationError string'i + handleReservation
   navigation URL'ine (EN/DE için) `&locale=` query param'ı eklemek için.
   `locale` opsiyonel, default "tr" (getDictionary(undefined) zaten TR'ye
   düşer) — mevcut TR caller'ları (BookingSidebar, VillaCardBookingModal)
   bu prop'u hiç geçmeden BYTE-IDENTICAL çalışır (dict TR metinleriyle
   birebir aynı; URL'e hiçbir ek query param eklenmez — bkz. aşağıdaki
   `locale && locale !== "tr"` guard). Selection/availability/pricing/
   min-stay/orphan-gap HESAP MANTIĞINA KESİNLİKLE DOKUNULMADI. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
/* 🛡️ NAVIGATION LOCALE KORUMASI — projenin MEVCUT merkezi helper'ı
   (lib/i18n/locale-href.ts). Yeni i18n/routing sistemi DEĞİL; Header,
   Footer, BottomNav, AramaPageBody, HeroSearchPanel, VillaSearchBox ve
   diğer public call-site'lar zaten bunu kullanıyor. */
import { localeHref } from "@/lib/i18n/locale-href";

/* ===============================================================
   INPUT KONTRAT
   ===============================================================
   BookingSidebar Props ile birebir aynı shape.
   externalBlocks default EMPTY → backward-compat. */
export type UseBookingEngineInput = {
  villaSlug: string;
  villaId: string;
  prices: VillaPriceEmbed[];
  /* Public-safe villa_discounts (villa-discount.service.ts). Opsiyonel;
     mevcut caller'lar geçmeden BYTE-IDENTICAL çalışır (calculateGrandTotal
     discounts=null → indirimsiz mevcut davranış). */
  discounts?: DiscountRange[] | null;
  deposit?: number;
  cleaning_fee?: number;
  cleaning_currency?: string;
  cleaning_limit?: number;
  custom_prepayment_rate?: number | null;
  minimum_stay_nights?: number | null;
  /* 🛡️ Orphan-gap kuralı (admin ayarı) — açıksa min-stay'den kısa
     kullanılamaz boşluk bırakan seçim engellenir. Default false (hook
     seviyesi); gerçek değer settings'ten prop olarak geçilir (villa page). */
  orphanGapRuleEnabled?: boolean;
  externalBlocks?: ExternalCalendarStringArrays;
  initialStart?: string | null;
  initialEnd?: string | null;

  /* 🛡️ HAVUZ ISITMA — 4. adım (migration 074 villa alanları).
     NULL/undefined/0 → hizmet yok (calculateGrandTotal içindeki
     calculatePoolHeatingFee zaten bu semantiği uygular). Opsiyonel;
     mevcut caller'lar geçmeden BYTE-IDENTICAL çalışır. */
  pool_heating_fee?: number | null;
  pool_heating_currency?: string | null;

  /* 🛡️ Migration 076 — sezonluk ay kısıtı. NULL/undefined = "ay
     kısıtlaması yok" (12 ay aktif) — mevcut caller'lar geçmeden
     BYTE-IDENTICAL çalışır. */
  pool_heating_months?: number[] | null;

  /* 🛡️ PHASE 10B — opsiyonel, default "tr". Yalnız reservationError
     mesajları + handleReservation navigation URL'i (EN/DE `&locale=`
     query param'ı) için kullanılır. */
  locale?: Locale;
};

/* ===============================================================
   GRAND TOTAL RESULT (calculateGrandTotal return shape mirror).
   `null` ise: minimum stay invalid veya tarih seçimi tamamlanmadı.
   Engine'in kendi return tipini referans alıyoruz → drift yok. */
export type BookingResult = ReturnType<typeof calculateGrandTotal>;

/* ===============================================================
   🛡️ VILLA_DISCOUNTS — GÖRSEL GÖSTERİM İÇİN (Adım 3, UI-only)
   ===============================================================
   SADECE display amaçlı; `result.stay`/`result.total` (gerçek
   rezervasyon/ödeme tutarı) BU DEĞERDEN ETKİLENMEZ, tersi de geçerli
   değil — `activeStayDiscount` yalnız "normal fiyat" karşılaştırması
   için AYRICA hesaplanır, mevcut `result` hesaplamasına hiçbir
   şekilde karışmaz.

   `originalStay`/`discountedStay` — İKİSİ DE price.engine'in ZATEN
   var olan `calculateStayTotal`/`getActiveDiscount` export'ları ile
   üretilir (YENİ bir indirim formülü YAZILMADI): `discountedStay`
   mevcut `result.stay` ile AYNI kaynak/parametrelerden gelir;
   `originalStay` AYNI fonksiyonun `discounts: null` ile ikinci
   (salt-okunur, side-effect'siz) çağrısıdır — "indirim yokmuş gibi"
   normal fiyatı verir. `discount` — seçili aralıkta aktif olan ham
   villa_discounts kaydı (tarih aralığı + tür + değer), yalnız bilgi
   amaçlı gösterim için. */
export type ActiveStayDiscount = {
  originalStay: number;
  discountedStay: number;
  discount: DiscountRange;
};

export type UseBookingEngineReturn = {
  /* Selection state — React.Dispatch sığasıyla aynı (functional update
     desteği dahil). Narrowing yok → BookingSidebar'ın setStartDate
     kullanım yüzeyi bire bir korunur. */
  startDate: Date | null;
  endDate: Date | null;
  setStartDate: Dispatch<SetStateAction<Date | null>>;
  setEndDate: Dispatch<SetStateAction<Date | null>>;
  adults: number;
  children: number;
  setAdults: Dispatch<SetStateAction<number>>;
  setChildren: Dispatch<SetStateAction<number>>;

  /* Merged availability arrays
     (confirmed + manual + external — 3 source concat) */
  mergedBlockedDates: Date[];
  mergedCheckinDates: Date[];
  mergedCheckoutDates: Date[];

  /* Pending arrays (single source, no manual/external pending) */
  pendingCheckinDates: Date[];
  pendingCheckoutDates: Date[];
  pendingMiddleDates: Date[];

  /* Derived (calc engine + helpers) */
  normalizedPrices: PriceRange[];
  prepaymentRate: number;
  today: Date;
  selectedNights: number;
  minStayThreshold: number;
  minimumStayValid: boolean;
  /* Orphan-gap kuralı: seçim min-stay'den kısa kullanılamaz boşluk
     bırakmıyor mu. Kural kapalıysa / min-stay<2 ise her zaman true. */
  orphanGapValid: boolean;
  /* 🛡️ Gap override aktif mi? (seçim, mevcut rezervasyonlar arasındaki
     gerçek bir gap'in tamamını dolduruyor → min_stay esnetildi). UI bunu
     kullanarak min-stay uyarısını bastırır + bilgi metni gösterir. */
  isGapOverride: boolean;
  result: BookingResult | null;
  /* 🛡️ EKSİK SEZON FİYATI — seçilen aralıkta fiyatı tanımlı olmayan
     gece varsa true (bu durumda `result` null'dır). Tam kapsanan
     aralıklarda DAİMA false → mevcut davranış BİREBİR aynı. */
  priceUnavailable: boolean;
  /* 🛡️ VILLA_DISCOUNTS — UI-only karşılaştırma (bkz. type doc-comment).
     null → seçili aralıkta aktif indirim yok (mevcut davranış, badge
     render edilmez). */
  activeStayDiscount: ActiveStayDiscount | null;
  prepayment: number;
  convertedDeposit: number;
  startingPrice: string;

  /* 🛡️ HAVUZ ISITMA — 4. adım (booking engine altyapısı; UI bu adımda
     hiçbir component tarafından tüketilmiyor olabilir — normal).
     poolHeatingTotal display currency'de (result.poolHeating ile aynı —
     result null ise 0). */
  poolHeatingSelected: boolean;
  setPoolHeatingSelected: Dispatch<SetStateAction<boolean>>;
  poolHeatingTotal: number;

  /* 🛡️ Migration 076 — sezonluk ay kısıtı. Checkbox görünürlüğü için;
     BookingSummary'nin `poolHeatingActiveForRange` prop'una geçirilir. */
  poolHeatingActiveForRange: boolean;

  /* Pure helpers (closure over engine state) */
  parseLocalDate: (s: string) => Date;
  formatDate: (d: Date) => string;
  isIntersection: (date: Date) => boolean;
  hasConflict: (start: Date, end: Date) => boolean;
  getPriceForDate: (date: Date) => number | null;
  /** Günlük İNDİRİMLİ fiyat (yalnız gerçek indirim varsa); aksi halde
   *  null → tüketici mevcut tek-fiyat görünümünü korur. */
  getDiscountedPriceForDate: (date: Date) => number | null;

  /* Submit — navigation URL inşası + window.location.href.
     BookingSidebar'daki davranışla birebir aynı; eski alert()
     çağrıları yerine `reservationError` state'i set edilir. */
  handleReservation: () => void;

  /* 🛡️ Modern feedback layer — alert() yerine inline banner state.
     null → gizli; string → banner gösterilir; 3sn sonra auto-clear. */
  reservationError: string | null;

  /* 🛡️ BAŞLANGIÇ ARALIĞI MÜSAİTLİK DOĞRULAMASI
     availabilityPending: URL/prop'tan gelen aralık hâlâ seçili ve
       müsaitlik henüz yüklenmedi → CTA beklemeli, fiyat yok.
     initialRangeConflict: aralık dolu çıktı → seçim null verildi,
       `reservationError` mevcut `conflictError` mesajını taşır.
     Başlangıç aralığı yoksa / kullanıcı seçimi değiştirdiyse ikisi de
     DAİMA false → mevcut davranış BİREBİR. */
  availabilityPending: boolean;
  initialRangeConflict: boolean;
};

/* ===============================================================
   HOOK BODY
   =============================================================== */
export function useBookingEngine(
  input: UseBookingEngineInput
): UseBookingEngineReturn {
  const {
    villaSlug,
    villaId,
    prices,
    discounts = null,
    deposit = 0,
    cleaning_fee = 0,
    cleaning_currency = "TRY",
    cleaning_limit = 0,
    custom_prepayment_rate = null,
    minimum_stay_nights = null,
    orphanGapRuleEnabled = false,
    externalBlocks = EMPTY_EXTERNAL_STRING_ARRAYS,
    initialStart = null,
    initialEnd = null,
    pool_heating_fee = 0,
    pool_heating_currency = "TRY",
    pool_heating_months = null,
    locale,
  } = input;

  const { currency, rates } = useCurrency();
  const dict = getDictionary(locale);

  /* 🛡️ FAZ 55K — Data boundary normalization (currency garantisi).
     `prices` raw DB-shape; normalizePriceRanges null start/end
     satırlarını eler ve currency null/empty → "TRY" fallback uygular.
     calculateGrandTotal ve getPriceForDate aynı normalize edilmiş
     array'i okur → tutarlı + TS-strict. */
  const normalizedPrices = useMemo(
    () => normalizePriceRanges(prices),
    [prices]
  );

  /* 🛡️ parseLocalDate — hook-lokal helper.
     useState lazy initializer'lar bu fonksiyonu çağırdığı için
     declaration sırası ÖNEMLİ: tüm useState bloklarından ÖNCE
     tanımlı olmalı, yoksa TDZ ("can't access ... before
     initialization") hatası. Davranış AYNI: "YYYY-MM-DD" →
     LOCAL midnight Date. */
  const parseLocalDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("T")[0].split("-");
    return new Date(Number(year), Number(month) - 1, Number(day));
  };

  /* 🛡️ Lazy initializer — sadece ilk render'da hidrate; sonraki
     re-render'larda hesaplama yeniden yapılmaz. parseLocalDate
     LOCAL midnight üretir; UTC drift yok. */
  /* 🛡️ HAM seçim state'i. Tüketicilere doğrudan DEĞİL, aşağıdaki
     "BAŞLANGIÇ ARALIĞI MÜSAİTLİK DOĞRULAMASI" bloğundan geçen
     `startDate`/`endDate` olarak verilir (dolu başlangıç aralığı
     seçili gösterilmez). Setter'lar AYNEN expose edilir. */
  const [selectedStart, setStartDate] = useState<Date | null>(() =>
    initialStart ? parseLocalDate(initialStart) : null
  );
  const [selectedEnd, setEndDate] = useState<Date | null>(() =>
    initialEnd ? parseLocalDate(initialEnd) : null
  );

  /* 🛡️ URL / prop ile gelen başlangıç aralığı (yalnız ikisi de varsa).
     Yalnız ilk render'da yakalanır — kullanıcı seçimi bununla
     karşılaştırılıp "hâlâ başlangıç seçimi mi?" sorusu cevaplanır. */
  const [initialRange] = useState<{ start: Date; end: Date } | null>(() =>
    initialStart && initialEnd
      ? { start: parseLocalDate(initialStart), end: parseLocalDate(initialEnd) }
      : null
  );

  /* 🛡️ Müsaitlik (blocked-ranges) fetch'i sonuçlandı mı? Başarı VEYA
     hata → true. Hata durumunda MEVCUT fail-open davranış korunur
     (takvim boş kabul edilir); asıl garanti server-side doğrulamadır. */
  const [availabilityChecked, setAvailabilityChecked] = useState(false);

  const [blockedDates, setBlockedDates] = useState<Date[]>([]);
  const [checkinDates, setCheckinDates] = useState<Date[]>([]);
  const [checkoutDates, setCheckoutDates] = useState<Date[]>([]);

  const [manualBlockedDates, setManualBlockedDates] = useState<Date[]>([]);
  const [manualCheckinDates, setManualCheckinDates] = useState<Date[]>([]);
  const [manualCheckoutDates, setManualCheckoutDates] = useState<Date[]>([]);

  const [pendingCheckinDates, setPendingCheckinDates] = useState<Date[]>([]);
  const [pendingCheckoutDates, setPendingCheckoutDates] = useState<Date[]>([]);
  const [pendingMiddleDates, setPendingMiddleDates] = useState<Date[]>([]);

  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  const [prepaymentRate, setPrepaymentRate] = useState(0);

  /* 🛡️ HAVUZ ISITMA — 4. adım. Başlangıç false; villaId değişince
     aşağıdaki effect ile false'a reset edilir (bkz. reservations-fetch
     effect'i, aynı dep [villaId]). poolHeatingTotal AYRI bir state
     DEĞİL — result.poolHeating'ten türetilir (aşağıda). */
  const [poolHeatingSelected, setPoolHeatingSelected] = useState(false);

  /* 🛡️ FAZ 56H-C — External iCal 3. kaynak olarak merge edilir.
     `useMemo` gerekmez — bu inline merge zaten her render'da çalışıyordu
     (BookingSidebar mevcut pattern); ek concat O(n) trivial. External
     arrays prop referansı stabil (server-fetched), state değişiminde
     rebuild yine ucuz. Davranış BookingSidebar ile birebir aynı. */
  const externalDates = externalStringsToDateArrays(externalBlocks);
  const mergedBlockedDates = [
    ...blockedDates,
    ...manualBlockedDates,
    ...externalDates.externalMiddleDates,
  ];
  const mergedCheckinDates = [
    ...checkinDates,
    ...manualCheckinDates,
    ...externalDates.externalCheckinDates,
  ];
  const mergedCheckoutDates = [
    ...checkoutDates,
    ...manualCheckoutDates,
    ...externalDates.externalCheckoutDates,
  ];

  const [today] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  /* 🛡️ Modern feedback layer — handleReservation içindeki alert()
     çağrıları yerine state-driven mesaj. Consumer (BookingSidebar)
     bu state'i inline banner olarak gösterir; null → gizli. */
  const [reservationError, setReservationError] = useState<string | null>(
    null
  );

  const isIntersection = (date: Date) => {
    return (
      mergedCheckinDates.some(
        (d) => d.toDateString() === date.toDateString()
      ) &&
      mergedCheckoutDates.some(
        (d) => d.toDateString() === date.toDateString()
      )
    );
  };

  const hasConflict = (start: Date, end: Date) => {
    /* `const` — `current` referansı yeniden atanmaz; sadece Date
       instance'ı setDate ile mutate edilir (BookingSidebar pre-refactor
       davranışıyla birebir aynı: gün gün loop). */
    const current = new Date(start);
    while (current <= end) {
      const isBlocked = mergedBlockedDates.some(
        (d) => d.toDateString() === current.toDateString()
      );
      if (isBlocked) return true;
      current.setDate(current.getDate() + 1);
    }
    return false;
  };

  /* ===============================================================
     🛡️ BAŞLANGIÇ ARALIĞI MÜSAİTLİK DOĞRULAMASI
     ===============================================================
     SORUN: URL'den (normal/esnek arama, paylaşılan link) veya
     VillaCardBookingModal'dan gelen initialStart/initialEnd doğrudan
     state'e alınıyordu; müsaitlik sonradan yüklenince dolu gün takvimde
     kapalı olsa bile seçim temizlenmiyor → fiyat hesaplanıyor, CTA aktif,
     /rezervasyon'a gidiliyordu (yalnız API reddediyordu).

     KURAL (yalnız HÂLÂ başlangıç aralığı seçiliyken; kullanıcının
     takvimden yaptığı seçimlere bu blok karışmaz):
       - Müsaitlik henüz yüklenmedi → `initialRangePending`: fiyat
         hesaplanmaz, rezervasyona geçilmez.
       - Yüklendi ve aralıktaki bir gece dolu → `initialRangeConflict`:
         seçim tüketicilere BOŞ (null) verilir (dolu gün seçili kalmaz,
         fiyat/özet oluşmaz); mevcut `dict.booking.conflictError` mesajı
         gösterilir. Kullanıcı takvimden yeni seçim yapınca normal akış.

     "DOLU GECE" = MEVCUT merged availability (kaynak birleşimi DEĞİŞMEDİ):
       - `hasConflict(start, end)` → takvim onSelect ile AYNI kontrol
         (mergedBlockedDates: confirmed ara günleri + manuel + external)
       - [start, end) içindeki bir gece mergedCheckinDates'te → başka bir
         konaklamanın İLK gecesi (orphan-gap "occupied" kümesiyle aynı
         tanım). Çıkış günü (end) gece sayılmaz.
     Pending rezervasyonlar bu kümelere MEVCUT kodda da girmez → pending
     davranışı DEĞİŞMEDİ. */
  const rangeHasOccupiedNight = (start: Date, end: Date) => {
    if (hasConflict(start, end)) return true;
    const cursor = new Date(start);
    while (cursor < end) {
      const key = cursor.toDateString();
      if (mergedCheckinDates.some((d) => d.toDateString() === key)) {
        return true;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return false;
  };

  const isInitialSelection =
    !!initialRange &&
    !!selectedStart &&
    !!selectedEnd &&
    selectedStart.toDateString() === initialRange.start.toDateString() &&
    selectedEnd.toDateString() === initialRange.end.toDateString();

  const initialRangePending = isInitialSelection && !availabilityChecked;

  const initialRangeConflict =
    isInitialSelection &&
    availabilityChecked &&
    rangeHasOccupiedNight(selectedStart!, selectedEnd!);

  /* Tüketicilere ve aşağıdaki TÜM türetilmiş hesaplara giden seçim.
     Çakışma yoksa ham state ile BİREBİR aynı referans. */
  const startDate = initialRangeConflict ? null : selectedStart;
  const endDate = initialRangeConflict ? null : selectedEnd;

  const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const getPriceForDate = (date: Date) => {
    const target = formatDate(date);
    /* 🛡️ FAZ 55K — normalizedPrices üzerinden ara: start/end string
       garantili. */
    const found = normalizedPrices.find(
      (p) => target >= p.start_date && target <= p.end_date
    );
    if (!found) return null;
    return convertPrice(
      found.price,
      found.currency || "TRY",
      currency,
      rates
    );
  };

  /* ===============================================================
     🛡️ GÜNLÜK İNDİRİMLİ FİYAT — SALT GÖSTERİM (UI-only)
     ===============================================================
     `getPriceForDate` (indirimsiz) DEĞİŞTİRİLMEDİ; bu yalnız onun
     indirimli ikizidir. Kullanılan iki fonksiyon da price.engine'in
     ZATEN export ettiği pure fonksiyonlardır ve `PriceList.tsx`
     (villa detay sezon listesi) ile BİREBİR AYNI desende çağrılır:
       getActiveDiscount(date, discounts) → aktif villa_discounts kaydı
       applyDiscountToDailyPrice(daily, discount, currency, rates)
     Yeni indirim formülü / yeni motor çağrısı YOK. `discounts`
     verilmemişse (null/boş) `getActiveDiscount` null döner → bu
     fonksiyon da null döner → takvim MEVCUT tek-fiyat görünümünde
     kalır (rezervasyon/availability/tarih seçimi ETKİLENMEZ).
     =============================================================== */
  const getDiscountedPriceForDate = (date: Date): number | null => {
    const target = formatDate(date);
    const found = normalizedPrices.find(
      (p) => target >= p.start_date && target <= p.end_date
    );
    if (!found) return null;

    const activeDiscount = getActiveDiscount(date, discounts);
    if (!activeDiscount) return null;

    const converted = convertPrice(
      found.price,
      found.currency || "TRY",
      currency,
      rates
    );
    const discounted = applyDiscountToDailyPrice(
      {
        converted,
        original: found.price,
        original_currency: found.currency || "TRY",
      },
      activeDiscount,
      currency,
      rates
    );
    /* Sahte indirim koruması: yalnız GERÇEKTEN düşükse döner
       (PriceList `isDiscounted` kuralının aynısı). */
    return discounted.converted < converted ? discounted.converted : null;
  };

  /* ---------------------------------------------
     🔥 EFFECTIVE PREPAYMENT RATE
     - villa.custom_prepayment_rate varsa → onu kullan
     - yoksa global settings.prepayment_rate
     - yoksa 0 (initial state)
     custom_prepayment_rate değişince yeniden çalışır.
     BookingSidebar'daki davranışla birebir aynı.
  ---------------------------------------------- */
  useEffect(() => {
    if (
      custom_prepayment_rate !== null &&
      custom_prepayment_rate !== undefined &&
      (custom_prepayment_rate as unknown as string) !== ""
    ) {
      /* BookingSidebar pre-refactor davranışı: override mevcutsa
         setState ile prepaymentRate'i senkron set et. React 19'un
         `set-state-in-effect` rule'u bu pattern'i flagliyor ama
         davranış BYTE-IDENTICAL korunmak için aynı kalır — alternatif
         derived-state refactor ilk-render flicker'ını değiştirir.
         (Trivial cascading render; tek setState, deps custom_prepayment_rate). */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrepaymentRate(Number(custom_prepayment_rate));
      return;
    }

    // 🛡️ MEMORY-LEAK HARDENING (Faz 2A):
    //   getSettings async; hızlı navigasyon sırasında stale setState
    //   önlenir. Davranış: aynı settings prepayment_rate yüklemesi.
    let cancelled = false;
    getPublicSettings().then((data) => {
      if (cancelled) return;
      if (data?.prepayment_rate) {
        setPrepaymentRate(data.prepayment_rate);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [custom_prepayment_rate]);

  /* ---------------------------------------------
     🔥 RESERVATIONS + MANUAL RESERVATIONS FETCH
     ---------------------------------------------
     BookingSidebar'daki effect ile birebir aynı:
     - Faz 2B allow-list: pending + confirmed
     - confirmed: firstDay=checkin, lastDay=checkout, mid=blocked
     - pending  : firstDay=pendingCheckin, lastDay=pendingCheckout, mid=pendingMiddle
     - manual   : firstDay=manualCheckin, lastDay=manualCheckout,
                  single-day=manualBlocked, mid=manualBlocked
     - unique() dedup by toDateString()
  ---------------------------------------------- */
  useEffect(() => {
    const fetchReservations = async () => {
      /* 🛡️ AVAILABILITY ALLOW-LIST (Faz 2B):
         Public booking sidebar'ı yalnız `pending`+`confirmed`
         rezervasyonların tarihlerini calendar'da blocking olarak
         göstermeli. `rejected` / `cancelled` müsait sayılır. */
      /* 🛡️ PII-SAFE AVAILABILITY — SECURITY DEFINER RPC (migration 039).
         ESKİ: anon `db.from("reservations"/"manual_reservations")
         .select(...)`. 040 admin-only RLS sonrası anon SELECT reddedilir.
         YENİ: `get_villa_blocked_ranges` — yalnız kind/status/start_date/
         end_date döner; PII browser'a ASLA gelmez. Allow-list (pending+
         confirmed) + manual ayrımı RPC içinde. Aşağıdaki expansion mantığı
         `data` (reservation) ve `manual` shape'leri üzerinden BYTE-IDENTICAL
         çalışır. */
      /* 🛡️ FAZ 2 frontend purge — public fetch /api/public/villas/[id]/blocked-ranges.
         Eski anon `db.rpc("get_villa_blocked_ranges", { p_villa_id })`
         route içinde delege; aynı RPC, aynı return shape. Davranış
         BYTE-IDENTICAL: empty array fallback aynen, error path da. */
      type BlockedRange = {
        kind: "reservation" | "manual";
        status: string | null;
        start_date: string;
        end_date: string;
      };
      let ranges: BlockedRange[] = [];
      try {
        const res = await fetch(
          `/api/public/villas/${encodeURIComponent(villaId)}/blocked-ranges`,
          { cache: "no-store" }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          ranges?: BlockedRange[];
        };
        if (!res.ok || !json.ok) {
          console.error(
            "❌ rezervasyon çekme:",
            new Error(`HTTP ${res.status}`)
          );
          /* Mevcut fail-open davranış: müsaitlik alınamadı → bekleme
             kaldırılır (server-side doğrulama yine geçerli). */
          setAvailabilityChecked(true);
          return;
        }
        ranges = json.ranges || [];
      } catch (err) {
        console.error("❌ rezervasyon çekme:", err);
        setAvailabilityChecked(true);
        return;
      }
      const data = ranges
        .filter((r) => r.kind === "reservation")
        .map((r) => ({
          start_date: r.start_date,
          end_date: r.end_date,
          status: r.status ?? "",
        }));
      const manual = ranges
        .filter((r) => r.kind === "manual")
        .map((r) => ({ start_date: r.start_date, end_date: r.end_date }));

      const blocked: Date[] = [];
      const checkin: Date[] = [];
      const checkout: Date[] = [];

      const manualBlocked: Date[] = [];
      const manualCI: Date[] = [];
      const manualCO: Date[] = [];

      const pendingCheckin: Date[] = [];
      const pendingCheckout: Date[] = [];
      const pendingMiddle: Date[] = [];

      type ReservationRow = {
        start_date: string;
        end_date: string;
        status: string;
      };

      (data as ReservationRow[] | null)?.forEach((r) => {
        if (r.status === "confirmed") {
          /* 🛡️ LOCAL DATE SEMANTIC: parseLocalDate ile LOCAL midnight;
             setDate(+1) LOCAL gün adımıyla zincirlenir. Last-day eşitliği
             toDateString() (LOCAL gün eşitliği). */
          const current = parseLocalDate(r.start_date);
          const end = parseLocalDate(r.end_date);
          let isFirst = true;
          while (current <= end) {
            const d = new Date(current);
            if (isFirst) {
              checkin.push(d);
              isFirst = false;
            } else if (current.toDateString() === end.toDateString()) {
              checkout.push(d);
            } else {
              blocked.push(d);
            }
            current.setDate(current.getDate() + 1);
          }
        }

        if (r.status === "pending") {
          const current = parseLocalDate(r.start_date);
          const end = parseLocalDate(r.end_date);
          while (current <= end) {
            const d = new Date(current);
            const isStart =
              current.toDateString() ===
              parseLocalDate(r.start_date).toDateString();
            const isEnd = current.toDateString() === end.toDateString();
            if (isStart) pendingCheckin.push(d);
            else if (isEnd) pendingCheckout.push(d);
            else pendingMiddle.push(d);
            current.setDate(current.getDate() + 1);
          }
        }
      });

      type ManualRow = { start_date: string; end_date: string };

      (manual as ManualRow[] | null)?.forEach((r) => {
        const current = parseLocalDate(r.start_date);
        const end = parseLocalDate(r.end_date);
        while (current <= end) {
          const d = new Date(current);
          const startDateLocal = parseLocalDate(r.start_date);
          const endDateLocal = parseLocalDate(r.end_date);
          const isFirstDay =
            current.toDateString() === startDateLocal.toDateString();
          const isLastDay =
            current.toDateString() === endDateLocal.toDateString();
          if (isFirstDay && isLastDay) manualBlocked.push(d);
          else if (isFirstDay) manualCI.push(d);
          else if (isLastDay) manualCO.push(d);
          else manualBlocked.push(d);
          current.setDate(current.getDate() + 1);
        }
      });

      const unique = (arr: Date[]) =>
        Array.from(
          new Map(arr.map((d) => [d.toDateString(), d])).values()
        );

      setBlockedDates(unique(blocked));
      setCheckinDates(unique(checkin));
      setCheckoutDates(unique(checkout));
      setPendingCheckinDates(unique(pendingCheckin));
      setPendingCheckoutDates(unique(pendingCheckout));
      setPendingMiddleDates(unique(pendingMiddle));

      setManualBlockedDates(unique(manualBlocked));
      setManualCheckinDates(unique(manualCI));
      setManualCheckoutDates(unique(manualCO));
      /* Aynı async tick → React batch: dolu gün dizileri ile "kontrol
         edildi" bayrağı AYNI render'da görünür. */
      setAvailabilityChecked(true);
    };

    fetchReservations();
  }, [villaId]);

  /* ---------------------------------------------
     🛡️ HAVUZ ISITMA — 4. adım. Villa değişince seçim sıfırlanır.
     poolHeatingTotal ayrı bir state olmadığı için (result.poolHeating'ten
     türetilir), poolHeatingSelected=false olunca otomatik 0'a döner —
     ek bir reset gerekmez. Reservations-fetch effect'i ile aynı dep
     [villaId] (yukarıdaki effect ile aynı "villa değişti" sinyali).
  ---------------------------------------------- */
  useEffect(() => {
    /* prepaymentRate effect'indeki AYNI desen (yukarıda) — davranış
       BYTE-IDENTICAL kalması için senkron reset korunur; alternatif
       derived-state refactor "villa değişti" sinyalini karmaşıklaştırır.
       Trivial cascading render (tek setState, deps [villaId]). */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPoolHeatingSelected(false);
  }, [villaId]);

  /* ═══════════════════════════════════════════════════════════
     🛡️ FAZ 26B — MINIMUM STAY VALIDATION
     ═══════════════════════════════════════════════════════════
     KURAL:
       - minimum_stay_nights null veya <=1 → enforcement YOK
       - startDate/endDate ikisinden biri null → seçim yarım → valid kabul
       - Aksi halde: calculateNights ile gece sayısı; minimum'dan
         azsa → invalid
     `calculateNights` mevcut helper (lib/price.engine).
     ═══════════════════════════════════════════════════════════ */
  const minStayThreshold =
    typeof minimum_stay_nights === "number" &&
    Number.isFinite(minimum_stay_nights) &&
    minimum_stay_nights >= 2
      ? minimum_stay_nights
      : 0;

  const selectedNights =
    startDate && endDate
      ? calculateNights(formatDate(startDate), formatDate(endDate))
      : 0;

  /* ═══════════════════════════════════════════════════════════
     🛡️ GAP OVERRIDE — Dynamic Effective Minimum Stay
     ═══════════════════════════════════════════════════════════
     Seçim, mevcut rezervasyonlar arasındaki GERÇEK bir gap'in
     TAMAMINI dolduruyorsa minimum_stay esnetilir.
       - Gap boundary'leri HAM aralık uçlarıdır:
           start = bir bloğun ÇIKIŞ günü (end_date → mergedCheckoutDates)
           end   = bir bloğun GİRİŞ günü (start_date → mergedCheckinDates)
         (expanded middle dizileri KULLANILMAZ → ±1 gün hatası yok)
       - `!hasConflict` araya blok girmesini dışlar → kısmi/atlamalı
         seçim override ALMAZ (15→16, 16→17 reddedilir; 15→17 kabul).
       - Yalnız normalde reddedilecek (selectedNights < threshold)
         seçimde devreye girer → diğer tüm tarihlerde min_stay AYNEN.
       - `minimum_stay_nights` verisi DEĞİŞMEZ; yalnız doğrulama eşiği
         bu seçim için dinamikleşir.
       - GAP BAŞLANGICI GENİŞLETİLDİ: sol sınır ya bir bloğun ÇIKIŞ günü
         (mevcut davranış), YA DA `today`'dir. Geçmiş tarihler satılamadığı
         için "bugün" de rezervasyon checkout'u gibi KAPALI SINIR sayılır →
         "bugün → sonraki checkin" boşluğu da gap kabul edilir. Sağ sınır
         yine mutlaka gerçek checkin; rezervasyon↔rezervasyon dalı AYNEN. */
  const isExactGapFill =
    !!startDate &&
    !!endDate &&
    minStayThreshold > 0 &&
    selectedNights > 0 &&
    selectedNights < minStayThreshold &&
    !hasConflict(startDate, endDate) &&
    (mergedCheckoutDates.some(
      (d) => d.toDateString() === startDate.toDateString()
    ) ||
      startDate.toDateString() === today.toDateString()) &&
    mergedCheckinDates.some(
      (d) => d.toDateString() === endDate.toDateString()
    );

  const effectiveMinStay = isExactGapFill ? selectedNights : minStayThreshold;

  const minimumStayValid =
    effectiveMinStay === 0 ||
    !startDate ||
    !endDate ||
    selectedNights >= effectiveMinStay;

  /* ═══════════════════════════════════════════════════════════
     🛡️ ORPHAN GAP VALIDATION (admin ayarı ile aç/kapa)
     ═══════════════════════════════════════════════════════════
     Min-stay + exact gap-fill mantığı YUKARIDA AYNEN durur; bu yalnız
     EK bir eleme. Occupied gece kümesi = mevcut merged availability
     (confirmed+manual+external; kaynak birleştirme DEĞİŞMEZ):
       occupied nights = mergedBlockedDates ∪ mergedCheckinDates
       (checkout günleri boş → dahil edilmez; daterange [) semantiği).
     Helper SAF: yalnız kümeyi + minStay + today alır. Ayar kapalıysa
     veya min-stay<2 ise helper her zaman valid döner (no-op). */
  const orphanGapValid = (() => {
    if (!orphanGapRuleEnabled || !startDate || !endDate) return true;
    const occupied = new Set<string>();
    for (const d of mergedBlockedDates) occupied.add(formatDate(d));
    for (const d of mergedCheckinDates) occupied.add(formatDate(d));
    return evaluateOrphanGap({
      fromKey: formatDate(startDate),
      toKey: formatDate(endDate),
      minStayNights: minimum_stay_nights,
      occupiedNightKeys: occupied,
      todayKey: formatDate(today),
      orphanRuleEnabled: orphanGapRuleEnabled,
    }).valid;
  })();

  /* 🛡️ FAZ 26B — minimum stay invalid → result hesaplama atla.
     calculateGrandTotal eski davranış aynen. */
  const rawResult =
    startDate &&
    endDate &&
    minimumStayValid &&
    orphanGapValid &&
    /* 🛡️ Başlangıç aralığının müsaitliği henüz doğrulanmadı → fiyat
       kesinleşmiş gibi gösterilmez (bkz. BAŞLANGIÇ ARALIĞI bloğu). */
    !initialRangePending
      ? calculateGrandTotal({
          start: formatDate(startDate),
          end: formatDate(endDate),
          prices: normalizedPrices,
          currency,
          rates,
          cleaning_fee,
          cleaning_currency,
          cleaning_limit,
          /* 🛡️ HAVUZ ISITMA — 4. adım. Opsiyonel parametreler; NULL
             fee → 0 (calculatePoolHeatingFee içinde zaten "hizmet yok"
             semantiği var, 0 fallback yalnız type uyumu için). Seçim
             false ise (default) poolHeating=0 → total mevcut formülle
             (stay+cleaning) BYTE-IDENTICAL kalır. */
          pool_heating_fee: pool_heating_fee ?? 0,
          pool_heating_currency: pool_heating_currency || "TRY",
          pool_heating_selected: poolHeatingSelected,
          /* 🛡️ Migration 076 — sezonluk ay kısıtı. NULL/undefined
             ise calculateGrandTotal içinde isPoolHeatingActiveForRange
             her zaman true döner (davranış BYTE-IDENTICAL). */
          pool_heating_months,
          discounts,
        })
      : null;

  /* 🛡️ EKSİK SEZON FİYATI — seçilen aralıkta fiyatı tanımlı olmayan
     gece varsa hesap GEÇERSİZDİR (`priceAvailable === false`).
     `result` bu durumda `null`'a düşürülür; böylece özet bloğu
     (BookingSidebar:408 `... && result &&`) MEVCUT koşuluyla
     kendiliğinden gizlenir — yeni bir gizleme mekanizması YOK.
     Tam kapsanan aralıklarda `priceAvailable === true` olduğu için
     `result` ESKİSİYLE BİREBİR aynı nesnedir. */
  const result = rawResult && rawResult.priceAvailable ? rawResult : null;
  const priceUnavailable = !!rawResult && !rawResult.priceAvailable;

  /* ===============================================================
     🛡️ VILLA_DISCOUNTS — GÖRSEL GÖSTERİM (Adım 3, UI-only)
     ===============================================================
     `result` (yukarıda) DEĞİŞTİRİLMEDİ — rezervasyon/ödeme tutarı
     AYNEN o hesaptan gelir. Burada YALNIZ "normal fiyat neydi"
     karşılaştırması için AYRI, salt-okunur bir ikinci çağrı yapılır:
     AYNI `calculateStayTotal` (price.engine'in zaten export ettiği
     pure fonksiyon), AYNI start/end/prices/currency/rates — TEK fark
     `discounts: null` (indirim yokmuş gibi normal toplam). Yeni bir
     indirim FORMÜLÜ YAZILMADI; iki mevcut price.engine çıktısı
     birbirinden ÇIKARILARAK (display amaçlı) karşılaştırılıyor. */
  const undiscountedStay =
    startDate &&
    endDate &&
    minimumStayValid &&
    orphanGapValid &&
    !initialRangePending
      ? calculateStayTotal(
          formatDate(startDate),
          formatDate(endDate),
          normalizedPrices,
          currency,
          rates,
          null
        )
      : null;

  /* Seçili aralıkta aktif olan (ilk denk gelen) villa_discounts kaydı —
     yalnız BİLGİ/badge metni için (tarih aralığı + tür + değer).
     `getActiveDiscount` price.engine'in zaten export ettiği pure
     lookup — YENİ bir eşleştirme mantığı YAZILMADI. */
  const representativeDiscount =
    startDate && endDate
      ? (() => {
          const cursor = new Date(startDate);
          while (cursor < endDate) {
            const active = getActiveDiscount(cursor, discounts);
            if (active) return active;
            cursor.setDate(cursor.getDate() + 1);
          }
          return null;
        })()
      : null;

  /* Yalnız gerçekten bir fark varsa (indirim seçili gecelerin en az
     birinde uygulandıysa) UI'a expose edilir — 0.01 epsilon, currency
     rounding farkını "sahte indirim" olarak göstermemek için. */
  const activeStayDiscount: ActiveStayDiscount | null =
    result &&
    undiscountedStay &&
    representativeDiscount &&
    undiscountedStay.stay - result.stay > 0.01
      ? {
          originalStay: undiscountedStay.stay,
          discountedStay: result.stay,
          discount: representativeDiscount,
        }
      : null;

  /* 🛡️ Migration 076 — sezonluk ay kısıtı. Checkbox GÖRÜNÜRLÜĞÜ için
     AYRI bir boolean — calculateGrandTotal'ın kendisi yalnız TUTARI
     sıfırlar (rawPoolHeating), checkbox'ın kendisini GİZLEMEZ. Tarih
     seçilmemişse (startDate/endDate yok) true — BookingSummary zaten
     yalnız result mevcutken render edilir, bu durumda hiç kullanılmaz. */
  const poolHeatingActiveForRange =
    startDate && endDate
      ? isPoolHeatingActiveForRange(
          formatDate(startDate),
          formatDate(endDate),
          pool_heating_months
        )
      : true;

  /* 🛡️ HAVUZ ISITMA — 4. adım. result.poolHeating'ten türetilir; YENİ
     bir hesaplama YOK (calculateGrandTotal dahili calculatePoolHeatingFee
     çağırıyor — bkz. lib/price.engine.ts, 2. adım). result null ise
     (tarih seçilmedi / minStay veya orphan-gap geçersiz) 0. */
  const poolHeatingTotal = result ? result.poolHeating : 0;

  /* 🔥 PREPAYMENT — KRİTİK KURAL DEĞİŞMEDİ: SADECE konaklama bedeli.
     accommodationBase artık 3. parametre (poolHeating) alıyor — cleaning
     fee davranışı AYNEN; pool heating de aynı şekilde ön ödeme dışı
     tutuluyor (poolHeatingSelected=false / result null iken 3. parametre
     0 → accommodationBase 2-parametreli eski davranışla BYTE-IDENTICAL). */
  const prepayment = result
    ? calculatePrepayment(
        accommodationBase(result.total, result.cleaning, result.poolHeating),
        prepaymentRate
      )
    : 0;

  const convertedDeposit = convertPrice(deposit, "TRY", currency, rates);

  const startingPrice = formatCurrency(
    convertPrice(
      Number(prices[0]?.price || 0),
      prices[0]?.currency || "TRY",
      currency,
      rates
    ),
    currency,
    locale ?? "tr"
  );

  /* ---------------------------------------------
     handleReservation — navigation URL inşası.
     BookingSidebar ile birebir aynı:
       - alert davranışı korunur
       - URL formatı korunur
       - window.location.href hard navigation
  ---------------------------------------------- */
  const handleReservation = () => {
    if (!startDate || !endDate) {
      /* 🛡️ alert() yerine inline state — consumer banner gösterir.
         3sn sonra otomatik temizlenir, kullanıcı UX'i blok etmez. */
      setReservationError(dict.booking.reservationErrorSelectDate);
      setTimeout(() => setReservationError(null), 3000);
      return;
    }
    if (!minimumStayValid) {
      setReservationError(
        formatDictionaryString(dict.booking.reservationErrorMinStay, {
          n: minStayThreshold,
        })
      );
      setTimeout(() => setReservationError(null), 3000);
      return;
    }
    if (!orphanGapValid) {
      /* Orphan gap: seçim, min-stay'den kısa kullanılamaz bir boşluk
         bırakıyor → engelle (mevcut error mekanizması). */
      setReservationError(
        formatDictionaryString(dict.booking.reservationErrorOrphanGap, {
          n: minStayThreshold,
        })
      );
      setTimeout(() => setReservationError(null), 5000);
      return;
    }
    /* 🛡️ Başlangıç aralığının müsaitliği henüz doğrulanmadı → yönlendirme
       YOK (fetch sonuçlanınca normal akış). Mevcut tarih/min-stay/orphan
       mesajları yukarıda AYNEN önce çalışır. */
    if (initialRangePending) return;
    /* 🛡️ SON CLIENT-SIDE GÜVENLİK KONTROLÜ — seçili aralıkta dolu gece
       varsa /rezervasyon'a gidilmez. Server-side doğrulama (API) AYNEN
       geçerli; bu yalnız ek bir erken kapı. */
    if (rangeHasOccupiedNight(startDate, endDate)) {
      setReservationError(dict.booking.conflictError);
      setTimeout(() => setReservationError(null), 3000);
      return;
    }
    setReservationError(null);

    const format = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    const start = format(startDate);
    const end = format(endDate);

    /* 🛡️ HAVUZ ISITMA — 6. adım. handleReservation `window.location.href`
       ile HARD navigation yapıyor — React state/props bu sınırı geçemez.
       poolHeatingSelected zaten bu hook'un closure'ında (prop threading
       gerekmiyor); URL query param olarak taşınıp `/rezervasyon/[slug]/page.tsx`
       tarafından okunuyor. Yeni global state/context YOK. */
    const baseUrl = `/rezervasyon/${villaSlug}?start=${start}&end=${end}&adults=${adults}&children=${children}&poolHeating=${poolHeatingSelected ? "1" : "0"}`;
    /* 🛡️ PHASE 10B, Section 7 — `/rezervasyon/[slug]/page.tsx` HİÇ
       değiştirilmedi (do-not-touch listesinde) ve `searchParams` tipini
       yalnız bilinen alanlar (`sp.start`/`sp.end`/`sp.adults`/
       `sp.children`/`sp.poolHeating`) için okuyor — bilinmeyen bir query
       param (`locale`) sayfada asla okunmaz, TR akışını SIFIR etkiler.
       Yine de locale bilgisini SESSİZCE KAYBETMEMEK için EN/DE'de
       `&locale=` eklenir. TR'de (locale undefined/"tr") URL BYTE-IDENTICAL
       kalır — hiçbir ek query param eklenmez. */
    const url =
      locale && locale !== "tr" ? `${baseUrl}&locale=${locale}` : baseUrl;

    /* 🔄 NAVIGATION LOCALE KAYBI — DÜZELTME
       ------------------------------------------------------------
       ESKİ DAVRANIŞ (ve nedeni): bu satır `url`'i prefix'SİZ kullanıyordu;
       o dönem `/en/rezervasyon/[slug]` ve `/de/rezervasyon/[slug]`
       route'ları `LocaleRouteComingSoon` placeholder'ıydı, bu yüzden EN/DE
       kullanıcısı bilinçli olarak TR route'una + `&locale=` query param'ı
       ile gönderiliyordu.

       BUGÜN O VARSAYIM GEÇERSİZ: her iki route da gerçek gövdeyi
       (`ReservationPageBody`, `requirePublicLocaleEnabled` gate'i ile)
       render ediyor. Prefix'siz gidildiği için `/de/...`'den gelen
       kullanıcı `/rezervasyon/...` TR sayfasına düşüyor →
       `localeFromPathname` "tr" döndürüyor → dil kendiliğinden TR'ye
       dönüyordu. (`&locale=` param'ı sayfada HİÇ okunmadığı için locale'i
       kurtarmıyordu.)

       DÜZELTME: hedef, projenin MEVCUT merkezi helper'ı `localeHref` ile
       prefix'lenir. Yeni mimari/state/cookie YOK; URL locale'in tek
       kaynağı olarak KALIR.
         tr → `/rezervasyon/<slug>?...`        (BYTE-IDENTICAL — değişmedi)
         en → `/en/rezervasyon/<slug>?...`
         de → `/de/rezervasyon/<slug>?...`
       `localeHref` query/hash'i OPAK taşır → mevcut parametre seti
       (start/end/adults/children/poolHeating[&locale]) AYNEN korunur. */
    window.location.href = localeHref(url, locale ?? DEFAULT_LOCALE);
  };

  return {
    /* Selection state */
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    adults,
    children,
    setAdults,
    setChildren,

    /* Merged availability */
    mergedBlockedDates,
    mergedCheckinDates,
    mergedCheckoutDates,

    /* Pending raw */
    pendingCheckinDates,
    pendingCheckoutDates,
    pendingMiddleDates,

    /* Derived */
    normalizedPrices,
    prepaymentRate,
    today,
    selectedNights,
    minStayThreshold,
    minimumStayValid,
    orphanGapValid,
    isGapOverride: isExactGapFill,
    result,
    /** 🛡️ Seçilen aralıkta fiyatı tanımlı olmayan gece var mı?
     *  Tam kapsanan aralıklarda DAİMA false → mevcut davranış aynı. */
    priceUnavailable,
    activeStayDiscount,
    prepayment,
    convertedDeposit,
    startingPrice,

    /* 🛡️ HAVUZ ISITMA — 4. adım (altyapı; UI sonraki adımda bağlanacak) */
    poolHeatingSelected,
    setPoolHeatingSelected,
    poolHeatingTotal,

    /* 🛡️ Migration 076 — sezonluk ay kısıtı (checkbox görünürlüğü). */
    poolHeatingActiveForRange,

    /* Helpers */
    parseLocalDate,
    formatDate,
    isIntersection,
    hasConflict,
    getPriceForDate,
    getDiscountedPriceForDate,

    /* Submit */
    handleReservation,

    /* 🛡️ Modern feedback layer — consumer'a expose. Banner display
       BookingSidebar tarafında inline gösterilir; alert() kaldırıldı.
       Başlangıç aralığı dolu çıktıysa (ve başka aktif hata yoksa) MEVCUT
       `conflictError` mesajı aynı kanaldan gösterilir. */
    reservationError:
      reservationError ??
      (initialRangeConflict ? dict.booking.conflictError : null),

    /* 🛡️ Başlangıç aralığı müsaitlik doğrulaması (bkz. hook gövdesi). */
    availabilityPending: initialRangePending,
    initialRangeConflict,
  };
}

/* getValidEndDate re-export — consumer'lar (BookingCalendar, modal)
   tek bir entry point'ten alabilsin. Lib davranışı AYNEN. */
export { getValidEndDate };
