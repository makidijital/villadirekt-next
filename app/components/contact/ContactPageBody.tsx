import Link from "next/link";
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  MessageCircle,
  AtSign,
  ArrowUpRight,
  Globe,
  Tv,
  Music2,
} from "lucide-react";

import { getCachedSettings } from "@/lib/cache.helpers";
import {
  JsonLd,
  buildBreadcrumb,
  buildOrganization,
} from "@/app/components/seo/StructuredData";
import PublicBreadcrumb from "@/app/components/ui/PublicBreadcrumb";
import ContactForm from "@/app/(public)/iletisim/ContactForm";

/* 🛡️ PUBLIC İLETİŞİM ÇOKLU DİL — `/kiralik-villalar` (KiralikVillalarPageBody)
   deseninin BİREBİR aynısı. Statik UI metinleri MEVCUT public dictionary'den
   (`contact` namespace); veri akışı (`getCachedSettings`), DOM/CSS, JSON-LD ve
   form submit akışı DEĞİŞTİRİLMEDİ. Yeni routing/i18n sistemi kurulmadı. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
/* 🛡️ NAVIGATION LOCALE PERSISTENCE — iç link aktif locale'i taşır
   (bkz. lib/i18n/locale-href.ts). */
import { localeHref } from "@/lib/i18n/locale-href";
/* 🛡️ `business_hours` DEĞERİ admin'in girdiği dinamik metindir; çevirisi
   `settings_translations` (migration 087) üzerinden MEVCUT resolver ile
   çözülür — yeni resolver YAZILMADI. Telefon/e-posta/adres/sosyal URL'ler
   VERİdir ve ÇEVRİLMEZ. */
import { resolveSettingsText } from "@/lib/i18n/settings-translation.helper";

/* ===============================================================
   🛡️ /iletisim — ORTAK GÖVDE (settings-driven, no hardcoded data)
   ===============================================================
   Bu dosya `app/(public)/iletisim/page.tsx`'in GERÇEK gövdesinin
   TAŞINMIŞ hâlidir (DOM/CSS/veri akışı DEĞİŞTİRİLMEDEN) — `/en/iletisim`
   ve `/de/iletisim` AYNI gövdeyi render eder; kodun ikinci/üçüncü
   kopyası YOKTUR (`KiralikVillalarPageBody` / `AramaPageBody` deseni).

   Tüm iletişim, sosyal, çalışma saatleri verisi `getCachedSettings`
   source-of-truth'tan beslenir. Hardcoded fallback YOK:
     - phone / email / address / business_hours yoksa → satır gizli
     - instagram / facebook / youtube / tiktok yoksa → satır gizli
     - whatsapp_link yoksa → satır gizli

   Schema.org Organization sameAs[]: instagram/facebook/youtube/
   tiktok URL'lerinden derlenir (boşlar filter edilir).
   =============================================================== */

/* InfoRow internal type — filter(Boolean) pattern için. */
type Row = {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  external?: boolean;
};

type Props = {
  /** Opsiyonel — verilmezse "tr" → TR çıktısı BİREBİR eskisi gibi. */
  locale?: Locale;
};

