"use client";

/* ===============================================================
   🛡️ BookingSummary — fiyat özet kartı
   ===============================================================
   PURE UI: BookingSidebar'daki "SUMMARY" bloğunun birebir karşılığı.
   Sidebar ve modal AYNI bu component'i kullanır.

   KONTRAT (yalnız UI/metin/sıralama/renk):
     - formatCurrency çağrı semantic'i DEĞİŞMEZ (tüm değerler aynı).
     - Conditional render kuralları DEĞİŞMEZ (result.cleaning > 0; deposit > 0).
     - Row order (UI): Konaklama Tutarı (N Gece) → Kısa Süreli Konaklama
       Ücreti → [ayraç] Toplam Tutar (yeşil, vurgulu) → Ön ödeme (mor) /
       Girişte ödenecek (turuncu) — iki ayrı vurgu kutusu → Hasar
       Depozitosu (ayrı, soft bilgi kutusu + açıklama).
     - Hasar depozitosu görsel olarak ayrı; toplama EKLENMEZ (hesap aynı).
     - "Temizlik Ücreti" label'ı "Kısa Süreli Konaklama Ücreti" oldu —
       yalnız görünen metin; `result.cleaning` DEĞİŞMEDİ.

   🛡️ HAVUZ ISITMA — yerleşim turu (yalnız bu tur — data/state/handler/
   hesap DEĞİŞMEDİ):
     - Havuz Isıtma satırı artık BURADA (Kısa Süreli Konaklama Ücreti'nin
       hemen altında, Toplam Tutar'ın hemen üstünde) — daha önce
       BookingSidebar/VillaCardBookingModal'da SUMMARY'nin DIŞINDA, ayrı
       büyük bordered bir kart olarak duruyordu (Misafir alanının altında).
       O kart tamamen kaldırıldı; checkbox + tutar artık normal bir fiyat
       satırı deseninde (Row ile aynı hizada, sol=checkbox+label, sağ=
       seçiliyse toplam).
     - Görünürlük koşulu AYNEN (yalnız taşındı): `poolHeatingFee` sayı ve
       >0. Eskiden ayrıca `startDate&&endDate&&selectedNights>0` de
       kontrol ediliyordu — bu component zaten yalnız `result` mevcutken
       (yani tarih seçili + gece>0) render edildiği için `result.nights>0`
       ile AYNI garantiyi taşır; caller'daki dış koşul DEĞİŞMEDİ.
     - Checked/unchecked state, handler (`onPoolHeatingChange` →
       `setPoolHeatingSelected`), toplam (`poolHeatingTotal` — engine'den,
       YENİDEN hesaplanmadı) BİREBİR aynı; yalnız JSX konumu/görünümü
       değişti.
     - Gecelik oran villa'nın KENDİ para biriminde (`poolHeatingCurrency`)
       gösterilir — eski "Gece başına X" metniyle AYNI kaynak/format.

   🛡️ HAVUZ ISITMA — metin standardizasyonu turu (yalnız bu tur — data/
   state/handler/hesap DEĞİŞMEDİ):
     - Checkbox label'ı "Havuz Isıtma" → "Havuz Isıtma Ücreti" oldu (satır
       hem toplam tutarı hem gecelik oranı gösterdiği için ücret ifade
       eden bir satır — repo genelinde aynı standarda çekildi). Teknik
       prop/field isimleri (`poolHeatingFee`, `poolHeatingSelected`,
       `poolHeatingTotal`, `pool_heating_fee` vb.) DEĞİŞMEDİ.

   🛡️ GÖRSEL REVİZYON (yalnız bu tur — data/state/handler/hesap DEĞİŞMEDİ):
     - Kart üstünde ince turuncu→mavi (#ED7926 → #0973BA) accent çizgisi
       — PriceList.tsx / ShortStayFeeNotice.tsx'teki aynı marka imzası.
     - Toplam Tutar artık yumuşak yeşil zeminli, vurgulu bir satır
       (aynı yeşil semantik renk — yalnız daha belirgin).
     - Ön ödeme / Girişte ödenecek iki ayrı, kendi soft zeminli kutuda
       yan yana (mor / turuncu semantiği AYNEN korunuyor) — "şimdi
       ödenecek" ile "girişte ödenecek" ilk bakışta net ayrışıyor.
     - Hasar Depozitosu artık mavi tonlu, soft bordürlü ayrı bir bilgi
       kutusu + küçük ShieldCheck rozet ikonu (marka mavisi #0973BA).
       Açıklama METNİ BİREBİR AYNI.
     - Tüm değişiklik yalnız JSX/Tailwind class'ları; padding'ler
       mütevazı tutuldu (büyük kart/aşırı boşluk yok), sidebar genişliği
       ve responsive davranış etkilenmedi (dış container aynı).
   =============================================================== */

