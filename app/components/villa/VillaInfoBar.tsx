"use client";

/* ===============================================================
   🛡️ VillaInfoBar — kompakt villa bilgi kartı
   ===============================================================
   Villa detayında galerinin altında, "Villa hakkında" başlığının
   hemen altında (bkz. VillaDetailBody). Üstte villa adı (h1) + konum
   (+ varsa turizm belgesi çipi), ince divider, altta eşit genişlikte
   kişi / yatak odası / banyo. Veri kontratı ve koşullar AYNEN:
   guests>0 / bedrooms>0 / bathrooms>0 / belge no boş değilse.
   =============================================================== */

import { MapPin, Users, BedDouble, Bath } from "lucide-react";

/* 🛡️ PHASE 10G — locale-aware bilgi etiketleri. `locale` OPSİYONEL,
   default "tr" → TR çıktısı BİREBİR AYNI. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { Locale } from "@/lib/i18n/config";

type Props = {
  villaTitle: string;
  location: string;
  guests: number;
  bedrooms: number;
  bathrooms: number;
  /* T.C. Kültür ve Turizm Bakanlığı belge no — opsiyonel ham text.
     null/boş → belge item'ı render edilmez. */
  tourismDocumentNumber?: string | null;
  /** 🛡️ PHASE 10G — opsiyonel; verilmezse "tr" (eski davranış). */
  locale?: Locale;
};

export default function VillaInfoBar({
  villaTitle,
  location,
  guests,
  bedrooms,
  bathrooms,
  tourismDocumentNumber,
  locale,
}: Props) {
  const dict = getDictionary(locale);
  const certificateNo = tourismDocumentNumber?.trim() || "";
  const hasCertificate = certificateNo.length > 0;
  const hasAnyInfoItem =
    guests > 0 || bedrooms > 0 || bathrooms > 0 || hasCertificate;

  const stats = [
    guests > 0 && { key: "guests", icon: <Users size={17} strokeWidth={1.8} />, value: guests, label: dict.card.person },
    bedrooms > 0 && { key: "bedrooms", icon: <BedDouble size={17} strokeWidth={1.8} />, value: bedrooms, label: dict.card.bedroom },
    bathrooms > 0 && { key: "bathrooms", icon: <Bath size={17} strokeWidth={1.8} />, value: bathrooms, label: dict.card.bathroom },
  ].filter(Boolean) as Array<{ key: string; icon: React.ReactNode; value: number; label: string }>;

  if (!villaTitle && !location && !hasAnyInfoItem) return null;

  /* 🔄 KOMPAKT KART — üstte ad + konum (+ varsa turizm belgesi çipi),
     ince divider, altta EŞİT genişlikte kişi/yatak/banyo. Veri/koşullar
     AYNEN (guests/bedrooms/bathrooms > 0, belge boş değilse). */
  return (
    <div className="rounded-[20px] border border-[var(--color-stone-100)] bg-white shadow-[0_12px_32px_-24px_rgba(0,0,0,0.22)] px-4 py-4 md:px-6 md:py-5">
      {(villaTitle || location || hasCertificate) && (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            {villaTitle && (
              <h1 className="font-display font-bold text-[20px] md:text-[22px] leading-tight tracking-[-0.015em] text-[var(--color-stone-900)] truncate">
                {villaTitle}
              </h1>
            )}
            {location && (
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--color-stone-500)] min-w-0">
                <MapPin size={14} strokeWidth={1.8} className="text-brand shrink-0" aria-hidden />
                <span className="truncate">{location}</span>
              </p>
            )}
          </div>
          {hasCertificate && (
            <CertificateItem
              label={dict.villa.tourismCertificate}
              documentNumberLabel={formatDictionaryString(dict.villa.documentNumber, {
                n: certificateNo,
              })}
            />
          )}
        </div>
      )}

      {stats.length > 0 && (
        <div
          className={
            "grid grid-cols-3 divide-x divide-[var(--color-stone-100)] " +
            (villaTitle || location || hasCertificate
              ? "mt-4 pt-4 border-t border-[var(--color-stone-100)]"
              : "")
          }
        >
          {stats.map((st) => (
            <InfoItem key={st.key} icon={st.icon} value={st.value} label={st.label} />
          ))}
        </div>
      )}
    </div>
  );
}

/* InfoItem — kompakt istatistik: ikon (marka mavisi) + değer + etiket. */
function InfoItem({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-1.5 min-w-0">
      <span aria-hidden="true" className="text-brand">
        {icon}
      </span>
      <p className="mt-1.5 font-display text-[20px] md:text-[22px] font-bold text-[var(--color-stone-900)] tabular-nums leading-none">
        {value}
      </p>
      <p className="mt-1 text-[11.5px] md:text-[12px] font-medium text-[var(--color-stone-500)] leading-snug truncate max-w-full">
        {label}
      </p>
    </div>
  );
}

/* CertificateItem — T.C. Kültür ve Turizm Bakanlığı belge çipi (kompakt).
   Mevcut bakanlık SVG asset'i; belge no gerçek veriden. */
function CertificateItem({
  label,
  documentNumberLabel,
}: {
  label: string;
  documentNumberLabel: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 self-start shrink-0 max-w-full rounded-xl border border-brand/15 bg-brand/[0.06] px-2.5 py-1.5 min-w-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/trust/turizm-bakanligi.svg"
        alt=""
        aria-hidden
        className="w-4 h-4 object-contain shrink-0"
      />
      <span className="min-w-0 leading-tight">
        <span className="block text-[9.5px] font-semibold uppercase tracking-[0.08em] text-brand">
          {label}
        </span>
        <span className="block text-[11px] font-medium text-[var(--color-stone-700)] truncate">
          {documentNumberLabel}
        </span>
      </span>
    </div>
  );
}
