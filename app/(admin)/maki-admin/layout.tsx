"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  getAdminLogoUrl,
  getAdminIconUrl,
} from "@/lib/admin-branding";
import { useAdminBrandingVersions } from "@/app/components/admin/AdminBrandingVersion";
import { adminFontVariables } from "./admin-fonts";
import {
  LayoutDashboard,
  Home,
  Settings,
  LogOut,
  Layers,
  CalendarDays,
  FileText,
  Newspaper,
  MapPin,
  CreditCard,
  Landmark,
  CalendarRange,
  Menu,
  X,
  Eye,
  Bell,
  ShieldCheck,
  BadgeCheck,
  Activity,
  History,
  Users,
  Palette,
  Inbox,
  HelpCircle,
  Star,
  Sparkles,
  Wallet,
  Share2,
  Tag,
} from "lucide-react";

import {
  AdminSessionGuard,
  useAdmin,
} from "@/app/components/admin/AdminSessionGuard";

import { NotificationProvider } from "@/app/components/admin/notifications/NotificationProvider";
import { NotificationBell } from "@/app/components/admin/notifications/NotificationBell";

/* 🛡️ SIDEBAR BADGE COUNTS — 4 menü öğesi (Rezervasyonlar / Teklif
   Talepleri / Mesajlar / Yorumlar) için MEVCUT server action/route'lar
   reuse edilir. Yeni repository/servis/DB alanı YOK — aşağıdaki
   fonksiyonlar ilgili admin sayfalarının ZATEN çağırdığı fonksiyonların
   birebir aynısı. */
import { adminFetch } from "@/lib/admin-fetch";
import { getOfferRequestsAction } from "./offer-requests/offer-requests.action";
import { listMessagesAction } from "./messages/messages.action";
import { getVillaReviewsForAdminAction } from "@/app/services/villa-review.action";

type MenuItem = {
  name: string;
  href: string;
  icon: any;
  /** SIDEBAR_PERMISSIONS içindeki key — auth bağlandığında filtrelenir */
  permissionKey: string;
};

type MenuGroup = {
  label: string;
  items: MenuItem[];
};

