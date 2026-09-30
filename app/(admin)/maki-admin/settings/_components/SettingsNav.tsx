"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings as SettingsIcon,
  Phone,
  Search as SeoIcon,
  CalendarDays,
  Wallet,
  AtSign,
  Plug,
  Wrench,
  Languages,
  Megaphone,
} from "lucide-react";

/* ===============================================================
   🛡️ SETTINGS NAV — sticky sub-navigation
   ===============================================================
   Desktop: sol sticky kolon (lg+).
   Mobile : üst pill scroller.
   Active path → highlight (border + champagne text).

   "Tümü (Klasik)" linki mevcut 1497-satırlık form'a giden
   /maki-admin/settings legacy URL. Yeni modüler experience
   hâkim, ama eski feature set'i (logo/watermark/hero upload,
   test mail) korunuyor → kullanıcı seçim yapar.
   =============================================================== */

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  exact?: boolean;
};

const ITEMS: NavItem[] = [
  { href: "/maki-admin/settings/genel", label: "Genel", icon: SettingsIcon },
  { href: "/maki-admin/settings/iletisim", label: "İletişim", icon: Phone },
  { href: "/maki-admin/settings/seo", label: "SEO", icon: SeoIcon },
  { href: "/maki-admin/settings/rezervasyon", label: "Rezervasyon", icon: CalendarDays },
  { href: "/maki-admin/settings/odeme", label: "Ödeme", icon: Wallet },
  { href: "/maki-admin/settings/sosyal-medya", label: "Sosyal Medya", icon: AtSign },
  { href: "/maki-admin/settings/entegrasyonlar", label: "Entegrasyonlar", icon: Plug },
  { href: "/maki-admin/settings/gelismis", label: "Gelişmiş", icon: Wrench },
  /* 🛡️ PHASE 10K — settings'in yönetilebilir doğal dil metinlerinin
     EN/DE içerikleri. Mevcut 8 bölümün sırası/yapısı DEĞİŞMEDİ. */
  { href: "/maki-admin/settings/ceviriler", label: "Çeviriler", icon: Languages },
  /* 🛡️ Açılış/kampanya popup'ı (migration 095) — ayrı tablo, ayrı
     action'lar; mevcut bölümler DEĞİŞMEDİ (yalnız sona eklendi). */
  { href: "/maki-admin/settings/popup", label: "Açılış Popup", icon: Megaphone },
];

export default function SettingsNav() {
  const pathname = usePathname() || "";

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {/* MOBILE — horizontal pills */}
      <nav
        aria-label="Ayarlar bölümleri"
        className="lg:hidden -mx-5 md:-mx-8 px-5 md:px-8 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ul className="flex gap-2 pb-3 w-max">
          {ITEMS.map((it) => {
            const Icon = it.icon;
            const active = isActive(it.href, it.exact);
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  className={
                    "inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3.5 py-2 rounded-full transition whitespace-nowrap " +
                    (active
                      ? "bg-[var(--color-stone-900)] text-white"
                      : "bg-[var(--color-sand-50)] text-[var(--color-stone-700)] hover:bg-[var(--color-sand-100)]")
                  }
                >
                  <Icon size={12} />
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* DESKTOP — sticky sidebar */}
      <nav
        aria-label="Ayarlar bölümleri"
        className="hidden lg:block sticky top-24 self-start"
      >
        <p className="text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] mb-3 px-3">
          Ayarlar
        </p>
        <ul className="space-y-0.5">
          {ITEMS.map((it) => {
            const Icon = it.icon;
            const active = isActive(it.href, it.exact);
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  className={
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition " +
                    (active
                      ? "bg-[var(--color-stone-900)] text-white"
                      : "text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)] hover:text-[var(--color-stone-900)]")
                  }
                >
                  <Icon
                    size={14}
                    className={
                      active
                        ? "text-white/90"
                        : "text-[var(--color-stone-500)]"
                    }
                  />
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
