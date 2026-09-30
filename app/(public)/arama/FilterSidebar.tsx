"use client";

/* ===============================================================
   🛡️ /arama — PREMIUM FILTER SIDEBAR (CLIENT ISLAND)
   ===============================================================
   Bu component PURE UI. Hiçbir eski sağlayıcı/business semantic ÜRETMEZ.
   Tek source-of-truth: URL query params. (Server component page.tsx
   bu paramları okur ve aynı eski sağlayıcı query'sini kullanır.)

   URL CONTRACT (DEĞİŞMEZ — Hero.tsx ile birebir aynı):
     - categories   : string[]   (virgülle ayrılmış villa_types.id)
     - regions      : string[]   (virgülle ayrılmış villa_locations.id)
     - start, end   : YYYY-MM-DD (lokal — Hero.formatDate ile aynı)
     - guests       : number     (toplam kişi sayısı)

   YENİ SEMANTIC YOK:
     - "Çocuk Sayısı" UI'da iki ayrı counter (Yetişkin + Çocuk)
       olarak gösterilir, ama URL'e SADECE toplam `guests` yazılır.
       (URL'den geri okurken: yetişkin = guests, çocuk = 0 default
        — kabul edilebilir UX kompromisi.)

   LAYOUT:
     - Desktop  : inline aside (normal flow — sticky YOK)
     - Mobile   : bottom-anchored slide-over (body scroll lock + ESC
                  + outside click + reduced-motion safe)

   PERFORMANS:
     - Tek client island. Server component'a hydration yükü minimal.
     - Filtreler local draft state; ENTER veya "Filtrele" CTA URL'e
       push eder → SSR re-render. Instant rerender flicker'i yok.
     - useTransition ile router.push pending state izlenir
       (apply CTA disabled feedback).
   =============================================================== */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
/* react-datepicker v9 floating-ui tabanlıdır; `shift` middleware'i onun
   doğrudan bağımlılığı (@floating-ui/react) — aynı sürüm, Middleware tipi
   uyumlu. Yalnız mobilde popper'ı kenarlardan padding kadar uzak tutmak
   için kullanılır (attachment + üçgen korunur). */
import { shift } from "@floating-ui/react";
/* 🛡️ PHASE 13 — TR/EN/DE takvim locale'leri. `react-datepicker` v9
   ve mevcut `registerLocale` mekanizması DEĞİŞMEDİ; yalnız iki locale
   daha kaydedildi. Yeni kütüphane EKLENMEDİ. */
import { tr, enUS, de } from "date-fns/locale";

import MobileKbSafeInput from "@/app/components/ui/datepicker/MobileKbSafeInput";

/* 🛡️ PHASE 13 — statik panel metinleri MEVCUT public dictionary'den.
   `getDictionary` saf/senkron statik lookup (Phase 2) → client
   component'te güvenle çağrılır; yeni provider/context/fallback YOK. */
import {
  DEFAULT_LOCALE,
  LOCALE_BCP47,
  type Locale,
} from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { Dictionary } from "@/lib/i18n/dictionaries/types";

type FiltersDictionary = Dictionary["search"]["filters"];

import {
  Calendar,
  ChevronDown,
  MapPin,
  Sparkles,
  Minus,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Tag,
  Users,
  X,
} from "lucide-react";

registerLocale("tr", tr);
registerLocale("en", enUS);
registerLocale("de", de);

/* ---------------- Types ---------------- */

/* 🛡️ Option: id (UUID — canonical sidebar state) + opsiyonel slug
   (URL serialization için preferred token). slug null ise URL'e
   UUID düşer; backward-compat korunur. */
type Option = {
  id: string;
  name: string;
  slug?: string | null;
  /** Migration 050 — sidebar gösterim kürasyonu (yalnız regionOptions). */
  show_in_filter?: boolean | null;
  filter_group_name?: string | null;
};

type InitialFilters = {
  regions: string[];
  categories: string[];
  start: string | null;
  end: string | null;
  guests: number;
  /** 🛡️ ADDITIVE — "Gelişmiş Arama" (±3 esnek) URL'de flexible>0 mı.
   *  Opsiyonel (diğer caller'lar etkilenmez); yoksa false. Hero ile
   *  AYNI `flexible=3` parametresi. */
  flexible?: boolean;
  /** 🛡️ ADDITIVE — URL'deki `ozellikler` (villa özellikleri) seçimi;
   *  UUID dizisi. OPSİYONEL: verilmeyen caller'lar (örn.
   *  /kiralik-villalar, /kisa-sureli-tarihler) BİREBİR eski davranışı
   *  korur ve özellik bölümü hiç render edilmez. */
  features?: string[];
};

/* ===============================================================
   🛡️ MODE CONTRACT — Single component, two consumer contexts
   ===============================================================
     mode="search"   → /arama'da (default). "Filtrele" CTA URL'i
                       günceller ve aynı sayfa SSR re-render olur.
                       "Temizle" → /arama'ya boş paramla push (reload).
                       Mobile CTA → "X sonucu göster".

     mode="redirect" → /kiralik-villalar (archive/discovery) gibi
                       NON-SEARCH sayfalarda kullanılır. UI birebir
                       aynı; tek fark "Filtrele" /arama?... URL'ine
                       PUSH ediyor (kullanıcı sayfayı terk eder).
                       "Temizle" → sadece local draft state'i sıfırlar
                       (kullanıcı bulunduğu sayfada kalır). Mobile CTA
                       → "Villa Bul" (sonuç sayısı bilinmiyor).

   Bu prop sayesinde filter UI hem search-result hem archive context'inde
   reuse edilebilir; component duplication yok, filter state logic tek
   source-of-truth, URL contract birebir aynı.
=============================================================== */
export type FilterSidebarMode = "search" | "redirect";

