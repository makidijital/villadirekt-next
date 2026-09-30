"use client";

/* 🛡️ FAZ 2 frontend purge — `import { eski sağlayıcı }` KALDIRILDI.
   Tüm DB erişimi /api/admin/* + /api/public/* route'ları arkasında.
   Reservation create artık `createReservation` service'i route içinde
   delege eder (audit + validasyon + EXCLUDE overlap aynen). */
import { adminFetch } from "@/lib/admin-fetch";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  calculateGrandTotal,
  /* 🛡️ PUBLIC ile ORTAK indirim snapshot üreticisi. */
  buildStayDiscountSnapshot,
  type DiscountRange,
  accommodationBase,
  isPoolHeatingActiveForRange,
} from "@/lib/price.engine";

import { getPaymentDisplayValues } from "@/lib/payment.helper";

import { getValidEndDate } from "@/lib/date-range";
import { formatLocalDate, parseLocalDate } from "@/lib/date-format";

/* 🛡️ FAZ 3+4 — Reservation create helper'ları (pure / fire-forget).
   Page.tsx orchestrator yalnız async I/O + UI sırasını yönetir;
   validation + payload build + mail dispatch saf helper'larda. */
import { validateCreateForm } from "./_helpers/validateCreateForm";
import { dispatchReservationRequestMail } from "./_helpers/dispatchReservationRequestMail";
import { buildCreateCustomPricePayload } from "./_helpers/buildCreateCustomPricePayload";
import { buildCreateNormalPayload } from "./_helpers/buildCreateNormalPayload";

import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";

/* 🛡️ FAZ 1 — typed create form shape.
   useState<any> drift'i kapatıldı. `data` artık typed
   ReservationCreateData; child wizard step component'ler
   `ReservationFormShape` loose contract'ı ile compatible
   (intersection subtype). setData child JSX'ine geçerken
   `ReservationFormSetter` ile cast edilir (variance gerekli;
   setter contravariant pozisyon). Cast tek noktada; runtime
   davranış değişmez. */
import {
  initialReservationCreateData,
  type ReservationCreateData,
  type SelectedVillaCreate,
  type VillaListItem,
  type PaymentMethodListItem,
  type PriceDetailSnapshot,
  type ReservationFormSetter,
} from "./_types/reservation-create-data";

/* PriceStep child contract: `ReservationPriceDetail` — child tip
   `original_stay?: number | undefined` istiyor; bizim PriceDetailSnapshot
   `number | null | undefined`. Runtime'da null/undefined eşdeğer
   (foreign currency yok). JSX boundary cast'i için import. */
import type { ReservationPriceDetail } from "@/app/components/admin/reservation-form/types";

/* 🔥 Shared custom calendar — react-day-picker bu sayfadan
   kaldırıldı, drag-select multi-month grid'e geçildi.
   Reservation logic, modifier arrayleri, fullyBlockedDates
   ve getValidEndDate semantiği AYNEN korundu. */
import ReservationCalendar from "@/app/components/admin/reservation-form/ReservationCalendar";
import { fetchExternalCalendarArraysForVillaAdminAction as fetchExternalCalendarArraysForVillaAdmin } from "@/lib/external-calendar.admin.action";
import {
  EMPTY_EXTERNAL_ADMIN_ARRAYS,
  type ExternalCalendarAdminArrays,
} from "@/lib/external-calendar.admin.types";

/* 🔥 Reservation form wizard step components — pure presentational.
   Tüm state/effects/handlers page (orchestrator) içinde kalır. */
import WizardStepBar from "@/app/components/admin/villa-form/WizardStepBar";
import StickyActionBar from "@/app/components/admin/villa-form/StickyActionBar";
import CreateMetaCards, {
  findVillaTitle,
} from "@/app/components/admin/reservation-form/CreateMetaCards";
import PersonalStep from "@/app/components/admin/reservation-form/PersonalStep";
import LocationStep from "@/app/components/admin/reservation-form/LocationStep";
import VillaSelectStep from "@/app/components/admin/reservation-form/VillaSelectStep";
import Section from "@/app/components/admin/villa-form/shared/Section";
import GuestsStep from "@/app/components/admin/reservation-form/GuestsStep";
import PriceStep from "@/app/components/admin/reservation-form/PriceStep";
import PaymentMethodStep from "@/app/components/admin/reservation-form/PaymentMethodStep";
import PaymentPreferenceStep from "@/app/components/admin/reservation-form/PaymentPreferenceStep";
import NoteStep from "@/app/components/admin/reservation-form/NoteStep";
import LiveDatePriceSummary from "@/app/components/admin/reservation-form/LiveDatePriceSummary";

