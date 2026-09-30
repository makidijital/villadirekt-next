import "server-only";

import { cache } from "react";

import { translationRepository } from "@/lib/db/translation.repository.server";
import { DEFAULT_LOCALE, toLocale, type Locale } from "@/lib/i18n/config";
import {
  TRANSLATION_ENTITY_CONFIG,
  type TranslationEntity,
  type TranslationRowFor,
} from "@/lib/i18n/translations.types";

/* ===============================================================
   🛡️ REQUEST-SCOPED DEDUPE — React `cache()` (Aşama 6)
   ===============================================================
   Aynı request/render içinde AYNI çeviri sorgusu birden çok kez
   çalışıyordu (ör. HeaderWrapper/FooterWrapper hem `(public)/layout`
   hem root `not-found.tsx` ağacında render oluyor; blog/CMS çevirisi
   hem generateMetadata hem sayfa gövdesinde okunuyor). Bu sarmalayıcılar
   yalnız DB okumasını request-scoped memoize eder:
     • Anahtar = (entity, parentId, locale) / (entity, locale, parentIds
       sıralı JSON listesi) — hepsi primitive; farklı locale / entity /
       id listesi ASLA aynı sonucu paylaşmaz. id listesi sırası dahil
       birebir aynı değilse ayrı (eskisiyle aynı) sorgu atılır.
     • SQL, parametreler, fallback ve dönüş şekli DEĞİŞMEZ; Map her
       çağrıda yeniden kurulur.
     • `cache()` yalnız React server render'ında memoize eder; request
       dışı (route handler / server action / test) bağlamlarda doğrudan
       çağrı gibi davranır. Request'ler arası paylaşım YOK (stale yok).
   =============================================================== */
const findOneCached = cache(
  (entity: TranslationEntity, parentId: string, locale: Locale) =>
    translationRepository.findOne(entity, parentId, locale)
);

const findManyForLocaleCached = cache(
  (entity: TranslationEntity, locale: Locale, parentIdsKey: string) =>
    translationRepository.findManyForLocale(
      entity,
      JSON.parse(parentIdsKey) as string[],
      locale
    )
);