type Props = {
  regionOptions: Option[];
  categoryOptions: Option[];
  /** 🛡️ ADDITIVE — villa özellikleri seçenekleri (id + locale'e göre
   *  çözülmüş name). Server'dan TEK SEFER aktarılır; checkbox
   *  değişiminde YENİ SORGU YOKTUR. Verilmezse (veya boşsa) "Villa
   *  Özellikleri" bölümü HİÇ render edilmez → mevcut caller'lar
   *  (mode="redirect" dahil) birebir korunur. */
  featureOptions?: Option[];
  initial: InitialFilters;
  /** Sonuç sayısı — mobile CTA üzerinde "X villa göster" için.
   *  Sadece mode="search" durumunda anlamlı. */
  resultCount?: number;
  /** Default "search". Detay için "MODE CONTRACT" bloğuna bak. */
  mode?: FilterSidebarMode;
  /** 🛡️ PHASE 13 — panel metinleri + takvim locale'i. OPSİYONEL;
   *  verilmezse "tr" → mevcut çıktı BYTE-IDENTICAL. */
  locale?: Locale;
  /** 🛡️ PHASE 13 — "Filtrele"/"Temizle" hedefi. OPSİYONEL; verilmezse
   *  "/arama" → `/kiralik-villalar` (mode="redirect") dahil mevcut
   *  davranış BİREBİR korunur. Yeni routing sistemi YOK. */
  basePath?: string;
};

/* ---------------- Helpers ---------------- */

const formatDateForUrl = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/* Grup içi kısa etiket:
     - name === group               → "Tüm {group}"  (üst bölge)
     - name "X / Y" formatında ise  → "/" sonrası ("Y")
     - aksi halde                   → name */
const regionShortLabel = (
  name: string,
  group: string,
  dict: FiltersDictionary
): string => {
  /* ⚠️ Bölge ADI çevrilmez (DB canonical, özel isim); yalnız
     "Tüm …" ön eki locale-aware. */
  if (name === group)
    return formatDictionaryString(dict.regionGroupAll, { group });
  if (name.includes("/")) {
    const tail = name.split("/").pop()?.trim();
    if (tail) return tail;
  }
  return name;
};

const parseDateFromUrl = (s: string | null): Date | null => {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return isNaN(dt.getTime()) ? null : dt;
};

/* ===============================================================
   COMPONENT
   =============================================================== */
