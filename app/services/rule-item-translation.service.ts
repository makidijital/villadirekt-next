import { translationRepository } from "@/lib/db/translation.repository.server";
import type { RuleItemTranslationRow } from "@/lib/i18n/translations.types";

/**
 * 🛡️ PHASE 10D — Batch 1 — Kural (rule_items) Çeviri Servisi
 *
 * `app/services/villa-translation.service.ts` (Phase 10A) ile BİREBİR
 * AYNI desen — aynı gerekçeler
 * (🛡️ PHASE 10I: bu satır daha önce `villa-location-translation.
 * service.ts`'e atıfta bulunuyordu; o dosya KALDIRILDI — bölge
 * adları özel isimdir, çevrilmez) (paylaşılan taxonomy, `/maki-admin/
 * rules` sayfasından çağrılır, villa orchestration'a bağlanmaz, parent
 * existence pre-check yok — `rule-item.repository.ts`'de tekil
 * `findById` YOK, FK constraint hatası generic mesaja çevrilir).
 *
 * ⚠️ Çevrilebilir kolon `title` (`name` DEĞİL — migration 082'nin
 * "villa_rules" → gerçek tablo `rule_items` doğrulama notuyla tutarlı).
 */

export type WritableTranslationLocale = "en" | "de";

function isWritableLocale(value: unknown): value is WritableTranslationLocale {
  return value === "en" || value === "de";
}

export type RuleTranslationInput = {
  ruleId: string;
  locale: string;
  title: string;
};

export type RuleTranslationResult =
  | { ok: true; row: RuleItemTranslationRow }
  | { ok: false; error: string };

export type RuleTranslationsListResult =
  | { ok: true; rows: RuleItemTranslationRow[] }
  | { ok: false; error: string };

function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getRuleTranslations(
  ruleId: string
): Promise<RuleTranslationsListResult> {
  const id = (ruleId ?? "").toString().trim();
  if (!id) return { ok: false, error: "Geçersiz kural" };

  const { data, error } = await translationRepository.findAllForParent(
    "rule_item",
    id
  );
  if (error) return { ok: false, error: "Çeviriler okunamadı" };

  const rows = (data || []).filter((row) => isWritableLocale(row.locale));
  return { ok: true, rows };
}

export async function upsertRuleTranslation(
  input: RuleTranslationInput
): Promise<RuleTranslationResult> {
  const ruleId = (input.ruleId ?? "").toString().trim();
  if (!ruleId) return { ok: false, error: "Geçersiz kural" };

  if (!isWritableLocale(input.locale)) {
    return { ok: false, error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir" };
  }
  const locale = input.locale;

  const title = normalize(input.title);
  if (!title) return { ok: false, error: "Başlık gerekli" };

  const { data, error } = await translationRepository.upsertOne(
    "rule_item",
    ruleId,
    locale,
    { title }
  );

  if (error || !data) return { ok: false, error: "Çeviri kaydedilemedi" };
  return { ok: true, row: data };
}
