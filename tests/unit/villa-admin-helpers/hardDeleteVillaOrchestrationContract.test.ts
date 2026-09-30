/* ===============================================================
   🛡️ FAZ 5 — hardDeleteVilla Orchestration CONTRACT TEST (AST)
   ===============================================================
   AMAÇ: hard-delete.service.ts > hardDeleteVilla içindeki destructive
   flow'un SIRASI + Promise.all içerikini regression-safe yapmak.

   FREEZE EDİLEN KONTRATLAR:
     1. Early return when id is missing
     2. AWAITED cleanupVillaStorageForHardDelete (storage cleanup)
     3. AWAITED Promise.all([7 parallel DELETE]) — array içeriği sabit
     4. AWAITED final villa DELETE (repository: hardDeleteVillaById)
     5. SQLSTATE 23503 (FK) → TR explicit message
     6. return { ok: ... }

   🛡️ FAZ 3 — REPOSITORY MİMARİSİNE HİZALAMA (üretim kodu DEĞİŞMEDİ)
     FAZ 37'de ham `db.from("<tablo>").delete()` çağrıları
     `villaAdminRepository.*` metodlarına delege edildi. Bu testin eski
     hâli çağrı yerindeki TABLO ADI STRING'ini arıyordu; artık orada
     tablo adı geçmiyor. Assertion GEVŞETİLMEDİ — aksine güçlendirildi:
     çağrı yerinde repository METODU + ARGÜMAN + SIRA doğrulanıyor, VE
     her metodun `villa.repository.server.ts` içinde gerçekten hangi
     tabloyu sildiği AYRICA parse edilip 1:1 eşleştiriliyor. Yani
     "hangi tablo temizleniyor" garantisi kaybolmadı, kanıta bağlandı.

   ⚠️ PROMISE.ALL ARRAY CONTENT:
     7 ayrı repository DELETE çağrısı (her biri .eq("villa_id", id)):
       - villa_images
       - villa_feature_relations
       - villa_rule_relations
       - villa_price_include_relations
       - villa_type_relations
       - villa_distances
       - villa_prices
     (reservations / manual_reservations YOK — history korunur)
=============================================================== */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC_PATH = resolve(
  process.cwd(),
  "app/services/villa-admin/hard-delete.service.ts"
);
const sourceText = readFileSync(SRC_PATH, "utf8");
const sourceFile = ts.createSourceFile(
  "hard-delete.service.ts",
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS
);

function findExportedFunction(name: string): ts.FunctionDeclaration {
  let result: ts.FunctionDeclaration | null = null;
  function visit(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name &&
      node.body
    ) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!result) throw new Error(`${name} not found`);
  return result;
}

const fnDecl = findExportedFunction("hardDeleteVilla");
const fnBody = fnDecl.body!;

/* ---------------- Repository 1:1 eşleme doğrulayıcısı ----------------
   Çağrı yerinde tablo adı artık görünmediği için, repository metodunun
   GERÇEKTEN hangi tabloyu sildiğini kaynak koddan parse ederiz. Böylece
   "villa_images temizleniyor mu" sorusu hâlâ kanıtlanabilir kalır. */
const REPO_PATH = resolve(process.cwd(), "lib/db/villa.repository.server.ts");
const repoText = readFileSync(REPO_PATH, "utf8");