const menuGroups: MenuGroup[] = [
  {
    label: "Genel",
    items: [
      {
        name: "Dashboard",
        href: "/maki-admin",
        icon: LayoutDashboard,
        permissionKey: "dashboard",
      },
    ],
  },
  {
    label: "Mülkler",
    items: [
      {
        name: "Mülkler",
        href: "/maki-admin/villas",
        icon: Home,
        permissionKey: "villas",
      },
      {
        name: "Mülk Tipleri",
        href: "/maki-admin/types",
        icon: Layers,
        permissionKey: "villa_types",
      },
      {
        name: "Olanaklar",
        href: "/maki-admin/features",
        icon: Layers,
        permissionKey: "features",
      },
      {
        name: "Kurallar",
        href: "/maki-admin/rules",
        icon: ShieldCheck,
        permissionKey: "rules",
      },
      {
        name: "Fiyata Dahil",
        href: "/maki-admin/price-includes",
        icon: BadgeCheck,
        permissionKey: "price_includes",
      },
      {
        name: "Bölgeler",
        href: "/maki-admin/locations",
        icon: MapPin,
        permissionKey: "locations",
      },
      {
        name: "Mülk Listesi",
        href: "/maki-admin/villa-listesi",
        icon: Share2,
        permissionKey: "villa_lists",
      },
      {
        /* 🛡️ Mülk Sahipleri — minimal owner kaydı + villa bağlantısı.
           İkon: mevcut import'lu Users (reuse; import churn yok). */
        name: "Mülk Sahipleri",
        href: "/maki-admin/property-owners",
        icon: Users,
        permissionKey: "property_owners",
      },
    ],
  },
  {
    label: "Rezervasyon",
    items: [
      {
        name: "Rezervasyonlar",
        href: "/maki-admin/reservations",
        icon: CalendarDays,
        permissionKey: "reservations",
      },
      {
        name: "Harici Rezervasyonlar",
        href: "/maki-admin/manual-reservations",
        icon: CalendarRange,
        permissionKey: "manual_reservations",
      },
      {
        /* 🛡️ FAZ 56G — iCal sync external rezervasyonları (Airbnb /
           Booking / VRBO availability blocker'ları). Bunlar GERÇEK
           rezervasyon DEĞİL — read-only operations view. Manuel
           bloklar ile karıştırılmaması için ayrı menu + farklı isim. */
        name: "iCal Rezervasyonları",
        href: "/maki-admin/external-reservations",
        icon: CalendarRange,
        permissionKey: "external_calendars",
      },
      {
        /* 🛡️ FAZ 40 — Concierge teklif talepleri. */
        name: "Teklif Talepleri",
        href: "/maki-admin/offer-requests",
        icon: Sparkles,
        permissionKey: "offer_requests",
      },
      {
        name: "Ödeme Yöntemleri",
        href: "/maki-admin/payment-methods",
        icon: CreditCard,
        permissionKey: "payment_methods",
      },
      {
        name: "Firma Hesap Bilgileri",
        href: "/maki-admin/payment-accounts",
        icon: Landmark,
        permissionKey: "payment_accounts",
      },
    ],
  },
  {
    /* 🛡️ Maki Finans foundation — komisyon raporları, gelir analizi,
       tahsilat, owner payout vb. ileride buraya eklenecek. Şimdilik
       read-only KPI snapshot sayfası. */
    label: "Finans",
    items: [
      {
        name: "Maki Finans",
        href: "/maki-admin/maki-finans",
        icon: Wallet,
        permissionKey: "finance",
      },
    ],
  },
  {
    label: "İçerik",
    items: [
      {
        name: "Sayfalar",
        href: "/maki-admin/pages",
        icon: FileText,
        permissionKey: "pages",
      },
      {
        /* 🛡️ Blog Yazıları — İçerik grubu. Kendi permission key'i
           ("blog"); ÖNCEDEN `pages` REUSE ediliyordu. Ayrı key sayesinde
           admin bazında açılıp kapatılabilir. Mevcut admin'lere
           migration 093 backfill eder → menü kimsede kaybolmaz.
           `pages` item'ı (Sayfalar) DEĞİŞMEDİ. */
        name: "Blog Yazıları",
        href: "/maki-admin/blog",
        icon: Newspaper,
        permissionKey: "blog",
      },
      {
        name: "Menü",
        href: "/maki-admin/menu",
        icon: Layers,
        permissionKey: "menu",
      },
      {
        name: "Anasayfa Koleksiyon",
        href: "/maki-admin/homepage-collection",
        icon: Home,
        permissionKey: "homepage_collection",
      },
      {
        /* 🛡️ İndirimli Koleksiyon (migration 062) — homepage_collection
           paterni. Kendi bağımsız permission key'i (Users grid'inde ayrı
           seçilebilir); mevcut admin'lere migration 064 backfill eder. */
        name: "İndirimli Koleksiyon",
        href: "/maki-admin/discount-collection",
        icon: Tag,
        permissionKey: "discount_collection",
      },
      {
        name: "Mesajlar",
        href: "/maki-admin/messages",
        icon: Inbox,
        permissionKey: "messages",
      },
      {
        /* 🛡️ FAZ 25 — Global SSS (site-wide FAQ). */
        name: "Sık Sorulan Sorular",
        href: "/maki-admin/faqs",
        icon: HelpCircle,
        permissionKey: "faqs",
      },
      {
        /* 🛡️ FAZ 33 — Villa Reviews moderation. */
        name: "Yorumlar",
        href: "/maki-admin/reviews",
        icon: Star,
        permissionKey: "reviews",
      },
    ],
  },
  {
    label: "Sistem",
    items: [
      {
        name: "Ayarlar",
        href: "/maki-admin/settings",
        icon: Settings,
        permissionKey: "settings",
      },
      {
        name: "Webmaster",
        href: "/maki-admin/webmaster",
        icon: Palette,
        permissionKey: "webmaster",
      },
      {
        name: "Mail Merkezi",
        href: "/maki-admin/system-logs",
        icon: Activity,
        permissionKey: "system_logs",
      },
      {
        /* 🛡️ FAZ 55 — Admin audit trail listing. Permission key
           "activity_logs" migration 028'de tüm aktif adminlere
           idempotent grant edildi. */
        name: "Aktivite Logları",
        href: "/maki-admin/activity-logs",
        icon: History,
        permissionKey: "activity_logs",
      },
      {
        name: "Kullanıcılar",
        href: "/maki-admin/users",
        icon: Users,
        permissionKey: "users",
      },
    ],
  },
];

/* ---------------------------------------------
   🔥 SIDEBAR PERMISSION FILTER
   - currentPermissions === null → tümünü göster (auth henüz bağlanmamış)
   - dizi geldiğinde sadece o key'lere sahip item'lar görünür
   - Boş gruplar otomatik gizlenir
---------------------------------------------- */
function filterMenuByPermissions(
  groups: MenuGroup[],
  perms: string[] | null
): MenuGroup[] {
  if (perms === null) return groups;
  const allowed = new Set(perms);
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => allowed.has(i.permissionKey)),
    }))
    .filter((g) => g.items.length > 0);
}