export default function AdminReservationDetailPage() {
  const router = useRouter();
  const toast = useNotify();

  /* 🛡️ FAZ 1 — typed state shape (initial factory + ReservationCreateData).
     Eski `useState<any>` ile birebir aynı initial object; davranış
     byte-identical. Initial value'lar tek source-of-truth:
     `_types/reservation-create-data > initialReservationCreateData`. */
  const [data, setData] = useState<ReservationCreateData>(
    initialReservationCreateData()
  );

  // 🔥 VALIDATION — submit anında toplu çalışır
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 🔥 ÖDEME YÖNTEMLERİ — payment_methods tablosundan
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodListItem[]>([]);

  /* ---------------------------------------------
     🔥 GUEST NAMES — public ReservationForm ile aynı convention
     - data.name          → primary booker (ilk misafir)
     - guestNames[]       → ek misafirlerin isimleri
     - DB convention      → reservation.guest_names: string[]
     guests sayısı değişince array boyu otomatik senkronlanır.
     guests = 1 → []
     guests = N → length N - 1
  ---------------------------------------------- */
  const [guestNames, setGuestNames] = useState<string[]>([]);

  useEffect(() => {
    const total = Number(data?.guests || 1);
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
  }, [data?.guests]);

  /* ---------------------------------------------
     🔥 WIZARD — adım bazlı UI organizasyonu
     ===============================================
     Sadece görsel akış. Mevcut state/validation/save
     mantığı AYNEN korunuyor:
       - data state          → dokunulmadı
       - validateForm        → dokunulmadı (final guard)
       - handleCreate        → dokunulmadı (insert akışı)
       - useEffect/sync      → dokunulmadı
       - mail dispatch       → dokunulmadı
     validateStep yalnız validateForm çıktısının step'e
     ait alt kümesini döner; yeni kural yazılmaz.
  ---------------------------------------------- */
  /* 🛡️ STEP SADELEŞTİRME — 9 adım → 3 adım.
     ESKİ → YENİ eşlemesi (hiçbir bölüm KALDIRILMADI, yalnız gruplandı):
       1 Kişisel        ┐
       2 Konum          ┘→ 1 "Kişisel Bilgiler ve Konum"
       3 Mülk           ┐
       4 Tarih          ├→ 2 "Mülk ve Tarih"
       5 Misafir        ┘   (misafir sayısı bir REZERVASYON parametresi:
                             villa/tarih ile birlikte fiyat hesabını besler)
       6 Fiyat          ┐
       7 Ödeme yöntemi  ├→ 3 "Ödeme Bilgileri"
       8 Ödeme Tercihi  │
       9 Not            ┘   (validation'ı yok; akışın sonunda kalır)

     ⚠️ Bölümlerin İÇ SIRASI eski 1..9 sırasıyla BİREBİR aynı.
     ⚠️ WizardStepBar / StickyActionBar `steps.length` üzerinden
       çalışır → tasarım, progress ve "Adım N / M" sayacı otomatik
       uyum sağlar; bu component'lere DOKUNULMADI. */
  const STEPS: { id: number; label: string }[] = [
    { id: 1, label: "Kişisel Bilgiler ve Konum" },
    { id: 2, label: "Mülk ve Tarih" },
    { id: 3, label: "Ödeme Bilgileri" },
  ];
  const TOTAL_STEPS = STEPS.length;

  /* ⚠️ VALIDATION KURALLARI DEĞİŞMEDİ. `validateStep` hâlâ
     `validateForm()` çıktısının alt kümesini döner; burada yalnız
     eski adımların alan listeleri BİRLEŞTİRİLDİ — yeni kural yok,
     hiçbir kural gevşetilmedi, hiçbir alan düşürülmedi. */
  const STEP_FIELDS: Record<number, string[]> = {
    /* eski 1 + 2 */
    1: ["name", "phone", "email", "country", "city"],
    /* eski 3 + 4 + 5 */
    2: ["villa_id", "start_date", "end_date", "guests"],
    /* eski 6 + 7 + 8 (+ 9: alanı yok) */
    3: ["total_price_try", "payment_method_id", "payment_preference"],
  };

  const [currentStep, setCurrentStep] = useState<number>(1);

  // Mevcut validateForm sonucunun adıma ait alanlarını çek
  const validateStep = (
    step: number
  ): Record<string, string> => {
    const all = validateForm();
    const fields = STEP_FIELDS[step] || [];
    const subset: Record<string, string> = {};
    for (const f of fields) {
      if (all[f]) subset[f] = all[f];
    }
    return subset;
  };

  const goNext = () => {
    const stepErrors = validateStep(currentStep);
    if (Object.keys(stepErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...stepErrors }));
      return;
    }
    // Bu adım'a ait field hatalarını temizle
    setErrors((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const f of STEP_FIELDS[currentStep] || []) delete next[f];
      return next;
    });
    setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };
  const goBack = () =>
    setCurrentStep((s) => Math.max(s - 1, 1));

  /* 🛡️ FAZ 1 — `prices` strict tip henüz yok (calculateGrandTotal'ın
     beklediği `PriceRange[]` end_date'i string istiyor; DB'den
     `string | null` geliyor). Bir sonraki turda repository tarafında
     normalize edildiğinde typed yapılacak. Mevcut runtime aynen. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [prices, setPrices] = useState<any[]>([]);
  /* 🛡️ villa_discounts — public villa detay takvimiyle AYNI indirim
     verisi. Takvimde gösterilir VE calculateGrandTotal'a beslenir →
     takvimde görünen fiyat ile toplam TUTARLI olur. Aynı fetch'ten
     gelir; EK round-trip YOK. */
  const [discounts, setDiscounts] = useState<DiscountRange[]>([]);
  const [selectedVilla, setSelectedVilla] = useState<SelectedVillaCreate>(null);
  const [priceDetail, setPriceDetail] = useState<PriceDetailSnapshot | null>(null);
  const [prepaymentRate, setPrepaymentRate] = useState(20);

  // 🔥 CANLI KURLAR (TCMB)
  const [rates, setRates] = useState<Record<string, number>>({ TRY: 1 });

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const [freshSelection, setFreshSelection] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  /* ---------------------------------------------
     🔥 INLINE CALENDAR — popup tamamen kaldırıldı.
     ManualReservationForm patternine birebir: tarih
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

  const [loading, setLoading] = useState(false);

  // formatLocalDate / parseLocalDate → lib/date-format (TEK
  // source-of-truth; önceden inline tanımlıydı, davranış birebir aynı).

  const [villas, setVillas] = useState<VillaListItem[]>([]);

  const mergedBlockedDates = [...blockedDates, ...manualBlockedDates];
  const mergedCheckinDates = [...checkinDates, ...manualCheckinDates];
  const mergedCheckoutDates = [...checkoutDates, ...manualCheckoutDates];

  useEffect(() => {
    /* 🛡️ FAZ 2 — adminFetch GET /api/admin/villas (id, title). */
    (async () => {
      try {
        const res = await adminFetch("/api/admin/villas");
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          villas?: Array<{ id: string; title: string }>;
        };
        if (res.ok && json.ok) setVillas(json.villas || []);
      } catch {
        /* fail-soft */
      }
    })();
  }, []);

  // 🔥 ÖDEME YÖNTEMLERİ
  useEffect(() => {
    /* 🛡️ FAZ 2 — public fetch /api/public/payment-methods (anon RLS,
       BYTE-IDENTICAL anon select * davranışı). */
    (async () => {
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
    })();
  }, []);

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

  /* (Eski click-outside useEffect kaldırıldı — popup yok artık.) */

  useEffect(() => {
    if (data?.start_date && data?.end_date) {
      /* parseLocalDate → "YYYY-MM-DD" LOCAL midnight olarak
         parse edilir; UTC drift'i engellenir. Calendar'da
         sameDay() doğru cell ile match olur. */
      setStartDate(parseLocalDate(data.start_date));
      setEndDate(parseLocalDate(data.end_date));
    }
  }, [data?.start_date, data?.end_date]);

  useEffect(() => {
    const target = endDate || startDate || new Date();
    setCurrentMonth(target);
  }, [startDate, endDate]);

  /* 🛡️ FAZ 56H-D — External iCal blocks (admin authenticated fetch).
     Villa seçiminde fetch tetiklenir; fail-safe boş array fallback. */
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

  useEffect(() => {
    const fetchPrices = async () => {
      if (!data?.villa_id) return;
      /* 🛡️ FAZ 2 — adminFetch:
         - /api/admin/villas/[id]/prices (select="*")
         - /api/admin/villas/[id]       (cleaning_* + deposit + custom_prepayment_rate)
         Davranış BYTE-IDENTICAL: aynı select shape, aynı state updates. */
      try {
        const priceRes = await adminFetch(
          `/api/admin/villas/${encodeURIComponent(data.villa_id)}/prices`
        );
        const priceJson = (await priceRes.json().catch(() => ({}))) as {
          ok?: boolean;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          prices?: any[];
          discounts?: DiscountRange[];
        };
        setPrices(
          priceRes.ok && priceJson.ok ? priceJson.prices || [] : []
        );
        setDiscounts(
          priceRes.ok && priceJson.ok ? priceJson.discounts || [] : []
        );
      } catch {
        setPrices([]);
        setDiscounts([]);
      }
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
    fetchPrices();
  }, [data?.villa_id]);

  useEffect(() => {
    if (!data?.villa_id) return;

    const fetchReservations = async () => {
      /* 🛡️ AVAILABILITY ALLOW-LIST (Faz 2B):
         Yalnız `pending` ve `confirmed` calendar'ı block eder.
         `rejected` / `cancelled` availability'ye dahil değildir.
         Aşağıdaki classification guard'ları zaten doğru; bu
         allow-list defensive katman + bant genişliği. */
      /* 🛡️ FAZ 2 — public fetch /api/public/villas/[id]/blocked-ranges.
         Eski 2 ayrı select (reservations pending+confirmed + manual_reservations)
         RPC `get_villa_blocked_ranges` arkasında birleşik. Client-side split
         eski shape'lere geri çevirir → reservations: { start_date, end_date,
         status }, manual: { start_date, end_date }. Davranış BYTE-IDENTICAL:
         aynı allow-list (RPC içinde), aynı status field. */
      type BlockedRange = {
        kind: "reservation" | "manual";
        status: string | null;
        start_date: string;
        end_date: string;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let reservations: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let manual: any[] = [];
      try {
        const brRes = await fetch(
          `/api/public/villas/${encodeURIComponent(data.villa_id)}/blocked-ranges`,
          { cache: "no-store" }
        );
        const brJson = (await brRes.json().catch(() => ({}))) as {
          ok?: boolean;
          ranges?: BlockedRange[];
        };
        const ranges = brRes.ok && brJson.ok ? brJson.ranges || [] : [];
        reservations = ranges
          .filter((r) => r.kind === "reservation")
          .map((r) => ({
            start_date: r.start_date,
            end_date: r.end_date,
            status: r.status ?? "",
          }));
        manual = ranges
          .filter((r) => r.kind === "manual")
          .map((r) => ({ start_date: r.start_date, end_date: r.end_date }));
      } catch {
        /* fail-soft: empty arrays — eski path da hata göstermiyordu */
      }
      const _r = reservations;
      const _m = manual;
      const dataObj = { reservations: _r, manual: _m };
      /* Aşağıdaki kod `reservations` ve `manual` değişkenlerini kullanır;
         shape eski eski sağlayıcı response'larına BYTE-IDENTICAL. */
      void dataObj;

      let blocked: Date[] = [];
      let checkin: Date[] = [];
      let checkout: Date[] = [];

      let manualBlocked: Date[] = [];
      let manualCI: Date[] = [];
      let manualCO: Date[] = [];

      let pCI: Date[] = [];
      let pCO: Date[] = [];
      let pM: Date[] = [];

      /* ---------------------------------------------
         🔥 RESERVATIONS LOOP
         - confirmed → checkin / checkout / blocked
         - pending   → pendingCheckin / pendingCheckout / pendingMiddle
      ---------------------------------------------- */
      reservations?.forEach((r: any) => {
        /* 🛡️ LOCAL DATE SEMANTIC (date-mixing fix):
           parseLocalDate ile LOCAL midnight; aşağıdaki manual
           loop ile aynı kural. UTC ms equality kaldırıldı,
           yerine LOCAL gün eşitliği (toDateString) — DST ve
           Safari ISO parse edge-case'lerinde modifier array
           kayması engellenir. */
        let current = parseLocalDate(r.start_date);
        const end = parseLocalDate(r.end_date);
        let isFirst = true;

        while (current <= end) {
          const d = new Date(current);
          const isStart =
            current.toDateString() ===
            parseLocalDate(r.start_date).toDateString();
          const isEnd = current.toDateString() === end.toDateString();

          if (r.status === "confirmed") {
            if (isFirst) {
              checkin.push(d);
              isFirst = false;
            } else if (isEnd) {
              checkout.push(d);
            } else {
              blocked.push(d);
            }
          }

          if (r.status === "pending") {
            if (isStart) pCI.push(d);
            else if (isEnd) pCO.push(d);
            else pM.push(d);
          }

          current.setDate(current.getDate() + 1);
        }
      });

      /* ---------------------------------------------
         🔥 MANUAL RESERVATIONS LOOP — TOP LEVEL
         (Eskiden reservations forEach'in içindeydi →
          rezervasyon yokken manuel bloklar görünmüyordu.)
      ---------------------------------------------- */
      manual?.forEach((r: any) => {
        let current = parseLocalDate(r.start_date);
        const end = parseLocalDate(r.end_date);
        while (current <= end) {
          const d = new Date(current);
          const startDate = parseLocalDate(r.start_date);
          const endDate = parseLocalDate(r.end_date);
          const isFirstDay =
            current.toDateString() === startDate.toDateString();
          const isLastDay =
            current.toDateString() === endDate.toDateString();
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
      setPendingCheckinDates(unique(pCI));
      setPendingCheckoutDates(unique(pCO));
      setPendingMiddleDates(unique(pM));
      setManualBlockedDates(unique(manualBlocked));
      setManualCheckinDates(unique(manualCI));
      setManualCheckoutDates(unique(manualCO));
    };

    fetchReservations();
  }, [data?.villa_id]);

  // getValidEndDate → lib/date-range (TEK source-of-truth;
  // önceden inline tanımlıydı, davranış birebir aynı).

  useEffect(() => {
    if (!startDate || !endDate || prices.length === 0) {
      setPriceDetail(null);
      return;
    }

    /* ---------------------------------------------
       🔥 CUSTOM PRICE — recalculation kapalı
       Admin manuel fiyat kullanıyorsa:
         - calculateGrandTotal ÇALIŞMAZ
         - canlı kur / sezon fiyatı KULLANILMAZ
         - data state OVERRIDE EDİLMEZ
       Tarih sadece start_date/end_date alanlarını
       günceller; financial alanlar custom price
       handler'ından beslenir.
    ---------------------------------------------- */
    if (data?.custom_price) {
      const startISO = formatLocalDate(startDate);
      const endISO = formatLocalDate(endDate);
      setData((prev) => ({
        ...prev,
        start_date: startISO,
        end_date: endISO,
      }));
      // priceDetail null bırakılır → custom UI gösterilir
      setPriceDetail(null);
      return;
    }

    const startISO = formatLocalDate(startDate);
    const endISO = formatLocalDate(endDate);

    /* ---------------------------------------------
       🔥 ADMIN her zaman TRY görür.
       calculateGrandTotal çıktısı:
         - total / stay / cleaning   → TRY
         - original_stay             → orijinal currency
         - original_cleaning         → orijinal cleaning currency
    ---------------------------------------------- */
    const result = calculateGrandTotal({
      start: startISO,
      end: endISO,
      prices,
      currency: "TRY",
      rates,
      /* 🛡️ İNDİRİM — takvimde gösterilen indirimli gecelik fiyatın
         AYNISI toplama da yansır. `calculateGrandTotal`/`calculateStayTotal`
         bu parametreyi ZATEN destekliyordu (default null); yeni hesap
         mantığı YAZILMADI, yalnız mevcut girdi bağlandı. */
      discounts,
      cleaning_fee: selectedVilla?.cleaning_fee || 0,
      cleaning_currency: selectedVilla?.cleaning_currency || "TRY",
      cleaning_limit: selectedVilla?.cleaning_limit || 0,
      /* 🔥 HAVUZ ISITMA — uçtan uca tamamlama turu. Server-authoritative
         villa context'ten (selectedVilla) gelen gerçek gecelik ücret;
         client hiçbir zaman fiyat/kur üretmez. Seçim admin toggle'ından
         (data.pool_heating_selected) gelir. Villa'da ücret yoksa
         calculateGrandTotal zaten 0 döner → eski davranış korunur. */
      pool_heating_fee: selectedVilla?.pool_heating_fee || 0,
      pool_heating_currency: selectedVilla?.pool_heating_currency || "TRY",
      pool_heating_selected: !!data?.pool_heating_selected,
      /* 🛡️ Migration 076 — sezonluk ay kısıtı. selectedVilla'da
         kısıtlama tanımlı değilse (NULL) her zaman aktif — davranış
         BYTE-IDENTICAL kalır. */
      pool_heating_months: selectedVilla?.pool_heating_months,
    });

    setPriceDetail(result);

    /* ---------------------------------------------
       🛡️ İNDİRİM SNAPSHOT (migration 080 kolonları)
       ---------------------------------------------
       PUBLIC akışın (`price-verify.ts` > FAZ 4) kullandığı AYNI
       fonksiyon: `buildStayDiscountSnapshot` (lib/price.engine.ts).
       Yeni hesap YAZILMADI; `result.stay` zaten indirim uygulanmış
       konaklama tutarıdır ve aynen geçilir.
       İndirim yoksa → discount_applied=false + 5 alan null (public
       ile AYNI kural). Değerler `data`'ya yazılır; payload builder
       ve `payload-create.ts` bunları PUBLIC ile AYNI şekilde okur.
    ---------------------------------------------- */
    const discountSnapshot = buildStayDiscountSnapshot(
      startISO,
      endISO,
      prices,
      discounts,
      rates,
      Number(result.stay) || 0
    );

    /* ---------------------------------------------
       🔥 KUR SNAPSHOT
       Stay’in orijinal currency’si üzerinden
       sabitleniyor. (ReservationForm ile aynı mantık.)
    ---------------------------------------------- */
    const stayCurrency = result.original_currency || "TRY";
    const exchangeRate =
      stayCurrency === "TRY"
        ? 1
        : Number(rates?.[stayCurrency] || 0) || 1;

    const isForeignStay = stayCurrency !== "TRY";
    const isForeignCleaning =
      (result.original_cleaning_currency || "TRY") !== "TRY";

    setData((prev) => {
      const nextTotal = Number(result.total) || 0;
      const nextCleaningTRY = Number(result.cleaning) || 0;
      const nextPoolHeatingTRY = Number(result.poolHeating) || 0;

      return {
        ...prev,
        start_date: startISO,
        end_date: endISO,

        // ADMIN TRY görür → total_price === total_price_try
        total_price: nextTotal,
        total_price_try: nextTotal,

        // KONAKLAMA snapshot
        original_price: isForeignStay
          ? Number(result.original_stay) || 0
          : 0,
        original_currency: isForeignStay ? stayCurrency : "TRY",

        // TEMİZLİK snapshot
        original_cleaning_fee: isForeignCleaning
          ? Number(result.original_cleaning) || 0
          : 0,
        original_cleaning_currency: isForeignCleaning
          ? result.original_cleaning_currency || "TRY"
          : "TRY",

        cleaning_fee_try: nextCleaningTRY,

        /* 🔥 HAVUZ ISITMA snapshot — always-write (cleaning_fee_try ile
           aynı desen). `pool_heating_selected` burada YAZILMAZ — o
           admin toggle'ının kendi state alanı (PriceStep checkbox);
           tarih/villa recalculation'ı seçim durumunu değiştirmez. */
        original_pool_heating_total: Number(result.original_pool_heating) || 0,
        original_pool_heating_currency:
          result.original_pool_heating_currency || "TRY",
        pool_heating_total_try: nextPoolHeatingTRY,

        // KUR
        exchange_rate:
          isForeignStay || isForeignCleaning ? exchangeRate : 1,

        /* 🛡️ İNDİRİM SNAPSHOT — always-write (pool heating deseniyle
           aynı). İndirim yoksa false + null'lar yazılır → eski
           rezervasyonlarla ve indirimsiz akışla davranış aynı. */
        ...discountSnapshot,
      };
    });
  }, [
    startDate,
    endDate,
    prices,
    /* 🛡️ İndirimler yüklendiğinde toplam yeniden hesaplansın —
       takvim ile toplam aynı anda tutarlı hale gelir. */
    discounts,
    rates,
    data?.custom_price,
    data?.pool_heating_selected,
    selectedVilla?.cleaning_fee,
    selectedVilla?.cleaning_currency,
    selectedVilla?.cleaning_limit,
    selectedVilla?.pool_heating_fee,
    selectedVilla?.pool_heating_currency,
    selectedVilla?.pool_heating_months,
  ]);

  /* ---------------------------------------------
     🔥 EFFECTIVE PREPAYMENT RATE
     - villa override varsa onu kullan
     - yoksa global settings
     - yoksa 20 default
     selectedVilla değişince yeniden çalışır.
  ---------------------------------------------- */
  useEffect(() => {
    const villaOverride = selectedVilla?.custom_prepayment_rate;
    if (
      villaOverride !== null &&
      villaOverride !== undefined &&
      villaOverride !== ""
    ) {
      setPrepaymentRate(Number(villaOverride));
      return;
    }

    const fetchSettings = async () => {
      /* 🛡️ FAZ 2 — adminFetch GET /api/admin/settings. Davranış
         BYTE-IDENTICAL: tam settings row döner, sadece prepayment_rate
         okunur (eski koşulla aynı). */
      try {
        const res = await adminFetch("/api/admin/settings");
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          settings?: { prepayment_rate?: number | null };
        };
        if (res.ok && json.ok && json.settings?.prepayment_rate) {
          setPrepaymentRate(json.settings.prepayment_rate);
        }
      } catch {
        /* fail-soft */
      }
    };
    fetchSettings();
  }, [selectedVilla?.custom_prepayment_rate]);

  /* ===============================================================
     🛡️ FAZ 3 — FULL VALIDATION (helper-driven, pure)
     ===============================================================
     `validateCreateForm` (`_helpers/validateCreateForm.ts`) pure
     fonksiyonu çağrılır. Eski inline body BYTE-IDENTICAL helper'a
     taşındı; davranış (alan kuralları + email regex + total check)
     birebir korundu. validateStep wrapper bu helper'ın çıktısının
     STEP_FIELDS subset'ini döner — wrapper aynen kaldı. */
  const validateForm = (): Record<string, string> =>
    validateCreateForm({ data, startDate, endDate, priceDetail });

  /* ===============================================================
     🛡️ FAZ 3 — MAIL DISPATCH (helper-driven, fire-forget)
     ===============================================================
     `dispatchReservationRequestMail` artık `_helpers/` altında pure
     side-effect helper olarak yaşıyor. Inline body BYTE-IDENTICAL
     helper'a taşındı: keepalive, structured logging, .catch silent
     fail prevention — hepsi birebir aynen. Mail başarısız olsa bile
     rezervasyon başarısız sayılmaz (UI redirect zaten yapmış oluyor).
  =============================================================== */

  const handleCreate = async () => {
    // 🔥 TOPLU VALIDATION — invalid alan varsa create DURUR
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // İlk hatalı alana scroll iyi UX, ama mevcut tasarımı bozmadan
      // sadece state set ediyoruz
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      /* ===============================================================
         🛡️ FAZ 4 — PAYLOAD BUILD (helper-driven, pure)
         ===============================================================
         İki branch arasındaki BÜTÜN inline payload + multi-currency
         derivation pure helper'lara taşındı. Helper'lar pure; orchestrator
         yalnız async I/O + fire-forget side-effect + UI sırasını yönetir.

         ⚠️ ORCHESTRATION SIRASI DONDURULDU (AST contract FAZ 5'te):
           1. payload build (sync, pure)
           2. AWAITED repository insert
           3. error → throw (catch'e düşer)
           4. FIRE-FORGET dispatchReservationRequestMail
           5. toast.success
           6. router.push
         Bu sıra eski inline davranışla BYTE-IDENTICAL. Custom + normal
         branch'lar yalnız payload (ve toast mesajı) düzeyinde farklılaşır.
      =============================================================== */
      const startISO = formatLocalDate(startDate!);
      const endISO = formatLocalDate(endDate!);

      const payload = data.custom_price
        ? buildCreateCustomPricePayload({
            data,
            guestNames,
            startDate: startDate!,
            endDate: endDate!,
            prepaymentRate,
            selectedVilla,
            startISO,
            endISO,
          })
        : buildCreateNormalPayload({
            data,
            guestNames,
            priceDetail,
            prepaymentRate,
            selectedVilla,
            rates,
            startISO,
            endISO,
          });

      /* 🛡️ STEP 1 — DB WRITE (AWAITED) via createReservation service.
         FAZ 2 frontend purge: doğrudan DB insert bypass'i kaldırıldı.
         adminFetch POST /api/admin/reservations → route içinde
         createReservation service (validasyon + EXCLUDE constraint
         catch + TOCTOU overlap guard + audit) DELEGE. Service throw →
         route 400/409 + error msg → caller catch'i aynen tetikler. */
      let reservationId: string | null = null;
      {
        const createRes = await adminFetch("/api/admin/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          body: JSON.stringify(payload as any),
        });
        const createJson = (await createRes.json().catch(() => ({}))) as {
          ok?: boolean;
          reservation?: { id?: string | null };
          error?: string;
        };
        if (!createRes.ok || !createJson.ok) {
          throw new Error(
            createJson.error || `HTTP ${createRes.status}`
          );
        }
        reservationId = createJson.reservation?.id ?? null;
      }

      /* 🛡️ STEP 2 — FIRE-FORGET mail dispatch.
         Promise return edilmez; toast/router'a engel olmaz. */
      if (reservationId) dispatchReservationRequestMail(reservationId);

      /* 🛡️ STEP 3 — toast + navigation.
         Toast mesajı branch'a göre dinamik (eski davranış aynen). */
      toast.success(
        payload.custom_price
          ? "Özel fiyat rezervasyonu oluşturuldu"
          : "Rezervasyon oluşturuldu",
        { id: "reservation-create" }
      );
      router.push("/maki-admin/reservations");
    } catch (err) {
      console.error(err);
      const msg =
        err instanceof Error ? err.message : "Bir hata oluştu";
      toast.error("Rezervasyon oluşturulamadı", {
        id: "reservation-create",
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  const totalTRYDisplay =
    Number(data.total_price_try) || Number(priceDetail?.total) || 0;

  const cleaningTRYDisplay =
    Number(data.cleaning_fee_try) || Number(priceDetail?.cleaning) || 0;

  /* 🔥 HAVUZ ISITMA — uçtan uca tamamlama turu. Custom price'ta 0
     (custom total tek kalem; pool heating ayrı satır olarak taşınmaz —
     buildCreateCustomPricePayload ile aynı nötrleme kuralı). */
  const poolHeatingTRYDisplay = data.custom_price
    ? 0
    : Number(data.pool_heating_total_try) ||
      Number(priceDetail?.poolHeating) ||
      0;

  /* 🛡️ FIX — eski hand-rolled `Math.max(totalTRYDisplay - cleaningTRYDisplay, 0)`
     formülü havuz ısıtmayı hesaba katmıyordu (accommodationBase() çağırmıyordu,
     bu yüzden ilk grep taramasında görünmüyordu). accommodationBase 3. parametre
     ile pool heating'i de düşer; poolHeatingTRYDisplay=0 iken eski formülle
     BYTE-IDENTICAL. */
  const stayTRYDisplay = accommodationBase(
    totalTRYDisplay,
    cleaningTRYDisplay,
    poolHeatingTRYDisplay
  );

  const prepayment = priceDetail
    ? Math.round((stayTRYDisplay * prepaymentRate) / 100)
    : 0;

  /* ---------------------------------------------
     🔥 PAYMENT DISPLAY — payment_preference'a göre
     "Şimdi ödenecek" + "Kalan" tek source-of-truth
     getPaymentDisplayValues helper'ından gelir.
     - full_payment  → payNow=total, remainingOnArrival=0
     - prepayment    → payNow=prepayment, remainingOnArrival=total−prepayment
     Custom flow'da prepayment 0 olabilir; helper bu durumda
     totalTRYDisplay × rate / 100 türetir.
  ---------------------------------------------- */
  const payment = getPaymentDisplayValues({
    total_price_try: totalTRYDisplay,
    prepayment_amount:
      prepayment ||
      Math.round((stayTRYDisplay * prepaymentRate) / 100),
    payment_preference: data.payment_preference,
  });
  const payNowLabel = payment.isFullPayment
    ? "Şimdi ödenecek (Tüm tutar)"
    : `Ön ödeme (%${prepaymentRate})`;

  const hasForeignCurrency =
    (data.original_currency && data.original_currency !== "TRY") ||
    (data.original_cleaning_currency &&
      data.original_cleaning_currency !== "TRY") ||
    Number(data.exchange_rate) > 1;

  /* 🛡️ FAZ 1 — Wizard step component'leri `ReservationFormShape` loose
     contract'ı bekliyor. `ReservationCreateData` strict subtype'ı geçer
     ama setter contravariant pozisyon → variance fail. Tek noktada
     cast; runtime'da aynı fonksiyon referansı; davranış byte-identical. */
  const setDataLoose = setData as unknown as ReservationFormSetter;

  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">Rezervasyon</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Yeni rezervasyon
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          Misafir ve tarih bilgilerini girip rezervasyonu oluştur.
        </p>
      </div>

      {/* WIZARD STEP BAR — create page'de yalnız tamamlanmış step'lere atlama */}
      <WizardStepBar
        steps={STEPS}
        currentStep={currentStep}
        onStepClick={setCurrentStep}
        allowFreeNav={false}
      />

      <div className="space-y-6">
        {/* META */}
        <CreateMetaCards
          createdLabel={new Date().toLocaleDateString("tr-TR")}
          villaTitle={findVillaTitle(villas, data.villa_id)}
        />

        {/* ═══ STEP 1 — Kişisel Bilgiler ve Konum ═══
            Eski Adım 1 (Kişisel) + Adım 2 (Konum) aynı adımda, alt
            bölüm olarak. Component'ler, alanları ve sıraları AYNEN. */}
        {currentStep === 1 && (
          <>
            <PersonalStep data={data} setData={setDataLoose} errors={errors} />
            <LocationStep data={data} setData={setDataLoose} errors={errors} />
          </>
        )}

        {/* ═══ STEP 2 — Mülk ve Tarih ═══
            Eski Adım 3 (Mülk) + Adım 4 (Tarih) + Adım 5 (Misafir).
            Villa seçimi.
            onVillaChange: villa_id güncel + tarihleri / priceDetail sıfırla
            (mevcut davranış birebir korunur). */}
        {currentStep === 2 && (
          <>
          <VillaSelectStep
            data={data}
            errors={errors}
            villas={villas}
            onVillaChange={(villaId) => {
              setData({ ...data, villa_id: villaId });
              setStartDate(null);
              setEndDate(null);
              setPriceDetail(null);
            }}
          />


        {/* Tarih aralığı. Inline embedded calendar.
            Popup/trigger pattern tamamen kaldırıldı; takvim doğrudan
            adımın içinde her zaman görünür. ReservationCalendar
            kendi nav header'ını render ediyor. Reservation logic
            (fullyBlockedDates, getValidEndDate, drag-select)
            BİREBİR korunuyor. */}
          <Section
            eyebrow="Adım 2"
            title="Tarih aralığı"
            subtitle="Giriş ve çıkış günleri — sürükleyerek aralık seç"
          >
            {/* Calendar (sol) + Live price summary (sağ).
                Mobile: stack. Desktop (lg+): yan yana, price 320px.
                Hesap dependency'leri AYNI; sadece render konumu. */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 lg:gap-6">
              <div className="min-w-0">
                <ReservationCalendar
                  /* 🛡️ Gecelik fiyat gösterimi (salt görsel). Veriler
                     ZATEN sayfada; ek fetch YOK. */
                  prices={prices}
                  discounts={discounts}
                  rates={rates}
                  priceCurrency="TRY"
                  startDate={startDate}
                  endDate={endDate}
                  freshSelection={freshSelection}
                  setFreshSelection={setFreshSelection}
                  currentMonth={currentMonth}
                  setCurrentMonth={setCurrentMonth}
                  blockedDates={mergedBlockedDates}
                  checkinDates={mergedCheckinDates}
                  checkoutDates={mergedCheckoutDates}
                  pendingCheckinDates={pendingCheckinDates}
                  pendingCheckoutDates={pendingCheckoutDates}
                  pendingMiddleDates={pendingMiddleDates}
                  externalCheckinDates={externalCal.externalCheckinDates}
                  externalCheckoutDates={externalCal.externalCheckoutDates}
                  externalMiddleDates={externalCal.externalMiddleDates}
                  externalDetailByDate={externalCal.detailByDate}
                  onSelectRange={(from, to, fb) => {
                    /* 🛡️ FAZ 56H-D-FIX3 — fb (fullyBlockedDates) 3. arg
                       kullanılır: ReservationCalendar içinde mevcut
                       merge'ler + external middle + cross-source overlap
                       hepsi dahil; excludeDisabledDates filter de
                       uygulanmış. mergedBlockedDates (external dahil
                       değil) kullanmak drag jump-over senaryosunda
                       range'in external bloku içermesine sebep oluyordu.
                       Manual reservation form pattern'iyle birebir hizalı. */
                    const safeEnd = getValidEndDate(from, to, fb);
                    setStartDate(from);
                    setEndDate(safeEnd);
                  }}
                  showRangeChip={false}
                />

                {(errors.start_date || errors.end_date) && (
                  <p className="text-xs text-red-500 mt-3">
                    {errors.start_date || errors.end_date}
                  </p>
                )}
              </div>

              {/* Live price summary — anlık fiyat değişimleri.
                  Tüm değerler page'in mevcut state/useEffect'lerinden
                  hazır geliyor; bileşen pure presentational.
                  - Custom price modunda priceDetail null olabilir;
                    o zaman manuel total'i göster. */}
              <LiveDatePriceSummary
                startDate={startDate}
                endDate={endDate}
                nights={
                  startDate && endDate
                    ? Math.max(
                        0,
                        Math.round(
                          (endDate.getTime() - startDate.getTime()) /
                            (1000 * 60 * 60 * 24)
                        )
                      )
                    : 0
                }
                stayTRY={
                  data.custom_price ? totalTRYDisplay : stayTRYDisplay
                }
                cleaningTRY={data.custom_price ? 0 : cleaningTRYDisplay}
                poolHeatingTRY={data.custom_price ? 0 : poolHeatingTRYDisplay}
                totalTRY={totalTRYDisplay}
                payNow={payment.payNow}
                remainingOnArrival={payment.remainingOnArrival}
                payNowLabel={payNowLabel}
                isFullPayment={payment.isFullPayment}
                isCustomPrice={!!data.custom_price}
                hasForeignCurrency={hasForeignCurrency}
              />
            </div>
          </Section>

          {/* Misafir bilgisi (toplam + ek isimler) */}
          <GuestsStep
            data={data}
            setData={setDataLoose}
            errors={errors}
            guestNames={guestNames}
            setGuestNames={setGuestNames}
          />
          </>
        )}

        {/* ═══ STEP 3 — Ödeme Bilgileri ═══
            Eski Adım 6 (Fiyat) + Adım 7 (Ödeme yöntemi) + Adım 8
            (Ödeme Tercihi) + Adım 9 (Not).
            Fiyat bilgisi (custom toggle / normal flow / damage deposit).
            Custom toggle'ın state reset davranışı page'de kalır
            (handleCustomPriceToggle); component sadece tıklamayı bildirir. */}
        {currentStep === 3 && (
          <>
          <PriceStep
            data={data}
            setData={setDataLoose}
            errors={errors}
            /* 🛡️ Migration 076 — sezonluk ay kısıtı (toggle görünürlüğü).
               Tarih seçilmemişse true (result/priceDetail zaten null
               olur, PriceStep normal flow'u göstermez). */
            poolHeatingActiveForRange={
              startDate && endDate
                ? isPoolHeatingActiveForRange(
                    formatLocalDate(startDate),
                    formatLocalDate(endDate),
                    selectedVilla?.pool_heating_months
                  )
                : true
            }
            /* 🛡️ FAZ 1 — PriceDetailSnapshot ([id] tipinden) nullable
               foreign currency alanları içerir; child `ReservationPriceDetail`
               undefined-only istiyor. Runtime: null → "field yok" semantic'i
               undefined ile aynı; cast bundle/runtime nötr. */
            priceDetail={priceDetail as unknown as ReservationPriceDetail | null}
            payment={payment}
            payNowLabel={payNowLabel}
            hasForeignCurrency={hasForeignCurrency}
            totalTRYDisplay={totalTRYDisplay}
            cleaningTRYDisplay={cleaningTRYDisplay}
            stayTRYDisplay={stayTRYDisplay}
            poolHeatingTRYDisplay={poolHeatingTRYDisplay}
            selectedVilla={selectedVilla}
            onPoolHeatingToggle={() =>
              setData((prev) => ({
                ...prev,
                pool_heating_selected: !prev.pool_heating_selected,
              }))
            }
            onCustomToggle={() =>
              setData((prev) => {
                /* ---------------------------------------------
                   🔥 TOGGLE OFF (true → false)
                   custom override kaldırılır. Manuel girilmiş
                   değerler temizlenir → useEffect otomatik olarak
                   calculateGrandTotal() çalıştırıp alanları
                   yeniden doldurur.
                ---------------------------------------------- */
                if (prev.custom_price) {
                  return {
                    ...prev,
                    custom_price: false,
                    custom_price_note: "",
                    total_price: 0,
                    total_price_try: 0,
                    original_price: 0,
                    original_currency: "TRY",
                    original_cleaning_fee: 0,
                    original_cleaning_currency: "TRY",
                    cleaning_fee_try: 0,
                    exchange_rate: 1,
                    prepayment_amount: 0,
                    remaining_payment: 0,
                  };
                }

                /* ---------------------------------------------
                   🔥 TOGGLE ON (false → true)
                   multi-currency alanları nötrlenir.
                   🔥 HAVUZ ISITMA — buildCreateCustomPricePayload'ın
                   always-write false/0 davranışıyla AYNI: custom
                   price'ta pool heating ayrı satır olarak taşınmaz,
                   checkbox da bu blok gizli olduğu için render
                   edilmez. State'i de nötrleyerek UI/payload
                   tutarlılığı sağlanır (section 16: "havuz ısıtma
                   custom price'ın içine gizlenmemeli").
                ---------------------------------------------- */
                return {
                  ...prev,
                  custom_price: true,
                  original_price: 0,
                  original_currency: "TRY",
                  original_cleaning_fee: 0,
                  original_cleaning_currency: "TRY",
                  cleaning_fee_try: 0,
                  exchange_rate: 1,
                  pool_heating_selected: false,
                  original_pool_heating_total: 0,
                  original_pool_heating_currency: "TRY",
                  pool_heating_total_try: 0,
                };
              })
            }
          />

          {/* Ödeme yöntemi */}
          <PaymentMethodStep
            data={data}
            setData={setDataLoose}
            errors={errors}
            paymentMethods={paymentMethods}
          />

          {/* Ödeme Tercihi */}
          <PaymentPreferenceStep
            data={data}
            setData={setDataLoose}
            errors={errors}
          />

        {/* TAHSILAT — create page'de gösterilmez.
            Yeni flow:
              - create page yalnız rezervasyon snapshot'ı kurar
              - tahsilat lifecycle'ı (alınan tutar + onay) sadece
                detail page'de yönetilir
            Detail page'deki Tahsilat section + payment confirm
            akışı dokunulmadı. */}

        {/* STATUS — create page'de gösterilmez.
            Yeni rezervasyon her zaman "pending" durumunda kayda
            geçer; admin "Ödemeyi Onayla" akışıyla detail page'de
            "confirmed"a geçirir. */}

          {/* Not — validation alanı yok; akışın sonunda kalır. */}
          <NoteStep data={data} setData={setDataLoose} />
          </>
        )}
      </div>

      {/* STICKY WIZARD NAV — Geri / İleri / Oluştur
          Mevcut handleCreate ve validateForm dokunulmadı; son adımda
          aynı submit akışı tetiklenir. */}
      <StickyActionBar
        steps={STEPS}
        currentStep={currentStep}
        onBack={goBack}
        onNext={goNext}
        onSubmit={handleCreate}
        loading={loading}
        submitLabel="Rezervasyonu Oluştur"
        loadingLabel="Oluşturuluyor…"
        submitOnlyOnLastStep
        disableNavWhileLoading
      />
    </div>
  );
}
