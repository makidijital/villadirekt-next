"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Phone, Mail, MapPin } from "lucide-react";
import { usePathname } from "next/navigation";

import { resolveAssetUrlVersioned } from "@/lib/storage.helpers";
import type { Settings } from "@/app/services/settings.types";
/* 🛡️ PHASE 9B — TaxonomyItem/CorporatePage tipleri artık FooterWrapper'da
   tanımlı (veriyi ÜRETEN yer) — buradan `import type` ile alınır; runtime
   yan etkisi YOK (yalnız tip, derleme sonrası erişilmez). */
import type { TaxonomyItem, CorporatePage } from "./FooterWrapper";
/* 🛡️ PHASE 2 — UI Translation Dictionary Core.
   🛡️ PHASE 9B GÜNCELLEMESİ — Footer artık "use client"; DB/service
   erişimi tamamen FooterWrapper.tsx'e taşındı (bkz. o dosya). Locale,
   Header.tsx'teki (Phase 9A) ile BİREBİR AYNI mekanizmayla — zaten
   mevcut `usePathname()` sonucundan `localeFromPathname()` (Phase 9A,
   lib/i18n/config.ts) ile tespit edilip `getDictionary(locale)` HER
   RENDER'DA çağrılır (saf/ucuz fonksiyon — DB sorgusu YOK). TR
   route'larında (pathname `/en`/`/de` ile başlamıyorsa) dictionary
   ÖNCEKİ modül-seviyesi sabitle (`getDictionary(DEFAULT_LOCALE)`)
   BİREBİR AYNI değerleri döner — TR render çıktısı DEĞİŞMEDİ.
   Middleware/headers() KULLANILMADI — bu component zaten client
   olduğu için Header'daki gibi gerek yok; site-wide dynamic-rendering
   riski YOK (bkz. Phase 9B audit — bu tasarımın seçilme nedeni). */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import { DEFAULT_LOCALE, localeFromPathname } from "@/lib/i18n/config";
import { resolvePublicHome } from "@/lib/i18n/public-home";
/* 🛡️ NAVIGATION LOCALE PERSISTENCE — footer iç linkleri aktif locale'i
   taşır (bkz. lib/i18n/locale-href.ts). Dış bağlantılar (sosyal medya,
   tel/mailto) helper tarafından AYNEN geçirilir. */
import { localeHref } from "@/lib/i18n/locale-href";
/* 🛡️ PHASE 10L — admin'de girilen `footer_copyright` metninin EN/DE
   karşılığı (migration 083). Saf/senkron resolver; TR'de canonical
   değeri AYNEN döndürür (bkz. lib/i18n/settings-translation.helper.ts). */
import { resolveSettingsText } from "@/lib/i18n/settings-translation.helper";
/* 🛡️ PHASE 10H — villa tipi adı locale'e göre çözülür; çeviri yoksa
   canonical TR adı (saf helper, DB/server bağımlılığı YOK). */
import { resolveTaxonomyName } from "@/lib/i18n/taxonomy-name.helper";
import { categoryLinkHref, regionLinkHref } from "@/lib/taxonomy-landing";

/* ---------------- INLINE SOCIAL ICONS (stroke=currentColor) ---------------- */

const InstagramIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const FacebookIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

const YoutubeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
  </svg>
);

const TiktokIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
  </svg>
);

const WhatsappIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
  </svg>
);

/* ---------------- DRY HELPERS (dark-theme-aware) ---------------- */

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="
        group inline-flex items-center justify-center
        w-8 h-8 rounded-full
        border border-white/15 bg-white/[0.04]
        text-white/70
        hover:border-brand hover:bg-brand
        hover:text-white
        transition-[color,background-color,border-color]
        duration-300 motion-reduce:transition-none
        focus:outline-none focus-visible:ring-2
        focus-visible:ring-white/40
      "
    >
      {children}
    </a>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="
        inline-flex items-center
        text-[12.5px] leading-[1.45] text-white/60
        hover:text-[#8FAEFF]
        transition-colors duration-200
        motion-reduce:transition-none
        focus:outline-none focus-visible:text-white focus-visible:underline
      "
    >
      {children}
    </Link>
  );
}

/* 🛡️ SEO landing — kategori → `/villa-turleri/<slug>`; bölge GRUP
   KÖKÜ → `/bolgeler/<slug>`. Alt bölge / slug'sız kayıt ESKİ
   `/arama?<prefix>=<slug|id>` URL'inde kalır (lib/taxonomy-landing). */
