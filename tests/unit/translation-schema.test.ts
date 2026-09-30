/* ===============================================================
   🛡️ PHASE 3 — DATABASE TRANSLATION ARCHITECTURE: MIGRATION SCHEMA TESTS
   ===============================================================
   Bu test dosyası CANLI bir DB bağlantısı KULLANMAZ (bu ortamdan
   production'a ağ erişimi yok — bkz. migration 082'nin başlık
   yorumu). Bunun yerine migration dosyasının SQL METNİNİ okuyup
   yapısal beklentileri (tablo/kolon/FK/CHECK/UNIQUE/cascade) statik
   olarak doğrular. Migration'ın gerçek DB'ye ETKİSİ bu testin
   kapsamı DIŞINDA — yalnız "migration dosyası ne söylüyor" test
   edilir.

   Mevcut price-engine / discount / pool-heating / reservation
   testlerine HİÇ dokunulmadı.
=============================================================== */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const MIGRATION_PATH = join(
  process.cwd(),
  "db/migrations/082_translation_tables.sql"
);

let sql = "";

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf-8");
});

/* Her tablo için: [tabloAdı, parentTablo, parentIdKolonu, beklenenAlanlar] */
const TABLES: Array<{
  table: string;
  parentTable: string;
  parentIdColumn: string;
  fields: string[];
}> = [
  {
    table: "villa_translations",
    parentTable: "public.villa",
    parentIdColumn: "villa_id",
    fields: ["title", "description", "badge", "seo_title", "seo_description"],
  },
  {
    table: "villa_location_translations",
    parentTable: "public.villa_locations",
    parentIdColumn: "location_id",
    fields: ["name"],
  },
  {
    table: "villa_type_translations",
    parentTable: "public.villa_types",
    parentIdColumn: "type_id",
    fields: ["name"],
  },
  {
    table: "villa_feature_translations",
    parentTable: "public.villa_features",
    parentIdColumn: "feature_id",
    fields: ["name"],
  },
  {
    table: "rule_item_translations",
    parentTable: "public.rule_items",
    parentIdColumn: "rule_id",
    fields: ["title"],
  },
  {
    table: "price_include_item_translations",
    parentTable: "public.price_include_items",
    parentIdColumn: "include_id",
    fields: ["title"],
  },
  {
    table: "villa_distance_translations",
    parentTable: "public.villa_distances",
    parentIdColumn: "distance_id",
    fields: ["title", "distance"],
  },
  {
    table: "page_translations",
    parentTable: "public.pages",
    parentIdColumn: "page_id",
    fields: ["title", "body", "excerpt", "seo_title", "seo_description"],
  },
  {
    table: "faq_translations",
    parentTable: "public.faqs",
    parentIdColumn: "faq_id",
    fields: ["question", "answer"],
  },
];

