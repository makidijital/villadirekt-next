import "server-only";

import { cache } from "react";

import { getTranslation, resolveTranslatedField } from "@/lib/i18n/get-translation.server";
import type { Locale } from "@/lib/i18n/config";
import { stripHtml } from "@/lib/html-sanitize";

/* ===============================================================
   🛡️ VILLA TITLE + DESCRIPTION + SEO_DESCRIPTION TRANSLATION OVERLAY
   — PHASE 6B / 8B / 8C
   ===============================================================
   AMAÇ: Phase 5'in generic `getTranslation()`'ının üzerine, villa
   `title` (Phase 6B), `description` (Phase 8B) ve EN/DE
   `generateMetadata` için `seo_description` (Phase 8C) alanları
   için ince, villa'ya özgü bir okuma katmanı. Badge/seo_title HÂLÂ
   KAPSAM DIŞI — bu dosyaya eklenmedi (Phase 8C görev tanımı:
   "SADECE seo_description", seo_title zaten shipped title fallback
   zincirine dokunacağı için AYRI, gelecek bir fazın konusu — bkz.
   Phase 8C audit raporu "🔴 seo_title" riski).

   DOKUNULMAYANLAR (bilinçli):
     - `app/services/villa.service.ts` / `mapVilla` — HİÇ import
       edilmiyor, HİÇ çağrılmıyor. Bu dosya `VillaDTO`'yu üretmez,
       yalnız (villaId, orijinal title, locale) alıp NİHAİ gösterilecek
       title string'ini döner. Villa'nın kendisi ÇAĞIRAN TARAFTA
       (EN/DE page.tsx) zaten mevcut `getVillaBySlug` ile okunur.
     - `lib/cache.helpers.ts` / `unstable_cache` — YOK. Bu dosya
       Next.js Data Cache'e HİÇ dokunmuyor (Phase 6A audit'inin
       Bölüm 5 bulgusu: unstable_cache'li fonksiyonlara locale
       eklemek çapraz-dil cache sızıntısı riski taşıyor — bu yüzden
       KAÇINILDI).
     - `getVillaBySlugCached` (kiralik-villa/[slug]/page.tsx'e ÖZEL,
       export edilmiyor) — bu dosyadan hiç erişilmiyor/değiştirilmiyor.

   MEKANİZMA — React `cache()` (request-scoped dedupe):
     Projenin zaten kullandığı AYNI primitive (bkz.
     `getVillaBySlugCached = cache((slug) => getVillaBySlug(slug))`,
     kiralik-villa/[slug]/page.tsx:154; ayrıca Phase 4B'nin
     `request-locale.server.ts`'i). Yalnız ASIL DB okuyan adım
     (`getTranslation` çağrısı) `cache()` ile sarılır — `resolveTranslatedField`
     saf/senkron olduğu için sarmaya gerek yok. Bu, aynı (villaId, locale)
     ikilisi bir request içinde birden çok yerden istenirse (bu fazda
     tek call-site var; ileride generateMetadata da eklenirse) TEK
     translation sorgusu paylaşılmasını sağlar — Next.js'in GERÇEK bir
     RSC request render'ı içindeki request-scoped dispatcher'ı sayesinde;
     Vitest/Node ortamında bu memoize ETMEZ (bkz. request-locale.server.ts
     ve bu dosyanın testindeki mock — aynı, kanıtlanmış desen).

   FALLBACK: `getTranslation` zaten TR için sorgu atmıyor (Phase 5).
   Çeviri satırı yoksa/`title` boşsa `resolveTranslatedField` orijinal
   `villa.title`'a düşer — mevcut Türkçe davranışla birebir.
   =============================================================== */

const getVillaTranslationCached = cache(
  (villaId: string, locale: Locale) => getTranslation("villa", villaId, locale)
);

/* 🛡️ VİLLA ADI (title) ÇEVİRİSİ KALDIRILDI — villa adı özel isimdir ve
   her locale'de canonical `villa.title` olarak gösterilir. Bu dosyadaki
   diğer getter'lar (description / seo_description / badge / seo_title)
   DEĞİŞMEDİ ve aynı cache'lenmiş satırı paylaşmaya devam eder. */

