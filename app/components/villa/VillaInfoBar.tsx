"use client";

/* ===============================================================
   🛡️ VillaInfoBar — full-width premium villa DETAIL CARD
   ===============================================================
   AMAÇ:
     Villa detay sayfasının EN ÜSTÜNDE (Gallery + Booking grid'inin
     ÜSTÜNDE, sayfanın tüm content genişliğini kullanan) tek büyük
     premium CARD. Villa adı + lokasyon (SOL kompakt kart, ~%28
     genişlik) ve kişi/yatak/banyo/turizm belgesi (4 ikonlu
     info-item) aynı yatay satırda gösterilir.

   LAYOUT:
     ┌───────────────────────────────────────────────────────────┐
     │ ┌──────────┐ ┌────────┐ ┌──────────────┐ ┌────────┐ ┌──────┐│
     │ │ Villa Adı│ │ 👥 8   │ │ 🛏 4         │ │ 🛁 3   │ │ BELGE││
     │ │ 📍 Konum │ │ Kişi   │ │ Yatak Odası  │ │ Banyo  │ │ XXXXX││
     │ └──────────┘ └────────┘ └──────────────┘ └────────┘ └──────┘│
     └───────────────────────────────────────────────────────────┘

   - Villa adı + lokasyon card'ın ana görsel odağı (soldaki kart)
   - Info item'lar: mobilde 2x2 grid, desktop'ta tek satır (4 kolon)
   - Belge item'ı diğerlerinden hafif farklı (gradient accent) — "premium"

   Konum: parent (`page.tsx`) tarafından Gallery/Booking grid'inin
   ÜSTÜNE, full-width olarak yerleştiriliyor.

   FOTOĞRAFIN ÜZERİNE ASLA binmez (gallery'den tamamen ayrı, üstte block).
   Gallery DOM/click/lightbox davranışı SIFIR etkilenir.

   🛡️ VİDEO CTA + FAVORİ BUTONU ARTIK BURADA DEĞİL:
     Bu iki aksiyon bu component'ten kaldırıldı; Gallery'nin hero
     görselinin SOL ÜST köşesine overlay olarak taşındı (bkz.
     `app/components/villa/Gallery.tsx`). Video modal + favori buton
     logic'i AYNEN korunuyor, yalnız DOM konumu değişti — bu
     dosyanın artık ilgili prop'ları YOK.

   VERİ KONTRATI (DEĞİŞMEDİ):
     - Props: villaTitle, location, guests, bedrooms, bathrooms,
       tourismDocumentNumber.
     - Conditional'lar AYNEN: guests>0 / bedrooms>0 / bathrooms>0 /
       certificateNo boş değilse. Yeni API/DB sorgusu YOK, fake veri YOK.

   ANİMASYON (yalnız bu component içinde scoped, <style> ile; globals.css
   DEĞİŞMEDİ, yeni dependency YOK):
     - Card mount'ta çok hafif fade+translate (tek seferlik, ~500ms).
     - Üst accent çizgisinde çok yavaş (9s) shimmer sweep.
     - Info item hover'da hafif lift + ikon scale (Tailwind transition).
     - Tümü `@media (prefers-reduced-motion: no-preference)` guard'lı —
       reduced-motion tercihinde hiçbir animasyon çalışmaz.

   ASLA dokunulmadı:
     - Gallery component'in görsel/lightbox/swipe/sayaç davranışı —
       yalnız hero'nun sol üstüne video/favori overlay'i eklendi.
     - Booking sidebar / pricing / availability / reservation flow
     - YouTube helper
     - FavoriteButton / useFavorites logic (yalnız DOM konumu Gallery'ye taşındı)
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

  return (
      <div
        className="
          villa-info-card-in
          relative overflow-hidden
          rounded-[28px] md:rounded-[32px]
          border border-[var(--color-stone-100)]
          bg-gradient-to-br from-white via-white to-[var(--color-sand-50)]/60
          shadow-[0_24px_60px_-36px_rgba(11,31,58,0.22)]
          px-6 py-6 md:px-9 md:py-8
        "
      >
        <style>{`
          @media (prefers-reduced-motion: no-preference) {
            .villa-info-card-in {
              animation: villa-info-card-in-kf 550ms cubic-bezier(0.16, 1, 0.3, 1) both;
            }
            .villa-info-shimmer {
              animation: villa-info-shimmer-kf 9s ease-in-out infinite;
            }
          }
          @keyframes villa-info-card-in-kf {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes villa-info-shimmer-kf {
            0% { background-position: 160% 0; }
            100% { background-position: -60% 0; }
          }
        `}</style>

        {/* İnce üst accent çizgisi — turuncu → mavi, çok yavaş shimmer */}
        <span
          aria-hidden="true"
          className="villa-info-shimmer absolute inset-x-0 top-0 h-[3px]"
          style={{
            background:
              "linear-gradient(90deg, transparent, #ED7926, #0973BA, transparent)",
            backgroundSize: "220% 100%",
          }}
        />

        {/* SOL: VİLLA ADI + BÖLGE/KONUM KARTI ── SAĞ: KİŞİ/YATAK ODASI/
            BANYO/BELGE — hepsi AYNI yatay satırda, aynı görsel ritimde.
            Eski büyük h1 kaldırıldı; villaTitle artık bu kompakt, diğer
            4 kart ile aynı border/radius/bg/hover diline sahip SOL
            kartın İÇİNDE (üstte başlık, altında lokasyon, ikisi de
            ortalanmış) render ediliyor — h1 etiketi SEO/a11y için
            korundu, yalnız boyutu/konumu değişti. Masaüstünde SOL kart
            shrink-0, 4'lü grid flex-1 ile kalan alanı dolduruyor;
            mobilde satır flex-col'a döner (kart üstte, tam genişlik;
            bilgi kutuları altında). 4 kutunun kendi tasarımı
            (InfoItem/CertificateItem, grid-cols, koşullar) DEĞİŞMEDİ —
            yalnızca villa adının yeri/boyutu ve lokasyon kartı değişti. */}
        {(villaTitle || location || hasAnyInfoItem) && (
          <div className="mt-5 md:mt-6 flex flex-col md:flex-row md:items-stretch gap-4 md:gap-6">
            {villaTitle && (
              <div
                className="
                  group/title relative
                  flex flex-col items-center justify-center text-center gap-1
                  w-full md:w-[28%] md:shrink-0
                  rounded-2xl
                  bg-[var(--color-stone-50)]
                  border border-transparent
                  hover:bg-white hover:border-[var(--color-stone-100)]
                  hover:shadow-[0_12px_28px_-18px_rgba(11,31,58,0.22)]
                  hover:-translate-y-0.5
                  transition-all duration-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0
                  px-4 py-3.5 md:py-4
                "
              >
                <h1 className="w-full font-display font-bold text-[18px] md:text-[20px] leading-tight tracking-[-0.01em] text-[var(--color-stone-900)] truncate">
                  {villaTitle}
                </h1>
                {location && (
                  <p className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] md:text-[12.5px] text-[var(--color-stone-500)] truncate">
                    <MapPin
                      size={13}
                      strokeWidth={1.8}
                      className="text-[#ED7926] shrink-0"
                      aria-hidden
                    />
                    <span className="truncate">{location}</span>
                  </p>
                )}
              </div>
            )}

            {hasAnyInfoItem && (
              <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
                {guests > 0 && (
                  <InfoItem
                    icon={<Users size={15} strokeWidth={1.8} />}
                    accentColor="#0973BA"
                    value={guests}
                    label={dict.card.person}
                  />
                )}
                {bedrooms > 0 && (
                  <InfoItem
                    icon={<BedDouble size={15} strokeWidth={1.8} />}
                    accentColor="#ED7926"
                    value={bedrooms}
                    label={dict.card.bedroom}
                  />
                )}
                {bathrooms > 0 && (
                  <InfoItem
                    icon={<Bath size={15} strokeWidth={1.8} />}
                    accentColor="#0973BA"
                    value={bathrooms}
                    label={dict.card.bathroom}
                  />
                )}
                {hasCertificate && (
                  <CertificateItem
                    label={dict.villa.tourismCertificate}
                    documentNumberLabel={formatDictionaryString(
                      dict.villa.documentNumber,
                      { n: certificateNo }
                    )}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   InfoItem — Kişi / Yatak Odası / Banyo için modern, ikonlu mini
   card. Eski StatCard'ın YERİNE geldi: soft background (kutu/border
   ağır değil), ikon için küçük beyaz rozet + brand accent renk,
   büyük sayı + küçük label, hover'da hafif lift + ikon scale.
─────────────────────────────────────────────────────────────── */
function InfoItem({
  icon,
  accentColor,
  value,
  label,
}: {
  icon: React.ReactNode;
  accentColor: string;
  value: number;
  label: string;
}) {
  return (
    <div
      className="
        group/item relative
        flex flex-col items-center justify-center text-center
        rounded-2xl
        bg-[var(--color-stone-50)]
        border border-transparent
        hover:bg-white hover:border-[var(--color-stone-100)]
        hover:shadow-[0_12px_28px_-18px_rgba(11,31,58,0.22)]
        hover:-translate-y-0.5
        transition-all duration-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0
        px-3.5 py-3.5 md:py-4
      "
    >
      <span
        aria-hidden="true"
        className="
          inline-flex items-center justify-center w-8 h-8 rounded-xl
          bg-white shadow-[inset_0_0_0_1px_rgba(11,31,58,0.06)]
          transition-transform duration-300 motion-reduce:transition-none
          group-hover/item:scale-110
        "
        style={{ color: accentColor }}
      >
        {icon}
      </span>
      <p className="mt-2.5 font-display text-[26px] md:text-[28px] font-bold text-[var(--color-stone-900)] tracking-[-0.01em] tabular-nums leading-none">
        {value}
      </p>
      <p className="mt-1 text-[11px] md:text-[11.5px] font-medium text-[var(--color-stone-500)] leading-snug">
        {label}
      </p>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   CertificateItem — T.C. Kültür ve Turizm Bakanlığı belge item'ı.
   Diğer InfoItem'lardan biraz daha premium: turuncu→mavi çok hafif
   gradient zemin + ince brand-renkli border. Mevcut bakanlık SVG
   ikonu (daha önce CertificateCard'da kullanılan gerçek asset) geri
   getirildi — yeni ikon paketi/dependency YOK. Belge no gerçek
   veriden (tourismDocumentNumber) gelir; koşul AYNEN (boş değilse).
─────────────────────────────────────────────────────────────── */
function CertificateItem({
  label,
  documentNumberLabel,
}: {
  label: string;
  documentNumberLabel: string;
}) {
  return (
    <div
      className="
        group/cert relative overflow-hidden
        flex flex-col items-center justify-center text-center
        rounded-2xl
        border border-[#0973BA]/15
        bg-gradient-to-br from-[#0973BA]/[0.07] via-white to-[#ED7926]/[0.06]
        hover:shadow-[0_12px_28px_-18px_rgba(9,115,186,0.28)]
        hover:-translate-y-0.5
        transition-all duration-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0
        px-3.5 py-3.5 md:py-4
        min-w-0
      "
    >
      <span
        aria-hidden="true"
        className="
          inline-flex items-center justify-center w-8 h-8 rounded-xl
          bg-white shadow-[inset_0_0_0_1px_rgba(11,31,58,0.06)]
          overflow-hidden
          transition-transform duration-300 motion-reduce:transition-none
          group-hover/cert:scale-110
        "
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/trust/turizm-bakanligi.svg"
          alt=""
          aria-hidden
          className="w-4 h-4 object-contain"
        />
      </span>
      <p className="mt-2.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#0973BA] leading-snug">
        {label}
      </p>
      <p className="mt-0.5 w-full text-[10.5px] md:text-[11px] font-medium text-[var(--color-stone-700)] leading-snug truncate">
        {documentNumberLabel}
      </p>
    </div>
  );
}
