/* ===============================================================
   🛡️ PHASE 10L — MIGRATION 083 ŞEMA TESTLERİ
   ===============================================================
   `tests/unit/translation-schema.test.ts` (Phase 3) ile AYNI desen:
   canlı DB YOK; migration dosyasının SQL METNİ okunup yapısal
   beklentiler (tablo/kolon/FK/CHECK/UNIQUE/cascade) statik olarak
   doğrulanır.

   BU DOSYANIN ASIL İDDİASI (Phase 10L §2/§13):
     1) Tablo YALNIZ 4 çevrilebilir kolona sahip — secret/config
        kolonu içermiyor.
     2) `locale` CHECK'i YALNIZ ('en','de') — TR DB seviyesinde yasak.
     3) `UNIQUE (settings_id, locale)` — duplicate locale imkânsız.
     4) FK + ON DELETE CASCADE — referans bütünlüğü.
     5) Migration MEVCUT tablolara DOKUNMUYOR (ALTER/DROP/UPDATE yok).
=============================================================== */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const MIGRATIONS_DIR = join(process.cwd(), "db/migrations");
const MIGRATION_PATH = join(MIGRATIONS_DIR, "083_settings_translations.sql");

let sql = "";
/** Yorum satırları çıkarılmış SQL — "gerçekten çalışan" ifadeler. */
let code = "";

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf-8");
  code = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
});

describe("Migration 083 — numaralandırma", () => {
  it("1) 083 dosyası var ve numara çakışması yok", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
    const with083 = files.filter((f) => f.startsWith("083"));
    expect(with083).toEqual(["083_settings_translations.sql"]);
  });

  it("2) mevcut migration'lar (082 dahil) DEĞİŞTİRİLMEDİ — 083 onlara REFERANS verir, onları yeniden tanımlamaz", () => {
    /* 082'nin generic touch trigger fonksiyonu BURADA YENİDEN
       TANIMLANMAZ; yalnız varlığı kontrol edilip trigger bağlanır. */
    expect(code).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.trg_touch_updated_at/i);
    expect(code).toMatch(/EXECUTE FUNCTION public\.trg_touch_updated_at\(\)/);
  });
});

describe("Migration 083 — settings_translations şeması", () => {
  it("3) CREATE TABLE IF NOT EXISTS public.settings_translations", () => {
    expect(code).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.settings_translations/
    );
  });

  it("4) settings_id uuid NOT NULL REFERENCES public.settings (id) ON DELETE CASCADE", () => {
    expect(code).toMatch(
      /settings_id\s+uuid NOT NULL REFERENCES public\.settings \(id\) ON DELETE CASCADE/
    );
  });

  it("5) locale CHECK YALNIZ ('en','de') — 'tr' DB seviyesinde yasak", () => {
    expect(code).toMatch(/CHECK \(locale IN \('en', 'de'\)\)/);
    expect(code).not.toMatch(/CHECK \(locale IN \('tr'/);
  });

  it("6) UNIQUE (settings_id, locale) — duplicate locale engellenir", () => {
    expect(code).toMatch(/UNIQUE \(settings_id, locale\)/);
  });

  /* 🛡️ PHASE 10M NOTU — Bu dosya migration 083'ün SQL METNİNİ doğrular
     ve 083 DEĞİŞTİRİLMEDİ: gerçekten 4 kolon oluşturur. Bugünkü ETKİN
     şema 3 kolondur; `maintenance_message` migration 084 ile DROP
     edilir. 084'ün kendi testleri: settings-translations-084-schema.test.ts */
  it("7) 083 TAM OLARAK 4 çevrilebilir kolon oluşturur (084 bunu 3'e indirir)", () => {
    for (const field of [
      "footer_copyright",
      "maintenance_message",
      "default_meta_title",
      "default_meta_description",
    ]) {
      expect(code).toMatch(new RegExp(`\\n\\s+${field}\\s+text`));
    }
  });

  it("8) SECRET / CONFIG / KAPSAM DIŞI kolonlar YOK", () => {
    const forbidden = [
      "resend_api_key",
      "mail_from",
      "mail_from_name",
      "site_name",
      "phone",
      "email",
      "address",
      "hero_title",
      "hero_subtitle",
      "hero_badge_text",
      "hero_primary_cta_text",
      "hero_secondary_cta_text",
      "business_hours",
      "google_site_verification",
      "yandex_verification",
      "bing_verification",
      "custom_head_scripts",
      "analytics_script",
      "gtm_container_id",
      "prepayment_rate",
      "maintenance_mode",
    ];
    /* CREATE TABLE gövdesi içinde aranır (yorumlarda geçmesi serbest). */
    const body = code.slice(
      code.indexOf("CREATE TABLE IF NOT EXISTS public.settings_translations"),
      code.indexOf("COMMENT ON TABLE public.settings_translations")
    );
    expect(body.length).toBeGreaterThan(50);
    for (const col of forbidden) {
      expect(body).not.toMatch(new RegExp(`\\n\\s+${col}\\s`));
    }
  });

  it("9) touch trigger bağlı (updated_at otomatik)", () => {
    expect(code).toMatch(
      /CREATE TRIGGER settings_translations_touch_updated_at[\s\S]*BEFORE UPDATE ON public\.settings_translations/
    );
  });

  it("10) NON-DESTRUCTIVE — settings tablosuna ALTER/DROP/UPDATE/DELETE YOK", () => {
    expect(code).not.toMatch(/ALTER TABLE public\.settings\b/i);
    expect(code).not.toMatch(/DROP TABLE(?! IF EXISTS public\.settings_translations)/i);
    expect(code).not.toMatch(/UPDATE public\.settings\b/i);
    expect(code).not.toMatch(/DELETE FROM public\.settings\b/i);
    /* INSERT yok → TR backfill YOK (tablo boş başlar). */
    expect(code).not.toMatch(/INSERT INTO public\.settings_translations/i);
  });

  it("11) get_public_settings RPC'sine DOKUNULMADI (§5)", () => {
    expect(code).not.toMatch(/get_public_settings/i);
  });

  it("12) BEGIN/COMMIT ile sarılı (tek transaction)", () => {
    expect(code).toMatch(/BEGIN;/);
    expect(code).toMatch(/COMMIT;/);
  });
});
