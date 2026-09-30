/* ===============================================================
   🛡️ FAZ 5 — createVillaFull Orchestration CONTRACT TEST (AST)
   ===============================================================
   AMAÇ: create.service.ts > createVillaFull içindeki çağrı SIRASI
   + await + conditional pattern'i regression-safe yapmak.

   FREEZE EDİLEN KONTRATLAR:
     1. validate `form.title` (throw)
     2. AWAITED generateUniqueSlug (slug üretimi)
     3. AWAITED villaAdminRepository.insertVilla (villa row)
     4. CONDITIONAL await insertVillaTypeRelations (if selectedTypes?.length)
     5. CONDITIONAL await insertVillaFeatureRelations
     6. CONDITIONAL await setVillaDistancesServer
     7. CONDITIONAL await setVillaPricesServer
     8. CONDITIONAL await insertVillaRuleRelations
     9. CONDITIONAL await insertVillaPriceIncludeRelations
    10. return newId
=============================================================== */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC_PATH = resolve(
  process.cwd(),
  "app/services/villa-admin/create.service.ts"
);
const sourceText = readFileSync(SRC_PATH, "utf8");
const sourceFile = ts.createSourceFile(
  "create.service.ts",
  sourceText,
  ts.ScriptTarget.Latest,
  /* setParentNodes */ true,
  ts.ScriptKind.TS
);

/* ---------------- Helpers ---------------- */

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

/* ---------------- Extract ---------------- */
const fnDecl = findExportedFunction("createVillaFull");
const fnBody = fnDecl.body!;
const seq = collectCallSequence(fnBody);

const idx = (name: string): number => seq.findIndex((e) => e.name === name);

/* ---------------- Tests ---------------- */

/* 🛡️ FAZ 1/C — IDENTIFIER HİZALAMASI (üretim kodu DEĞİŞMEDİ)
   `setVillaDistances` / `setVillaPrices` anon-`db` + silent-fail
   tuzağı nedeniyle server-only karşılıklarıyla değiştirilmişti
   (`setVillaDistancesServer` / `setVillaPricesServer` — bkz. ilgili
   service dosyasının başlık yorumu). Bu contract testi `idx(name)`
   ile BİREBİR identifier eşleşmesi aradığı için `-1` dönüyordu.
   Aşağıda YALNIZCA aranan isim güncellendi; sıra / await /
   conditional / BEFORE-AFTER assertion'larının hiçbiri gevşetilmedi. */

describe("createVillaFull — early validation", () => {
  it("throws Error when form.title is missing (first statement)", () => {
    /* `if (!form.title) { throw new Error("Villa adı zorunlu"); }` */
    const first = fnBody.statements[0];
    expect(ts.isIfStatement(first)).toBe(true);
    if (ts.isIfStatement(first)) {
      const cond = first.expression.getText();
      expect(cond).toContain("form.title");
      const thenBlock = first.thenStatement;
      const hasThrow = ts.isBlock(thenBlock)
        ? thenBlock.statements.some(ts.isThrowStatement)
        : ts.isThrowStatement(thenBlock);
      expect(hasThrow).toBe(true);
    }
  });
});

/* 🛡️ NATIVE REPOSITORY KONTRATI
   Villa satırı artık `villaAdminRepository.insertVilla(...)` ile yazılır
   (native PostgreSQL). Test AMACI DEĞİŞMEDİ — sıra / await / "tam bir kez"
   invariantları aynen korunur; yalnız aranan çağrı adı gerçek
   implementasyona göre güncellendi. */
const VILLA_WRITE = "villaAdminRepository.insertVilla";

describe("createVillaFull — orchestration order", () => {
  it("calls generateUniqueSlug AWAITED before villa insert", () => {
    const slugIdx = idx("generateUniqueSlug");
    const insertIdx = seq.findIndex(
      (e) => e.name.includes(VILLA_WRITE) && e.awaited
    );
    expect(slugIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(slugIdx).toBeLessThan(insertIdx);
    expect(seq[slugIdx].awaited).toBe(true);
  });

  it("villa repository insert is AWAITED", () => {
    const insertIdx = seq.findIndex(
      (e) => e.name.includes(VILLA_WRITE) && e.awaited
    );
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(seq[insertIdx].awaited).toBe(true);
  });

  it("relation inserts are CONDITIONAL (.length > 0 guard)", () => {
    const relations = [
      "insertVillaTypeRelations",
      "insertVillaFeatureRelations",
      "insertVillaRuleRelations",
      "insertVillaPriceIncludeRelations",
    ];
    for (const name of relations) {
      const i = idx(name);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(seq[i].conditional).toBe(true);
      expect(seq[i].awaited).toBe(true);
    }
  });

  it("setVillaDistances is CONDITIONAL", () => {
    const i = idx("setVillaDistancesServer");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(seq[i].conditional).toBe(true);
    expect(seq[i].awaited).toBe(true);
  });

  it("setVillaPrices is CONDITIONAL", () => {
    const i = idx("setVillaPricesServer");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(seq[i].conditional).toBe(true);
    expect(seq[i].awaited).toBe(true);
  });

  it("insertVillaTypeRelations comes BEFORE insertVillaFeatureRelations", () => {
    expect(idx("insertVillaTypeRelations")).toBeLessThan(
      idx("insertVillaFeatureRelations")
    );
  });

  it("insertVillaFeatureRelations comes BEFORE setVillaDistances", () => {
    expect(idx("insertVillaFeatureRelations")).toBeLessThan(
      idx("setVillaDistancesServer")
    );
  });

  it("setVillaDistances comes BEFORE setVillaPrices", () => {
    expect(idx("setVillaDistancesServer")).toBeLessThan(idx("setVillaPricesServer"));
  });

  it("setVillaPrices comes BEFORE insertVillaRuleRelations", () => {
    expect(idx("setVillaPricesServer")).toBeLessThan(idx("insertVillaRuleRelations"));
  });

  it("insertVillaRuleRelations comes BEFORE insertVillaPriceIncludeRelations", () => {
    expect(idx("insertVillaRuleRelations")).toBeLessThan(
      idx("insertVillaPriceIncludeRelations")
    );
  });
});

describe("createVillaFull — return invariant", () => {
  it("returns newId at the end (last statement is return)", () => {
    const last = fnBody.statements[fnBody.statements.length - 1];
    expect(ts.isReturnStatement(last)).toBe(true);
  });
});

describe("createVillaFull — no extra DB writes", () => {
  it("calls repository insert EXACTLY ONCE (no per-relation DB write leaked)", () => {
    const writes = seq.filter((e) => e.name.includes(VILLA_WRITE));
    expect(writes.length).toBe(1);
  });

  it("service body'sinde DOĞRUDAN DB client çağrısı YOK (repository delegation)", () => {
    expect(sourceText).not.toMatch(/\bdbAdmin\s*\.\s*from\(/);
    expect(sourceText).not.toMatch(/\bdb\s*\.\s*from\(/);
  });
});
