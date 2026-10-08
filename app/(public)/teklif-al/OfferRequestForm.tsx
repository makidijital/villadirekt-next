"use client";

/* ===============================================================
   🛡️ FAZ 40 — OFFER REQUEST FORM (client island)
   ===============================================================
   /teklif-al guest concierge submission.
   Sections: 4 (travel group / dates / preferences / contact).
   Multi-select chips, react-datepicker reuse, dual budget cards.
   Inline submission status; no toast provider on public.
   =============================================================== */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
/* 🛡️ TR/EN/DE takvim locale'leri — `FilterSidebar.tsx` /
   `HeroSearchPanel.tsx` ile AYNI desen. `react-datepicker` sürümü ve
   mevcut `registerLocale` mekanizması DEĞİŞMEDİ; yalnız iki locale
   daha kaydedildi. Yeni kütüphane EKLENMEDİ. */
import { tr, enUS, de } from "date-fns/locale";

import MobileKbSafeInput from "@/app/components/ui/datepicker/MobileKbSafeInput";
import {
  Heart,
  Home,
  Users,
  PartyPopper,
  Calendar,
  Minus,
  Plus,
  Check,
  AlertCircle,
  CalendarDays,
  MapPin,
  UserRound,
  MessageSquareText,
  Phone,
  MessageCircle,
  Lock,
  Clock,
  BellRing,
  Compass,
  CheckCircle2,
} from "lucide-react";

/* 🛡️ FAZ 2 frontend purge — `import { eski sağlayıcı }` KALDIRILDI.
   Taxonomy dropdown'ları artık /api/public/taxonomies GET ile fetch'lenir.
   Submit yine mevcut `createOfferRequest` service'i üzerinden. */
/* 🛡️ Submit artık doğrudan anon DB client insert yerine sunucu
   route'una (/api/public/offer-requests) gider: applyRateLimit +
   honeypot/time-trap + service-role insert. Tip korunur. */
import type { CreateOfferRequestInput } from "@/app/services/offer-request.service";

/* 🛡️ PUBLIC ÇOKLU DİL — statik metinler MEVCUT public dictionary'den
   (`offer` namespace). Taxonomy seçenek adları (bölge/villa tipi/
   özellik) VERİdir ve burada ÇEVRİLMEZ; API endpoint'i, honeypot/
   time-trap, payload alanları ve submit akışı DEĞİŞMEDİ. */
