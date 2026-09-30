"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import AdminDateInput from "@/app/components/admin/shared/AdminDateInput";
import SitePopupCard from "@/app/components/layout/site-popup/SitePopupCard";
import { resolveAssetUrlVersioned } from "@/lib/storage.helpers";
import {
  POPUP_DISMISS_DURATIONS,
  POPUP_DISMISS_LABELS,
  POPUP_IMAGE_FOLDER,
  POPUP_IMAGE_SLUG,
  POPUP_LIMITS,
  POPUP_TRANSLATION_LOCALES,
  isSafePopupUrl,
  mergePopupText,
  type PopupDismissDuration,
  type PopupDisplayScope,
  type PopupTextFields,
  type PopupTranslationLocale,
} from "@/lib/site-popup";

import {
  FieldShell,
  SaveButton,
  SettingsSection,
  TextAreaField,
  TextField,
  ToggleField,
  UploadField,
} from "../_components/SettingsField";
import { loadSitePopupAction, saveSitePopupAction } from "./popup.action";

/* ===============================================================
   🛡️ /maki-admin/settings/popup — Açılış / Kampanya Popup yönetimi
   ===============================================================
   • Veri: `site_popup` (migration 095) — server action'lar
     (`requirePermission("settings")`). Mevcut /api/admin/settings
     akışına ve settings tablosuna DOKUNMAZ.
   • Görsel: mevcut settings `UploadField` (WebP dönüşümü → mevcut
     storage route → R2, site-assets/popup/popup.webp).
   • Canlı önizleme: public popup'ın AYNI bileşeni (SitePopupCard).
   =============================================================== */

type ScopeOption = { value: PopupDisplayScope; label: string; hint: string };
const SCOPES: ScopeOption[] = [
  { value: "home", label: "Yalnız ana sayfa", hint: "TR/EN/DE ana sayfalarında açılır." },
  { value: "all", label: "Tüm site", hint: "Ziyaretçinin girdiği ilk public sayfada açılır." },
];

/* 🌐 Çoklu dil (migration 096): TR canonical (site_popup), EN/DE ayrı
   tablo. Dil sekmesi yalnız dile bağlı alanları (vurgu, başlık,
   açıklama, alt bilgiler, buton metni/URL'i) değiştirir; görsel,
   aktif/pasif, buton göster/gizle, kapsam, tarih ve süre ORTAKTIR.
   Tüm dillerin taslağı aynı state'te tutulur → sekme değiştirmek
   içerik kaybettirmez; tek "Kaydet" hepsini yazar. */
type EditLocale = "tr" | PopupTranslationLocale;
type PopupTextState = {
  title: string;
  description: string;
  highlight: string;
  stats: string[];
  buttonText: string;
  buttonUrl: string;
};
const EDIT_LOCALES: ReadonlyArray<{ code: EditLocale; label: string }> = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
];
const emptyText = (): PopupTextState => ({
  title: "",
  description: "",
  highlight: "",
  stats: [],
  buttonText: "",
  buttonUrl: "",
});
const NON_TR_PLACEHOLDER = "Boş bırakılırsa Türkçe metin gösterilir";
const isUrlInvalid = (url: string) => url.trim().length > 0 && !isSafePopupUrl(url.trim());
/** Form metni → temiz alanlar (önizleme/kayıt). */
const toFields = (t: PopupTextState): PopupTextFields => ({
  title: t.title.trim() || null,
  description: t.description.trim() || null,
  highlight: t.highlight.trim() || null,
  stats: t.stats.map((x) => x.trim()).filter(Boolean),
  buttonText: t.buttonText.trim() || null,
  buttonUrl: t.buttonUrl.trim() || null,
});