/**
 * 🛡️ PHASE 8B — Bir villanın, verilen locale için GÖSTERİLECEK
 * description'ını (ham/sanitize EDİLMEMİŞ HTML) döner.
 *   - `locale` TR'ye çözümleniyorsa → `originalDescription` (sorgu YOK).
 *   - Çeviri satırı yoksa / `description` kolonu boşsa/whitespace ise →
 *     `originalDescription`.
 *   - DB hatası olursa → `originalDescription` (getTranslation zaten
 *     throw etmez, hatayı null'a indirger — burada da asla exception
 *     fırlatmaz, sayfa render'ını ASLA çökertmez).
 *   - Aksi halde → çevrilmiş description.
 *
 * PERF (Phase 8B'nin en önemli kısıtı): diğer getter'larla BİREBİR AYNI `getVillaTranslationCached(villaId, locale)` çağrısını
 * reuse eder — description için AYRI bir `getTranslation`/DB sorgusu
 * EKLENMEZ. Bir request içinde title + description ikisi de istenirse
 * (EN/DE villa detay page.tsx'in bu fazdaki kullanımı tam olarak
 * budur), React `cache()` aynı (villaId, locale) argümanları için TEK
 * `getTranslation("villa", ...)` sorgusunu paylaşır (Next.js'in GERÇEK
 * RSC request-scoped dispatcher'ı içinde — Vitest/Node'da bu memoize
 * ETMEZ, bkz. dosya başı yorum, Phase 4B/6B ile AYNI kısıt).
 *
 * Sanitize/strip BURADA YAPILMAZ — bu fonksiyon saf metin/HTML döner;
 * çağıran taraf (page.tsx) mevcut `sanitizeHtml`/`stripHtml` akışını
 * DEĞİŞTİRMEDEN, dönen değeri oraya geçirir (TR sayfasıyla AYNI
 * sanitize mekanizması).
 */
export async function getVillaTranslatedDescription(
  villaId: string,
  originalDescription: string,
  locale: Locale
): Promise<string> {
  const translation = await getVillaTranslationCached(villaId, locale);
  return resolveTranslatedField(translation?.description, originalDescription);
}

/**
 * 🛡️ PHASE 8C — TR page.tsx'teki private `makeExcerpt`'in (satır ~145,
 * export EDİLMEMİŞ — başka bir yerden import EDİLEMEZ, bu yüzden
 * BİREBİR AYNI mantıkla burada, bu dosyaya ÖZEL bir private kopya
 * olarak tutulur; yeni bir paylaşılan utility/dosya OLUŞTURULMADI,
 * TR dosyasına DOKUNULMADI) BİREBİR AYNISI. Yalnız
 * `getVillaTranslatedSeoDescription` tarafından kullanılır.
 */