import { Info } from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import { useCurrency } from "@/app/context/CurrencyContext";

import type { BookingResult, ActiveStayDiscount } from "./useBookingEngine";
/* 🛡️ PHASE 10B — locale-aware UI stringleri. `locale` opsiyonel,
   default "tr" — mevcut TR call-site'ları (BookingSidebar,
   VillaCardBookingModal) hiç değişmeden byte-identical render eder.
   Hesap/formatCurrency semantiğine DOKUNULMADI — yalnız metin
   kaynağı değişti. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { Locale } from "@/lib/i18n/config";

type Props = {
  result: BookingResult;
  /* 🛡️ villa_discounts — GÖRSEL GÖSTERİM (UI-only, bkz. useBookingEngine.ts
     doc-comment). null/undefined → seçili aralıkta aktif indirim yok,
     satır AYNEN eskisi gibi (BYTE-IDENTICAL) render edilir. */
  activeStayDiscount?: ActiveStayDiscount | null;
  prepayment: number;
  prepaymentRate: number;
  convertedDeposit: number;
  deposit: number;
  /* 🛡️ HAVUZ ISITMA — yerleşim turu. Hepsi caller'ın zaten sahip olduğu
     engine değerleri (useBookingEngine) — burada YENİ bir hesaplama
     YAPILMAZ, yalnız render edilir. `poolHeatingFee`/`poolHeatingCurrency`
     villa'nın KENDİ (orijinal) gecelik ücreti/para birimi; `poolHeatingTotal`
     engine'in zaten display currency'ye çevirdiği çalışma toplamı. */
  poolHeatingFee?: number | null;
  poolHeatingCurrency?: string | null;
  poolHeatingSelected?: boolean;
  onPoolHeatingChange?: (checked: boolean) => void;
  poolHeatingTotal?: number;
  /* 🛡️ Migration 076 — sezonluk ay kısıtı. Villanın gerçek
     pool_heating_months'una göre rezervasyon tarih aralığı sezon
     dışındaysa checkbox HİÇ GÖSTERİLMEZ. Default true — eski
     caller'lar (varsa) bu prop'u geçmeden BYTE-IDENTICAL davranır
     (checkbox eskisi gibi yalnız fee>0'a bakarak görünür). */
  poolHeatingActiveForRange?: boolean;
  /* 🛡️ PHASE 10B — opsiyonel, default "tr". */
  locale?: Locale;
};