/* ===============================================================
   🛡️ TRANSLATION READ LAYER — PHASE 5 (Translation Read Layer)
   ===============================================================
   AMAÇ: Phase 3'ün ham, generic `translationRepository`'sinin (9
   çeviri tablosu, `findOne`/`findAllForParent`, `{ data, error }`
   zarfı) ÜZERİNE, locale/fallback semantiği ekleyen TEK küçük katman.

   Bu dosya translationRepository'yi YENİDEN YAZMAZ — proje
   konvansiyonuna göre repository ham kalır (bkz. rule-item.repository.ts
   üstyazısı: "error/trim-validation/return/log SERVICE'te"), bu dosya
   o SERVICE katmanının i18n karşılığıdır (app/services/*.service.ts
   deseniyle aynı sorumluluk ayrımı, yalnız i18n'e özgü olduğundan
   lib/i18n/ altında — get-dictionary.ts ile aynı klasör/konvansiyon).

   FALLBACK KARARI (bilinçli, mimariye göre seçildi):
     Mevcut parent tabloları (villa, pages, faqs, ...) zaten Türkçe
     source-of-truth ve `null` dönüşü mevcut mimaride ZATEN "kayıt
     yok" anlamına geliyor (`DbSingleResult.data: T | null`,
     `.maybeSingle()` 0 satırda `null` döner — bkz.
     native-db.provider.ts, villa.service.ts `getVillaBySlug` → null).
     Bu yüzden burada da "çeviri yok" sinyali `undefined` DEĞİL,
     `null` — mevcut mimariyle TUTARLI, yeni bir sözleşme İCAT
     EDİLMEDİ.

     `getTranslation` PARENT TABLOLARI HİÇ BİLMEZ/SORGULAMAZ (villa,
     pages, faqs repository'lerine tek bir import/çağrı bile YOK) —
     yalnız çeviri satırını (veya yokluğunu) döner. Parent değerine
     asıl fallback'i UYGULAMAK, `resolveTranslatedField` ile ÇAĞIRAN
     TARAFIN sorumluluğudur (bu faz PUBLIC COMPONENT'lere BAĞLAMIYOR
     — bkz. görev tanımı — dolayısıyla bugün hiçbir çağıran yok; bu
     ileride villa/page/faq render kodunun kullanacağı hazır temel).
     Bu ayrım N+1'i de önler: getTranslation yalnız TEK sorgu atar
     (translation tablosuna), parent veri zaten çağıran tarafın
     mevcut akışından (ör. getVillaBySlug) geliyor olur.

   TR KISAYOLU (performans + "gereksiz bağımlılık yok"):
     `locale === "tr"` (veya geçersiz/tanınmayan bir locale →
     `toLocale` ile "tr"e düşer) ise translation tablosuna HİÇ SORGU
     ATILMAZ, doğrudan `null` döner. Villa title gibi alanlar bugün
     `villa.title`'dan nasıl okunuyorsa TR için AYNEN öyle okunmaya
     devam eder — bu dosya o akışa hiçbir yeni DB bağımlılığı eklemez.

   GÜVENLİK: `translationRepository` zaten server-only (`lib/db/
   translation.repository.server.ts` → `dbNative` → `pg`). Bu dosya
   da `"server-only"` import eder — client bundle'a asla girmez. Yeni
   bir admin/service-role bypass, RLS, GRANT YOK — mevcut tek-app-rolü
   native Postgres deseni (Phase 3/081) AYNEN korunur.

   PERFORMANS: `getTranslation` başına TEK sorgu (`findOne` zaten
   `.eq(parentIdColumn, parentId).eq("locale", locale).maybeSingle()`
   — tek satır, tek round-trip). Bu faz cache EKLEMEZ (kapsam dışı,
   görev tanımı).

   🛡️ PHASE 8D-1 EKLEMESİ — `getTranslationsForParents`: Phase 8D
   audit'inin tespit ettiği "N parent, tek locale" ihtiyacı için
   `getTranslation`'a PARALEL, ayrı bir fonksiyon —
   `translationRepository.findManyForLocale` (Phase 8D-1, `.in()` +
   `.eq("locale",...)` TEK sorgu) üzerine `parentId → row` bir `Map`
   inşa eder (O(1) lookup). `getTranslation`, `resolveTranslatedField`,
   `getVillaTranslationCached` VE bunların mevcut call-site'ları
   (title/description/seo_description) BU FONKSİYONDAN HİÇ ETKİLENMEZ
   — tamamen ek, izole bir yol. Locale-aware olmayan persistent bir
   cache (`unstable_cache` vb.) EKLENMEDİ; React `cache()` da
   EKLENMEDİ (Phase 8D audit'in `readonly string[]` referans-eşitliği
   belirsizliği burada ÇÖZÜLMEYE ÇALIŞILMADI — bilinçli olarak dışarıda
   bırakıldı, ileride gerçek bir çağıran ortaya çıkınca değerlendirilir).
   Bu fonksiyonun BUGÜN HİÇBİR call-site'ı YOK — EN/DE villa detail
   sayfalarına location/features/rules/priceIncludes/distances BU
   FAZDA EKLENMEDİ.
   =============================================================== */

/** `TRANSLATION_ENTITY_CONFIG`'te tanımlı bilinen bir entity mi?
 *  (bkz. `isSupportedLocale` — lib/i18n/config.ts — aynı desen: tip
 *  daralması + güvenli, throw'suz doğrulama.) Bilinmeyen bir değer
 *  (yanlış yazım, tip bypass'ı) DB'ye asla ulaşmaz. */
export function isTranslationEntity(
  value: unknown
): value is TranslationEntity {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(TRANSLATION_ENTITY_CONFIG, value)
  );
}

/**
 * Bir parent kaydın belirli bir locale'deki çeviri satırını okur.
 *
 * Dönüş — `null` ("bu locale için çeviri yok/uygulanmaz") ÜÇ durumda:
 *   1) `locale` TR'ye çözümleniyorsa (geçerli "tr" veya geçersiz/
 *      tanınmayan bir değer) → sorgu atılmadan.
 *   2) `entity` bilinmiyorsa → sorgu atılmadan.
 *   3) `parentId` boşsa → sorgu atılmadan.
 *   4) Sorgu atılır ama satır yoksa VEYA DB hatası dönerse (asla
 *      throw etmez — `translationRepository`/native provider zaten
 *      hata fırlatmıyor, `{ data: null, error }` döner; burada hata
 *      da güvenli null'a indirgenir — bir çeviri okuma sorunu public
 *      sayfayı asla çökertmemeli).
 *
 * Satır bulunursa TAMAMI (`TranslationRowFor<E>`) döner — alan bazlı
 * fallback `resolveTranslatedField` ile çağıran tarafta yapılır
 * (bir satırda bazı kolonlar dolu, bazıları NULL olabilir — bkz.
 * migration 082, tüm çevrilebilir kolonlar nullable).
 */