/* ---------------------------------------------
   🔥 NavBadge — sidebar menü satırının sağında küçük sayaç rozeti.
   - count <= 0 → hiç render edilmez (sidebar genişliğini bozmaz).
   - count > 99 → "99+".
   - Pulse/ring animasyonu yalnız `prefers-reduced-motion: no-preference`
     altında çalışır (.admin-nav-badge-ring base opacity:0 — reduced
     motion'da hareketsiz/gizli kalır, rozet sayısı yine net okunur).
---------------------------------------------- */
function NavBadge({ count }: { count: number }) {
  if (!count || count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span className="relative ml-auto shrink-0 inline-flex">
      <span
        aria-hidden="true"
        className="admin-nav-badge-ring absolute inset-0 rounded-full bg-[#ED7926]/60"
      />
      <span
        className="
          relative inline-flex items-center justify-center
          min-w-[19px] h-[19px] px-1.5 rounded-full
          text-[10.5px] font-bold leading-none text-white
          bg-[#ED7926]
          ring-1 ring-[#0973BA]/30
          shadow-[0_0_8px_-1px_rgba(9,115,186,0.55)]
        "
      >
        {label}
      </span>
    </span>
  );
}

/* ---------------------------------------------
   🔊 BİLDİRİM SESİ — mevcut pendingCounts sistemine minimum
   müdahale ile eklenen ses katmanı. DB/API/service tarafına
   dokunulmadı; yalnızca istemci-taraflı "önceki bilinen sayı"
   karşılaştırması ve kısa, TEKRARLI (loop) bir Web Audio API
   "ding" sesi.

   DAVRANIŞ:
   - Bir href'in sayısı ÖNCEKİ bilinen sayıdan artarsa o href
     "activeSoundHrefs" kümesine eklenir ve PAYLAŞILAN TEK bir
     interval (setInterval) döngüsü başlatılır (zaten çalışıyorsa
     yeniden başlatılmaz — startAdminNotificationLoop kendi içinde
     bunu garanti eder).
   - Birden fazla href aynı anda artsa bile tek döngü yeterlidir;
     her artış yalnızca kümeye eklenir, ayrı bir loop açılmaz.
   - Kullanıcı ilgili href'in sayfasını ziyaret ettiğinde
     (AdminShell'deki "menüyü ziyaret et" effect'i) o href kümeden
     çıkarılır; küme boşalırsa döngü HEMEN durur.
   - Küme (activeSoundHrefs) ve interval id BİLEREK localStorage'a
     YAZILMAZ — yalnız bellekte (module-level) tutulur: "aktif/
     onaylanmamış bildirim" durumu tek bir sayfa oturumuna aittir.
     Sayfa tam yenilendiğinde zaten yeni bir oturum başlar; artış
     tespiti (baseline karşılaştırması) her zaman olduğu gibi
     localStorage'daki SAYIYA göre yapılır (readBadgeSoundBaseline/
     writeBadgeSoundBaseline) — bu sayede aynı sayı için sayfa
     yenilendikçe gereksiz yere yeniden ses BAŞLATILMAZ.
   - sharedAudioCtx: sayfa başına tek AudioContext (autoplay kısıtı
     nedeniyle kullanıcı etkileşiminde oluşturulur/resume edilir —
     bkz. AdminShell içindeki gesture listener). Döngü her tekrarda
     zaten "suspended" ise resume dener; bu sayede ilk deneme
     tarayıcı tarafından engellense bile, kullanıcı panelle ilk
     etkileşime girdiği an context "running" olur ve BİR SONRAKİ
     döngü tekrarı gerçekten duyulur.
   - Her adım try/catch içinde; hata durumunda sessizce no-op
     (console'a basmaz, admin panelini/badge sistemini etkilemez).
---------------------------------------------- */
const SOUND_TRACKED_HREFS: string[] = [
  "/maki-admin/reservations",
  "/maki-admin/offer-requests",
  "/maki-admin/messages",
  "/maki-admin/reviews",
];

const BADGE_SOUND_BASELINE_KEY = "admin-badge-sound-baseline-v1";

// Ses ~2.6 saniyede bir tekrar eder (rahatsız etmeyecek kısalıkta,
// istenen "2-3 saniyede bir" aralığı içinde).
const SOUND_LOOP_INTERVAL_MS = 2600;

let sharedAudioCtx: AudioContext | null = null;
let soundLoopIntervalId: ReturnType<typeof setInterval> | null = null;
const activeSoundHrefs: Set<string> = new Set();

function getOrCreateAudioCtx(): AudioContext | null {
  try {
    if (sharedAudioCtx) return sharedAudioCtx;
    if (typeof window === "undefined") return null;
    const w = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = w.AudioContext || w.webkitAudioContext;
    if (!Ctor) return null;
    sharedAudioCtx = new Ctor();
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function primeAdminAudioContext(): void {
  try {
    const ctx = getOrCreateAudioCtx();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  } catch {
    /* sessizce yut — autoplay kısıtı/etkileşim olmaması normal */
  }
}

// 🔊 "Premium Chime" — settings/gelismis demosunda denenip seçilen
// alternatif. Yalnız bu fonksiyonun İÇİ değişti; çağrıldığı yer,
// sıklığı (SOUND_LOOP_INTERVAL_MS) ve tüm loop/baseline/aktif bildirim
// kümesi mantığı AYNEN korunuyor.
function playAdminNotificationChime(): void {
  try {
    const ctx = getOrCreateAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const notes: Array<{
      freq: number;
      start: number;
      duration: number;
      peakGain: number;
    }> = [
      { freq: 880, start: 0, duration: 0.5, peakGain: 0.12 },
      { freq: 1318.5, start: 0.05, duration: 0.55, peakGain: 0.09 },
    ];
    notes.forEach(({ freq, start, duration, peakGain }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = now + start;
      const t1 = t0 + duration;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    });
  } catch {
    /* ses hatası admin panelini/badge sistemini kesinlikle etkilemez */
  }
}

function startAdminNotificationLoop(): void {
  try {
    if (soundLoopIntervalId !== null) return; // zaten aktif — yeniden oluşturma
    playAdminNotificationChime();
    soundLoopIntervalId = setInterval(() => {
      playAdminNotificationChime();
    }, SOUND_LOOP_INTERVAL_MS);
  } catch {
    /* loop başlatılamazsa sessizce yut — badge sistemi etkilenmez */
  }
}

function stopAdminNotificationLoop(): void {
  try {
    if (soundLoopIntervalId !== null) {
      clearInterval(soundLoopIntervalId);
      soundLoopIntervalId = null;
    }
  } catch {
    /* sessizce yut */
  }
}

function markHrefNotificationActive(href: string): void {
  activeSoundHrefs.add(href);
  startAdminNotificationLoop();
}

function clearHrefNotificationActive(href: string): void {
  if (activeSoundHrefs.delete(href) && activeSoundHrefs.size === 0) {
    stopAdminNotificationLoop();
  }
}

function readBadgeSoundBaseline(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(BADGE_SOUND_BASELINE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeBadgeSoundBaseline(next: Record<string, number>): void {
  try {
    window.localStorage.setItem(
      BADGE_SOUND_BASELINE_KEY,
      JSON.stringify(next)
    );
  } catch {
    /* localStorage yoksa/doluysa sessizce yut — ses özelliği devre
       dışı kalır, badge sistemi etkilenmez */
  }
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  /* ---------------------------------------------
     🔥 LOGIN ROUTE — sidebar/topbar dışında render
     AdminSessionGuard yine sarmalar (cookie marker
     senkronizasyonu için), ama UI bypass eder.
  ---------------------------------------------- */
  if (pathname === "/maki-admin/login") {
    return (
      <AdminSessionGuard>
        <NotificationProvider>
          <main>{children}</main>
        </NotificationProvider>
      </AdminSessionGuard>
    );
  }

  return (
    <AdminSessionGuard>
      <NotificationProvider>
        <AdminShell>{children}</AdminShell>
      </NotificationProvider>
    </AdminSessionGuard>
  );
}

/* ---------------------------------------------
   🔥 AdminBrandMark — admin-logo.webp varsa render eder;
   <img onError> → "M" hardcoded fallback'a düşer.
   Hem sidebar Logo Link'i hem de mobil drawer için aynı mark.
   storage'a hiç logo yüklenmemişse UI bozulmaz; "M" rozeti kalır.
---------------------------------------------- */
function AdminBrandMark() {
  const [imgFailed, setImgFailed] = useState(false);
  /* 🛡️ R2 versiyonu (server layout'tan) → logo değişince URL değişir. */
  const { logo: logoVersion } = useAdminBrandingVersions();
  if (imgFailed) {
    return <span className="admin-brand-mark">M</span>;
  }
  return (
    <span
      className="admin-brand-mark"
      style={{
        padding: 0,
        overflow: "hidden",
        background: "transparent",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getAdminLogoUrl(logoVersion)}
        alt="Admin"
        onError={() => setImgFailed(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
        }}
      />
    </span>
  );
}

/* ---------------------------------------------
   🔥 useAdminFavicon — admin section'a özel favicon.
   Strateji:
     1. Document'taki MEVCUT <link rel="icon|shortcut icon">
        elemanlarını bul (Next.js'in default favicon.ico link'i
        burada zaten var) ve hrefs'lerini admin-icon URL'i ile
        OVERRIDE et. Yeni link inject etmek yerine var olanı
        düzenleyerek "iki favicon link'i" kafa karışıklığını
        önler — browser tutarlı şekilde admin icon'unu gösterir.
     2. Hiç favicon link yoksa (edge case) kendi link'imizi
        ekleriz; bu durumu data-admin-favicon-injected flag'i
        ile cleanup'ta tanırız.
     3. Cleanup (admin layout unmount olunca, public siteye
        nav): saklanmış orijinal href'leri restore et — public
        site default favicon'una otomatik döner.

   Hydration safety: SSR HTML'de Next.js'in default link tag'i
   var; bu hook useEffect içinde post-mount çalışır, React
   tree dışındaki <head> elemanlarını DOM API ile düzenler →
   hydration mismatch yok.
---------------------------------------------- */
function useAdminFavicon(): void {
  /* 🛡️ R2 versiyonu (server layout'tan) → icon değişince URL değişir. */
  const { icon: iconVersion } = useAdminBrandingVersions();
  useEffect(() => {
    if (typeof document === "undefined") return;
    const url = getAdminIconUrl(iconVersion);
    if (!url) return;

    type Saved = {
      el: HTMLLinkElement;
      originalHref: string;
      originalType: string;
      injected: boolean;
    };
    const saved: Saved[] = [];

    const existing = document.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"]'
    );

    if (existing.length > 0) {
      existing.forEach((el) => {
        saved.push({
          el,
          originalHref: el.getAttribute("href") || "",
          originalType: el.getAttribute("type") || "",
          injected: false,
        });
        el.setAttribute("href", url);
        el.setAttribute("type", "image/webp");
      });
    } else {
      const link = document.createElement("link");
      link.setAttribute("rel", "icon");
      link.setAttribute("type", "image/webp");
      link.setAttribute("href", url);
      link.setAttribute("data-admin-favicon-injected", "true");
      document.head.appendChild(link);
      saved.push({
        el: link,
        originalHref: "",
        originalType: "",
        injected: true,
      });
    }

    return () => {
      saved.forEach(({ el, originalHref, originalType, injected }) => {
        if (injected) {
          if (el.parentNode) el.parentNode.removeChild(el);
          return;
        }
        if (originalHref) {
          el.setAttribute("href", originalHref);
        } else {
          el.removeAttribute("href");
        }
        if (originalType) {
          el.setAttribute("type", originalType);
        } else {
          el.removeAttribute("type");
        }
      });
    };
  }, [iconVersion]);
}

function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Admin section'da tarayıcı sekmesi favicon'unu admin-icon.webp
  // yapar; public site nav olunca cleanup link'i kaldırır.
  useAdminFavicon();

  /* 🛡️ SIDEBAR BADGE COUNTS — href → gerçek "bekleyen/okunmamış" sayısı.
     Hiçbir key'i olmayan menü öğeleri için NavBadge zaten render
     edilmez (count undefined → 0 → null). */
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>(
    {}
  );

  /* 🛡️ Autoplay-safe aktivasyon — kullanıcının SAYFAYLA yaptığı HER
     etkileşimde (pointerdown/keydown) shared AudioContext oluşturulur/
     resume edilmeye çalışılır (idempotent — zaten "running" ise no-op).
     Öncesinde once:true kullanılıyordu; tek seferlik dinleyici, tarayıcı
     ilk denemeyi otomatik/gesture-dışı bir anda (sayfa yüklenir
     yüklenmez) engellediğinde bir daha asla tekrar denenmiyordu. Artık
     dinleyici component ömrü boyunca kalıcı — kullanıcı panelle her
     etkileşime girdiğinde context'i "running" yapmaya çalışır; böylece
     döngü halinde tekrar eden playAdminNotificationChime() bir sonraki
     tekrarında gerçekten duyulabilir hale gelir. Etkileşim hiç olmazsa
     ses özelliği sessizce pasif kalır (chime zaten kendi içinde
     güvenli). Component unmount olduğunda dinleyiciler kaldırılır. */
  useEffect(() => {
    const activate = () => primeAdminAudioContext();
    window.addEventListener("pointerdown", activate, { capture: true });
    window.addEventListener("keydown", activate, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", activate, true);
      window.removeEventListener("keydown", activate, true);
    };
  }, []);

  /* 🛡️ Component unmount olduğunda (ör. admin section'dan
     tamamen çıkılması) devam eden bildirim sesi döngüsü kesinlikle
     durdurulur — arka planda sonsuza dek çalan bir interval
     bırakılmaz. */
  useEffect(() => {
    return () => {
      stopAdminNotificationLoop();
    };
  }, []);

  /* ---------------------------------------------
     🔥 CURRENT USER PERMISSIONS (auth-bağlı)
     - admin null iken (initial loading): tümünü göster
       (AdminSessionGuard zaten render'ı bloklayacak,
        bu state pratikte sadece authenticated phase'de
        kullanılır)
     - admin yüklü ise: sidebar_permissions kullan
  ---------------------------------------------- */
  const { admin, signOut } = useAdmin();
  const currentPermissions: string[] | null = admin
    ? admin.sidebar_permissions
    : null;

  const visibleGroups = filterMenuByPermissions(
    menuGroups,
    currentPermissions
  );

  /* 🛡️ Sayaçlar — 4 kaynak MEVCUT service/action'lardan (bkz. dosya
     başı import yorumu). Durum tespiti kod içinden BİREBİR:
       - Rezervasyonlar  → GET /api/admin/reservations (reservations
         sayfasıyla AYNI route+auth) → status === "pending".
       - Teklif Talepleri → getOfferRequestsAction() → status === "pending"
         (OfferRequestList.tsx'teki `counters.pending` ile AYNI).
       - Mesajlar         → listMessagesAction() → !is_read && !archived_at
         (messages/page.tsx'teki `unreadCount` formülüyle AYNI).
       - Yorumlar         → getVillaReviewsForAdminAction() → !is_approved
         (ReviewAdminList.tsx'teki `pendingCount` formülüyle AYNI).
     Yalnız admin authenticate olduktan sonra ve yalnız İZİN VERİLEN
     (visibleGroups'ta görünen) href'ler için çekilir. */
  useEffect(() => {
    if (!admin) return;
    let cancelled = false;

    const perms: string[] | null = admin.sidebar_permissions;
    const allowedGroups = filterMenuByPermissions(menuGroups, perms);
    const allowedHrefs = new Set(
      allowedGroups.flatMap((g) => g.items.map((i) => i.href))
    );

    (async () => {
      const [
        reservationsCount,
        offerRequestsCount,
        messagesCount,
        reviewsCount,
      ] = await Promise.all([
        !allowedHrefs.has("/maki-admin/reservations")
          ? 0
          : (async () => {
              try {
                const res = await adminFetch("/api/admin/reservations");
                const json = (await res.json().catch(() => ({}))) as {
                  ok?: boolean;
                  reservations?: { status?: string }[];
                };
                if (!res.ok || !json.ok) return 0;
                return (json.reservations || []).filter(
                  (r) => r.status === "pending"
                ).length;
              } catch {
                return 0;
              }
            })(),
        !allowedHrefs.has("/maki-admin/offer-requests")
          ? 0
          : (async () => {
              try {
                const rows = await getOfferRequestsAction();
                return rows.filter((r) => r.status === "pending").length;
              } catch {
                return 0;
              }
            })(),
        !allowedHrefs.has("/maki-admin/messages")
          ? 0
          : (async () => {
              try {
                const rows = await listMessagesAction();
                return rows.filter((m) => !m.is_read && !m.archived_at)
                  .length;
              } catch {
                return 0;
              }
            })(),
        !allowedHrefs.has("/maki-admin/reviews")
          ? 0
          : (async () => {
              try {
                const rows = await getVillaReviewsForAdminAction();
                return rows.filter((r) => !r.is_approved).length;
              } catch {
                return 0;
              }
            })(),
      ]);

      if (cancelled) return;
      const freshCounts: Record<string, number> = {
        "/maki-admin/reservations": reservationsCount,
        "/maki-admin/offer-requests": offerRequestsCount,
        "/maki-admin/messages": messagesCount,
        "/maki-admin/reviews": reviewsCount,
      };
      setPendingCounts(freshCounts);

      /* 🔊 Artış tespiti — yalnız ÖNCEKİ bilinen (localStorage'da
         saklı) sayıdan BÜYÜKSE o href için bildirim sesi AKTİF hale
         gelir (markHrefNotificationActive → activeSoundHrefs kümesine
         ekler + paylaşılan tek loop'u başlatır/sürdürür). İlk
         yüklemede stored[href] tanımsız olduğu için `> stored` koşulu
         hiçbir zaman true olmaz → ilk açılışta ses BAŞLAMAZ. Azalışta
         da (newCount < stored) koşul false → ses tetiklenmez. Birden
         fazla href aynı anda artsa bile startAdminNotificationLoop
         kendi içinde "zaten çalışıyorsa yeniden başlatma" garantisi
         verir → tek bir sürekli döngü yeterlidir. */
      const storedBaseline = readBadgeSoundBaseline();
      const nextBaseline: Record<string, number> = { ...storedBaseline };
      for (const href of SOUND_TRACKED_HREFS) {
        const newCount = freshCounts[href] ?? 0;
        const prevCount = storedBaseline[href];
        if (typeof prevCount === "number" && newCount > prevCount) {
          markHrefNotificationActive(href);
        }
        nextBaseline[href] = newCount;
      }
      writeBadgeSoundBaseline(nextBaseline);
    })();

    return () => {
      cancelled = true;
    };
  }, [admin]);

  const adminInitial = (admin?.full_name || admin?.email || "M")
    .trim()
    .charAt(0)
    .toUpperCase() || "M";

  const handleLogout = async (): Promise<void> => {
    // 🔊 Çıkış yapılırken devam eden bildirim sesi döngüsü ve
    // "onaylanmamış bildirim" durumu temizlenir (bir sonraki admin
    // oturumuna sızmasın diye).
    stopAdminNotificationLoop();
    activeSoundHrefs.clear();
    await signOut();
  };

  /* 🛡️ ACTIVE STATE — longest prefix match.
     Eski koşul: `pathname === href || pathname.startsWith(href + "/")`
     üç noktada (currentItem / currentGroup / sidebar item active) ayrı
     ayrı uygulanıyordu. Birden çok item aynı pathname'i match ettiğinde
     (örn. /maki-admin/villas/siralama hem "Mülkler" hem "Mülk Sırala"
     için TRUE), `flatMap.find` ilk eşleşeni alıyordu → "Mülkler" item
     yanlışlıkla aktif görünüyor + sayfa başlığı yanlış oluyordu.

     Yeni mantık: tüm menü item href'leri arasında pathname'i match eden
     **en uzun href** belirlenir; aktif item yalnız bu href ile birebir
     eşleşendir. Eş anlamlı: en spesifik route kazanır. Bu sayede
     `/villas/siralama` için yalnız "Mülk Sırala" aktif olur, `/villas`
     ve `/villas/ekle` için yalnız "Mülkler" aktif olur. Gelecekte
     eklenecek alt-rotalar için ek değişiklik gerekmez. */
  const allHrefs = menuGroups.flatMap((g) => g.items.map((i) => i.href));
  const activeHref = allHrefs
    .filter(
      (h) => pathname === h || pathname.startsWith(h + "/")
    )
    .reduce(
      (longest, current) =>
        current.length > longest.length ? current : longest,
      ""
    );

  // Active page title (for top bar)
  const currentItem = menuGroups
    .flatMap((g) => g.items)
    .find((item) => item.href === activeHref);
  const currentGroup = menuGroups.find((g) =>
    g.items.some((item) => item.href === activeHref)
  );
  const currentTitle = currentItem?.name || "Admin";
  const currentEyebrow = currentGroup?.label || "Admin";

  /* 🔊 "Menüyü ziyaret ettiğinde bildirim temizlenir" — kullanıcı
     ilgili admin sayfasını (activeHref) açtığında:
       1) O href HEMEN activeSoundHrefs kümesinden çıkarılır
          (clearHrefNotificationActive) — küme boşalırsa devam eden
          ses döngüsü ANINDA durur.
       2) Bilinen son sayı (pendingCounts'taki güncel değer) ses
          baseline'ına da yazılır — böylece aynı sayı için tekrar bu
          sayfaya dönüldüğünde/sayfa yenilendiğinde ses tekrar
          BAŞLATILMAZ; yalnız bu sayıdan SONRA gelen yeni bir artış
          tekrar tetikler.
     clearHrefNotificationActive her zaman güvenle çağrılabilir
     (href hiç aktif değilse no-op). */
  useEffect(() => {
    if (!SOUND_TRACKED_HREFS.includes(activeHref)) return;
    clearHrefNotificationActive(activeHref);
    const currentCount = pendingCounts[activeHref];
    if (typeof currentCount !== "number") return;
    const stored = readBadgeSoundBaseline();
    if (stored[activeHref] === currentCount) return;
    writeBadgeSoundBaseline({ ...stored, [activeHref]: currentCount });
  }, [activeHref, pendingCounts]);

  return (
    <div className={`admin-shell flex min-h-screen ${adminFontVariables}`}>
      {/* SIDEBAR (desktop) + DRAWER (mobile) */}
      <aside
        className={`
          admin-sidebar
          fixed md:static inset-y-0 left-0 z-50
          w-72 md:w-[260px] shrink-0
          flex flex-col
          transition-transform duration-300
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Logo */}
        <div className="px-5 pt-6 pb-5 flex items-center justify-between">
          <Link href="/maki-admin" className="admin-brand">
            <AdminBrandMark />
            <span className="admin-brand-text">
              <span className="admin-brand-name block">Maki Dijital</span>
              <span className="admin-brand-sub block">Admin · CRM</span>
            </span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="md:hidden text-[var(--admin-sidebar-text)] hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-5 border-t border-[var(--admin-sidebar-border)]" />

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
          {/* 🛡️ NavBadge pulse/ring — .admin-nav-badge-ring default
             opacity:0 (hareketsiz); animasyon SADECE
             prefers-reduced-motion: no-preference altında çalışır. */}
          <style>{`
            .admin-nav-badge-ring {
              opacity: 0;
            }
            @media (prefers-reduced-motion: no-preference) {
              .admin-nav-badge-ring {
                animation: admin-badge-pulse 2.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
              }
            }
            @keyframes admin-badge-pulse {
              0% {
                transform: scale(0.85);
                opacity: 0.55;
              }
              70%,
              100% {
                transform: scale(1.7);
                opacity: 0;
              }
            }
          `}</style>
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <p className="admin-sidebar-group-label px-3 mb-2">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  /* 🛡️ Aktif item = longest prefix match (yukarıda
                     hesaplanan `activeHref`). currentItem ile birebir
                     aynı kaynak — UI tutarlılığı garanti. */
                  const active = item.href === activeHref;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`admin-nav-item ${active ? "is-active" : ""}`}
                    >
                      <Icon size={15} className="admin-icon shrink-0" />
                      <span className="truncate">{item.name}</span>
                      <NavBadge count={pendingCounts[item.href] ?? 0} />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer — admin info + logout */}
        <div className="px-3 py-4 border-t border-[var(--admin-sidebar-border)] space-y-2">
          {admin && (
            <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/5">
              <p className="text-[12px] font-semibold text-[var(--admin-sidebar-text)] truncate leading-tight">
                {admin.full_name || "Admin"}
              </p>
              <p className="text-[10.5px] text-[var(--admin-sidebar-text)]/70 truncate mt-0.5">
                {admin.email}
              </p>
            </div>
          )}
          {/* 🛡️ TOTP 2FA — "Hesabım" linki kaldırıldı; 2FA yönetimi
              /maki-admin/users'a (kendi satırınıza) taşındı. */}
          <button
            onClick={handleLogout}
            className="admin-nav-item w-full text-left hover:!text-rose-300"
          >
            <LogOut size={15} className="admin-icon shrink-0" />
            <span>Çıkış Yap</span>
          </button>
        </div>
      </aside>

      {/* OVERLAY for mobile */}
      {open && (
        <button
          aria-label="Kapat"
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-[#020617]/45 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      {/* CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOPBAR */}
        <header className="admin-topbar h-16 flex items-center justify-between px-5 md:px-8 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setOpen(true)}
              className="md:hidden admin-icon-btn -ml-2"
              aria-label="Menü"
            >
              <Menu size={18} />
            </button>

            <div className="min-w-0">
              <p className="admin-page-eyebrow leading-none">
                {currentEyebrow}
              </p>
              <h2 className="font-display text-[17px] tracking-[-0.015em] text-[var(--admin-text)] truncate leading-tight mt-0.5">
                {currentTitle}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {/* Siteyi Görüntüle — public site, yeni sekme (arama kutusu kaldırıldı) */}
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex items-center gap-2 admin-btn-ghost"
            >
              <Eye size={15} />
              Siteyi Görüntüle
            </a>

            {/* Notification — unified center (preview + persistent log) */}
            <NotificationBell />

            {/* Avatar — initial admin adı/emailden */}
            <div
              className="admin-avatar"
              title={
                admin
                  ? `${admin.full_name || ""} (${admin.email})`
                  : ""
              }
            >
              {adminInitial}
            </div>
          </div>
        </header>

        {/* PAGE — fluid SaaS workspace (Linear/Attio-vari geniş alan) */}
        <main className="flex-1 w-full px-5 md:px-8 lg:px-10 xl:px-12 py-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