describe("Migration 082 — dosya mevcut ve additive", () => {
  it("migration dosyası okunabiliyor", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("BEGIN/COMMIT ile transaction-safe", () => {
    expect(sql).toMatch(/\bBEGIN;/);
    expect(sql).toMatch(/\bCOMMIT;/);
  });

  it("mevcut ana tablolara UPDATE/INSERT/ALTER TABLE ... ADD/DROP COLUMN YOK (additive-only)", () => {
    /* Yalnız CREATE TABLE / CREATE OR REPLACE FUNCTION / CREATE TRIGGER /
       COMMENT ON / DROP TRIGGER IF EXISTS (idempotent guard) beklenir. */
    expect(sql).not.toMatch(/\bUPDATE\s+public\./i);
    expect(sql).not.toMatch(/\bINSERT\s+INTO\s+public\.(villa|villa_locations|villa_types|villa_features|rule_items|price_include_items|villa_distances|pages|faqs)\b/i);
    expect(sql).not.toMatch(/\bALTER TABLE\s+public\.(villa|villa_locations|villa_types|villa_features|rule_items|price_include_items|villa_distances|pages|faqs)\b/i);
  });

  it("hiçbir yerde RLS/GRANT/REVOKE/anon/authenticated/service_role yok (native Postgres deseni)", () => {
    /* NOT: migration dosyasının başlık/açıklama YORUMLARI (`-- ...`), native
       Postgres deseninin GEREĞİNİ anlatırken bu kelimelerin kendisini meşru
       şekilde içerebilir (ör. "❌ RLS/GRANT/REVOKE YOK"). Bu test yalnız
       GERÇEK SQL İFADELERİNİ denetlemeli — `--` ile başlayan yorum satırları
       değerlendirmeden ÖNCE çıkarılır, aksi halde dosyanın kendi
       dokümantasyon metnine karşı yanlış-pozitif üretir. */
    const sqlWithoutLineComments = sql.replace(/--.*$/gm, "");

    expect(sqlWithoutLineComments).not.toMatch(/\bROW LEVEL SECURITY\b/i);
    expect(sqlWithoutLineComments).not.toMatch(/\bGRANT\b/i);
    expect(sqlWithoutLineComments).not.toMatch(/\bREVOKE\b/i);
    expect(sqlWithoutLineComments).not.toMatch(
      /\bTO\s+(anon|authenticated|service_role)\b/i
    );
  });
});

describe.each(TABLES)(
  "Migration 082 — $table",
  ({ table, parentTable, parentIdColumn, fields }) => {
    it(`CREATE TABLE IF NOT EXISTS public.${table} mevcut`, () => {
      expect(sql).toMatch(
        new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`)
      );
    });

    it(`id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, () => {
      const tableBlock = extractTableBlock(sql, table);
      expect(tableBlock).toMatch(
        /id\s+uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/
      );
    });

    it(`${parentIdColumn} → ${parentTable}(id) ON DELETE CASCADE`, () => {
      const tableBlock = extractTableBlock(sql, table);
      const fkPattern = new RegExp(
        `${parentIdColumn}\\s+uuid NOT NULL REFERENCES ${parentTable.replace(".", "\\.")} \\(id\\) ON DELETE CASCADE`
      );
      expect(tableBlock).toMatch(fkPattern);
    });

    it("locale text NOT NULL + CHECK (locale IN ('tr','en','de'))", () => {
      const tableBlock = extractTableBlock(sql, table);
      expect(tableBlock).toMatch(/locale\s+text NOT NULL/);
      expect(tableBlock).toMatch(/CHECK \(locale IN \('tr', 'en', 'de'\)\)/);
    });

    it(`UNIQUE (${parentIdColumn}, locale)`, () => {
      const tableBlock = extractTableBlock(sql, table);
      expect(tableBlock).toMatch(
        new RegExp(`UNIQUE \\(${parentIdColumn}, locale\\)`)
      );
    });

    it("created_at + updated_at timestamptz NOT NULL DEFAULT now()", () => {
      const tableBlock = extractTableBlock(sql, table);
      expect(tableBlock).toMatch(
        /created_at\s+timestamptz NOT NULL DEFAULT now\(\)/
      );
      expect(tableBlock).toMatch(
        /updated_at\s+timestamptz NOT NULL DEFAULT now\(\)/
      );
    });

    it("BEFORE UPDATE touch trigger tanımlı", () => {
      expect(sql).toMatch(
        new RegExp(`CREATE TRIGGER ${table}_touch_updated_at`)
      );
      expect(sql).toMatch(
        new RegExp(
          `BEFORE UPDATE ON public\\.${table}[\\s\\S]{0,80}EXECUTE FUNCTION public\\.trg_touch_updated_at\\(\\)`
        )
      );
    });

    for (const field of fields) {
      it(`çevrilebilir alan mevcut: ${field}`, () => {
        const tableBlock = extractTableBlock(sql, table);
        expect(tableBlock).toMatch(new RegExp(`\\b${field}\\s+text,?\\n`));
      });
    }

    it("id/slug/fiyat/tarih/sayı/boolean alanı YOK (yalnız metin + FK + locale + timestamp)", () => {
      const tableBlock = extractTableBlock(sql, table);
      expect(tableBlock).not.toMatch(/\bslug\b/);
      expect(tableBlock).not.toMatch(/\bprice\b/i);
      expect(tableBlock).not.toMatch(/\bboolean\b/i);
    });
  }
);

/** Migration dosyasından tek bir `CREATE TABLE ... ( ... );` bloğunu
 *  çıkarır (basit parantez dengesi ile — bu dosyanın kendi biçimine
 *  özel, genel bir SQL parser değil). */
function extractTableBlock(source: string, table: string): string {
  const startMarker = `CREATE TABLE IF NOT EXISTS public.${table} (`;
  const startIdx = source.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(`extractTableBlock: "${startMarker}" bulunamadı`);
  }
  let depth = 0;
  let i = startIdx + startMarker.length - 1; // '(' üzerinde başla
  for (; i < source.length; i++) {
    if (source[i] === "(") depth++;
    if (source[i] === ")") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  return source.slice(startIdx, i);
}