export async function getTranslation<E extends TranslationEntity>(
  entity: E,
  parentId: string,
  locale: Locale
): Promise<TranslationRowFor<E> | null> {
  const resolvedLocale = toLocale(locale);

  if (resolvedLocale === DEFAULT_LOCALE) return null;
  if (!isTranslationEntity(entity)) return null;
  if (!parentId) return null;

  const { data, error } = await findOneCached(
    entity,
    parentId,
    resolvedLocale
  );
  if (error) return null;

  return (data ?? null) as TranslationRowFor<E> | null;
}

/**
 * 🛡️ PHASE 8D-1 — Birden fazla parent kaydın, TEK bir locale'deki
 * çevirilerini `parentId → TranslationRowFor<E>` bir `Map`'e çözer
 * (N+1'e karşı — `getTranslation`'ı N kez çağırmak yerine TEK sorgu).
 *
 * Boş `Map` dönen durumlar (asla throw etmez — `getTranslation` ile
 * AYNI hata-güvenliği ilkesi):
 *   1) `locale` TR'ye çözümleniyorsa (geçerli "tr" veya geçersiz/
 *      tanınmayan bir değer) → sorgu atılmadan.
 *   2) `entity` bilinmiyorsa → sorgu atılmadan.
 *   3) `parentIds` boşsa → sorgu atılmadan.
 *   4) Sorgu atılır ama repository hata dönerse → sorgu sonucu
 *      GÖZ ARDI edilir, boş `Map` döner (public sayfa render'ı bir
 *      çeviri okuma sorunuyla ASLA çökmemeli — `getTranslation` ile
 *      birebir aynı prensip).
 *
 * Çeviri satırı OLMAYAN bir `parentId`, Map'te HİÇ YER ALMAZ (undefined
 * dönecek şekilde) — `resolveTranslatedField` ile aynı "yok = fallback"
 * semantiğini çağıran tarafın uygulaması için doğal bir temel (bu
 * fonksiyon fallback'i KENDİSİ UYGULAMAZ — `getTranslation` ile aynı
 * sorumluluk ayrımı).
 *
 * `parentIdColumn` her satırdan `TRANSLATION_ENTITY_CONFIG[entity]`
 * üzerinden DİNAMİK okunur (entity'ye göre değişir — villa_id/
 * location_id/feature_id/rule_id/include_id/distance_id/page_id/
 * faq_id); satırda o kolon string değilse (beklenmedik/bozuk veri)
 * o satır Map'e EKLENMEZ (sessizce atlanır, throw etmez).
 */
export async function getTranslationsForParents<E extends TranslationEntity>(
  entity: E,
  parentIds: readonly string[],
  locale: Locale
): Promise<Map<string, TranslationRowFor<E>>> {
  const resolvedLocale = toLocale(locale);

  if (resolvedLocale === DEFAULT_LOCALE) return new Map();
  if (!isTranslationEntity(entity)) return new Map();
  if (parentIds.length === 0) return new Map();

  const { data, error } = await findManyForLocaleCached(
    entity,
    resolvedLocale,
    JSON.stringify(parentIds)
  );
  if (error) return new Map();

  const { parentIdColumn } = TRANSLATION_ENTITY_CONFIG[entity];
  const result = new Map<string, TranslationRowFor<E>>();
  for (const row of data ?? []) {
    const parentId = (row as unknown as Record<string, unknown>)[
      parentIdColumn
    ];
    if (typeof parentId === "string") {
      result.set(parentId, row as TranslationRowFor<E>);
    }
  }
  return result;
}

/**
 * Tek bir alan için deterministik fallback: çeviri değeri dolu bir
 * string'se onu, değilse (null/undefined/boş/yalnız boşluk) `parentValue`'yu
 * döner. `parentValue` HİÇBİR ŞEKİLDE sorgulanmaz/değiştirilmez —
 * çağıran taraf mevcut TR parent verisini (ör. `villa.title`) olduğu
 * gibi geçirir; bu fonksiyon saf (pure), DB'ye dokunmaz.
 */
export function resolveTranslatedField<T>(
  translatedValue: string | null | undefined,
  parentValue: T
): T | string {
  if (typeof translatedValue === "string" && translatedValue.trim() !== "") {
    return translatedValue;
  }
  return parentValue;
}
