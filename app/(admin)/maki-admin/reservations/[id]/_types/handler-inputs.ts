import type { Dispatch, SetStateAction } from "react";
import type { DiscountRange } from "@/lib/price.engine";

import type {
  ReservationDetailData,
  PriceDetailSnapshot,
  SelectedVilla,
} from "./reservation-form-data";

/* ===============================================================
   🛡️ FAZ 1 — HANDLER + EFFECT HELPER INPUT/OUTPUT TYPES
   ===============================================================
   Eski page.tsx içindeki büyük inline handler/effect body'leri
   pure helper'lara taşınırken kullanılan typed input shape'leri.

   ⚠️ KESIN KURAL:
     - Helper input alanları, eski inline closure'un OKUDUĞU
       state/ref'in BYTE-IDENTICAL kopyası.
     - Field set + nullable contract aynen.
     - Helper output: ya `Partial<ReservationDetailData>`, ya
       discriminated union, ya pure side-effect tag.
=============================================================== */

/* ===============================================================
   handleVillaChange — state reset compute input
   ===============================================================
   Page closure'un okuduğu (newVillaId param) + null-guard pattern.
   Helper page'ın `setData((prev) => ...)` semantiği için Partial
   döner; page bunu spread eder. */
export type VillaChangeResetInput = {
  prev: ReservationDetailData;
  newVillaId: string;
};

/** Helper output: PATCH (Partial<ReservationDetailData>). Page'de
 *  `setData((prev) => prev ? { ...prev, ...patch } : prev)` ile
 *  uygulanır. Eski inline davranış aynen. */
export type VillaChangeResetPatch = Partial<ReservationDetailData>;

/* ===============================================================
   handleCustomPriceToggle — ON/OFF branch compute input
   ===============================================================
   ON→OFF branch'ında calculateGrandTotal çağrısı dahil; pure helper'a
   alındığında tüm değişen state'i tek seferde tek output'la verir. */
export type CustomPriceToggleInput = {
  prev: ReservationDetailData;
  startDate: Date | null;
  endDate: Date | null;
  /* `prices: any[]` — `useState<any[]>` (calculateGrandTotal'a geçer;
     end_date string|null drift'i nedeniyle eski koşul; pragmatik
     pass-through. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prices: any[];
  rates: Record<string, number>;
  selectedVilla: SelectedVilla;
  prepaymentRate: number;
};

/** Helper output: next state (Partial). Page `setData` ile uygular. */
export type CustomPriceToggleNext = Partial<ReservationDetailData>;

/* ===============================================================
   handleCustomPriceAmountChange — pure compute input
   ===============================================================
   total_price_try input onChange — prepayment + remaining recalc.
   paid_amount KORUNUR (prev'den okunur). */
export type CustomPriceAmountChangeInput = {
  prev: ReservationDetailData;
  newAmount: number;
  prepaymentRate: number;
};

export type CustomPriceAmountChangeNext = Partial<ReservationDetailData>;

/* ===============================================================
   computeReservationPriceRecalc — useEffect body input
   ===============================================================
   En kritik helper. Page'in price recalc useEffect'i ~245 LOC body.
   Helper PURE — 3 path döner:
     - "custom_price" branch
     - "no_recalc" snapshot branch (tarih + villa aynı)
     - "recalc" branch (calculateGrandTotal + foreign currency)
   Page setPriceDetail + setData call'larını sırayla uygular.

   Inputs eski closure'da okunan tüm dependency'lerin BYTE-IDENTICAL
   kopyası — dependency array değişmeden. */
export type PriceRecalcInput = {
  data: ReservationDetailData | null;
  startDate: Date | null;
  endDate: Date | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prices: any[];
  rates: Record<string, number>;
  /** 🛡️ villa_discounts — OPSİYONEL. Verilmezse indirim uygulanmaz
   *  (eski davranış birebir). Takvimdeki indirimli gecelik fiyatla
   *  toplamın tutarlı olması için beslenir. */
  discounts?: DiscountRange[] | null;
  originalStartDate: string | null;
  originalEndDate: string | null;
  originalVillaId: string | null;
  selectedVilla: SelectedVilla;
  prepaymentRate: number;
};

/* Discriminated union — 3 path: */

export type PriceRecalcResult =
  /* prices.length === 0 veya date missing — `priceDetail = null`. */
  | { kind: "clear" }
  /* custom_price branch — priceDetail snapshot + data sync (yalnız
     start/end_date değişimi). */
  | {
      kind: "custom_price";
      priceDetail: PriceDetailSnapshot;
      /** Date sync gerekiyorsa Partial; aksi `null` (data dokunulmaz). */
      dataPatch: Partial<ReservationDetailData> | null;
    }
  /* no_recalc branch — yalnız priceDetail snapshot, data dokunulmaz. */
  | {
      kind: "snapshot";
      priceDetail: PriceDetailSnapshot;
    }
  /* recalc branch — priceDetail + data financial snapshot update. */
  | {
      kind: "recalc";
      priceDetail: PriceDetailSnapshot;
      dataPatch: Partial<ReservationDetailData>;
    };

/* ===============================================================
   fetchBlockedDates — async effect input/output
   ===============================================================
   Page'in 110-LOC blocked dates useEffect'inin async body'si.
   reservations + manual_reservations fetch + 9 ayrı Date[] grouping. */
export type FetchBlockedDatesInput = {
  villaId: string;
  /** Edit page'inde kendi rezervasyonunu hariç tutmak için. */
  excludeReservationId: string;
};

/** 9 ayrı Date[] grup — eski state set sırası ile aynen. */
export type BlockedDateGroups = {
  blocked: Date[];
  checkin: Date[];
  checkout: Date[];
  pendingCheckin: Date[];
  pendingCheckout: Date[];
  pendingMiddle: Date[];
  manualBlocked: Date[];
  manualCheckin: Date[];
  manualCheckout: Date[];
};

/* ===============================================================
   dispatchStatusChangeMail — orchestrator helper input
   ===============================================================
   Eski function declaration page.tsx'te. `_orchestrators/` altına
   taşınır; saveAll'dan import edilir. */
export type DispatchStatusChangeMailInput = {
  reservationId: string;
  oldStatus: string | null;
  newStatus: string | null | undefined;
};

/* ===============================================================
   triggerPaymentConfirmation — orchestrator helper input
   ===============================================================
   AWAITED helper; sonuç tag union. */
export type TriggerPaymentConfirmationResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string };

/* ===============================================================
   sendPaymentRequest — orchestrator helper input
   ===============================================================
   Admin user submit. State setters page'den geçer (callback).
   paymentMethod: `data?.payment_method` embed object — PaymentMethodLike
   ile uyumlu ({type?: string | null} | null | undefined). */
import type { PaymentMethodLike } from "@/lib/payment-link.helper";

export type SendPaymentRequestInput = {
  reservationId: string;
  paymentMethod: PaymentMethodLike;
  paymentLink: string | null | undefined;
  setSending: (next: boolean) => void;
  setError: (msg: string) => void;
  /** Local state sync — DB update edildi; UI'ı senkronla. */
  setData: Dispatch<SetStateAction<ReservationDetailData | null>>;
};
