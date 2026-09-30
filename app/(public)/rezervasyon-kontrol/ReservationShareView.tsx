import Link from "next/link";
import {
  CheckCircle2,
  CalendarDays,
  Users,
  CreditCard,
  Clock,
  User,
  Phone,
  MessageCircle,
} from "lucide-react";

import { getCachedSettings } from "@/lib/cache.helpers";
import type { ReservationShareDTO } from "./share.resolve";

/* 🛡️ PUBLIC ÇOKLU DİL — statik metinler MEVCUT public dictionary'den
   (`reservationLookup` namespace). Tutar/tarih biçimi, snapshot değerleri
   ve `share.resolve` akışı DEĞİŞTİRİLMEDİ. */
import {
  DEFAULT_LOCALE,
  LOCALE_BCP47,
  type Locale,
} from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";

/* ===============================================================
   🛡️ RESERVATION SHARE VIEW — token ile gelen müşteri görünümü
   ===============================================================
   Server component (presentational). Yalnız SANITIZED DTO alır
   (PII/not/token YOK). Ödeme tutarları DTO'daki kayıtlı TRY
   snapshot'ından — kafadan hesap yok. İletişim settings'ten (varsa).

   NOT (bu tur kapsamı): villa görseli / bölge / giriş-çıkış saati /
   harita bu görünüme DAHİL EDİLMEDİ (kaynak alanları henüz teyitli
   değil; "veri yoksa gösterme" kuralı). Core + ödeme özeti + iletişim.
   =============================================================== */

/* 🛡️ PUBLIC ÇOKLU DİL — tutar/tarih biçimi artık locale-aware.
   Biçim ŞEKLİ (yuvarlama, "—" fallback, "TL" birimi, "<tarih>, <gün>"
   düzeni, UTC timeZone) DEĞİŞMEDİ; yalnız BCP-47 etiketi MEVCUT
   `LOCALE_BCP47` haritasından gelir → TR çıktısı BİREBİR aynı kalır,
   EN/DE kendi doğal biçimini alır. Snapshot tutarları, `share.resolve`
   akışı ve DTO alanları DOKUNULMADI. */
const formatShareAmount = (v: number | null, locale: Locale): string =>
  v === null
    ? "—"
    : `${Math.round(v).toLocaleString(LOCALE_BCP47[locale])} TL`;

/** TR: "21 Eylül 2026, Pazartesi" — gün adı tarihten dinamik türetilir. */
function formatShareDate(iso: string | null, locale: Locale): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "—";
  const tag = LOCALE_BCP47[locale];
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const base = dt.toLocaleDateString(tag, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const weekday = dt.toLocaleDateString(tag, {
    weekday: "long",
    timeZone: "UTC",
  });
  return `${base}, ${weekday}`;
}

/* 🛡️ wa.me numarası — pure/lokal. Boşluk/parantez/tire vb. temizlenir;
   TR yerel "0..." → "90..." (ülke kodu). Ülke kodlu numaralarda basamaklar
   korunur (TR'ye hard-code zorlama yok). `tel:` için kullanıcıya gösterilen
   gerçek numara kullanılır. */
function toWaNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "90" + digits.slice(1);
  return digits;
}

/* Küçük WhatsApp + telefon aksiyon ikonları (mevcut iletişim dili).
   Yalnız telefon varken caller render eder. */
function PhoneActions({
  phone,
  whatsappAriaLabel,
  phoneAriaLabel,
}: {
  phone: string;
  whatsappAriaLabel: string;
  phoneAriaLabel: string;
}) {
  const wa = toWaNumber(phone);
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      {wa && (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={whatsappAriaLabel}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]/12 text-[#1da851] hover:bg-[#25D366] hover:text-white transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/40"
        >
          <MessageCircle size={15} aria-hidden />
        </a>
      )}
      <a
        href={`tel:${phone}`}
        aria-label={phoneAriaLabel}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-coral-tint)] text-[var(--brand-coral-deep)] hover:bg-[var(--brand-coral)] hover:text-white transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/40"
      >
        <Phone size={15} aria-hidden />
      </a>
    </span>
  );
}

