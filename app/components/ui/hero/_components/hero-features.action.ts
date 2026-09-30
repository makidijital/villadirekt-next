"use server";

import { villaFeatureRepository } from "@/lib/db/villa-feature.repository";
/* 🛡️ Özellik adlarının EN/DE karşılıkları. `villa_types` ve
   `/api/public/taxonomies` ile AYNI, ZATEN VAR OLAN helper kullanılır;
   yeni çeviri sistemi veya yeni DB sorgu katmanı YAZILMADI. */
import { getVillaFeatureNamesByLocale } from "@/lib/i18n/get-villa-feature-translations.server";
import {
  resolveTaxonomyName,
  type TaxonomyNameByLocale,
} from "@/lib/i18n/taxonomy-name.helper";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

import type { FilterOption } from "../_types/hero";

/* ===============================================================
   🛡️ HERO — VİLLA ÖZELLİKLERİ (FEATURES) YÜKLEME — SERVER ACTION
   ===============================================================
   HeroSearchPanel (client) "Gelişmiş Arama" kutusundaki çoklu seçim
   listesini bu action ile doldurur. Böylece `villa-feature.repository`
   (ve `@/lib/db`) client bundle'ına GİRMEZ — `hero-filters.action.ts`
   ile BİREBİR aynı desen.

   ⚠️ NEDEN AYRI DOSYA (`hero-filters.action.ts`'e EKLENMEDİ):
     `loadHeroFilters` mevcut testlerde (tests/unit/homepage-p0-i18n.
     test.tsx) sorgu SAYISI ve çağrılan entity adı üzerinden
     kilitlenmiştir ("locale başına TEK batch"). Oraya ikinci bir
     taksonomi eklemek o assertion'ları kırardı. Ayrı action → mevcut
     dosya ve mevcut testler BİREBİR korunur; HeroSearchPanel iki
     action'ı `Promise.all` ile PARALEL çağırdığı için EK RTT YOKTUR.

   ⚠️ CACHE YOK (bilinçli): admin özellik CRUD'u (`maki-admin/features`)
     `revalidateTaxonomy()` ÇAĞIRMIYOR. `unstable_cache` eklenirse
     admin'de eklenen/yeniden adlandırılan bir özellik 1 saate kadar
     bayat kalırdı. Cache/revalidation mimarisine DOKUNULMADI.

   ⚠️ `villa_features` tablosunda `slug` KOLONU YOK → URL token'ı
     UUID'dir (`ozellikler=uuid1,uuid2`). Migration YAPILMADI.

   SORGU: TR'de TEK sorgu (çeviri sorgusu HİÇ atılmaz — `villa_types`
   TR davranışıyla birebir). EN/DE'de + locale başına TEK batch
   (`getVillaFeatureNamesByLocale`, N+1 YOK).
   =============================================================== */
export async function loadHeroFeatures(
  locale: Locale = DEFAULT_LOCALE
): Promise<FilterOption[]> {
  const res = await villaFeatureRepository.findAllForPublicTaxonomy();

  /* `slug` alanı BİLİNÇLİ olarak `null`: buildHeroSearchParams
     slug-öncelikli zinciri (`opt.slug || id`) doğal olarak UUID'ye
     düşer → `ozellikler` her zaman UUID taşır. */
  const rows: FilterOption[] = (res.data || [])
    .map((f) => ({
      id: String(f.id ?? ""),
      name: String(f.name ?? ""),
      slug: null,
    }))
    .filter((f) => f.id.length > 0 && f.name.length > 0);

  if (locale === DEFAULT_LOCALE || rows.length === 0) {
    return sortByName(rows, locale);
  }

  /* Hata → boş harita → canonical TR adına fallback (fail-soft). */
  const nameByLocale: Record<string, TaxonomyNameByLocale> =
    await getVillaFeatureNamesByLocale(rows.map((f) => f.id)).catch(() => ({}));

  return sortByName(
    rows.map((f) => ({
      ...f,
      name: resolveTaxonomyName(f.name, nameByLocale[f.id], locale),
    })),
    locale
  );
}

/* `findAllForPublicTaxonomy` ORDER BY içermez (DB doğal sırası).
   Filtre listesinin her istekte aynı sırada gelmesi için görünen ada
   göre deterministik sıralanır; `id` DEĞİŞMEZ → URL/seçim etkilenmez. */
function sortByName(rows: FilterOption[], locale: Locale): FilterOption[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, locale));
}
