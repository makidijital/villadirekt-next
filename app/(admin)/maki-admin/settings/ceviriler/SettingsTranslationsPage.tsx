"use client";

import { useCallback, useMemo, useState } from "react";

import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import {
  SETTINGS_TRANSLATABLE_FIELDS,
  type SettingsTranslatableField,
  type SettingsTranslationLocale,
  type SettingsTranslationsByLocale,
} from "@/lib/i18n/settings-translations.types";

import { saveSettingsTranslation } from "./settings-translations.action";
import {
  TranslationLanguageTabs,
  TranslationSection,
  TranslationField,
  TranslationInfo,
  type TranslationLocale,
  type TranslationSectionStatus,
} from "../_components/SettingsTranslationFields";
import { SaveButton } from "../_components/SettingsField";

/* ===============================================================
   🛡️ ADMIN > SETTINGS > ÇEVİRİLER — client island
   ===============================================================
   🛡️ PHASE 11 — KAYIT AKTİF (8 alan):
     footer_copyright · default_meta_title · default_meta_description ·
     hero_title · hero_subtitle · hero_badge_text ·
     hero_primary_cta_text · hero_secondary_cta_text · business_hours

   🛡️ PHASE 10M — "Bakım Modu" ve "İletişim · Adres" bölümleri
   KALDIRILDI. Bakım mesajı artık ÇEVRİLMEZ (çeviri kolonu migration
   084 ile DROP edildi); her dilde canonical settings değeri gösterilir.
   Adres ise HİÇBİR ZAMAN bir çeviri kolonu olmadı — yalnız salt-okunur
   bir vitrin kartıydı. HER İKİ CANONICAL SETTINGS ALANI DA KORUNDU.

   TR canonical değerler server component (`page.tsx`) tarafından
   okunup prop olarak verilir ve bu ekrandan DÜZENLENMEZ. EN ve DE
   birbirinden BAĞIMSIZ kaydedilir: aktif sekmenin 8 alanı tek bir
   `saveSettingsTranslation({ locale, … })` çağrısıyla yazılır.

   ⚠️ NEDEN TEK SAVE BUTONU (bölüm başına DEĞİL):
     `settings_translations` bir locale için TEK SATIR tutar ve upsert
     8 kolonun tamamını yazar. Bölüm başına ayrı kaydet olsaydı, bir
     bölümü kaydetmek diğer bölümlerin kolonlarını sessizce null'lardı.
     Bu yüzden aktif dilin TAM durumu her kayıtta birlikte gönderilir —
     mevcut settings alt sayfalarının "tek form + tek SaveButton"
     konvansiyonuyla da aynıdır.

   ⚠️ KAPSAM DIŞI: yalnız "Çalışma Saatleri" grubu salt okunur kalır
   (`TranslationField`'a `onChange` GEÇİLMEZ) — ilgili public EN/DE
   iletişim sayfası henüz yok.

   🛡️ PHASE 11 — "Ana Sayfa · Hero" grubu ARTIK KAYDEDİLEBİLİR
   (migration 085). CTA href'leri ve hero görseli DİL BAĞIMSIZ
   olduğu için bu ekranda YOKTUR.

   ⚠️ Mevcut settings save akışı (`/api/admin/settings` PUT) ve 7
   settings alt sayfası DEĞİŞTİRİLMEDİ; çeviri payload'ı o akışa
   HİÇ GİRMEZ.
   =============================================================== */

/** `page.tsx`'in server-side okuduğu TR canonical değerler. */
export type SettingsTranslationCanonical = {
  footer_copyright: string;
  default_meta_title: string;
  default_meta_description: string;
  hero_badge_text: string;
  hero_title: string;
  hero_subtitle: string;
  hero_primary_cta_text: string;
  hero_secondary_cta_text: string;
  business_hours: string;
};

type DraftValues = Record<SettingsTranslatableField, string>;
type Drafts = Record<SettingsTranslationLocale, DraftValues>;

