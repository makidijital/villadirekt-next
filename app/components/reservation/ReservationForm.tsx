"use client";

import { convertPrice, formatCurrency } from "@/lib/currency";
import { useCurrency } from "@/app/context/CurrencyContext";

import { useState, useEffect, useRef } from "react";
/* 🛡️ FAZ 2 frontend purge — `import { eski sağlayıcı }` KALDIRILDI.
   payment_methods fetch artık /api/public/payment-methods route'u
   üzerinden (aynı anon RLS bağlamı, aynı select shape). */
import { getPublicSettingsAction as getPublicSettings } from "@/app/services/settings.action";
/* 🛡️ Aşama 7A — `country-state-city` (country.json + state.json,
   ~636 KB ham) artık STATİK import EDİLMEZ; ilk JS bundle'dan çıktı.
   Veri, mount sonrası `loadCountryStateModule()` ile lazy chunk'tan
   yüklenir (listeler zaten useEffect'te doluyordu → SSR HTML aynı).
   Görünen ülke adı için paketi import ETMEYEN saf helper kullanılır
   (`getCountryLabel` ile BİREBİR aynı mantık). */
import { formatCountryLabel } from "@/lib/country-label";
import {
  Calendar,
  CalendarDays,
  Users,
  UserRound,
  MapPin,
  CreditCard,
  Wallet,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";

import {
  calculateGrandTotal,
  calculatePrepayment,
  accommodationBase,
} from "@/lib/price.engine";

import type { PaymentPreference } from "@/lib/payment.helper";

/* 🛡️ FAZ 1+2 — typed public reservation form pipeline.
   useState<any> drift'i kapatıldı. handleSubmit helper-driven:
     - validatePublicReservationForm
     - buildPublicReservationPayload (snapshot-based)
     - dispatchPublicReservationRequestMail (fire-forget; outer try) */
import {
  initialPublicReservationFormData,
  type PublicReservationFormData,
  type PublicReservationFormErrors,
  type CountryOption,
  type CityOption,
  type PublicPaymentMethodOption,
} from "./_types/reservation-form-data";
import { validatePublicReservationForm } from "./_helpers/validatePublicReservationForm";
import { buildPublicReservationPayload } from "./_helpers/buildPublicReservationPayload";
import { dispatchPublicReservationRequestMail } from "./_helpers/dispatchPublicReservationRequestMail";

/* 🛡️ Başarı sayfası — modal yerine tam sayfa redirect.
   `/rezervasyon/basarili?ref=<id>&villa=<slug>` rotasına yönlendirir.
   API/mail/form mantığı AYNEN; yalnız success feedback UX değişti.
   useRouter client-side navigation için.
   SuccessModal componenti silinmedi (gelecekte kullanılabilir). */
import { useRouter } from "next/navigation";

/* 🛡️ REZERVASYON ÇOKLU DİL — statik metinler MEVCUT public
   dictionary'den (`reservation.*` + REUSE edilen `booking.*`).
   Fiyat hesaplama, snapshot, ödeme, havuz ısıtma, payload, API
   endpoint, mail dispatch ve validation KURALLARI DEĞİŞMEDİ. */
import { DEFAULT_LOCALE, LOCALE_BCP47, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
/* 🛡️ MIGRATION 088 — ödeme yöntemi ADI locale-aware GÖSTERİLİR.
   Canonical `p.name` (ve `payment_method_id` payload'ı, API sözleşmesi,
   ödeme/fiyat mantığı) DEĞİŞMEDİ — yalnız görünen etiket çözülür;
   çeviri yoksa/boşsa TR canonical'a düşer. */
import { resolveTaxonomyName } from "@/lib/i18n/taxonomy-name.helper";
/* 🛡️ SÖZLEŞME LİNKLERİ — projenin MEVCUT merkezi locale helper'ı
   (lib/i18n/locale-href.ts; CookieConsent, Header, Footer ve diğer
   public call-site'lar aynı helper'ı kullanır). Hedefler aktif
   locale'i taşır: tr → `/p/...`, en → `/en/p/...`, de → `/de/p/...`.
   Yeni i18n/routing mantığı YOK. */
import Link from "next/link";
import { localeHref } from "@/lib/i18n/locale-href";
/* 🔄 Fiyat özeti — public tarafta TEK tasarım (BookingSummary primitive'leri). */
import {
  SUMMARY_ROOT_CLASS,
  SUMMARY_CHARGES_CLASS,
  SUMMARY_SUBNOTE_CLASS,
  SummaryRow,
  SummaryDiscountedStayRow,
  SummaryTotal,
  SummaryPaymentPlan,
} from "@/app/components/villa/booking/BookingSummary";
/* 🛡️ Uluslararası telefon — mevcut helper; yeni kütüphane YOK. */
import { DIAL_CODES, joinPhone } from "@/lib/phone.helper";

/* 🛡️ Aşama 7A — lazy `country-state-city` yükleyici.
   Modül seviyesinde tek promise (aynı sayfada tekrar tekrar indirilmez).
   Yükleme hata verirse promise sıfırlanır → sonraki mount yeniden dener. */
type CountryStateModule = typeof import("@/lib/country-state.lazy");
let countryStateModulePromise: Promise<CountryStateModule> | null = null;
function loadCountryStateModule(): Promise<CountryStateModule> {
  if (!countryStateModulePromise) {
    countryStateModulePromise = import("@/lib/country-state.lazy").catch(
      (err: unknown) => {
        countryStateModulePromise = null;
        throw err;
      }
    );
  }
  return countryStateModulePromise;
}

export default function ReservationForm({
  villa,
  prices,
  discounts,
  start,
  end,
  image,
  adults,
  children,
  // 🛡️ HAVUZ ISITMA — 6. adım. `/rezervasyon/[slug]/page.tsx`'in
  // `poolHeating` search param'ından türettiği boolean prop —
  // useBookingEngine'in hard-navigation URL'i üzerinden taşınıyor
  // (bkz. useBookingEngine.ts handleReservation).
  poolHeatingSelected,
  /* 🛡️ Opsiyonel — verilmezse "tr" → TR çıktısı BİREBİR eskisi gibi. */
  locale = DEFAULT_LOCALE,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}: any) {
  const activeLocale: Locale = locale;
  const dictionary = getDictionary(activeLocale);
  const dict = dictionary.reservation;
  /* 🛡️ Fiyat özeti etiketleri `booking` namespace'inden REUSE edilir —
     ikinci bir kopya üretilmedi (TR değerleri BİREBİR aynı). */
  const bookingDict = dictionary.booking;
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [prepaymentRate, setPrepaymentRate] = useState(20);
  /* 🛡️ Modern feedback layer — alert() yerine state-driven UI.
     submitError: form üstünde inline error banner mesajı (null → gizli).
     Başarı durumu artık tam sayfa redirect ile gösterilir
     (`/rezervasyon/basarili?ref=...&villa=...`); modal state YOK. */
  const [submitError, setSubmitError] = useState<string | null>(null);
  /* 🛡️ SÖZLEŞME ONAYI — başlangıçta İŞARETSİZ. Gönderim butonunun
     mevcut `isFormValid` kapısına EK bir koşul olarak bağlanır;
     mevcut alan validasyonlarının hiçbiri değişmez. */
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PublicPaymentMethodOption[]>([]);
  const [errors, setErrors] = useState<PublicReservationFormErrors>({});

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);

  const [guestNames, setGuestNames] = useState<string[]>([]);

  const { currency, rates } = useCurrency();

  /* 🛡️ FAZ 1 — typed state shape + initial factory.
     Eski `useState({ ... })` ile birebir aynı initial object (alan sırası
     + default değerler byte-identical). Initial factory:
     `_types/reservation-form-data > initialPublicReservationFormData()`. */
  const [form, setForm] = useState<PublicReservationFormData>(() =>
    initialPublicReservationFormData()
  );

  /* 🛡️ Aşama 7A — lazy yüklenen modül + kullanıcının SON ülke seçimi.
     `selectedCountryRef` null → kullanıcı henüz ülke seçmedi (mevcut
     davranış: varsayılan TR). Async sonuç geldiğinde HER ZAMAN o anki
     seçim okunur → eski/yarışan sonuç yeni seçimin state'ini EZEMEZ. */
  const countryStateRef = useRef<CountryStateModule | null>(null);
  const selectedCountryRef = useRef<string | null>(null);

  /* Eski iki mount effect'inin (liste → sıralı liste + varsayılan TR +
     TR şehirleri) BİRLEŞİK hâli. Aynı commit'te batch'lendikleri için
     ekranda yalnız sıralı liste görünüyordu; nihai state BİREBİR aynı.
     - Varsayılan ülke "TR" eskisi gibi mount'ta SENKRON atanır → form
       state'i (payload, şehir select'inin aktifliği/metni) ilk client
       render'dan itibaren AYNI kalır.
     - Yalnız ülke/şehir LİSTELERİ lazy chunk yüklendikten sonra dolar.
       SSR ve ilk client render'da listeler (eskisi gibi) boştur. */
  useEffect(() => {
    let cancelled = false;
    setForm((prev) => ({ ...prev, country: "TR" }));
    loadCountryStateModule()
      .then((mod) => {
        /* Unmount sonrası state güncellemesi YAPILMAZ. */
        if (cancelled) return;
        countryStateRef.current = mod;
        const all = mod.Country.getAllCountries();
        const sorted = [
          ...all.filter((c) => c.isoCode === "TR"),
          ...all.filter((c) => c.isoCode !== "TR"),
        ];
        setCountries(sorted);
        /* Yükleme sürerken kullanıcı ülke değiştirdiyse ONUN şehirleri;
           değiştirmediyse varsayılan TR şehirleri (eski davranış). */
        setCities(
          mod.State.getStatesOfCountry(selectedCountryRef.current ?? "TR")
        );
      })
      .catch(() => {
        /* Chunk yüklenemezse listeler boş kalır (SSR çıktısıyla aynı
           durum); ülke/şehir public formda zorunlu DEĞİL → gönderim
           engellenmez, varsayılan ülke "TR" eskisi gibi payload'a gider. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const total = Number(form.guests || 1);
    const extraCount = total - 1;
    if (extraCount <= 0) {
      setGuestNames([]);
      return;
    }
    setGuestNames((prev) => {
      const updated = [...prev];
      while (updated.length < extraCount) updated.push("");
      return updated.slice(0, extraCount);
    });
  }, [form.guests]);

  const handleCountryChange = (countryCode: string) => {
    selectedCountryRef.current = countryCode;
    setForm((prev) => ({
      ...prev,
      country: countryCode,
      city: "",
    }));
    /* Modül yüklüyse eskisi gibi SENKRON güncellenir. Henüz yüklenmediyse
       mount effect'i yüklenince `selectedCountryRef`'teki GÜNCEL seçimin
       şehirlerini uygular (yarış yok). */
    const mod = countryStateRef.current;
    if (mod) {
      setCities(mod.State.getStatesOfCountry(countryCode));
    }
  };

  useEffect(() => {
    if (!adults && !children) return;
    const total = Number(adults || 0) + Number(children || 0);
    setForm((prev) => ({
      ...prev,
      guests: total > 0 ? total.toString() : "1",
    }));
  }, [adults, children]);

  /* ---------------------------------------------
     🔥 EFFECTIVE PREPAYMENT RATE
     - villa.custom_prepayment_rate varsa → onu kullan
     - yoksa global settings.prepayment_rate
     - yoksa 20 (default)
  ---------------------------------------------- */
  useEffect(() => {
    const villaOverride = (villa as any)?.custom_prepayment_rate;
    if (
      villaOverride !== null &&
      villaOverride !== undefined &&
      villaOverride !== ""
    ) {
      setPrepaymentRate(Number(villaOverride));
      return;
    }

    // 🛡️ MEMORY-LEAK HARDENING (Faz 2A):
    //   getSettings async; rezervasyon formu hızlı unmount olursa
    //   stale setState yarış koşulu önlenir.  Davranış: aynı global
    //   prepayment_rate yüklemesi, aynı fallback (=20).
    let cancelled = false;
    getPublicSettings().then((data) => {
      if (cancelled) return;
      if (data?.prepayment_rate) setPrepaymentRate(data.prepayment_rate);
    });
    return () => {
      cancelled = true;
    };
  }, [villa]);

  useEffect(() => {
    /* 🛡️ FAZ 2 frontend purge — public fetch /api/public/payment-methods.
       Eski anon DB client `select("*")` aynı select shape ile route içinde
       (anon db; RLS bağlamı aynı). Fail-soft: hata → boş state (eski
       davranış da öyle, `data || []`). */
    const fetchPaymentMethods = async () => {
      try {
        const res = await fetch("/api/public/payment-methods");
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payment_methods?: any[];
        };
        setPaymentMethods(
          res.ok && json.ok ? json.payment_methods || [] : []
        );
      } catch {
        setPaymentMethods([]);
      }
    };
    fetchPaymentMethods();
  }, []);

  const getNights = () => {
    if (!start || !end) return 0;
    const s = new Date(start);
    const e = new Date(end);
    return Math.ceil(
      (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)
    );
  };

  /* ===============================================================
     🔥 DISPLAY ONLY — kullanıcının gördüğü tutarlar
     ===============================================================
     Site currency switcher (TRY/USD/EUR/GBP) sadece BU result'ı
     etkiler. Reservation snapshot'a yazılan değerler ASLA bu
     result'tan üretilmez.
     =============================================================== */
  const result =
    start && end
      ? calculateGrandTotal({
        start,
        end,
        prices,
        currency,
        rates,

        cleaning_fee:
          villa.cleaning_fee || 0,

        cleaning_currency:
          villa.cleaning_currency || "TRY",

        cleaning_limit:
          villa.cleaning_limit || 0,

        // 🛡️ HAVUZ ISITMA — 6. adım. Opsiyonel parametreler; villa'da
        // fee yoksa (null/0) calculateGrandTotal içindeki
        // calculatePoolHeatingFee zaten 0 döner — mevcut davranış
        // BYTE-IDENTICAL kalır (bkz. lib/price.engine.ts).
        pool_heating_fee:
          villa.pool_heating_fee || 0,

        pool_heating_currency:
          villa.pool_heating_currency || "TRY",

        pool_heating_selected:
          !!poolHeatingSelected,

        // 🛡️ Migration 076 — sezonluk ay kısıtı. villa'da kısıtlama
        // tanımlı değilse (NULL) calculateGrandTotal içinde her zaman
        // aktif kabul edilir — davranış BYTE-IDENTICAL kalır.
        pool_heating_months:
          villa.pool_heating_months,

        discounts,
      })
      : null;

  /* 🛡️ İNDİRİM ÖNCESİ KARŞILAŞTIRMA (bu tur) — YALNIZ DISPLAY amaçlı;
     `result` ile BİREBİR AYNI parametreler, tek fark discounts:null.
     calculateGrandTotal DEĞİŞTİRİLMEDİ — dosyada zaten 2 kez çağrılan
     (result/snapshot) AYNI desende BİR KEZ DAHA çağrıldı; yeni formül/
     hesaplama YOK. snapshot/API/server-authoritative akışı bundan HİÇ
     ETKİLENMEZ (ayrı, dokunulmamış blok) — sonuç yalnız aşağıdaki
     "İndirimli Toplam Tutar" karşılaştırma kutusunu göstermek için
     kullanılır. */
  const resultWithoutDiscount =
    start && end
      ? calculateGrandTotal({
        start,
        end,
        prices,
        currency,
        rates,

        cleaning_fee:
          villa.cleaning_fee || 0,

        cleaning_currency:
          villa.cleaning_currency || "TRY",

        cleaning_limit:
          villa.cleaning_limit || 0,

        pool_heating_fee:
          villa.pool_heating_fee || 0,

        pool_heating_currency:
          villa.pool_heating_currency || "TRY",

        pool_heating_selected:
          !!poolHeatingSelected,

        pool_heating_months:
          villa.pool_heating_months,

        discounts: null,
      })
      : null;

  /* 🛡️ İndirim gerçekten toplamı DEĞİŞTİRDİYSE (epsilon toleranslı —
     ondalık/döviz-çevrim farkları için) aktif kabul edilir. "fixed" tipte
     indirim normal fiyattan yüksek bir özel fiyat da olabildiğinden
     (villa_discounts kuralı, price.engine.ts) yalnız "ucuzladı mı" değil
     "değişti mi" kontrol edilir. */
  const hasActiveStayDiscount =
    !!result &&
    !!resultWithoutDiscount &&
    Math.abs(
      (resultWithoutDiscount.stay || 0) - (result.stay || 0)
    ) > 0.005;

  /* ===============================================================
     🔥 SNAPSHOT — ASLA display currency'den etkilenmez
     ===============================================================
     calculateGrandTotal'u currency="TRY" ile yeniden çağırır.
     - total / stay / cleaning  → TRY (snapshot için)
     - original_*               → villanın gerçek currency'si
     Site USD seçili olsa bile bu değer TRY olarak kaydedilir.
     =============================================================== */
  const snapshot =
    start && end
      ? calculateGrandTotal({
        start,
        end,
        prices,
        currency: "TRY",
        rates,

        cleaning_fee:
          villa.cleaning_fee || 0,

        cleaning_currency:
          villa.cleaning_currency || "TRY",

        cleaning_limit:
          villa.cleaning_limit || 0,

        // 🛡️ HAVUZ ISITMA — 6. adım. Display result ile AYNI parametreler
        // (yalnız currency:"TRY" farkı — snapshot deseni zaten böyle).
        pool_heating_fee:
          villa.pool_heating_fee || 0,

        pool_heating_currency:
          villa.pool_heating_currency || "TRY",

        pool_heating_selected:
          !!poolHeatingSelected,

        // 🛡️ Migration 076 — sezonluk ay kısıtı. Display result ile
        // AYNI parametre.
        pool_heating_months:
          villa.pool_heating_months,

        discounts,
      })
      : null;

  const totalPrice = result?.total || 0;

  const villaCurrency =
    result?.original_currency || "TRY";

  const exchangeRate =
    villaCurrency === "TRY"
      ? 1
      : Number(rates?.[villaCurrency] || 1);

  const hasForeignCurrency =
    result?.original_currency !== "TRY" ||
    result?.original_cleaning_currency !== "TRY";

  const prepayment = result
    ? calculatePrepayment(
      /* 🛡️ HAVUZ ISITMA — 6. adım. 3. parametre eklendi — pool heating
         de (cleaning gibi) ön ödeme dışı tutulur. poolHeatingSelected=false
         iken result.poolHeating=0 → BYTE-IDENTICAL eski davranış. */
      accommodationBase(result.total, result.cleaning, result.poolHeating),
      prepaymentRate
    )
    : 0;

  // 🔥 FINANCIAL SNAPSHOT — display ile karıştırma
  // Snapshot'a yazılan prepayment ASLA TRY değerinden üretilir.
  const snapshotTotalTRY = snapshot?.total || 0;
  const snapshotCleaningTRY = snapshot?.cleaning || 0;
  // 🛡️ HAVUZ ISITMA — 6. adım. TRY snapshot — DB'ye yazılan
  // pool_heating_total_try'ın client-side kaynağı (server bunu
  // AYRICA authoritative olarak yeniden hesaplayıp override eder).
  const snapshotPoolHeatingTRY = snapshot?.poolHeating || 0;

  const snapshotPrepayment = calculatePrepayment(
    accommodationBase(
      snapshotTotalTRY,
      snapshotCleaningTRY,
      snapshotPoolHeatingTRY
    ),
    prepaymentRate
  );

  const snapshotRemaining = Math.max(
    snapshotTotalTRY - snapshotPrepayment,
    0
  );

  // Display-side hesap — UI'da görünen değerler (eski davranış)
  const remainingPayment =
    totalPrice - prepayment;

  /* 🛡️ EKSİK SEZON FİYATI — seçilen aralıkta fiyatı tanımlı olmayan
     gece varsa toplam hesaplanamaz. Tam kapsanan aralıklarda DAİMA
     false → mevcut davranış BİREBİR aynı. */
  const priceUnavailable = !!result && !result.priceAvailable;

  const isFormValid =
    form.name &&
    form.phone &&
    /* 🛡️ İkinci telefon da zorunlu — mevcut isFormValid deseni aynen. */
    form.phone2 &&
    form.email &&
    form.identity &&
    form.payment_method_id &&
    start &&
    end &&
    /* Geçersiz fiyatla gönderim engellenir; sunucu da ayrıca reddeder. */
    !priceUnavailable;

  const handleSubmit = async () => {
    /* 🛡️ FAZ 2 — validation helper-driven; mesaj + regex'ler birebir. */
    const newErrors = validatePublicReservationForm(
      { form, start, end },
      activeLocale
    );

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    /* 🛡️ SÖZLEŞME ONAYI — GÖNDERİM KAPISI (alan validasyonlarından SONRA).
       Onay verilmeden gönderim YAPILMAZ: fonksiyon burada erken döner,
       API'ye POST atılmaz ve MEVCUT inline hata banner'ı (submitError)
       nedenini gösterir — yeni bildirim sistemi YOK.

       ⚠️ SIRA BİLİNÇLİ: `validatePublicReservationForm` handleSubmit'in
       İLK çağrısı olmaya devam eder (mevcut orkestrasyon sözleşmesi ve
       onu kilitleyen testler DEĞİŞMEDİ); kullanıcı önce eksik alanlarını,
       sonra eksik onayı görür.

       ⚠️ `isFormValid` KASITLI OLARAK DEĞİŞTİRİLMEDİ: butonu disable
       etmek yerine guard kullanılır, çünkü disabled buton tıklama olayı
       ÜRETMEZ → kullanıcı NEDEN ilerleyemediğini göremezdi. Bu yol hem
       gönderimi engeller hem de anlaşılır bir mesaj verir. */
    if (!termsAccepted) {
      setSubmitError(dict.form.termsRequired);
      return;
    }

    setLoading(true);

    try {
      /* 🛡️ FAZ 2 — ORCHESTRATION SIRASI BYTE-IDENTICAL:
         1. payload build (snapshot-based, sync helper)
         2. AWAITED createReservation
         3. FIRE-FORGET mail dispatch (outer try + inner .catch)
         4. alert success
         5. setForm reset
         6. setErrors clear
         Catch + finally pattern aynen. */
      /* 🛡️ PII-SAFE CREATE (PHASE 3): client-side anon `createReservation`
         yerine SERVER route'a POST. Insert server'da service_role ile
         yapılır (040 admin-only RLS sonrası anon INSERT reddedilir);
         response yalnız { id, reservation_no } döner — PII client'a
         gelmez. Hata mesajı ("Bu tarihler dolu" vb.) server'dan
         BYTE-IDENTICAL gelir; catch bloğu aynen gösterir. */
      const res = await fetch("/api/public/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPublicReservationPayload({
            villa,
            start,
            end,
            form,
            guestNames,
            snapshot: snapshot!,
            snapshotTotalTRY,
            snapshotCleaningTRY,
            snapshotPrepayment,
            snapshotRemaining,
            exchangeRate,
            hasForeignCurrency,
            poolHeatingSelected: !!poolHeatingSelected,
            snapshotPoolHeatingTRY,
          })
        ),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; reservation?: { id?: string | null } }
        | null;

      if (!res.ok || !json?.ok) {
        /* 🛡️ SUNUCU HATA METNİ KULLANICIYA BASILMAZ. Route'un TR
           mesajları, `applyRateLimit`'in İngilizce "Too many requests"
           gövdesi ve `create.service.ts`'ten gelebilen HAM DB hata
           metni locale dışıdır ve UI'a SIZMAMALI. API sözleşmesi,
           rate-limit, Sentry ve create akışı DEĞİŞMEDİ — yalnız
           GÖSTERİM locale-aware dictionary metnine çevrildi.
           TEK İSTİSNA: HTTP 409 = "tarihler dolu" — kullanıcı için
           anlamlı olduğundan kendi dictionary mesajını alır. */
        throw new Error(
          res.status === 409
            ? dict.form.errorDatesUnavailable
            : dict.form.errorGeneric
        );
      }

      /* 🛡️ RESERVATION REQUEST MAIL — fire-and-forget (helper-driven).
         Helper tag + outer try/catch pattern BYTE-IDENTICAL. */
      const reservationId = json.reservation?.id || null;
      if (reservationId) {
        dispatchPublicReservationRequestMail(reservationId);
      }

      /* 🛡️ Modern success — modal yerine tam sayfa redirect.
         API/mail/form mantığı AYNEN; sadece feedback UX değişti.
         Referans + villa slug query param ile success sayfasına geçilir. */
      setSubmitError(null);

      setForm(initialPublicReservationFormData());

      setErrors({});

      const villaSlug =
        typeof villa?.slug === "string" && villa.slug.trim().length > 0
          ? villa.slug.trim()
          : "";
      const refParam = reservationId ? encodeURIComponent(reservationId) : "";
      const villaParam = villaSlug ? encodeURIComponent(villaSlug) : "";
      const qs: string[] = [];
      if (refParam) qs.push(`ref=${refParam}`);
      if (villaParam) qs.push(`villa=${villaParam}`);
      /* 🛡️ LOCALE-AWARE SUCCESS REDIRECT. Query parametreleri (`ref`,
         `villa`) ve `encodeURIComponent` davranışı AYNEN korunur;
         yalnız path'e locale prefix'i eklenir. TR'de URL BYTE-IDENTICAL. */
      const successBase =
        activeLocale === DEFAULT_LOCALE
          ? "/rezervasyon/basarili"
          : `/${activeLocale}/rezervasyon/basarili`;
      const url = `${successBase}${qs.length ? `?${qs.join("&")}` : ""}`;
      router.push(url);

    } catch (err: unknown) {

      console.error(err);

      const msg =
        err instanceof Error ? err.message : dict.form.errorGeneric;
      /* 🛡️ Modern error — alert() yerine inline banner state. */
      setSubmitError(msg);

    } finally {

      setLoading(false);

    }
  };

  /* 🎨 Checkout input dili (UI turu): ~50px yükseklik, 13px metin,
     11px radius, #DDE3EC border, odakta #1B4EF5 + hafif mavi halka.
     inputOk/inputErr seçimi (validation görünümü) AYNEN. */
  const inputBase =
    "w-full !border rounded-[11px] h-[50px] px-4 text-[13px] bg-white text-[#0A1633] placeholder:text-[#8A93A6] outline-none transition-[border-color,box-shadow] focus:ring-4 focus:ring-[#1B4EF5]/10";
  const inputOk =
    "!border-[#DDE3EC] hover:!border-[#B9C3D3] focus:!border-[#1B4EF5]";
  const inputErr = "!border-red-500 focus:ring-red-500/10";

  /* Konaklama Bilgileri kartı için tarih gösterimi — mevcut özet ile
     AYNI kaynak (start/end) ve AYNI timeZone; yalnız biçim (yıl dahil). */
  const formatStayDate = (d?: string) =>
    d
      ? new Date(d).toLocaleDateString(LOCALE_BCP47[activeLocale], {
          weekday: "short",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Europe/Istanbul",
        })
      : "—";

  /* 🎨 CHECKOUT LAYOUT (UI turu) — desktop: sol ~%62 bilgiler, sağ ~%38
     sticky özet; mobil: tek kolon (önce bilgiler, sonra özet + CTA).
     State / handler / validation / fiyat değişkenleri ve submit akışı
     BİREBİR AYNI — yalnız JSX yerleşimi ve className'ler değişti. */
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.63fr)_minmax(0,1fr)] gap-5 lg:gap-7 items-start">
      {/* ═══════════════ SOL — REZERVASYON BİLGİLERİ ═══════════════ */}
      <div className="min-w-0 space-y-4 md:space-y-5">
        {/* A) KONAKLAMA BİLGİLERİ — salt bilgi (seçim önceki adımda) */}
        <section className={CARD_CLASS}>
          <SectionHeader
            icon={<CalendarDays size={16} strokeWidth={1.9} />}
            title={dict.form.stayInfoTitle}
          />
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {[
              { k: bookingDict.checkInPillLabel, v: formatStayDate(start) },
              { k: bookingDict.checkOutPillLabel, v: formatStayDate(end) },
              { k: dict.form.nightsLabel, v: String(start && end ? getNights() : "—") },
              { k: bookingDict.guestsLabel, v: String(form.guests || 1) },
            ].map((it) => (
              <div
                key={it.k}
                className="rounded-[11px] border border-[#E5E7EB] bg-[#F7F9FC] px-3.5 py-3 min-w-0"
              >
                <dt className="text-[11px] font-medium text-[#64708A]">{it.k}</dt>
                <dd className="mt-1 text-[13px] font-semibold text-[#0A1633] tabular-nums truncate">
                  {it.v}
                </dd>
              </div>
            ))}
          </dl>
        </section>

          {/* CONTACT SECTION */}
          <Section
            eyebrow={dict.form.step1Eyebrow}
            icon={<UserRound size={16} strokeWidth={1.9} />}
            title={dict.form.step1Title}
            subtitle={dict.form.step1Subtitle}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: "name", placeholder: dict.form.namePlaceholder },
                { key: "email", placeholder: dict.form.emailPlaceholder },
                { key: "identity", placeholder: dict.form.identityPlaceholder },
              ].map((field) => (
                <div key={field.key}>
                  <input
                    value={(form as any)[field.key]}
                    placeholder={field.placeholder}
                    onChange={(e) => {
                      setForm({ ...form, [field.key]: e.target.value });
                      setErrors((prev: any) => ({
                        ...prev,
                        [field.key]: "",
                      }));
                    }}
                    className={`${inputBase} ${errors[field.key] ? inputErr : inputOk
                      }`}
                  />
                  {errors[field.key] && (
                    <p className="text-xs text-red-500 mt-1.5">
                      {errors[field.key]}
                    </p>
                  )}
                </div>
              ))}

              {/* 🛡️ TELEFON 1 + TELEFON 2 — ikisi de ZORUNLU, ülke kodları
                  BİRBİRİNDEN BAĞIMSIZ. Mevcut input/select tasarım dili
                  (inputBase/inputOk/inputErr) aynen kullanıldı; yeni kart,
                  yeni renk, yeni component mimarisi YOK. Mobilde ülke kodu
                  sabit genişlikte, numara kalan alanı doldurur. */}
              {(
                [
                  {
                    key: "phone" as const,
                    dialKey: "phone_dial" as const,
                    nationalKey: "phone_national" as const,
                    label: dict.form.phoneLabel,
                    placeholder: dict.form.phonePlaceholder,
                  },
                  {
                    key: "phone2" as const,
                    dialKey: "phone2_dial" as const,
                    nationalKey: "phone2_national" as const,
                    label: dict.form.phone2Label,
                    placeholder: dict.form.phone2Placeholder,
                  },
                ]
              ).map((f) => (
                <div key={f.key}>
                  {/* 🛡️ GÖRÜNÜR ÜST LABEL KALDIRILDI ("Telefon 1 *" /
                      "Telefon 2 *"). Diğer alanlarla (Ad/E-posta/TC) aynı
                      şekilde yalnız placeholder gösterilir. `f.label`
                      SİLİNMEDİ: select ve input'un aria-label'ında kalır →
                      ekran okuyucu hangi telefon olduğunu bilmeye devam
                      eder. Zorunluluk mantığı DEĞİŞMEDİ. */}
                  <div className="flex items-stretch gap-2">
                    <select
                      aria-label={`${f.label} — ${dict.form.phoneCountryAriaLabel}`}
                      value={form[f.dialKey]}
                      onChange={(e) => {
                        const dial = e.target.value;
                        setForm({
                          ...form,
                          [f.dialKey]: dial,
                          [f.key]: joinPhone(dial, form[f.nationalKey]),
                        });
                        setErrors((prev) => ({ ...prev, [f.key]: "" }));
                      }}
                      className={`${inputBase} ${
                        errors[f.key] ? inputErr : inputOk
                      } !w-[104px] shrink-0 px-2 tabular-nums`}
                    >
                      {DIAL_CODES.map((c) => (
                        <option key={c.iso} value={c.dial}>
                          {c.dial} {c.label}
                        </option>
                      ))}
                    </select>
                    <input
                      id={`reservation-${f.key}`}
                      aria-label={f.label}
                      type="tel"
                      inputMode="tel"
                      autoComplete={f.key === "phone" ? "tel" : "tel-national"}
                      value={form[f.nationalKey]}
                      placeholder={f.placeholder}
                      onChange={(e) => {
                        const national = e.target.value;
                        setForm({
                          ...form,
                          [f.nationalKey]: national,
                          [f.key]: joinPhone(form[f.dialKey], national),
                        });
                        setErrors((prev) => ({ ...prev, [f.key]: "" }));
                      }}
                      className={`${inputBase} ${
                        errors[f.key] ? inputErr : inputOk
                      } flex-1 min-w-0`}
                    />
                  </div>
                  {errors[f.key] && (
                    <p className="text-xs text-red-500 mt-1.5">{errors[f.key]}</p>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* ADDRESS SECTION */}
          <Section
            eyebrow={dict.form.step2Eyebrow}
            icon={<MapPin size={16} strokeWidth={1.9} />}
            title={dict.form.step2Title}
            subtitle={dict.form.step2Subtitle}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select
                value={form.country || ""}
                onChange={(e) => handleCountryChange(e.target.value)}
                className={`${inputBase} ${inputOk}`}
              >
                <option value="">{dict.form.countrySelect}</option>
                {countries.map((c) => (
                  <option key={c.isoCode} value={c.isoCode}>
                    {/* 🌍 Display override: TR locale'de "Türkiye";
                        EN/DE'de Intl ülke adı. Option value hâlâ ISO code
                        (`c.isoCode`); form payload ve validation aynen
                        ISO code akar. */}
                    {formatCountryLabel(c.isoCode, activeLocale, () => c.name)}
                  </option>
                ))}
              </select>

              <select
                value={form.city ?? ""}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                disabled={!form.country}
                className={`${inputBase} ${inputOk} disabled:opacity-60`}
              >
                <option value="">
                  {form.country
                    ? dict.form.citySelect
                    : dict.form.citySelectDisabled}
                </option>
                {cities.map((c) => (
                  <option key={c.isoCode} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>

              <input
                value={form.address}
                placeholder={dict.form.addressPlaceholder}
                className={`md:col-span-2 ${inputBase} ${inputOk}`}
                onChange={(e) =>
                  setForm({ ...form, address: e.target.value })
                }
              />

              <input
                value={form.note}
                placeholder={dict.form.notePlaceholder}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className={`md:col-span-2 ${inputBase} ${inputOk}`}
              />
            </div>
          </Section>

          {/* GUESTS SECTION */}
          <Section
            eyebrow={dict.form.step3Eyebrow}
            icon={<Users size={16} strokeWidth={1.9} />}
            title={dict.form.step3Title}
            subtitle={dict.form.step3Subtitle}
          >
            <div className="bg-[#F7F9FC] border border-[#E5E7EB] rounded-[11px] px-4 py-3 text-[13px] flex justify-between items-center gap-3 mb-4">
              <span className="font-medium text-[var(--color-stone-700)]">
                {dict.form.totalGuestsLabel}
              </span>
              <span className="text-[var(--color-stone-900)] font-semibold">
                {formatDictionaryString(dict.form.guestsPersonCount, {
                  n: form.guests || 1,
                })}
                {(adults || children) && (
                  <span className="text-[var(--color-stone-500)] ml-2 font-normal">
                    (
                    {formatDictionaryString(bookingDict.guestsSummary, {
                      adults: adults || 0,
                      children: children || 0,
                    })}
                    )
                  </span>
                )}
              </span>
            </div>

            {guestNames.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)]">
                  {dict.form.otherGuests}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {guestNames.map((g, i) => (
                    <input
                      key={i}
                      value={g}
                      placeholder={formatDictionaryString(
                        dict.form.guestNamePlaceholder,
                        { n: i + 2 }
                      )}
                      onChange={(e) => {
                        const updated = [...guestNames];
                        updated[i] = e.target.value;
                        setGuestNames(updated);
                      }}
                      className={`${inputBase} ${inputOk}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* PAYMENT */}
          <Section
            eyebrow={dict.form.step4Eyebrow}
            icon={<CreditCard size={16} strokeWidth={1.9} />}
            title={dict.form.step4Title}
            subtitle={dict.form.step4Subtitle}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {paymentMethods.length === 0 && (
                <p className="text-sm text-[var(--color-stone-400)] italic">
                  {dict.form.noPaymentMethod}
                </p>
              )}
              {paymentMethods.map((p) => {
                const checked = form.payment_method_id === p.id;
                return (
                  <label
                    key={p.id}
                    className={`
                      flex items-center gap-3 px-4 min-h-[50px] py-3 rounded-[11px]
                      border cursor-pointer transition
                      ${checked
                        ? "border-[#1B4EF5] bg-[#F5F8FF] ring-1 ring-[#1B4EF5]/15"
                        : "border-[#DDE3EC] bg-white hover:border-[#B9C3D3]"
                      }
                    `}
                  >
                    <input
                      type="radio"
                      checked={checked}
                      onChange={() =>
                        setForm({ ...form, payment_method_id: p.id })
                      }
                      className="!w-4 !h-4 accent-[#1B4EF5]"
                    />
                    <CreditCard
                      size={16}
                      className="text-[#1B4EF5]"
                    />
                    <span className="text-[13px] font-medium text-[#0A1633]">
                      {resolveTaxonomyName(
                        p.name,
                        p.name_by_locale,
                        activeLocale
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            {errors.payment_method_id && (
              <p className="text-xs text-red-500 mt-2">
                {errors.payment_method_id}
              </p>
            )}
          </Section>

          {/* PAYMENT PREFERENCE */}
          <Section
            eyebrow={dict.form.step5Eyebrow}
            icon={<Wallet size={16} strokeWidth={1.9} />}
            title={dict.form.step5Title}
            subtitle={dict.form.step5Subtitle}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  value: "prepayment" as PaymentPreference,
                  label: dict.form.prepaymentOption,
                  hint: formatDictionaryString(dict.form.prepaymentHint, {
                    rate: prepaymentRate,
                  }),
                },
                {
                  value: "full_payment" as PaymentPreference,
                  label: dict.form.fullPaymentOption,
                  hint: dict.form.fullPaymentHint,
                },
              ].map((opt) => {
                const checked = form.payment_preference === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`
                      flex items-start gap-3 px-4 py-3 rounded-[11px]
                      border cursor-pointer transition
                      ${checked
                        ? "border-[#1B4EF5] bg-[#F5F8FF] ring-1 ring-[#1B4EF5]/15"
                        : "border-[#DDE3EC] bg-white hover:border-[#B9C3D3]"
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="payment_preference"
                      checked={checked}
                      onChange={() =>
                        setForm({ ...form, payment_preference: opt.value })
                      }
                      className="!w-4 !h-4 mt-0.5 accent-[#1B4EF5]"
                    />
                    <span className="flex-1">
                      <span className="block text-[13px] font-semibold text-[#0A1633]">
                        {opt.label}
                      </span>
                      <span className="block text-[11px] text-[var(--color-stone-500)] mt-0.5">
                        {opt.hint}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Section>

      </div>

      {/* ═══════════════ SAĞ — STICKY REZERVASYON ÖZETİ ═══════════════ */}
      <aside className="min-w-0 lg:sticky lg:top-24">
        <div className="rounded-[20px] border border-[#E5E7EB] bg-white shadow-[0_10px_30px_-18px_rgba(10,22,51,0.22)] overflow-hidden">
          <div className="p-5 md:p-6 space-y-4">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#1B4EF5]">
              {dict.summary.summaryLabel}
            </p>

            {/* Villa — görsel + ad (veri AYNEN) */}
            <div className="flex items-center gap-3.5">
              <img
                src={image || "/placeholder.jpg"}
                className="w-[76px] h-[64px] shrink-0 rounded-[12px] object-cover bg-[#EEF1F6]"
                alt={villa.title}
              />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-[#64708A]">{dict.summary.eyebrow}</p>
                <h2 className="mt-0.5 font-display font-bold text-[16px] leading-snug text-[#0A1633] line-clamp-2">
                  {villa.title}
                </h2>
              </div>
            </div>

            <div className="space-y-2 border-y border-[#E5E7EB] py-3.5">
              {start && end && (
                <div className="flex items-center gap-2.5 text-[13px] text-[#0A1633]">
                  <Calendar
                    size={16}
                    className="shrink-0 text-[#1B4EF5]"
                  />
                  <span>
                    {/* 🛡️ Europe/Istanbul explicit — server SSR / client
                         hidrasyon aynı çıktı (UTC server'da day kayması yok). */}
                    {new Date(start).toLocaleDateString(LOCALE_BCP47[activeLocale], {
                      day: "numeric",
                      month: "long",
                      timeZone: "Europe/Istanbul",
                    })}{" "}
                    –{" "}
                    {new Date(end).toLocaleDateString(LOCALE_BCP47[activeLocale], {
                      day: "numeric",
                      month: "long",
                      timeZone: "Europe/Istanbul",
                    })}
                    <span className="text-[var(--color-stone-400)] ml-2">
                      {formatDictionaryString(dict.summary.nightsCount, {
                        n: getNights(),
                      })}
                    </span>
                  </span>
                </div>
              )}
              {form.guests && (
                <div className="flex items-center gap-2.5 text-[13px] text-[#0A1633]">
                  <Users
                    size={16}
                    className="shrink-0 text-[#1B4EF5]"
                  />
                  <span>
                    {formatDictionaryString(dict.summary.guestsCount, {
                      n: form.guests,
                    })}
                  </span>
                </div>
              )}
            </div>

            {/* 🛡️ UI/layout turu — fiyat özeti kartı artık villa detayındaki
                BookingSummary.tsx ile AYNI görsel dil (accent çizgi, Toplam
                Tutar yeşil vurgu kutusu, Ön ödeme/Girişte ödenecek mor/turuncu
                iki kutu, "Kısa Süreli Konaklama Ücreti" / "Havuz Isıtma
                Ücreti" metinleri). result/formatCurrency/totalPrice/
                prepayment/prepaymentRate/getNights()/villa.pool_heating_fee
                değerleri ve form.payment_preference dalı BİREBİR AYNI; YENİ
                hesaplama YAZILMADI — yalnız JSX/className değişti. */}
            <div className={SUMMARY_ROOT_CLASS}>
              {/* 🛡️ EKSİK SEZON FİYATI — koşul/metin AYNEN. */}
              {priceUnavailable && (
                <p
                  role="status"
                  className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2"
                >
                  {bookingDict.priceUnavailableNotice}
                </p>
              )}

              <div className={SUMMARY_CHARGES_CLASS}>
                {/* Konaklama tutarı — indirim varsa üstü çizili + etiket
                    (değerler AYNEN: resultWithoutDiscount.stay / result.stay). */}
                {hasActiveStayDiscount ? (
                  <SummaryDiscountedStayRow
                    label={formatDictionaryString(bookingDict.accommodationAmountLabel, {
                      n: getNights(),
                    })}
                    original={formatCurrency(resultWithoutDiscount?.stay || 0, currency, activeLocale)}
                    discounted={formatCurrency(result?.stay || 0, currency, activeLocale)}
                    badge={bookingDict.discountedTotal}
                  />
                ) : (
                  <SummaryRow
                    label={formatDictionaryString(bookingDict.accommodationAmountLabel, {
                      n: getNights(),
                    })}
                    value={formatCurrency(result?.stay || 0, currency, activeLocale)}
                  />
                )}

                {(result?.cleaning || 0) > 0 && (
                  <SummaryRow
                    label={bookingDict.shortStayFeeLabel}
                    value={formatCurrency((result as any).cleaning || 0, currency, activeLocale)}
                  />
                )}

                {/* HAVUZ ISITMA — salt bilgi satırı (seçim önceki adımda). */}
                {(result?.poolHeating || 0) > 0 && (
                  <div>
                    <SummaryRow
                      label={bookingDict.poolHeatingFeeLabel}
                      value={formatCurrency((result as any).poolHeating || 0, currency, activeLocale)}
                    />
                    {typeof villa.pool_heating_fee === "number" &&
                      villa.pool_heating_fee > 0 && (
                        <p className={SUMMARY_SUBNOTE_CLASS}>
                          {formatCurrency(
                            villa.pool_heating_fee,
                            villa.pool_heating_currency || "TRY",
                            activeLocale
                          )}{" "}
                          {bookingDict.poolHeatingPerNightSuffix}{" "}
                          {formatDictionaryString(
                            bookingDict.poolHeatingNightsMultiplier,
                            { n: getNights() }
                          )}
                        </p>
                      )}
                  </div>
                )}
              </div>

              <SummaryTotal
                label={bookingDict.total}
                value={formatCurrency(totalPrice, currency, activeLocale)}
              />

              {/* 🔥 payment_preference dalı BİREBİR AYNI; yalnız ortak
                  BookingSummary primitive'iyle render edilir. */}
              {form.payment_preference === "full_payment" ? (
                <SummaryPaymentPlan
                  prepayLabel={dict.summary.payNowAll}
                  prepayValue={formatCurrency(totalPrice, currency, activeLocale)}
                  dueLabel={bookingDict.dueAtCheckinLabel}
                  dueValue={formatCurrency(0, currency, activeLocale)}
                />
              ) : (
                <SummaryPaymentPlan
                  prepayLabel={formatDictionaryString(bookingDict.prepaymentAmountLabel, {
                    rate: prepaymentRate,
                  })}
                  prepayValue={formatCurrency(prepayment, currency, activeLocale)}
                  dueLabel={bookingDict.dueAtCheckinLabel}
                  dueValue={formatCurrency(totalPrice - prepayment, currency, activeLocale)}
                />
              )}
            </div>
          </div>

          {/* CTA bölümü — onay + gönder (mantık AYNEN) */}
          <div className="border-t border-[#E5E7EB] bg-[#FBFCFE] p-5 md:p-6 space-y-4">
            {/* 🛡️ INLINE ERROR BANNER — submitError null değilse görünür.
               alert() yerine modern inline feedback. */}
            {submitError && (
              <div
                role="alert"
                className="
                  rounded-2xl border border-red-200 bg-red-50
                  px-4 py-3 text-[13.5px] text-red-700
                  flex items-start gap-3
                "
              >
                <span aria-hidden className="mt-0.5">⚠️</span>
                <span className="flex-1 leading-relaxed">{submitError}</span>
                <button
                  type="button"
                  onClick={() => setSubmitError(null)}
                  aria-label={dict.form.errorDismissAriaLabel}
                  className="text-red-500 hover:text-red-700 transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════
                🛡️ SÖZLEŞME ONAYI — zorunlu checkbox (submit'in HEMEN ÖNÜ)
                ═══════════════════════════════════════════════════════
                • Native `<input type="checkbox">` + `<label htmlFor>` →
                  klavye ile seçilebilir, ekran okuyucuya bağlı.
                • Metin sözlükten gelir (`termsLabel`, üç placeholder) →
                  EN/DE'de Türkçe sızıntısı YOK.
                • Link hedefleri `localeHref` ile aktif locale'i taşır.
                • Linkler `stopPropagation` + `target="_blank"`: tıklamak
                  checkbox'ı toggle ETMEZ ve doldurulmuş form kaybolmaz.
                • Mevcut typography/spacing/renk token'ları; yeni global
                  CSS veya yeni component YOK. */}
            <div className="flex items-start gap-2.5">
              <input
                id="reservation-terms-accept"
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => {
                  setTermsAccepted(e.target.checked);
                  /* Onay verilince eksik-onay uyarısı kendiliğinden kalkar;
                     diğer submitError mesajlarına DOKUNULMAZ. */
                  if (e.target.checked && submitError === dict.form.termsRequired) {
                    setSubmitError(null);
                  }
                }}
                className="!w-4 !h-4 mt-0.5 shrink-0 accent-[#1B4EF5]"
              />
              <label
                htmlFor="reservation-terms-accept"
                className="flex-1 text-[12px] leading-[1.6] text-[#5B6478] cursor-pointer"
              >
                {(() => {
                  /* Şablon placeholder'larından bölünür; metin sırası ve
                     noktalama sözlükten AYNEN gelir (locale'e göre cümle
                     kurgusu değişebilsin diye). */
                  /* ⚠️ Alan adı bilinçli olarak `path` (`href` DEĞİL): bunlar
                     HAM canonical path'lerdir, gerçek `href` aşağıda
                     `localeHref(...)` ile üretilir. Böylece "prefix'siz iç
                     link" tarayıcısı (navigation-locale-persistence testi)
                     yanlış alarm vermez ve gerçek koruma sürer. */
                  const LINKS: Record<string, { path: string; label: string }> = {
                    "{cancellation}": {
                      path: "/p/rezervasyon-ve-iptal-kosullari",
                      label: dict.form.termsCancellationLink,
                    },
                    "{distanceSales}": {
                      path: "/p/mesafeli-satis-sozlesmesi",
                      label: dict.form.termsDistanceSalesLink,
                    },
                    "{privacy}": {
                      path: "/p/kvkk-ve-gizlilik-politikasi",
                      label: dict.form.termsPrivacyLink,
                    },
                  };
                  return dict.form.termsLabel
                    .split(/(\{cancellation\}|\{distanceSales\}|\{privacy\})/)
                    .map((part, i) => {
                      const link = LINKS[part];
                      if (!link) return <span key={i}>{part}</span>;
                      return (
                        <Link
                          key={i}
                          href={localeHref(link.path, activeLocale)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="underline underline-offset-2 text-[#1B4EF5] hover:text-[#1640CC] transition-colors"
                        >
                          {link.label}
                        </Link>
                      );
                    });
                })()}
              </label>
            </div>

            {/* SUBMIT */}
            <button
              onClick={handleSubmit}
              disabled={!isFormValid || loading}
              className={`
                w-full inline-flex items-center justify-center gap-2
                h-[52px] rounded-[13px] text-[14px] font-semibold
                transition-[background-color,transform,box-shadow] duration-200 motion-reduce:transition-none
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4EF5]/40 focus-visible:ring-offset-2
                ${isFormValid && !loading
                  ? "bg-[#1B4EF5] text-white shadow-[0_6px_16px_-8px_rgba(27,78,245,0.55)] hover:bg-[#1640CC] hover:-translate-y-px motion-reduce:hover:translate-y-0"
                  : "bg-[#EEF1F6] text-[#9AA3B5] cursor-not-allowed"
                }
              `}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  {dict.form.submitting}
                </>
              ) : (
                <>
                  <CheckCircle2 size={17} />
                  {dict.form.submit}
                </>
              )}
            </button>

            {/* GÜVEN SATIRI — mevcut sayfa rozet metinleri (yeni iddia YOK) */}
            <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-1">
              {[dict.page.badgeLine1, dict.page.badgeLine2, dict.page.badgeLine3].map((t) => (
                <li
                  key={t}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#5B6478]"
                >
                  <ShieldCheck size={13} strokeWidth={2} aria-hidden="true" className="text-[#1B4EF5]" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ── Helpers ── */

/* 🎨 Checkout bölüm kartı — beyaz yüzey, 16px radius, ince #E5E7EB
   border, çok hafif shadow. */
const CARD_CLASS =
  "rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(10,22,51,0.04)] p-5 md:p-6";

function SectionHeader({
  icon,
  eyebrow,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4 md:mb-5">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#EEF3FF] text-[#1B4EF5]"
      >
        {icon}
      </span>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#8A93A6]">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display font-bold text-[16px] md:text-[17px] leading-tight text-[#0A1633] tracking-[-0.01em]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#64708A]">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function Section({
  icon,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className={CARD_CLASS}>
      <SectionHeader icon={icon} eyebrow={eyebrow} title={title} subtitle={subtitle} />
      {children}
    </section>
  );
}
