/* ===============================================================
   🔥 LiveDatePriceSummary — pure presentational
   ===============================================================
   Tarih adımının sağ kolonunda (mobile: altında) anlık fiyat
   özeti gösteren compact stat kartı. Hiçbir hesap YAPMAZ —
   tüm değerler page'in mevcut state/useEffect'lerinden hazır
   olarak gelir. calculateGrandTotal, getPaymentDisplayValues,
   exchange-rate logic, custom_price branch DOKUNULMADI.
   =============================================================== */

import { Sparkles } from "lucide-react";

const fmtTRY = (n: number) =>
  Number(n || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

export default function LiveDatePriceSummary({
  startDate,
  endDate,
  nights,
  stayTRY,
  cleaningTRY,
  poolHeatingTRY = 0,
  totalTRY,
  payNow,
  remainingOnArrival,
  payNowLabel,
  isFullPayment,
  isCustomPrice,
  hasForeignCurrency,
}: {
  startDate: Date | null;
  endDate: Date | null;
  nights: number;
  stayTRY: number;
  cleaningTRY: number;
  /** 🔥 HAVUZ ISITMA — uçtan uca tamamlama turu. Opsiyonel (default 0)
   *  ki bu component'i çağıran her yer aynı anda güncellenmek
   *  zorunda kalmasın (byte-identical geriye dönük uyum). */
  poolHeatingTRY?: number;
  totalTRY: number;
  payNow: number;
  remainingOnArrival: number;
  payNowLabel: string;
  isFullPayment: boolean;
  isCustomPrice: boolean;
  hasForeignCurrency: boolean;
}) {
  const hasRange = !!startDate && !!endDate;

  return (
    <aside
      className="relative card-premium p-4 lg:p-5 lg:sticky lg:top-4 self-start"
      aria-label="Canlı fiyat özeti"
    >
      {/* 🛡️ UI turu — BookingSummary.tsx ile AYNI marka imzası: ince
          turuncu→mavi accent çizgisi. Salt dekoratif. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-4 top-0 h-[2.5px] rounded-full bg-gradient-to-r from-[#ED7926] via-[#ED7926]/50 to-[#0973BA]"
      />
      <div className="flex items-center justify-between mb-3">
        <p className="eyebrow !text-[10px] !tracking-[0.16em] text-[var(--color-stone-500)]">
          Anlık özet
        </p>
        {isCustomPrice && (
          <span className="text-[10px] tracking-[0.08em] uppercase font-semibold text-[var(--color-champagne-700,#8a6a23)] bg-[var(--color-champagne-50,#fbf6e9)] px-2 py-0.5 rounded">
            Özel fiyat
          </span>
        )}
      </div>

      {/* Range header */}
      <div className="flex items-baseline justify-between gap-2 mb-4">
        <div className="min-w-0">
          {hasRange ? (
            <p className="text-[13px] font-medium text-[var(--color-stone-900)] tracking-[-0.01em]">
              {startDate!.toLocaleDateString("tr-TR", {
                day: "numeric",
                month: "short",
              })}
              <span className="text-[var(--color-stone-400)] mx-1.5">→</span>
              {endDate!.toLocaleDateString("tr-TR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          ) : (
            <p className="text-[13px] font-medium text-[var(--color-stone-400)]">
              Tarih seçiniz
            </p>
          )}
        </div>
        {hasRange && (
          <span className="text-[11px] tabular-nums text-[var(--color-stone-500)] shrink-0">
            <Sparkles
              size={11}
              className="inline mr-1 -mt-0.5 text-[var(--color-champagne-600)]"
            />
            {nights > 0 ? nights : 1} gece
          </span>
        )}
      </div>

      {/* Stat rows */}
      <dl className="space-y-2 text-[13px]">
        <Row
          label={`Konaklama${nights > 0 ? ` (${nights} gece)` : ""}`}
          value={hasRange ? `₺${fmtTRY(stayTRY)}` : "—"}
          muted
        />
        {/* 🛡️ Metin standardizasyonu: "Temizlik" → "Kısa Süreli Konaklama
            Ücreti" — public BookingSummary.tsx/ReservationForm.tsx ile AYNI
            terminoloji. cleaningTRY değeri DEĞİŞMEDİ. */}
        {cleaningTRY > 0 && (
          <Row
            label="Kısa Süreli Konaklama Ücreti"
            value={`₺${fmtTRY(cleaningTRY)}`}
            muted
          />
        )}
        {/* 🛡️ Metin standardizasyonu turu: "Havuz Isıtma" → "Havuz Isıtma
            Ücreti" (yalnız label metni — poolHeatingTRY/hesap DEĞİŞMEDİ). */}
        {poolHeatingTRY > 0 && (
          <Row
            label="Havuz Isıtma Ücreti"
            value={`₺${fmtTRY(poolHeatingTRY)}`}
            muted
          />
        )}

        <div className="border-t border-[var(--color-sand-100)] my-2.5" />

        {/* TOPLAM TUTAR — BookingSummary.tsx ile AYNI: yeşil, yumuşak
            zeminli, vurgulu satır (daha belirgin). totalTRY DEĞİŞMEDİ. */}
        <div className="flex items-center justify-between rounded-xl bg-green-50/70 px-3 py-2.5">
          <span className="text-[12px] uppercase tracking-[0.08em] font-semibold text-green-800">
            Toplam Tutar
          </span>
          <span className="font-display text-base font-bold text-green-700 tabular-nums">
            {hasRange ? `₺${fmtTRY(totalTRY)}` : "—"}
          </span>
        </div>
      </dl>

      {/* ÖN ÖDEME/ŞİMDİ ÖDENECEK (mor) + GİRİŞTE ÖDENECEK (turuncu) —
          BookingSummary.tsx ile AYNI iki ayrı vurgu kutusu. isFullPayment
          dalı BİREBİR AYNI (dal DEĞİŞMEZ) — yalnız görsel olarak
          BookingSummary'nin kutu tasarımına uyarlandı. payNow/
          remainingOnArrival DEĞİŞMEDİ. */}
      <div className={`mt-2.5 grid gap-2 ${isFullPayment ? "grid-cols-1" : "grid-cols-2"}`}>
        <div className="rounded-xl border border-purple-100 bg-purple-50/60 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-500">
            {payNowLabel}
          </p>
          <p className="mt-0.5 font-display text-base font-bold text-purple-700 tabular-nums">
            {hasRange ? `₺${fmtTRY(payNow)}` : "—"}
          </p>
        </div>
        {!isFullPayment && (
          <div className="rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500">
              Girişte ödenecek
            </p>
            <p className="mt-0.5 font-display text-base font-bold text-orange-600 tabular-nums">
              {hasRange ? `₺${fmtTRY(remainingOnArrival)}` : "—"}
            </p>
          </div>
        )}
      </div>

      {hasForeignCurrency && hasRange && !isCustomPrice && (
        <p className="mt-4 text-[10.5px] leading-snug text-[var(--color-stone-500)]">
          Snapshot'ta orijinal döviz tutarları korunur; admin ekranında
          TRY karşılığı gösterilir.
        </p>
      )}
    </aside>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className={
          muted
            ? "text-[12px] text-[var(--color-stone-500)]"
            : strong
              ? "text-[12px] uppercase tracking-[0.08em] font-semibold text-[var(--color-stone-700)]"
              : accent
                ? "text-[12px] font-medium text-[var(--color-champagne-700,#8a6a23)]"
                : "text-[12px] text-[var(--color-stone-700)]"
        }
      >
        {label}
      </dt>
      <dd
        className={`tabular-nums ${
          strong
            ? "text-[16px] font-display font-semibold text-[var(--color-stone-900)] tracking-[-0.02em]"
            : accent
              ? "text-[14px] font-semibold text-[var(--color-champagne-700,#8a6a23)]"
              : "text-[13px] text-[var(--color-stone-800)]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
