"use client";

import { useId, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";

import { convertPrice, formatCurrency } from "@/lib/currency";
import { useCurrency } from "@/app/context/CurrencyContext";
/* 🛡️ PHASE 10G — locale-aware uyarı metni. `locale` OPSİYONEL, default
   "tr" → TR çıktısı BİREBİR AYNI. Ücret/kural hesabı DEĞİŞMEDİ. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";

/* ===============================================================
   🛡️ ShortStayFeeNotice — kısa süreli konaklama ücreti uyarı kartı
   ===============================================================
   AMAÇ:
     "Sezon Fiyatları" bölümünün hemen altında, PriceList'ten TAMAMEN
     bağımsız bir uyarı kartı. `villa.cleaning_limit` gece sayısının
     ALTINDAKİ konaklamalarda ekstra "kısa süreli konaklama ücreti"
     (= villa.cleaning_fee) uygulandığını bildirir. Bu kural zaten
     `lib/price.engine.ts` içinde (nights < cleaning_limit) canlı —
     burada YENİ bir hesap/kural YOK, yalnız mevcut villa-level
     alanların (cleaning_fee / cleaning_currency / cleaning_limit)
     salt-okunur bir bilgilendirme kartı olarak gösterimi.

   NEDEN AYRI DOSYA (PriceList.tsx DEĞİL):
     PriceList kendi kontratında "PRICING ENGINE DOKUNULMADI / mevcut
     tasarım bozulmasın" der; bu kart ise `prices` dizisinden bağımsız
     olarak (sezon fiyatı olmasa bile) görünmesi gerekiyor ve tamamen
     farklı bir görsel dil (kırmızı uyarı) taşıyor — PriceList'e sıfır
     risk için ayrı, kendi kendine yeten bir component.

   VERİ KAYNAĞI (hardcode YOK):
     - `cleaningFee`      ← villa.cleaning_fee
     - `cleaningCurrency` ← villa.cleaning_currency
     - `cleaningLimit`    ← villa.cleaning_limit
     Üçü de caller'da (page.tsx) zaten mevcut `villa` objesinden
     geliyor — ek DB sorgusu / API / servis / repository YOK.

   GÖSTERME KURALI:
     `cleaningFee <= 0` VEYA `cleaningLimit <= 0` → component `null`
     döner (hiç render edilmez). Sahte/0 ücret asla gösterilmez.

   PARA BİRİMİ:
     `useCurrency()` + `convertPrice(fee, cleaningCurrency, currency,
     rates)` + `formatCurrency(...)` — BookingSidebar/PriceList ile
     BİREBİR AYNI yöntem; yeni dönüşüm mantığı YOK.

   ETKİLEŞİM:
     Tüm kart tek bir <button> (native focus/klavye desteği ücretsiz
     gelir):
       - Desktop: hover VEYA klavye focus ile bilgi paneli açılır.
       - Mobile (hover yok): dokunma → click event → toggle aç/kapa.
       - Escape (odaktayken) → kapanır.
       - aria-expanded + aria-controls + aria-label mevcut.
     Panel absolute DEĞİL — kart altında normal doküman akışında
     açılır (PriceList'in çok-satırlı listesindeki "layout jump"
     riski burada yok — tek, sayfanın altına yakın olmayan kart).

   ANİMASYON:
     Hafif, sürekli bir "glow" nabzı — yalnız
     `@media (prefers-reduced-motion: no-preference)` içinde
     tanımlanır (PriceList'teki scoped <style> yöntemiyle BİREBİR
     aynı teknik: animasyon property'si yalnız bu media query
     içinde set edilir → reduced-motion tercihinde hiç uygulanmaz).
     Agresif değil: 2.8s yavaş, ease-in-out, düşük kontrastlı,
     sürekli ama göz yormayan bir box-shadow nabzı.
   =============================================================== */

export default function ShortStayFeeNotice({
  cleaningFee,
  cleaningCurrency,
  cleaningLimit,
  locale,
}: {
  /** Villa-level temizlik/kısa-konaklama ücreti. <= 0 → render yok. */
  cleaningFee?: number | null;
  /** Ücretin orijinal para birimi (örn. "TRY", "EUR"). */
  cleaningCurrency?: string | null;
  /** Bu gece sayısının ALTI kısa süreli sayılır. <= 0 → render yok. */
  cleaningLimit?: number | null;
  /** 🛡️ PHASE 10G — opsiyonel; verilmezse "tr" (eski davranış). */
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  const { currency, rates } = useCurrency();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const hasFee =
    typeof cleaningFee === "number" &&
    Number.isFinite(cleaningFee) &&
    cleaningFee > 0;

  const hasLimit =
    typeof cleaningLimit === "number" &&
    Number.isFinite(cleaningLimit) &&
    cleaningLimit > 0;

  /* Sahte/0 ücret gösterme — ikisinden biri yoksa kart hiç yok. */
  if (!hasFee || !hasLimit) {
    return null;
  }

  const convertedFee = convertPrice(
    cleaningFee as number,
    cleaningCurrency || "TRY",
    currency,
    rates
  );

  return (
    <div className="mt-4">
      {/* 🛡️ Scoped animasyon — yalnız bu component (globals.css'e
          dokunulmadı; class isimleri (ssfn-*) proje genelinde eşsiz). */}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .ssfn-pulse {
            animation: ssfn-pulse-kf 2.8s ease-in-out infinite;
          }
          .ssfn-panel-in {
            animation: ssfn-panel-in-kf 200ms ease-out both;
          }
        }
        @keyframes ssfn-pulse-kf {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.16), 0 14px 32px -22px rgba(220, 38, 38, 0.35);
          }
          50% {
            box-shadow: 0 0 0 7px rgba(220, 38, 38, 0), 0 14px 32px -18px rgba(220, 38, 38, 0.45);
          }
        }
        @keyframes ssfn-panel-in-kf {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={formatDictionaryString(dict.shortStay.ariaLabel, {
          n: cleaningLimit,
        })}
        className="
          ssfn-pulse
          group/notice relative w-full text-left overflow-hidden
          rounded-2xl border border-red-200
          bg-gradient-to-br from-red-50 via-white to-red-50/50
          px-4 py-4 md:px-5 md:py-5
          transition-[border-color,box-shadow] duration-300
          hover:border-red-300
          hover:shadow-[0_16px_36px_-24px_rgba(220,38,38,0.4)]
          focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60
        "
      >
        {/* İnce üst accent çizgisi — kırmızı ana renk, mavi ince
            destek (marka imzasının bu uyarı kartındaki karşılığı). */}
        <span
          aria-hidden="true"
          className="absolute inset-x-5 top-0 h-[2.5px] rounded-full bg-gradient-to-r from-red-500 via-red-400/60 to-[#0973BA]/50"
        />

        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600"
          >
            <AlertTriangle size={16} strokeWidth={2} />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] md:text-[14.5px] leading-relaxed font-medium text-red-900">
              {formatDictionaryString(dict.shortStay.body, {
                n: cleaningLimit,
              })}
            </p>
            <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-red-500/80">
              {dict.shortStay.hint}
            </span>
          </div>

          <ChevronDown
            aria-hidden="true"
            size={16}
            className={
              "mt-1 shrink-0 text-red-400 transition-transform duration-200 motion-reduce:transition-none " +
              (open ? "rotate-180" : "rotate-0")
            }
          />
        </div>
      </button>

      {open && (
        <div
          id={panelId}
          role="note"
          className="ssfn-panel-in mt-2.5 rounded-2xl border border-red-100 bg-white p-4 shadow-[0_18px_40px_-24px_rgba(220,38,38,0.28)]"
        >
          <p className="font-display text-xl font-bold text-red-600 tabular-nums">
            {formatCurrency(convertedFee, currency, locale ?? "tr")}
          </p>
        </div>
      )}
    </div>
  );
}
