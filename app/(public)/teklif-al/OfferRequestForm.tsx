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
  Sparkles,
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
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
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
}: {
  locale?: Locale;
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

  /* ─────── SUCCESS STATE (full-replace) ─────── */
  if (status.kind === "success") {
    return (
      <div
        role="status"
        className="
          rounded-3xl bg-white border border-[var(--color-stone-100)]
          shadow-[0_12px_28px_-18px_rgba(27,26,23,0.10)]
          px-6 py-14 md:px-12 md:py-20 text-center
        "
      >
        <div
          className="
            w-14 h-14 rounded-full mx-auto
            bg-[var(--brand-coral-tint)]
            flex items-center justify-center
            text-[var(--brand-coral)]
          "
          aria-hidden
        >
          <Sparkles size={20} strokeWidth={1.6} />
        </div>
        <h2 className="font-display font-medium text-[24px] md:text-[28px] text-[var(--color-stone-900)] tracking-[-0.015em] mt-5">
          {dict.successTitle}
        </h2>
        <p className="text-[14.5px] text-[var(--color-stone-500)] mt-3 max-w-md mx-auto leading-relaxed">
          {dict.successBody}
        </p>
      </div>
    );
  }

  /* ─────── FORM ─────── */
  return (
    <form onSubmit={handleSubmit} className="space-y-5 md:space-y-6" noValidate>
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

      {/* ─────── 1. TRAVEL GROUP ─────── */}
      <Section
        eyebrow="1"
        title={dict.step1Title}
        subtitle={dict.step1Subtitle}
      >
        <ul
          role="radiogroup"
          aria-label={dict.travelGroupAriaLabel}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4"
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
                    "w-full text-left rounded-2xl border p-4 md:p-5 " +
                    "transition-[transform,border-color,background-color,box-shadow] duration-300 " +
                    "motion-reduce:transition-none hover:-translate-y-[1px] " +
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/40 " +
                    (active
                      ? "bg-[var(--brand-coral-tint)] border-[var(--brand-coral)] shadow-[0_14px_28px_-14px_rgba(255,101,63,0.30)]"
                      : "bg-white border-[var(--color-stone-200)] hover:border-[var(--brand-coral)]/40")
                  }
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={
                        "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center " +
                        (active
                          ? "bg-white text-[var(--brand-coral)]"
                          : "bg-[var(--color-sand-50)] text-[var(--color-stone-700)]")
                      }
                      aria-hidden
                    >
                      {g.icon}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={
                          "text-[14.5px] font-medium leading-tight " +
                          (active
                            ? "text-[var(--brand-coral-ink)]"
                            : "text-[var(--color-stone-900)]")
                        }
                      >
                        {dict[g.labelKey]}
                      </p>
                      <p className="text-[12.5px] text-[var(--color-stone-500)] mt-1 leading-snug">
                        {dict[g.descriptionKey]}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* ─────── 2. DATES + PEOPLE ─────── */}
      <Section
        eyebrow="2"
        title={dict.step2Title}
        subtitle={dict.step2Subtitle}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)] mb-2">
              {dict.dateRangeLabel}
            </label>
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--color-stone-200)] bg-white px-3 py-2.5">
              <Calendar
                size={16}
                className="text-[var(--brand-coral)] shrink-0"
                strokeWidth={1.75}
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
                className="!bg-transparent !border-0 !shadow-none !p-0 !rounded-none w-full text-[14px] font-medium !text-[var(--color-stone-900)] placeholder:!text-[var(--color-stone-400)] cursor-pointer"
                portalId="teklif-datepicker-portal"
                popperClassName="!z-[60]"
                /* 🛡️ Mobil klavye baskılama — customInput içinde
                   inputMode="none". Diğer tüm prop'lar (selectsRange,
                   onChange, dateFormat, locale, minDate, placeholder,
                   className, portalId, popperClassName) AYNEN korunur. */
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

      {/* ─────── 3. PREFERENCES ─────── */}
      <Section
        eyebrow="3"
        title={dict.step3Title}
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
          <p className="text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)] mb-2">
            {dict.budgetLabel}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
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
            <div className="md:col-span-2">
              <label className="block text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)] mb-2">
                {dict.currencyLabel}
              </label>
              <select
                value={state.budgetCurrency}
                onChange={(e) => updateField("budgetCurrency", e.target.value)}
                className="
                  w-full !rounded-2xl !border !border-[var(--color-stone-200)] !bg-white
                  px-3 py-3 text-[14px] !text-[var(--color-stone-900)]
                  focus:!border-[var(--brand-coral)]
                  focus:!shadow-[0_0_0_3px_rgba(255,101,63,0.18)]
                "
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

      {/* ─────── 4. CONTACT ─────── */}
      <Section
        eyebrow="4"
        title={dict.step4Title}
        subtitle={dict.step4Subtitle}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <div>
          <label
            htmlFor="offer-note"
            className="block text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)] mb-2"
          >
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
              w-full !rounded-2xl !border !border-[var(--color-stone-200)] !bg-white
              px-4 py-3 text-[14.5px] !text-[var(--color-stone-700)]
              placeholder:!text-[var(--color-stone-400)] leading-relaxed
              focus:!border-[var(--brand-coral)]
              focus:!shadow-[0_0_0_3px_rgba(255,101,63,0.18)]
              transition-[border-color,box-shadow] duration-200
              resize-y min-h-[110px]
            "
          />
        </div>
      </Section>

      {/* ─────── ERROR / CTA ─────── */}
      {status.kind === "error" && (
        <div
          role="alert"
          className="
            flex items-center gap-3
            rounded-2xl border border-red-200 bg-red-50
            px-4 py-3 text-[13.5px] text-red-900
          "
        >
          <AlertCircle size={15} aria-hidden className="shrink-0" />
          <span>{status.message}</span>
        </div>
      )}

      <div className="rounded-3xl bg-white border border-[var(--color-stone-100)] shadow-[0_12px_28px_-18px_rgba(27,26,23,0.10)] p-6 md:p-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <p className="text-[12.5px] text-[var(--color-stone-500)] max-w-md">
          {dict.privacyNote}
        </p>
        <button
          type="submit"
          disabled={!isReady || status.kind === "loading"}
          className="btn-primary btn-glow"
        >
          <Check size={15} aria-hidden />
          {status.kind === "loading" ? dict.submitting : dict.submit}
        </button>
      </div>
    </form>
  );
}