export default function BookingSummary({
  result,
  activeStayDiscount = null,
  prepayment,
  prepaymentRate,
  convertedDeposit,
  deposit,
  poolHeatingFee = null,
  poolHeatingCurrency = "TRY",
  poolHeatingSelected = false,
  onPoolHeatingChange,
  poolHeatingTotal = 0,
  poolHeatingActiveForRange = true,
  locale,
}: Props) {
  const { currency } = useCurrency();
  const dict = getDictionary(locale);
  const accommodationLabel = formatDictionaryString(
    dict.booking.accommodationAmountLabel,
    { n: result.nights }
  );

  /* 🔄 GÖRSEL HİYERARŞİ (yalnız JSX/className — değerler/koşullar AYNEN):
     Ücretler → TOPLAM (açık marka-mavisi yüzey) → Ödeme planı (ön ödeme /
     girişte ödenecek) → Hasar depozitosu (krem bilgi kutusu). */
  return (
    <div className="space-y-3.5 text-[12.5px]">
      {/* ÜCRETLER */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-stone-400)]">
          {dict.booking.summaryChargesLabel}
        </p>
        <div className="mt-2 space-y-2">
          {activeStayDiscount ? (
            <div className="flex items-start justify-between gap-3">
              <span className="text-[var(--color-stone-600)] min-w-0">
                {accommodationLabel}
              </span>
              <div className="text-right shrink-0">
                <span className="block text-[11px] text-[var(--color-stone-400)] line-through tabular-nums">
                  {formatCurrency(activeStayDiscount.originalStay, currency, locale ?? "tr")}
                </span>
                <span className="block text-[var(--color-stone-900)] font-semibold tabular-nums">
                  {formatCurrency(activeStayDiscount.discountedStay, currency, locale ?? "tr")}
                </span>
                <span className="mt-1 inline-block rounded-full bg-brand px-2 py-0.5 text-[9.5px] font-semibold text-white text-center whitespace-nowrap">
                  {dict.booking.discountedTotal}
                </span>
              </div>
            </div>
          ) : (
            <Row
              label={accommodationLabel}
              value={formatCurrency(result.stay, currency, locale ?? "tr")}
            />
          )}
          {result.cleaning > 0 && (
            <Row
              label={dict.booking.shortStayFeeLabel}
              value={formatCurrency(result.cleaning, currency, locale ?? "tr")}
            />
          )}

          {/* HAVUZ ISITMA — koşul/handler/değer AYNEN */}
          {typeof poolHeatingFee === "number" &&
            poolHeatingFee > 0 &&
            poolHeatingActiveForRange && (
            <div>
              <label className="flex items-center justify-between gap-3 cursor-pointer group">
                <span className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={poolHeatingSelected}
                    onChange={(e) => onPoolHeatingChange?.(e.target.checked)}
                    className="!w-4 !h-4 shrink-0 accent-[var(--color-champagne-500)] !rounded"
                  />
                  <span className="text-[var(--color-stone-600)] group-hover:text-[var(--color-stone-900)] transition-colors">
                    {dict.booking.poolHeatingFeeLabel}
                  </span>
                </span>
                {poolHeatingSelected && (
                  <span className="text-[var(--color-stone-900)] font-semibold tabular-nums shrink-0">
                    {formatCurrency(poolHeatingTotal, currency, locale ?? "tr")}
                  </span>
                )}
              </label>
              <p className="pl-6 mt-0.5 text-[11px] text-[var(--color-stone-400)]">
                {formatCurrency(poolHeatingFee, poolHeatingCurrency || "TRY", locale ?? "tr")}{" "}
                {dict.booking.poolHeatingPerNightSuffix}
                {poolHeatingSelected &&
                  ` ${formatDictionaryString(dict.booking.poolHeatingNightsMultiplier, {
                    n: result.nights,
                  })}`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* TOPLAM — ana fiyat */}
      <div className="flex items-center justify-between gap-3 rounded-[14px] bg-brand/[0.07] px-3.5 py-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
          {dict.booking.total}
        </span>
        <span className="font-display text-[19px] font-bold leading-none text-[#0A1633] tabular-nums">
          {formatCurrency(result.total, currency, locale ?? "tr")}
        </span>
      </div>

      {/* ÖDEME PLANI — ön ödeme (küçük) / girişte ödenecek (güçlü) */}
      <div className="rounded-[14px] border border-[var(--color-stone-100)] bg-white px-3.5 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-stone-400)]">
          {dict.booking.summaryPaymentPlanLabel}
        </p>
        <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-[var(--color-stone-500)]">
          <span className="min-w-0">
            {formatDictionaryString(dict.booking.prepaymentAmountLabel, {
              rate: prepaymentRate,
            })}
          </span>
          <span className="font-semibold text-[var(--color-stone-700)] tabular-nums shrink-0">
            {formatCurrency(prepayment, currency, locale ?? "tr")}
          </span>
        </div>
        <div aria-hidden="true" className="my-2 h-px bg-[var(--color-stone-100)]" />
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-[var(--color-stone-800)] min-w-0">
            {dict.booking.dueAtCheckinLabel}
          </span>
          <span className="font-display text-[15px] font-bold text-[#0A1633] tabular-nums shrink-0">
            {formatCurrency(result.total - prepayment, currency, locale ?? "tr")}
          </span>
        </div>
      </div>

      {/* HASAR DEPOZİTOSU — ayrı krem bilgi kutusu (toplama dahil değil).
          Açıklama metni BİREBİR AYNI. */}
      {deposit > 0 && (
        <div className="rounded-[14px] border border-[#F2E2A6] bg-[#FFFBEB] px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-stone-900)] min-w-0">
              <Info size={14} strokeWidth={2} className="shrink-0 text-[#B08A00]" aria-hidden />
              {dict.booking.depositLabel}
            </span>
            <span className="font-semibold text-[var(--color-stone-900)] tabular-nums shrink-0">
              {formatCurrency(convertedDeposit, currency, locale ?? "tr")}
            </span>
          </div>
          <p className="mt-1.5 text-[12px] text-[var(--color-stone-600)] leading-[1.6]">
            {dict.booking.depositNote}
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[var(--color-stone-600)]">
      <span className="min-w-0">{label}</span>
      <span className="text-[var(--color-stone-900)] font-semibold tabular-nums shrink-0">
        {value}
      </span>
    </div>
  );
}
