import "server-only";

import {
  sitePopupRepository,
  type SitePopupTranslationWritable,
  type SitePopupWritable,
} from "@/lib/db/site-popup.repository.server";
import { removeServer } from "@/lib/storage/server";
import { SITE_ASSETS_BUCKET_NAME, resolveAssetUrlVersioned } from "@/lib/storage.helpers";
import {
  POPUP_IMAGE_FOLDER,
  POPUP_LIMITS,
  POPUP_TRANSLATION_LOCALES,
  cleanPopupText,
  isPopupDismissDuration,
  isPopupDisplayScope,
  isSafePopupUrl,
  normalizePopupStats,
  popupDateToIso,
  popupIsoToDate,
  toPublicSitePopup,
  type PopupDismissDuration,
  type PopupDisplayScope,
  type PopupTranslationLocale,
  type PublicSitePopup,
  type SitePopupRow,
  type SitePopupTranslationRow,
} from "@/lib/site-popup";

/* ===============================================================
   🛡️ SITE POPUP SERVICE (server-only)
   ===============================================================
   • Admin okuma/yazma — çağıran server action'lar yetkiyi
     (`requirePermission("settings")`) ÖNCE doğrular.
   • Yazma: payload alan alan, isimle kurulur; metinler düz metne
     indirgenir, URL/enum/tarih doğrulanır (DB CHECK'leri ikinci kilit).
   • Görsel: mevcut settings `UploadField` deseni — site-assets bucket,
     `popup/<slug>.webp`. Görsel kaldırılırsa R2 nesnesi mevcut
     server remove yolu (`removeServer`) ile silinir (best-effort).
   • Public: `getPublicSitePopup` yalnız render için gereken DAR
     projeksiyonu döner (bkz. lib/site-popup.ts > toPublicSitePopup).
   =============================================================== */

/** Tek dilin düzenlenebilir metinleri (admin formu). */
export type SitePopupTextValues = {
  title: string;
  description: string;
  highlight: string;
  stats: string[];
  buttonText: string;
  buttonUrl: string;
};

export type SitePopupAdminValues = {
  isEnabled: boolean;
  imagePath: string | null;
  title: string;
  description: string;
  highlight: string;
  stats: string[];
  buttonText: string;
  buttonUrl: string;
  showButton: boolean;
  scope: PopupDisplayScope;
  dismiss: PopupDismissDuration;
  startDate: string;
  endDate: string;
  updatedAt: string | null;
  /** EN/DE (migration 096). Boş alan → public'te Türkçe değer. */
  translations: Record<PopupTranslationLocale, SitePopupTextValues>;
};

export type SitePopupSaveResult =
  | { ok: true; values: SitePopupAdminValues }
  | { ok: false; error: string };

const LOCALE_LABELS: Record<PopupTranslationLocale, string> = { en: "English", de: "Deutsch" };

const EMPTY_TEXT: SitePopupTextValues = {
  title: "",
  description: "",
  highlight: "",
  stats: [],
  buttonText: "",
  buttonUrl: "",
};

function emptyTranslations(): Record<PopupTranslationLocale, SitePopupTextValues> {
  return { en: { ...EMPTY_TEXT, stats: [] }, de: { ...EMPTY_TEXT, stats: [] } };
}

const IMAGE_PATH_RE = new RegExp(`^${POPUP_IMAGE_FOLDER}/[a-z0-9-]{1,64}\\.webp$`);

export const SITE_POPUP_DEFAULTS: SitePopupAdminValues = {
  isEnabled: false,
  imagePath: null,
  title: "",
  description: "",
  highlight: "",
  stats: [],
  buttonText: "",
  buttonUrl: "",
  showButton: true,
  scope: "home",
  dismiss: "session",
  startDate: "",
  endDate: "",
  updatedAt: null,
  translations: emptyTranslations(),
};

function toAdminTranslations(
  rows: readonly SitePopupTranslationRow[] | null | undefined
): Record<PopupTranslationLocale, SitePopupTextValues> {
  const out = emptyTranslations();
  for (const r of rows || []) {
    if (r.locale !== "en" && r.locale !== "de") continue;
    out[r.locale] = {
      title: r.title || "",
      description: r.description || "",
      highlight: r.highlight_text || "",
      stats: normalizePopupStats(r.stats),
      buttonText: r.button_text || "",
      buttonUrl: r.button_url || "",
    };
  }
  return out;
}

