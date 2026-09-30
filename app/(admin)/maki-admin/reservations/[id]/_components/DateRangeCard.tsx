/* ===============================================================
   📦 Reservation Detail — DateRangeCard (Adım 2: Tarih aralığı)
   ===============================================================
   FAZ 2 refactor: JSX byte-identical _components/'a taşındı.
   ReservationCalendar + LiveDatePriceSummary embedded; tüm calendar
   state/handler'lar prop'tan gelir.

   excludeDisabledDates = currentReservationDates (edit-mode self-
   exclusion) + .neq("id", id) eski sağlayıcı query'si AYNEN korunuyor.
   onSelectRange semantic: getValidEndDate + setStartDate/setEndDate —
   safeEnd clamp davranışı değişmedi.
=============================================================== */

import type { Dispatch, SetStateAction } from "react";

import ReservationCalendar from "@/app/components/admin/reservation-form/ReservationCalendar";
import type { DiscountRange } from "@/lib/price.engine";
import LiveDatePriceSummary from "@/app/components/admin/reservation-form/LiveDatePriceSummary";
import { getValidEndDate } from "@/lib/date-range";

import Section from "./Section";

export default function DateRangeCard({
  data,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  freshSelection,
  setFreshSelection,
  currentMonth,
  setCurrentMonth,
  mergedBlockedDates,
  mergedCheckinDates,
  mergedCheckoutDates,
  pendingCheckinDates,
  pendingCheckoutDates,
  pendingMiddleDates,
  externalCal,
  currentReservationDates,
  priceDetail,
  paymentDisplay,
  paymentDisplayPayNowLabel,
  /* 🛡️ Takvimde gecelik fiyat gösterimi (salt görsel) — page.tsx'te
     ZATEN mevcut state'ler; ek fetch YOK. */
  prices,
  discounts,
  rates,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  startDate: Date | null;
  endDate: Date | null;
  /* Dispatch<SetStateAction<...>> — ReservationCalendar inside aynı
     functional updater contract'ı bekler. Standart React state setter. */
  setStartDate: Dispatch<SetStateAction<Date | null>>;
  setEndDate: Dispatch<SetStateAction<Date | null>>;
  freshSelection: boolean;
  setFreshSelection: Dispatch<SetStateAction<boolean>>;
  currentMonth: Date;
  setCurrentMonth: Dispatch<SetStateAction<Date>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prices?: any[] | null;
  discounts?: DiscountRange[] | null;
  rates?: Record<string, number>;
  mergedBlockedDates: Date[];
  mergedCheckinDates: Date[];
  mergedCheckoutDates: Date[];
  pendingCheckinDates: Date[];
  pendingCheckoutDates: Date[];
  pendingMiddleDates: Date[];
  externalCal: {
    externalCheckinDates: Date[];
    externalCheckoutDates: Date[];
    externalMiddleDates: Date[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    detailByDate: Record<string, any>;
  };
  currentReservationDates: Date[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  priceDetail: Record<string, any> | null;
  paymentDisplay: {
    payNow: number;
    remainingOnArrival: number;
    isFullPayment: boolean;
  };
  paymentDisplayPayNowLabel: string;
}) {
  return (
    <Section
      eyebrow="Tarih"
      title="Tarih aralığı"
      subtitle="Giriş ve çıkış günleri"
    >
      {/* Inline embedded calendar (sol) + Live price summary (sağ).
          EDIT mode self-exclusion (excludeDisabledDates =
          currentReservationDates) ve .neq("id", id) eski sağlayıcı
          query'si AYNEN korunuyor.
          onSelectRange: pre-existing davranış AYNEN — getValidEndDate
          çağrılır ama setEndDate(to) raw `to` ile yazılır
          (render-only migration scope dışı). */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 lg:gap-6">
        <div className="min-w-0">
          <ReservationCalendar
            prices={prices ?? null}
            discounts={discounts ?? null}
            rates={rates ?? { TRY: 1 }}
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
            excludeDisabledDates={currentReservationDates}
            onSelectRange={(from, to, fb) => {
              /* 🛡️ FAZ 56H-D-FIX3 — fb (fullyBlockedDates) 3. arg
                 kullanılır + safeEnd ile clamp. ReservationCalendar
                 fb'ye external middle + cross-source overlap'ı dahil
                 ediyor; excludeDisabledDates (=currentReservationDates)
                 filter de uygulanmış olduğundan kendi rezervasyonun
                 tarihleri fb'de YOK → edit mode'da kendi aralığını
                 uzatma/daraltma davranışı korunuyor. Yalnız external
                 veya başka rezervasyon overlap'ı clamp edilir.
                 Önceki raw-to davranışı drag jump-over senaryosunda
                 range'in external'ı içermesine sebep oluyordu. */
              const safeEnd = getValidEndDate(from, to, fb);
              setStartDate(from);
              setEndDate(safeEnd);
            }}
            showRangeChip={false}
          />
        </div>

        {/* Live price summary — page'in mevcut priceDetail +
            paymentDisplay + prepaymentRate'inden besleniyor.
            custom_price branch'ında bile priceDetail snapshot
            doluyor (line 478-491), o yüzden tek branch yeterli. */}
        <LiveDatePriceSummary
          startDate={startDate}
          endDate={endDate}
          nights={Number(priceDetail?.nights || 0)}
          stayTRY={Number(priceDetail?.stay || 0)}
          cleaningTRY={Number(priceDetail?.cleaning || 0)}
          poolHeatingTRY={Number(priceDetail?.poolHeating || 0)}
          totalTRY={Number(priceDetail?.total || 0)}
          payNow={Number(paymentDisplay.payNow || 0)}
          remainingOnArrival={Number(paymentDisplay.remainingOnArrival || 0)}
          payNowLabel={paymentDisplayPayNowLabel}
          isFullPayment={!!paymentDisplay.isFullPayment}
          isCustomPrice={!!data?.custom_price}
          hasForeignCurrency={Boolean(
            (data?.original_currency && data.original_currency !== "TRY") ||
              (data?.original_cleaning_currency &&
                data.original_cleaning_currency !== "TRY") ||
              Number(data?.exchange_rate) > 1
          )}
        />
      </div>
    </Section>
  );
}