/* ===============================================================
   SUB-COMPONENTS
=============================================================== */

function Section({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-white border border-[var(--color-stone-100)] shadow-[0_12px_28px_-18px_rgba(27,26,23,0.10)] p-6 md:p-8">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="
            shrink-0 w-7 h-7 rounded-full
            bg-[var(--brand-coral-tint)] text-[var(--brand-coral)]
            font-display text-[13px] font-medium tabular-nums
            inline-flex items-center justify-center
          "
        >
          {eyebrow}
        </span>
        <div className="min-w-0">
          <h2 className="font-display font-medium text-[18px] md:text-[20px] text-[var(--color-stone-900)] leading-tight tracking-[-0.015em]">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[13px] text-[var(--color-stone-500)] mt-1.5 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="mt-5 md:mt-6 space-y-4">{children}</div>
    </section>
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
  return (
    <div>
      <label className="block text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)] mb-2">
        {label}
      </label>
      <div className="flex items-center justify-between rounded-2xl border border-[var(--color-stone-200)] bg-white px-3 py-2">
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          aria-label={formatDictionaryString(decreaseAriaLabel, { label })}
          className="w-8 h-8 rounded-full bg-[var(--color-sand-50)] hover:bg-[var(--brand-coral-tint)] hover:text-[var(--brand-coral)] text-[var(--color-stone-700)] flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Minus size={14} strokeWidth={1.75} />
        </button>
        <span className="font-display text-[18px] text-[var(--color-stone-900)] tabular-nums">
          {value}
        </span>
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          aria-label={formatDictionaryString(increaseAriaLabel, { label })}
          className="w-8 h-8 rounded-full bg-[var(--color-sand-50)] hover:bg-[var(--brand-coral-tint)] hover:text-[var(--brand-coral)] text-[var(--color-stone-700)] flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={14} strokeWidth={1.75} />
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
      <label className="block text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)] mb-2">
        {label}
      </label>
      {options.length === 0 ? (
        <p className="text-[13px] text-[var(--color-stone-400)] italic">
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
                    "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full " +
                    "text-[12.5px] font-medium tracking-[0.01em] " +
                    "border transition-[transform,color,background-color,border-color] duration-200 " +
                    "motion-reduce:transition-none " +
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/40 " +
                    (active
                      ? "bg-[var(--brand-coral-tint)] border-[var(--brand-coral)] text-[var(--brand-coral-ink)]"
                      : "bg-white border-[var(--color-stone-200)] text-[var(--color-stone-700)] hover:border-[var(--brand-coral)]/40 hover:text-[var(--color-stone-900)]")
                  }
                >
                  {active && (
                    <Check size={12} aria-hidden strokeWidth={2} />
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
      <label className="block text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)] mb-2">
        {label}
      </label>
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
        className="
          w-full !rounded-2xl !border !border-[var(--color-stone-200)] !bg-white
          px-4 py-3 text-[14.5px] !text-[var(--color-stone-900)] tabular-nums
          placeholder:!text-[var(--color-stone-400)]
          focus:!border-[var(--brand-coral)]
          focus:!shadow-[0_0_0_3px_rgba(255,101,63,0.18)]
          transition-[border-color,box-shadow] duration-200
        "
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
      <label className="block text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)] mb-2">
        {label}
        {required && (
          <span aria-hidden className="text-[var(--brand-coral)] ml-1">
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
        className="
          w-full !rounded-2xl !border !border-[var(--color-stone-200)] !bg-white
          px-4 py-3 text-[14.5px] !text-[var(--color-stone-900)]
          placeholder:!text-[var(--color-stone-400)]
          focus:!border-[var(--brand-coral)]
          focus:!shadow-[0_0_0_3px_rgba(255,101,63,0.18)]
          transition-[border-color,box-shadow] duration-200
        "
      />
    </div>
  );
}