function toAdminValues(
  row: SitePopupRow | null,
  translationRows: readonly SitePopupTranslationRow[] | null = null
): SitePopupAdminValues {
  if (!row) return { ...SITE_POPUP_DEFAULTS, translations: emptyTranslations() };
  return {
    isEnabled: row.is_enabled === true,
    imagePath: row.image_path || null,
    title: row.title || "",
    description: row.description || "",
    highlight: row.highlight_text || "",
    stats: normalizePopupStats(row.stats),
    buttonText: row.button_text || "",
    buttonUrl: row.button_url || "",
    showButton: row.show_button !== false,
    scope: isPopupDisplayScope(row.display_scope) ? row.display_scope : "home",
    dismiss: isPopupDismissDuration(row.dismiss_duration) ? row.dismiss_duration : "session",
    startDate: popupIsoToDate(row.starts_at, "start"),
    endDate: popupIsoToDate(row.ends_at, "end"),
    updatedAt: row.updated_at || null,
    translations: toAdminTranslations(translationRows),
  };
}

export async function getSitePopupForAdmin(): Promise<SitePopupAdminValues | null> {
  const { data, error } = await sitePopupRepository.find();
  if (error) {
    console.error("[site-popup.admin.read] FAILED", error.message);
    return null;
  }
  const tr = await sitePopupRepository.findTranslations();
  if (tr.error) {
    /* Migration 096 uygulanmadıysa admin açıkça hata görür (çeviriler
       sessizce boş görünüp üzerine yazılmasın). */
    console.error("[site-popup.admin.read] TRANSLATIONS_FAILED", tr.error.message);
    return null;
  }
  return toAdminValues(
    (data as SitePopupRow | null) ?? null,
    (tr.data as SitePopupTranslationRow[] | null) ?? []
  );
}

/** EN/DE girişini doğrular; `translations` anahtarı hiç yoksa null
 *  (→ çevirilere dokunulmaz; eski istemcilerle geriye uyumlu). */
function parseTranslations(
  raw: unknown,
  showButton: boolean,
  trButtonUrl: string
):
  | { ok: true; values: Record<PopupTranslationLocale, SitePopupTranslationWritable> | null }
  | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, values: null };
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const values = {} as Record<PopupTranslationLocale, SitePopupTranslationWritable>;
  for (const locale of POPUP_TRANSLATION_LOCALES) {
    const t = (obj[locale] && typeof obj[locale] === "object" ? obj[locale] : {}) as Record<
      string,
      unknown
    >;
    const buttonText = cleanPopupText(t.buttonText, POPUP_LIMITS.buttonText);
    const buttonUrl = typeof t.buttonUrl === "string" ? t.buttonUrl.trim() : "";
    if (buttonUrl && !isSafePopupUrl(buttonUrl)) {
      return {
        ok: false,
        error: `${LOCALE_LABELS[locale]}: buton URL'i '/' ile başlayan bir site adresi veya https:// ile başlayan bir bağlantı olmalı`,
      };
    }
    /* Buton metni bu dilde yazıldıysa URL bu dilden ya da Türkçeden gelmeli. */
    if (showButton && buttonText && !buttonUrl && !trButtonUrl) {
      return { ok: false, error: `${LOCALE_LABELS[locale]}: buton URL'i zorunlu` };
    }
    values[locale] = {
      title: cleanPopupText(t.title, POPUP_LIMITS.title),
      description: cleanPopupText(t.description, POPUP_LIMITS.description, { multiline: true }),
      highlight_text: cleanPopupText(t.highlight, POPUP_LIMITS.highlight),
      stats: normalizePopupStats(t.stats),
      button_text: buttonText,
      button_url: buttonUrl || null,
    };
  }
  return { ok: true, values };
}

