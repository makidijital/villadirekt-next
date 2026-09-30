import Section from "@/app/components/admin/villa-form/shared/Section";
import Label from "@/app/components/admin/villa-form/shared/Label";
import Row from "./shared/Row";

import {
  shouldDisplayDamageDeposit,
  formatDamageDepositTRY,
  DAMAGE_DEPOSIT_NOTE,
} from "@/lib/damage-deposit.helper";

import type {
  ReservationFormShape,
  ReservationFormSetter,
  ReservationFormErrors,
  ReservationPriceDetail,
  ReservationPaymentDisplay,
  SelectedVillaMeta,
} from "./types";

/* ===============================================================
   🔥 PriceStep — Wizard Adım 6.
   - "Özel fiyat kullan" toggle
   - Custom price flow (manuel total + custom note + summary)
   - Normal flow (read-only total, priceDetail summary, foreign currency cards)
   - Damage deposit info card
   Pure presentational. Tüm hesap (priceDetail, payment helper
   çıktıları) page tarafında üretilir; bu component yalnız render eder.

   onCustomToggle prop: page'in toggle handler'ını çağırır
   (state'in nötrlenmesi/restorasyonu page sorumluluğunda).
   =============================================================== */

export default function PriceStep({
  data,
  setData,
  errors,
  priceDetail,
  payment,
  payNowLabel,
  hasForeignCurrency,
  totalTRYDisplay,
  cleaningTRYDisplay,
  poolHeatingTRYDisplay = 0,
  stayTRYDisplay,
  selectedVilla,
  onCustomToggle,
  onPoolHeatingToggle,
  poolHeatingActiveForRange = true,
}: {
  data: ReservationFormShape;
  setData: ReservationFormSetter;
  errors: ReservationFormErrors;
  priceDetail: ReservationPriceDetail | null;
  payment: ReservationPaymentDisplay;
  payNowLabel: string;
  hasForeignCurrency: boolean;
  totalTRYDisplay: number;
  cleaningTRYDisplay: number;
  /** 🔥 HAVUZ ISITMA — uçtan uca tamamlama turu. Opsiyonel (default 0):
   *  bu component'i çağıran her yer aynı anda güncellenmek zorunda
   *  kalmasın (byte-identical geriye dönük uyum). */
  poolHeatingTRYDisplay?: number;
  stayTRYDisplay: number;
  selectedVilla: SelectedVillaMeta | null;
  onCustomToggle: () => void;
  /** 🔥 HAVUZ ISITMA checkbox handler — opsiyonel; verilmezse checkbox
   *  render edilmez (geriye dönük uyum, caller güncellenmemişse UI
   *  sessizce eskisi gibi kalır). */
  onPoolHeatingToggle?: () => void;
  /** 🛡️ Migration 076 — sezonluk ay kısıtı. Villanın gerçek
   *  pool_heating_months'una göre seçilen tarih aralığı sezon
   *  dışındaysa toggle HİÇ GÖSTERİLMEZ. Default true — page bu
   *  prop'u geçmezse eski davranış (yalnız fee>0 kontrolü) korunur. */
  poolHeatingActiveForRange?: boolean;
}) {
  return (
    <Section
      eyebrow="Adım 3"
      title="Fiyat bilgisi"
      subtitle="Sezon fiyatlarına göre otomatik hesaplanır"
    >
      {/* 🔥 CUSTOM PRICE TOGGLE */}
      <div className="flex items-center justify-between bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] rounded-2xl px-4 py-3 mb-4">
        <div>
          <p className="text-sm font-medium text-[var(--color-stone-900)]">
            Özel fiyat kullan
          </p>
          <p className="text-xs text-[var(--color-stone-500)] mt-0.5">
            Sezon fiyatları yerine manuel toplam tutar gir
          </p>
        </div>
        <button
          type="button"
          onClick={onCustomToggle}
          className={`relative w-11 h-6 rounded-full transition shrink-0 ${
            data.custom_price
              ? "bg-[var(--color-champagne-500)]"
              : "bg-[var(--color-stone-200)]"
          }`}
          aria-label="Özel fiyat aç/kapa"
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
              data.custom_price ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {/* 🔥 CUSTOM PRICE BLOCK */}
      {data.custom_price && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Özel toplam tutar (TRY)</Label>
            <input
              type="number"
              value={data.total_price_try || data.total_price || 0}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                setData({
                  ...data,
                  total_price: v,
                  total_price_try: v,
                  // custom override — multi-currency nötr
                  original_price: 0,
                  original_currency: "TRY",
                  original_cleaning_fee: 0,
                  original_cleaning_currency: "TRY",
                  cleaning_fee_try: 0,
                  exchange_rate: 1,
                });
              }}
              className="input"
              min={0}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Özel fiyat notu</Label>
            <textarea
              value={data.custom_price_note || ""}
              onChange={(e) =>
                setData({
                  ...data,
                  custom_price_note: e.target.value,
                })
              }
              placeholder="Bu fiyatın nedeni (opsiyonel)"
              className="input !rounded-2xl !p-4 min-h-[100px] resize-none"
            />
          </div>

          {/* CUSTOM SUMMARY */}
          <div className="relative bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] rounded-2xl p-5 space-y-3 text-sm mt-2">
            <span
              aria-hidden="true"
              className="absolute inset-x-4 top-0 h-[2.5px] rounded-full bg-gradient-to-r from-[#ED7926] via-[#ED7926]/50 to-[#0973BA]"
            />
            <div className="border-t border-[var(--color-sand-100)] pt-3">
              <div className="flex items-center justify-between rounded-xl bg-green-50/70 px-3 py-2.5">
                <span className="font-semibold text-green-800">Toplam Tutar</span>
                <span className="font-display text-lg font-bold text-green-700 tabular-nums">
                  ₺
                  {Number(data.total_price_try || 0).toLocaleString(
                    "tr-TR",
                    { maximumFractionDigits: 0 }
                  )}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-purple-100 bg-purple-50/60 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-500">
                  {payNowLabel}
                </p>
                <p className="mt-0.5 font-display text-base font-bold text-purple-700 tabular-nums">
                  ₺
                  {Number(payment.payNow).toLocaleString("tr-TR", {
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>
              <div className="rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500">
                  {payment.isFullPayment ? "Kalan" : "Girişte ödenecek"}
                </p>
                <p className="mt-0.5 font-display text-base font-bold text-orange-600 tabular-nums">
                  ₺
                  {Number(payment.remainingOnArrival).toLocaleString(
                    "tr-TR",
                    { maximumFractionDigits: 0 }
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 NORMAL FLOW — sadece custom_price kapalıysa */}
      {!data.custom_price && (
        <>
          {/* 🔥 HAVUZ ISITMA — yalnız villanın gecelik ücreti varsa
              gösterilir (public BookingSidebar ile aynı gating kuralı:
              pool_heating_fee > 0). Seçim `data.pool_heating_selected`'e
              yazılır; gerçek tutar (pool_heating_total_try) page'in
              price-calc effect'i tarafından calculateGrandTotal ile
              server-authoritative villa ücretinden türetilir — burada
              hesap YAPILMAZ. */}
          {onPoolHeatingToggle &&
            typeof selectedVilla?.pool_heating_fee === "number" &&
            selectedVilla.pool_heating_fee > 0 &&
            poolHeatingActiveForRange && (
              <div className="flex items-center justify-between bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] rounded-2xl px-4 py-3 mb-4">
                <div>
                  {/* 🛡️ Metin standardizasyonu turu: "Havuz Isıtma" →
                      "Havuz Isıtma Ücreti" — satır alttaki subtitle'da
                      ücret tutarı gösterdiği için ücret ifade eden bir
                      toggle başlığı (yalnız metin — toggle/hesap DEĞİŞMEDİ). */}
                  <p className="text-sm font-medium text-[var(--color-stone-900)]">
                    Havuz Isıtma Ücreti
                  </p>
                  <p className="text-xs text-[var(--color-stone-500)] mt-0.5">
                    {poolHeatingTRYDisplay > 0
                      ? `Gece başına ücret dahil — ₺${Number(
                          poolHeatingTRYDisplay
                        ).toLocaleString("tr-TR", {
                          maximumFractionDigits: 0,
                        })}`
                      : "Tarih seçildiğinde gece sayısına göre hesaplanır"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onPoolHeatingToggle}
                  className={`relative w-11 h-6 rounded-full transition shrink-0 ${
                    data.pool_heating_selected
                      ? "bg-[var(--color-champagne-500)]"
                      : "bg-[var(--color-stone-200)]"
                  }`}
                  aria-label="Havuz ısıtma aç/kapa"
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                      data.pool_heating_selected ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            )}

          {/* 🔥 READ-ONLY TOTAL — pricing engine üretir */}
          <div className="space-y-1.5">
            <Label>Toplam tutar (TRY)</Label>
            <div className="input bg-[var(--color-sand-50)] text-[var(--color-stone-700)] flex items-center justify-between cursor-not-allowed select-none">
              <span>
                ₺
                {Number(
                  data.total_price_try || data.total_price || 0
                ).toLocaleString("tr-TR", {
                  maximumFractionDigits: 0,
                })}
              </span>
              <span className="text-[10px] tracking-[0.12em] uppercase text-[var(--color-stone-400)]">
                Otomatik
              </span>
            </div>
          </div>

          {priceDetail && (
            <div className="relative bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] rounded-2xl p-5 space-y-3 text-sm mt-4">
              <span
                aria-hidden="true"
                className="absolute inset-x-4 top-0 h-[2.5px] rounded-full bg-gradient-to-r from-[#ED7926] via-[#ED7926]/50 to-[#0973BA]"
              />
              {/* 🔥 EXTRA INFO — sadece dövizli rezervasyonlarda */}
              {hasForeignCurrency && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  {/* ORJINAL TOPLAM */}
                  {Number(data.original_price) > 0 &&
                    data.original_currency !== "TRY" && (
                      <div className="rounded-2xl border border-[var(--color-champagne-200)] bg-[var(--color-champagne-50)] px-4 py-4 shadow-sm">
                        <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--color-champagne-700)]">
                          Orijinal Toplam
                        </div>
                        <div className="mt-2 text-[var(--color-stone-900)] font-bold text-xl">
                          {Number(
                            data.original_price || 0
                          ).toLocaleString("tr-TR", {
                            maximumFractionDigits: 0,
                          })}{" "}
                          {data.original_currency}
                        </div>
                        <div className="text-xs text-[var(--color-stone-500)] mt-1">
                          Rezervasyon anındaki döviz toplamı
                        </div>
                      </div>
                    )}

                  {/* ORJINAL TEMIZLIK */}
                  {Number(data.original_cleaning_fee) > 0 &&
                    data.original_cleaning_currency !== "TRY" && (
                      <div className="rounded-2xl border border-[var(--color-sand-200)] bg-[var(--color-sand-100)] px-4 py-4 shadow-sm">
                        <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--color-stone-600)]">
                          Orijinal Temizlik
                        </div>
                        <div className="mt-2 text-[var(--color-stone-900)] font-bold text-xl">
                          {Number(
                            data.original_cleaning_fee || 0
                          ).toLocaleString("tr-TR", {
                            maximumFractionDigits: 0,
                          })}{" "}
                          {data.original_cleaning_currency}
                        </div>
                        <div className="text-xs text-[var(--color-stone-500)] mt-1">
                          Döviz bazlı temizlik ücreti
                        </div>
                      </div>
                    )}

                  {/* KUR */}
                  {Number(data.exchange_rate) > 1 && (
                    <div className="rounded-2xl border border-[var(--color-stone-200)] bg-white px-4 py-4 shadow-sm">
                      <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--color-stone-500)]">
                        Kur Sabitlendi
                      </div>
                      <div className="mt-2 text-[var(--color-stone-900)] font-bold text-xl">
                        {Number(data.exchange_rate || 0).toFixed(2)}
                      </div>
                      <div className="text-xs text-[var(--color-stone-500)] mt-1">
                        Rezervasyon anındaki kur
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Row
                label="Gece"
                value={`${priceDetail.nights ?? 0} gece`}
              />

              {/* 🔥 KONAKLAMA — TRY karşılığı */}
              <Row
                label="Konaklama"
                value={`₺${Number(stayTRYDisplay).toLocaleString(
                  "tr-TR",
                  { maximumFractionDigits: 0 }
                )}`}
              />

              {/* 🔥 TEMİZLİK — TRY karşılığı.
                  🛡️ Metin standardizasyonu: "Temizlik" → "Kısa Süreli
                  Konaklama Ücreti" — public BookingSummary.tsx/
                  ReservationForm.tsx ile AYNI terminoloji. Değer DEĞİŞMEDİ. */}
              {Number(priceDetail.cleaning) > 0 && (
                <Row
                  label="Kısa Süreli Konaklama Ücreti"
                  value={`₺${Number(cleaningTRYDisplay).toLocaleString(
                    "tr-TR",
                    { maximumFractionDigits: 0 }
                  )}`}
                />
              )}

              {/* 🔥 HAVUZ ISITMA — yalnız seçiliyse ve tutar > 0 ise.
                  🛡️ Metin standardizasyonu turu: "Havuz Isıtma" →
                  "Havuz Isıtma Ücreti" (yalnız label metni). */}
              {!!data.pool_heating_selected && poolHeatingTRYDisplay > 0 && (
                <Row
                  label="Havuz Isıtma Ücreti"
                  value={`₺${Number(poolHeatingTRYDisplay).toLocaleString(
                    "tr-TR",
                    { maximumFractionDigits: 0 }
                  )}`}
                />
              )}

              {/* TOTAL — BookingSummary.tsx ile AYNI: yeşil, yumuşak
                  zeminli, vurgulu satır (daha belirgin). totalTRYDisplay
                  DEĞİŞMEDİ. */}
              <div className="border-t border-[var(--color-sand-100)] pt-3">
                <div className="flex items-center justify-between rounded-xl bg-green-50/70 px-3 py-2.5">
                  <span className="font-semibold text-green-800">Toplam Tutar</span>
                  <span className="font-display text-lg font-bold text-green-700 tabular-nums">
                    ₺
                    {Number(totalTRYDisplay).toLocaleString("tr-TR", {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
              </div>

              {/* PAY NOW (mor) + REMAINING ON ARRIVAL (turuncu) —
                  BookingSummary.tsx ile AYNI iki ayrı vurgu kutusu.
                  payment_preference dalı BİREBİR AYNI (dal DEĞİŞMEZ) —
                  yalnız görsel olarak BookingSummary'nin kutu tasarımına
                  uyarlandı. */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-purple-100 bg-purple-50/60 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-500">
                    {payNowLabel}
                  </p>
                  <p className="mt-0.5 font-display text-base font-bold text-purple-700 tabular-nums">
                    ₺
                    {Number(payment.payNow).toLocaleString("tr-TR", {
                      maximumFractionDigits: 0,
                    })}
                  </p>
                </div>
                <div className="rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500">
                    {payment.isFullPayment ? "Kalan" : "Girişte ödenecek"}
                  </p>
                  <p className="mt-0.5 font-display text-base font-bold text-orange-600 tabular-nums">
                    ₺
                    {Number(payment.remainingOnArrival).toLocaleString(
                      "tr-TR",
                      { maximumFractionDigits: 0 }
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {errors.total_price_try && (
        <p className="text-xs text-red-500 mt-2">
          {errors.total_price_try}
        </p>
      )}

      {/* 🔥 DAMAGE DEPOSIT — readonly info; accounting'e dahil değil
          villa.deposit'ten snapshot olarak insert'e yazılır */}
      {shouldDisplayDamageDeposit(selectedVilla?.deposit) && (
        <div className="mt-4 rounded-2xl border border-[var(--color-stone-100)] bg-white px-4 py-3">
          <p className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)]">
            Hasar Depozitosu
          </p>
          <p className="font-display text-lg text-[var(--color-stone-900)] mt-1 tabular-nums">
            {formatDamageDepositTRY(selectedVilla?.deposit)}
          </p>
          <p className="text-[11px] text-[var(--color-stone-500)] mt-1">
            {DAMAGE_DEPOSIT_NOTE}
          </p>
        </div>
      )}
    </Section>
  );
}