export default function FilterSidebar({
  regionOptions,
  categoryOptions,
  featureOptions = [],
  initial,
  resultCount = 0,
  mode = "search",
  locale = DEFAULT_LOCALE,
  basePath = "/arama",
}: Props) {
  const dict: FiltersDictionary = getDictionary(locale).search.filters;
  const router = useRouter();
  /* 🛡️ pageSize URL state — filter Uygula sonrası KORUNUR.
     `buildHref` her seferinde URLSearchParams'ı sıfırdan inşa
     ettiği için `page` parametresi otomatik düşer (page=1 reset);
     ancak `pageSize`'ı bilinçli olarak mevcut URL'den okuyup
     kopyalarız → kullanıcı 50/sayfa seçmişse filter değişince
     50/sayfa korunur. */
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const isRedirect = mode === "redirect";

  /* ---------------- DRAFT STATE ----------------
     URL = canonical truth; draft = unapplied UI değişiklikleri. */
  const [regions, setRegions] = useState<string[]>(initial.regions);
  const [categories, setCategories] = useState<string[]>(initial.categories);
  const [startDate, setStartDate] = useState<Date | null>(
    parseDateFromUrl(initial.start)
  );
  const [endDate, setEndDate] = useState<Date | null>(
    parseDateFromUrl(initial.end)
  );
  /* 🛡️ TEK GUESTS STATE — Airbnb Luxe tarzı minimal booking UX.
     URL contract ?guests=N AYNEN korunur. Daha önce adults + children
     ayrımı vardı; UI sadeleştirildi → tek integer state. Business
     logic (.gte("guests", n)) byte-identical. */
  const [guestCount, setGuestCount] = useState<number>(
    Math.max(1, initial.guests || 1)
  );
  /* 🛡️ GELİŞMİŞ ARAMA — ±3 esnek. Hero checkbox'ı ile AYNI `flexible=3`
     parametresi. Draft state (URL'den init); Uygula'da buildHref yazar. */
  const [flexible, setFlexible] = useState<boolean>(!!initial.flexible);

  /* 🛡️ ADDITIVE — villa özellikleri draft seçimi (UUID listesi). Hero'da
     seçilip URL'e yazılan değer `initial.features` ile buraya gelir →
     sidebar'da SEÇİLİ görünür; "Filtrele"de buildHref geri yazar. */
  const [features, setFeatures] = useState<string[]>(initial.features || []);

  /* 🛡️ URL değişince (yeni `initial.features`) draft'ı senkronize et.
     Yukarıdaki `useEffect` yerine React'in resmî "adjust state when
     props change" RENDER-PHASE deseni kullanılır: effect'e bir setState
     daha eklemek `set-state-in-effect` lint uyarı sayısını (baseline
     200) artırırdı; bu desen ek uyarı üretmez ve bayat state flash'ı
     oluşmaz. Diğer alanların mevcut effect senkronizasyonu DEĞİŞMEDİ. */
  const featuresSignature = (initial.features || []).join(",");
  const [prevFeaturesSignature, setPrevFeaturesSignature] =
    useState(featuresSignature);
  if (prevFeaturesSignature !== featuresSignature) {
    setPrevFeaturesSignature(featuresSignature);
    setFeatures(initial.features || []);
  }

  /* Sayfa /arama?regions=... gibi yeni bir URL'le yeniden render
     edildiğinde props.initial değişir → draft'ı senkronize et. */
  useEffect(() => {
    setRegions(initial.regions);
    setCategories(initial.categories);
    setStartDate(parseDateFromUrl(initial.start));
    setEndDate(parseDateFromUrl(initial.end));
    setGuestCount(Math.max(1, initial.guests || 1));
    setFlexible(!!initial.flexible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initial.regions.join(","),
    initial.categories.join(","),
    initial.start,
    initial.end,
    initial.guests,
    initial.flexible,
  ]);

  /* ---------------- BÖLGE GRUP AÇ/KAPA STATE ----------------
     Migration 050: bölgeler filter_group_name altında gruplanır.
     openGroups[group] explicit toggle; tanımsızsa grup içinde seçili
     bölge varsa varsayılan AÇIK. */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  /* ---------------- BÖLÜM AÇ/KAPA STATE (Villa Tipi · Özellikler) ----
     Bölge gruplarındaki `openGroups` deseninin AYNISI: explicit toggle
     yoksa `undefined` → her bölüm kendi varsayılanına düşer. Tarih /
     Kişi / Bölge bölümleri BU STATE'İ KULLANMAZ (davranışları aynen
     korunur). */
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    {}
  );
  const toggleSection = (key: string, current: boolean) =>
    setOpenSections((s) => ({ ...s, [key]: !current }));

  /* Görünür bölgeleri (show_in_filter=true) gruba göre kümele.
     regionOptions tam liste kalır (URL resolve için); burada YALNIZ
     gösterim curation uygulanır. */
  const regionGroups = useMemo(() => {
    const map = new Map<string, Option[]>();
    for (const o of regionOptions) {
      if (!o.show_in_filter) continue;
      const group = (o.filter_group_name || "").trim() || o.name;
      const arr = map.get(group);
      if (arr) arr.push(o);
      else map.set(group, [o]);
    }
    /* Grup içinde: "Tüm X" (name === group) önce, sonra alfabetik. */
    const collator = new Intl.Collator("tr");
    const groups = Array.from(map.entries()).map(([group, items]) => ({
      group,
      items: items.sort((a, b) => {
        if (a.name === group) return -1;
        if (b.name === group) return 1;
        return collator.compare(a.name, b.name);
      }),
    }));
    groups.sort((a, b) => collator.compare(a.group, b.group));
    return groups;
  }, [regionOptions]);

  /* ---------------- MOBILE DRAWER STATE ---------------- */
  const [mobileOpen, setMobileOpen] = useState(false);

  /* Body scroll lock + ESC close. */
  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [mobileOpen]);

  /* Drawer açıldığında ilk focusable elemana focus ver. */
  const drawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const t = window.setTimeout(() => {
      const el = drawerRef.current?.querySelector<HTMLElement>(
        "[data-drawer-initial-focus]"
      );
      el?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [mobileOpen]);

  /* 📱 Yalnız telefon (max-639px; tablet ≥640 ve desktop HARİÇ) tespiti.
     SADECE datepicker popper placement'ını mobilde "bottom" (input altında
     ortalı) yapmak için — desktop "bottom-start" (mevcut default) kalır.
     Popper mantığı/attachment/üçgen korunur; yalnız yatay hiza iyileşir. */
  const [isMobileDp, setIsMobileDp] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobileDp(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  /* ---------------- HANDLERS ---------------- */

  /* 🛡️ ID → preferred URL token (slug varsa, yoksa UUID).
     State içinde categories[] = UUID array (toggle/includes/count
     mantığı UUID üzerinde stable); URL serialize'da slug'a çeviriyoruz.
     Server tarafı her iki formatı da accept eder (backward-compat). */
  const idToToken = (id: string, opts: Option[]) => {
    const o = opts.find((x) => x.id === id);
    return (o?.slug && o.slug.trim()) || id;
  };

  const buildHref = () => {
    const params = new URLSearchParams();
    if (categories.length) {
      const tokens = categories.map((id) => idToToken(id, categoryOptions));
      /* 🛡️ CANONICAL PARAM: `villa-turleri` (SEO-friendly TR).
         Server tarafı eski `categories` paramını da hâlâ accept eder. */
      params.set("villa-turleri", tokens.join(","));
    }
    if (regions.length) {
      const tokens = regions.map((id) => idToToken(id, regionOptions));
      /* 🛡️ CANONICAL PARAM: `bolgeler` (SEO-friendly TR).
         Server tarafı eski `regions` paramını da hâlâ accept eder. */
      params.set("bolgeler", tokens.join(","));
    }
    if (startDate) params.set("start", formatDateForUrl(startDate));
    if (endDate) params.set("end", formatDateForUrl(endDate));
    /* URL contract aynen: guests > 1 ise param yazılır
       (1 default → URL'e koymadan minimize ediyoruz). */
    if (guestCount > 1) params.set("guests", String(guestCount));
    /* 🛡️ pageSize PRESERVE — filter Uygula sonrası kullanıcının
       seçtiği page size korunur (page=1'e zaten döner çünkü buildHref
       URL'i sıfırdan kuruyor). Allow-list dışı / default değer ise
       URL'e yazılmaz (clean URL). */
    const existingPageSize = searchParams?.get("pageSize");
    if (existingPageSize) {
      const n = Number(existingPageSize);
      if (n === 30 || n === 50 || n === 100) {
        params.set("pageSize", String(n));
      }
      /* n === 12 (default) veya allow-list dışı → URL'e yazma */
    }
    /* 🛡️ sort PRESERVE — filter değişimi kullanıcının sıralama
       tercihini KORUR. Allow-list (lib/pagination.ts): smart |
       price-asc | price-desc | capacity-asc | capacity-desc.
       Default ("smart") veya allow-list dışı → URL'e yazılmaz
       (clean URL). page=1'e zaten döner (URL sıfırdan kuruluyor). */
    const existingSort = searchParams?.get("sort");
    if (
      existingSort === "price-asc" ||
      existingSort === "price-desc" ||
      existingSort === "capacity-asc" ||
      existingSort === "capacity-desc"
    ) {
      params.set("sort", existingSort);
    }
    /* 🛡️ flexible — "Gelişmiş Arama" checkbox state'i. İşaretliyse
       `flexible=3` yazılır, değilse HİÇ yazılmaz (URL'den kalkar). State
       URL'den init edildiği için dokunulmazsa DEĞER KORUNUR (herhangi bir
       filtre değişiminde flexible=3 kaybolmaz). Hero ile AYNI parametre;
       ana start/end etkilenmez. */
    if (flexible) {
      params.set("flexible", "3");
    }
    /* 🛡️ ADDITIVE PASSTHROUGH — Hero "Gelişmiş Arama"da seçilen villa
       özellikleri (`ozellikler`, virgülle ayrık UUID). Bu panelde
       özellik filtresi UI'ı YOKTUR; `buildHref` URL'i sıfırdan kurduğu
       için değer AYNEN taşınmazsa herhangi bir filtre uygulandığında
       SESSİZCE SİLİNİRDİ. Değer opak taşınır (parse/normalize YOK).
       "Temizle" tüm filtreleri sıfırladığı için bu param da doğal
       olarak kalkar — mevcut reset sözleşmesi DEĞİŞMEDİ. */
    /* 🛡️ VİLLA ÖZELLİKLERİ (`ozellikler`, virgülle ayrık UUID).
       Kaynak sırası:
         1) Panelin kendi draft state'i (bu panelde artık UI VAR).
         2) State BOŞ ve caller `initial.features` HİÇ vermiyorsa →
            URL'deki mevcut değer AYNEN taşınır (eski passthrough
            sözleşmesi; `buildHref` URL'i sıfırdan kurduğu için bu
            olmadan parametre sessizce silinirdi).
       Seçim yoksa parametre HİÇ yazılmaz → boş `ozellikler=` ASLA
       üretilmez ve "Temizle" sonrası URL'den tamamen kalkar. */
    if (features.length) {
      params.set("ozellikler", features.join(","));
    } else if (!initial.features) {
      const existingFeatures = searchParams?.get("ozellikler");
      if (existingFeatures) {
        params.set("ozellikler", existingFeatures);
      }
    }
    const qs = params.toString();
    /* 🛡️ PHASE 13 — hedef locale-aware (`basePath`). Parametre seti,
       canonical isimler ve default'ların yazılmaması DEĞİŞMEDİ. */
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const applyFilters = () => {
    const href = buildHref();
    startTransition(() => {
      router.push(href);
    });
    setMobileOpen(false);
  };

  const resetFilters = () => {
    setRegions([]);
    setCategories([]);
    setStartDate(null);
    setEndDate(null);
    setGuestCount(1);
    setFeatures([]);
    /* 🛡️ MODE-aware reset:
         - search   → /arama'ya boş paramla push (mevcut davranış).
         - redirect → sadece local draft state'i sıfırla; kullanıcı
                      bulunduğu sayfada (örn. /kiralik-villalar) kalır. */
    if (isRedirect) {
      return;
    }
    startTransition(() => {
      router.push(basePath);
    });
  };

  const toggleInList = (
    value: string,
    list: string[],
    setList: (v: string[]) => void
  ) => {
    if (list.includes(value)) setList(list.filter((x) => x !== value));
    else setList([...list, value]);
  };

  /* 🛡️ GRUP-FARKINDA BÖLGE TOGGLE (yalnız UI seçim state'i)
     ===============================================================
     "Tüm X" (grup kökü, name === group) ile alt bölgeler MUTUALLY
     EXCLUSIVE:
       - Grup kökü işaretlenirse → aynı gruptaki alt seçimler temizlenir.
       - Bir alt bölge işaretlenirse → grup kökü kaldırılır.
       - Birden çok alt bölge serbestçe birlikte seçilebilir.
       - Kaldırma (uncheck) her zaman yalnız ilgili id'yi çıkarır.
     URL/resolver DEĞİŞMEZ; yalnızca `regions` id seti düzenlenir. */
  const toggleRegion = (opt: Option, group: string) => {
    const isRoot = opt.name === group;
    const groupItems =
      regionGroups.find((g) => g.group === group)?.items ?? [];
    const rootId = groupItems.find((it) => it.name === group)?.id;

    setRegions((prev) => {
      if (prev.includes(opt.id)) {
        /* Uncheck → yalnız bu id'yi çıkar. */
        return prev.filter((x) => x !== opt.id);
      }
      if (isRoot) {
        /* Grup kökü seçildi → gruptaki tüm alt id'leri çıkar, kökü ekle. */
        const subIds = new Set(
          groupItems.filter((it) => it.name !== group).map((it) => it.id)
        );
        return [...prev.filter((x) => !subIds.has(x)), opt.id];
      }
      /* Alt bölge seçildi → varsa grup kökünü çıkar, alt bölgeyi ekle. */
      const base = rootId ? prev.filter((x) => x !== rootId) : prev;
      return [...base, opt.id];
    });
  };

  /* Varsayılanlar (İKİSİ DE bölge gruplarıyla AYNI kural):
       • Seçim YOKSA → KAPALI ([+] Villa Tipi / [+] Villa Özellikleri).
       • URL'den seçim geliyorsa (`villa-turleri=…` / `ozellikler=…`)
         → AÇIK, kullanıcı seçili filtresini görür.
     Explicit toggle her ikisinde de `openSections` ile ezer. Tarih /
     Kişi / Bölge bölümlerinin davranışı DEĞİŞMEDİ. */
  const typeSectionOpen = openSections.type ?? categories.length > 0;
  const featureSectionOpen = openSections.features ?? features.length > 0;
  /* Bölüm YALNIZ özellik verisi olan yüzeylerde render edilir
     (/arama). Prop vermeyen caller'lar için DOM birebir eski hali. */
  const showFeatures = featureOptions.length > 0 || !!initial.features;

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (regions.length) n += 1;
    if (categories.length) n += 1;
    if (startDate) n += 1;
    if (guestCount > 1) n += 1;
    /* 🛡️ Yalnız özellik seçiliyken de "Temizle" AKTİF olsun. */
    if (features.length) n += 1;
    return n;
  }, [
    regions.length,
    categories.length,
    startDate,
    guestCount,
    features.length,
  ]);

  /* ===============================================================
     RENDER
     =============================================================== */

  /* Tek panel JSX'i — hem desktop (inline aside) hem mobile (drawer
     içinde) aynı içeriği render eder. */
  const panel = (
    /* 🛡️ min-h-0: nested flex zincirinde panel'in 0'a kadar küçülmesine
       izin ver. Defaultta `min-height: auto` → çocuk içeriğin intrinsic
       boyu; bu durumda scroll area'nın `flex-1` semantic'i ve aşağıdaki
       `overflow-y-auto` çalışmaz. min-h-0 ile panel parent'ı (card)
       max-h içinde header + scroll + footer distribution'ı doğru
       hesaplar. */
    <div className="flex flex-col h-full min-h-0">
      {/* HEADER — desktop'ta minimal eyebrow, mobile'da X button */}
      <div className="flex items-start justify-between gap-4 pb-6 border-b border-[var(--color-stone-100)]">
        <div>
          <h2 className="font-display text-[26px] md:text-[28px] text-[var(--color-stone-900)] tracking-[-0.025em] leading-tight">
            {dict.title}
          </h2>
        </div>

        {/* Mobile only — close */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label={dict.closeAriaLabel}
          className="md:hidden -mr-1 w-10 h-10 rounded-full flex items-center justify-center text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <X size={18} />
        </button>
      </div>

      {/* SCROLL AREA — drawer içinde sticky CTA için flex-1 */}
      {/*
        🛡️ FUNNEL ORDER — production-grade booking UX:
          1) Villa Tipi  (kullanıcı önce "nasıl bir villa" diye düşünür)
          2) Bölge       (sonra "nerede")
          3) Tarih       (sonra "ne zaman")
          4) Misafir     (en son "kaç kişi")
        Cross-group semantic AND; her grup içinde OR (multi-select).
      */}
      {/* 🛡️ SCROLL SÖZLEŞMESİ (iki bağlam, TEK JSX):
           • MOBİL DRAWER (<md): drawer sabit yükseklikte
             (`h-[calc(92vh-1.25rem)]`) olduğu için iç scroll ŞART →
             `flex-1 min-h-0 overflow-y-auto` AYNEN korunur. Aksi halde
             sticky CTA'nın altındaki içerik erişilemez olurdu.
           • DESKTOP (md+): iç scroll KALDIRILDI → `md:flex-none
             md:overflow-visible`. Panel doğal yüksekliğinde uzar,
             sayfa normal şekilde scroll olur. Body/page scroll
             davranışına DOKUNULMADI. */}
      <div className="flex-1 min-h-0 overflow-y-auto md:flex-none md:overflow-visible py-6 space-y-8 pr-1 -mr-1 md:pr-0 md:mr-0">
        {/* ============ 1) TARİH ============ */}
        <FilterGroup
          icon={
            <Calendar
              size={14}
              className="text-[var(--color-champagne-500)]"
            />
          }
          label={dict.dateLabel}
          summary={
            startDate && endDate
              ? `${startDate.toLocaleDateString(LOCALE_BCP47[locale], {
                  day: "numeric",
                  month: "short",
                })} – ${endDate.toLocaleDateString(LOCALE_BCP47[locale], {
                  day: "numeric",
                  month: "short",
                })}`
              : startDate
              ? startDate.toLocaleDateString(LOCALE_BCP47[locale], {
                  day: "numeric",
                  month: "short",
                })
              : dict.dateSummaryEmpty
          }
        >
          <div
            data-drawer-initial-focus=""
            tabIndex={-1}
            className="rounded-xl border border-[var(--color-stone-100)] bg-white px-3 py-3 flex items-center gap-3 outline-none"
          >
            <DatePicker
              selected={startDate}
              onChange={(dates: any) => {
                const [start, end] = dates as [Date | null, Date | null];
                setStartDate(start);
                setEndDate(end);
              }}
              startDate={startDate}
              endDate={endDate}
              selectsRange
              locale={locale}
              dateFormat="dd.MM.yyyy"
              minDate={new Date()}
              placeholderText={dict.datePlaceholder}
              /* 🛡️ Mobilde input altında ORTALI aç (bottom); desktop mevcut
                 default (bottom-start) aynen kalır. Popper attachment + üçgen
                 korunur → takvim inputa bağlı kalır, yalnız yatay hiza
                 dengelenir. Hero/villa-detay etkilenmez. */
              popperPlacement={isMobileDp ? "bottom" : "bottom-start"}
              /* 🛡️ Yalnız mobilde: shift middleware ile popper viewport
                 kenarlarından en az 16px uzak tutulur → sola/sağa yapışmaz,
                 taşmaz. react-datepicker default middleware'ine (flip/offset/
                 arrow) EKLENİR; üçgen ve attachment bozulmaz. Desktop
                 undefined → default davranış BİREBİR korunur. */
              popperModifiers={
                isMobileDp ? [shift({ padding: 16 })] : undefined
              }
              /* 🛡️ Kart içinde input'ta görünen tarih metni — SADECE
                 display override. State (selected/startDate/endDate),
                 onChange, URL (formatDateForUrl), filter querysi ve
                 calendar internal'ı (dateFormat/selectsRange/locale/
                 minDate) DOKUNULMADI. Summary (L565-580) ile birebir
                 aynı format: LOCALE_BCP47[locale] + day numeric + month
                 short →
                 "4 Haz – 11 Haz". Separator en-dash, placeholder ile
                 tutarlı. */
              value={
                startDate && endDate
                  ? `${startDate.toLocaleDateString(LOCALE_BCP47[locale], {
                      day: "numeric",
                      month: "short",
                    })} – ${endDate.toLocaleDateString(LOCALE_BCP47[locale], {
                      day: "numeric",
                      month: "short",
                    })}`
                  : startDate
                  ? startDate.toLocaleDateString(LOCALE_BCP47[locale], {
                      day: "numeric",
                      month: "short",
                    })
                  : ""
              }
              className="!bg-transparent !border-0 !shadow-none !p-0 !rounded-none w-full text-[14px] font-medium !text-[var(--color-stone-900)] placeholder-[var(--color-stone-400)] cursor-pointer outline-none"
              /* 🛡️ Mobil klavye baskılama — customInput içinde
                 inputMode="none". Display override için verilen
                 value prop, react-datepicker tarafından customInput'a
                 forward edilir; render değişmez. */
              customInput={<MobileKbSafeInput />}
            />
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate(null);
                  setEndDate(null);
                }}
                aria-label={dict.clearDateAriaLabel}
                className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[var(--color-stone-500)] hover:bg-[var(--color-sand-50)] hover:text-[var(--color-stone-900)] transition-colors motion-reduce:transition-none"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </FilterGroup>

        {/* ============ 4) KİŞİ SAYISI ============
            Tek sade counter — Airbnb Luxe tarzı minimal booking UX.
            URL contract: ?guests=N (1 default → param yazılmaz). */}
        <FilterGroup
          icon={
            <Users size={14} className="text-[var(--color-champagne-500)]" />
          }
          label={dict.guestsLabel}
          summary={formatDictionaryString(dict.guestsSummary, {
            n: guestCount > 1 ? guestCount : 1,
          })}
        >
          <div className="space-y-3">
            <CounterRow
              label={dict.guestsCounterLabel}
              hint={dict.guestsCounterHint}
              dict={dict}
              value={guestCount}
              min={1}
              max={20}
              onChange={setGuestCount}
            />
            <p className="text-[11px] tracking-[0.04em] text-[var(--color-stone-400)] pt-1 leading-relaxed">
              <span className="tabular-nums">{guestCount}</span>
              {dict.guestsHint}
            </p>
          </div>
        </FilterGroup>

        {/* ============ 3) BÖLGE ============ */}
        <FilterGroup
          icon={<MapPin size={14} className="text-[var(--color-champagne-500)]" />}
          label={dict.regionLabel}
          summary={
            regions.length === 0
              ? dict.regionAll
              : formatDictionaryString(dict.selectedCount, {
                  n: regions.length,
                })
          }
        >
          {regionGroups.length === 0 ? (
            <p className="text-[13px] text-[var(--color-stone-400)]">
              {dict.regionEmpty}
            </p>
          ) : (
            <div className="space-y-1.5">
              {regionGroups.map((g) => {
                const selectedCount = g.items.filter((it) =>
                  regions.includes(it.id)
                ).length;
                /* Explicit toggle yoksa: seçili bölge varsa açık. */
                const isOpen =
                  openGroups[g.group] ?? selectedCount > 0;
                return (
                  <div
                    key={g.group}
                    className="rounded-xl border border-[var(--color-stone-100)] overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenGroups((s) => ({
                          ...s,
                          [g.group]: !isOpen,
                        }))
                      }
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-[14px] text-[var(--color-stone-800)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none"
                    >
                      <span className="flex items-center gap-2 font-medium truncate">
                        <ChevronDown
                          size={14}
                          className={`text-[var(--color-stone-400)] shrink-0 transition-transform motion-reduce:transition-none ${
                            isOpen ? "" : "-rotate-90"
                          }`}
                        />
                        <span className="truncate">{g.group}</span>
                      </span>
                      {selectedCount > 0 && (
                        <span className="text-[11px] tabular-nums text-[var(--color-stone-400)] shrink-0">
                          {formatDictionaryString(dict.selectedCount, {
                            n: selectedCount,
                          })}
                        </span>
                      )}
                    </button>
                    {isOpen && (
                      <ul className="space-y-1 px-1.5 pb-1.5">
                        {g.items.map((opt) => {
                          const checked = regions.includes(opt.id);
                          return (
                            <li key={opt.id}>
                              <label
                                className={`flex items-center gap-3 text-[14px] px-3 py-2.5 rounded-lg cursor-pointer transition-colors motion-reduce:transition-none ${
                                  checked
                                    ? "bg-[var(--color-sand-50)] text-[var(--color-stone-900)]"
                                    : "text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)]"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleRegion(opt, g.group)}
                                  className="!w-4 !h-4 accent-[var(--color-champagne-500)] !rounded"
                                />
                                <span className="truncate">
                                  {regionShortLabel(opt.name, g.group, dict)}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </FilterGroup>

        {/* ============ 4) VİLLA TİPİ ============ */}
        {/* 🛡️ AÇ/KAPA: varsayılan AÇIK → sayfa ilk açıldığında villa tipi
            seçenekleri BUGÜNKÜ gibi görünür kalır. Seçim state'i, URL
            kontratı ve filtreleme mantığı DEĞİŞMEDİ; yalnız görünürlük
            toggle'ı eklendi. */}
        <FilterGroup
          icon={<Tag size={14} className="text-[var(--color-champagne-500)]" />}
          label={dict.typeLabel}
          summary={
            categories.length === 0
              ? dict.typeAll
              : formatDictionaryString(dict.selectedCount, {
                  n: categories.length,
                })
          }
          collapsible
          open={typeSectionOpen}
          onToggle={() => toggleSection("type", typeSectionOpen)}
        >
          {categoryOptions.length === 0 ? (
            <p className="text-[13px] text-[var(--color-stone-400)]">
              {dict.typeEmpty}
            </p>
          ) : (
            <ul className="space-y-1">
              {categoryOptions.map((opt) => {
                const checked = categories.includes(opt.id);
                return (
                  <li key={opt.id}>
                    <label
                      className={`flex items-center gap-3 text-[14px] px-3 py-2.5 rounded-xl cursor-pointer transition-colors motion-reduce:transition-none ${
                        checked
                          ? "bg-[var(--color-sand-50)] text-[var(--color-stone-900)]"
                          : "text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          toggleInList(opt.id, categories, setCategories)
                        }
                        className="!w-4 !h-4 accent-[var(--color-champagne-500)] !rounded"
                      />
                      <span className="truncate">{opt.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </FilterGroup>

        {/* ============ 5) VİLLA ÖZELLİKLERİ ============
            🛡️ Seçenekler SERVER'dan TEK SEFER prop ile gelir
            (AramaPageBody → `loadHeroFeatures`, Hero ile AYNI kaynak);
            checkbox değişiminde YENİ SORGU YOKTUR. URL kontratı Hero
            ile birebir: `ozellikler=uuid1,uuid2` (AND filtresi,
            AramaPageBody'de çözülür). Caller prop vermiyorsa bölüm
            HİÇ render edilmez → /kiralik-villalar birebir korunur. */}
        {showFeatures && (
          <FilterGroup
            icon={
              <Sparkles
                size={14}
                className="text-[var(--color-champagne-500)]"
              />
            }
            label={dict.featuresLabel}
            summary={
              features.length === 0
                ? dict.featuresAll
                : formatDictionaryString(dict.selectedCount, {
                    n: features.length,
                  })
            }
            collapsible
            open={featureSectionOpen}
            onToggle={() => toggleSection("features", featureSectionOpen)}
          >
            {featureOptions.length === 0 ? (
              <p className="text-[13px] text-[var(--color-stone-400)]">
                {dict.featuresEmpty}
              </p>
            ) : (
              <ul className="space-y-1">
                {featureOptions.map((opt) => {
                  const checked = features.includes(opt.id);
                  return (
                    <li key={opt.id}>
                      <label
                        className={`flex items-center gap-3 text-[14px] px-3 py-2.5 rounded-xl cursor-pointer transition-colors motion-reduce:transition-none ${
                          checked
                            ? "bg-[var(--color-sand-50)] text-[var(--color-stone-900)]"
                            : "text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            toggleInList(opt.id, features, setFeatures)
                          }
                          className="!w-4 !h-4 accent-[var(--color-champagne-500)] !rounded"
                        />
                        <span className="truncate">{opt.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </FilterGroup>
        )}

        {/* ═══ GELİŞMİŞ ARAMA — Hero checkbox'ı ile AYNI `flexible=3`.
            Panel JSX paylaşımlı → desktop aside + mobil drawer ikisinde de
            görünür. Draft: Uygula'da buildHref yazar. Ana tarih/normal
            filtre/sonuç mantığı DEĞİŞMEZ. */}
        <div className="pt-1">
          <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-stone-500)]">
            {dict.advancedTitle}
          </p>
          <label className="flex items-start gap-3 rounded-xl bg-[var(--color-sand-50)]/60 px-3 py-3 text-[14px] cursor-pointer transition-colors motion-reduce:transition-none hover:bg-[var(--color-sand-50)]">
            <input
              type="checkbox"
              checked={flexible}
              onChange={(e) => setFlexible(e.target.checked)}
              className="mt-0.5 shrink-0 !w-4 !h-4 accent-[var(--color-champagne-500)] !rounded"
            />
            <span className="leading-snug text-[var(--color-stone-700)]">
              {dict.advancedCheckbox}
              <span className="mt-1 block text-[12px] text-[var(--color-stone-400)]">
                {dict.advancedHint}
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* STICKY FOOTER — Filtrele + Temizle */}
      <div className="pt-5 border-t border-[var(--color-stone-100)] flex items-center gap-3">
        <button
          type="button"
          onClick={resetFilters}
          disabled={activeFilterCount === 0 || isPending}
          className="inline-flex items-center gap-2 px-4 py-3 rounded-full border border-[var(--color-stone-200)] text-[13px] font-medium text-[var(--color-stone-700)] hover:border-[var(--color-stone-300)] hover:text-[var(--color-stone-900)] transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <RotateCcw size={13} />
          {dict.reset}
        </button>
        <button
          type="button"
          onClick={applyFilters}
          disabled={isPending}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-[var(--color-stone-900)] text-white text-[13px] font-medium tracking-[0.04em] hover:bg-[var(--color-stone-700)] transition-colors motion-reduce:transition-none disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <Search size={14} />
          <span>
            {isPending
              ? dict.applying
              : isRedirect
              ? dict.findVillas
              : mobileOpen
              ? formatDictionaryString(dict.showResults, { n: resultCount })
              : dict.apply}
          </span>
        </button>
      </div>
    </div>
  );

  /* =============== RENDER ROOT =============== */

  return (
    <>
      {/* MOBILE TRIGGER — list üstünde sticky değil (header altında) */}
      <div className="md:hidden mb-8">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="w-full inline-flex items-center justify-between gap-4 px-5 py-4 rounded-2xl bg-white border border-[var(--color-stone-100)] text-left hover:border-[var(--color-stone-200)] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
          aria-haspopup="dialog"
          aria-expanded={mobileOpen}
        >
          <span className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-[var(--color-sand-50)] border border-[var(--color-stone-100)] flex items-center justify-center">
              <SlidersHorizontal
                size={15}
                className="text-[var(--color-stone-700)]"
              />
            </span>
            <span>
              <span className="block text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
                {dict.mobileTriggerEyebrow}
              </span>
              <span className="block text-[14px] font-medium text-[var(--color-stone-900)] mt-0.5">
                {dict.mobileTriggerLabel}
              </span>
            </span>
          </span>
          {activeFilterCount > 0 ? (
            <span className="text-[11px] tracking-[0.12em] uppercase font-semibold tabular-nums px-2.5 py-1 rounded-full bg-[var(--color-stone-900)] text-white">
              {activeFilterCount}
            </span>
          ) : (
            <ChevronDown
              size={16}
              className="text-[var(--color-stone-400)]"
            />
          )}
        </button>
      </div>

      {/* DESKTOP — inline aside (normal document flow) */}
      <aside className="hidden md:block">
        <div>
          {/* 🛡️ STICKY KALDIRILDI: önceki `sticky top-28` sarmalayıcısı
             kaldırıldı → sidebar sayfayla birlikte normal akışta
             hareket eder. `<aside className="hidden md:block">` ve
             sarmalayıcı div KORUNDU → grid/genişlik/responsive yapı
             DEĞİŞMEDİ.
             🛡️ SCROLL KALDIRILDI (desktop): önceki
             `max-h-[calc(100vh-9rem)] overflow-hidden` çifti card'ı
             viewport'a göre kırpıyor ve iç scroll'u zorunlu kılıyordu.
             İkisi de kaldırıldı → card içeriği kadar uzar. Mobil drawer
             (ve içindeki scroll) DEĞİŞMEDİ. */}
          <div className="bg-white border border-[var(--color-stone-100)] rounded-2xl p-6 flex flex-col">
            {panel}
          </div>
        </div>
      </aside>

      {/* MOBILE DRAWER — full-bleed slide-over */}
      <div
        className={`md:hidden fixed inset-0 z-[100] ${
          mobileOpen ? "" : "pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
        role="dialog"
        aria-modal="true"
        aria-label="Filtreler"
      >
        {/* Backdrop */}
        <div
          onClick={() => setMobileOpen(false)}
          className={`absolute inset-0 bg-[var(--color-stone-900)]/40 backdrop-blur-[2px] transition-opacity duration-300 motion-reduce:transition-none ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Panel — slide from bottom */}
        <div
          ref={drawerRef}
          className={`absolute inset-x-0 bottom-0 h-[92vh] bg-white rounded-t-3xl shadow-[0_-24px_64px_-16px_rgb(27_26_23/0.22)] transition-transform duration-300 motion-reduce:transition-none ${
            mobileOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          {/* Drag indicator */}
          <div className="flex items-center justify-center pt-3 pb-1">
            <span
              aria-hidden="true"
              className="w-10 h-1 rounded-full bg-[var(--color-stone-200)]"
            />
          </div>
          <div className="px-5 pt-2 pb-5 h-[calc(92vh-1.25rem)]">{panel}</div>
        </div>
      </div>
    </>
  );
}

/* ===============================================================
   SUB-COMPONENTS
   =============================================================== */

/* 🛡️ ADDITIVE ACCORDION — `collapsible` VERİLMEYEN bölümler
   (Tarih · Kişi Sayısı · Bölge) için çıktı BYTE-IDENTICAL: aynı
   `<header>`, aynı h3/span, chevron YOK, children daima açık.
   `collapsible` verildiğinde başlık satırı `<button>` olur ve sağa
   bölge gruplarındakiyle AYNI chevron eklenir (kapalıyken
   `-rotate-90`). Yeni bir görsel dil ÜRETİLMEDİ. */
function FilterGroup({
  icon,
  label,
  summary,
  children,
  collapsible = false,
  open = true,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  summary: string;
  children: React.ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <section className="space-y-3">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-3 text-left rounded-lg hover:opacity-80 transition-opacity motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <h3 className="flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase font-semibold text-[var(--color-stone-700)]">
            {icon}
            {label}
          </h3>
          <span className="flex items-center gap-2 min-w-0 max-w-[55%]">
            <span className="text-[11px] tracking-[0.06em] text-[var(--color-stone-400)] truncate text-right">
              {summary}
            </span>
            <ChevronDown
              size={14}
              className={`text-[var(--color-stone-400)] shrink-0 transition-transform motion-reduce:transition-none ${
                open ? "" : "-rotate-90"
              }`}
            />
          </span>
        </button>
      ) : (
        <header className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase font-semibold text-[var(--color-stone-700)]">
            {icon}
            {label}
          </h3>
          <span className="text-[11px] tracking-[0.06em] text-[var(--color-stone-400)] truncate max-w-[55%] text-right">
            {summary}
          </span>
        </header>
      )}
      {(!collapsible || open) && <div>{children}</div>}
    </section>
  );
}

function CounterRow({
  label,
  hint,
  value,
  min,
  max,
  onChange,
  dict,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  /* 🛡️ PHASE 13 — yalnız aria-label şablonları için. */
  dict: FiltersDictionary;
}) {
  const canDec = value > min;
  const canInc = value < max;
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[14px] font-medium text-[var(--color-stone-900)]">
          {label}
        </p>
        <p className="text-[11px] text-[var(--color-stone-400)] tracking-[0.02em]">
          {hint}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => canDec && onChange(value - 1)}
          disabled={!canDec}
          aria-label={formatDictionaryString(dict.decreaseAriaLabel, {
            label,
          })}
          className="w-8 h-8 rounded-full border border-[var(--color-stone-200)] text-[var(--color-stone-700)] flex items-center justify-center hover:border-[var(--color-stone-300)] hover:text-[var(--color-stone-900)] transition-colors motion-reduce:transition-none disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <Minus size={13} />
        </button>
        <span className="tabular-nums text-[14px] font-medium text-[var(--color-stone-900)] w-5 text-center">
          {value}
        </span>
        <button
          type="button"
          onClick={() => canInc && onChange(value + 1)}
          disabled={!canInc}
          aria-label={formatDictionaryString(dict.increaseAriaLabel, {
            label,
          })}
          className="w-8 h-8 rounded-full border border-[var(--color-stone-200)] text-[var(--color-stone-700)] flex items-center justify-center hover:border-[var(--color-stone-300)] hover:text-[var(--color-stone-900)] transition-colors motion-reduce:transition-none disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}
