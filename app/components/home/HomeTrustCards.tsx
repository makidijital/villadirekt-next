import Link from "next/link";
import { BadgePercent, CalendarCheck, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { localeHref } from "@/lib/i18n/locale-href";

/* ===============================================================
   🛡️ HOME TRUST CARDS — Hero'nun hemen altındaki 3'lü avantaj bölümü
   ===============================================================
   - Beyaz, minimal yatay kartlar: ikon solda, başlık + açıklama sağda.
   - Metinler `home.advantages` dictionary'sinden (TR/EN/DE); component
     içinde hardcoded metin YOK.
   - "İptal Şartları" linki mevcut CMS sayfasına gider
     (`/p/rezervasyon-ve-iptal-kosullari` — ReservationForm ile AYNI
     sayfa), `localeHref` ile locale prefix'i korunur.
   - Grid: mobil 1 sütun · sm 2+1 · lg 3 eşit sütun. Gradient YOK.
   =============================================================== */

/* Mevcut CMS sayfası (yeni sayfa açılmadı). HAM canonical path —
   gerçek href `localeHref(...)` ile üretilir. */
const CANCELLATION_PATH = "/p/rezervasyon-ve-iptal-kosullari";

type TrustItem = {
  key: string;
  icon: LucideIcon;
  title: string;
  description: string;
  link?: { path: string; label: string };
};

export default function HomeTrustCards({
  locale = DEFAULT_LOCALE,
}: {
  locale?: Locale;
} = {}) {
  const t = getDictionary(locale).home.advantages;

  const items: TrustItem[] = [
    {
      key: "price",
      icon: BadgePercent,
      title: t.priceTitle,
      description: t.priceDescription,
    },
    {
      key: "easy",
      icon: CalendarCheck,
      title: t.easyTitle,
      description: t.easyDescription,
    },
    {
      key: "secure",
      icon: ShieldCheck,
      title: t.secureTitle,
      description: t.secureDescription,
      link: { path: CANCELLATION_PATH, label: t.cancellationLink },
    },
  ];

  return (
    <section
      aria-label={t.sectionAriaLabel}
      className="px-5 md:px-10 lg:px-16 pt-6 md:pt-8 pb-10 md:pb-14"
    >
      <div className="site-container">
        <ul
          role="list"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.key}
                className="
                  h-full min-w-0
                  flex items-center gap-4 md:gap-5
                  rounded-2xl bg-white
                  border border-[var(--color-stone-200)]
                  px-5 py-5 md:px-6 md:py-6
                  shadow-[0_10px_30px_-22px_rgba(0,0,0,0.25)]
                  transition-colors duration-200 motion-reduce:transition-none
                  hover:border-brand/25 hover:bg-brand/[0.02]
                  sm:last:col-span-2 lg:last:col-span-1
                "
              >
                <span
                  aria-hidden="true"
                  className="
                    shrink-0 w-12 h-12 rounded-xl
                    border border-[var(--color-stone-200)]
                    flex items-center justify-center
                    text-[var(--color-stone-500)]
                  "
                >
                  <Icon size={24} strokeWidth={1.6} />
                </span>

                <div className="min-w-0">
                  <h3 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.01em] text-[var(--color-stone-900)]">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-[14px] leading-[1.6] text-[var(--color-stone-500)]">
                    {item.description}
                  </p>
                  {item.link && (
                    <Link
                      href={localeHref(item.link.path, locale)}
                      className="mt-1.5 inline-block text-[13px] font-semibold text-brand underline-offset-2 hover:underline focus:outline-none focus-visible:underline"
                    >
                      {item.link.label}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
