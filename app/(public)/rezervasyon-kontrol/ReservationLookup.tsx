"use client";

import { useState } from "react";
import {
  Search,
  AlertCircle,
  Clock,
  CheckCircle2,
  CreditCard,
  XCircle,
  Home,
  CalendarDays,
  Users,
  Hash,
} from "lucide-react";

import { formatDateForLocale } from "@/lib/date-format";

/* 🛡️ PUBLIC ÇOKLU DİL — statik metinler MEVCUT public dictionary'den
   (`reservationLookup` namespace). API endpoint'i, istek gövdesi ve
   güvenlik semantiği (yalnız reservation_no + email eşleşmesi)
   DEĞİŞTİRİLMEDİ. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { Dictionary } from "@/lib/i18n/dictionaries/types";

type LookupDict = Dictionary["reservationLookup"];

/* ===============================================================
   🛡️ ReservationLookup — public rezervasyon durum sorgulama
   ===============================================================
   /rezervasyon-kontrol client island. Form (kod + e-posta) →
   POST /api/public/reservation-lookup (service-role server route) →
   güvenli alanları kart yapısında gösterir.

   GÜVENLİK: yalnız reservation_no + email eşleşirse veri gelir;
   PII (telefon/TC/adres/fiyat) sunucudan hiç dönmez.
   =============================================================== */

type StatusKey = "pending" | "prepayment" | "confirmed" | "cancelled";

type LookupResult = {
  reservationNo: string;
  villaTitle: string;
  startDate: string | null;
  endDate: string | null;
  guests: number | null;
  statusKey: StatusKey;
};

type UiState = "idle" | "pending" | "success" | "error";

/* 🛡️ Durum ANAHTARLARI (`StatusKey`) ve görsel tasarım DEĞİŞMEDİ; yalnız
   etiket/mesaj metinleri dictionary anahtarlarına bağlandı. */
const STATUS_DESIGN: Record<
  StatusKey,
  {
    labelKey: keyof LookupDict;
    messageKey: keyof LookupDict;
    icon: typeof Clock;
    cardClass: string;
    iconWrapClass: string;
    badgeClass: string;
  }
> = {
  pending: {
    labelKey: "statusPendingLabel",
    messageKey: "statusPendingMessage",
    icon: Clock,
    cardClass: "border-amber-200 bg-amber-50/60",
    iconWrapClass: "bg-amber-100 text-amber-700",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
  },
  confirmed: {
    labelKey: "statusConfirmedLabel",
    messageKey: "statusConfirmedMessage",
    icon: CheckCircle2,
    cardClass: "border-emerald-200 bg-emerald-50/60",
    iconWrapClass: "bg-emerald-100 text-emerald-700",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  prepayment: {
    labelKey: "statusPrepaymentLabel",
    messageKey: "statusPrepaymentMessage",
    icon: CreditCard,
    cardClass: "border-blue-200 bg-blue-50/60",
    iconWrapClass: "bg-blue-100 text-blue-700",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
  },
  cancelled: {
    labelKey: "statusCancelledLabel",
    messageKey: "statusCancelledMessage",
    icon: XCircle,
    cardClass: "border-red-200 bg-red-50/60",
    iconWrapClass: "bg-red-100 text-red-700",
    badgeClass: "bg-red-100 text-red-800 border-red-200",
  },
};

export default function ReservationLookup({
  /* 🛡️ Opsiyonel — verilmezse "tr" → TR çıktısı BİREBİR eskisi gibi. */
  locale = DEFAULT_LOCALE,
}: {
  locale?: Locale;
}) {
  const dict = getDictionary(locale).reservationLookup;
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<UiState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "pending") return;

    const codeTrim = code.trim();
    const emailTrim = email.trim();

    if (!codeTrim || !emailTrim) {
      setErrorMsg(dict.errorMissingFields);
      setStatus("error");
      setResult(null);
      return;
    }

    setErrorMsg(null);
    setStatus("pending");
    setResult(null);

    try {
      const res = await fetch("/api/public/reservation-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeTrim, email: emailTrim }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        /* 🛡️ Sunucu hata metni yerine locale-aware mesaj — API
           sözleşmesi ve güvenlik davranışı DEĞİŞMEDİ. */
        setErrorMsg(dict.errorNotFound);
        setStatus("error");
        return;
      }

      setResult(json.reservation as LookupResult);
      setStatus("success");
    } catch {
      setErrorMsg(dict.errorNetwork);
      setStatus("error");
    }
  }

  const busy = status === "pending";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
      {/* SOL — FORM */}
      <div className="lg:col-span-5">
        <div className="bg-white border border-[var(--color-stone-100)] rounded-3xl p-6 md:p-8 shadow-[0_8px_40px_-16px_rgb(27_26_23/0.12)]">
          <div className="mb-6">
            <p className="text-[11px] tracking-[0.22em] uppercase font-medium text-[var(--brand-coral)]">
              {dict.formEyebrow}
            </p>
            <h2 className="font-display text-[22px] md:text-[26px] text-[var(--color-stone-900)] mt-2 leading-[1.15] tracking-[-0.02em]">
              {dict.formTitle}
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="rk-code"
                className="text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] block"
              >
                {dict.codeLabel}
              </label>
              <input
                id="rk-code"
                name="code"
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder={dict.codePlaceholder}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={busy}
                className="w-full px-4 py-3 rounded-2xl border border-[var(--color-stone-200)] bg-white text-[15px] text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-400)] focus:outline-none focus:border-[var(--color-champagne-500)] focus:ring-2 focus:ring-[var(--color-champagne-500)]/20 transition disabled:opacity-60 tracking-[0.04em]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="rk-email"
                className="text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] block"
              >
                {dict.emailLabel}
              </label>
              <input
                id="rk-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={dict.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                className="w-full px-4 py-3 rounded-2xl border border-[var(--color-stone-200)] bg-white text-[15px] text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-400)] focus:outline-none focus:border-[var(--color-champagne-500)] focus:ring-2 focus:ring-[var(--color-champagne-500)]/20 transition disabled:opacity-60"
              />
            </div>

            {status === "error" && errorMsg && (
              <div className="flex items-start gap-2.5 text-[13px] text-red-700 bg-red-50/60 border border-red-100 rounded-2xl px-4 py-3">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--color-stone-900)] text-white text-[13.5px] font-medium tracking-[0.04em] hover:bg-[var(--color-stone-700)] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {busy ? (
                <>{dict.submitting}</>
              ) : (
                <>
                  <Search size={15} /> {dict.submit}
                </>
              )}
            </button>

            <p className="text-[11.5px] text-[var(--color-stone-400)] leading-relaxed">
              {dict.formHint}
            </p>
          </form>
        </div>
      </div>

      {/* SAĞ — SONUÇ */}
      <div className="lg:col-span-7">
        {status === "success" && result ? (
          <ResultCard result={result} dict={dict} locale={locale} />
        ) : (
          <EmptyState dict={dict} />
        )}
      </div>
    </div>
  );
}

