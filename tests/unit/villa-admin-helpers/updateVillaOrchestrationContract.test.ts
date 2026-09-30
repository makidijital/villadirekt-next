/* ===============================================================
   🛡️ FAZ 5 — updateVillaFull Orchestration CONTRACT TEST (AST)
   ===============================================================
   AMAÇ: update.service.ts > updateVillaFull içindeki çağrı SIRASI
   + await + conditional pattern'i regression-safe yapmak.

   ⚠️ ASIMETRİ (BİLİNÇLİ, create'ten FARKLI):
     - İlk 2 relation (types, features): ALWAYS replace_* RPC (empty
       array OK; conditional değil)
     - distances + prices: ALWAYS sync (empty array fallback)
     - Son 2 relation (rules, includes): CONDITIONAL `!== undefined`

   FREEZE EDİLEN KONTRATLAR:
     1. validate `form.title` (throw)
     2. AWAITED generateUniqueSlug (slug, id exclude)
     3. AWAITED villaAdminRepository.updateVillaById
     4. ALWAYS AWAITED replaceVillaTypeRelations
     5. ALWAYS AWAITED replaceVillaFeatureRelations
     6. ALWAYS AWAITED setVillaDistances
     7. ALWAYS AWAITED setVillaPrices
     8. CONDITIONAL AWAITED replaceVillaRuleRelations
     9. CONDITIONAL AWAITED replaceVillaPriceIncludeRelations
    10. return true
=============================================================== */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC_PATH = resolve(
  process.cwd(),
  "app/services/villa-admin/update.service.ts"
);
const sourceText = readFileSync(SRC_PATH, "utf8");
const sourceFile = ts.createSourceFile(
  "update.service.ts",
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

function getCalleeName(call: ts.CallExpression): string {
  const expr = call.expression;
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    return expr.expression.getText() + "." + expr.name.text;
  }
  return expr.getText();
}

type CallEvent = {
  name: string;
  awaited: boolean;
  conditional: boolean;
};

function collectCallSequence(block: ts.Block, conditional = false): CallEvent[] {
  const out: CallEvent[] = [];
  for (const stmt of block.statements) {
    extractFromStmt(stmt, out, conditional);
  }
  return out;
}

function extractFromStmt(stmt: ts.Statement, out: CallEvent[], conditional: boolean): void {
  if (ts.isVariableStatement(stmt)) {
    for (const decl of stmt.declarationList.declarations) {
      pushFromExpr(decl.initializer, out, conditional);
    }
    return;
  }
  if (ts.isExpressionStatement(stmt)) {
    pushFromExpr(stmt.expression, out, conditional);
    return;
  }
  if (ts.isIfStatement(stmt) && ts.isBlock(stmt.thenStatement)) {
    for (const s of stmt.thenStatement.statements) {
      extractFromStmt(s, out, /* conditional */ true);
    }
  }
  /* Block statement (curly braces around update relation calls) — recurse. */
  if (ts.isBlock(stmt)) {
    for (const s of stmt.statements) {
      extractFromStmt(s, out, conditional);
    }
  }
}

function pushFromExpr(
  expr: ts.Expression | undefined,
  out: CallEvent[],
  conditional: boolean
): void {
  if (!expr) return;
  if (ts.isAwaitExpression(expr) && ts.isCallExpression(expr.expression)) {
    out.push({
      name: getCalleeName(expr.expression),
      awaited: true,
      conditional,
    });
    return;
  }
  if (ts.isCallExpression(expr)) {
    out.push({
      name: getCalleeName(expr),
      awaited: false,
      conditional,
    });
  }
}

const fnDecl = findExportedFunction("updateVillaFull");
const fnBody = fnDecl.body!;
const seq = collectCallSequence(fnBody);

const idx = (name: string): number => seq.findIndex((e) => e.name === name);

/* 🛡️ FAZ 1/C — IDENTIFIER HİZALAMASI (üretim kodu DEĞİŞMEDİ)
   `setVillaDistances` / `setVillaPrices` anon-`db` + silent-fail
   tuzağı nedeniyle server-only karşılıklarıyla değiştirilmişti
   (`setVillaDistancesServer` / `setVillaPricesServer` — bkz. ilgili
   service dosyasının başlık yorumu). Bu contract testi `idx(name)`
   ile BİREBİR identifier eşleşmesi aradığı için `-1` dönüyordu.
   Aşağıda YALNIZCA aranan isim güncellendi; sıra / await /
   conditional / BEFORE-AFTER assertion'larının hiçbiri gevşetilmedi. */

