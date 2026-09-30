"use client";

import { useEffect, useState } from "react";
import { Plus, X, HelpCircle, Loader2, Sparkles, Languages } from "lucide-react";

import {
  getFaqsForAdminAction as getFaqsForAdmin,
  replaceFaqsAction as replaceFaqs,
} from "./faqs.action";
import type { FaqInput } from "@/app/services/faq.service";
import {
  loadFaqTranslationsAction,
  saveFaqTranslationAction,
} from "./faq-translations.action";
import { revalidateFaqs } from "@/app/services/revalidate.actions";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";

/* ===============================================================
   🛡️ /maki-admin/faqs — Global FAQ admin page (Faz 25)
   ===============================================================
   Site geneli SSS yönetimi. Pattern: villa-form repeater UI feel
   ile uyumlu, ama tek sayfada tam liste (wizard step yok).

   SAVE FLOW (replace-all):
     replaceFaqs(items) → DELETE all + bulk INSERT
     Sonra revalidateFaqs() → "faqs" cache tag invalidate.
     Homepage FAQ section anlık güncellenir.

   UI HARDENING:
     - Max 15 satır (UI'da disable + service-side guard)
     - Boş satırlar service'te otomatik filtre (save → drop)
     - Textarea autosize (CSS resize-y; admin manuel uzatabilir)
     - Sticky save bar yok (bu sayfa tek section; standart action bar)

   DOKUNULMAYAN:
     - villa services, reservation flow, BookingSidebar, map,
       admin sidebar, layout, auth — sıfır coupling
   =============================================================== */

const MAX_FAQS = 15;

/* 🛡️ ÇOKLU DİL — EN/DE OPSİYONEL. Kaynak tablo `faq_translations`
   (migration 082, ZATEN VAR). TR alanları canonical `faqs` tablosunda
   kalır ve bu bloktan ETKİLENMEZ. */
type WritableLocale = "en" | "de";

const LOCALE_LABELS: Record<WritableLocale, string> = {
  en: "English",
  de: "Deutsch",
};

const LOCALE_FIELD_LABELS: Record<
  WritableLocale,
  { question: string; answer: string }
> = {
  en: { question: "Question", answer: "Answer" },
  de: { question: "Frage", answer: "Antwort" },
};

const EMPTY_TRANSLATIONS: Record<WritableLocale, FaqTranslationFields> = {
  en: { question: "", answer: "" },
  de: { question: "", answer: "" },
};

type FaqTranslationFields = { question: string; answer: string };

type FaqRow = {
  /** 🛡️ Mevcut kaydın id'si — SAVE sırasında geri gönderilir ki satır
   *  (ve çevirileri) KORUNSUN. Yeni satırlarda undefined. */
  id?: string;
  question: string;
  answer: string;
  translations: Record<WritableLocale, FaqTranslationFields>;
};

