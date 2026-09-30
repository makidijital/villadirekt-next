/* ===============================================================
   🛡️ getDictionary — PHASE 2 (UI Translation Dictionary Core)
   ===============================================================
   Merkezi, saf (pure) dictionary loader. Static module import
   kullanır (unstable_cache/dynamic import YOK — ES module'ler zaten
   bundler/Node tarafından tek sefer değerlendirilir, ek bir cache
   katmanına gerek yok). Global mutable state YOK.

   Yalnız EXPLICIT locale parametresi alır — cookie/URL/header/
   window/document okuması YOK (bu faz için bilinçli sınır, bkz.
   Phase 2 raporu). Geçersiz/eksik/undefined/null →
   `resolveLocale()` (lib/i18n/config.ts) ile DEFAULT_LOCALE'e
   ("tr") güvenli şekilde düşer — TR dictionary hiçbir key için
   eksik olmadığından bu fallback her zaman tam bir Dictionary döner.

   KULLANIM (server veya client, ikisi de olur — saf fonksiyon):
     const dictionary = getDictionary("tr");
     const dictionary = getDictionary(someExplicitLocale);
   =============================================================== */

import { resolveLocale, type Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries/types";
import { tr } from "@/lib/i18n/dictionaries/tr";
import { en } from "@/lib/i18n/dictionaries/en";
import { de } from "@/lib/i18n/dictionaries/de";

const DICTIONARIES: Record<Locale, Dictionary> = { tr, en, de };

export function getDictionary(explicitLocale?: string | null): Dictionary {
  return DICTIONARIES[resolveLocale(explicitLocale)];
}

export type { Dictionary };
