"use client";

import { useRef, useMemo } from "react";
import { adminFetch } from "@/lib/admin-fetch";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Country, State } from "country-state-city";

/* 🛡️ Stabilization sweep — FAZ 2 extraction sonrası dead import
   temizliği. Aşağıdaki import'lar artık ilgili child component'lere
   taşındı (page.tsx body'sinde referans yok). Davranış değişmez —
   yalnız bundle parse/tree-shake yükü azalır + ESLint signal/noise
   iyileşir. Çıkarılanlar:
     - updateReservationStatus, updateReservationNote (service)
     - ReservationCalendar, LiveDatePriceSummary (DateRangeCard)
     - getCountryLabel (LocationCard)
     - Section, Label, Row (artık tüm child component'lerde)
     - Save, Trash2, HomeIcon (StickyFooterNav / Header / VillaSelect)
     - PaymentPreference type (PaymentPreferenceCard)
     - shouldDisplayDamageDeposit, formatDamageDepositTRY,
       DAMAGE_DEPOSIT_NOTE (PriceCard)
     - normalizePaymentLinkStatus, paymentLinkStatusLabel,
       paymentLinkStatusColor, isBankTransferMethod,
       paymentRequestActionLabel, PaymentLinkStatus type
       (PaymentRequestCard)
     - getValidEndDate (DateRangeCard)
     - formatDateTimeTr (PaymentRequestCard) */
/* 🛡️ FAZ 2 frontend purge — direct service import KALDIRILDI.
   Eskiden:
     import {
       getReservationById,
       updateReservationFull,
       deleteReservationById,
     } from "@/app/services/reservation.service";
   Bu zincir client → reservation.service → admin-gateway/server
   (server-only) → BUILD HATA. Şimdi adminFetch (Bearer) ile
   /api/admin/reservations/[id] route'u; route içinde aynı service
   delege edilir. Davranış BYTE-IDENTICAL: aynı validasyon, aynı
   paid_amount guard, aynı audit, aynı mail trigger (hepsi route
   içindeki service çağrısında server-side). */
import { logActivity } from "@/lib/activity-log.client";

/* 🛡️ FAZ 2 — calculateGrandTotal artık `_helpers/computeReservationPriceRecalc.ts`
   ve `_helpers/computeCustomPriceToggle.ts` içinde kullanılır; page-level
   import gerekmiyor. */

import { fetchExternalCalendarArraysForVillaAdminAction as fetchExternalCalendarArraysForVillaAdmin } from "@/lib/external-calendar.admin.action";
import {
  EMPTY_EXTERNAL_ADMIN_ARRAYS,
  type ExternalCalendarAdminArrays,
} from "@/lib/external-calendar.admin.types";

/* FAZ 1+2: extracted section + helper component'leri. */
import NoteCard from "./_components/NoteCard";
import MisafirBilgisiCard from "./_components/MisafirBilgisiCard";
import ReservationPageHeader, {
  ReservationMetaCards,
} from "./_components/ReservationPageHeader";
import WizardStepBar from "./_components/WizardStepBar";
import StickyFooterNav from "./_components/StickyFooterNav";
import StatusCard from "./_components/StatusCard";
import PaymentPreferenceCard from "./_components/PaymentPreferenceCard";
import PaymentRequestCard from "./_components/PaymentRequestCard";
/* 🔗 ADDITIVE — güvenli paylaşım linki (müşteriye gönderilir). Mevcut
   reservation/price/lookup akışına dokunmaz. */
import PaymentCard from "./_components/PaymentCard";
import DateRangeCard from "./_components/DateRangeCard";
import VillaSelectCard from "./_components/VillaSelectCard";
import PriceCard from "./_components/PriceCard";

import { getPaymentDisplayValues } from "@/lib/payment.helper";
import { accommodationBase, type DiscountRange } from "@/lib/price.engine";

import { reservationCodeDisplay } from "@/lib/reservation-code.helper";

import {
  canConfirmReservation,
  RESERVATION_CONFIRM_GUARD_MESSAGE,
} from "@/lib/reservation-confirm.helper";

import { isPaymentRequestSupported } from "@/lib/payment-link.helper";

/* 🛡️ FAZ 2 — adminFetch / isCreditCardMethod / paymentRequestEndpoint
   artık `_orchestrators/*` içinde kullanılır; page-level import
   gerekmiyor. */

import {
  formatLocalDate,
  parseLocalDate,
} from "@/lib/date-format";
/* 🛡️ FAZ 2 — parseUtcDate artık `_helpers/formatReservationDate.ts`
   içinde kullanılır; page-level import gerekmiyor. */

import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";

/* 🛡️ TUR 2 — `data` strict typed aktif. updateReservationFull
   signature TUR 1'de nullable widening alındı (service.ts payload tipi
   `string | null`/`number | null` kabul ediyor); cascading drift kapandı.
   setData call site'ları null-safe updater pattern'iyle sarmalı. */
import type {
  ReservationDetailData,
  PriceDetailSnapshot,
  SelectedVilla,
} from "./_types/reservation-form-data";

/* 🛡️ TUR 3 — saveAll decomposition helpers (pure / fire-forget).
   Logic byte-identical; side-effect sırası saveAll orchestrator'da. */
import { normalizeStatusKey } from "./_helpers/normalizeStatusKey";
import { detectConfirmTransition } from "./_helpers/detectConfirmTransition";
import { buildReservationBeforeSnapshot } from "./_helpers/buildReservationBeforeSnapshot";
import { buildCustomPricePayload } from "./_helpers/buildCustomPricePayload";
import { buildNormalPayload } from "./_helpers/buildNormalPayload";
import {
  computeAutoPrepayment,
  withLoadedPrepaymentLock,
} from "./_helpers/manualPrepayment";
import { buildReservationAfterSnapshot } from "./_helpers/buildReservationAfterSnapshot";
import { logReservationUpdate } from "./_helpers/logReservationUpdate";

/* 🛡️ FAZ 2 — handler/effect compute helpers (PURE) + orchestrators
   (network-side). page.tsx orchestrator shell'e indirgendi; inline
   handler/effect body'leri helper'lara taşındı. Runtime davranış
   byte-identical; saveAll AST contract korunuyor (helper isimleri
   aynı: dispatchStatusChangeMail, triggerPaymentConfirmation). */