export default async function ContactPageBody({
  locale = DEFAULT_LOCALE,
}: Props) {
  const dict = getDictionary(locale).contact;
  const settings = await getCachedSettings().catch(() => null);

  const phone = settings?.phone?.trim() || null;
  const email = settings?.email?.trim() || null;
  const address = settings?.address?.trim() || null;
  /* 🛡️ TEK ÇEVRİLEBİLİR SETTINGS ALANI. TR'de `resolveSettingsText`
     canonical'ı AYNEN döner (sorgu YOK); EN/DE'de çeviri varsa o, yoksa/
     boşsa/whitespace ise canonical TR. `settings.translations` ZATEN
     `getPublicSettings` içinde (multilingual açıkken) yüklenmiştir —
     EK SORGU YOK, N+1 YOK. */
  const businessHours =
    resolveSettingsText(
      settings?.business_hours,
      settings?.translations ?? null,
      locale,
      "business_hours"
    )?.trim() || null;
  const whatsappLink = settings?.whatsapp_link?.trim() || null;
  const instagram = settings?.instagram?.trim() || null;
  const facebook = settings?.facebook?.trim() || null;
  const youtube = settings?.youtube?.trim() || null;
  const tiktok = settings?.tiktok?.trim() || null;
  const brand = settings?.site_name?.trim() || "Villa Kiralama";

  /* CONTACT ROWS — filter(Boolean), sadece dolu olanlar DOM'a. */
  const contactRows: Row[] = (
    [
      phone && {
        icon: <Phone size={16} />,
        label: dict.info.phone,
        value: phone,
        href: `tel:${phone.replace(/\s/g, "")}`,
      },
      whatsappLink && {
        icon: <MessageCircle size={16} />,
        label: "WhatsApp",
        value: phone || whatsappLink,
        href: whatsappLink,
        external: true,
      },
      email && {
        icon: <Mail size={16} />,
        label: dict.info.email,
        value: email,
        href: `mailto:${email}`,
      },
      businessHours && {
        icon: <Clock size={16} />,
        label: dict.info.businessHours,
        value: businessHours,
      },
      address && {
        icon: <MapPin size={16} />,
        label: dict.info.location,
        value: address,
      },
    ] as (Row | false | null)[]
  ).filter((r): r is Row => !!r);

  /* SOCIAL ROWS — sadece dolu olan platformlar. */
  const socialRows: Row[] = (
    [
      instagram && {
        icon: <AtSign size={16} />,
        label: "Instagram",
        value: extractHandle(instagram) || instagram,
        href: instagram,
        external: true,
      },
      facebook && {
        icon: <Globe size={16} />,
        label: "Facebook",
        value: extractHandle(facebook) || facebook,
        href: facebook,
        external: true,
      },
      youtube && {
        icon: <Tv size={16} />,
        label: "YouTube",
        value: extractHandle(youtube) || youtube,
        href: youtube,
        external: true,
      },
      tiktok && {
        icon: <Music2 size={16} />,
        label: "TikTok",
        value: extractHandle(tiktok) || tiktok,
        href: tiktok,
        external: true,
      },
    ] as (Row | false | null)[]
  ).filter((r): r is Row => !!r);

  const hasContactRows = contactRows.length > 0;
  const hasSocialRows = socialRows.length > 0;

  /* 🛡️ Breadcrumb metinleri MEVCUT key'lerden REUSE edilir — yeni key
     açılmadı. TR'de `locale === DEFAULT_LOCALE` → `inLanguage` EKLENMEZ,
     JSON-LD çıktısı BYTE-IDENTICAL kalır (bkz. buildBreadcrumb, Phase 7D). */
  const breadcrumbHome = getDictionary(locale).search.breadcrumbHome;
  const breadcrumbCurrent = getDictionary(locale).header.contact;

  const breadcrumbLd = buildBreadcrumb(
    [{ name: breadcrumbHome, url: "/" }, { name: breadcrumbCurrent }],
    locale === DEFAULT_LOCALE ? undefined : locale
  );

  /* 🛡️ Organization JSON-LD — same source-of-truth as homepage.
     sameAs sosyal URL'lerden, legalName company_legal_name'den. */
  const organizationLd = buildOrganization({
    name: brand,
    legalName: settings?.company_legal_name || null,
    logo: settings?.site_logo || null,
    phone,
    email,
    address,
    sameAs: [instagram, facebook, youtube, tiktok],
  });

  /* 🎨 UI REDESIGN — "müşteri destek merkezi": #F7F9FC zemin, ortak
     PublicBreadcrumb, kompakt başlık, sol hızlı iletişim / sağ form
     (~%45 / %55), ardından CTA. Harita ve SSS bölümleri kaldırıldı
     (adres bilgisi sol iletişim satırında AYNEN).
     Veri (settings), satır koşulları, href'ler, JSON-LD ve form akışı
     BİREBİR AYNI — yalnız JSX/className değişti. */
  return (
    <div className="bg-[#F7F9FC]">
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={organizationLd} />

      <div className="section-narrow pt-6 md:pt-10 pb-16 md:pb-24">
        <PublicBreadcrumb
          className="mb-6 md:mb-8"
          items={[
            { name: breadcrumbHome, href: localeHref("/", locale) },
            { name: breadcrumbCurrent },
          ]}
        />

        {/* HEADER — kompakt */}
        <header className="max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#1B4EF5]">
            {dict.hero.pageEyebrow}
          </p>
          <h1 className="mt-2 font-display font-bold text-[28px] md:text-[34px] leading-tight tracking-[-0.02em] text-[#0A1633]">
            {dict.hero.pageTitle}
          </h1>
          <p className="mt-2.5 text-[13.5px] md:text-[14.5px] leading-relaxed text-[#5B6478]">
            {dict.hero.description}
          </p>
        </header>

        {/* ANA LAYOUT — sol hızlı iletişim (~%45) / sağ form (~%55) */}
        <div className="mt-6 md:mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] gap-5 lg:gap-7 items-start">
          <aside className="min-w-0 space-y-5">
            {hasContactRows && (
              <section aria-labelledby="contact-info-title">
                <h2
                  id="contact-info-title"
                  className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#64708A]"
                >
                  {dict.info.title}
                </h2>
                <div className="space-y-2.5">
                  {contactRows.map((r, i) => (
                    <InfoRow key={`c-${i}`} {...r} />
                  ))}
                </div>
              </section>
            )}

            {/* WHATSAPP CTA — mevcut whatsapp_link (satırla AYNI href) */}
            {whatsappLink && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 h-[50px] rounded-[12px] bg-[#00A86B] px-5 text-[14px] font-semibold text-white hover:bg-[#009160] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00A86B]/40"
              >
                <MessageCircle size={17} strokeWidth={1.9} aria-hidden="true" />
                {dict.info.whatsappCta}
              </a>
            )}

            {hasSocialRows && (
              <section aria-labelledby="contact-social-title">
                <h2
                  id="contact-social-title"
                  className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#64708A]"
                >
                  {dict.info.socialMedia}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5">
                  {socialRows.map((r, i) => (
                    <InfoRow key={`s-${i}`} {...r} />
                  ))}
                </div>
              </section>
            )}
          </aside>

          {/* FORM KARTI */}
          <section
            aria-labelledby="contact-form-title"
            className="min-w-0 rounded-[18px] border border-[#E5E7EB] bg-white shadow-[0_10px_30px_-20px_rgba(10,22,51,0.2)] p-5 md:p-7"
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#8A93A6]">
              {dict.form.eyebrow}
            </p>
            <h2
              id="contact-form-title"
              className="mt-1 font-display font-bold text-[20px] md:text-[22px] leading-tight tracking-[-0.015em] text-[#0A1633]"
            >
              {dict.form.cardTitle}
            </h2>
            <p className="mt-1.5 mb-5 md:mb-6 text-[13px] leading-relaxed text-[#64708A]">
              {dict.form.description}
            </p>
            <ContactForm locale={locale} />
          </section>
        </div>

        {/* CTA — sade navy panel (gradient/glow YOK), link AYNEN */}
        <section className="mt-10 md:mt-14">
          <div className="rounded-[18px] bg-[#0A1633] px-6 py-8 md:px-10 md:py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-5 md:gap-8">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FAD716]">
                {dict.cta.eyebrow}
              </p>
              <h2 className="mt-2 font-display font-bold text-[22px] md:text-[26px] leading-tight tracking-[-0.02em] text-white">
                {dict.cta.titleLead}{" "}
                <span className="text-white/60">{dict.cta.titleAccent}</span>
              </h2>
              <p className="mt-2 max-w-xl text-[13px] md:text-[14px] leading-relaxed text-white/70">
                {dict.cta.description}
              </p>
            </div>
            <Link
              href={localeHref("/arama", locale)}
              className="shrink-0 inline-flex items-center justify-center gap-2 h-[50px] px-6 rounded-[12px] bg-white text-[14px] font-semibold text-[#0A1633] hover:bg-[#EEF3FF] transition-colors motion-reduce:transition-none"
            >
              {dict.cta.button} <ArrowUpRight size={15} />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ===============================================================
   InfoRow — hover-animasyonlu iletişim/sosyal kartı
=============================================================== */
function InfoRow({
  icon,
  label,
  value,
  href,
  external,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  external?: boolean;
}) {
  const isLink = !!href;
  const Wrapper: React.ElementType = isLink ? "a" : "div";
  const linkProps = isLink
    ? {
        href,
        ...(external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {}),
      }
    : {};
  return (
    <Wrapper
      {...linkProps}
      className={
        "group flex items-center gap-3 min-h-[64px] rounded-[14px] border border-[#E5E7EB] bg-white px-4 py-3 min-w-0 transition-[border-color,transform,box-shadow] duration-200 motion-reduce:transition-none " +
        (isLink
          ? "hover:border-[#1B4EF5]/40 hover:-translate-y-px hover:shadow-[0_6px_16px_-10px_rgba(27,78,245,0.35)] motion-reduce:hover:translate-y-0"
          : "")
      }
    >
      <span
        aria-hidden="true"
        className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-[10px] bg-[#EEF3FF] text-[#1B4EF5]"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64708A]">
          {label}
        </p>
        <p className="mt-0.5 text-[13px] font-medium leading-[1.45] text-[#0A1633] break-words [overflow-wrap:anywhere] whitespace-pre-line">
          {value}
        </p>
      </div>
      {isLink ? (
        <ArrowUpRight
          size={15}
          aria-hidden="true"
          className="shrink-0 text-[#A3ACBD] transition-colors group-hover:text-[#1B4EF5]"
        />
      ) : null}
    </Wrapper>
  );
}

/* Instagram/Facebook/YouTube/TikTok URL'inden display handle çıkar.
   instagram.com/handle → "@handle". URL pars edilemezse null. */
function extractHandle(url: string): string | null {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean)[0];
    if (!seg) return null;
    return seg.startsWith("@") ? seg : `@${seg.replace(/^@/, "")}`;
  } catch {
    return null;
  }
}