function emptyDraft(): DraftValues {
  return {
    footer_copyright: "",
    default_meta_title: "",
    default_meta_description: "",
    hero_title: "",
    hero_subtitle: "",
    hero_badge_text: "",
    hero_primary_cta_text: "",
    hero_secondary_cta_text: "",
    business_hours: "",
  };
}

function draftsFrom(translations: SettingsTranslationsByLocale): Drafts {
  const build = (locale: SettingsTranslationLocale): DraftValues => {
    const stored = translations[locale];
    const next = emptyDraft();
    if (!stored) return next;
    for (const field of SETTINGS_TRANSLATABLE_FIELDS) {
      next[field] = stored[field] ?? "";
    }
    return next;
  };
  return { en: build("en"), de: build("de") };
}

export default function SettingsTranslationsPage({
  canonical,
  initialTranslations,
}: {
  canonical: SettingsTranslationCanonical;
  /** Server-side okunan mevcut EN/DE çevirileri (migration 083). */
  initialTranslations: SettingsTranslationsByLocale;
}) {
  const toast = useNotify();
  const [locale, setLocale] = useState<TranslationLocale>("tr");
  const [drafts, setDrafts] = useState<Drafts>(() =>
    draftsFrom(initialTranslations)
  );
  /** Gerçekten DB'ye yazılmış durum — durum rozetleri bunu okur
   *  (henüz kaydedilmemiş taslak "aktif" göstermesin). */
  const [stored, setStored] = useState<SettingsTranslationsByLocale>(
    initialTranslations
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isTr = locale === "tr";
  const writableLocale: SettingsTranslationLocale | null = isTr
    ? null
    : (locale as SettingsTranslationLocale);

  const setField = useCallback(
    (field: SettingsTranslatableField, next: string) => {
      if (isTr) return;
      const target = locale as SettingsTranslationLocale;
      setDrafts((prev) => ({
        ...prev,
        [target]: { ...prev[target], [field]: next },
      }));
      setSaved(false);
    },
    [isTr, locale]
  );

  /** Aktif dildeki taslak değer; TR'de alan zaten canonical gösterir. */
  const valueOf = (field: SettingsTranslatableField): string | undefined =>
    writableLocale ? drafts[writableLocale][field] : undefined;

  /** Aktif dilde düzenlenebilir alanlar için ortak prop paketi.
   *  TR'de `onChange` VERİLMEZ → alan salt okunur kalır. */
  const editableProps = (field: SettingsTranslatableField) =>
    writableLocale
      ? {
          value: valueOf(field),
          onChange: (next: string) => setField(field, next),
          saving,
        }
      : {};

  /** Bölüm durumu (§10): çevirisi VARSA "active", yoksa "review".
   *  Bu 8 alan için "planned" ASLA kullanılmaz — public tarafta
   *  bugün gerçekten render ediliyorlar. */
  const statusOf = useMemo(
    () =>
      (fields: readonly SettingsTranslatableField[]): TranslationSectionStatus => {
        const filledIn = (loc: SettingsTranslationLocale) =>
          fields.some((f) => (stored[loc]?.[f] ?? "").trim() !== "");
        if (isTr) return filledIn("en") || filledIn("de") ? "active" : "review";
        return filledIn(locale as SettingsTranslationLocale)
          ? "active"
          : "review";
      },
    [stored, isTr, locale]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!writableLocale) return;

    const target = writableLocale;
    const current = drafts[target];

    setSaving(true);
    setSaved(false);

    const result = await saveSettingsTranslation({
      locale: target,
      footer_copyright: current.footer_copyright,
      default_meta_title: current.default_meta_title,
      default_meta_description: current.default_meta_description,
      hero_title: current.hero_title,
      hero_subtitle: current.hero_subtitle,
      hero_badge_text: current.hero_badge_text,
      hero_primary_cta_text: current.hero_primary_cta_text,
      hero_secondary_cta_text: current.hero_secondary_cta_text,
      business_hours: current.business_hours,
    }).catch(() => ({ ok: false as const, error: "Çeviri kaydedilemedi" }));

    setSaving(false);

    if (!result.ok) {
      toast.error(result.error || "Kaydedilemedi", {
        id: "settings-translations",
      });
      return;
    }

    /* Servisin NORMALİZE ETTİĞİ değerlerle senkronla (trim + boş→null),
       böylece ekran DB'deki gerçek durumu gösterir. */
    setStored((prev) => ({ ...prev, [target]: result.values }));
    setDrafts((prev) => ({
      ...prev,
      [target]: {
        footer_copyright: result.values.footer_copyright ?? "",
        default_meta_title: result.values.default_meta_title ?? "",
        default_meta_description: result.values.default_meta_description ?? "",
        hero_title: result.values.hero_title ?? "",
        hero_subtitle: result.values.hero_subtitle ?? "",
        hero_badge_text: result.values.hero_badge_text ?? "",
        hero_primary_cta_text: result.values.hero_primary_cta_text ?? "",
        hero_secondary_cta_text: result.values.hero_secondary_cta_text ?? "",
        business_hours: result.values.business_hours ?? "",
      },
    }));
    setSaved(true);
    toast.success("Kaydedildi", { id: "settings-translations" });
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      {/* ── SAYFA BAŞLIĞI — diğer settings sayfalarıyla aynı desen ── */}
      <div>
        <p className="eyebrow">Ayarlar</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Çeviriler
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          Site genelinde kullanılan yönetilebilir metinlerin dil bazlı
          içeriklerini buradan yönetin.
        </p>
      </div>

      {/* ── DURUM BİLGİSİ ── */}
      <TranslationInfo
        title="Çeviriler nasıl çalışır"
        body="Türkçe değerler mevcut ayarlarınızdan salt okunur olarak gösterilir ve ilgili ayar sayfasından düzenlenir. English ve Deutsch içerikleri birbirinden bağımsız kaydedilir; bir alanı boş bırakırsanız o dilde Türkçe metin gösterilir."
      />

      {/* ── DİL SEKMELERİ ── */}
      <div className="space-y-2">
        <TranslationLanguageTabs active={locale} onChange={setLocale} />
        <p className="text-[12px] text-[var(--color-stone-500)] leading-relaxed">
          Türkçe canonical (kaynak) içeriktir ve bu ekrandan düzenlenmez;
          ilgili ayar sayfasından güncellenir. Çeviriler yalnız English ve
          Deutsch için tutulur.
        </p>
      </div>

      {/* ══════════ KAYDEDİLEBİLİR GRUPLAR (9 alan) ══════════ */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── 1) FOOTER ── */}
        <TranslationSection
          title="Footer"
          description="Sitenin altbilgisinde her sayfada görünen telif metni."
          status={statusOf(["footer_copyright"])}
          note="{year} ve {site_name} yer tutucuları çeviride de aynen korunmalıdır — render sırasında otomatik olarak yıl ve site adıyla değiştirilir."
        >
          <TranslationField
            label="Footer telif metni"
            locale={locale}
            canonicalValue={canonical.footer_copyright}
            placeholderHint="Örn: © {year} {site_name} · Tüm hakları saklıdır."
            {...editableProps("footer_copyright")}
          />
        </TranslationSection>

        {/* ── 2) SEO ── */}
        <TranslationSection
          title="SEO"
          description="Sayfa kendi SEO başlığını/açıklamasını belirtmediğinde kullanılan varsayılan meta değerleri."
          status={statusOf(["default_meta_title", "default_meta_description"])}
        >
          <TranslationField
            label="Varsayılan meta başlık"
            locale={locale}
            canonicalValue={canonical.default_meta_title}
            hint="Tarayıcı sekmesi ve arama sonucu başlığı."
            {...editableProps("default_meta_title")}
          />
          <TranslationField
            label="Varsayılan meta açıklama"
            locale={locale}
            canonicalValue={canonical.default_meta_description}
            hint="Arama sonuçlarındaki açıklama metni; 150–160 karakter önerilir."
            multiline
            rows={3}
            {...editableProps("default_meta_description")}
          />
        </TranslationSection>

        {/* ── 3) ANA SAYFA · HERO ── */}
        <TranslationSection
          title="Ana Sayfa · Hero"
          description="Ana sayfanın üst bölümündeki pazarlama metinleri."
          status={statusOf([
            "hero_title",
            "hero_subtitle",
            "hero_badge_text",
            "hero_primary_cta_text",
            "hero_secondary_cta_text",
          ])}
          note="Boş bırakılan alanlarda o dilde Türkçe canonical metin gösterilir. Buton bağlantıları (href) ve hero görseli DİL BAĞIMSIZDIR; çevrilmez."
        >
          <TranslationField
            label="Hero rozet metni"
            locale={locale}
            canonicalValue={canonical.hero_badge_text}
            {...editableProps("hero_badge_text")}
          />
          <TranslationField
            label="Hero başlığı"
            locale={locale}
            canonicalValue={canonical.hero_title}
            hint="Satır sonu karakterleri başlıkta olduğu gibi korunur."
            multiline
            rows={2}
            {...editableProps("hero_title")}
          />
          <TranslationField
            label="Hero alt başlık"
            locale={locale}
            canonicalValue={canonical.hero_subtitle}
            multiline
            rows={3}
            {...editableProps("hero_subtitle")}
          />
          <TranslationField
            label="Birincil buton metni"
            locale={locale}
            canonicalValue={canonical.hero_primary_cta_text}
            hint="Yalnız buton metni çevrilir; buton bağlantısı (href) canonical kalır."
            {...editableProps("hero_primary_cta_text")}
          />
          <TranslationField
            label="İkincil buton metni"
            locale={locale}
            canonicalValue={canonical.hero_secondary_cta_text}
            hint="Yalnız buton metni çevrilir; buton bağlantısı (href) canonical kalır."
            {...editableProps("hero_secondary_cta_text")}
          />
        </TranslationSection>

        {/* ── 4) İLETİŞİM · ÇALIŞMA SAATLERİ ──
            🛡️ MIGRATION 087 — `/iletisim` EN/DE sürümü devreye alındı;
            bu grup artık salt-okunur DEĞİL, kaydedilebilir. */}
        <TranslationSection
          title="İletişim · Çalışma Saatleri"
          description="İletişim sayfasında gösterilen çalışma saatleri metni."
          status={statusOf(["business_hours"])}
          note="Boş bırakılırsa o dilde Türkçe canonical metin gösterilir. Telefon, e-posta, adres ve sosyal medya bağlantıları VERİdir; her dilde aynı kalır ve çevrilmez."
        >
          <TranslationField
            label="Çalışma saatleri"
            locale={locale}
            canonicalValue={canonical.business_hours}
            multiline
            rows={3}
            {...editableProps("business_hours")}
          />
        </TranslationSection>

        {/* ── KAYDET — yalnız EN/DE sekmesinde ── */}
        {writableLocale && (
          <div className="flex items-center justify-end gap-4">
            <p className="text-[12px] text-[var(--color-stone-500)]">
              Yukarıdaki dört grup birlikte, yalnız seçili dil için kaydedilir.
            </p>
            <SaveButton loading={saving} saved={saved} />
          </div>
        )}
      </form>

      {/* ── KAPSAM DIŞI AÇIKLAMASI ── */}
      <TranslationInfo
        tone="muted"
        title="Bu ekranda görünmeyen ayarlar"
        body="Site adı, şirket unvanı, telefon, e-posta, WhatsApp, sosyal medya bağlantıları, logo/favicon/görseller, renk kodları, buton bağlantıları, izleme kodları, doğrulama token'ları, rezervasyon ve bakım anahtarları ile e-posta ayarları bilinçli olarak çeviri kapsamı dışındadır: bunlar canonical, teknik veya gizli değerlerdir ve her dilde aynı kalır."
      />
    </div>
  );
}