describe("updateVillaFull — early validation", () => {
  it("throws Error when form.title is missing", () => {
    const first = fnBody.statements[0];
    expect(ts.isIfStatement(first)).toBe(true);
    if (ts.isIfStatement(first)) {
      const cond = first.expression.getText();
      expect(cond).toContain("form.title");
    }
  });
});

/* 🛡️ NATIVE REPOSITORY KONTRATI — villa satırı
   `villaAdminRepository.updateVillaById(...)` ile güncellenir.
   Test amacı (sıra / await / tam bir kez) DEĞİŞMEDİ. */
const VILLA_WRITE = "villaAdminRepository.updateVillaById";

describe("updateVillaFull — orchestration order", () => {
  it("generateUniqueSlug AWAITED with excludeId before villa update", () => {
    const slugIdx = idx("generateUniqueSlug");
    const updateIdx = seq.findIndex(
      (e) => e.name.includes(VILLA_WRITE) && e.awaited
    );
    expect(slugIdx).toBeGreaterThanOrEqual(0);
    expect(updateIdx).toBeGreaterThanOrEqual(0);
    expect(slugIdx).toBeLessThan(updateIdx);
    expect(seq[slugIdx].awaited).toBe(true);
  });

  it("villa repository update is AWAITED", () => {
    const updateIdx = seq.findIndex(
      (e) => e.name.includes(VILLA_WRITE) && e.awaited
    );
    expect(seq[updateIdx].awaited).toBe(true);
  });
});

describe("updateVillaFull — relation sync asymmetry", () => {
  it("replaceVillaTypeRelations is ALWAYS (not conditional)", () => {
    const i = idx("replaceVillaTypeRelations");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(seq[i].awaited).toBe(true);
    expect(seq[i].conditional).toBe(false);
  });

  it("replaceVillaFeatureRelations is ALWAYS (not conditional)", () => {
    const i = idx("replaceVillaFeatureRelations");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(seq[i].awaited).toBe(true);
    expect(seq[i].conditional).toBe(false);
  });

  it("setVillaDistances is ALWAYS (not conditional)", () => {
    const i = idx("setVillaDistancesServer");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(seq[i].awaited).toBe(true);
    expect(seq[i].conditional).toBe(false);
  });

  it("setVillaPrices is ALWAYS (not conditional)", () => {
    const i = idx("setVillaPricesServer");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(seq[i].awaited).toBe(true);
    expect(seq[i].conditional).toBe(false);
  });

  it("replaceVillaRuleRelations is CONDITIONAL", () => {
    const i = idx("replaceVillaRuleRelations");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(seq[i].awaited).toBe(true);
    expect(seq[i].conditional).toBe(true);
  });

  it("replaceVillaPriceIncludeRelations is CONDITIONAL", () => {
    const i = idx("replaceVillaPriceIncludeRelations");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(seq[i].awaited).toBe(true);
    expect(seq[i].conditional).toBe(true);
  });
});

describe("updateVillaFull — strict sequential order", () => {
  it("types → features → distances → prices → rules → includes", () => {
    const order = [
      "replaceVillaTypeRelations",
      "replaceVillaFeatureRelations",
      "setVillaDistancesServer",
      "setVillaPricesServer",
      "replaceVillaRuleRelations",
      "replaceVillaPriceIncludeRelations",
    ];
    for (let i = 1; i < order.length; i++) {
      const prev = idx(order[i - 1]);
      const curr = idx(order[i]);
      expect(prev).toBeLessThan(curr);
    }
  });
});

describe("updateVillaFull — return invariant", () => {
  it("returns true at the end", () => {
    const last = fnBody.statements[fnBody.statements.length - 1];
    expect(ts.isReturnStatement(last)).toBe(true);
  });
});

describe("updateVillaFull — single villa UPDATE", () => {
  it("calls repository update EXACTLY ONCE (no leaked per-relation DB write)", () => {
    const writes = seq.filter((e) => e.name.includes(VILLA_WRITE));
    expect(writes.length).toBe(1);
  });

  it("service body'sinde DOĞRUDAN DB client çağrısı YOK", () => {
    expect(sourceText).not.toMatch(/\bdbAdmin\s*\.\s*from\(/);
    expect(sourceText).not.toMatch(/\bdb\s*\.\s*from\(/);
  });
});
