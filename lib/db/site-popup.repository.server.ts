import "server-only";

import { dbAdminNative as dbAdmin } from "@/lib/db/native";
import type {
  PopupTranslationLocale,
  SitePopupRow,
  SitePopupTranslationRow,
} from "@/lib/site-popup";

/* ===============================================================
   🛡️ SITE POPUP REPOSITORY (server-only) — migration 095
   ===============================================================
   Tek satırlık `site_popup` tablosu (id = 1). Tablo adı ve satır
   kimliği SABİT; çağırandan gelmez. `update` yalnız servis
   katmanının isimle kurduğu alan listesini alır (keyfi obje
   passthrough YOK — bkz. site-popup.service.ts).
   =============================================================== */

const TABLE = "site_popup";
const SINGLETON_ID = 1;
/* Migration 096 — EN/DE içerik (TR canonical = site_popup satırı). */
const TRANSLATIONS_TABLE = "site_popup_translations";

export type SitePopupWritable = Pick<
  SitePopupRow,
  | "is_enabled"
  | "image_path"
  | "title"
  | "description"
  | "highlight_text"
  | "button_text"
  | "button_url"
  | "show_button"
  | "display_scope"
  | "dismiss_duration"
  | "starts_at"
  | "ends_at"
  | "updated_at"
> & { stats: string[] };

export type SitePopupTranslationWritable = Pick<
  SitePopupTranslationRow,
  "title" | "description" | "highlight_text" | "button_text" | "button_url"
> & { stats: string[] };

export const sitePopupRepository = {
  async find() {
    return dbAdmin
      .from<SitePopupRow>(TABLE)
      .select("*")
      .eq("id", SINGLETON_ID)
      .maybeSingle();
  },

  async update(values: SitePopupWritable) {
    return dbAdmin
      .from<SitePopupRow>(TABLE)
      .update(values as unknown as Record<string, unknown>)
      .eq("id", SINGLETON_ID)
      .select("*")
      .maybeSingle();
  },

  /** EN/DE çeviri satırları (0..2). */
  async findTranslations() {
    return dbAdmin
      .from<SitePopupTranslationRow>(TRANSLATIONS_TABLE)
      .select("popup_id, locale, title, description, highlight_text, stats, button_text, button_url")
      .eq("popup_id", SINGLETON_ID);
  },

  /** Tek dilin TAM durumunu yazar — UNIQUE (popup_id, locale) upsert.
   *  Payload isimle kurulur (spread YOK); locale tipi yalnız "en"|"de". */
  async upsertTranslation(locale: PopupTranslationLocale, values: SitePopupTranslationWritable) {
    return dbAdmin
      .from<SitePopupTranslationRow>(TRANSLATIONS_TABLE)
      .upsert(
        {
          popup_id: SINGLETON_ID,
          locale,
          title: values.title,
          description: values.description,
          highlight_text: values.highlight_text,
          stats: values.stats,
          button_text: values.button_text,
          button_url: values.button_url,
        } as unknown as Record<string, unknown>,
        { onConflict: "popup_id,locale" }
      );
  },
};
