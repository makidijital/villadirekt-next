/* ===============================================================
   🛡️ PHASE 10M — MIGRATION 084 ŞEMA TESTLERİ
   ===============================================================
   `settings-translations-schema.test.ts` (083) ile AYNI desen: canlı DB
   YOK; migration dosyasının SQL METNİ okunup yapısal beklentiler
   statik olarak doğrulanır.

   BU DOSYANIN İDDİALARI:
     1) 084 yalnız `settings_translations.maintenance_message` kolonunu
        DROP eder.
     2) `public.settings` tablosuna HİÇ DOKUNMAZ — canonical
        `settings.maintenance_message` ve `settings.address` KORUNUR.
     3) Kalan 3 çeviri kolonuna dokunulmaz.
     4) `get_public_settings` RPC'si, migration 082'nin tabloları ve
        paylaşılan `trg_touch_updated_at()` fonksiyonu ETKİLENMEZ.
     5) 🔒 REGRESYON KİLİDİ: migration 083 DEĞİŞTİRİLMEDİ.
=============================================================== */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const MIGRATIONS_DIR = join(process.cwd(), "db/migrations");
const PATH_084 = join(
  MIGRATIONS_DIR,
  "084_drop_settings_translation_maintenance_message.sql"
);
const PATH_083 = join(MIGRATIONS_DIR, "083_settings_translations.sql");

let sql = "";
/** Yorum satırları çıkarılmış SQL — "gerçekten çalışan" ifadeler. */
let code = "";
let sql083 = "";

beforeAll(() => {
  sql = readFileSync(PATH_084, "utf-8");
  code = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  sql083 = readFileSync(PATH_083, "utf-8");
});

describe("Migration 084 — numaralandırma", () => {
  it("1) 084 dosyası var ve numara çakışması yok", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
    expect(files.filter((f) => f.startsWith("084"))).toEqual([
      "084_drop_settings_translation_maintenance_message.sql",
    ]);
  });

  it("2) 🔒 migration 083 DEĞİŞTİRİLMEDİ — hâlâ 4 kolonu oluşturuyor", () => {
    expect(sql083).toMatch(/CREATE TABLE IF NOT EXISTS public\.settings_translations/);
    expect(sql083).toMatch(/\n\s+maintenance_message\s+text/);
    expect(sql083).not.toMatch(/DROP COLUMN/i);
  });
});

describe("Migration 084 — kapsam", () => {
  it("3) yalnız settings_translations.maintenance_message DROP edilir", () => {
    expect(code).toMatch(
      /ALTER TABLE public\.settings_translations\s*\n?\s*DROP COLUMN IF EXISTS maintenance_message;/
    );
  });

  it("4) TEK BİR DROP COLUMN ifadesi var", () => {
    expect(code.match(/DROP COLUMN/gi) || []).toHaveLength(1);
  });

  it("5) public.settings tablosuna HİÇ DOKUNULMAZ (canonical alanlar korunur)", () => {
    expect(code).not.toMatch(/ALTER TABLE public\.settings\b/i);
    expect(code).not.toMatch(/DROP TABLE/i);
    expect(code).not.toMatch(/UPDATE public\.settings\b/i);
    expect(code).not.toMatch(/DELETE FROM/i);
  });

  it("6) kalan 3 çeviri kolonuna DOKUNULMAZ", () => {
    for (const keep of [
      "footer_copyright",
      "default_meta_title",
      "default_meta_description",
    ]) {
      expect(code).not.toMatch(new RegExp(`DROP COLUMN IF EXISTS ${keep}`, "i"));
    }
  });

  it("7) address ile ilgili HİÇBİR DDL yok (zaten çeviri kolonu değildi)", () => {
    expect(code).not.toMatch(/\baddress\b/i);
  });

  it("8) RPC / 082 tabloları / paylaşılan trigger fonksiyonu etkilenmez", () => {
    expect(code).not.toMatch(/get_public_settings/i);
    expect(code).not.toMatch(/DROP FUNCTION/i);
    expect(code).not.toMatch(/trg_touch_updated_at/);
    expect(code).not.toMatch(/villa_translations|villa_type_translations|page_translations/);
  });

  it("9) constraint / index / trigger DDL'i yok (şema bütünlüğü korunur)", () => {
    expect(code).not.toMatch(/DROP CONSTRAINT/i);
    expect(code).not.toMatch(/DROP INDEX/i);
    expect(code).not.toMatch(/DROP TRIGGER/i);
  });

  it("10) BEGIN/COMMIT ile sarılı (tek transaction)", () => {
    expect(code).toMatch(/BEGIN;/);
    expect(code).toMatch(/COMMIT;/);
  });

  it("11) destructive olduğu ve veri kontrolü gerektiği dosyada YAZILI", () => {
    expect(sql).toMatch(/DESTRUCTIVE/i);
    expect(sql).toMatch(/VERİ KONTROLÜ/);
  });
});
