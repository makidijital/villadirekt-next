"use client";

/* ===============================================================
   🛡️ PHASE 12C — ADMIN SAYFA (pages) ÇEVİRİ KARTI
   ===============================================================
   `VillaTranslationsCard.tsx` (Phase 10A) ile BİREBİR AYNI desen ve
   AYNI tasarım dili (card-premium + EN/DE pill-tab + tek "sürümünü
   kaydet" butonu + Loader2 spinner). `TypeTranslationsPanel.tsx`
   (Phase 10D Batch 3) ile AYNI pill-tab mekaniği ve AYNI
   `multilingual_enabled` kapısı (kapı çağıran sayfada).

   ⚠️ BU KART ADMIN ARAYÜZÜNÜN DİLİNİ DEĞİŞTİRMEZ. Admin paneli
   Türkçe kalır; burada girilen değerler SAYFA İÇERİĞİNİN (CMS)
   EN/DE sürümleridir.

   KAPSAM (`page_translations` kolonlarıyla BİREBİR):
     title · excerpt · body · seo_title · seo_description (mig. 082)
     + sections (mig. 091)
   KAPSAM DIŞI:
     slug (URL — çevrilmez), cover_image, is_active, show_in_menu,
     noindex.

   🛡️ MIGRATION 091 — BÖLÜM (sections) ÇEVİRİSİ:
     Bölüm YAPISI (sıra · tip · `image.path`) TR canonical'dan gelir ve
     BURADAN DEĞİŞTİRİLEMEZ; yalnız KULLANICIYA GÖRÜNEN metin alanları
     (richtext.content · image.alt · quote.text · quote.author) dile
     göre doldurulur. Böylece çeviri her zaman canonical ile AYNI JSON
     yapısını taşır ve yapı sapması (drift) YAPISAL OLARAK imkânsızdır.
     `pages/new` içindeki canonical bölüm editörüne DOKUNULMADI ve
     yeni bir bölüm editörü OLUŞTURULMADI — burada yalnız metin alanı
     vardır (bölüm ekleme/silme/sıralama YOK).
     Tüm alanlar boş bırakılırsa çeviri `null` yazılır → public tarafta
     canonical TR bölümleri gösterilir.

   TR bu karttan DÜZENLENEMEZ — yalnız referans olarak gösterilir.
   Boş bırakılan alanlar public tarafta TR içeriğe fallback eder.
   Kendi state'i / kendi save mekanizması vardır — ana "Kaydet"
   akışına (`handleSubmit`) KARIŞMAZ.
   =============================================================== */

import { useEffect, useMemo, useState } from "react";
import { Languages, Loader2 } from "lucide-react";

import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import {
  loadPageTranslationsAction,
  savePageTranslationAction,
} from "./page-translations.action";
/* 🛡️ CMS sayfa BAŞLIĞININ çevirisi artık public navigation'da da
   okunuyor (Header menüsü + Footer "Kurumsal"). Bu yüzden çeviri
   kaydı, TR başlık değiştirildiğinde `pages/[id]/page.tsx`'in
   çağırdığı AYNI invalidation'ı (`revalidateMenu`, tag "menu")
   çağırır. Yeni bir cache/invalidation mekanizması İCAT EDİLMEDİ;
   `TypeTranslationsPanel.tsx` (Phase 10D) ile AYNI desen. */
import { revalidateMenu } from "@/app/services/revalidate.actions";
/* 🛡️ MIGRATION 091 — canonical bölüm yapısı için TEK parser (REUSE). */
import { parsePageSections, type PageSection } from "@/lib/page-sections";

type WritableLocale = "en" | "de";

type LocaleFormState = {
  title: string;
  excerpt: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
};

const EMPTY_FORM: LocaleFormState = {
  title: "",
  excerpt: "",
  body: "",
  seoTitle: "",
  seoDescription: "",
};