export default function FaqsAdminPage() {
  const toast = useNotify();
  const [items, setItems] = useState<FaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /* 🛡️ Aynı anda TEK satırın çeviri bloğu açık (accordion). Mevcut
     liste/save state'lerinden TAMAMEN AYRI. */
  const [openTranslationIdx, setOpenTranslationIdx] = useState<number | null>(
    null
  );

  /* Initial load */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getFaqsForAdmin();
      if (cancelled) return;

      /* 🛡️ Çeviriler TEK batch okumada gelir (kayıt başına sorgu YOK).
         Okuma fail olursa form ÇÖKMEZ: alanlar boş başlar. */
      let translationMap: Record<
        string,
        Partial<Record<WritableLocale, FaqTranslationFields>>
      > = {};
      if (data.length > 0) {
        const res = await loadFaqTranslationsAction(data.map((d) => d.id));
        if (cancelled) return;
        if (res.ok) translationMap = res.map;
      }

      /* Boş tabloda 1 placeholder row aç (admin doğrudan yazsın). */
      setItems(
        data.length > 0
          ? data.map((d) => ({
              id: d.id,
              question: d.question,
              answer: d.answer,
              translations: {
                en: {
                  question: translationMap[d.id]?.en?.question ?? "",
                  answer: translationMap[d.id]?.en?.answer ?? "",
                },
                de: {
                  question: translationMap[d.id]?.de?.question ?? "",
                  answer: translationMap[d.id]?.de?.answer ?? "",
                },
              },
            }))
          : [
              {
                question: "",
                answer: "",
                translations: { ...EMPTY_TRANSLATIONS },
              },
            ]
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateRow = (idx: number, key: "question" | "answer", value: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  };

  /* 🛡️ Çeviri alanı güncelleme — canonical TR alanlarına DOKUNMAZ. */
  const updateTranslation = (
    idx: number,
    locale: WritableLocale,
    key: "question" | "answer",
    value: string
  ) => {
    setItems((prev) => {
      const next = [...prev];
      const row = next[idx];
      next[idx] = {
        ...row,
        translations: {
          ...row.translations,
          [locale]: { ...row.translations[locale], [key]: value },
        },
      };
      return next;
    });
  };

  const removeRow = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setOpenTranslationIdx(null);
  };

  const addRow = () => {
    if (items.length >= MAX_FAQS) {
      toast.info(`En fazla ${MAX_FAQS} SSS ekleyebilirsin.`, {
        id: "faq-max",
      });
      return;
    }
    setItems((prev) => [
      ...prev,
      { question: "", answer: "", translations: { ...EMPTY_TRANSLATIONS } },
    ]);
  };

  const handleSave = async () => {
    setSaving(true);

    /* 🛡️ Servis boş satırları (soru VEYA cevap boş) FİLTRELER — eski
       davranış. Dönen `ids` bu FİLTRELENMİŞ listeyle aynı sıradadır,
       bu yüzden çeviri eşlemesi de aynı filtreyi uygular. */
    const kept = items.filter((i) => i.question.trim() && i.answer.trim());

    const payload: FaqInput[] = kept.map((i) => ({
      id: i.id,
      question: i.question,
      answer: i.answer,
    }));
    const result = await replaceFaqs(payload);
    if (!result.ok) {
      toast.error(result.error || "SSS kaydedilemedi.", { id: "faq-save" });
      setSaving(false);
      return;
    }

    /* 🛡️ ÇEVİRİLER — canonical kayıt BAŞARILI olduktan sonra, dönen
       id'lerle yazılır. Yalnız DEĞERİ OLAN (veya daha önce kaydedilmiş,
       şimdi temizlenen) diller için istek atılır. Best-effort: çeviri
       hatası canonical kaydı BOZMAZ. */
    const savedIds = result.ids || [];
    const nextItems = kept.map((row, idx) => ({
      ...row,
      id: savedIds[idx] || row.id,
    }));

    let translationFailed = false;
    for (let idx = 0; idx < nextItems.length; idx++) {
      const row = nextItems[idx];
      if (!row.id) continue;
      for (const locale of ["en", "de"] as WritableLocale[]) {
        const t = row.translations[locale];
        const originallyHadId = !!kept[idx].id;
        /* Yeni satırda boş çeviri için gereksiz istek atma. */
        if (!t.question.trim() && !t.answer.trim() && !originallyHadId) {
          continue;
        }
        const res = await saveFaqTranslationAction({
          faqId: row.id,
          locale,
          question: t.question,
          answer: t.answer,
        });
        if (!res.ok) translationFailed = true;
      }
    }

    /* Form state'ini kalıcı id'lerle senkronla (sonraki kayıtta satır
       ve çevirileri korunsun). */
    setItems(
      nextItems.length > 0
        ? nextItems
        : [{ question: "", answer: "", translations: { ...EMPTY_TRANSLATIONS } }]
    );

    /* Cache invalidate — homepage anlık günceller (üç locale, tek tag). */
    await revalidateFaqs();
    if (translationFailed) {
      toast.error("SSS kaydedildi, bazı çeviriler kaydedilemedi.", {
        id: "faq-save",
      });
    } else {
      toast.success("SSS güncellendi.", { id: "faq-save" });
    }
    setSaving(false);
  };

  const filledCount = items.filter(
    (i) => i.question.trim() && i.answer.trim()
  ).length;
  const atMax = items.length >= MAX_FAQS;

  return (
    <div className="space-y-8">
      {/* PAGE HEADER */}
      <header className="admin-page-header">
        <div>
          <p className="admin-page-eyebrow">İçerik</p>
          <h1 className="admin-page-header__title">Sık Sorulan Sorular</h1>
          <p className="admin-page-header__sub">
            Site geneli (villa-bağımsız) SSS yönetimi. Anasayfada accordion
            olarak render edilir; SEO için FAQPage structured data otomatik
            yayınlanır.
          </p>
        </div>
        <div className="admin-page-header__actions">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="admin-btn-primary"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </header>

      {/* CONTENT */}
      {loading ? (
        <div className="admin-card-flat p-12 text-center text-sm text-[var(--admin-muted)]">
          <Loader2 size={18} className="animate-spin inline-block mr-2" />
          Yükleniyor…
        </div>
      ) : (
        <>
          {/* META INFO BAR */}
          <div className="flex items-center justify-between text-[12px] text-[var(--admin-muted)] flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5">
              <HelpCircle size={13} />
              <span className="tabular-nums">{filledCount}</span> /{" "}
              <span className="tabular-nums">{items.length}</span> aktif soru
              <span className="text-[var(--admin-muted-2)] ml-1">
                (max {MAX_FAQS})
              </span>
            </span>
            <span className="text-[var(--admin-muted-2)]">
              Boş satırlar kaydedilmez.
            </span>
          </div>

          {/* REPEATER */}
          <div className="space-y-3">
            {items.map((row, idx) => (
              <div
                key={idx}
                className="
                  group rounded-2xl border border-[var(--admin-border)]
                  bg-white px-4 py-4 md:px-5 md:py-5
                  hover:border-[var(--admin-border-strong)]
                  transition-colors motion-reduce:transition-none
                "
              >
                <div className="flex items-start gap-3">
                  <span
                    className="
                      w-7 h-7 shrink-0 rounded-lg
                      bg-[var(--admin-bg-soft)]
                      border border-[var(--admin-border)]
                      flex items-center justify-center
                      text-[11px] font-semibold text-[var(--admin-muted)]
                      tabular-nums mt-0.5
                    "
                    aria-hidden
                  >
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="space-y-1.5">
                      <label className="block text-[10px] tracking-[0.16em] uppercase font-semibold text-[var(--admin-muted-2)]">
                        Soru
                      </label>
                      <input
                        type="text"
                        value={row.question}
                        onChange={(e) =>
                          updateRow(idx, "question", e.target.value)
                        }
                        placeholder="Örn: Rezervasyon nasıl yapılır?"
                        className="input w-full"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] tracking-[0.16em] uppercase font-semibold text-[var(--admin-muted-2)]">
                        Cevap
                      </label>
                      <textarea
                        value={row.answer}
                        onChange={(e) =>
                          updateRow(idx, "answer", e.target.value)
                        }
                        placeholder="Cevabı buraya yazın…"
                        className="input w-full !rounded-xl !p-3 min-h-[90px] resize-y leading-relaxed text-[13.5px]"
                        rows={3}
                      />
                    </div>

                    {/* 🛡️ ÇOKLU DİL — EN/DE (opsiyonel). Mevcut satır
                        tasarımı KORUNUR: varsayılan KAPALI, açılınca
                        aynı `input` sınıfları ve aynı label diliyle
                        render edilir. `MenuTranslationsPanel` /
                        `TypeTranslationsPanel` ile AYNI davranış
                        deseni (accordion + opsiyonel alanlar). */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenTranslationIdx((prev) =>
                            prev === idx ? null : idx
                          )
                        }
                        aria-expanded={openTranslationIdx === idx}
                        className={
                          "inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-lg transition-colors motion-reduce:transition-none " +
                          (openTranslationIdx === idx
                            ? "text-[var(--admin-text)] bg-[var(--admin-bg-soft)]"
                            : "text-[var(--admin-muted)] hover:text-[var(--admin-text)] hover:bg-[var(--admin-bg-soft)]")
                        }
                      >
                        <Languages size={12} />
                        Çeviriler
                      </button>

                      {openTranslationIdx === idx && (
                        <div className="mt-3 space-y-4 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-bg-soft)] p-3 md:p-4">
                          {(
                            Object.keys(LOCALE_LABELS) as WritableLocale[]
                          ).map((locale) => (
                            <div key={locale} className="space-y-3">
                              <p className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[var(--admin-muted)]">
                                {LOCALE_LABELS[locale]}
                              </p>
                              <div className="space-y-1.5">
                                <label className="block text-[10px] tracking-[0.16em] uppercase font-semibold text-[var(--admin-muted-2)]">
                                  {LOCALE_FIELD_LABELS[locale].question}
                                </label>
                                <input
                                  type="text"
                                  aria-label={`${LOCALE_LABELS[locale]} ${LOCALE_FIELD_LABELS[locale].question}`}
                                  value={row.translations[locale].question}
                                  onChange={(e) =>
                                    updateTranslation(
                                      idx,
                                      locale,
                                      "question",
                                      e.target.value
                                    )
                                  }
                                  className="input w-full"
                                  autoComplete="off"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="block text-[10px] tracking-[0.16em] uppercase font-semibold text-[var(--admin-muted-2)]">
                                  {LOCALE_FIELD_LABELS[locale].answer}
                                </label>
                                <textarea
                                  aria-label={`${LOCALE_LABELS[locale]} ${LOCALE_FIELD_LABELS[locale].answer}`}
                                  value={row.translations[locale].answer}
                                  onChange={(e) =>
                                    updateTranslation(
                                      idx,
                                      locale,
                                      "answer",
                                      e.target.value
                                    )
                                  }
                                  className="input w-full !rounded-xl !p-3 min-h-[80px] resize-y leading-relaxed text-[13.5px]"
                                  rows={3}
                                />
                              </div>
                            </div>
                          ))}
                          <p className="text-[11px] text-[var(--admin-muted-2)] leading-relaxed">
                            Boş bırakılan dilde Türkçe metin gösterilir.
                            Çeviriler &ldquo;Kaydet&rdquo; ile birlikte
                            kaydedilir.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="
                      w-9 h-9 shrink-0 flex items-center justify-center
                      rounded-lg text-[var(--admin-muted-2)]
                      hover:text-rose-500 hover:bg-rose-50
                      transition-colors motion-reduce:transition-none
                    "
                    aria-label={`Soru ${idx + 1}'i sil`}
                    title="Sil"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* ADD BUTTON */}
          <button
            type="button"
            onClick={addRow}
            disabled={atMax}
            className="
              w-full border border-dashed border-[var(--admin-border)]
              rounded-2xl py-3.5 text-sm
              text-[var(--admin-muted)]
              hover:bg-[var(--admin-bg-soft)]
              hover:border-[var(--admin-border-strong)]
              hover:text-[var(--admin-text)]
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors motion-reduce:transition-none
              inline-flex items-center justify-center gap-2
            "
          >
            <Plus size={14} />
            {atMax
              ? `Maksimum ${MAX_FAQS} SSS limiti doldu`
              : "Yeni Soru Ekle"}
          </button>

          {/* HINT */}
          <p className="text-[11.5px] text-[var(--admin-muted-2)] leading-relaxed max-w-2xl">
            SSS'ler anasayfada accordion olarak gösterilir. Aynı anda yalnız
            bir soru açık kalır. Boş bıraktığın satırlar kaydedilmez. Sıra
            burada üstten alta — kullanıcılar bu sırayla görür.
          </p>
        </>
      )}
    </div>
  );
}
