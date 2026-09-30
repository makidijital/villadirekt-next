import "server-only";

import { dbNative as db } from "./native";
import type { Locale } from "@/lib/i18n/config";
import {
  TRANSLATION_ENTITY_CONFIG,
  type TranslationEntity,
  type TranslationRowFor,
} from "@/lib/i18n/translations.types";

/* ===============================================================
   🛡️ TRANSLATION REPOSITORY — PHASE 3 (Database Translation Architecture)
   ===============================================================
   migration 082'deki 9 çeviri tablosu için TEK, generic repository.
   Proje konvansiyonu her tablo için ayrı bir dosya (villa-location.
   repository.server.ts, villa-type.repository.ts, vb.) olsa da, bu 9
   tablo YAPISAL OLARAK BİREBİR aynı (parent_id + locale + çevrilebilir
   alanlar) — 9 ayrı dosya sırf symmetry için gereksiz tekrar olurdu.
   Bunun yerine TRANSLATION_ENTITY_CONFIG registry'sinden (lib/i18n/
   translations.types.ts) beslenen, tip-güvenli TEK bir modül.

   `dbNative.from(table)` zaten her repository'nin kullandığı AYNI
   generic query builder (lib/db/native.ts) — burada da string tablo
   adı yalnız bu dosyanın kendi sabit registry'sinden gelir (kullanıcı
   girdisi asla `table`/`parentIdColumn` olarak geçilmez).

   ⚠️ `findOne`/`findAllForParent` (Phase 3) için HİÇBİR CALL-SITE
   YOK — mevcut villa/location/type/feature/rule/price-include/
   distance/page/faq repository'lerinin davranışı, public render'ı
   ve cache'i bu dosyadan HİÇ ETKİLENMEZ.

   🛡️ PHASE 8D-1 EKLEMESİ — `findManyForLocale`: "birden fazla parent,
   TEK locale" için batch okuma (Phase 8D audit'inin tespit ettiği N+1
   riskine altyapı — audit: villa detail'in location/features/rules/
   priceIncludes/distances koleksiyon alanları, EN/DE'ye eklenirse,
   her öğe için ayrı `findOne` çağrılırsa N+1'e yol açardı). Bu method
   da HENÜZ HİÇBİR CALL-SITE tarafından kullanılmıyor — EN/DE villa
   detail sayfalarına location/features/rules/priceIncludes/distances
   BU FAZDA EKLENMEDİ (Phase 8D audit'in "NEEDS AUDIT/FIX BEFORE"
   kararının render-hedefi-yok bulgusu HÂLÂ GEÇERLİ). Yalnız `.in()` +
   `.eq("locale", ...)` — mevcut `QueryBuilder`/`dbNative` primitive'i
   (proje genelinde zaten kanıtlanmış, ör. villa.repository.server.ts),
   yeni bir eski sağlayıcı/PostgREST syntax veya DB katmanı YOK.
   =============================================================== */

export const translationRepository = {
  /** Bir parent kaydın TEK bir locale'deki çevirisi (varsa). */
  async findOne<E extends TranslationEntity>(
    entity: E,
    parentId: string,
    locale: Locale
  ) {
    const { table, parentIdColumn } = TRANSLATION_ENTITY_CONFIG[entity];
    return db
      .from<TranslationRowFor<E>>(table)
      .select("*")
      .eq(parentIdColumn, parentId)
      .eq("locale", locale)
      .maybeSingle();
  },

  /** Bir parent kaydın TÜM locale çevirileri (varsa — 0..3 satır). */
  async findAllForParent<E extends TranslationEntity>(
    entity: E,
    parentId: string
  ) {
    const { table, parentIdColumn } = TRANSLATION_ENTITY_CONFIG[entity];
    return db
      .from<TranslationRowFor<E>>(table)
      .select("*")
      .eq(parentIdColumn, parentId);
  },

  /**
   * 🛡️ PHASE 8D-1 — Birden fazla parent kaydın, TEK bir locale'deki
   * çevirileri (0..N satır) — TEK sorguda (`findOne`'ı N kez çağırmanın
   * N+1'ine karşı). `parentIds` boşsa DB'ye HİÇ gidilmez (SQL'de
   * `IN ()` zaten geçersizdir — `query-compiler.ts` bunu `FALSE`'a
   * düşürür, ama burada bir adım önde, gereksiz round-trip'in kendisi
   * atlanır) — `{ data: [], error: null }`, `findOne`/`findAllForParent`
   * ile AYNI `{ data, error }` zarfı (`DbResult<T>` — `native-db.
   * provider.ts`), yalnız erken/senkron.
   *
   * `.in(parentIdColumn, parentIds)` + `.eq("locale", locale)` —
   * `QueryBuilder`'ın mevcut, projede zaten kanıtlanmış primitive'leri
   * (ör. villa.repository.server.ts, reservation.repository.ts).
   * Yeni bir DB katmanı/eski sağlayıcı/PostgREST syntax'ı YOK; `findOne`/
   * `findAllForParent`'a DOKUNULMADI.
   */
  async findManyForLocale<E extends TranslationEntity>(
    entity: E,
    parentIds: readonly string[],
    locale: Locale
  ) {
    if (parentIds.length === 0) {
      return { data: [] as TranslationRowFor<E>[], error: null };
    }
    const { table, parentIdColumn } = TRANSLATION_ENTITY_CONFIG[entity];
    return db
      .from<TranslationRowFor<E>>(table)
      .select("*")
      .in(parentIdColumn, parentIds)
      .eq("locale", locale);
  },

  /**
   * 🛡️ PHASE 10A — Bir parent kaydın TEK bir locale'deki çevirisini
   * UPSERT eder (varsa günceller, yoksa oluşturur). Migration 082'nin
   * `UNIQUE(<parent>_id, locale)` constraint'i onConflict hedefi olarak
   * kullanılır (örn. villa → "villa_id,locale").
   *
   * ⚠️ BUSINESS VALIDATION BURADA YAPILMAZ (locale whitelist, parent
   * existence, alan uzunlukları vb.) — bu, caller'ın sorumluluğu (bkz.
   * app/services/villa-translation.service.ts). Bu metod yalnız DB
   * yazma primitive'i; `findOne`/`findAllForParent`/`findManyForLocale`
   * DEĞİŞMEDİ.
   *
   * `.insert(payload).select("*").single()` deseni (external-calendar-
   * source.repository.ts'in `insert` metodu — "yaz + satırı geri al")
   * ile AYNI prensip; `.upsert()` zaten native query builder'ın
   * kanıtlanmış primitive'i (exchange-rate.repository.server.ts,
   * external-calendar-event.repository.server.ts).
   */
  async upsertOne<E extends TranslationEntity>(
    entity: E,
    parentId: string,
    locale: Locale,
    fields: Record<string, unknown>
  ) {
    const { table, parentIdColumn } = TRANSLATION_ENTITY_CONFIG[entity];
    return db
      .from<TranslationRowFor<E>>(table)
      .upsert(
        { [parentIdColumn]: parentId, locale, ...fields },
        { onConflict: `${parentIdColumn},locale` }
      )
      .select("*")
      .single();
  },
};
