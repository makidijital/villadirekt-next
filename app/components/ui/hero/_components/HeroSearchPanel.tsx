"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
/* 🛡️ Public taksonomi + bölge yüklemesi artık server action üzerinden
   (menu/villa-type repository + @/lib/db client bundle'a girmez);
   aynı SELECT/order shape, aynı UI davranışı. */
import { loadHeroFilters } from "./hero-filters.action";
/* 🛡️ ADDITIVE — "Gelişmiş Arama" villa özellikleri listesi. AYRI action:
   `loadHeroFilters` dosyası ve testleri BİREBİR korunur (bkz. hero-
   features.action.ts başlığı). İki action PARALEL çağrılır. */
import { loadHeroFeatures } from "./hero-features.action";

import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { tr } from "date-fns/locale";
import { enUS } from "date-fns/locale";
import { de as deLocale } from "date-fns/locale";
/* 🛡️ PHASE 11 — panel metinleri ve takvim locale'i dile göre. Arama
   state'i, `buildHeroSearchParams` ve `router.push` hedefi DEĞİŞMEDİ. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
/* 🛡️ NAVIGATION LOCALE PERSISTENCE — iç link aktif locale'i taşır
   (bkz. lib/i18n/locale-href.ts). */
import { localeHref } from "@/lib/i18n/locale-href";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";

import MobileKbSafeInput from "@/app/components/ui/datepicker/MobileKbSafeInput";

import {
  Search,
  Tag,
  MapPin,
  Calendar,
  Users,
  ChevronDown,
} from "lucide-react";

import { buildHeroSearchParams } from "../_helpers/build-search-params";
import { buildHeroDateLabel } from "../_helpers/date-label";

import type { FilterOption } from "../_types/hero";

registerLocale("tr", tr);
/* 🛡️ PHASE 11 — EN/DE takvim locale'leri de module-level kaydedilir;
   `registerLocale("tr", tr)` çağrısı DEĞİŞMEDİ. */
registerLocale("en", enUS);
registerLocale("de", deLocale);

/* ===============================================================
   🛡️ FAZ 4 — HeroSearchPanel (CLIENT — STATEFUL)
   ===============================================================
   Eski Hero.tsx > SEARCH PANEL bloğu (L599-890) BYTE-IDENTICAL
   kopyası + Hero.tsx içinde tutulan state/ref/effect/helper'lar
   self-contained Search Panel'e taşındı.

   ENCAPSULATED STATE:
     - categories, regions, guests, startDate, endDate
     - openCat, openRegion
     - categoryOptions, regionOptions
     - catRef, regRef (outside click DOM refs)

   ENCAPSULATED EFFECTS:
     - villa_types + villa_locations fetch (mount)
     - document.mousedown outside click handler

   ENCAPSULATED HELPERS:
     - toggleItem (pure, inline)
     - handleSearch (delegates to buildHeroSearchParams + router.push)
     - dateLabel (delegates to buildHeroDateLabel)

   🔎 EK — Panelin üst kenarına yarı binen ortalanmış villa-adı arama
   input'u eklendi (VillaSearchBox hero variant, kendi canlı arama +
   navigation logic'i ile). Bu input filtre submit butonundan TAMAMEN
   BAĞIMSIZ; salt görsel/UX ek. Filtre bar (CATEGORY → REGION → DATE →
   GUESTS → "Villa bul" CTA) ve handleSearch/router.push AYNEN korundu.

   ⚠️ KESIN KURAL:
     - useRouter() çağrısı bu component içinde (HEro shell'den prop
       geçmez); encapsulation tam.
     - DatePicker `portalId="hero-datepicker-portal"` AYNEN; portal
       target `<div id="hero-datepicker-portal" />` Hero shell'in
       içinde kalır.
     - Outside click `document.addEventListener("mousedown", handler)`
       + cleanup `removeEventListener` AYNEN.
     - DatePicker callback signature `(dates: any) => { const [start,
       end] = dates; ... }` — `any` tipi BYTE-IDENTICAL korundu
       (DatePicker selectsRange tipi loose). Burada typed yapmak
       potansiyel selectsRange semantic'i etkileyebilir → skip.
     - 4 alan sırası: CATEGORY → REGION → DATE → GUESTS → SEARCH AYNEN.
     - DatePicker / dropdown / outside-click davranışı AYNEN.
     - registerLocale("tr", tr) module-level çağrı korundu.

   🎨 GÖRSEL YENİLEME (marka refresh — bu turda) — SADECE className/
   style/renk değerleri değişti. State/handler/effect/ref/prop/attribute
   mantığı yukarıdaki liste ile BİREBİR aynı kaldı:
     - Turkuaz (--brand-coral*, --color-champagne-*) vurgular →
       SADECE #ED7926 (turuncu) / #0973BA (mavi) marka renkleri.
     - Panel: daha yumuşak radius (28px), turuncu/mavi çok-katmanlı
       glow shadow, ince entrance animasyonu (local `<style>`,
       globals.css'e dokunulmadı, prefers-reduced-motion'da kapanır).
     - Tarih/Kişi alanları → turuncu ikon vurgusu; Tip/Bölge alanları
       → mavi ikon vurgusu (tutarlı ikili renk haritası).
     - "Villa bul" CTA → turuncu→mavi gradient + hafif breathing glow
       (Header/Hero CTA ile aynı teknik, TopBar shimmer'ı DEĞİL).
   =============================================================== */

