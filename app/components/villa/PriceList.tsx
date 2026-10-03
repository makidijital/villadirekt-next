"use client";

import { useState } from "react";
import { Moon, ShieldCheck, Info } from "lucide-react";

import { convertPrice, formatCurrency } from "@/lib/currency";
import { useCurrency } from "@/app/context/CurrencyContext";
import { formatDateForLocale, parseLocalDate, formatLocalDate } from "@/lib/date-format";
import { applyDiscountToDailyPrice, type DiscountRange } from "@/lib/price.engine";
/* 🛡️ PHASE 10B — locale-aware UI stringleri + tarih formatı.
   `locale` opsiyonel, default "tr". `formatDateForLocale(x,"tr")`
   `formatDateTr(x)` ile BYTE-IDENTICAL çıktı üretir (AYNI Istanbul-
   offset + AYNI ay kısaltmaları) — bu yüzden eski `formatDateTr`
   import'u bu dosyada bu locale-aware karşılığıyla DEĞİŞTİRİLDİ;
   `lib/date-format.ts`'teki `formatDateTr`'nin KENDİSİ DOKUNULMADI,
   diğer TÜM çağıranları (mail/voucher/admin) etkilenmez. price.engine
   fonksiyonlarına (`applyDiscountToDailyPrice` vb.) DOKUNULMADI. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ PriceList — EDITORIAL LIST (klasik kart/tablo DEĞİL)
   ===============================================================
   Her sezon ince bir border-bottom ile ayrılan yatay bir satır:
   solda büyük/güçlü tipografiyle tarih aralığı, sağda (aynı stille
   korunan) fiyat + kompakt bir "Bilgi" toggle. Bilgi paneli hover
   (desktop) veya tap (mobile — hover yok) ile açılır; absolute
   positioned popover olduğu için satırlar YER DEĞİŞTİRMEZ (layout
   jump yok).

   PRICING ENGINE DOKUNULMADI:
     - `convertPrice(price, currency, target, rates)` — AYNEN
     - `formatCurrency(value, currency)` — AYNEN
     - `useCurrency()` context — AYNEN
     - prices array sırası — service `start_date ASC` korunur
     - `Price` shape (id, start_date, end_date, price, currency) —
       birebir aynı; map iterasyonu aynı
     - Fiyat gösterimi (büyük rakam + "Gecelik" caption) AYNEN —
       yalnız satır içindeki KONUMU ve GÖRSEL stili değişti.

   MIN STAY KAYNAĞI (değişmedi):
     `props.minimumStayNights` — villa-level field
     (`villa.minimum_stay_nights`). Yeni hesap YOK; mevcut
     BookingSidebar `minimum_stay_nights` prop'u ile aynı kaynak.
     null/0 → Bilgi panelinde satır gösterilmez.

   DEPOZİTO (yeni prop, mevcut veri):
     `props.deposit` — villa-level field (`villa.deposit`), TRY
     cinsinden DB'de tutuluyor (bkz. useBookingEngine.ts:
     `convertPrice(deposit, "TRY", currency, rates)`). AYNI
     dönüşüm burada birebir tekrarlanıyor — yeni DB alanı / yeni
     hesap YOK, sadece BookingSidebar'ın zaten kullandığı villa-level
     depozito değeri, aynı yöntemle bu bilgi panelinde de gösteriliyor.
     null/0/negatif → Bilgi panelinde satır gösterilmez.

   TARIH FORMATI:
     `formatDateTr` (lib/date-format) → "11 May 2026" formatı.

   🛡️ GÖRSEL REVİZYON (yalnız bu tur — data/state/handler DEĞİŞMEDİ):
     - Ana kart: sade beyazdan, çok hafif sıcak gradient zemin + ince
       turuncu→mavi üst accent çizgisi + iki-tonlu (turuncu/mavi) soft
       ambient box-shadow'a geçti. Container'a `overflow-hidden`
       BİLEREK eklenmedi — Bilgi popover'ı (son satırda) absolute
       olarak container sınırının altına taşabilir, kırpılmamalı.
     - Her sezon satırı artık kendi ince border'ı + sol turuncu→mavi
       accent çubuğu olan ayrı bir "satır kartı"; hover'da hafif
       yükselir (translateY) ve iki-tonlu glow şiddetlenir.
     - Fiyat rakamı: font-bold + `#ED7926`, bir kademe büyütüldü.
     - Tarih: takvim ikonu artık mavi tonlu bir rozet içinde; tire
       ayracı turuncu tonda ince bir vurgu.
     - Bilgi butonu ve popover paneli aynı iki-tonlu palete taşındı;
       popover'ın konumlanması/instant-toggle davranışı DEĞİŞMEDİ,
       yalnız açılışta çok hafif fade+scale animasyonu eklendi.
     - Satır girişinde hafif stagger fade/translate animasyonu
       (`idx * 70ms` gecikme) — yalnızca dekoratif, veri/sıralamaya
       dokunmuyor.
     - Tüm özel animasyonlar `@media (prefers-reduced-motion:
       no-preference)` guard'lı; Tailwind `motion-reduce:` varyantları
       hover transform'ları da reduced-motion'da sıfırlıyor.
     - Animasyon/keyframe'ler yalnız bu dosyada scoped `<style>` ile —
       globals.css'e dokunulmadı.
   =============================================================== */