export async function saveSitePopup(input: unknown): Promise<SitePopupSaveResult> {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  const title = cleanPopupText(v.title, POPUP_LIMITS.title);
  const description = cleanPopupText(v.description, POPUP_LIMITS.description, { multiline: true });
  const highlight = cleanPopupText(v.highlight, POPUP_LIMITS.highlight);
  const stats = normalizePopupStats(v.stats);
  const buttonText = cleanPopupText(v.buttonText, POPUP_LIMITS.buttonText);
  const buttonUrlRaw = typeof v.buttonUrl === "string" ? v.buttonUrl.trim() : "";
  const showButton = v.showButton !== false;
  const isEnabled = v.isEnabled === true;

  const imagePath =
    typeof v.imagePath === "string" && v.imagePath.trim() ? v.imagePath.trim() : null;
  if (imagePath && !IMAGE_PATH_RE.test(imagePath)) {
    return { ok: false, error: "Geçersiz görsel yolu" };
  }

  if (buttonUrlRaw && !isSafePopupUrl(buttonUrlRaw)) {
    return {
      ok: false,
      error: "Buton URL'i '/' ile başlayan bir site adresi veya https:// ile başlayan bir bağlantı olmalı",
    };
  }
  if (showButton && buttonText && !buttonUrlRaw) {
    return { ok: false, error: "Buton gösterilecekse buton URL'i zorunlu" };
  }

  const scope = isPopupDisplayScope(v.scope) ? v.scope : null;
  const dismiss = isPopupDismissDuration(v.dismiss) ? v.dismiss : null;
  if (!scope || !dismiss) return { ok: false, error: "Geçersiz gösterim ayarı" };

  const startDate = typeof v.startDate === "string" ? v.startDate.trim() : "";
  const endDate = typeof v.endDate === "string" ? v.endDate.trim() : "";
  const startsAt = startDate ? popupDateToIso(startDate, "start") : null;
  const endsAt = endDate ? popupDateToIso(endDate, "end") : null;
  if ((startDate && !startsAt) || (endDate && !endsAt)) {
    return { ok: false, error: "Geçersiz tarih" };
  }
  if (startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt)) {
    return { ok: false, error: "Bitiş tarihi başlangıç tarihinden önce olamaz" };
  }

  if (isEnabled && !imagePath && !title && !highlight && !description) {
    return { ok: false, error: "Popup'ı açmak için en az bir görsel veya başlık ekleyin" };
  }

  const parsedTranslations = parseTranslations(v.translations, showButton, buttonUrlRaw);
  if (!parsedTranslations.ok) return parsedTranslations;
  const translations = parsedTranslations.values;

  /* Önceki görsel — kaldırıldıysa R2 nesnesi silinecek. */
  const prev = await sitePopupRepository.find();
  if (prev.error) {
    console.error("[site-popup.save] READ_FAILED", prev.error.message);
    return { ok: false, error: "Kaydedilemedi" };
  }
  const prevImage = (prev.data as SitePopupRow | null)?.image_path || null;

  const payload: SitePopupWritable = {
    is_enabled: isEnabled,
    image_path: imagePath,
    title,
    description,
    highlight_text: highlight,
    stats,
    button_text: buttonText,
    button_url: buttonUrlRaw || null,
    show_button: showButton,
    display_scope: scope,
    dismiss_duration: dismiss,
    starts_at: startsAt,
    ends_at: endsAt,
    updated_at: new Date().toISOString(),
  };

  /* EN/DE önce yazılır; ana satır (updated_at = içerik sürümü) en son
     güncellenir → çeviri yazımı başarısızsa sürüm değişmez, hata döner. */
  if (translations) {
    for (const locale of POPUP_TRANSLATION_LOCALES) {
      const res = await sitePopupRepository.upsertTranslation(locale, translations[locale]);
      if (res.error) {
        console.error("[site-popup.save] TRANSLATION_FAILED", {
          locale,
          error: res.error.message,
        });
        return { ok: false, error: "Çeviriler kaydedilemedi (migration 096 uygulanmış mı?)" };
      }
    }
  }

  const { data, error } = await sitePopupRepository.update(payload);
  if (error || !data) {
    console.error("[site-popup.save] FAILED", error?.message || "row missing (migration 095?)");
    return { ok: false, error: "Kaydedilemedi" };
  }

  if (prevImage && prevImage !== imagePath && IMAGE_PATH_RE.test(prevImage)) {
    try {
      const res = await removeServer(SITE_ASSETS_BUCKET_NAME, [prevImage]);
      if (!res.ok) console.warn("[site-popup.save] STORAGE_ORPHAN", { path: prevImage });
    } catch (e) {
      console.warn("[site-popup.save] STORAGE_ORPHAN", {
        path: prevImage,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  let savedTranslations: SitePopupTranslationRow[] = [];
  if (translations) {
    savedTranslations = POPUP_TRANSLATION_LOCALES.map((locale) => ({
      popup_id: 1,
      locale,
      ...translations[locale],
    }));
  } else {
    const tr = await sitePopupRepository.findTranslations();
    savedTranslations = (tr.data as SitePopupTranslationRow[] | null) ?? [];
  }

  return { ok: true, values: toAdminValues(data as SitePopupRow, savedTranslations) };
}

/** Public projeksiyon (cache'li sarmalayıcı: lib/site-popup.cache.ts). */
export async function getPublicSitePopup(): Promise<PublicSitePopup | null> {
  const { data, error } = await sitePopupRepository.find();
  if (error) {
    /* Tablo henüz yoksa (migration 095 uygulanmadı) veya DB hatası →
       popup gösterilmez; site etkilenmez. */
    console.error("[site-popup.public.read] FAILED", error.message);
    return null;
  }
  const row = (data as SitePopupRow | null) ?? null;
  /* Kapalıysa çeviri sorgusu hiç atılmaz. */
  if (!row || row.is_enabled !== true) return null;
  const tr = await sitePopupRepository.findTranslations();
  if (tr.error) {
    /* Migration 096 yoksa / hata → popup Türkçe gösterilir; site etkilenmez. */
    console.error("[site-popup.public.read] TRANSLATIONS_FAILED", tr.error.message);
  }
  return toPublicSitePopup(
    row,
    (path, version) => resolveAssetUrlVersioned(path, version),
    Date.now(),
    tr.error ? [] : ((tr.data as SitePopupTranslationRow[] | null) ?? [])
  );
}