import { formatReservationDate } from "./_helpers/formatReservationDate";
import { computeVillaChangeReset } from "./_helpers/computeVillaChangeReset";
import { computeCustomPriceToggle } from "./_helpers/computeCustomPriceToggle";
import { computeCustomPriceAmountChange } from "./_helpers/computeCustomPriceAmountChange";
import { computeReservationPriceRecalc } from "./_helpers/computeReservationPriceRecalc";
import { fetchBlockedDatesAction as fetchBlockedDates } from "./_effects/fetchBlockedDates.action";
import { dispatchStatusChangeMail as dispatchStatusChangeMailHelper } from "./_orchestrators/dispatchStatusChangeMail";
import { triggerPaymentConfirmation } from "./_orchestrators/triggerPaymentConfirmation";
import { sendPaymentRequest as sendPaymentRequestHelper } from "./_orchestrators/sendPaymentRequest";

export default function AdminReservationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useNotify();
  const confirm = useConfirm();

  const id = params?.id as string;

  /* 🛡️ TUR 2 — `data` strict typed (ReservationDetailData | null).
     TUR 1'de updateReservationFull signature `string | null` kabul edecek
     şekilde gevşetildi → payload mismatch kapandı. setData call site'ları
     null-safe pattern ile sarmalı (`prev ? ({...prev, X}) : prev`). */
  const [data, setData] = useState<ReservationDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  /* 🌍 Konum bilgisi alanları — manuel rezervasyon LocationStep ile
     birebir aynı pattern:
       - Ülke listesi: TR-first sort + getCountryLabel display override
       - Şehir listesi: State.getStatesOfCountry(data.country) reactive
     useMemo türetimler; ek state YOK, payload/validation aynen. */
  const countryOptions = useMemo(() => {
    const all = Country.getAllCountries();
    return [
      ...all.filter((c) => c.isoCode === "TR"),
      ...all.filter((c) => c.isoCode !== "TR"),
    ];
  }, []);
  const cityOptions = useMemo(() => {
    const iso = data?.country;
    if (!iso) return [];
    return State.getStatesOfCountry(iso);
  }, [data?.country]);

  /* ---------------------------------------------
     🔥 VILLA LIST + SELECTED
     Admin villa değiştirebilsin diye
     ekle sayfasıyla aynı yapı.
  ---------------------------------------------- */
  const [villas, setVillas] = useState<Array<{ id: string; title: string }>>(
    []
  );
  const [selectedVilla, setSelectedVilla] = useState<SelectedVilla>(null);

  /* ---------------------------------------------
     🔥 ORIGINAL VILLA ID
     Hem tarih hem villa değişimi recalc tetikler.
  ---------------------------------------------- */
  const [originalVillaId, setOriginalVillaId] = useState<string | null>(
    null
  );

  /* `prices` shu turda `any[]` olarak kalıyor — calculateGrandTotal'ın
     beklediği `PriceRange[]` end_date'i strict `string` istiyor; DB'den
     gelen `string | null` ile uyumsuzluk var (saveAll'a sızar). Bir
     sonraki turda repository/service tarafında normalize edildiğinde
     typed yapılacak. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [prices, setPrices] = useState<any[]>([]);
  /* 🛡️ villa_discounts — takvimde gösterilir VE fiyat recalc'ına
     beslenir (takvim ↔ toplam tutarlılığı). Aynı fetch; EK istek YOK. */
  const [discounts, setDiscounts] = useState<DiscountRange[]>([]);
  const [priceDetail, setPriceDetail] = useState<PriceDetailSnapshot | null>(
    null
  );
  const [prepaymentRate, setPrepaymentRate] = useState(20);

  // 🔥 PAYMENT REQUEST — unified flow state'i
  // (credit_card → payment_link maili, bank_transfer → banka bilgileri maili)
  const [paymentLinkSending, setPaymentLinkSending] = useState(false);
  const [paymentLinkError, setPaymentLinkError] = useState<string>("");

  // 🔥 PAYMENT CONFIRM — manuel "Ödemeyi Onayla" butonu KALDIRILDI.
  //    Yeni akış: status="confirmed" + paid_amount>0 ile saveAll
  //    çağrıldığında otomatik olarak /api/mail/payment-confirmed
  //    tetiklenir (aşağıda triggerPaymentConfirmation helper'ı).

  /* ---------------------------------------------
     🔥 GUEST NAMES — public + create page ile aynı convention
     - data.name        → primary booker (1. misafir)
     - guestNames[]     → ek misafirler (2., 3., 4. … misafir)
     - DB kolonu        → reservations.guest_names (string[])

     Init: data ilk yüklendiğinde DB'deki guest_names array'i
     `guests - 1` boyuna doldurulup state'e taşınır (initRef ile
     yalnız bir kez çalışır).

     Sync: post-init, data.guests değiştikçe array boyu otomatik
     senkronlanır; azaldığında fazlası kırpılır, arttığında boş
     stringle padding yapılır.
  ---------------------------------------------- */
  const [guestNames, setGuestNames] = useState<string[]>([]);
  const guestNamesInitRef = useRef(false);

  // Init — DB'den gelen guest_names'i state'e bir kez taşı
  useEffect(() => {
    if (guestNamesInitRef.current) return;
    if (!data) return;
    const stored = Array.isArray(data?.guest_names)
      ? (data.guest_names as string[])
      : [];
    const total = Number(data?.guests || 1);
    const extraCount = Math.max(total - 1, 0);
    if (extraCount <= 0) {
      setGuestNames([]);
    } else {
      const padded = [...stored];
      while (padded.length < extraCount) padded.push("");
      setGuestNames(padded.slice(0, extraCount));
    }
    guestNamesInitRef.current = true;
  }, [data]);

  // Sync — guests değişince array boyutu otomatik ayarlanır
  useEffect(() => {
    if (!guestNamesInitRef.current) return;
    const total = Number(data?.guests || 1);
    const extraCount = Math.max(total - 1, 0);
    setGuestNames((prev) => {
      if (extraCount <= 0) return prev.length === 0 ? prev : [];
      const updated = [...prev];
      while (updated.length < extraCount) updated.push("");
      return updated.slice(0, extraCount);
    });
  }, [data?.guests]);

  /* ---------------------------------------------
     🔥 WIZARD — adım bazlı UI organizasyonu
     ===============================================
     Yalnız görsel akış. Mevcut state/save/mail/helper
     mantığına dokunulmadı. saveAll her adımda
     erişilebilir kalır (admin mid-wizard kayıt yapabilsin).
  ---------------------------------------------- */
  const STEPS: { id: number; label: string }[] = [
    { id: 1, label: "Kişi Bilgileri" },
    { id: 2, label: "Mülk & Tarih" },
    { id: 3, label: "Fiyat & Ödeme" },
    { id: 4, label: "Tahsilat & Ödeme Yönetimi" },
    { id: 5, label: "Notlar & Durum" },
  ];
  const TOTAL_STEPS = STEPS.length;

  const [currentStep, setCurrentStep] = useState<number>(1);

  const goNext = () =>
    setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const goBack = () =>
    setCurrentStep((s) => Math.max(s - 1, 1));

  // 🔥 CANLI KURLAR (TCMB)
  const [rates, setRates] = useState<Record<string, number>>({ TRY: 1 });

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  /* ---------------------------------------------
     🔥 ORIGINAL DATE SNAPSHOT
     Edit sayfasında recalculation SADECE
     tarih değiştiğinde tetiklenmeli.
     Bu refler ilk yüklemede DB'deki tarih ile
     doldurulur ve sabit kalır.
  ---------------------------------------------- */
  const [originalStartDate, setOriginalStartDate] = useState<string | null>(
    null
  );
  const [originalEndDate, setOriginalEndDate] = useState<string | null>(null);

  /* ---------------------------------------------
     🔥 ORIGINAL STATUS — DB'deki orijinal status
     Mail trigger'ı için karşılaştırmada kullanılır.
     Bir kez ilk yüklemede set edilir, save sonrası reload
     edildiği için tekrar güncellenmesine gerek yoktur.
  ---------------------------------------------- */
  const [originalStatus, setOriginalStatus] = useState<string | null>(null);

  const [freshSelection, setFreshSelection] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  /* ---------------------------------------------
     🔥 INLINE CALENDAR — popup tamamen kaldırıldı.
     ManualReservationForm patternine birebir; tarih
     adımı açıkken takvim direkt gömülü görünür.
     openCalendar state, click-outside ref ve handler
     artık gerekli değil; reservation logic'e dokunulmadı.
  ---------------------------------------------- */

  const [blockedDates, setBlockedDates] = useState<Date[]>([]);
  const [checkinDates, setCheckinDates] = useState<Date[]>([]);
  const [checkoutDates, setCheckoutDates] = useState<Date[]>([]);

  const [manualBlockedDates, setManualBlockedDates] = useState<Date[]>([]);
  const [manualCheckinDates, setManualCheckinDates] = useState<Date[]>([]);
  const [manualCheckoutDates, setManualCheckoutDates] = useState<Date[]>([]);

  const [pendingCheckinDates, setPendingCheckinDates] = useState<Date[]>([]);
  const [pendingCheckoutDates, setPendingCheckoutDates] = useState<Date[]>([]);
  const [pendingMiddleDates, setPendingMiddleDates] = useState<Date[]>([]);

  // formatLocalDate / parseLocalDate → lib/date-format (TEK
  // source-of-truth; önceden inline tanımlıydı, davranış birebir aynı).

  const fetchReservation = async () => {
    if (!id) return;
    try {
      const res = await adminFetch(
        `/api/admin/reservations/${encodeURIComponent(id)}`
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reservation?: unknown;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        console.error("Fetch error:", json.error || `HTTP ${res.status}`);
        setData(null);
        return;
      }
      /* Service `getReservationById` return shape route içinde aynen
         korunur; client-side `setData` aynı obje shape'i bekler. */
      /* 🛡️ Manuel "Şimdi Ödenecek Tutar" kilidi (client-only; bkz.
         _helpers/manualPrepayment.ts) — kayıtlı prepayment_amount korunur. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setData(withLoadedPrepaymentLock(json.reservation) as any);
    } catch (err) {
      console.error("Fetch error:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservation();
  }, [id]);

  /* ---------------------------------------------
     🔥 VILLA LIST
  ---------------------------------------------- */
  useEffect(() => {
    /* 🛡️ FAZ 2 frontend purge — adminFetch GET /api/admin/villas.
       Aynı select shape ({ id, title }). */
    (async () => {
      try {
        const res = await adminFetch("/api/admin/villas");
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          villas?: Array<{ id: string; title: string }>;
        };
        if (res.ok && json.ok) {
          setVillas(json.villas || []);
        }
      } catch {
        /* fail-soft: dropdown boş kalır. */
      }
    })();
  }, []);

  /* ---------------------------------------------
     🔥 ORIGINAL VILLA ID — bir kez kilitlenir
  ---------------------------------------------- */
  useEffect(() => {
    if (data?.villa_id && originalVillaId === null) {
      setOriginalVillaId(data.villa_id);
    }
  }, [data?.villa_id, originalVillaId]);

  /* ---------------------------------------------
     🔥 SELECTED VILLA — villa_id değişince fetch
     Cleaning fee/limit yeni villaya göre güncellenir.
  ---------------------------------------------- */
  useEffect(() => {
    const fetchVilla = async () => {
      if (!data?.villa_id) {
        setSelectedVilla(null);
        return;
      }
      /* 🛡️ FAZ 2 frontend purge — adminFetch GET /api/admin/villas/[id].
         Aynı select shape ve .single() semantic'i route içinde. */
      try {
        const villaRes = await adminFetch(
          `/api/admin/villas/${encodeURIComponent(data.villa_id)}`
        );
        const villaJson = (await villaRes.json().catch(() => ({}))) as {
          ok?: boolean;
          villa?: unknown;
        };
        setSelectedVilla(
          villaRes.ok && villaJson.ok
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ((villaJson.villa as any) ?? null)
            : null
        );
      } catch {
        setSelectedVilla(null);
      }
    };
    fetchVilla();
  }, [data?.villa_id]);

  /* ---------------------------------------------
     🛡️ FAZ 56H-D — External iCal blocks for selected villa
     Admin authenticated client (RLS authenticated SELECT).
     Fail-safe: hata olursa boş arrays → calendar mevcut
     reservation/manual davranışı ile çalışmaya devam eder.
  ---------------------------------------------- */
  const [externalCal, setExternalCal] = useState<ExternalCalendarAdminArrays>(
    EMPTY_EXTERNAL_ADMIN_ARRAYS
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!data?.villa_id) {
        if (!cancelled) setExternalCal(EMPTY_EXTERNAL_ADMIN_ARRAYS);
        return;
      }
      const next = await fetchExternalCalendarArraysForVillaAdmin(
        data.villa_id
      );
      if (!cancelled) setExternalCal(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [data?.villa_id]);

  /* (Eski click-outside useEffect kaldırıldı — popup yok artık.) */

  useEffect(() => {
    if (data?.start_date && data?.end_date) {
      /* ---------------------------------------------
         🔥 LOCAL DATE PARSE — render correctness.
         DB'den gelen "YYYY-MM-DD" string'i `new Date()` ile
         UTC midnight olarak parse ediliyordu; UTC+3 (TR)
         zone'unda startDate bir gün geriye kayıyor (örn.
         "2026-06-04" → local "2026-06-03 21:00"). Bunun
         sonucu calendar'da sameDay() yanlış cell ile match
         oluyor → range_start cell'i pill render etmiyordu.

         parseLocalDate, "YYYY-MM-DD" string'i LOCAL midnight
         olarak parse eder (lib/date-format'ta tek source-of-truth;
         manual-reservations + ekle/[id] fetchBlockedDates
         loop'ları zaten bunu kullanıyordu). Reservation engine
         logic'ine dokunulmadı — sadece state'e yazılan Date
         object'inin TZ semantiği düzeltildi.
      ---------------------------------------------- */
      setStartDate(parseLocalDate(data.start_date));
      setEndDate(parseLocalDate(data.end_date));

      /* ---------------------------------------------
         🔥 ORIGINAL DATE LOCK
         Sadece bir kez set edilir → admin tarihleri
         değiştirse bile orijinal değer korunur.
         Recalculation kararı bunlara göre verilir.
      ---------------------------------------------- */
      if (originalStartDate === null) {
        setOriginalStartDate(
          formatLocalDate(parseLocalDate(data.start_date))
        );
      }
      if (originalEndDate === null) {
        setOriginalEndDate(
          formatLocalDate(parseLocalDate(data.end_date))
        );
      }
      if (originalStatus === null && data?.status) {
        setOriginalStatus(data.status);
      }
    }
  }, [data?.start_date, data?.end_date]);

  useEffect(() => {
    const target = endDate || startDate || new Date();
    setCurrentMonth(target);
  }, [startDate, endDate]);

  useEffect(() => {
    const fetchPrices = async () => {
      if (!data?.villa_id) return;
      /* 🛡️ FAZ 2 frontend purge — adminFetch GET /api/admin/villas/[id]/prices.
         Aynı select="*" ve eq("villa_id", id) filtresi route içinde. */
      try {
        const priceRes = await adminFetch(
          `/api/admin/villas/${encodeURIComponent(data.villa_id)}/prices`
        );
        const priceJson = (await priceRes.json().catch(() => ({}))) as {
          ok?: boolean;
          prices?: unknown[];
          discounts?: DiscountRange[];
        };
        setPrices(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          priceRes.ok && priceJson.ok ? (priceJson.prices as any[]) || [] : []
        );
        setDiscounts(
          priceRes.ok && priceJson.ok ? priceJson.discounts || [] : []
        );
      } catch {
        setPrices([]);
        setDiscounts([]);
      }
    };
    fetchPrices();
  }, [data?.villa_id]);

  useEffect(() => {
    if (!data?.villa_id) return;

    /* 🛡️ FAZ 2 — blocked dates fetch + grouping helper-driven
       (BYTE-IDENTICAL). 2 SELECT + 9 array doldurma + dedup logic
       `_effects/fetchBlockedDates.ts` içinde. Setter sırası caller'da
       aynen — 9 set çağrısı eski sıraya birebir uyar. */
    const run = async () => {
      const villaId = data.villa_id;
      const groups = await fetchBlockedDates({
        villaId,
        excludeReservationId: id,
      });

      setBlockedDates(groups.blocked);
      setCheckinDates(groups.checkin);
      setCheckoutDates(groups.checkout);

      setPendingCheckinDates(groups.pendingCheckin);
      setPendingCheckoutDates(groups.pendingCheckout);
      setPendingMiddleDates(groups.pendingMiddle);

      setManualBlockedDates(groups.manualBlocked);
      setManualCheckinDates(groups.manualCheckin);
      setManualCheckoutDates(groups.manualCheckout);
    };

    run();
  }, [data?.villa_id]);

  const mergedBlockedDates = [...blockedDates, ...manualBlockedDates];
  const mergedCheckinDates = [...checkinDates, ...manualCheckinDates];
  const mergedCheckoutDates = [...checkoutDates, ...manualCheckoutDates];

  const currentReservationDates: Date[] = [];
  if (data?.start_date && data?.end_date) {
    const current = parseLocalDate(data.start_date);
    const end = parseLocalDate(data.end_date);
    while (current <= end) {
      currentReservationDates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
  }

  // getValidEndDate → lib/date-range (TEK source-of-truth;
  // önceden inline tanımlıydı, davranış birebir aynı).

  useEffect(() => {
    /* 🛡️ FAZ 2 — price recalc helper-driven (BYTE-IDENTICAL).
       4-path discriminated union dönüyor: clear / custom_price /
       snapshot / recalc. Page setter sıraları eski inline ile
       birebir uyumlu (setPriceDetail önce, setData sonra). */
    const r = computeReservationPriceRecalc({
      discounts,
      data,
      startDate,
      endDate,
      prices,
      rates,
      originalStartDate,
      originalEndDate,
      originalVillaId,
      selectedVilla,
      prepaymentRate,
    });

    if (r.kind === "clear") {
      setPriceDetail(null);
      return;
    }

    setPriceDetail(r.priceDetail);

    if (r.kind === "custom_price") {
      if (r.dataPatch) {
        setData((prev) => (prev ? { ...prev, ...r.dataPatch } : prev));
      }
      return;
    }

    if (r.kind === "recalc") {
      setData((prev) => (prev ? { ...prev, ...r.dataPatch } : prev));
    }
  }, [
    startDate,
    endDate,
    /* 🛡️ İndirimler yüklendiğinde recalc tetiklensin. */
    discounts,
    prices,
    rates,
    originalStartDate,
    originalEndDate,
    prepaymentRate,
    data?.custom_price,
    data?.total_price_try,
    data?.villa_id,
    originalVillaId,
    selectedVilla?.cleaning_fee,
    selectedVilla?.cleaning_currency,
    selectedVilla?.cleaning_limit,
    data?.villa?.cleaning_fee,
    data?.villa?.cleaning_currency,
    data?.villa?.cleaning_limit,
  ]);

  /* ---------------------------------------------
     🔥 EFFECTIVE PREPAYMENT RATE
     - selectedVilla.custom_prepayment_rate varsa onu kullan
     - yoksa data.villa.custom_prepayment_rate (join'den)
     - yoksa global settings
     - yoksa 20 default
     Villa değişince yeniden çalışır.
     ⚠️ Bu rate yeni recalculation'lar (tarih/villa değişimi
     veya custom price input) için kullanılır. Frozen
     prepayment_amount snapshot'ı ASLA bozulmaz.
  ---------------------------------------------- */
  useEffect(() => {
    const villaOverride =
      selectedVilla?.custom_prepayment_rate ??
      data?.villa?.custom_prepayment_rate;

    if (
      villaOverride !== null &&
      villaOverride !== undefined &&
      villaOverride !== ""
    ) {
      setPrepaymentRate(Number(villaOverride));
      return;
    }

    const fetchSettings = async () => {
      /* 🛡️ FAZ 2 frontend purge — adminFetch GET /api/admin/settings.
         Route tam settings row döner; sadece prepayment_rate okuyup
         eskisiyle aynı koşulda set ediyoruz (BYTE IDENTICAL). */
      try {
        const sRes = await adminFetch("/api/admin/settings");
        const sJson = (await sRes.json().catch(() => ({}))) as {
          ok?: boolean;
          settings?: { prepayment_rate?: number | null };
        };
        if (sRes.ok && sJson.ok && sJson.settings?.prepayment_rate) {
          setPrepaymentRate(sJson.settings.prepayment_rate);
        }
      } catch {
        /* fail-soft: prepaymentRate default state'inde kalır. */
      }
    };
    fetchSettings();
  }, [
    selectedVilla?.custom_prepayment_rate,
    data?.villa?.custom_prepayment_rate,
  ]);

  // 🔥 KURLAR (TCMB)
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const res = await fetch("/api/exchange-rates");
        const json = await res.json();
        if (json && !json.error) {
          setRates({
            TRY: 1,
            USD: Number(json.USD) || 0,
            EUR: Number(json.EUR) || 0,
            GBP: Number(json.GBP) || 0,
          });
        }
      } catch (err) {
        console.error("Kur çekme hatası", err);
      }
    };
    fetchRates();
  }, []);

  /* ===============================================================
     🔥 VILLA DEĞİŞİNCE — TAM RESET (FAZ 2: VillaSelectCard'tan
     extract — handler page.tsx'te kalır, logic byte-identical)
     ===============================================================
     - villa_id değişir, stale join (data.villa) temizlenir
     - custom_price kapatılır (yeni villaya devretmez)
     - financial snapshot tamamen sıfırlanır
     - paid_amount = 0 (yeni villa rezervasyonu)
     - tarih + blocked + pricing + cleaning state'leri sıfırlanır
     - prices ve selectedVilla temizlenir → recalc useEffect
       stale veriyle çalışmaz, yeni villa için useEffect'ler
       prices, selectedVilla, blocked dates'i baştan getirir
     - hasVillaChanged true olduğu için yeni tarih seçilince
       calculateGrandTotal otomatik çalışır
     =============================================================== */
  const handleVillaChange = (newVillaId: string) => {
    /* 🛡️ TUR 2 — null guard. */
    if (!data) return;
    if (!newVillaId || newVillaId === data.villa_id) return;

    /* 🛡️ FAZ 2 — state reset patch helper-driven (BYTE-IDENTICAL).
       Side-effect setter sırası (date/priceDetail/prices/selectedVilla/
       9 calendar array) page'de — eski sıra aynen korunuyor. */
    setData((prev) =>
      prev
        ? { ...prev, ...computeVillaChangeReset({ prev, newVillaId }) }
        : prev
    );

    // tarih + priceDetail reset
    setStartDate(null);
    setEndDate(null);
    setPriceDetail(null);

    // prices ve selectedVilla temizle → useEffect'ler yeniden çekecek
    setPrices([]);
    setSelectedVilla(null);

    // blocked / pending tarih state'leri reset
    setBlockedDates([]);
    setCheckinDates([]);
    setCheckoutDates([]);

    setManualBlockedDates([]);
    setManualCheckinDates([]);
    setManualCheckoutDates([]);

    setPendingCheckinDates([]);
    setPendingCheckoutDates([]);
    setPendingMiddleDates([]);
  };

  /* ===============================================================
     🔥 CUSTOM PRICE TOGGLE — page.tsx'te kalır (PriceCard JSX prop'tan
     tetikler). Logic byte-identical: ON→OFF branch'ında inline
     calculateGrandTotal recalc; OFF→ON branch'ında multi-currency
     nötrleme. paid_amount KORUNUR. (FAZ 2 extraction; FAZ 4 hedefi
     _helpers/handleCustomPriceToggle.ts'e ayrı dosyaya taşımak.)
     =============================================================== */
  const handleCustomPriceToggle = () => {
    /* 🛡️ FAZ 2 — toggle ON/OFF compute helper-driven (BYTE-IDENTICAL).
       Helper PATCH döner; page setData spread ile uygular. Eski tam
       object return ile semantik eşdeğer ({...prev, ...patch}).
       Null guard page-side aynen. */
    setData((prev) => {
      if (!prev) return prev;
      const patch = computeCustomPriceToggle({
        prev,
        startDate,
        endDate,
        prices,
        rates,
        selectedVilla,
        prepaymentRate,
      });
      return { ...prev, ...patch };
    });
  };

  /* Custom price input onChange — total_price_try güncelleyip
     prepayment + remaining recalc eder. paid_amount KORUNUR.
     Logic byte-identical; sadece named function'a alındı. */
  const handleCustomPriceAmountChange = (v: number) => {
    /* 🛡️ TUR 2 — null guard. */
    if (!data) return;
    /* 🛡️ FAZ 2 — pure compute helper-driven (BYTE-IDENTICAL). */
    setData((prev) =>
      prev
        ? {
            ...prev,
            ...computeCustomPriceAmountChange({
              prev,
              newAmount: v,
              prepaymentRate,
            }),
          }
        : prev
    );
  };

  const deleteReservation = async () => {
    const proceed = await confirm({
      title: "Rezervasyon silinsin mi?",
      description:
        "Seçili rezervasyon kaydı kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!proceed) return;
    try {
      /* 🛡️ FAZ 55J-2 — BEFORE snapshot. */
      const before = data
        ? {
            id: data.id,
            villa_id: data.villa_id,
            name: data.name,
            email: data.email,
            phone: data.phone,
            phone2: data.phone2 ?? null,
            start_date: data.start_date,
            end_date: data.end_date,
            status: data.status,
            total_price: data.total_price,
            original_currency: data.original_currency,
          }
        : null;
      /* 🛡️ FAZ 2 frontend purge — adminFetch DELETE; route içinde
         deleteReservationById service'i delege edilir. Davranış
         BYTE-IDENTICAL (audit, cascade, side-effects aynen). */
      {
        const delRes = await adminFetch(
          `/api/admin/reservations/${encodeURIComponent(id)}`,
          { method: "DELETE" }
        );
        const delJson = (await delRes.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!delRes.ok || !delJson.ok) {
          throw new Error(delJson.error || `HTTP ${delRes.status}`);
        }
      }
      /* AUDIT LOG (fail-safe). */
      logActivity({
        action: "reservation.deleted",
        entity_type: "reservation",
        entity_id: id,
        entity_title:
          (data?.name || "Misafir") +
          (data?.villa_id ? " · " + data.villa_id : ""),
        before_data: before,
      }).catch(() => {});
      router.push("/maki-admin/reservations");
    } catch (err) {
      console.error(err);
      toast.error("Rezervasyon silinemedi", {
        id: "reservation-delete",
      });
    }
  };

  const saveAll = async () => {
    if (!id || !data) return;

    /* 🛡️ FAZ 55J-2 — BEFORE SNAPSHOT (TUR 3 helper extraction).
       Save sonrası audit log için kullanılır. Shape byte-identical. */
    const reservationBefore = buildReservationBeforeSnapshot(data);

    /* ===============================================================
       🔥 CONFIRMATION GUARD — gerçek source-of-truth
       ===============================================================
       Eğer status="confirmed" set edilip kaydedilmek isteniyorsa
       paid_amount > 0 olmalı. Aksi halde DB/mail tetiklenmez.
    =============================================================== */
    /* TUR 3 — normalizeStatusKey helper extraction. Logic byte-identical. */
    const requestedStatus = normalizeStatusKey(data.status);
    if (
      requestedStatus === "confirmed" &&
      !canConfirmReservation(data.paid_amount)
    ) {
      toast.error("Onaylanamaz", {
        id: "confirm-guard",
        description: RESERVATION_CONFIRM_GUARD_MESSAGE,
      });
      return;
    }

    /* ===============================================================
       🔥 AUTO PAYMENT CONFIRMATION TRANSITION
       ===============================================================
       Eski "Ödemeyi Onayla" butonu kaldırıldı. Admin:
         status: pending/rejected → confirmed
         paid_amount > 0
       ile kaydederse saveAll iki ayrı mail lifecycle'ını sırayla
       çalıştırır:

         1) await /api/mail/payment-confirmed
            → payment_link_status='paid'
            → PaymentConfirmedEmail ("Ödemeniz Alındı")
         2) dispatchStatusChangeMail
            → ReservationApprovedEmail ("Rezervasyon Onaylandı")

       Sıralama önemli: önce ödeme teyidi, sonra rezervasyon onayı.
       Tek source-of-truth: payment-confirmed route + status-change
       dispatcher. Duplicate yok çünkü:
         - payment-confirmed route YALNIZCA PaymentConfirmedEmail
           gönderir (approved çağırmaz)
         - dispatchStatusChangeMail YALNIZCA ApprovedEmail
           gönderir (oldStatus !== newStatus → tek tetikleme)
    =============================================================== */
    /* TUR 3 — extraction. baselineStatus + isConfirmTransition helper'lar. */
    const baselineStatus = normalizeStatusKey(originalStatus);
    const isConfirmTransition = detectConfirmTransition(
      baselineStatus,
      requestedStatus,
      data.paid_amount
    );

    try {
      /* ===============================================================
         🔥 CUSTOM PRICE — KAYIT
         ===============================================================
         Custom price rezervasyonunda multi-currency yok.
         Tüm financial snapshot manuel total üzerinden kurulur.
         remaining_payment = total - paid_amount.
         paid_amount KORUNUR.
         =============================================================== */
      if (data.custom_price) {
        /* TUR 3 — buildCustomPricePayload helper extraction.
           Payload shape + coercion byte-identical (orijinal inline
           pattern aynen helper'a taşındı). */
        const customPayload = buildCustomPricePayload({
          data,
          guestNames,
          prepaymentRate,
        });

        /* 🛡️ SERVER-SIDE GUARD (Faz 4B):
           Direkt db.update yerine updateReservationFull
           kullan; servis 'confirmed' transition'ında paid_amount
           kuralını enforce ediyor. Valid akış byte-identical;
           invalid akışta service throw → catch alert. */
        /* 🛡️ FAZ 2 frontend purge — adminFetch PATCH; route içinde
           updateReservationFull service'i delege eder (paid_amount guard,
           audit, mail dispatch hepsi server-side). Davranış BYTE-IDENTICAL;
           service throw → route 400 + error → catch alert. */
        {
          const updRes = await adminFetch(
            `/api/admin/reservations/${encodeURIComponent(id)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(customPayload),
            }
          );
          const updJson = (await updRes.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
          };
          if (!updRes.ok || !updJson.ok) {
            throw new Error(updJson.error || `HTTP ${updRes.status}`);
          }
        }

        /* 🛡️ FAZ 55J-2 — AUDIT LOG (custom path, fail-safe).
           TUR 3 — helper extraction (.catch(() => {}) pattern korundu). */
        logReservationUpdate({
          id,
          data,
          before: reservationBefore,
          after: buildReservationAfterSnapshot({
            id,
            data,
            payload: customPayload,
          }),
        });

        // 🔥 STEP 1 — payment-confirmed lifecycle (önce ödeme teyidi)
        //    Yalnız transition durumunda; await ediliyor ki
        //    PaymentConfirmedEmail önce gönderilsin.
        if (isConfirmTransition) {
          const confResult = await triggerPaymentConfirmation(id);
          if (!confResult.ok) {
            toast.error("Ödeme onayı tamamlanamadı", {
              id: "reservation-save",
              description: `Rezervasyon güncellendi. ${confResult.error}`,
            });
            window.location.reload();
            return;
          }
          if (confResult.warning) {
            console.warn(
              "[saveAll.custom] payment-confirmed warning",
              confResult.warning
            );
          }
        }

        // 🔥 STEP 2 — status change mail (sonra rezervasyon onayı)
        //    transition'da: oldStatus !== newStatus → ApprovedEmail
        //    transition dışı status değişimi: cancelled / vs.
        dispatchStatusChangeMail(
          id,
          originalStatus,
          customPayload.status as string
        );

        toast.success(
          isConfirmTransition
            ? "Rezervasyon onaylandı"
            : "Özel fiyat rezervasyonu güncellendi",
          {
            id: "reservation-save",
            description: isConfirmTransition
              ? "Ödeme alındı, onay mailleri müşteriye gönderildi."
              : undefined,
          }
        );
        window.location.reload();
        return;
      }

      /* TUR 3 — buildNormalPayload helper extraction.
         Multi-currency snapshot derivasyon + getPaymentDisplayValues
         + payload object literal birebir helper'a taşındı. */
      const payload = buildNormalPayload({
        data,
        guestNames,
        priceDetail,
        prepaymentRate,
      });

      /* 🛡️ SERVER-SIDE GUARD (Faz 4B):
         Direkt db.update yerine updateReservationFull
         kullan; servis 'confirmed' transition'ında paid_amount
         kuralını enforce ediyor. Valid akış byte-identical;
         invalid akışta service throw → catch alert. */
      /* 🛡️ FAZ 2 frontend purge — adminFetch PATCH (normal path).
         Service delege server-side: validasyon, paid_amount guard, audit,
         mail dispatch hepsi route içinde. Davranış BYTE-IDENTICAL;
         service throw → route 400 → caller catch'i aynen tetikler. */
      {
        const updRes = await adminFetch(
          `/api/admin/reservations/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        const updJson = (await updRes.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!updRes.ok || !updJson.ok) {
          throw new Error(updJson.error || `HTTP ${updRes.status}`);
        }
      }

      /* 🛡️ FAZ 55J-2 — AUDIT LOG (normal path, fail-safe).
         TUR 3 — helper extraction (.catch(() => {}) pattern korundu). */
      logReservationUpdate({
        id,
        data,
        before: reservationBefore,
        after: buildReservationAfterSnapshot({
          id,
          data,
          payload,
        }),
      });

      // 🔥 STEP 1 — payment-confirmed lifecycle (önce ödeme teyidi)
      //    Yalnız transition durumunda; await ediliyor ki
      //    PaymentConfirmedEmail önce gönderilsin.
      if (isConfirmTransition) {
        const confResult = await triggerPaymentConfirmation(id);
        if (!confResult.ok) {
          toast.error("Ödeme onayı tamamlanamadı", {
            id: "reservation-save",
            description: `Rezervasyon güncellendi. ${confResult.error}`,
          });
          window.location.reload();
          return;
        }
        if (confResult.warning) {
          console.warn(
            "[saveAll.normal] payment-confirmed warning",
            confResult.warning
          );
        }
      }

      // 🔥 STEP 2 — status change mail (sonra rezervasyon onayı)
      //    transition'da: oldStatus !== newStatus → ApprovedEmail
      //    transition dışı status değişimi: cancelled / vs.
      dispatchStatusChangeMail(
        id,
        originalStatus,
        payload.status as string
      );

      toast.success(
        isConfirmTransition
          ? "Rezervasyon onaylandı"
          : "Değişiklikler kaydedildi",
        {
          id: "reservation-save",
          description: isConfirmTransition
            ? "Ödeme alındı, onay mailleri müşteriye gönderildi."
            : undefined,
        }
      );
      window.location.reload();
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Güncelleme başarısız";
      toast.error("Kaydedilemedi", {
        id: "reservation-save",
        description: msg,
      });
    }
  };

  /* 🛡️ FAZ 2 — dispatchStatusChangeMail orchestrator helper'a taşındı
     (`_orchestrators/dispatchStatusChangeMail.ts`). saveAll AST contract
     `dispatchStatusChangeMail` ismini arıyor; positional 3-arg call
     pattern BYTE-IDENTICAL korunsun diye page-side wrapper. Wrapper
     helper'ı object-form ile çağırır; saveAll body değişmez. */
  function dispatchStatusChangeMail(
    reservationId: string,
    oldStatus: string | null,
    newStatus: string | null | undefined
  ): void {
    dispatchStatusChangeMailHelper({ reservationId, oldStatus, newStatus });
  }

  /* 🛡️ FAZ 2 — formatReservationDate helper'a taşındı
     (`_helpers/formatReservationDate.ts`). Eski `formatDate` çağrı
     siteleri page.tsx içinde alias ile aynen çalışır. */
  const formatDate = formatReservationDate;

  /* ===============================================================
     🔥 PAYMENT REQUEST — UNIFIED FLOW
     ===============================================================
     - credit_card  → /api/mail/payment-link (link maili)
     - bank_transfer → /api/mail/bank-transfer-payment (banka bilgileri)
     - Her iki dalda da: success → status='sent', sent_at=now()
     - Endpoint seçimi helper'dan (paymentRequestEndpoint)
     - Structured logging; silent fail YOK
  =============================================================== */
  /* 🛡️ FAZ 2 — sendPaymentRequest orchestrator helper'a taşındı
     (`_orchestrators/sendPaymentRequest.ts`). Page closure'unun ihtiyaç
     duyduğu state setter'ları (setPaymentLinkSending, setPaymentLinkError,
     setData) helper'a parametre olarak geçer; runtime davranış aynen. */
  const sendPaymentRequest = () =>
    sendPaymentRequestHelper({
      reservationId: id,
      paymentMethod: data?.payment_method,
      paymentLink: data?.payment_link,
      setSending: setPaymentLinkSending,
      setError: setPaymentLinkError,
      setData,
    });

  /* 🛡️ FAZ 2 — triggerPaymentConfirmation orchestrator helper'a taşındı
     (`_orchestrators/triggerPaymentConfirmation.ts`). saveAll AST contract
     `triggerPaymentConfirmation` ismi ile çağrı arıyor — import edildi;
     function name korunuyor. */

  if (loading) {
    return (
      <div className="card-premium p-12 text-center text-[var(--color-stone-500)]">
        Yükleniyor…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card-premium p-12 text-center">
        <p className="font-display text-2xl text-[var(--color-stone-900)]">
          Rezervasyon bulunamadı
        </p>
      </div>
    );
  }

  /* 🛡️ Stabilization: `currencySymbol` derivation PriceCard extract
     sonrası orphan kaldı → kaldırıldı. Multi-currency display kartları
     PriceCard içinde `data.original_currency` üzerinden render eder. */
  const prepayment = priceDetail
    ? Math.round(
        (accommodationBase(
          priceDetail.total,
          priceDetail.cleaning,
          priceDetail.poolHeating
        ) *
          prepaymentRate) /
          100
      )
    : 0;

  /* ---------------------------------------------
     🔥 PAYMENT DISPLAY — payment_preference dinamik
     "Şimdi ödenecek" + "Kalan / Girişte ödenecek" tek
     source-of-truth helper'dan beslenir. Snapshot
     remaining_payment ALANI BOZULMUYOR — sadece display.
     - full_payment  → payNow=total, remainingOnArrival=0
     - prepayment    → payNow=prepayment, remainingOnArrival=total−prepayment
  ---------------------------------------------- */
  const paymentDisplay = getPaymentDisplayValues({
    total_price_try: data?.total_price_try,
    total_price: data?.total_price,
    prepayment_amount:
      data?.prepayment_amount !== undefined &&
      data?.prepayment_amount !== null
        ? data.prepayment_amount
        : prepayment ||
          Math.round(
            (accommodationBase(
              Number(data?.total_price_try || 0),
              Number(data?.cleaning_fee_try || 0),
              Number(data?.pool_heating_total_try || 0)
            ) *
              prepaymentRate) /
              100
          ),
    paid_amount: data?.paid_amount,
    payment_preference: data?.payment_preference,
  });
  const paymentDisplayPayNowLabel = paymentDisplay.isFullPayment
    ? "Şimdi ödenecek (Tüm tutar)"
    : `Ön ödeme (%${prepaymentRate})`;

  return (
    <div className="space-y-8 w-full">
      {/* HEADER (FAZ 2: ReservationPageHeader'a extract) */}
      <ReservationPageHeader
        data={data}
        formatDate={formatDate}
        reservationCodeDisplay={reservationCodeDisplay}
        deleteReservation={deleteReservation}
      />

      {/* WIZARD STEP BAR (FAZ 2: WizardStepBar'a extract) */}
      <WizardStepBar
        steps={STEPS}
        currentStep={currentStep}
        totalSteps={TOTAL_STEPS}
        onStepClick={setCurrentStep}
      />

      <div className="space-y-6">
        {/* META (FAZ 2: ReservationMetaCards'a extract) */}
        <ReservationMetaCards
          data={data}
          formatDate={formatDate}
          reservationCodeDisplay={reservationCodeDisplay}
        />

        {/* 🛡️ DÜZELTME — "Misafir Bilgisi" YALNIZCA 1. sekmede (Kişi
            Bilgileri) görünür; önceki turda yanlışlıkla her sekmede
            görünür (unconditional) hale getirilmişti, currentStep === 1
            koşulu geri eklendi. Eski 3. sekmenin (GuestsCard: Toplam
            misafir + Diğer misafirler) alanları da AYNI karta taşındı
            ve 3. sekme tamamen kaldırıldı — bkz. MisafirBilgisiCard.tsx
            üst yorumu. data/setData/guestNames/setGuestNames state'i ve
            handler'ları BİREBİR AYNI; yalnız hangi kartın/sekmenin
            render ettiği değişti. */}
        {currentStep === 1 && (
          <MisafirBilgisiCard
            data={data}
            setData={setData}
            countryOptions={countryOptions}
            cityOptions={cityOptions}
            guestNames={guestNames}
            setGuestNames={setGuestNames}
          />
        )}

        {/* VILLA SELECT (FAZ 2: VillaSelectCard'a extract)
            handleVillaChange — 65-satır business logic page.tsx'te;
            FAZ 4'te ayrı bir _helpers/'a taşınacak. JSX/component
            seviyesinde davranış değişmedi. */}
        {currentStep === 2 && (
          <VillaSelectCard
            data={data}
            villas={villas}
            onVillaChange={handleVillaChange}
          />
        )}

        {/* DATE (FAZ 2: DateRangeCard'a extract) */}
        {currentStep === 2 && (
          <DateRangeCard
            prices={prices}
            discounts={discounts}
            rates={rates}
            data={data}
            startDate={startDate}
            endDate={endDate}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            freshSelection={freshSelection}
            setFreshSelection={setFreshSelection}
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            mergedBlockedDates={mergedBlockedDates}
            mergedCheckinDates={mergedCheckinDates}
            mergedCheckoutDates={mergedCheckoutDates}
            pendingCheckinDates={pendingCheckinDates}
            pendingCheckoutDates={pendingCheckoutDates}
            pendingMiddleDates={pendingMiddleDates}
            externalCal={externalCal}
            currentReservationDates={currentReservationDates}
            priceDetail={priceDetail}
            paymentDisplay={paymentDisplay}
            paymentDisplayPayNowLabel={paymentDisplayPayNowLabel}
          />
        )}

        {/* PRICE */}
        {/* PRICE (FAZ 2: PriceCard'a extract)
            handleCustomPriceToggle + handleCustomPriceAmountChange page.tsx'te
            named function olarak; algoritma byte-identical.
            🛡️ DÜZELTME — eski 3. sekme (Misafirler) kaldırıldığı için
            adım numarası 4 → 3 (yalnız numaralandırma; STEPS dizisi de
            aynı şekilde güncellendi). */}
        {currentStep === 3 && (
          <PriceCard
            data={data}
            setData={setData}
            priceDetail={priceDetail}
            paymentDisplay={paymentDisplay}
            paymentDisplayPayNowLabel={paymentDisplayPayNowLabel}
            onCustomPriceToggle={handleCustomPriceToggle}
            onCustomPriceAmountChange={handleCustomPriceAmountChange}
          />
        )}

        {/* ====================================================
            🔥 PAYMENT — paid_amount + payment status
            DB kolonu YOK; status frontend'de derive edilir.
        ==================================================== */}
        {/* PAYMENT (FAZ 2: PaymentCard'a extract)
            🛡️ DÜZELTME — adım numarası 5 → 4. */}
        {currentStep === 4 && (
          <PaymentCard
            data={data}
            setData={setData}
            autoPrepayment={computeAutoPrepayment({
              data,
              priceDetail,
              prepaymentRate,
            })}
          />
        )}

        {/* PAYMENT PREFERENCE (FAZ 2: PaymentPreferenceCard'a extract)
            🛡️ DÜZELTME — adım numarası 4 → 3. */}
        {currentStep === 3 && (
          <PaymentPreferenceCard data={data} setData={setData} />
        )}

        {/* PAYMENT REQUEST (FAZ 2: PaymentRequestCard'a extract)
            Conditional rendering guard caller'da; component yalnız render alır.
            🛡️ DÜZELTME — adım numarası 5 → 4. */}
        {currentStep === 4 && isPaymentRequestSupported(data?.payment_method) && (
          <PaymentRequestCard
            data={data}
            setData={setData}
            sendPaymentRequest={sendPaymentRequest}
            paymentLinkSending={paymentLinkSending}
            paymentLinkError={paymentLinkError}
            setPaymentLinkError={setPaymentLinkError}
          />
        )}

        {/* STATUS */}
        {/* STATUS (FAZ 2: StatusCard'a extract)
            🛡️ DÜZELTME — adım numarası 6 → 5. */}
        {currentStep === 5 && (
          <StatusCard data={data} setData={setData} toast={toast} />
        )}

        {/* NOTE (FAZ 2: NoteCard'a extract)
            🛡️ DÜZELTME — adım numarası 6 → 5. */}
        {currentStep === 5 && (
          <NoteCard data={data} setData={setData} />
        )}
      </div>

      {/* STICKY WIZARD NAV (FAZ 2: StickyFooterNav'a extract)
          saveAll dokunulmadı, her adımda erişilebilir kalır. */}
      <StickyFooterNav
        currentStep={currentStep}
        totalSteps={TOTAL_STEPS}
        steps={STEPS}
        goBack={goBack}
        goNext={goNext}
        saveAll={saveAll}
      />
    </div>
  );
}

/* ── Helpers extraction (FAZ 1 refactor) ──
   Section / Label / Row → _components/ dizinine taşındı; zero regression.
   Davranış byte-identical; sadece presentational separation. */