export default function SettingsPopupPage() {
  const toast = useNotify();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isEnabled, setIsEnabled] = useState(false);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageBust, setImageBust] = useState<string | null>(null);
  const [texts, setTexts] = useState<Record<EditLocale, PopupTextState>>(() => ({
    tr: emptyText(),
    en: emptyText(),
    de: emptyText(),
  }));
  const [activeLocale, setActiveLocale] = useState<EditLocale>("tr");
  const [showButton, setShowButton] = useState(true);
  const [scope, setScope] = useState<PopupDisplayScope>("home");
  const [dismiss, setDismiss] = useState<PopupDismissDuration>("session");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  /* Seçili dilin alanları — aşağıdaki form alanları bunlara bağlı. */
  const { title, description, highlight, stats, buttonText, buttonUrl } = texts[activeLocale];
  function setText<K extends keyof PopupTextState>(key: K, value: PopupTextState[K]) {
    setTexts((prev) => ({ ...prev, [activeLocale]: { ...prev[activeLocale], [key]: value } }));
  }
  const setTitle = (v: string) => setText("title", v);
  const setDescription = (v: string) => setText("description", v);
  const setHighlight = (v: string) => setText("highlight", v);
  const setButtonText = (v: string) => setText("buttonText", v);
  const setButtonUrl = (v: string) => setText("buttonUrl", v);
  const setStats = (update: (prev: string[]) => string[]) =>
    setTexts((prev) => ({
      ...prev,
      [activeLocale]: { ...prev[activeLocale], stats: update(prev[activeLocale].stats) },
    }));
  const isTr = activeLocale === "tr";
  const activeLabel = EDIT_LOCALES.find((l) => l.code === activeLocale)?.label ?? "Türkçe";
  /* EN/DE'de boş alan için ipucu: Türkçe değer gösterilecek. */
  const trHint = (trValue: string) =>
    isTr ? undefined : trValue.trim() ? `Boşsa Türkçe gösterilir: “${trValue.trim()}”` : undefined;

  useEffect(() => {
    let cancelled = false;
    loadSitePopupAction()
      .then((v) => {
        if (cancelled) return;
        if (!v) {
          setLoadError(
            "Popup ayarları okunamadı. Migration 095 (site_popup) uygulanmış mı?"
          );
          return;
        }
        setIsEnabled(v.isEnabled);
        setImagePath(v.imagePath);
        setTexts({
          tr: {
            title: v.title,
            description: v.description,
            highlight: v.highlight,
            stats: v.stats,
            buttonText: v.buttonText,
            buttonUrl: v.buttonUrl,
          },
          en: v.translations?.en ?? emptyText(),
          de: v.translations?.de ?? emptyText(),
        });
        setShowButton(v.showButton);
        setScope(v.scope);
        setDismiss(v.dismiss);
        setStartDate(v.startDate);
        setEndDate(v.endDate);
        setUpdatedAt(v.updatedAt);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Bu bölüm için 'Ayarlar' yetkisi gerekiyor.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const urlInvalid = isUrlInvalid(buttonUrl);
  /* Kayıt: herhangi bir dilde geçersiz URL varsa engellenir. */
  const invalidUrlLocales = EDIT_LOCALES.filter((l) => isUrlInvalid(texts[l.code].buttonUrl));

  const previewImage = useMemo(
    () => resolveAssetUrlVersioned(imagePath, imageBust || updatedAt),
    [imagePath, imageBust, updatedAt]
  );
  /* Önizleme = public ile aynı kural: EN/DE boş alan → Türkçe. */
  const previewText = isTr
    ? toFields(texts.tr)
    : mergePopupText(toFields(texts.tr), toFields(texts[activeLocale]));
  const previewButton =
    showButton && previewText.buttonText
      ? { text: previewText.buttonText, url: previewText.buttonUrl || "/", external: false }
      : null;
  const hasPreviewContent = !!(
    previewImage ||
    previewText.title ||
    previewText.description ||
    previewText.highlight ||
    previewText.stats.length ||
    previewButton
  );

  function updateStat(i: number, value: string) {
    setStats((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (invalidUrlLocales.length > 0) {
      toast.error(
        `Buton URL'i geçersiz (${invalidUrlLocales.map((l) => l.label).join(", ")})`,
        { id: "settings-popup" }
      );
      return;
    }
    const tr = toFields(texts.tr);
    const translations = Object.fromEntries(
      POPUP_TRANSLATION_LOCALES.map((l) => {
        const t = texts[l];
        return [
          l,
          {
            title: t.title,
            description: t.description,
            highlight: t.highlight,
            stats: t.stats.map((x) => x.trim()).filter(Boolean),
            buttonText: t.buttonText,
            buttonUrl: t.buttonUrl,
          },
        ];
      })
    );
    setSaving(true);
    setSaved(false);
    let res: Awaited<ReturnType<typeof saveSitePopupAction>>;
    try {
      res = await saveSitePopupAction({
        isEnabled,
        imagePath,
        title: texts.tr.title,
        description: texts.tr.description,
        highlight: texts.tr.highlight,
        stats: tr.stats,
        buttonText: texts.tr.buttonText,
        buttonUrl: texts.tr.buttonUrl,
        showButton,
        scope,
        dismiss,
        startDate,
        endDate,
        translations,
      });
    } catch {
      res = { ok: false, error: "Kaydedilemedi" };
    }
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error || "Kaydedilemedi", { id: "settings-popup" });
      return;
    }
    setUpdatedAt(res.values.updatedAt);
    setImagePath(res.values.imagePath);
    const savedValues = res.values;
    setTexts((prev) => ({
      tr: { ...prev.tr, stats: savedValues.stats },
      en: { ...prev.en, stats: savedValues.translations.en.stats },
      de: { ...prev.de, stats: savedValues.translations.de.stats },
    }));
    setSaved(true);
    toast.success("Kaydedildi", { id: "settings-popup" });
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Ayarlar</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Açılış Popup
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          Siteye giren ziyaretçiye gösterilen kampanya/duyuru penceresi. Kapalıyken
          public sitede hiçbir şey yüklenmez.
        </p>
      </div>

      {loadError && (
        <div className="card-premium p-5 text-sm text-red-700 bg-red-50/60">{loadError}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6" aria-busy={loading || saving}>
        {/* DURUM */}
        <SettingsSection title="Durum" description="Popup'ı açıp kapatın.">
          <ToggleField
            label="Popup aktif"
            description="Kapalıyken popup hiçbir sayfada gösterilmez."
            checked={isEnabled}
            onChange={setIsEnabled}
            disabled={loading || !!loadError}
          />
        </SettingsSection>

        {/* DİL SEKMELERİ — dile bağlı alanlar (İçerik metinleri + Buton) */}
        <div className="space-y-2">
          <div
            role="tablist"
            aria-label="İçerik dili"
            className="inline-flex gap-1.5 rounded-2xl border border-[var(--color-stone-100)] bg-white p-1.5 shadow-sm w-max max-w-full overflow-x-auto"
          >
            {EDIT_LOCALES.map((loc) => {
              const active = loc.code === activeLocale;
              const t = texts[loc.code];
              const filled = !!(
                t.title.trim() ||
                t.description.trim() ||
                t.highlight.trim() ||
                t.stats.some((x) => x.trim()) ||
                t.buttonText.trim() ||
                t.buttonUrl.trim()
              );
              return (
                <button
                  key={loc.code}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveLocale(loc.code)}
                  className={
                    "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium whitespace-nowrap transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-300)] " +
                    (active
                      ? "bg-[var(--color-stone-900)] text-white"
                      : "text-[var(--color-stone-600)] hover:bg-[var(--color-sand-50)] hover:text-[var(--color-stone-900)]")
                  }
                >
                  {loc.label}
                  {loc.code !== "tr" && filled && (
                    <span
                      aria-hidden="true"
                      className={"w-1.5 h-1.5 rounded-full " + (active ? "bg-white/80" : "bg-emerald-500")}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[12px] text-[var(--color-stone-500)] leading-relaxed">
            Vurgu metni, başlık, açıklama, alt bilgiler ve buton metni/URL&apos;i her dil için ayrı
            girilir. English/Deutsch&apos;ta boş bırakılan alan Türkçe gösterilir. Görsel, durum,
            buton göster/gizle, gösterim alanı, tarih ve süre tüm dillerde ortaktır.
          </p>
        </div>

        {/* İÇERİK */}
        <SettingsSection
          title={`İçerik · ${activeLabel}`}
          description="Tüm metinler düz metin olarak gösterilir (HTML kabul edilmez)."
        >
          <UploadField
            label="Popup görseli"
            currentUrl={imagePath}
            onChange={(p) => {
              setImagePath(p);
              setImageBust(String(Date.now()));
            }}
            folder={POPUP_IMAGE_FOLDER}
            slug={POPUP_IMAGE_SLUG}
            version={updatedAt}
            disabled={loading || !!loadError}
            hint="Tüm dillerde ortak. Yatay, en az 1600px genişlikte görsel önerilir. WebP'ye çevrilip R2'ye yüklenir (site-assets/popup/popup.webp). Kaldırıp kaydederseniz dosya R2'den de silinir."
          />
          <TextField
            label="Büyük vurgu metni"
            value={highlight}
            onChange={(v) => setHighlight(v.slice(0, POPUP_LIMITS.highlight))}
            placeholder={isTr ? "20" : texts.tr.highlight.trim() || "20"}
            hint={
              trHint(texts.tr.highlight) ??
              "Görselin üzerinde büyük puntoyla gösterilir (örn. yıl sayısı). Boş bırakılabilir."
            }
            disabled={loading || !!loadError}
          />
          <TextField
            label="Başlık"
            value={title}
            onChange={(v) => setTitle(v.slice(0, POPUP_LIMITS.title))}
            placeholder={isTr ? "2006'dan bu yana tatilinizin yanındayız." : NON_TR_PLACEHOLDER}
            hint={trHint(texts.tr.title)}
            disabled={loading || !!loadError}
          />
          <TextAreaField
            label="Açıklama (opsiyonel)"
            value={description}
            onChange={(v) => setDescription(v.slice(0, POPUP_LIMITS.description))}
            placeholder={isTr ? undefined : NON_TR_PLACEHOLDER}
            hint={trHint(texts.tr.description)}
            rows={3}
            disabled={loading || !!loadError}
          />
          <FieldShell
            label="Alt bilgi satırları (en fazla 4)"
            hint={
              isTr
                ? "Örn. '300.000+ misafir', '4.9 misafir puanı', 'TÜRSAB 9117'."
                : "Bu dilde hiç satır yoksa Türkçe satırlar gösterilir."
            }
          >
            <div className="space-y-2">
              {stats.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input"
                    value={s}
                    maxLength={POPUP_LIMITS.stat}
                    onChange={(e) => updateStat(i, e.target.value)}
                    disabled={loading || !!loadError}
                    aria-label={`Alt bilgi ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => setStats((prev) => prev.filter((_, idx) => idx !== i))}
                    className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-red-600 hover:bg-red-50"
                    aria-label={`Alt bilgi ${i + 1} sil`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {stats.length < POPUP_LIMITS.statsCount && (
                <button
                  type="button"
                  onClick={() => setStats((prev) => [...prev, ""])}
                  disabled={loading || !!loadError}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-stone-700)] hover:text-[var(--color-stone-900)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)]"
                >
                  <Plus size={14} /> Satır ekle
                </button>
              )}
            </div>
          </FieldShell>
        </SettingsSection>

        {/* BUTON */}
        <SettingsSection
          title={`Buton · ${activeLabel}`}
          description="Popup'taki yönlendirme butonu. Göster/gizle tüm dillerde ortaktır; metin ve URL seçili dile aittir."
        >
          <ToggleField
            label="Butonu göster"
            checked={showButton}
            onChange={setShowButton}
            disabled={loading || !!loadError}
          />
          <TextField
            label="Buton metni"
            value={buttonText}
            onChange={(v) => setButtonText(v.slice(0, POPUP_LIMITS.buttonText))}
            placeholder={isTr ? "Villaları inceleyin" : NON_TR_PLACEHOLDER}
            hint={trHint(texts.tr.buttonText)}
            disabled={loading || !!loadError || !showButton}
          />
          <FieldShell
            label="Buton URL'i"
            hint={
              isTr
                ? "Site içi için '/' ile başlayın (örn. /kiralik-villalar). Harici bağlantılar https:// ile başlamalı ve yeni sekmede açılır."
                : `Boşsa Türkçe URL kullanılır. Bu dilin sayfası için örn. /${activeLocale}/kiralik-villalar.`
            }
          >
            <input
              className="input"
              value={buttonUrl}
              onChange={(e) => setButtonUrl(e.target.value.slice(0, POPUP_LIMITS.buttonUrl))}
              placeholder={isTr ? "/kiralik-villalar" : texts.tr.buttonUrl.trim() || "/en/kiralik-villalar"}
              disabled={loading || !!loadError || !showButton}
              aria-invalid={urlInvalid}
            />
            {urlInvalid && (
              <p className="text-[12px] text-red-600 mt-1.5">
                Yalnız &quot;/...&quot; veya &quot;https://...&quot; adresleri kabul edilir.
              </p>
            )}
          </FieldShell>
        </SettingsSection>

        {/* GÖSTERİM
            🛡️ KATMAN: `.card-premium:hover` → transform (translateY) →
            bölüm hover'da stacking context olur; tarih seçici popover'ı
            (z-[60]) bu bölümün İÇİNDE hapsolur ve DOM'da sonra gelen
            "Önizleme" kartının konumlu (relative/absolute) katmanları
            popover'ın üstüne boyanır. Bu sarmalayıcı bölümü sonraki kardeşlerin
            üstüne alır (yalnız bu sayfa; global CSS / AdminDateInput
            değişmedi). z-20 < admin topbar (z-30), mobil menü (z-40/50). */}
        <div className="relative z-20">
        <SettingsSection
          title="Gösterim"
          description="Nerede ve ne sıklıkla gösterileceği. Tarihler boşsa yalnız aktif/pasif durumu geçerlidir."
        >
          <FieldShell label="Gösterim alanı">
            <div className="grid sm:grid-cols-2 gap-2.5">
              {SCOPES.map((o) => (
                <label
                  key={o.value}
                  className={
                    "flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition " +
                    (scope === o.value
                      ? "border-[var(--color-champagne-500)] bg-[var(--color-sand-50)]"
                      : "border-[var(--color-stone-200)] hover:border-[var(--color-stone-300)]")
                  }
                >
                  <input
                    type="radio"
                    name="popup-scope"
                    value={o.value}
                    checked={scope === o.value}
                    onChange={() => setScope(o.value)}
                    disabled={loading || !!loadError}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-[14px] font-medium text-[var(--color-stone-900)]">
                      {o.label}
                    </span>
                    <span className="block text-[12.5px] text-[var(--color-stone-500)] mt-0.5">
                      {o.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </FieldShell>
          <FieldShell
            label="Kapatıldıktan sonra"
            hint="İçeriği değiştirip kaydettiğinizde popup, daha önce kapatmış ziyaretçilere de yeniden gösterilir."
          >
            <select
              className="input"
              value={dismiss}
              onChange={(e) => setDismiss(e.target.value as PopupDismissDuration)}
              disabled={loading || !!loadError}
            >
              {POPUP_DISMISS_DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {POPUP_DISMISS_LABELS[d]}
                </option>
              ))}
            </select>
          </FieldShell>
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Tarih seçici: mevcut admin AdminDateInput (native picker yok).
                Değer formatı aynı ("" | "YYYY-MM-DD"); fieldset disabled →
                yükleme/yetki hatasında tetikleyici buton pasif. */}
            <FieldShell label="Başlangıç tarihi (opsiyonel)" hint="Bu günün başından itibaren (TR saati).">
              <fieldset disabled={loading || !!loadError} className="min-w-0">
                <AdminDateInput
                  mode="date"
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Tarih seç"
                  ariaLabel="Başlangıç tarihi"
                />
              </fieldset>
            </FieldShell>
            <FieldShell label="Bitiş tarihi (opsiyonel)" hint="Bu günün sonuna kadar (dahil).">
              {/* 🛡️ KONUM: iki sütunda (sm+) sağ sütundaki popover, alanın
                  SOL kenarından açılınca dar ekranlarda (≈820–1024px)
                  viewport'un sağından taşıyordu → alanın SAĞ kenarına
                  hizalanır. Tek sütunda (mobil) mevcut davranış aynen. */}
              <fieldset
                disabled={loading || !!loadError}
                className="min-w-0 sm:[&_[role=dialog]]:left-auto sm:[&_[role=dialog]]:right-0"
              >
                <AdminDateInput
                  mode="date"
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="Tarih seç"
                  ariaLabel="Bitiş tarihi"
                />
              </fieldset>
            </FieldShell>
          </div>
        </SettingsSection>
        </div>

        {/* ÖNİZLEME */}
        <SettingsSection
          title={`Önizleme · ${activeLabel}`}
          description="Ziyaretçinin bu dilde göreceği pencere (kaydedilmemiş değişiklikler dahil)."
        >
          {hasPreviewContent ? (
            <div className="rounded-3xl bg-black/60 p-4 sm:p-6">
              <div className="max-w-[720px] mx-auto">
                <SitePopupCard
                  preview
                  popup={{
                    imageUrl: previewImage,
                    title: previewText.title,
                    description: previewText.description,
                    highlight: previewText.highlight,
                    stats: previewText.stats,
                    button: previewButton,
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-stone-400)]">
              Önizleme için görsel veya metin ekleyin.
            </p>
          )}
        </SettingsSection>

        <div className="flex justify-end">
          <SaveButton
            loading={saving}
            saved={saved}
            disabled={loading || !!loadError || invalidUrlLocales.length > 0}
            label="Değişiklikleri kaydet"
          />
        </div>
      </form>
    </div>
  );
}