function repoDeleteTarget(method: string): { table: string; column: string } {
  const i = repoText.indexOf(`async ${method}(`);
  if (i < 0) throw new Error(`repository metodu bulunamadı: ${method}`);
  const body = repoText.slice(i, i + 800);
  const table = /\.from(?:<[^>]*>)?\(\s*"([a-z_]+)"\s*\)/.exec(body)?.[1];
  const column = /\.eq\(\s*"([a-z_]+)"/.exec(body)?.[1];
  if (!/\.delete\(\s*\)/.test(body)) {
    throw new Error(`${method} bir DELETE yapmıyor`);
  }
  if (!table || !column) throw new Error(`${method} parse edilemedi`);
  return { table, column };
}

/** Promise.all array'inde BEKLENEN sıra: repository metodu → tablo. */
const EXPECTED_RELATION_DELETES: ReadonlyArray<[method: string, table: string]> =
  [
    ["deleteVillaImagesByVillaId", "villa_images"],
    ["deleteVillaFeatureRelationsByVillaId", "villa_feature_relations"],
    ["deleteVillaRuleRelationsByVillaId", "villa_rule_relations"],
    ["deleteVillaPriceIncludeRelationsByVillaId", "villa_price_include_relations"],
    ["deleteVillaTypeRelationsByVillaId", "villa_type_relations"],
    ["deleteVillaDistancesByVillaId", "villa_distances"],
    ["deleteVillaPricesByVillaId", "villa_prices"],
  ];

/** Final villa satırı silme metodu. */
const FINAL_DELETE_METHOD = "hardDeleteVillaById";

/** `villaAdminRepository.<metod>(<arg>)` çağrısını çözer. */
function repoCallOf(
  node: ts.Node
): { method: string; args: string[] } | null {
  if (!ts.isCallExpression(node)) return null;
  const expr = node.expression;
  if (!ts.isPropertyAccessExpression(expr)) return null;
  if (expr.expression.getText() !== "villaAdminRepository") return null;
  return {
    method: expr.name.text,
    args: node.arguments.map((a) => a.getText()),
  };
}

/* ---------------- Tests ---------------- */

describe("hardDeleteVilla — early guard", () => {
  it("first statement returns when id is missing", () => {
    const first = fnBody.statements[0];
    expect(ts.isIfStatement(first)).toBe(true);
    if (ts.isIfStatement(first)) {
      const cond = first.expression.getText();
      expect(cond).toContain("id");
    }
  });
});

describe("hardDeleteVilla — destructive sequence", () => {
  it("calls cleanupVillaStorageForHardDelete AWAITED before Promise.all", () => {
    /* Sıra: storage cleanup → Promise.all → final villa DELETE.
       Final DELETE artık ham `db.from("villa").delete()` değil,
       `villaAdminRepository.hardDeleteVillaById(id)`. Tespit metod
       adından yapılır; hedef tablo aşağıdaki testte ayrıca kanıtlanır. */
    let cleanupIdx = -1;
    let promiseAllIdx = -1;
    let finalDeleteIdx = -1;

    fnBody.statements.forEach((stmt, idx) => {
      const text = stmt.getText();
      if (text.includes("cleanupVillaStorageForHardDelete")) cleanupIdx = idx;
      if (text.includes("Promise.all")) promiseAllIdx = idx;
      if (text.includes(`villaAdminRepository.${FINAL_DELETE_METHOD}(`))
        finalDeleteIdx = idx;
    });

    expect(cleanupIdx).toBeGreaterThanOrEqual(0);
    expect(promiseAllIdx).toBeGreaterThanOrEqual(0);
    expect(finalDeleteIdx).toBeGreaterThanOrEqual(0);
    expect(cleanupIdx).toBeLessThan(promiseAllIdx);
    expect(promiseAllIdx).toBeLessThan(finalDeleteIdx);
  });

  it("storage cleanup AWAITED ve `id` ile çağrılıyor", () => {
    /* EK GÜVENCE: cleanup'ın gerçekten await edildiğini ve doğru
       argümanı aldığını kanıtlar (eskiden yalnız metin araması vardı). */
    const cleanupStmts = fnBody.statements.filter((st) =>
      st.getText().includes("cleanupVillaStorageForHardDelete")
    );
    /* EXACTLY ONCE — destructive akışta tekrar eden cleanup olmamalı. */
    expect(cleanupStmts.length).toBe(1);
    const stmt = cleanupStmts[0];
    expect(ts.isExpressionStatement(stmt)).toBe(true);
    const expr = (stmt as ts.ExpressionStatement).expression;
    expect(ts.isAwaitExpression(expr)).toBe(true);
    const call = (expr as ts.AwaitExpression).expression;
    expect(ts.isCallExpression(call)).toBe(true);
    expect((call as ts.CallExpression).expression.getText()).toBe(
      "cleanupVillaStorageForHardDelete"
    );
    expect(
      (call as ts.CallExpression).arguments.map((a) => a.getText())
    ).toEqual(["id"]);
  });

  it("Promise.all contains EXACTLY 7 ilişkili tablo delete çağrısı", () => {
    /* AST'de Promise.all'ın array argümanını bul, element sayısını assert. */
    let promiseAllExpr: ts.CallExpression | null = null;
    function findPromiseAll(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText() === "Promise" &&
        node.expression.name.text === "all"
      ) {
        promiseAllExpr = node;
        return;
      }
      ts.forEachChild(node, findPromiseAll);
    }
    findPromiseAll(fnBody);
    expect(promiseAllExpr).toBeTruthy();

    if (promiseAllExpr) {
      const arr = (promiseAllExpr as ts.CallExpression).arguments[0];
      expect(ts.isArrayLiteralExpression(arr)).toBe(true);
      if (ts.isArrayLiteralExpression(arr)) {
        expect(arr.elements.length).toBe(7);
      }
    }
  });

  it("Promise.all array contains all 7 expected tables (no reservations)", () => {
    let promiseAllExpr: ts.CallExpression | null = null;
    function findPromiseAll(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText() === "Promise" &&
        node.expression.name.text === "all"
      ) {
        promiseAllExpr = node;
        return;
      }
      ts.forEachChild(node, findPromiseAll);
    }
    findPromiseAll(fnBody);

    const arr = (promiseAllExpr as unknown as ts.CallExpression).arguments[0];
    if (!ts.isArrayLiteralExpression(arr)) throw new Error("Expected array");

    /* Her element `villaAdminRepository.<metod>(id)` olmalı — metod adı,
       argüman VE sıra birebir; ayrıca her metodun repository'de gerçekten
       hangi tabloyu sildiği parse edilip 1:1 doğrulanır. */
    const calls = arr.elements.map((e) => repoCallOf(e));
    expect(calls.every((c) => c !== null)).toBe(true);

    expect(calls.map((c) => c!.method)).toEqual(
      EXPECTED_RELATION_DELETES.map(([method]) => method)
    );

    for (const c of calls) {
      expect(c!.args).toEqual(["id"]);
    }

    /* 1:1 EŞLEME: metod → gerçek tablo + villa_id filtresi. */
    const touchedTables: string[] = [];
    for (const [method, table] of EXPECTED_RELATION_DELETES) {
      const target = repoDeleteTarget(method);
      expect(target.table).toBe(table);
      expect(target.column).toBe("villa_id");
      touchedTables.push(target.table);
    }
    expect(touchedTables).toEqual(
      EXPECTED_RELATION_DELETES.map(([, table]) => table)
    );

    /* CRITICAL: reservations history korunmalı — ne çağrı metinlerinde
       ne de çözümlenen GERÇEK tablolarda bulunmamalı. */
    const allText = arr.elements.map((e) => e.getText()).join("|");
    expect(allText).not.toContain('"reservations"');
    expect(allText).not.toContain('"manual_reservations"');
    expect(touchedTables).not.toContain("reservations");
    expect(touchedTables).not.toContain("manual_reservations");
  });

  it("final villa DELETE happens AFTER Promise.all", () => {
    let promiseAllIdx = -1;
    let finalDeleteIdx = -1;

    fnBody.statements.forEach((stmt, idx) => {
      const text = stmt.getText();
      if (text.includes("Promise.all")) promiseAllIdx = idx;
      if (
        text.includes(`villaAdminRepository.${FINAL_DELETE_METHOD}(`) &&
        !text.includes("Promise.all")
      ) {
        finalDeleteIdx = idx;
      }
    });

    expect(promiseAllIdx).toBeGreaterThanOrEqual(0);
    expect(finalDeleteIdx).toBeGreaterThanOrEqual(0);
    expect(promiseAllIdx).toBeLessThan(finalDeleteIdx);
  });

  it("final DELETE gerçekten `villa` satırını siler (AWAITED, id ile)", () => {
    /* Eskiden bu, çağrı yerindeki `.from("villa").delete()` metninden
       okunuyordu. Repository delegasyonundan sonra aynı garanti iki
       parçadan kanıtlanır: (a) çağrı yeri metodu + argümanı,
       (b) metodun repository'deki gerçek DELETE hedefi. */
    const finalStmts = fnBody.statements.filter((st) =>
      st.getText().includes(`villaAdminRepository.${FINAL_DELETE_METHOD}(`)
    );
    /* EXACTLY ONCE — villa satırı yalnız bir kez silinmeli. */
    expect(finalStmts.length).toBe(1);

    const found: Array<{ method: string; args: string[] }> = [];
    function walk(node: ts.Node) {
      if (ts.isAwaitExpression(node) && ts.isCallExpression(node.expression)) {
        const c = repoCallOf(node.expression);
        if (c && c.method === FINAL_DELETE_METHOD) {
          found.push(c);
          return;
        }
      }
      ts.forEachChild(node, walk);
    }
    walk(finalStmts[0]);

    /* AWAITED + doğru metod + tek argüman `id` — hepsi tek assertion'da. */
    expect(found).toEqual([{ method: FINAL_DELETE_METHOD, args: ["id"] }]);

    const target = repoDeleteTarget(FINAL_DELETE_METHOD);
    expect(target.table).toBe("villa");
    expect(target.column).toBe("id");
  });
});

describe("hardDeleteVilla — SQLSTATE 23503 catch", () => {
  it("checks for code '23503' and returns FK-friendly TR message", () => {
    const fullText = fnBody.getText();
    expect(fullText).toContain('"23503"');
    expect(fullText).toContain("rezervasyon geçmişi");
  });
});

describe("hardDeleteVilla — return contract", () => {
  it("returns { ok: true } on success path", () => {
    const fullText = fnBody.getText();
    expect(fullText).toContain("ok: true");
    expect(fullText).toContain("ok: false");
  });
});