type Price = {
  id: string;
  start_date: string;
  end_date: string;
  price: number;
  currency: string;
};

/* ===============================================================
   🛡️ SEZON FİYATI İÇİNE İNDİRİM ARALIĞI YERLEŞTİRME (bu tur)
   ===============================================================
   AMAÇ: Villa detay sayfasındaki "Sezon Fiyatları" listesine, admin'in
   girdiği villa_discounts kayıtlarını (varsa) kronolojik konumuna
   YERLEŞTİRMEK — normal sezon fiyatlarının hesaplama mantığı, DB
   kaydı, price.engine davranışı veya rezervasyon akışı HİÇ
   değişmedi. Bu tamamen SUNUM KATMANI bölme işlemi:

     Sezon:    1 - 31 Ekim → 5.000₺
     İndirim:  8 - 15 Ekim → 3.000₺
     Sonuç:    1-7 Ekim (5.000₺) · 8-15 Ekim (3.000₺, İNDİRİMLİ) ·
               16-31 Ekim (5.000₺)

   TARİH SEMANTİĞİ: villa_discounts.start_date/end_date, villa_prices
   ile AYNI "kapalı interval" semantiğine sahip (bkz.
   formatDiscountDateRangeTr yorumu, lib/date-format.ts) — start_date
   ve end_date DAHİL. Bölme algoritması bunu birebir uygular:
   indirimden önceki parça `discount.start_date - 1 gün`de biter,
   sonraki parça `discount.end_date + 1 gün`de başlar.

   ÇAKIŞMA: villa_discounts kayıtları DB seviyesinde ÇAKIŞMAZ (mevcut
   constraint) — bu yüzden ekstra bir çakışma-çözme sistemi YOK;
   birden fazla indirim aynı sezona düşerse (üst üste binmeden) sırayla
   işlenir.

   FİYAT HESABI: her segment'in fiyatı, mevcut `convertPrice` +
   `applyDiscountToDailyPrice` (lib/price.engine.ts, DEĞİŞTİRİLMEDİ)
   ile hesaplanır — VillaCard'ın discount variant'ının kullandığı AYNI
   fonksiyon. Yeni bir fiyat hesaplama sistemi YAZILMADI.

   Bu fonksiyon PriceList'in DIŞINDA (module-level, saf/pure) —
   component'in render'ından bağımsız test edilebilir, hook'lara
   bağımlı değil. */
type PriceSegment = {
  key: string;
  start_date: string;
  end_date: string;
  price: number;
  currency: string;
  discount: DiscountRange | null;
};

/** "YYYY-MM-DD" + gün farkı → "YYYY-MM-DD" (LOCAL takvim aritmetiği,
 *  parseLocalDate/formatLocalDate ile — TZ kaymasız). Invalid input →
 *  değiştirilmeden geri döner (defansif; caller zaten geçerli
 *  start_date/end_date ile çağırır). */