function taxonomyHref(prefix: string, item: TaxonomyItem): string {
  return prefix === "bolgeler" ? regionLinkHref(item) : categoryLinkHref(item);
}

/* =================================================================
   ROOT COMPONENT — client
   🛡️ PHASE 9B: DB erişimi YOK — tüm veri FooterWrapper'dan props
   olarak gelir. Yalnız locale tespiti + dictionary lookup + render.
=================================================================== */

type FooterProps = {
  settings: Settings | null;
  locations: TaxonomyItem[];
  villaTypes: TaxonomyItem[];
  corporatePages: CorporatePage[];
  year: number;
  siteName: string;
  phoneDigits: string;
};

export default function Footer({
  settings,
  locations,
  villaTypes,
  corporatePages,
  year,
  siteName,
  phoneDigits,
}: FooterProps) {
  /* 🛡️ PHASE 9B — locale, Header.tsx (Phase 9A) ile BİREBİR AYNI şekilde
     `usePathname()` + `localeFromPathname()` ile saf/senkron türetilir;
     middleware/headers() gerektirmez. TR path'lerinde `dictionary`
     ÖNCEKİ modül-seviyesi sabitle (`getDictionary(DEFAULT_LOCALE)`)
     BİREBİR AYNI referans/değerleri döner. */
  const pathname = usePathname();
  const locale = localeFromPathname(pathname);
  const dictionary = getDictionary(locale);

  /* 🔄 TR ana sayfa yolu — varsayılan dil EN/DE iken "/" bir
     YÖNLENDİRİCİDİR, TR ana sayfa "/tr"'de yaşar. Logo linki "/"
     kalsaydı TR kullanıcı logoya basınca varsayılan dile geri
     düşerdi. `settings` prop'u ZATEN mevcut → YENİ PROP/FETCH YOK.
     Varsayılan "tr" veya multilingual kapalı → "/" (BYTE-IDENTICAL). */
  const { trHomeHref } = resolvePublicHome(settings);
  const homeHref =
    locale === DEFAULT_LOCALE ? trHomeHref : localeHref("/", locale);

  /* 🛡️ PHASE 10L §7 — `settings.translations` (migration 083) locale'e
     göre çözülür. `settings` prop'u zaten `getPublicSettings()`'ten
     geliyor; YENİ PROP EKLENMEDİ. TR'de sonuç canonical değerin
     KENDİSİDİR (aynı string referansı). */
  const copyrightTemplate = resolveSettingsText(
    settings?.footer_copyright,
    settings?.translations,
    locale,
    "footer_copyright"
  );

  const headingClass =
    "font-display text-[12px] font-semibold uppercase tracking-[0.12em] text-white mb-3";

  return (
    <footer
      aria-label={dictionary.footer.ariaLabel}
      /* 🔄 KOMPAKT KOYU FOOTER — lacivert düz zemin (gradient/glow YOK),
         üstte ince marka-mavisi çizgi, küçük tipografi. İçerik/href/i18n
         BİREBİR aynı; yalnız yerleşim + spacing + renkler değişti. */
      className="relative mt-12 md:mt-16 bg-[#0A1633] text-white/70 px-5 md:px-10 lg:px-16"
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-brand" />

      <div className="site-container">
        {/* ═════════ ÜST — marka | keşfet linkleri | iletişim ═════════ */}
        <div className="pt-10 md:pt-12 pb-8 md:pb-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
          {/* MARKA — logo + kısa açıklama + sosyal */}
          <div className="lg:col-span-4">
            <Link
              href={homeHref}
              className="font-display text-[22px] tracking-tight inline-flex items-center text-white"
            >
              {settings?.footer_logo || settings?.site_logo ? (
                /* 🛡️ mig 048 — footer_logo varsa onu, yoksa site_logo'ya
                   fallback. resolveAssetUrlVersioned normalize. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={
                    resolveAssetUrlVersioned(
                      settings.footer_logo,
                      settings.updated_at
                    ) ||
                    resolveAssetUrlVersioned(
                      settings.site_logo,
                      settings.updated_at
                    ) ||
                    ""
                  }
                  alt={`${siteName} logosu`}
                  className="h-9 w-auto object-contain"
                />
              ) : (
                <>
                  Villaya
                  <span className="text-brand ml-1">Gel</span>
                </>
              )}
            </Link>
            <p className="mt-3 text-[12.5px] leading-[1.6] text-white/55 max-w-[300px]">
              {dictionary.footer.tagline}
            </p>

            {/* Sosyal — settings'ten dinamik (mevcut API aynen) */}
            <div className="mt-4 flex items-center gap-2">
              {settings?.instagram && (
                <SocialLink href={settings.instagram} label="Instagram">
                  <InstagramIcon width={14} height={14} aria-hidden />
                </SocialLink>
              )}
              {settings?.facebook && (
                <SocialLink href={settings.facebook} label="Facebook">
                  <FacebookIcon width={14} height={14} aria-hidden />
                </SocialLink>
              )}
              {settings?.youtube && (
                <SocialLink href={settings.youtube} label="YouTube">
                  <YoutubeIcon width={14} height={14} aria-hidden />
                </SocialLink>
              )}
              {settings?.tiktok && (
                <SocialLink href={settings.tiktok} label="TikTok">
                  <TiktokIcon width={14} height={14} aria-hidden />
                </SocialLink>
              )}
              {phoneDigits && (
                <SocialLink
                  href={`https://wa.me/${phoneDigits}`}
                  label="WhatsApp"
                >
                  <WhatsappIcon width={14} height={14} aria-hidden />
                </SocialLink>
              )}
            </div>
          </div>

          {/* KEŞFET — villa tipleri + bölgeler (veri/link AYNEN) */}
          <div className="lg:col-span-5">
            <span className="inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/40">
              <span aria-hidden="true" className="inline-block w-3 h-px bg-brand" />
              {dictionary.footer.explore}
            </span>

            <div className="mt-3 grid grid-cols-2 gap-x-6 md:gap-x-8 gap-y-6">
              {/* VİLLA KATEGORİLERİ (dynamic villa_types) */}
              <nav aria-label={dictionary.footer.villaCategoriesAriaLabel}>
                <p className={headingClass}>{dictionary.footer.villas}</p>
                {villaTypes.length > 0 ? (
                  <ul className="space-y-1.5">
                    {villaTypes.map((t) => (
                      <li key={t.id}>
                        <FooterLink href={localeHref(taxonomyHref("villa-turleri", t), locale)}>
                          {resolveTaxonomyName(t.name, t.nameByLocale, locale)}
                        </FooterLink>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="space-y-1.5">
                    <li>
                      <FooterLink href={localeHref("/arama", locale)}>{dictionary.footer.allCategories}</FooterLink>
                    </li>
                  </ul>
                )}
              </nav>

              {/* POPÜLER BÖLGELER (dynamic villa_locations) */}
              <nav aria-label={dictionary.footer.popularRegionsAriaLabel}>
                <p className={headingClass}>{dictionary.footer.regions}</p>
                {locations.length > 0 ? (
                  <ul className="space-y-1.5">
                    {locations.map((loc) => (
                      <li key={loc.id}>
                        <FooterLink href={localeHref(taxonomyHref("bolgeler", loc), locale)}>
                          {loc.name}
                        </FooterLink>
                      </li>
                    ))}
                    <li className="pt-0.5">
                      <FooterLink href={localeHref("/arama", locale)}>
                        <span className="text-[12px] font-medium text-[#8FAEFF] inline-flex items-center gap-1">
                          {dictionary.footer.allRegions}
                          <ArrowRight size={11} strokeWidth={1.75} aria-hidden />
                        </span>
                      </FooterLink>
                    </li>
                  </ul>
                ) : (
                  <ul className="space-y-1.5">
                    <li>
                      <FooterLink href={localeHref("/arama", locale)}>{dictionary.footer.exploreAllRegions}</FooterLink>
                    </li>
                  </ul>
                )}
              </nav>
            </div>
          </div>

          {/* İLETİŞİM — telefon / e-posta / adres + rezervasyon sorgula + güven rozetleri */}
          <div className="lg:col-span-3 lg:pt-[42px]">
            {/* Başlıksız (ayrı "İletişim" başlığı kurumsal "İletişim"
                sayfa linkiyle çakışmasın); lg'de link listeleriyle aynı
                hizadan başlar. */}
            <ul className="space-y-2 text-[12.5px]">
              {settings?.phone && (
                <li>
                  <a
                    href={`tel:${settings.phone}`}
                    className="group inline-flex items-center gap-2 text-white/80 hover:text-[#8FAEFF] transition-colors duration-200 motion-reduce:transition-none"
                  >
                    <Phone size={13} strokeWidth={1.8} className="shrink-0 text-white/40 group-hover:text-[#8FAEFF]" aria-hidden />
                    <span className="sr-only">{dictionary.footer.phone}: </span>
                    <span className="font-semibold tabular-nums">{settings.phone}</span>
                  </a>
                </li>
              )}
              {settings?.email && (
                <li>
                  <a
                    href={`mailto:${settings.email}`}
                    className="group inline-flex items-center gap-2 text-white/70 hover:text-[#8FAEFF] transition-colors duration-200 motion-reduce:transition-none break-all"
                  >
                    <Mail size={13} strokeWidth={1.8} className="shrink-0 text-white/40 group-hover:text-[#8FAEFF]" aria-hidden />
                    <span className="sr-only">{dictionary.footer.email}: </span>
                    <span>{settings.email}</span>
                  </a>
                </li>
              )}
              {settings?.address && (
                <li className="flex items-start gap-2 text-white/55 leading-[1.5]">
                  <MapPin size={13} strokeWidth={1.8} className="shrink-0 mt-[2px] text-white/40" aria-hidden />
                  <span className="sr-only">{dictionary.footer.address}: </span>
                  <span>{settings.address}</span>
                </li>
              )}
              <li className="pt-1">
                {/* MÜŞTERİ İŞLEMLERİ — rezervasyon durum sorgulama (mevcut href AYNEN) */}
                <FooterLink href={localeHref("/rezervasyon-kontrol", locale)}>
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#8FAEFF]">
                    {dictionary.footer.checkReservation}
                    <ArrowRight size={11} strokeWidth={1.75} aria-hidden />
                  </span>
                </FooterLink>
              </li>
            </ul>

            {/* Güven / ödeme rozetleri — koyu zeminde okunsun diye küçük beyaz çip */}
            <div className="mt-4 inline-flex flex-wrap items-center gap-3 rounded-lg bg-white px-2.5 py-1.5">
              <Image
                src="/brand/trust/tursab.png"
                alt={dictionary.footer.tursabAlt}
                width={290}
                height={132}
                className="h-6 w-auto object-contain"
              />
              <Image
                src="/brand/trust/payment-methods.png"
                alt={dictionary.footer.paymentMethodsAlt}
                width={1400}
                height={400}
                className="h-6 w-auto object-contain"
              />
            </div>
          </div>
        </div>

        {/* ═════════ ALT BAR — copyright | kurumsal linkler | ajans imzası ═════════ */}
        <div className="border-t border-white/10 py-3 md:min-h-[48px] flex flex-col md:flex-row md:items-center md:justify-between gap-x-6 gap-y-2 text-[11.5px] text-white/50">
          {/* 🛡️ PHASE 10L §7 — locale-aware telif metni; `{year}` /
              `{site_name}` ikamesi resolver SONUCUNA uygulanır (AYNEN). */}
          <p>
              {copyrightTemplate
                ? copyrightTemplate
                    .replace(/\{year\}/g, String(year))
                    .replace(/\{site_name\}/g, siteName)
                : formatDictionaryString(
                    dictionary.footer.copyrightFallback,
                    { year, site_name: siteName }
                  )}
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {corporatePages.length > 0 && (
              <nav
                aria-label={dictionary.footer.corporateAriaLabel}
                className="flex flex-wrap items-center gap-x-4 gap-y-1"
              >
                {corporatePages.map((p) => (
                  <Link
                    key={p.id}
                    href={localeHref(`/p/${p.slug}`, locale)}
                    className="hover:text-[#8FAEFF] transition-colors duration-200 motion-reduce:transition-none"
                  >
                    {resolveTaxonomyName(p.title, p.nameByLocale, locale)}
                  </Link>
                ))}
              </nav>
            )}

            {/* 🛡️ Maki Dijital — ajans imzası (logo asset, href AYNEN). */}
            <a
              href="https://makidijital.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${dictionary.footer.webDevelopment}: Maki Dijital`}
              className="
                group inline-flex items-center gap-1.5
                text-white/45 hover:text-white
                transition-colors duration-200 motion-reduce:transition-none
                focus:outline-none focus-visible:ring-2
                focus-visible:ring-white/40 rounded-full px-1
              "
            >
              <span>{dictionary.footer.webDevelopment}</span>
              <span aria-hidden="true" className="text-white/25">:</span>
              <Image
                src="/brand/logos/Developer-Credit.png"
                alt="Maki Dijital"
                width={1254}
                height={1254}
                className="h-6 w-auto object-contain brightness-0 invert opacity-60 group-hover:opacity-100 transition-opacity duration-200 motion-reduce:transition-none"
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