/* ===============================================================
   ResultCard — bulunan rezervasyon + durum tasarımı
   =============================================================== */
function ResultCard({
  result,
  dict,
  locale,
}: {
  result: LookupResult;
  dict: LookupDict;
  /* 🛡️ Tarih biçimi için locale — metin/veri akışı DEĞİŞMEDİ. */
  locale: Locale;
}) {
  const design = STATUS_DESIGN[result.statusKey];
  const StatusIcon = design.icon;

  return (
    <div className="rounded-3xl border border-[var(--color-stone-100)] bg-white shadow-[0_8px_40px_-16px_rgb(27_26_23/0.12)] overflow-hidden">
      {/* DURUM BANDI */}
      <div className={"border-b px-6 md:px-8 py-6 " + design.cardClass}>
        <div className="flex items-start gap-4">
          <span
            className={
              "shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-2xl " +
              design.iconWrapClass
            }
          >
            <StatusIcon size={22} strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <span
              className={
                "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] tracking-[0.06em] uppercase font-medium border " +
                design.badgeClass
              }
            >
              {dict[design.labelKey]}
            </span>
            <p className="text-[14.5px] md:text-[15px] text-[var(--color-stone-700)] mt-2.5 leading-relaxed">
              {dict[design.messageKey]}
            </p>
          </div>
        </div>
      </div>

      {/* DETAYLAR */}
      <div className="px-6 md:px-8 py-7">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
          <DetailRow
            icon={<Home size={15} />}
            label={dict.detailVilla}
            value={result.villaTitle}
          />
          <DetailRow
            icon={<Hash size={15} />}
            label={dict.detailCode}
            value={result.reservationNo || "—"}
            mono
          />
          <DetailRow
            icon={<CalendarDays size={15} />}
            label={dict.detailCheckIn}
            value={
              result.startDate
                ? formatDateForLocale(result.startDate, locale)
                : "—"
            }
          />
          <DetailRow
            icon={<CalendarDays size={15} />}
            label={dict.detailCheckOut}
            value={
              result.endDate
                ? formatDateForLocale(result.endDate, locale)
                : "—"
            }
          />
          <DetailRow
            icon={<Users size={15} />}
            label={dict.detailGuests}
            value={
              result.guests
                ? formatDictionaryString(dict.detailGuestsValue, {
                    n: result.guests,
                  })
                : "—"
            }
          />
        </dl>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-[var(--color-sand-100)] text-[var(--color-champagne-700)] mt-0.5">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
          {label}
        </dt>
        <dd
          className={
            "text-[15px] text-[var(--color-stone-900)] mt-1 leading-snug break-words " +
            (mono ? "tracking-[0.04em] tabular-nums" : "")
          }
        >
          {value}
        </dd>
      </div>
    </div>
  );
}

/* ===============================================================
   EmptyState — sorgu öncesi nazik placeholder
   =============================================================== */
function EmptyState({ dict }: { dict: LookupDict }) {
  return (
    <div className="rounded-3xl border border-dashed border-[var(--color-stone-200)] bg-[var(--color-sand-50)]/50 px-8 py-12 md:py-16 text-center">
      <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white border border-[var(--color-stone-100)] text-[var(--color-champagne-700)] shadow-[0_8px_24px_-16px_rgba(27,26,23,0.2)]">
        <Search size={24} strokeWidth={1.75} />
      </span>
      <h3 className="font-display text-[19px] md:text-[21px] text-[var(--color-stone-900)] mt-5 tracking-[-0.01em]">
        {dict.emptyTitle}
      </h3>
      <p className="text-[14px] text-[var(--color-stone-500)] mt-2.5 leading-relaxed max-w-sm mx-auto">
        {dict.emptyBody}
      </p>
    </div>
  );
}