function addLocalDays(dateStr: string, delta: number): string {
  const d = parseLocalDate(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + delta);
  return formatLocalDate(d);
}

/** İki "YYYY-MM-DD" tarihini LOCAL takvim günü olarak karşılaştırır.
 *  -1: a < b, 0: eşit, 1: a > b. Invalid input → 0 (no-op sıralama). */
function compareLocalDates(a: string, b: string): number {
  const da = parseLocalDate(a).getTime();
  const db = parseLocalDate(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  if (da === db) return 0;
  return da < db ? -1 : 1;
}

/** Sezon fiyatlarını (prices), varsa örtüşen indirim aralıklarıyla
 *  (discounts) kronolojik segment'lere böler. İndirim yoksa veya hiç
 *  örtüşme yoksa, her price BİREBİR tek bir segment olarak döner
 *  (mevcut davranışla %100 aynı görünüm). */
function buildSeasonSegments(
  prices: Price[],
  discounts: DiscountRange[]
): PriceSegment[] {
  const segments: PriceSegment[] = [];

  for (const p of prices) {
    const overlapping = discounts
      .filter(
        (d) =>
          !!d.start_date &&
          !!d.end_date &&
          compareLocalDates(d.start_date, p.end_date) <= 0 &&
          compareLocalDates(d.end_date, p.start_date) >= 0
      )
      .slice()
      .sort((a, b) => compareLocalDates(a.start_date, b.start_date));

    if (overlapping.length === 0) {
      segments.push({
        key: p.id,
        start_date: p.start_date,
        end_date: p.end_date,
        price: p.price,
        currency: p.currency,
        discount: null,
      });
      continue;
    }

    let cursor = p.start_date;
    overlapping.forEach((d, i) => {
      const clippedStart =
        compareLocalDates(d.start_date, p.start_date) > 0
          ? d.start_date
          : p.start_date;
      const clippedEnd =
        compareLocalDates(d.end_date, p.end_date) < 0
          ? d.end_date
          : p.end_date;

      if (compareLocalDates(cursor, clippedStart) < 0) {
        segments.push({
          key: `${p.id}-pre-${i}`,
          start_date: cursor,
          end_date: addLocalDays(clippedStart, -1),
          price: p.price,
          currency: p.currency,
          discount: null,
        });
      }

      segments.push({
        key: `${p.id}-disc-${i}`,
        start_date: clippedStart,
        end_date: clippedEnd,
        price: p.price,
        currency: p.currency,
        discount: d,
      });

      cursor = addLocalDays(clippedEnd, 1);
    });

    if (compareLocalDates(cursor, p.end_date) <= 0) {
      segments.push({
        key: `${p.id}-post`,
        start_date: cursor,
        end_date: p.end_date,
        price: p.price,
        currency: p.currency,
        discount: null,
      });
    }
  }

  return segments;
}

export default function PriceList({
  prices,
  minimumStayNights = null,
  deposit = null,
  discounts = null,
  locale,
}: {
  prices: Price[];
  /* Villa-level min stay. null veya 0 → Bilgi panelinde satır yok.
     Optional + default null → eski caller'lar backward-compat çalışır. */
  minimumStayNights?: number | null;
  /* Villa-level depozito (TRY). null/0 → Bilgi panelinde satır yok.
     Optional + default null → eski caller'lar backward-compat çalışır. */
  deposit?: number | null;
  /* 🛡️ YENİ (bu tur) — villa_discounts kayıtları (aynı `DiscountRange`
     şekli, lib/price.engine.ts; homepage/VillaCard'ın zaten kullandığı
     TİP). Verilmezse/null ise (eski caller'lar, örn. /v/[token] paylaşım
     sayfası) davranış BİREBİR ESKİSİYLE aynı — hiçbir segment bölünmez,
     her sezon tek satır olarak görünür. */
  discounts?: DiscountRange[] | null;
  /* 🛡️ PHASE 10B — opsiyonel, default "tr". */
  locale?: Locale;
}) {
  const { currency, rates } = useCurrency();
  const [openId, setOpenId] = useState<string | null>(null);
  const dict = getDictionary(locale);
  const effectiveLocale = locale ?? "tr";

  /* Boş array yine de gelirse defansif fallback (caller outer'da
     zaten ternary ile koruyor; bu inner guard backward-compat). */
  if (!prices || prices.length === 0) {
    return (
      <p className="text-[var(--color-stone-400)] text-[12px] italic">
        {dict.price.noPriceInfo}
      </p>
    );
  }

  /* Bilgi panelinde gösterilecek veriler — yalnız GERÇEKTEN mevcutsa. */
  const hasMinStay =
    typeof minimumStayNights === "number" &&
    Number.isFinite(minimumStayNights) &&
    minimumStayNights > 0;

  const hasDeposit =
    typeof deposit === "number" && Number.isFinite(deposit) && deposit > 0;

  const convertedDeposit = hasDeposit
    ? convertPrice(deposit as number, "TRY", currency, rates)
    : 0;

  const hasInfo = hasMinStay || hasDeposit;

  /* 🛡️ İndirim aralıklarını sezon fiyatlarının içine kronolojik olarak
     yerleştir (bkz. buildSeasonSegments yukarıda). discounts
     verilmemişse/null ise boş dizi ile çağrılır → segments === prices
     ile birebir aynı (bölme YOK, mevcut görünüm korunur). */
  const segments = buildSeasonSegments(prices, discounts || []);

  return (
    <div
      className="
        relative mt-4 rounded-[16px]
        border border-[var(--color-stone-200)]/80
        bg-white
        shadow-[0_10px_28px_-24px_rgba(10,22,51,0.3)]
        px-4 md:px-5 py-1
      "
    >
      {/* 🛡️ Scoped animasyon — yalnız bu component. globals.css'e
          dokunulmadı; class isimleri (pl-*) proje genelinde eşsiz. */}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .pl-row-in {
            animation: pl-row-in-kf 500ms cubic-bezier(0.16, 1, 0.3, 1) both;
          }
          .pl-popover-in {
            animation: pl-popover-in-kf 180ms ease-out both;
          }
        }
        @keyframes pl-row-in-kf {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pl-popover-in-kf {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* 🛡️ LAYOUT-ONLY: sezon satırları artık desktop'ta 2 kolonlu grid
          içinde (mobile: 1 kolon). Sıra korunur (1→sol, 2→sağ, 3→sol...)
          — bu salt CSS grid akışı, prices array sırası/verisi/hesabı
          DEĞİŞMEDİ. Satır kartlarının kendi tasarımı (border/radius/
          padding/font/ikon/fiyat/tarih/GECELİK/Bilgi/hover) AYNEN
          korunur; yalnız aralarındaki dikey margin (mt-3 first:mt-0)
          grid `gap` ile değiştirildi (çift boşluk oluşmasın diye). */}
      {/* 🔄 LİSTE — her dönem TEK satır, dönemler ALT ALTA (ince
          ayraçlarla). Sıra/veri/hesap AYNEN; yalnız sunum değişti. */}
      <div className="divide-y divide-[var(--color-stone-100)]">
        {segments.map((seg, idx) => {
        /* Currency conversion — eski mantık AYNEN (segment artık
           `Price` satırının kendisi ya da onun indirimle bölünmüş bir
           alt-parçası olabilir; her iki durumda da fiyat/currency alanları
           AYNI `convertPrice` çağrısından geçer). */
        const convertedPrice = convertPrice(
          Number(seg.price || 0),
          seg.currency || "TRY",
          currency,
          rates
        );
        /* 🛡️ İNDİRİMLİ SEGMENT (bu tur) — seg.discount yalnız bu segment
           bir villa_discounts kaydıyla örtüşüyorsa dolu olur (bkz.
           buildSeasonSegments). İndirimli fiyat MEVCUT price.engine
           fonksiyonu `applyDiscountToDailyPrice` ile hesaplanır — VillaCard
           discount variant'ının KULLANDIĞI AYNI fonksiyon, yeni bir fiyat
           hesaplama mantığı YOK. */
        const discountedResult = seg.discount
          ? applyDiscountToDailyPrice(
              {
                converted: convertedPrice,
                original: Number(seg.price || 0),
                original_currency: seg.currency || "TRY",
              },
              seg.discount,
              currency,
              rates
            )
          : null;
        const isDiscounted =
          !!seg.discount &&
          !!discountedResult &&
          discountedResult.converted < convertedPrice;
        /* Badge yüzdesi — SABIT DEĞİL, VillaCard'daki discountBadgePercent
           ile AYNI desen: percent tipte discount_value doğrudan, fixed
           tipte gerçek farkın yüzdesi. Hesaplanamazsa badge yüzdesiz
           gösterilir (rakam uydurulmaz). */
        const discountPercent = (() => {
          if (!isDiscounted || !seg.discount || !discountedResult) return null;
          if (seg.discount.discount_type === "percent") {
            const pct = Math.round(Number(seg.discount.discount_value) || 0);
            return pct > 0 ? pct : null;
          }
          if (convertedPrice > 0) {
            const pct = Math.round(
              ((convertedPrice - discountedResult.converted) / convertedPrice) * 100
            );
            return pct > 0 ? pct : null;
          }
          return null;
        })();
        const isOpen = openId === seg.key;
        /* Son sezon satırı — popover'ı yukarı doğru aç (aşağıda
           içerik/viewport sonu olabilir). Salt render-time hesap;
           yeni state veya JS ölçüm YOK. */
        const isLastRow = idx === segments.length - 1;

        return (
          <div
            key={seg.key}
            className={
              "pl-row-in group/row relative " +
              (isDiscounted ? "py-3 " : "py-1 ") +
              /* 🔄 İNDİRİMLİ dönem — tüm satır kutusu #008F3B (düz renk,
                 soft border, gradient/ağır gölge YOK). Normal satırlar
                 AYNEN beyaz. */
              (isDiscounted
                ? "my-1.5 -mx-2 px-3 rounded-[12px] border border-[#007A33] bg-[#008F3B] "
                : "") +
              /* 🛡️ Açık olan satır (isOpen) her zaman diğer satırların
                 üstünde kalsın diye EXPLICIT z-index — auto DEĞİL, bu
                 yüzden satır kendi stacking context'ini garanti kurar
                 (hover-transform'un tesadüfen oluşturduğu context'e
                 bağımlı kalmadan). */
              (isOpen ? "z-20" : "z-0")
            }
            style={{ animationDelay: `${idx * 70}ms` }}
          >
            <div className="flex items-center justify-between gap-3 md:gap-6">
              {/* LEFT — 🔴 bilgi butonu (varsa) + tarih aralığı. */}
              <div className="min-w-0 flex items-center gap-2.5">
              {/* BILGI — yalnız gösterilecek gerçek veri varsa render
                  edilir. Desktop: hover ile açılır/kapanır. Mobile
                  (hover yok): tap ile toggle. Panel absolute
                  positioned → satır yüksekliği değişmez, layout
                  zıplamaz. */}
              {hasInfo && (
                <div
                  className="relative shrink-0"
                  onMouseEnter={() => setOpenId(seg.key)}
                  onMouseLeave={() =>
                    setOpenId((cur) => (cur === seg.key ? null : cur))
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenId((cur) => (cur === seg.key ? null : seg.key))
                    }
                    aria-expanded={isOpen}
                    aria-label={dict.price.infoAriaLabel}
                    className={
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-1.5 text-[12px] font-semibold tracking-wide transition-all duration-200 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 " +
                      (isDiscounted ? "bg-white " : "") +
                      (isOpen
                        ? "border-red-300 bg-red-50 text-red-600"
                        : "border-red-200 text-red-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600")
                    }
                  >
                    <Info size={12} strokeWidth={2} aria-hidden />
                  </button>

                  {isOpen && (
                    <div
                      role="note"
                      className={
                        "pl-popover-in absolute left-0 z-20 w-60 overflow-hidden rounded-2xl border border-[var(--color-stone-100)] bg-white p-4 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.28)] " +
                        (isLastRow ? "bottom-full mb-2" : "top-full mt-2")
                      }
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 top-0 h-[2.5px] bg-brand "
                      />
                      <ul className="mt-1 space-y-2.5">
                        {hasMinStay && (
                          <li className="flex items-center gap-2.5 text-[12px] text-[var(--color-stone-700)]">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent/10 text-brand shrink-0">
                              <Moon size={12} strokeWidth={1.9} aria-hidden />
                            </span>
                            {formatDictionaryString(dict.price.minNights, {
                              n: minimumStayNights as number,
                            })}
                          </li>
                        )}
                        {hasDeposit && (
                          <li className="flex items-center gap-2.5 text-[12px] text-[var(--color-stone-700)]">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand/10 text-brand shrink-0">
                              <ShieldCheck size={12} strokeWidth={1.9} aria-hidden />
                            </span>
                            {formatDictionaryString(dict.price.damageDeposit, {
                              amount: formatCurrency(convertedDeposit, currency, effectiveLocale),
                            })}
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              <div
                className={
                  "min-w-0 flex flex-col " +
                  (isDiscounted ? "items-center text-center gap-0.5 text-white" : "")
                }
              >
                {/* 🏷️ İndirim metni — tarihin HEMEN üstünde, sentence case. */}
                {isDiscounted && (
                  <span className="block text-[12px] font-semibold leading-snug text-white">
                    {discountPercent !== null
                      ? formatDictionaryString(
                          dict.price.discountedBadgeWithPercent,
                          { percent: discountPercent }
                        )
                      : dict.price.discountedBadge}
                  </span>
                )}
                <p className={"min-w-0 text-[12px] font-semibold leading-snug " + (isDiscounted ? "text-white" : "text-[var(--color-stone-800)]")}>
                  <span className="tabular-nums">
                    {formatDateForLocale(seg.start_date, effectiveLocale)}
                    <span className={"mx-1.5 font-medium " + (isDiscounted ? "text-white/60" : "text-[var(--color-stone-300)]")}>
                      —
                    </span>
                    {formatDateForLocale(seg.end_date, effectiveLocale)}
                  </span>
                </p>
              </div>
              </div>

              {/* RIGHT — fiyat (indirimliyse yeşil + üstü çizili normal fiyat;
                  değilse mevcut marka turuncusu AYNEN) + kompakt Bilgi toggle. */}
              <div className="flex items-center gap-3 md:gap-4 shrink-0">
                {isDiscounted ? (
                  <div className="text-right leading-none">
                    {/* 🔄 GECELİK / eski fiyat (kırmızı, üstü çizili) / yeni fiyat */}
                    <p
                      className="text-[12px] tracking-[0.06em] uppercase text-white/85 font-medium"
                      aria-hidden
                    >
                      {dict.price.nightly}
                    </p>
                    <p className="mt-1 text-[12px] font-semibold text-[#FFB3B3] line-through decoration-[#FFB3B3] tabular-nums">
                      {formatCurrency(convertedPrice, currency, effectiveLocale)}
                    </p>
                    <p
                      className="mt-1 font-display font-bold text-[12px] text-white"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatCurrency(discountedResult!.converted, currency, effectiveLocale)}
                    </p>
                  </div>
                ) : (
                  <div className="text-right">
                    {/* 🔄 GECELİK fiyatın SOLUNDA, tek satır */}
                    <p className="flex items-baseline justify-end gap-1.5 leading-none">
                    <span
                      className="text-[12px] tracking-[0.06em] uppercase text-[var(--color-stone-400)] font-medium"
                      aria-hidden
                    >
                      {dict.price.nightly}
                    </span>
                    <span
                      className="font-display font-bold text-[12px] text-[#0A1633]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatCurrency(convertedPrice, currency, effectiveLocale)}
                    </span>
                    </p>
                  </div>
                )}

              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