/* ===============================================================
   🛡️ MIGRATION 091 — BÖLÜM ÇEVİRİSİ FORM MODELİ
   ===============================================================
   Canonical bölüm dizisiyle POZİSYON BAZLI hizalı, yalnız metin
   alanlarından oluşan düz bir model. `type` ve `image.path` burada
   TUTULMAZ — kaydederken canonical'dan alınır (yapı sapması imkânsız).
   =============================================================== */
type SectionDraft = {
  /** richtext.content · quote.text · image.alt için ortak birincil alan. */
  primary: string;
  /** yalnız quote.author (diğer tiplerde kullanılmaz). */
  secondary: string;
};

const EMPTY_DRAFT: SectionDraft = { primary: "", secondary: "" };

/** Canonical bir bölümün çevrilebilir metinleri (referans gösterimi). */
function canonicalTexts(s: PageSection): SectionDraft {
  if (s.type === "richtext") return { primary: s.content, secondary: "" };
  if (s.type === "quote") {
    return { primary: s.text, secondary: s.author ?? "" };
  }
  return { primary: s.alt ?? "", secondary: "" };
}

const SECTION_TYPE_LABELS: Record<PageSection["type"], string> = {
  richtext: "Zengin metin",
  image: "Görsel",
  quote: "Alıntı",
};

const SECTION_PRIMARY_LABELS: Record<PageSection["type"], string> = {
  richtext: "Metin",
  image: "Görsel alt metni (alt)",
  quote: "Alıntı metni",
};

/**
 * Kayıtlı çeviri dizisini canonical yapıya POZİSYON + TİP eşleşmesiyle
 * hizalar. Uzunluk/tip uyuşmazsa o bölüm boş taslak olur → kaydederken
 * canonical metne düşer. (Canonical yapı sonradan değişmiş olabilir.)
 */
function draftsFromSaved(
  canonical: PageSection[],
  savedRaw: unknown
): SectionDraft[] {
  const saved = parsePageSections(savedRaw);
  return canonical.map((c, i) => {
    const s = saved[i];
    if (!s || s.type !== c.type) return EMPTY_DRAFT;
    return canonicalTexts(s);
  });
}

/**
 * Taslakları canonical yapıya geri yazar.
 *   • `type` ve `image.path` CANONICAL'dan alınır (asla formdan).
 *   • Boş bırakılan alan canonical metne düşer → geçerli bölüm üretilir.
 *   • HİÇBİR alana dokunulmamışsa `null` döner → servis kolonu NULL
 *     yazar ve public taraf canonical TR bölümlerini gösterir.
 */
function buildTranslatedSections(
  canonical: PageSection[],
  drafts: SectionDraft[]
): PageSection[] | null {
  if (canonical.length === 0) return null;
  const touched = drafts.some(
    (d) => d.primary.trim().length > 0 || d.secondary.trim().length > 0
  );
  if (!touched) return null;

  return canonical.map((c, i) => {
    const d = drafts[i] ?? EMPTY_DRAFT;
    const primary = d.primary.trim();
    const secondary = d.secondary.trim();
    if (c.type === "richtext") {
      return { type: "richtext", content: primary || c.content };
    }
    if (c.type === "quote") {
      return {
        type: "quote",
        text: primary || c.text,
        author: secondary || c.author,
      };
    }
    /* image: `path` ASLA çevrilmez — canonical asset yolu korunur. */
    return { type: "image", path: c.path, alt: primary || c.alt };
  });
}

const LOCALE_LABELS: Record<WritableLocale, string> = {
  en: "English",
  de: "Deutsch",
};

type Props = {
  pageId: string;
  /** TR referans metni — bu karttan DÜZENLENEMEZ, yalnız gösterilir. */
  pageTitle?: string | null;
  /** 🛡️ MIGRATION 091 — canonical `pages.sections` (ham JSONB).
   *  YAPININ kaynağıdır; buradan DEĞİŞTİRİLEMEZ. */
  canonicalSections?: unknown;
};

