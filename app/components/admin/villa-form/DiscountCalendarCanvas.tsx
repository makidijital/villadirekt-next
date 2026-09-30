"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* 🛡️ Yalnız PricingCalendarCanvas'ın ALTINDAKİ saf/sunum parçaları
   reuse edilir — PricingCalendarCanvas'ın KENDİSİ (drag/save/persist
   state'i, villa_prices'a bağlı akışı) HİÇ import edilmez, ikinci kez
   mount edilmez. Bu importlar mevcut fiyat takviminin de kullandığı
   AYNI dosyalardan, DEĞİŞTİRİLMEDEN gelir. */
import {
  formatLocalDate,
  parseLocalDate,
  startOfMonth,
  addMonths,
  dayKey,
} from "@/app/components/admin/villa/pricing-calendar/_helpers/date-math";
import { buildDayPriceMap } from "@/app/components/admin/villa/pricing-calendar/_helpers/range-math";
import { buildDayDiscountedPriceMap } from "@/app/components/admin/villa/pricing-calendar/_helpers/discount-day-map";
import PricingCalendarNav from "@/app/components/admin/villa/pricing-calendar/_components/PricingCalendarNav";
import MonthBlock from "@/app/components/admin/villa/pricing-calendar/_components/MonthBlock";
import type { PricingCanvasRange } from "@/app/components/admin/villa/pricing-calendar/_types/pricing-calendar";
/* 🛡️ MEVCUT İNDİRİM ÖNİZLEMESİ (bilgi amaçlı, bkz. dosya sonu doc) —
   fiyat/indirim OKUMASI için PricingCalendarCanvas'ın/DiscountsSection'ın
   ZATEN KULLANDIĞI AYNI read-only server action'lar reuse edilir; yeni
   sorgu/action YOK. Yazma tarafına (savePricingData/saveDiscountData)
   HİÇ dokunulmuyor/import edilmiyor — bu component SADECE okur. */
import { loadPricingData } from "@/app/components/admin/villa/pricing.action";
import { loadDiscountData } from "@/app/components/admin/villa/discount.action";
import { type DiscountRange } from "@/lib/price.engine";

/* ===============================================================
   🔥 DiscountCalendarCanvas — İndirim tarih aralığı seçimi
   ===============================================================
   AMAÇ: PricingCalendarCanvas'ın (Fiyatlar bölümü) kullanıcı
   deneyimiyle (ay ay grid, gün hücreleri, mouse drag range seçimi,
   mobilde tap-to-range, seçili aralığın görsel vurgusu) MÜMKÜN
   OLDUĞUNCA AYNI HİSSİ veren, ama TAMAMEN BAĞIMSIZ ve İZOLE bir
   "yalnızca tarih aralığı seç" component'i.

   ⚠️ PricingCalendarCanvas.tsx'İN KENDİSİ DEĞİŞTİRİLMEDİ VE İKİNCİ
   KEZ MOUNT EDİLMEDİ. Reuse edilen yalnız onun ALTINDAKİ saf/sunum
   parçaları (BİREBİR AYNI import, hiç fork edilmedi):
     - PricingCalendarNav (ay navigasyonu — fiyat chip'i pricesCount=0
       geçildiği için hiç render edilmez, yalnız ◄ Bugün ► kalır)
     - MonthBlock (ve onun içinde kullandığı DayCell) — 42 hücrelik
       ay grid'i, hücre highlight/boundary mantığı BİREBİR AYNI.
     - date-math.ts (formatLocalDate/parseLocalDate/startOfMonth/
       addMonths/dayKey) — TEK source-of-truth, değiştirilmedi.
   MonthBlock'a HER ZAMAN boş bir dayPriceMap verilir (minPrice/
   maxPrice=0) → DayCell hiçbir günde fiyat GÖSTERMEZ (nötr "—")
   — bu component fiyatlarla hiç ilgilenmiyor, yalnız tarih seçtirir.
   isInRange/isRangeBoundary/renk-tonlama gibi TÜM görsel seçim
   mantığı MonthBlock/DayCell'in KENDİ İÇİNDEN (değiştirilmeden)
   gelir — burada tekrar YAZILMADI.

   Drag-select + tap-to-range STATE MODELİ, PricingCalendarCanvas'taki
   ile AYNI DAVRANIŞTA burada AYRICA (kod paylaşımı OLMADAN) uygulandı
   — bu component'in state'i PricingCalendarCanvas'ın state'inden veya
   fiyat kaydetme (save) action'ından TAMAMEN BAĞIMSIZDIR; aralarında
   hiçbir bağlantı/import yok.

   TEK GÖREVİ: başlangıç + bitiş tarihi seçtirip
   onChange({ start_date, end_date }) ile parent'a (DiscountsSection)
   bildirmek. [start_date, end_date] KAPALI interval (villa_prices ile
   birebir aynı semantik). İndirim tipi/değer/para birimi, kayıt,
   silme — HİÇBİRİNE bu component dokunmaz.

   🛡️ EKLENTİ — 5 AYLIK GÖRÜNÜM + MEVCUT İNDİRİM ÖNİZLEMESİ (bilgi amaçlı):
     - Ay grid'i artık PricingCalendarCanvas'ın (fiyatlandırma adımı)
       kullandığı AYNI 5-ay layout mantığını (`monthGridColsClass` +
       `compact` prop) kullanır — yeni bir layout sistemi İCAT EDİLMEDİ.
     - `villaId` verilirse (opsiyonel prop) bu component KENDİ, TAMAMEN
       BAĞIMSIZ bir read-only fetch'i yapar (`loadPricingData` +
       `loadDiscountData` — DiscountsSection/PricingCalendarCanvas'ın
       ZATEN kullandığı aynı action'lar, İKİNCİ bir call-site) ve
       SADECE ZATEN KAYITLI bir indirime denk gelen günlerde o günün
       fiyatını (eski/yeni, PricingCalendarCanvas'taki AYNI görsel dille)
       gösterir. Bu SADECE bilgi amaçlıdır — yeni seçilen taslak
       aralığın hesaplamasını/kaydını ETKİLEMEZ, mevcut discount save/
       load akışına HİÇ dokunmaz, price.engine'e HİÇ dokunmaz. villaId
       verilmezse (veya prices/discounts boşsa) davranış ESKİSİYLE
       BYTE-IDENTICAL kalır (her gün "—").
=============================================================== */