export default function HeroSearchPanel({
  locale = DEFAULT_LOCALE,
}: {
  locale?: Locale;
} = {}) {
  const dict = getDictionary(locale).home.search;
  const router = useRouter();

  const [categories, setCategories] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  /* 🛡️ Hero arama formu — VARSAYILAN kişi sayısı 2.
     Yalnız başlangıç state değeri; dropdown (1–10) ve
     `buildHeroSearchParams` URL yazım kuralı DEĞİŞMEDİ. */
  const [guests, setGuests] = useState(2);

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const [openCat, setOpenCat] = useState(false);
  const [openRegion, setOpenRegion] = useState(false);

  /* 🛡️ GELİŞMİŞ ARAMA (ADDITIVE) — ±3 gün esnek EK sonuç. Ana tarih/
     filtre/query davranışını ETKİLEMEZ; yalnız `flexible=3` param'ını
     ekler. Kapalıyken hiç param yazılmaz → mevcut URL birebir. */
  const [advOpen, setAdvOpen] = useState(false);
  const [flexible, setFlexible] = useState(false);

  /* 🛡️ ADDITIVE — villa özellikleri çoklu seçimi (AND). Boş kaldığında
     `ozellikler` parametresi HİÇ yazılmaz → mevcut arama davranışı
     BİREBİR aynı. */
  const [features, setFeatures] = useState<string[]>([]);
  /* Yükleme ile "hiç özellik yok" durumunu ayırmak için (kategori
     dropdown'ındaki `optionsLoading` davranışının aynısı). */
  const [featuresLoaded, setFeaturesLoaded] = useState(false);

  const [categoryOptions, setCategoryOptions] = useState<FilterOption[]>([]);
  const [regionOptions, setRegionOptions] = useState<FilterOption[]>([]);
  const [featureOptions, setFeatureOptions] = useState<FilterOption[]>([]);

  const catRef = useRef<HTMLDivElement>(null);
  const regRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchFilters = async () => {
      /* 🔀 Migration 066 — Tip dropdown'u sort_order ASC (findAllForPublicTaxonomy).
         Dönüş şekli (id, name, slug) findAllVillaTypes ile BİREBİR; UI değişmez.
         Diğer public alanlarla (CategoryCollection/arama/kiralik/kisa-sureli)
         aynı sıra. Bölge (locations) ve navbar menü sistemi ETKİLENMEZ. */
      /* 🛡️ PHASE 11 P0 — locale geçilir: EN/DE'de tip adları
         `villa_type_translations` üzerinden çevrilmiş gelir
         (VillaTypeCarousel ile AYNI helper'lar). TR'de ek sorgu YOK. */
      /* 🛡️ PARALEL: özellik listesi ayrı action'dan gelir → EK RTT YOK.
         `.catch(() => [])` ZORUNLU: özellik sorgusu hata verse bile
         tip/bölge yüklemesi ETKİLENMEZ (mevcut davranış korunur). */
      const [{ types, locations }, featureList] = await Promise.all([
        loadHeroFilters(locale),
        loadHeroFeatures(locale).catch(() => [] as FilterOption[]),
      ]);
      if (types) setCategoryOptions(types);
      setFeatureOptions(featureList);
      setFeaturesLoaded(true);
      /* 🛡️ Migration 050 — Hero bölge dropdown'ı yalnız ANA BÖLGELERİ
         (grup kökü: name === filter_group_name) gösterir. Alt bölgeler
         gizlenir; detay seçimi /arama sidebar'ında. Resolver/URL/SEO
         değişmez — kullanıcı "Kalkan" seçince grup-kökü genişletmesi
         sayesinde tüm alt bölge villaları gelmeye devam eder. */
      if (locations) {
        setRegionOptions(
          locations.filter((l) => {
            const g = (l.filter_group_name ?? "").toString().trim();
            return g.length > 0 && l.name === g;
          })
        );
      }
    };
    fetchFilters();
    /* 🛡️ PHASE 11 P0 — `locale` bağımlılığa eklendi: tip adları locale'e
       göre çözüldüğü için doğru bağımlılık budur. Pratikte her locale
       AYRI bir route/sayfa olduğundan değer bir sayfa ömrü boyunca
       DEĞİŞMEZ → ek fetch OLUŞMAZ (TR davranışı birebir aynı). */
  }, [locale]);

  // Outside click for dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node))
        setOpenCat(false);
      if (regRef.current && !regRef.current.contains(e.target as Node))
        setOpenRegion(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleItem = (
    value: string,
    list: string[],
    setList: (v: string[]) => void
  ) => {
    if (list.includes(value)) setList(list.filter((i) => i !== value));
    else setList([...list, value]);
  };

  const handleSearch = () => {
    const query = buildHeroSearchParams({
      categories,
      regions,
      startDate,
      endDate,
      guests,
      categoryOptions,
      regionOptions,
      /* Ana start/end DEĞİŞMEZ; yalnız ek-sonuç bayrağı. */
      flexible: flexible ? 3 : 0,
      /* Boş dizi → `ozellikler` parametresi yazılmaz (mevcut URL birebir). */
      features,
    });
    router.push(localeHref(`/arama?${query}`, locale));
  };

  const dateLabel = buildHeroDateLabel(startDate, endDate, locale);

  return (
    /* ═══════════════════════════════════════════════════════
        🛡️ MARKA REFRESH — FLOATING SEARCH PANEL (premium glass)
        ═══════════════════════════════════════════════════════
        Mevcut state + handlers AYNEN korundu. Visual:
          - Koyu hero görseli üzerinde yüzen glass panel
          - Turuncu/mavi çok-katmanlı glow shadow stack
          - Daha geniş radius (28px)
          - İnce top highlight (white inner ring)
          - Turuncu→mavi gradient CTA + breathing glow
          - Hafif, tek seferlik entrance animasyonu (local <style>,
            globals.css'e dokunulmadı, reduced-motion'da kapanır)
        ═══════════════════════════════════════════════════════ */
    <div className="relative mt-12 md:mt-16 hero-panel-in">
      <style>{`
        @keyframes heroPanelIn {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hero-panel-in { animation: heroPanelIn 700ms cubic-bezier(0.16,1,0.3,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .hero-panel-in { animation: none; }
        }
      `}</style>
      {/* 🛡️ Floating villa-adı arama (VillaSearchBox) KALDIRILDI — villa-adı
          araması artık Desktop'ta Header, mobilde Bottom Navigation →
          SearchBottomSheet üzerinden. Aşağıdaki FİLTRE paneli (Tip / Bölge /
          Tarih / Kişi / Villa bul) BİREBİR korunur; hiçbir filtre davranışı
          değişmedi. */}
      <div
        className="
          relative isolate z-30
          bg-gradient-to-b from-white/30 to-white/[0.14] backdrop-blur-xl
          border border-white/30
          rounded-[16px]
          shadow-[0_20px_50px_-24px_rgba(9,115,186,0.35),0_14px_38px_-26px_rgba(237,121,38,0.3)]
          px-2 md:px-2.5 pb-2 md:pb-2.5 pt-2 md:pt-2.5
          gap-1.5 md:gap-2
          flex flex-col md:flex-row items-stretch
          text-left
        "
      >
      {/* Inner highlight — premium top edge */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0 rounded-[16px]
          ring-1 ring-inset ring-white/50
        "
      />
      {/* DATE */}
      <div className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-white/40 border border-white/50 hover:bg-white/75 hover:border-[#ED7926]/35 transition flex items-center gap-3">
        <span
          className="
            w-9 h-9 rounded-xl shrink-0
            bg-[#ED7926]/12
            flex items-center justify-center
            text-[#ED7926]
          "
          aria-hidden
        >
          <Calendar size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-500)]">
            {dict.dateLabel}
          </div>
          <DatePicker
            selected={startDate}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onChange={(dates: any) => {
              const [start, end] = dates;
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
            className="!bg-transparent !border-0 !shadow-none !p-0 !rounded-none w-full text-[14px] font-medium !text-[var(--color-stone-900)] placeholder-[var(--color-stone-400)] cursor-pointer"
            /* 🛡️ PHASE 11 — sentinel string karşılaştırması yerine
               DOĞRUDAN state kontrolü: `buildHeroDateLabel` sentinel'i
               TAM OLARAK `!startDate` iken döndürür → davranış birebir
               aynı, ama locale'e bağımlı değil. */
            value={startDate ? dateLabel : ""}
            popperPlacement="bottom-start"
            popperClassName="!z-[60]"
            portalId="hero-datepicker-portal"
            /* 🛡️ Mobil sanal klavye baskılama — customInput içinde
               inputMode="none". Takvim popper'ı, value display,
               selectsRange, onChange, dateFormat, locale, minDate,
               placeholderText AYNEN korunur. Desktop davranışı
               değişmez. Detay: MobileKbSafeInput.tsx başlığı. */
            customInput={<MobileKbSafeInput />}
          />
        </div>
      </div>


      {/* GUESTS */}
      <div className="px-4 py-3 rounded-xl bg-white/40 border border-white/50 hover:bg-white/75 hover:border-[#ED7926]/35 transition flex items-center gap-3">
        <span
          className="
            w-9 h-9 rounded-xl shrink-0
            bg-[#ED7926]/12
            flex items-center justify-center
            text-[#ED7926]
          "
          aria-hidden
        >
          <Users size={16} />
        </span>
        <div className="min-w-0">
          <div className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-500)]">
            {dict.guestsLabel}
          </div>
          <select
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="!bg-transparent !border-0 !shadow-none !p-0 !rounded-none text-[14px] font-medium !text-[var(--color-stone-900)] cursor-pointer"
            style={{ backgroundImage: "none", paddingRight: 0 }}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((g) => (
              <option key={g} value={g}>
                {/* 🛡️ PHASE 11 P0 — TR'de "{n} kişi" ile BİREBİR aynı çıktı. */}
                {formatDictionaryString(dict.guestsOption, { n: g })}
              </option>
            ))}
          </select>
        </div>
      </div>


      {/* CATEGORY */}
      <div ref={catRef} className="relative flex-1 min-w-0">
        <button
          type="button"
          onClick={() => {
            setOpenCat(!openCat);
            setOpenRegion(false);
          }}
          className="
            w-full px-4 py-3 rounded-xl
            bg-white/40 border border-white/50
            hover:bg-white/75 hover:border-[#0973BA]/35
            transition flex items-center gap-3 text-left
            focus:outline-none focus-visible:ring-2
            focus-visible:ring-[#0973BA]/30
          "
        >
          <span
            className="
              w-9 h-9 rounded-xl shrink-0
              bg-[#0973BA]/10
              flex items-center justify-center
              text-[#0973BA]
            "
            aria-hidden
          >
            <Tag size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-500)]">
              {dict.typeLabel}
            </div>
            <div className="text-[14px] font-medium text-[var(--color-stone-900)] truncate">
              {categories.length
                ? formatDictionaryString(dict.typesSelected, {
                    n: categories.length,
                  })
                : dict.villaType}
            </div>
          </div>
          <ChevronDown
            size={14}
            className={`text-[var(--color-stone-400)] transition ${
              openCat ? "rotate-180" : ""
            }`}
          />
        </button>

        {openCat && (
          <div className="absolute top-full mt-2 left-0 w-full md:w-72 min-w-[16rem] max-w-[calc(100vw-2.5rem)] bg-white border border-[var(--color-stone-100)] rounded-2xl shadow-[0_24px_48px_-16px_rgb(27_26_23/0.18)] p-2 z-[60] max-h-72 overflow-auto">
            {categoryOptions.length === 0 && (
              <div className="text-sm text-[var(--color-stone-400)] p-3">
                {dict.optionsLoading}
              </div>
            )}
            {categoryOptions.map((item) => {
              const checked = categories.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex items-center gap-3 text-sm px-3 py-2.5 rounded-xl cursor-pointer transition ${
                    checked
                      ? "bg-[#0973BA]/10 text-[var(--color-stone-900)]"
                      : "hover:bg-[#0973BA]/5 text-[var(--color-stone-700)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      toggleItem(item.id, categories, setCategories)
                    }
                    className="!w-4 !h-4 !rounded"
                    style={{ accentColor: "#0973BA" }}
                  />
                  {item.name}
                </label>
              );
            })}
          </div>
        )}
      </div>


      {/* REGION */}
      <div ref={regRef} className="relative flex-1 min-w-0">
        <button
          type="button"
          onClick={() => {
            setOpenRegion(!openRegion);
            setOpenCat(false);
          }}
          className="
            w-full px-4 py-3 rounded-xl
            bg-white/40 border border-white/50
            hover:bg-white/75 hover:border-[#0973BA]/35
            transition flex items-center gap-3 text-left
            focus:outline-none focus-visible:ring-2
            focus-visible:ring-[#0973BA]/30
          "
        >
          <span
            className="
              w-9 h-9 rounded-xl shrink-0
              bg-[#0973BA]/10
              flex items-center justify-center
              text-[#0973BA]
            "
            aria-hidden
          >
            <MapPin size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-500)]">
              {dict.regionLabel}
            </div>
            <div className="text-[14px] font-medium text-[var(--color-stone-900)] truncate">
              {regions.length
                ? formatDictionaryString(dict.regionsSelected, {
                    n: regions.length,
                  })
                : dict.allRegions}
            </div>
          </div>
          <ChevronDown
            size={14}
            className={`text-[var(--color-stone-400)] transition ${
              openRegion ? "rotate-180" : ""
            }`}
          />
        </button>

        {openRegion && (
          <div className="absolute top-full mt-2 left-0 md:left-auto md:right-0 w-full md:w-72 min-w-[16rem] max-w-[calc(100vw-2.5rem)] bg-white border border-[var(--color-stone-100)] rounded-2xl shadow-[0_24px_48px_-16px_rgb(27_26_23/0.18)] p-2 z-[60] max-h-72 overflow-auto">
            {regionOptions.length === 0 && (
              <div className="text-sm text-[var(--color-stone-400)] p-3">
                {dict.optionsLoading}
              </div>
            )}
            {regionOptions.map((item) => {
              const checked = regions.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex items-center gap-3 text-sm px-3 py-2.5 rounded-xl cursor-pointer transition ${
                    checked
                      ? "bg-[#0973BA]/10 text-[var(--color-stone-900)]"
                      : "hover:bg-[#0973BA]/5 text-[var(--color-stone-700)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      toggleItem(item.id, regions, setRegions)
                    }
                    className="!w-4 !h-4 !rounded"
                    style={{ accentColor: "#0973BA" }}
                  />
                  {item.name}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* SEARCH CTA — filtre submit (handleSearch → /arama). Turuncu→mavi
         gradient + hafif breathing glow → premium concierge button.
         Floating villa-adı input'tan BAĞIMSIZ; filtre akışını tetikler. */}
      <button
        onClick={handleSearch}
        className="
          group relative inline-flex items-center justify-center gap-2
          !rounded-xl !px-7 md:!px-8 !py-4
          mt-1.5 md:mt-0 md:ml-1.5
          text-white font-medium text-[14px] tracking-[0.02em]
          bg-gradient-to-r from-[#ED7926] to-[#0973BA]
          shadow-[0_20px_44px_-12px_rgba(237,121,38,0.5),0_10px_26px_-8px_rgba(9,115,186,0.45),inset_0_1px_0_rgba(255,255,255,0.28)]
          hover:shadow-[0_26px_54px_-12px_rgba(237,121,38,0.6),0_12px_30px_-8px_rgba(9,115,186,0.55),inset_0_1px_0_rgba(255,255,255,0.34)]
          hover:-translate-y-[1px]
          transition-[transform,box-shadow] duration-300
          motion-reduce:transition-none motion-reduce:hover:translate-y-0
          focus:outline-none focus-visible:ring-2
          focus-visible:ring-[#0973BA]/50
          focus-visible:ring-offset-2 focus-visible:ring-offset-white
        "
      >
        <span
          aria-hidden
          className="
            pointer-events-none absolute -inset-1 !rounded-xl
            bg-gradient-to-r from-[#ED7926] to-[#0973BA]
            opacity-30 blur-md
            animate-pulse [animation-duration:2.8s]
            group-hover:opacity-55
            transition-opacity duration-300
            motion-reduce:animate-none
          "
        />
        <Search
          size={16}
          className="
            relative z-10
            transition-transform duration-300
            motion-reduce:transition-none
            group-hover:scale-110
          "
          aria-hidden
        />
        <span className="relative z-10">{dict.submit}</span>
      </button>

      </div>

      {/* ═══════════════════════════════════════════════════════
          🛡️ GELİŞMİŞ ARAMA — panel altında sade/premium expandable.
          Inline açılır (floating değil) → DatePicker portal / dropdown
          stacking'iyle ÇAKIŞMAZ. Filtre paneli tasarımına dokunmaz.
          Checkbox yalnız `flexible` state'ini set eder; Villa Bul'a
          basınca `flexible=3` param'ı eklenir (ana tarih değişmez).
          ═══════════════════════════════════════════════════════ */}
      <div className="mt-3 flex flex-col items-center">
        <button
          type="button"
          onClick={() => setAdvOpen((o) => !o)}
          aria-expanded={advOpen}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/75 backdrop-blur-md px-4 py-2 text-[12.5px] font-medium text-[var(--color-stone-700)] border border-white/60 shadow-sm hover:bg-white transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40"
        >
          <ChevronDown
            size={15}
            className={
              "transition-transform duration-200 motion-reduce:transition-none " +
              (advOpen ? "rotate-180" : "")
            }
            aria-hidden
          />
          {dict.advanced}
        </button>

        {advOpen && (
          <div className="mt-2 w-[min(92vw,420px)] rounded-2xl bg-white/95 backdrop-blur-md border border-[var(--color-stone-100)] shadow-[0_20px_44px_-20px_rgba(11,31,58,0.35)] px-4 py-3.5">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={flexible}
                onChange={(e) => setFlexible(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded cursor-pointer"
                style={{ accentColor: "#ED7926" }}
              />
              <span className="text-[13px] leading-snug text-[var(--color-stone-700)]">
                {dict.flexibleHint}
              </span>
            </label>

            {/* ═══════════════════════════════════════════════════════
                VİLLA ÖZELLİKLERİ — ÇOKLU SEÇİM (AND)
                ═══════════════════════════════════════════════════════
                Seçim yapılmazsa `ozellikler` parametresi HİÇ yazılmaz →
                mevcut arama davranışı BİREBİR korunur. Seçenekler
                `villa_features` tablosundan DİNAMİK gelir (hard-code YOK);
                adlar EN/DE'de mevcut çeviri zinciriyle çözülür.
                Checkbox stili mevcut tip/bölge dropdown'larıyla AYNI.
            ═══════════════════════════════════════════════════════ */}
            <div className="mt-3.5 border-t border-[var(--color-stone-100)] pt-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-500)]">
                  {dict.featuresLabel}
                </div>
                {features.length > 0 && (
                  <div className="text-[11.5px] font-medium text-[#0973BA]">
                    {formatDictionaryString(dict.featuresSelected, {
                      n: features.length,
                    })}
                  </div>
                )}
              </div>

              {featureOptions.length === 0 ? (
                <div className="mt-2 text-[13px] text-[var(--color-stone-400)]">
                  {featuresLoaded ? dict.featuresEmpty : dict.optionsLoading}
                </div>
              ) : (
                <div className="mt-2 max-h-[190px] overflow-y-auto -mx-1 px-1">
                  {featureOptions.map((item) => {
                    const checked = features.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className={`flex items-center gap-3 text-[13.5px] px-2.5 py-2 rounded-xl cursor-pointer transition ${
                          checked
                            ? "bg-[#0973BA]/10 text-[var(--color-stone-900)]"
                            : "hover:bg-[#0973BA]/5 text-[var(--color-stone-700)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            toggleItem(item.id, features, setFeatures)
                          }
                          className="!w-4 !h-4 !rounded"
                          style={{ accentColor: "#0973BA" }}
                        />
                        {item.name}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
