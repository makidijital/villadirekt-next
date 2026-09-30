"use server";

import { menuRepository } from "@/lib/db/menu.repository";
import { villaTypeRepository } from "@/lib/db/villa-type.repository";
/* 🛡️ PHASE 11 P0 — villa tipi adlarının EN/DE karşılıkları. VillaTypeCarousel
   ile AYNI, ZATEN VAR OLAN iki helper kullanılır; yeni translation sistemi
   veya yeni DB sorgu katmanı YAZILMADI. */
import { getVillaTypeNamesByLocale } from "@/lib/i18n/get-villa-type-translations.server";
import {
  resolveTaxonomyName,
  type TaxonomyNameByLocale,
} from "@/lib/i18n/taxonomy-name.helper";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ HERO FİLTRE YÜKLEME — SERVER ACTION
   ===============================================================
   HeroSearchPanel (client) mount'ta tip (taksonomi) + bölge
   (locations) listelerini artık DOĞRUDAN repository yerine bu server
   action üzerinden yükler. Böylece `menu.repository` /
   `villa-type.repository` (ve `@/lib/db`) client bundle'ına GİRMEZ.

   ⚠️ DAVRANIŞ AYNEN: repo metodları birebir aynı SELECT/order'ı
   çalıştırır; dönen `data` dizileri ham haliyle verilir (bölge
   filtresi/UI mantığı bileşende kalır). Public okuma → ek yetki yok.

   🛡️ PHASE 11 P0 — VILLA TİPİ ADI LOCALE-AWARE:
     • `locale === "tr"` → çeviri sorgusu HİÇ atılmaz; dönen liste ve
       sorgu sayısı BİREBİR eskisi gibi (TR davranışı korunur).
     • EN/DE → `getVillaTypeNamesByLocale` (TEK batch `.in()` sorgusu,
       N+1 YOK) + `resolveTaxonomyName` (çeviri yoksa canonical TR adı).
     • YALNIZ GÖRÜNEN `name` değişir — `id`, `slug`, sıralama ve
       dolayısıyla seçim/URL davranışı DEĞİŞMEZ.

   ⚠️ BÖLGELER (locations) DEĞİŞMEDİ: bölge adları özel isimdir ve her
   dilde CANONICAL kalır (Phase 10I kararı) — burada çevrilmez.
   =============================================================== */
export async function loadHeroFilters(locale: Locale = DEFAULT_LOCALE) {
  const [types, locations] = await Promise.all([
    villaTypeRepository.findAllForPublicTaxonomy(),
    menuRepository.findAllVillaLocations(),
  ]);

  const rows = types.data;
  if (locale === DEFAULT_LOCALE || !rows || rows.length === 0) {
    return { types: rows, locations: locations.data };
  }

  const nameByLocale: Record<string, TaxonomyNameByLocale> =
    await getVillaTypeNamesByLocale(rows.map((t) => String(t.id))).catch(
      () => ({})
    );

  const translated = rows.map((t) => ({
    ...t,
    name: resolveTaxonomyName(t.name, nameByLocale[String(t.id)], locale),
  }));

  return { types: translated, locations: locations.data };
}