export type DiscountDateRange = { start_date: string; end_date: string };

export default function DiscountCalendarCanvas({
  value,
  onChange,
  visibleMonths = 5,
  villaId,
}: {
  /** Halihazırda seçili (draft) aralık — form state'i parent'ta yaşar. */
  value: DiscountDateRange | null;
  /** Kullanıcı bir aralık seçtiğinde (drag bırakınca veya 2. tap'te) çağrılır. */
  onChange: (range: DiscountDateRange) => void;
  /** Yan yana gösterilecek ay sayısı. Default 5 — PricingCalendarCanvas'ın
   *  fiyatlandırma adımında kullandığı 5-ay görünümüyle AYNI (görsel parity). */
  visibleMonths?: number;
  /** 🛡️ Opsiyonel — verilirse SADECE zaten kayıtlı indirimlerin
   *  düştüğü günlerde bilgi amaçlı fiyat göstermek için kendi bağımsız
   *  read-only fetch'ini yapar (bkz. dosya başı doc). Verilmezse (veya
   *  CREATE mode'da villa henüz yoksa) davranış ESKİSİYLE aynı kalır. */
  villaId?: string;
}) {
  const [anchorMonth, setAnchorMonth] = useState<Date>(() =>
    startOfMonth(new Date())
  );

  /* 🛡️ MEVCUT İNDİRİM ÖNİZLEMESİ (bilgi amaçlı) — bkz. dosya başı doc.
     Bu state, range-seçim state'inden (dragStart/dragEnd/tapAnchor)
     TAMAMEN AYRI; seçim davranışını hiç etkilemez. */
  const [previewPrices, setPreviewPrices] = useState<PricingCanvasRange[]>([]);
  const [previewDiscounts, setPreviewDiscounts] = useState<DiscountRange[]>([]);

  useEffect(() => {
    if (!villaId) {
      setPreviewPrices([]);
      setPreviewDiscounts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ prices: pricesData }, discountData] = await Promise.all([
        loadPricingData(villaId),
        loadDiscountData(villaId),
      ]);
      if (cancelled) return;
      setPreviewPrices(
        (pricesData || []).map((p) => ({
          start_date: (p.start_date || "").toString().split("T")[0],
          end_date: (p.end_date || "").toString().split("T")[0],
          price: Number(p.price) || 0,
          currency: p.currency || "TRY",
        }))
      );
      setPreviewDiscounts(
        (discountData.discounts || []).map((d) => ({
          start_date: (d.start_date || "").toString().split("T")[0],
          end_date: (d.end_date || "").toString().split("T")[0],
          discount_type: d.discount_type,
          discount_value: Number(d.discount_value) || 0,
          currency: d.currency,
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [villaId]);

  /* 🛡️ getActiveDiscount/applyDiscountToDailyPrice (price.engine.ts)
     reuse eden, mevcut fail-safe'i (currency mismatch → skip) İÇEREN
     AYNI helper (discount-day-map.ts) — yeni hesaplama YOK. */
  const previewDayPriceMap = useMemo(
    () => buildDayPriceMap(previewPrices),
    [previewPrices]
  );
  const previewDiscountedPriceMap = useMemo(
    () => buildDayDiscountedPriceMap(previewDayPriceMap, previewDiscounts),
    [previewDayPriceMap, previewDiscounts]
  );
  /* 🛡️ SADECE zaten kayıtlı bir indirime denk gelen günleri filtreler
     (Map key intersection — fiyat/indirim hesaplaması YOK, salt eşleme).
     Bu sayede indirim OLMAYAN günlerde priceRange hep null kalır →
     DayCell "—" gösterir (mevcut/eski davranış BYTE-IDENTICAL). */
  const previewDiscountDayPriceMap = useMemo(() => {
    const map = new Map<string, PricingCanvasRange>();
    for (const key of previewDiscountedPriceMap.keys()) {
      const range = previewDayPriceMap.get(key);
      if (range) map.set(key, range);
    }
    return map;
  }, [previewDayPriceMap, previewDiscountedPriceMap]);

  // Drag-select (desktop mouse) — PricingCalendarCanvas ile AYNI model.
  const [dragStart, setDragStart] = useState<Date | null>(null);
  const [dragEnd, setDragEnd] = useState<Date | null>(null);
  const draggingRef = useRef<boolean>(false);
  // 📱 Tap-to-range (mobil/touch) — desktop drag'i ETKİLEMEZ.
  const [tapAnchor, setTapAnchor] = useState<Date | null>(null);

  /* ---------- RANGE COMMIT ----------
     PricingCalendarCanvas'taki commitRange'in AYNI swap mantığı;
     yalnız drawer açmak yerine doğrudan onChange ile parent'a bildirir. */
  const commitRange = useCallback(
    (a0: Date, b0: Date) => {
      const a = a0.getTime() <= b0.getTime();
      const from = a ? a0 : b0;
      const to = a ? b0 : a0;
      onChange({
        start_date: formatLocalDate(from),
        end_date: formatLocalDate(to),
      });
    },
    [onChange]
  );

  /* ---------- DRAG GLOBAL MOUSEUP (desktop) ---------- */
  useEffect(() => {
    const handleUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (dragStart && dragEnd) {
        commitRange(dragStart, dragEnd);
      }
      setDragStart(null);
      setDragEnd(null);
    };
    window.addEventListener("mouseup", handleUp);
    return () => window.removeEventListener("mouseup", handleUp);
  }, [dragStart, dragEnd, commitRange]);

  const onCellDown = useCallback((d: Date) => {
    draggingRef.current = true;
    setDragStart(d);
    setDragEnd(d);
    setTapAnchor(null);
  }, []);
  const onCellEnter = useCallback((d: Date) => {
    if (!draggingRef.current) return;
    setDragEnd(d);
  }, []);

  /* ---------- 📱 TAP-TO-RANGE (mobil/touch) ----------
     PricingCalendarCanvas'taki ile AYNI iki-dokunuş modeli. */
  const onCellTap = useCallback(
    (d: Date) => {
      draggingRef.current = false;
      if (!tapAnchor) {
        setTapAnchor(d);
        setDragStart(d);
        setDragEnd(d);
      } else {
        commitRange(tapAnchor, d);
        setTapAnchor(null);
        setDragStart(null);
        setDragEnd(null);
      }
    },
    [tapAnchor, commitRange]
  );

  const months: Date[] = [];
  for (let i = 0; i < Math.max(1, visibleMonths); i++) {
    months.push(addMonths(anchorMonth, i));
  }

  /* 🛡️ PricingCalendarCanvas'taki BİREBİR AYNI 5-ay responsive grid
     mantığı — yeni bir layout sistemi İCAT EDİLMEDİ. */
  const monthGridColsClass =
    visibleMonths >= 5
      ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
      : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";

  // Sürükleme sırasında canlı önizleme; sürükleme/tap bekleme yokken
  // son commit edilmiş (value) aralık gösterilir — PricingCalendarCanvas'taki
  // `activeFrom/activeTo` (orada drawerOpen bazlı) mantığının, burada
  // drawer yerine `value` prop'una bağlı ikizi.
  const valueFrom = value ? parseLocalDate(value.start_date) : null;
  const valueTo = value ? parseLocalDate(value.end_date) : null;
  const activeFrom = dragStart ?? valueFrom;
  const activeTo = dragEnd ?? valueTo;

  return (
    <div className="select-none card-premium p-3 md:p-4">
      <PricingCalendarNav
        setAnchorMonth={setAnchorMonth}
        pricesCount={0}
        minPrice={0}
        maxPrice={0}
      />
      <div className={`grid ${monthGridColsClass} gap-x-6 gap-y-6`}>
        {months.map((m) => (
          <MonthBlock
            key={dayKey(m)}
            monthStart={m}
            dayPriceMap={previewDiscountDayPriceMap}
            dayDiscountedPriceMap={previewDiscountedPriceMap}
            minPrice={0}
            maxPrice={0}
            activeFrom={activeFrom}
            activeTo={activeTo}
            isDraggingNow={!!dragStart && !!dragEnd}
            onCellDown={onCellDown}
            onCellEnter={onCellEnter}
            onCellTap={onCellTap}
            compact={visibleMonths >= 5}
          />
        ))}
      </div>
    </div>
  );
}
