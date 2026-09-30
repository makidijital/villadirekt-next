import "server-only";

import { getTranslationsForParents } from "@/lib/i18n/get-translation.server";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ PHASE 11 — VILLA KART ROZETİ (badge) ÇEVİRİSİ (server-only)
   ===============================================================
   Ana sayfadaki villa kartlarında gösterilen TEK çevrilebilir DB alanı
   `villa.badge`'dir (`villa_translations.badge`, migration 082).

   ⚠️ ÇEVRİLMEYENLER (proje kararı, DEĞİŞTİRİLMEDİ):
     • Villa ADI  → özel isim; her dilde canonical `villa.title`
       (`villa_translations.title` Phase 10F'te kaldırıldı).
     • Villa BÖLGESİ → özel isim; canonical `villa_locations.name`
       (bölge çeviri sistemi Phase 10I'de kaldırıldı).

   `get-villa-type-translations.server.ts` (Phase 10H) ile AYNI desen:
   TEK batch sorgu, N+1 YOK; `tr` için sorgu HİÇ atılmaz.
   =============================================================== */

/** `villaId → çevrilmiş badge` haritası. TR'de her zaman BOŞ Map. */
export async function getVillaBadgesByLocale(
  villaIds: readonly string[],
  locale: Locale
): Promise<Map<string, string>> {
  if (locale === DEFAULT_LOCALE) return new Map();

  const ids = Array.from(
    new Set(
      villaIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    )
  );
  if (ids.length === 0) return new Map();

  const rows = await getTranslationsForParents("villa", ids, locale).catch(
    () => null
  );
  if (!rows || rows.size === 0) return new Map();

  const out = new Map<string, string>();
  for (const id of ids) {
    const badge = rows.get(id)?.badge;
    if (typeof badge === "string" && badge.trim() !== "") out.set(id, badge);
  }
  return out;
}