export default function PageTranslationsCard({
  pageId,
  pageTitle,
  canonicalSections,
}: Props) {
  const toast = useNotify();

  const [forms, setForms] = useState<Record<WritableLocale, LocaleFormState>>({
    en: EMPTY_FORM,
    de: EMPTY_FORM,
  });
  /* 🛡️ MIGRATION 091 — canonical yapı (yalnız OKUNUR) + locale başına
     metin taslakları. `useMemo` ile prop değişmedikçe yeniden
     parse edilmez. */
  const canonical = useMemo(
    () => parsePageSections(canonicalSections),
    [canonicalSections]
  );
  const [sectionDrafts, setSectionDrafts] = useState<
    Record<WritableLocale, SectionDraft[]>
  >({ en: [], de: [] });
  const [activeLocale, setActiveLocale] = useState<WritableLocale>("en");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const result = await loadPageTranslationsAction(pageId);
      if (cancelled) return;

      if (!result.ok) {
        toast.error("Çeviriler yüklenemedi", {
          id: `page-translations-load-${pageId}`,
          description: result.error,
        });
        setLoading(false);
        return;
      }

      setForms((prev) => {
        const next = { ...prev };
        for (const row of result.rows) {
          if (row.locale !== "en" && row.locale !== "de") continue;
          next[row.locale] = {
            title: row.title ?? "",
            excerpt: row.excerpt ?? "",
            body: row.body ?? "",
            seoTitle: row.seo_title ?? "",
            seoDescription: row.seo_description ?? "",
          };
        }
        return next;
      });
      /* 🛡️ MIGRATION 091 — kayıtlı bölüm çevirisini canonical yapıya
         hizala; kaydı olmayan locale boş taslakla başlar. */
      setSectionDrafts(() => {
        const empty = canonical.map(() => EMPTY_DRAFT);
        const next: Record<WritableLocale, SectionDraft[]> = {
          en: empty,
          de: empty,
        };
        for (const row of result.rows) {
          if (row.locale !== "en" && row.locale !== "de") continue;
          next[row.locale] = draftsFromSaved(canonical, row.sections);
        }
        return next;
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    /* 🛡️ MIGRATION 091 — `canonical` bağımlılığa EKLENDİ: kayıtlı bölüm
       çevirisi canonical YAPIYA hizalanarak okunduğu için doğru
       bağımlılık budur. Pratikte ek yükleme YAPMAZ — kart yalnız sayfa
       verisi geldikten sonra mount edilir (`!loading && ... ? <Card/>`)
       ve `canonicalSections` bir `useState` değeri olduğundan kimliği
       sabittir. Mevcut `pageId` davranışı DEĞİŞMEDİ. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, canonical]);

  function setField(field: keyof LocaleFormState, value: string) {
    setForms((prev) => ({
      ...prev,
      [activeLocale]: { ...prev[activeLocale], [field]: value },
    }));
  }

  /* 🛡️ MIGRATION 091 — yalnız METİN alanı güncellenir; tip/sıra/path
     form state'inde HİÇ tutulmaz. */
  function setSectionField(
    index: number,
    key: keyof SectionDraft,
    value: string
  ) {
    setSectionDrafts((prev) => {
      const list = prev[activeLocale];
      const base =
        list.length === canonical.length
          ? list
          : canonical.map((_, i) => list[i] ?? EMPTY_DRAFT);
      const next = base.map((d, i) =>
        i === index ? { ...d, [key]: value } : d
      );
      return { ...prev, [activeLocale]: next };
    });
  }

  async function handleSave() {
    const current = forms[activeLocale];

    setSaving(true);
    try {
      const result = await savePageTranslationAction({
        pageId,
        locale: activeLocale,
        title: current.title,
        excerpt: current.excerpt,
        body: current.body,
        seoTitle: current.seoTitle,
        seoDescription: current.seoDescription,
        /* 🛡️ MIGRATION 091 — yapı canonical'dan, metinler formdan.
           Hiçbir alan doldurulmamışsa `null` → canonical TR fallback. */
        sections: buildTranslatedSections(
          canonical,
          sectionDrafts[activeLocale]
        ),
      });

      if (!result.ok) {
        toast.error("Kaydedilemedi", {
          id: `page-translations-save-${pageId}`,
          description: result.error,
        });
        return;
      }

      /* Sunucunun normalize ettiği (trim + boş → null) değerlerle
         senkronla — VillaTranslationsCard'daki toast davranışına ek
         olarak TypeTranslationsPanel'in `setForms(result.row…)`
         senkronizasyonu uygulanır. */
      setForms((prev) => ({
        ...prev,
        [activeLocale]: {
          title: result.row.title ?? "",
          excerpt: result.row.excerpt ?? "",
          body: result.row.body ?? "",
          seoTitle: result.row.seo_title ?? "",
          seoDescription: result.row.seo_description ?? "",
        },
      }));
      /* Sunucunun sanitize ettiği bölümlerle senkronla (diğer alanlarla
         AYNI desen) — boşsa taslaklar boş kalır. */
      setSectionDrafts((prev) => ({
        ...prev,
        [activeLocale]: draftsFromSaved(canonical, result.row.sections),
      }));

      toast.success(`${LOCALE_LABELS[activeLocale]} çevirisi kaydedildi`, {
        id: `page-translations-save-${pageId}`,
      });

      /* Non-blocking — kayıt başarısı bu çağrıya BAĞLI DEĞİL. */
      revalidateMenu().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  const form = forms[activeLocale];

  return (
    <section className="card-premium p-6 md:p-7 space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-stone-100)] text-[var(--color-stone-700)]">
          <Languages className="h-5 w-5" />
        </span>
        <div>
          <p className="eyebrow">Çok Dilli İçerik</p>
          <h2 className="text-lg font-semibold text-[var(--color-stone-900)]">
            Çeviriler (EN / DE)
          </h2>
          <p className="mt-1 text-sm text-[var(--color-stone-500)]">
            Bu alanlar yalnızca İngilizce ve Almanca sürümler içindir. Türkçe
            içerik buradan düzenlenemez; boş bırakılan alanlar public tarafta
            Türkçe içeriğe geri döner. Slug çevrilmez. Bölümlerin
            (sections) yapısı Türkçe içerikten gelir; burada yalnız
            metinleri çevirirsiniz.
          </p>
        </div>
      </header>

      {pageTitle ? (
        <div>
          <p className="text-[11px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-400)]">
            Türkçe (referans, salt okunur)
          </p>
          <p className="text-sm text-[var(--color-stone-600)] mt-1">
            {pageTitle}
          </p>
        </div>
      ) : null}

      <div className="flex gap-2">
        {(Object.keys(LOCALE_LABELS) as WritableLocale[]).map((locale) => (
          <button
            key={locale}
            type="button"
            onClick={() => setActiveLocale(locale)}
            className={
              activeLocale === locale
                ? "rounded-full bg-[var(--color-stone-900)] px-4 py-1.5 text-sm font-semibold text-white"
                : "rounded-full bg-[var(--color-stone-100)] px-4 py-1.5 text-sm font-semibold text-[var(--color-stone-600)]"
            }
          >
            {LOCALE_LABELS[locale]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-stone-500)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Yükleniyor…
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                Başlık
              </label>
              <input
                aria-label={`${LOCALE_LABELS[activeLocale]} başlık`}
                className="input"
                maxLength={200}
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                SEO Başlık
              </label>
              <input
                aria-label={`${LOCALE_LABELS[activeLocale]} SEO başlık`}
                className="input"
                maxLength={120}
                value={form.seoTitle}
                onChange={(e) => setField("seoTitle", e.target.value)}
              />
              <p className="mt-1 text-xs text-[var(--color-stone-400)]">
                Önerilen: 60 karakter
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                Kısa açıklama (excerpt)
              </label>
              <textarea
                aria-label={`${LOCALE_LABELS[activeLocale]} kısa açıklama`}
                className="input !rounded-2xl !p-4 min-h-[90px] resize-none"
                maxLength={300}
                value={form.excerpt}
                onChange={(e) => setField("excerpt", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                SEO Açıklama
              </label>
              <textarea
                aria-label={`${LOCALE_LABELS[activeLocale]} SEO açıklama`}
                className="input !rounded-2xl !p-4 min-h-[90px] resize-none"
                maxLength={300}
                value={form.seoDescription}
                onChange={(e) => setField("seoDescription", e.target.value)}
              />
              <p className="mt-1 text-xs text-[var(--color-stone-400)]">
                Önerilen: 160 karakter
              </p>
            </div>
          </div>

          <div>
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              İçerik
            </label>
            <textarea
              aria-label={`${LOCALE_LABELS[activeLocale]} içerik`}
              className="input !rounded-2xl !p-4 min-h-[160px] resize-none leading-relaxed"
              maxLength={20000}
              value={form.body}
              onChange={(e) => setField("body", e.target.value)}
            />
          </div>

          {/* ===========================================================
              🛡️ MIGRATION 091 — BÖLÜMLER (sections)
              ===========================================================
              Yapı (sıra · tip · görsel yolu) TR canonical'dan gelir ve
              salt-okunurdur; yalnız metin alanları doldurulur. Bölüm
              ekleme/silme/sıralama YOKTUR — canonical editör
              `pages/new` akışında kalır. */}
          {canonical.length > 0 && (
            <div className="space-y-4">
              <div>
                <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                  Bölümler (sections)
                </label>
                <p className="mt-1 text-xs text-[var(--color-stone-400)]">
                  Sıra, tip ve görsel yolu Türkçe içerikten gelir ve
                  değiştirilemez. Boş bıraktığınız her alan public
                  tarafta Türkçe metne geri döner.
                </p>
              </div>

              {canonical.map((section, idx) => {
                const draft =
                  sectionDrafts[activeLocale][idx] ?? EMPTY_DRAFT;
                const reference = canonicalTexts(section);
                const multiline = section.type !== "image";
                return (
                  <div
                    key={idx}
                    className="rounded-2xl border border-[var(--color-stone-100)] p-4 space-y-3"
                  >
                    <p className="text-[11px] tracking-[0.12em] uppercase font-semibold text-[var(--color-stone-400)]">
                      #{idx + 1} · {SECTION_TYPE_LABELS[section.type]}
                      {section.type === "image" ? ` · ${section.path}` : ""}
                    </p>

                    {reference.primary ? (
                      <p className="text-xs text-[var(--color-stone-500)] whitespace-pre-line line-clamp-3">
                        TR: {reference.primary}
                      </p>
                    ) : null}

                    <div>
                      <label className="text-[11px] font-medium text-[var(--color-stone-500)] block">
                        {SECTION_PRIMARY_LABELS[section.type]}
                      </label>
                      {multiline ? (
                        <textarea
                          aria-label={`${LOCALE_LABELS[activeLocale]} bölüm ${idx + 1} metni`}
                          className="input !rounded-2xl !p-4 min-h-[110px] resize-none leading-relaxed"
                          maxLength={20000}
                          value={draft.primary}
                          onChange={(e) =>
                            setSectionField(idx, "primary", e.target.value)
                          }
                        />
                      ) : (
                        <input
                          aria-label={`${LOCALE_LABELS[activeLocale]} bölüm ${idx + 1} görsel alt metni`}
                          className="input !rounded-2xl"
                          maxLength={300}
                          value={draft.primary}
                          onChange={(e) =>
                            setSectionField(idx, "primary", e.target.value)
                          }
                        />
                      )}
                    </div>

                    {section.type === "quote" ? (
                      <div>
                        <label className="text-[11px] font-medium text-[var(--color-stone-500)] block">
                          Yazar
                        </label>
                        <input
                          aria-label={`${LOCALE_LABELS[activeLocale]} bölüm ${idx + 1} yazar`}
                          className="input !rounded-2xl"
                          maxLength={200}
                          value={draft.secondary}
                          onChange={(e) =>
                            setSectionField(idx, "secondary", e.target.value)
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary disabled:opacity-60"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Kaydediliyor…
              </span>
            ) : (
              `${LOCALE_LABELS[activeLocale]} sürümünü kaydet`
            )}
          </button>
        </div>
      )}
    </section>
  );
}