function makeExcerpt(text: string | undefined, max = 160): string {
  const clean = (text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

/**
 * 🛡️ PHASE 8C — Bir villanın, verilen locale için EN/DE
 * `generateMetadata`'da kullanılacak SEO description'ını döner.
 *
 *   - `locale === "tr"` → sorgu ATILMAZ (bu dalın gerçek çağıranı
 *     bugün YOK — EN/DE generateMetadata'sı bu fonksiyonu her zaman
 *     "en"/"de" ile çağırıyor; bu dal yalnız defensive/simetrik
 *     tamlık için var, title/description helper'larının TR
 *     davranışıyla aynı ilkeyle). TR'nin KENDİ
 *     `app/(public)/kiralik-villa/[slug]/page.tsx` `generateMetadata`'sındaki
 *     BİREBİR AYNI mantık: `originalSeoDescription` doluysa (trim
 *     edilmiş) onu, değilse `originalDescription`'dan 160 karakterlik
 *     excerpt'i döner. TR sayfası bu fonksiyonu HİÇ ÇAĞIRMIYOR/
 *     İTHAL ETMİYOR — kendi inline mantığını kullanmaya devam ediyor
 *     (bu dosya TR'ye YENİ bir bağımlılık EKLEMEZ).
 *   - EN/DE: `getVillaTranslatedDescription`
 *     ile BİREBİR AYNI `getVillaTranslationCached(villaId, locale)`
 *     çağrısını reuse eder — AYRI bir DB sorgusu EKLENMEZ.
 *     `translation.seo_description` dolu/whitespace-olmayan bir
 *     string'se AYNEN döner. Aksi halde (çeviri satırı hiç yok VEYA
 *     `seo_description` kolonu boş/whitespace VEYA DB hatası —
 *     `getTranslation` zaten hatayı `null`'a indirger, burada asla
 *     throw edilmez) çevrilmiş description'dan (`resolveTranslatedField`
 *     ile — yoksa orijinal `originalDescription`'a düşer) 160
 *     karakterlik excerpt üretilir (`stripHtml` + yukarıdaki private
 *     `makeExcerpt` — TR'nin `makeExcerpt(stripHtml(villa.description), 160)`
 *     çağrısıyla BİREBİR AYNI iki adımlı pipeline).
 *
 * `openGraph`/`twitter` alanlarına BURADA hiçbir şey eklenmez —
 * bu yalnız `generateMetadata`'nın `description` alanı için saf bir
 * string üretici; hangi metadata alanlarına yazılacağına ÇAĞIRAN
 * TARAF (page.tsx) karar verir.
 */
export async function getVillaTranslatedSeoDescription(
  villaId: string,
  originalSeoDescription: string | null | undefined,
  originalDescription: string,
  locale: Locale
): Promise<string> {
  if (locale === "tr") {
    const trimmedOwn = originalSeoDescription?.trim();
    if (trimmedOwn) return trimmedOwn;
    return makeExcerpt(stripHtml(originalDescription), 160);
  }

  const translation = await getVillaTranslationCached(villaId, locale);

  const translatedSeoDescription = translation?.seo_description;
  if (
    typeof translatedSeoDescription === "string" &&
    translatedSeoDescription.trim() !== ""
  ) {
    return translatedSeoDescription;
  }

  const translatedDescription = resolveTranslatedField(
    translation?.description,
    originalDescription
  );
  return makeExcerpt(stripHtml(translatedDescription), 160);
}

/**
 * 🛡️ PHASE 10B — Bir villanın, verilen locale için GÖSTERİLECEK
 * badge'ini döner. `getVillaTranslatedDescription`
 * ile BİREBİR AYNI desen — AYNI `getVillaTranslationCached(villaId, locale)`
 * çağrısını reuse eder (AYRI bir DB sorgusu EKLENMEZ).
 *   - `locale` TR'ye çözümleniyorsa → `originalBadge` (sorgu YOK).
 *   - Çeviri satırı yoksa / `badge` kolonu boş/whitespace ise →
 *     `originalBadge`.
 *   - DB hatası olursa → `originalBadge` (asla throw etmez).
 * `originalBadge` null/undefined olabilir (villa.badge nullable) —
 * bu durumda `resolveTranslatedField` `parentValue` tipini AYNEN
 * korur (null kalır, boş string'e ZORLANMAZ).
 */
export async function getVillaTranslatedBadge(
  villaId: string,
  originalBadge: string | null | undefined,
  locale: Locale
): Promise<string | null | undefined> {
  const translation = await getVillaTranslationCached(villaId, locale);
  return resolveTranslatedField(translation?.badge, originalBadge);
}

/**
 * 🛡️ PHASE 10B — Bir villanın, verilen locale için `seo_title`
 * çevirisini döner. `getVillaTranslatedBadge` ile AYNI desen — AYNI
 * `getVillaTranslationCached(villaId, locale)` çağrısını reuse eder.
 *   - `locale` TR'ye çözümleniyorsa → `originalSeoTitle` (sorgu YOK).
 *   - Çeviri satırı yoksa / `seo_title` kolonu boş/whitespace ise →
 *     `originalSeoTitle`.
 *   - DB hatası olursa → `originalSeoTitle` (asla throw etmez).
 * `generateMetadata`'nın `title` alanına NASIL bağlanacağına (veya
 * bağlanıp bağlanmayacağına) ÇAĞIRAN TARAF karar verir — bu fonksiyon
 * yalnız saf bir okuma/fallback katmanı.
 */
export async function getVillaTranslatedSeoTitle(
  villaId: string,
  originalSeoTitle: string | null | undefined,
  locale: Locale
): Promise<string | null | undefined> {
  const translation = await getVillaTranslationCached(villaId, locale);
  return resolveTranslatedField(translation?.seo_title, originalSeoTitle);
}