export default async function ReservationShareView({
  data,
  /* 🛡️ Opsiyonel — verilmezse "tr" → TR çıktısı BİREBİR eskisi gibi. */
  locale = DEFAULT_LOCALE,
}: {
  data: ReservationShareDTO;
  locale?: Locale;
}) {
  const dict = getDictionary(locale).reservationLookup;
  const localePrefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  /* Locale'i tek yerde bağlayan ince sarmalayıcılar — çağrı yerleri
     (aşağıdaki `TL(...)` / `formatDate(...)`) değişmedi. */
  const TL = (v: number | null): string => formatShareAmount(v, locale);
  const formatDate = (iso: string | null): string =>
    formatShareDate(iso, locale);
  const settings = await getCachedSettings().catch(() => null);
  const phone = settings?.phone?.trim() || "";
  const phoneHref = phone ? `tel:${phone}` : null;
  const digits = phone.replace(/\D/g, "");
  const whatsappHref =
    settings?.whatsapp_link?.trim() ||
    (digits ? `https://wa.me/${digits}` : null);

  return (
    <div className="max-w-2xl mx-auto">
      {/* 🛡️ Kalan ödeme — yumuşak/sürekli glow (≈2.6s). Yanıp sönme/flash
          YOK; prefers-reduced-motion'da tamamen kapanır (statik accent kalır).
          Kartın shadow/radius/layout sistemi etkilenmez (yalnız box-shadow). */}
      <style>{`
        @keyframes rkRemainingGlow {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--brand-coral) 0%, transparent); }
          50% { box-shadow: 0 0 20px -2px color-mix(in srgb, var(--brand-coral) 42%, transparent); }
        }
        .rk-remaining-glow { animation: rkRemainingGlow 2.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .rk-remaining-glow { animation: none; }
        }
      `}</style>

      {/* HEADER — Onay */}
      <div className="text-center">
        <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
          <CheckCircle2 size={26} strokeWidth={2} aria-hidden />
        </span>
        <h1 className="font-display text-[30px] md:text-[38px] text-[var(--color-stone-900)] mt-5 tracking-[-0.02em] leading-[1.05]">
          {dict.shareTitle}
        </h1>
        <p className="text-[var(--color-stone-500)] mt-3 text-[14.5px]">
          {dict.shareSubtitle}
        </p>
        {data.reservationNo && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-sand-50)] border border-[var(--color-stone-100)] px-4 py-1.5 text-[13px] font-medium text-[var(--color-stone-700)]">
            {dict.shareReservationNo}
            <span className="font-semibold text-[var(--color-stone-900)] tabular-nums">
              {data.reservationNo}
            </span>
          </p>
        )}
      </div>

      {/* KONAKLAMA */}
      <section className="mt-9 rounded-2xl border border-[var(--color-stone-100)] bg-white p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--color-stone-500)]">
          <CalendarDays size={15} className="text-[var(--brand-coral)]" aria-hidden />
          {dict.shareStayHeading}
        </h2>
        <div className="mt-4 flex flex-col sm:flex-row gap-4 md:gap-5">
          {/* Villa kapak görseli — sol; yoksa hiç render edilmez
              (layout bozulmaz). Mevcut resolveVillaImageUrl kaynağı. */}
          {data.villaImage && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={data.villaImage}
              alt={data.villaTitle}
              className="w-full h-44 rounded-xl object-cover shrink-0 sm:w-40 sm:h-auto sm:self-stretch md:w-44"
            />
          )}

          {/* Bilgiler — sağ */}
          <div className="flex-1 min-w-0">
            <p className="font-display text-[22px] text-[var(--color-stone-900)] tracking-[-0.01em]">
              {data.villaTitle}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-[14px]">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-stone-400)] font-semibold">
                  {dict.shareCheckIn}
                </div>
                <div className="mt-1 font-medium text-[var(--color-stone-900)]">
                  {formatDate(data.startDate)}
                </div>
                <div className="mt-1 inline-flex items-center gap-1 text-[13px] text-[var(--color-stone-500)] tabular-nums">
                  <Clock size={13} aria-hidden /> {data.checkInTime}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-stone-400)] font-semibold">
                  {dict.shareCheckOut}
                </div>
                <div className="mt-1 font-medium text-[var(--color-stone-900)]">
                  {formatDate(data.endDate)}
                </div>
                <div className="mt-1 inline-flex items-center gap-1 text-[13px] text-[var(--color-stone-500)] tabular-nums">
                  <Clock size={13} aria-hidden /> {data.checkOutTime}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {data.nights !== null && (
                <span className="inline-flex items-center rounded-full bg-[var(--color-sand-50)] px-3 py-1 text-[12.5px] font-medium text-[var(--color-stone-700)]">
                  {formatDictionaryString(dict.shareNights, {
                    n: data.nights,
                  })}
                </span>
              )}
              {data.guests !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-sand-50)] px-3 py-1 text-[12.5px] font-medium text-[var(--color-stone-700)]">
                  <Users size={13} aria-hidden />{" "}
                  {formatDictionaryString(dict.shareGuests, {
                    n: data.guests,
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ÖDEME ÖZETİ */}
      {data.total !== null && (
        <section className="mt-5 rounded-2xl border border-[var(--color-stone-100)] bg-white p-5 md:p-6">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--color-stone-500)]">
            <CreditCard size={15} className="text-[var(--brand-coral)]" aria-hidden />
            {dict.sharePaymentHeading}
          </h2>
          <dl className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <dt className="text-[14px] text-[var(--color-stone-600)]">
                {dict.shareTotal}
              </dt>
              <dd className="text-[15px] font-semibold text-[var(--color-stone-900)] tabular-nums">
                {TL(data.total)}
              </dd>
            </div>

            <div className="flex items-center justify-between">
              <dt className="text-[14px] text-[var(--color-stone-600)]">
                {dict.sharePaid}
                {data.paymentMethodLabel ? ` (${data.paymentMethodLabel})` : ""}
              </dt>
              <dd className="text-[15px] font-semibold text-emerald-700 tabular-nums">
                {TL(data.paid)}
              </dd>
            </div>

            {/* Temizlik Ücreti — bilgilendirme (cleaning_fee_try, hesaba KATILMAZ).
                "(Fiyata Dahildir.)" başlığın yanında parantez içinde. Değer varsa. */}
            {data.cleaningFee !== null && (
              <div className="flex items-center justify-between">
                <dt className="text-[14px] text-[var(--color-stone-600)]">
                  {dict.shareCleaningFee}{" "}
                  <span className="text-[var(--color-stone-400)]">
                    {dict.shareIncludedInPrice}
                  </span>
                </dt>
                <dd className="text-[15px] font-semibold text-[var(--color-stone-900)] tabular-nums">
                  {TL(data.cleaningFee)}
                </dd>
              </div>
            )}

            {/* 🔥 HAVUZ ISITMA — bilgilendirme (pool_heating_total_try,
                hesaba KATILMAZ; total zaten dahil). Temizlik Ücreti ile
                AYNI desen — yalnız seçili ve tutar > 0 ise gösterilir.
                🛡️ Metin standardizasyonu turu: "Havuz Isıtma" → "Havuz
                Isıtma Ücreti" (yalnız label metni). */}
            {data.poolHeatingFee !== null && (
              <div className="flex items-center justify-between">
                <dt className="text-[14px] text-[var(--color-stone-600)]">
                  {dict.sharePoolHeatingFee}{" "}
                  <span className="text-[var(--color-stone-400)]">
                    {dict.shareIncludedInPrice}
                  </span>
                </dt>
                <dd className="text-[15px] font-semibold text-[var(--color-stone-900)] tabular-nums">
                  {TL(data.poolHeatingFee)}
                </dd>
              </div>
            )}
          </dl>

          {/* Kalan Ödeme — dikkat çekici marka accent + yumuşak glow/pulse.
              Animasyon prefers-reduced-motion'da kapanır (aşağıdaki style). */}
          <div className="mt-4 border-t border-[var(--color-stone-100)] pt-4">
            <div className="rk-remaining-glow flex items-center justify-between rounded-xl border border-[var(--brand-coral)]/35 bg-[var(--brand-coral-tint)] px-4 py-3.5">
              <span className="text-[13px] font-semibold text-[var(--brand-coral-deep)]">
                {dict.shareRemaining}
              </span>
              <span className="text-[18px] font-bold leading-none tracking-tight text-[var(--brand-coral-deep)] tabular-nums">
                {TL(data.isFullPayment ? 0 : data.remaining)}
              </span>
            </div>
          </div>

          {/* BİLGİLENDİRME — Hasar Depozitosu (hesaba KATILMAZ; yalnız değer varsa). */}
          {data.damageDeposit !== null && (
            <div className="mt-4 space-y-3 border-t border-[var(--color-stone-100)] pt-4">
              <div>
                <div className="flex items-center justify-between">
                  <dt className="text-[14px] text-[var(--color-stone-600)]">
                    {dict.shareDeposit}
                  </dt>
                  <dd className="text-[15px] font-semibold text-[var(--color-stone-900)] tabular-nums">
                    {TL(data.damageDeposit)}
                  </dd>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-stone-400)]">
                  {dict.shareDepositNote}
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* MÜLK SAHİBİ + MİSAFİR İLETİŞİM — tek kart, ince divider ile. */}
      <section className="mt-5 rounded-2xl border border-[var(--color-stone-100)] bg-white p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--color-stone-500)]">
          <User size={15} className="text-[var(--brand-coral)]" aria-hidden />
          {dict.shareOwnerHeading}
        </h2>
        {data.ownerName || data.ownerPhone ? (
          <div className="mt-3 space-y-1">
            {data.ownerName && (
              <p className="text-[15px] font-medium text-[var(--color-stone-900)]">
                {data.ownerName}
              </p>
            )}
            {data.ownerPhone && (
              <div className="flex items-center flex-wrap gap-x-3 gap-y-2 text-[14px] text-[var(--color-stone-600)]">
                <span className="tabular-nums">{data.ownerPhone}</span>
                <PhoneActions
                  phone={data.ownerPhone}
                  whatsappAriaLabel={dict.shareWhatsappAriaLabel}
                  phoneAriaLabel={dict.sharePhoneAriaLabel}
                />
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-[13.5px] text-[var(--color-stone-500)]">
            {dict.shareOwnerEmpty}
          </p>
        )}

        <div className="my-5 border-t border-[var(--color-stone-100)]" />

        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--color-stone-500)]">
          <User size={15} className="text-[var(--brand-coral)]" aria-hidden />
          {dict.shareGuestHeading}
        </h2>
        <dl className="mt-3 space-y-1.5 text-[14px]">
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-[var(--color-stone-500)]">
              {dict.shareGuestName}
            </dt>
            <dd className="min-w-0 font-medium text-[var(--color-stone-900)]">
              {data.guestName || "—"}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-[var(--color-stone-500)]">
              {dict.shareGuestPhone}
            </dt>
            <dd className="min-w-0 text-[var(--color-stone-900)]">
              {data.guestPhone ? (
                <span className="inline-flex items-center flex-wrap gap-x-3 gap-y-2">
                  <span className="tabular-nums">{data.guestPhone}</span>
                  <PhoneActions
                    phone={data.guestPhone}
                    whatsappAriaLabel={dict.shareWhatsappAriaLabel}
                    phoneAriaLabel={dict.sharePhoneAriaLabel}
                  />
                </span>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-[var(--color-stone-500)]">
              {dict.shareGuestEmail}
            </dt>
            <dd className="min-w-0 break-all text-[var(--color-stone-900)]">
              {data.guestEmail || "—"}
            </dd>
          </div>
        </dl>
      </section>

      {/* İLETİŞİM */}
      {(whatsappHref || phoneHref) && (
        <section className="mt-5 rounded-2xl border border-[var(--color-stone-100)] bg-white p-5 md:p-6 text-center">
          <p className="text-[13.5px] text-[var(--color-stone-600)]">
            {dict.shareContactNote}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-[13px] font-medium text-white hover:bg-[#1da851] transition-colors"
              >
                {dict.shareWhatsappCta}
              </a>
            )}
            {phoneHref && (
              <a
                href={phoneHref}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-stone-200)] px-5 py-2.5 text-[13px] font-medium text-[var(--color-stone-700)] hover:border-[var(--brand-coral)] hover:text-[var(--color-stone-900)] transition-colors"
              >
                {dict.sharePhoneCta}
              </a>
            )}
          </div>
        </section>
      )}

      <div className="mt-8 text-center">
        <Link
          href={`${localePrefix}/rezervasyon-kontrol`}
          className="text-[13px] text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)] underline underline-offset-4 transition-colors"
        >
          {dict.shareLookupAgain}
        </Link>
      </div>
    </div>
  );
}