import { DEFAULT_LOCALE, LOCALE_BCP47, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
/* 🛡️ Taxonomy ETİKETİ locale-aware — `/api/public/taxonomies` cevabına
   ADDITIVE eklenen `name_by_locale` ile çözülür. Çeviri yoksa canonical
   TR ada düşer (`ReservationForm`'un ödeme yöntemi etiketiyle AYNI
   desen). Gönderilen payload token'ı (`slug || id`) DEĞİŞMEZ. */
import {
  resolveTaxonomyName,
  type TaxonomyNameByLocale,
} from "@/lib/i18n/taxonomy-name.helper";

registerLocale("tr", tr);
registerLocale("en", enUS);
registerLocale("de", de);

/* ─────────────── Travel groups (static) ─────────────── */
type TravelGroup = "honeymoon" | "core_family" | "extended_family" | "friends";

/* 🛡️ `id` değerleri (payload'a giden `travel_group`) DEĞİŞMEDİ; yalnız
   görünen etiket/açıklama dictionary anahtarlarına bağlandı. */
const TRAVEL_GROUPS: Array<{
  id: TravelGroup;
  labelKey: "groupHoneymoon" | "groupCoreFamily" | "groupExtendedFamily" | "groupFriends";
  descriptionKey:
    | "groupHoneymoonDescription"
    | "groupCoreFamilyDescription"
    | "groupExtendedFamilyDescription"
    | "groupFriendsDescription";
  icon: React.ReactNode;
}> = [
  {
    id: "honeymoon",
    labelKey: "groupHoneymoon",
    descriptionKey: "groupHoneymoonDescription",
    icon: <Heart size={18} strokeWidth={1.6} aria-hidden />,
  },
  {
    id: "core_family",
    labelKey: "groupCoreFamily",
    descriptionKey: "groupCoreFamilyDescription",
    icon: <Home size={18} strokeWidth={1.6} aria-hidden />,
  },
  {
    id: "extended_family",
    labelKey: "groupExtendedFamily",
    descriptionKey: "groupExtendedFamilyDescription",
    icon: <Users size={18} strokeWidth={1.6} aria-hidden />,
  },
  {
    id: "friends",
    labelKey: "groupFriends",
    descriptionKey: "groupFriendsDescription",
    icon: <PartyPopper size={18} strokeWidth={1.6} aria-hidden />,
  },
];

/* ─────────────── Form state shape ─────────────── */
type FormState = {
  travelGroup: TravelGroup | null;
  startDate: Date | null;
  endDate: Date | null;
  adults: number;
  children: number;
  regions: string[];
  villaTypes: string[];
  features: string[];
  budgetMin: string; /* string input — kullanıcı yazdığı kadar; submit'te number'a çevrilir */
  budgetMax: string;
  budgetCurrency: string;
  fullName: string;
  phone: string;
  email: string;
  note: string;
};

const INITIAL: FormState = {
  travelGroup: null,
  startDate: null,
  endDate: null,
  adults: 2,
  children: 0,
  regions: [],
  villaTypes: [],
  features: [],
  budgetMin: "",
  budgetMax: "",
  budgetCurrency: "TRY",
  fullName: "",
  phone: "",
  email: "",
  note: "",
};

type Option = {
  id: string;
  name: string;
  slug?: string | null;
  /** Migration 050 — Hero ile aynı: bölge dropdown'ı yalnız grup
      köklerini (name === filter_group_name) gösterir. */
  filter_group_name?: string | null;
  /** 🛡️ ADDITIVE — `/api/public/taxonomies` cevabındaki EN/DE ad
   *  haritası. Bölgelerde HİÇ gelmez (özel isim → çevrilmez);
   *  villa tipi / özellik satırlarında gelir. Yoksa TR fallback. */
  name_by_locale?: TaxonomyNameByLocale;
};

type SubmitStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function OfferRequestForm({
  /* 🛡️ Opsiyonel — verilmezse "tr" → TR çıktısı BİREBİR eskisi gibi. */
  locale = DEFAULT_LOCALE,
  /* 🎨 ADDITIVE (opsiyonel) — yardım kartı için settings'ten türetilmiş
     MEVCUT telefon / WhatsApp href'leri (FloatingSocial ile aynı türetme;
     OfferPageBody geçer). Verilmezse kart render edilmez. */
  phoneHref = null,
  whatsappHref = null,
}: {
  locale?: Locale;
  phoneHref?: string | null;
  whatsappHref?: string | null;
}) {
  const dict = getDictionary(locale).offer;
  const [state, setState] = useState<FormState>(INITIAL);
  const [status, setStatus] = useState<SubmitStatus>({ kind: "idle" });

  /* 🛡️ SPAM KORUMA — honeypot ("website") + time-trap (mount süresi).
     İletişim formundaki koruma paritesi; sunucu da doğrular. */
  const [website, setWebsite] = useState("");
  const mountedAt = useRef<number>(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);
  const MIN_SUBMIT_MS = 2000;

  /* ─────── Fetch taxonomy options on mount ─────── */
  const [regionOpts, setRegionOpts] = useState<Option[]>([]);
  const [typeOpts, setTypeOpts] = useState<Option[]>([]);
  const [featureOpts, setFeatureOpts] = useState<Option[]>([]);

  useEffect(() => {
    let cancelled = false;
    /* 🛡️ FAZ 2 frontend purge — public fetch /api/public/taxonomies.
       Eski 3 paralel anon DB client fetch tek route response'unda
       birleştirildi. Davranış BYTE-IDENTICAL: aynı select shape'leri,
       aynı Option[] cast, aynı fail-soft semantic (hata → opts boş). */
    (async () => {
      try {
        const res = await fetch("/api/public/taxonomies");
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          locations?: Option[];
          types?: Option[];
          features?: Option[];
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) return;
        /* 🛡️ Migration 050 — Hero ile aynı: yalnız ANA BÖLGELERİ
           (grup kökü: name === filter_group_name) göster. Alt bölgeler
           gizlenir; DB/SEO/URL/resolver/grup sistemi değişmez. */
        setRegionOpts(
          (json.locations || []).filter((l) => {
            const g = (l.filter_group_name ?? "").toString().trim();
            return g.length > 0 && l.name === g;
          })
        );
        setTypeOpts(json.types || []);
        setFeatureOpts(json.features || []);
      } catch {
        /* fail-soft: dropdown'lar boş kalır (eski davranış da hata
           gösterilmiyor, sadece state boş). */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ─────── Helpers ─────── */
  const updateField = <K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) => setState((s) => ({ ...s, [key]: value }));

  const toggleArr = (key: "regions" | "villaTypes" | "features", id: string) =>
    setState((s) => {
      const cur = s[key];
      const next = cur.includes(id)
        ? cur.filter((x) => x !== id)
        : [...cur, id];
      return { ...s, [key]: next };
    });

  const tokenFromOption = (id: string, opts: Option[]): string => {
    const opt = opts.find((o) => o.id === id);
    return (opt?.slug && opt.slug.trim()) || id;
  };

  const isReady = useMemo(() => {
    if (state.fullName.trim().length < 2) return false;
    if (state.phone.trim().length < 6) return false;
    return true;
  }, [state.fullName, state.phone]);

  /* ─────── Submit ─────── */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (status.kind === "loading") return;

    /* 🛡️ Honeypot + time-trap — bot ise sessiz success (insert yok).
       İletişim formundaki davranışla birebir. */
    const elapsed = Date.now() - mountedAt.current;
    if (website.trim().length > 0 || elapsed < MIN_SUBMIT_MS) {
      setStatus({ kind: "success" });
      return;
    }

    setStatus({ kind: "loading" });

    const fmt = (d: Date | null): string | null => {
      if (!d) return null;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const payload: CreateOfferRequestInput = {
      travel_group: state.travelGroup,
      start_date: fmt(state.startDate),
      end_date: fmt(state.endDate),
      adults: state.adults,
      children: state.children,
      region_tokens: state.regions.map((id) => tokenFromOption(id, regionOpts)),
      villa_type_tokens: state.villaTypes.map((id) =>
        tokenFromOption(id, typeOpts)
      ),
      feature_tokens: state.features.map((id) =>
        tokenFromOption(id, featureOpts)
      ),
      budget_min:
        state.budgetMin.trim() === "" ? null : Number(state.budgetMin) || null,
      budget_max:
        state.budgetMax.trim() === "" ? null : Number(state.budgetMax) || null,
      budget_currency: state.budgetCurrency,
      full_name: state.fullName,
      phone: state.phone,
      email: state.email || null,
      note: state.note || null,
    };

    try {
      const httpRes = await fetch("/api/public/offer-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, website, elapsedMs: elapsed }),
      });
      const res = (await httpRes.json().catch(() => null)) as
        | { ok: boolean; error?: string }
        | null;
      if (!httpRes.ok || !res?.ok) {
        setStatus({
          kind: "error",
          /* 🛡️ Sunucu hata metni yerine locale-aware generic mesaj —
             `ContactForm`/`ReservationForm` ile AYNI yaklaşım. */
          message: dict.errorGeneric,
        });
        return;
      }
      setStatus({ kind: "success" });
    } catch {
      setStatus({
        kind: "error",
        message: dict.errorGeneric,
      });
    }
  };


  /* ─────── TEKLİF ÖZETİ (salt-okunur türetim) ───────
     🎨 Yalnız MEVCUT `state` + zaten fetch'lenmiş option listelerinden
     görüntü metni üretir. State'e YAZMAZ, payload'ı ETKİLEMEZ, yeni veri
     çekmez. */
  const fmtShort = (d: Date) =>
    d.toLocaleDateString(LOCALE_BCP47[locale], { day: "numeric", month: "short" });
  const namesOf = (ids: string[], opts: Option[]) =>
    ids
      .map((id) => opts.find((o) => o.id === id))
      .filter((o): o is Option => !!o)
      .map((o) => resolveTaxonomyName(o.name, o.name_by_locale, locale))
      .join(", ");
  const groupDef = TRAVEL_GROUPS.find((g) => g.id === state.travelGroup);
  const regionNames = namesOf(state.regions, regionOpts);
  const typeNames = namesOf(state.villaTypes, typeOpts);
  const featureNames = namesOf(state.features, featureOpts);
  const hasBudget = state.budgetMin.trim() !== "" || state.budgetMax.trim() !== "";
  const summaryRows: Array<{ key: string; label: string; value: string }> = [];
  if (groupDef)
    summaryRows.push({ key: "group", label: dict.travelGroupAriaLabel, value: dict[groupDef.labelKey] });
  if (state.startDate)
    summaryRows.push({
      key: "dates",
      label: dict.dateRangeLabel,
      value: state.endDate
        ? `${fmtShort(state.startDate)} – ${fmtShort(state.endDate)}`
        : fmtShort(state.startDate),
    });
  summaryRows.push({
    key: "guests",
    label: dict.summaryGuests,
    value:
      `${state.adults} ${dict.adultsLabel}` +
      (state.children > 0 ? ` · ${state.children} ${dict.childrenLabel}` : ""),
  });
  if (regionNames) summaryRows.push({ key: "regions", label: dict.regionsLabel, value: regionNames });
  if (typeNames) summaryRows.push({ key: "types", label: dict.villaTypesLabel, value: typeNames });
  if (featureNames) summaryRows.push({ key: "features", label: dict.featuresLabel, value: featureNames });
  if (hasBudget)
    summaryRows.push({
      key: "budget",
      label: dict.budgetLabel,
      value: `${state.budgetMin || "—"} – ${state.budgetMax || "—"} ${state.budgetCurrency}`,
    });
  const hasSummarySelection = summaryRows.some((r) => r.key !== "guests");

  /* ─────── SUCCESS STATE (full-replace) ─────── */
  if (status.kind === "success") {
    return (
      <div
        role="status"
        className="
          rounded-2xl bg-white border border-[#E5E7EB]
          shadow-[0_1px_3px_rgba(10,22,51,0.05)]
          px-6 py-12 md:px-12 md:py-16 text-center max-w-2xl mx-auto
        "
      >
        <div
          className="
            w-14 h-14 rounded-full mx-auto
            bg-[#E6F6EF] text-[#00A86B]
            flex items-center justify-center
          "
          aria-hidden
        >
          <CheckCircle2 size={26} strokeWidth={1.9} />
        </div>
        <h2 className="font-display font-bold text-[22px] md:text-[26px] text-[#0A1633] tracking-[-0.015em] mt-5">
          {dict.successTitle}
        </h2>
        <p className="text-[14px] text-[#64708A] mt-2.5 max-w-md mx-auto leading-relaxed">
          {dict.successBody}
        </p>
      </div>
    );
  }

  /* ─────── FORM ───────
     🎨 /teklif-al REDESIGN — yalnız JSX/className. Alanlar, state,
     handler'lar (updateField/toggleArr/handleSubmit), DatePicker
     prop'ları, min/max, honeypot ve submit koşulu BİREBİR aynı.
     Masaüstü: sol (~%62) bölümlü form · sağ (~%38) özet + CTA + yardım.
     Mobil: form → özet/CTA → yardım (tek kolon). */
  return (
    <form
      onSubmit={handleSubmit}
      className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1.63fr)_minmax(0,1fr)] gap-4 lg:gap-6 items-start"
      noValidate
    >
      {/* 🛡️ HONEYPOT — gerçek kullanıcı görmez (tabindex=-1 + aria-hidden) */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] top-auto w-px h-px overflow-hidden"
      >
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      {/* ═══════════════ SOL — FORM BÖLÜMLERİ ═══════════════ */}
      <div className="min-w-0 space-y-3.5 md:space-y-4">
        {/* ─────── 1. TATİL BİLGİLERİ (grup + tarih + kişi) ─────── */}
        <Section
          step="01"
          icon={<CalendarDays size={17} strokeWidth={1.9} aria-hidden />}
          title={dict.sectionTripTitle}
          subtitle={dict.step2Subtitle}
        >
          <div>
            <p className={LABEL_CLASS}>{dict.step1Title}</p>
            <ul
              role="radiogroup"
              aria-label={dict.travelGroupAriaLabel}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
            >
              {TRAVEL_GROUPS.map((g) => {
                const active = state.travelGroup === g.id;
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => updateField("travelGroup", g.id)}
                      className={
                        "w-full h-full text-left rounded-xl border px-3.5 py-3 " +
                        "transition-colors duration-200 motion-reduce:transition-none " +
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4EF5]/30 " +
                        (active
                          ? "bg-[#EFF4FF] border-[#1B4EF5]"
                          : "bg-white border-[#DDE3EC] hover:bg-[#F4F7FF] hover:border-[#C9D5F7]")
                      }
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={
                            "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center " +
                            (active
                              ? "bg-[#1B4EF5] text-white"
                              : "bg-[#F4F7FF] text-[#1B4EF5]")
                          }
                          aria-hidden
                        >
                          {g.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={
                              "text-[13.5px] font-semibold leading-tight " +
                              (active ? "text-[#1B4EF5]" : "text-[#0A1633]")
                            }
                          >
                            {dict[g.labelKey]}
                          </p>
                          <p className="text-[12px] text-[#64708A] mt-0.5 leading-snug">
                            {dict[g.descriptionKey]}
                          </p>
                        </div>
                        {active && (
                          <Check
                            size={16}
                            strokeWidth={2.4}
                            aria-hidden
                            className="shrink-0 text-[#1B4EF5]"
                          />
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>{dict.dateRangeLabel}</label>
              <div className="flex items-center gap-2.5 h-12 rounded-[11px] border border-[#DDE3EC] bg-white px-3.5 transition-[border-color,box-shadow] duration-200 focus-within:border-[#1B4EF5] focus-within:shadow-[0_0_0_3px_rgba(27,78,245,0.12)]">
                <Calendar
                  size={16}
                  className="text-[#1B4EF5] shrink-0"
                  strokeWidth={1.9}
                  aria-hidden
                />
                <DatePicker
                  selected={state.startDate}
                  onChange={(dates: [Date | null, Date | null] | null) => {
                    const [start, end] = dates || [null, null];
                    updateField("startDate", start);
                    updateField("endDate", end);
                  }}
                  startDate={state.startDate}
                  endDate={state.endDate}
                  selectsRange
                  locale={locale}
                  dateFormat="dd.MM.yyyy"
                  minDate={new Date()}
                  placeholderText={dict.datePlaceholder}
                  className="!bg-transparent !border-0 !shadow-none !p-0 !rounded-none w-full text-[13px] font-semibold !text-[#0A1633] placeholder:!text-[#9CA3AF] placeholder:font-medium cursor-pointer"
                  portalId="teklif-datepicker-portal"
                  popperClassName="!z-[60]"
                  /* 🛡️ Mobil klavye baskılama — customInput içinde
                     inputMode="none". Diğer tüm prop'lar (selectsRange,
                     onChange, dateFormat, locale, minDate, placeholder,
                     portalId, popperClassName) AYNEN korunur. */
                  customInput={<MobileKbSafeInput />}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberStepper
                label={dict.adultsLabel}
                decreaseAriaLabel={dict.stepperDecreaseAriaLabel}
                increaseAriaLabel={dict.stepperIncreaseAriaLabel}
                value={state.adults}
                min={1}
                max={40}
                onChange={(n) => updateField("adults", n)}
              />
              <NumberStepper
                label={dict.childrenLabel}
                decreaseAriaLabel={dict.stepperDecreaseAriaLabel}
                increaseAriaLabel={dict.stepperIncreaseAriaLabel}
                value={state.children}
                min={0}
                max={20}
                onChange={(n) => updateField("children", n)}
              />
            </div>
          </div>
          <div id="teklif-datepicker-portal" />
        </Section>

        {/* ─────── 2. VİLLA TERCİHLERİ ─────── */}
        <Section
          step="02"
          icon={<MapPin size={17} strokeWidth={1.9} aria-hidden />}
          title={dict.sectionPrefsTitle}
          subtitle={dict.step3Subtitle}
        >
          <ChipMultiSelect
            label={dict.regionsLabel}
            options={regionOpts}
            selected={state.regions}
            onToggle={(id) => toggleArr("regions", id)}
            emptyLabel={dict.regionsEmpty}
            locale={locale}
          />
          <ChipMultiSelect
            label={dict.villaTypesLabel}
            options={typeOpts}
            selected={state.villaTypes}
            onToggle={(id) => toggleArr("villaTypes", id)}
            emptyLabel={dict.villaTypesEmpty}
            locale={locale}
          />
          <ChipMultiSelect
            label={dict.featuresLabel}
            options={featureOpts}
            selected={state.features}
            onToggle={(id) => toggleArr("features", id)}
            emptyLabel={dict.featuresEmpty}
            locale={locale}
          />
          <div>
            <p className={LABEL_CLASS}>{dict.budgetLabel}</p>
            <div className="grid grid-cols-2 md:grid-cols-12 gap-3">
              <BudgetField
                label={dict.budgetMin}
                value={state.budgetMin}
                onChange={(v) => updateField("budgetMin", v)}
                className="md:col-span-5"
              />
              <BudgetField
                label={dict.budgetMax}
                value={state.budgetMax}
                onChange={(v) => updateField("budgetMax", v)}
                className="md:col-span-5"
              />
              <div className="col-span-2 md:col-span-2">
                <label className={SUBLABEL_CLASS}>{dict.currencyLabel}</label>
                <select
                  value={state.budgetCurrency}
                  onChange={(e) => updateField("budgetCurrency", e.target.value)}
                  className={FIELD_CLASS + " px-3 cursor-pointer"}
                >
                  <option value="TRY">₺ TRY</option>
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                  <option value="GBP">£ GBP</option>
                </select>
              </div>
            </div>
          </div>
        </Section>

        {/* ─────── 3. İLETİŞİM ─────── */}
        <Section
          step="03"
          icon={<UserRound size={17} strokeWidth={1.9} aria-hidden />}
          title={dict.step4Title}
          subtitle={dict.step4Subtitle}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextField
              label={dict.fullNameLabel}
              value={state.fullName}
              onChange={(v) => updateField("fullName", v)}
              required
              placeholder={dict.fullNamePlaceholder}
              maxLength={120}
            />
            <TextField
              label={dict.phoneLabel}
              value={state.phone}
              onChange={(v) => updateField("phone", v)}
              required
              placeholder="+90 5__ ___ __ __"
              type="tel"
              maxLength={40}
            />
          </div>
          <TextField
            label={dict.emailLabel}
            value={state.email}
            onChange={(v) => updateField("email", v)}
            placeholder={dict.emailPlaceholder}
            type="email"
            maxLength={160}
          />
        </Section>

        {/* ─────── 4. EK BİLGİLER ─────── */}
        <Section
          step="04"
          icon={<MessageSquareText size={17} strokeWidth={1.9} aria-hidden />}
          title={dict.sectionExtraTitle}
        >
          <div>
            <label htmlFor="offer-note" className={LABEL_CLASS}>
              {dict.noteLabel}
            </label>
            <textarea
              id="offer-note"
              value={state.note}
              onChange={(e) => updateField("note", e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={dict.notePlaceholder}
              className="
                w-full !rounded-[11px] !border !border-[#DDE3EC] !bg-white
                px-3.5 py-3 text-[13px] !text-[#0A1633]
                placeholder:!text-[#9CA3AF] leading-relaxed
                focus:!outline-none focus:!border-[#1B4EF5]
                focus:!shadow-[0_0_0_3px_rgba(27,78,245,0.12)]
                transition-[border-color,box-shadow] duration-200
                resize-y min-h-[120px]
              "
            />
          </div>
        </Section>
      </div>

      {/* ═══════════════ SAĞ — ÖZET + CTA + YARDIM ═══════════════ */}
      <aside className="min-w-0 space-y-3.5 md:space-y-4 lg:sticky lg:top-28">
        {/* TEKLİF ÖZETİ — yalnız MEVCUT state'ten (yeni veri YOK) */}
        <div
          className="rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_1px_3px_rgba(10,22,51,0.05)] overflow-hidden"
          data-testid="offer-summary"
        >
          <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-[#EEF1F5]">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#1B4EF5]">
              {dict.summaryTitle}
            </p>
          </div>
          <dl className="px-4 sm:px-5 py-2">
            {summaryRows.map((r) => (
              <div
                key={r.key}
                className="flex items-start justify-between gap-4 py-2.5 border-b border-dashed border-[#E5E7EB] last:border-b-0"
              >
                <dt className="shrink-0 text-[12px] text-[#64708A]">{r.label}</dt>
                <dd className="min-w-0 text-right text-[13px] font-semibold text-[#0A1633] break-words">
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
          {!hasSummarySelection && (
            <p className="mx-4 sm:mx-5 mb-4 rounded-lg bg-[#F7F9FC] px-3 py-2.5 text-[12px] leading-relaxed text-[#64708A]">
              {dict.summaryEmpty}
            </p>
          )}

          {/* ERROR / CTA */}
          <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-1 space-y-3">
            {status.kind === "error" && (
              <div
                role="alert"
                className="
                  flex items-center gap-3
                  rounded-xl border border-red-200 bg-red-50
                  px-3.5 py-3 text-[13px] text-red-900
                "
              >
                <AlertCircle size={15} aria-hidden className="shrink-0" />
                <span>{status.message}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={!isReady || status.kind === "loading"}
              className="
                w-full h-[52px] inline-flex items-center justify-center gap-2
                rounded-xl bg-[#1B4EF5] text-white
                text-[14.5px] font-semibold tracking-[0.005em]
                transition-colors duration-200 motion-reduce:transition-none
                hover:bg-[#1640D6] active:bg-[#1236B8]
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4EF5]/40 focus-visible:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#1B4EF5]
              "
            >
              <Check size={16} strokeWidth={2.2} aria-hidden />
              {status.kind === "loading" ? dict.submitting : dict.submit}
            </button>
            <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[#64708A]">
              <Lock size={12} aria-hidden className="mt-[3px] shrink-0 text-[#94A0B8]" />
              <span>{dict.privacyNote}</span>
            </p>
          </div>
        </div>

        {/* YARDIM — settings'teki MEVCUT telefon / WhatsApp linkleri */}
        {(phoneHref || whatsappHref) && (
          <div className="rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_1px_3px_rgba(10,22,51,0.05)] p-4 sm:p-5">
            <p className="text-[14px] font-bold text-[#0A1633]">
              {dict.helpTitle}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {phoneHref && (
                <a
                  href={phoneHref}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#DDE3EC] bg-white text-[13px] font-semibold text-[#0A1633] transition-colors hover:bg-[#F4F7FF] hover:border-[#1B4EF5] hover:text-[#1B4EF5]"
                >
                  <Phone size={15} strokeWidth={2} aria-hidden className="text-[#1B4EF5]" />
                  {dict.phoneLabel}
                </a>
              )}
              {whatsappHref && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={
                    "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#DDE3EC] bg-white text-[13px] font-semibold text-[#0A1633] transition-colors hover:bg-[#F0FAF5] hover:border-[#00A86B] hover:text-[#00A86B] " +
                    (phoneHref ? "" : "col-span-2")
                  }
                >
                  <MessageCircle size={15} strokeWidth={2} aria-hidden className="text-[#00A86B]" />
                  {dict.helpWhatsapp}
                </a>
              )}
            </div>
          </div>
        )}

        {/* GÜVEN — sayfanın MEVCUT güven satırları (trust1-3) */}
        <ul
          role="list"
          className="rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_1px_3px_rgba(10,22,51,0.05)] p-4 sm:p-5 space-y-3.5"
        >
          <TrustRow
            icon={<Clock size={15} aria-hidden strokeWidth={1.9} />}
            title={dict.trust1Title}
            description={dict.trust1Description}
          />
          <TrustRow
            icon={<BellRing size={15} aria-hidden strokeWidth={1.9} />}
            title={dict.trust2Title}
            description={dict.trust2Description}
          />
          <TrustRow
            icon={<Compass size={15} aria-hidden strokeWidth={1.9} />}
            title={dict.trust3Title}
            description={dict.trust3Description}
          />
        </ul>
      </aside>
    </form>
  );
}

/* ===============================================================
   SUB-COMPONENTS
   🎨 Yalnız görünüm (className/markup). Prop'lar, onChange/onClick
   bağları, min/max, rakam filtresi ve aria etiketleri AYNEN.
=============================================================== */

/* Ortak alan stilleri — 48px yükseklik, #DDE3EC border, 11px radius,
   13px metin, #1B4EF5 focus + hafif mavi ring, #9CA3AF placeholder. */
const LABEL_CLASS =
  "block text-[12px] font-semibold text-[#0A1633] mb-2";
const SUBLABEL_CLASS =
  "block text-[11.5px] font-medium text-[#64708A] mb-1.5";
const FIELD_CLASS =
  "w-full h-12 !rounded-[11px] !border !border-[#DDE3EC] !bg-white " +
  "text-[13px] !text-[#0A1633] placeholder:!text-[#9CA3AF] " +
  "focus:!outline-none focus:!border-[#1B4EF5] " +
  "focus:!shadow-[0_0_0_3px_rgba(27,78,245,0.12)] " +
  "transition-[border-color,box-shadow] duration-200";

function Section({
  step,
  icon,
  title,
  subtitle,
  children,
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_1px_3px_rgba(10,22,51,0.05)] p-4 sm:p-[18px] md:p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="shrink-0 w-9 h-9 rounded-lg bg-[#EFF4FF] text-[#1B4EF5] inline-flex items-center justify-center"
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display font-bold text-[16px] md:text-[17px] text-[#0A1633] leading-tight tracking-[-0.01em]">
              {title}
            </h2>
            <span
              aria-hidden
              className="ml-auto text-[10.5px] font-bold tabular-nums tracking-[0.12em] text-[#A3ACBD]"
            >
              {step}
            </span>
          </div>
          {subtitle && (
            <p className="text-[12.5px] text-[#64708A] mt-1 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 md:mt-5 space-y-4">{children}</div>
    </section>
  );
}

function TrustRow({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="shrink-0 w-8 h-8 rounded-lg bg-[#EFF4FF] text-[#1B4EF5] flex items-center justify-center"
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[#0A1633] leading-tight">
          {title}
        </p>
        <p className="text-[12px] text-[#64708A] mt-0.5 leading-snug">
          {description}
        </p>
      </div>
    </li>
  );
}

function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
  decreaseAriaLabel,
  increaseAriaLabel,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  /** `formatDictionaryString` şablonu — `{label}`. */
  decreaseAriaLabel: string;
  increaseAriaLabel: string;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const btn =
    "w-8 h-8 rounded-lg border border-[#DDE3EC] bg-white text-[#0A1633] " +
    "flex items-center justify-center transition-colors " +
    "hover:bg-[#F4F7FF] hover:border-[#1B4EF5] hover:text-[#1B4EF5] " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4EF5]/30 " +
    "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-[#DDE3EC] disabled:hover:text-[#0A1633]";
  return (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      <div
        className={
          "flex items-center justify-between h-12 rounded-[11px] border bg-white px-2 " +
          (value > min ? "border-[#1B4EF5]/50" : "border-[#DDE3EC]")
        }
      >
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          aria-label={formatDictionaryString(decreaseAriaLabel, { label })}
          className={btn}
        >
          <Minus size={14} strokeWidth={2} />
        </button>
        <span className="font-display font-bold text-[16px] text-[#0A1633] tabular-nums">
          {value}
        </span>
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          aria-label={formatDictionaryString(increaseAriaLabel, { label })}
          className={btn}
        >
          <Plus size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

function ChipMultiSelect({
  label,
  options,
  selected,
  onToggle,
  emptyLabel,
  locale,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onToggle: (id: string) => void;
  emptyLabel: string;
  /** 🛡️ Yalnız GÖRÜNEN etiketi etkiler; `o.id` (state) ve
   *  `tokenFromOption` (payload) DEĞİŞMEZ. */
  locale: Locale;
}) {
  return (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      {options.length === 0 ? (
        <p className="text-[12.5px] text-[#9CA3AF] italic">
          {emptyLabel}
        </p>
      ) : (
        <ul role="list" className="flex flex-wrap gap-2">
          {options.map((o) => {
            const active = selected.includes(o.id);
            /* Bölgelerde `name_by_locale` HİÇ gelmediği için sonuç
               canonical `o.name`'dir → TR/EN/DE'de AYNI (özel isim). */
            const displayName = resolveTaxonomyName(
              o.name,
              o.name_by_locale,
              locale
            );
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onToggle(o.id)}
                  aria-pressed={active}
                  className={
                    "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg " +
                    "text-[12.5px] font-medium " +
                    "border transition-colors duration-200 " +
                    "motion-reduce:transition-none " +
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4EF5]/30 " +
                    (active
                      ? "bg-[#EFF4FF] border-[#1B4EF5] text-[#1B4EF5] font-semibold"
                      : "bg-white border-[#DDE3EC] text-[#334155] hover:bg-[#F4F7FF] hover:border-[#C9D5F7]")
                  }
                >
                  {active && (
                    <Check size={13} aria-hidden strokeWidth={2.4} />
                  )}
                  {displayName}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BudgetField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className={SUBLABEL_CLASS}>{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          /* Sadece rakam kabul; diğer karakterler düşer. */
          const cleaned = e.target.value.replace(/[^0-9]/g, "");
          onChange(cleaned);
        }}
        placeholder="0"
        className={FIELD_CLASS + " px-3.5 tabular-nums"}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "email" | "tel";
  maxLength?: number;
}) {
  return (
    <div>
      <label className={LABEL_CLASS}>
        {label}
        {required && (
          <span aria-hidden className="text-[#1B4EF5] ml-1">
            *
          </span>
        )}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        className={FIELD_CLASS + " px-3.5"}
      />
    </div>
  );
}
