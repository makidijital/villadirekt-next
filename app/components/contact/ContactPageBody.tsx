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
import PageHero from "@/app/components/ui/PageHero";
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
        icon: <Phone size={17} />,
        label: dict.info.phone,
        value: phone,
        href: `tel:${phone.replace(/\s/g, "")}`,
      },
      whatsappLink && {
        icon: <MessageCircle size={17} />,
        label: "WhatsApp",
        value: phone || whatsappLink,
        href: whatsappLink,
        external: true,
      },
      email && {
        icon: <Mail size={17} />,
        label: dict.info.email,
        value: email,
        href: `mailto:${email}`,
      },
      businessHours && {
        icon: <Clock size={17} />,
        label: dict.info.businessHours,
        value: businessHours,
      },
      address && {
        icon: <MapPin size={17} />,
        label: dict.info.location,
        value: address,
      },
    ] as (Row | false | null)[]
  ).filter((r): r is Row => !!r);

  /* SOCIAL ROWS — sadece dolu olan platformlar. */
  const socialRows: Row[] = (
    [
      instagram && {
        icon: <AtSign size={17} />,
        label: "Instagram",
        value: extractHandle(instagram) || instagram,
        href: instagram,
        external: true,
      },
      facebook && {
        icon: <Globe size={17} />,
        label: "Facebook",
        value: extractHandle(facebook) || facebook,
        href: facebook,
        external: true,
      },
      youtube && {
        icon: <Tv size={17} />,
        label: "YouTube",
        value: extractHandle(youtube) || youtube,
        href: youtube,
        external: true,
      },
      tiktok && {
        icon: <Music2 size={17} />,
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

  return (
    <>
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={organizationLd} />

      {/* HERO — paylaşılan PageHero (kompakt editorial band) */}
      <PageHero
        breadcrumb={[
          { name: breadcrumbHome, href: localeHref("/", locale) },
          { name: breadcrumbCurrent },
        ]}
        eyebrow={dict.hero.eyebrow}
        title={dict.hero.title}
        description={dict.hero.description}
      />

      {/* ============================================================
          CONTACT EXPERIENCE — dekoratif gradient + glass form
      ============================================================ */}
      <div className="relative overflow-hidden bg-gradient-to-b from-white via-[var(--color-sand-50)]/40 to-white">
        {/* DECOR — hafif gradient blur küreler (pointer-events yok) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
        >
          <div className="absolute -top-40 -right-24 w-[560px] h-[560px] rounded-full bg-[var(--brand-coral)]/10 blur-[130px]" />
          <div className="absolute top-1/3 -left-44 w-[520px] h-[520px] rounded-full bg-[var(--color-champagne-500)]/15 blur-[130px]" />
          <div className="absolute bottom-10 right-1/4 w-[440px] h-[440px] rounded-full bg-[var(--color-sand-100)]/60 blur-[110px]" />
        </div>

        <div className="relative z-10">

          {/* GRID — sol iletişim/sosyal, sağ glass form */}
          <section className="px-5 md:px-10 lg:px-16 pt-12 md:pt-16 pb-24 md:pb-32">
            <div className="max-w-[1280px] mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
                {/* LEFT — bilgi + sosyal kartlar */}
                <aside className="lg:col-span-5 space-y-8">
                  {hasContactRows && (
                    <div>
                      <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)] mb-5">
                        <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
                        {dict.info.title}
                      </p>
                      <div className="space-y-3">
                        {contactRows.map((r, i) => (
                          <InfoRow key={`c-${i}`} {...r} />
                        ))}
                      </div>
                    </div>
                  )}

                  {hasSocialRows && (
                    <div>
                      <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)] mb-5">
                        <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
                        {dict.info.socialMedia}
                      </p>
                      <div className="space-y-3">
                        {socialRows.map((r, i) => (
                          <InfoRow key={`s-${i}`} {...r} />
                        ))}
                      </div>
                    </div>
                  )}
                </aside>

                {/* RIGHT — glass form kartı */}
                <div className="lg:col-span-7">
                  <div className="relative rounded-[28px] border border-white/70 bg-white/60 backdrop-blur-xl shadow-[0_28px_80px_-32px_rgba(27,26,23,0.28)] p-6 md:p-10">
                    {/* iç parıltı */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent"
                    />
                    <div className="mb-7 md:mb-9">
                      <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-champagne-700)]">
                        <span className="inline-block w-6 h-px bg-[var(--color-champagne-500)]/60 align-middle mr-2" />
                        {dict.form.eyebrow}
                      </p>
                      <h2 className="font-display text-[28px] md:text-[38px] text-[var(--color-stone-900)] mt-4 leading-[1.08] tracking-[-0.025em]">
                        {dict.form.title}
                      </h2>
                      <p className="text-[14px] text-[var(--color-stone-500)] mt-3 leading-relaxed">
                        {dict.form.description}
                      </p>
                    </div>
                    <ContactForm locale={locale} />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ============================================================
          MAP — modern container
      ============================================================ */}
      <section className="px-5 md:px-10 lg:px-16 pb-24 md:pb-32">
        <div className="max-w-[1280px] mx-auto">
          <div className="flex items-end justify-between gap-6 mb-8 md:mb-12">
            <div>
              <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
                <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
                {dict.map.eyebrow}
              </p>
              <h2 className="font-display text-[28px] md:text-[42px] lg:text-[50px] text-[var(--color-stone-900)] mt-4 leading-[1.05] tracking-[-0.02em]">
                {dict.map.title}
              </h2>
            </div>
          </div>
          <div className="relative rounded-[28px] p-1.5 bg-gradient-to-br from-[var(--color-sand-100)] via-white to-[var(--color-sand-50)] border border-[var(--color-stone-100)] shadow-[0_28px_80px_-40px_rgba(27,26,23,0.3)]">
            <div className="relative aspect-[16/10] md:aspect-[21/9] rounded-[22px] overflow-hidden bg-[var(--color-sand-50)]">
              <iframe
                title={dict.map.iframeTitle}
                src={
                  address
                    ? `https://www.google.com/maps?q=${encodeURIComponent(address)}&z=11&output=embed`
                    : "https://www.google.com/maps?q=Kalkan%2C+Kas%2C+Antalya&z=11&output=embed"
                }
                className="absolute inset-0 w-full h-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          FAQ — yeniden tasarım (numaralı premium kartlar)
      ============================================================ */}
      <section className="px-5 md:px-10 lg:px-16 pb-24 md:pb-32">
        <div className="max-w-[1280px] mx-auto">
          <div className="mb-12 md:mb-16">
            <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
              <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
              {dict.faq.eyebrow}
            </p>
            <h2 className="font-display text-[32px] md:text-[48px] lg:text-[54px] text-[var(--color-stone-900)] mt-6 leading-[1.03] tracking-[-0.025em] max-w-xl">
              {dict.faq.title}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
            <FaqBlock
              index="01"
              q={dict.faq.items.responseTime.question}
              a={dict.faq.items.responseTime.answer}
            />
            <FaqBlock
              index="02"
              q={dict.faq.items.dates.question}
              a={dict.faq.items.dates.answer}
            />
            <FaqBlock
              index="03"
              q={dict.faq.items.customOffer.question}
              a={dict.faq.items.customOffer.answer}
            />
          </div>
        </div>
      </section>

      {/* ============================================================
          CTA — yeniden tasarım (premium koyu panel + coral aksan)
      ============================================================ */}
      <section className="px-5 md:px-10 lg:px-16 pb-32 md:pb-44">
        <div className="max-w-[1100px] mx-auto">
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-[#0B1F3A] to-[#132A46] px-8 md:px-16 py-16 md:py-24 text-center shadow-[0_40px_100px_-40px_rgba(11,31,58,0.6)]">
            {/* dekoratif coral glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[520px] h-[320px] rounded-full bg-[var(--brand-coral)]/20 blur-[120px]"
            />
            <div className="relative">
              <p className="inline-flex items-center gap-2 text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--brand-coral)]">
                <span className="inline-block w-6 h-px bg-[var(--brand-coral)]/60" />
                {dict.cta.eyebrow}
              </p>
              <h2 className="font-display text-[32px] md:text-[54px] lg:text-[60px] text-white mt-6 leading-[1.03] tracking-[-0.03em]">
                {dict.cta.titleLead}
                <br />
                <span className="text-white/50">{dict.cta.titleAccent}</span>
              </h2>
              <p className="text-white/70 mt-6 leading-relaxed max-w-xl mx-auto">
                {dict.cta.description}
              </p>
              <div className="mt-10">
                <Link
                  href={localeHref("/arama", locale)}
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-white text-[var(--color-stone-900)] text-[13.5px] font-medium tracking-[0.04em] hover:bg-white/90 transition-colors shadow-[0_18px_40px_-18px_rgba(0,0,0,0.5)]"
                >
                  {dict.cta.button} <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
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
        "group relative flex items-center gap-4 rounded-2xl border border-[var(--color-stone-100)] bg-white/70 backdrop-blur-sm px-4 py-4 transition-all duration-300 motion-reduce:transition-none " +
        (isLink
          ? "hover:-translate-y-0.5 hover:border-[var(--color-champagne-500)]/40 hover:shadow-[0_18px_44px_-22px_rgba(27,26,23,0.28)] hover:bg-white"
          : "")
      }
    >
      <span className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-[var(--color-sand-100)] to-white ring-1 ring-[var(--color-stone-100)] text-[var(--color-champagne-700)] transition-colors duration-300 group-hover:from-[var(--brand-coral)] group-hover:to-[var(--brand-coral-deep)] group-hover:text-white group-hover:ring-transparent">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] tracking-[0.22em] uppercase font-medium text-[var(--color-stone-500)]">
          {label}
        </p>
        <p className="text-[15px] md:text-[15.5px] text-[var(--color-stone-900)] mt-1 leading-[1.4] break-words whitespace-pre-line">
          {value}
        </p>
      </div>
      {isLink ? (
        <span
          aria-hidden="true"
          className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full border border-[var(--color-stone-200)] text-[var(--color-stone-400)] transition-all duration-300 group-hover:border-[var(--color-champagne-500)] group-hover:text-[var(--color-champagne-700)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        >
          <ArrowUpRight size={13} />
        </span>
      ) : null}
    </Wrapper>
  );
}

/* FAQ — numaralı premium kart */
function FaqBlock({
  index,
  q,
  a,
}: {
  index: string;
  q: string;
  a: string;
}) {
  return (
    <div className="group rounded-3xl border border-[var(--color-stone-100)] bg-white/70 backdrop-blur-sm p-6 md:p-7 transition-all duration-300 motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-[0_22px_50px_-26px_rgba(27,26,23,0.25)] hover:border-[var(--color-champagne-500)]/30">
      <span className="font-display text-[15px] text-[var(--color-champagne-700)] tabular-nums">
        {index}
      </span>
      <h3 className="font-display text-[19px] md:text-[21px] text-[var(--color-stone-900)] mt-3 leading-[1.25] tracking-[-0.01em]">
        {q}
      </h3>
      <p className="text-[14px] md:text-[14.5px] leading-[1.7] text-[var(--color-stone-500)] mt-4">
        {a}
      </p>
    </div>
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
