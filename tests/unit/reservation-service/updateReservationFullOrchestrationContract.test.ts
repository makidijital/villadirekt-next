/* ===============================================================
   🛡️ FAZ 5 — updateReservationFull Orchestration CONTRACT TEST (AST)
   ===============================================================
   FREEZE EDİLEN KONTRATLAR (FAZ 33 evolution — write delegation):
     1. throw "ID gerekli" if !id  (first statement)
     2. throw "Tarih aralığı hatalı" if start/end and start >= end
     3. CONDITIONAL AWAITED assertCanConfirm  (if status==="confirmed")
     4. buildUpdateReservationPayload (sync helper)
     5. AWAITED reservationRepository.updateById(id, payload)
        (FAZ 33: önceden `db.update(payload).eq("id", id)`)
     6. on error: console.error + throw "Güncellenemedi"
     7. return true

   ⚠️ FAZ 33: DB I/O kanalı `db.from(...)` chain'inden tek
   metod çağrısına (`reservationRepository.updateById`) indi.
   Predicate `.eq("id", id)` repository içine taşındı; AST
   contract'taki "eski sağlayıcı" iddiası "reservationRepository"
   iddiasına evolve oldu. Diğer iddialar (validate sırası,
   conditional assertCanConfirm, throw mesajı, return true)
   AYNEN.
=============================================================== */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC_PATH = resolve(
  process.cwd(),
  "app/services/reservation/update.service.ts"
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

const fnDecl = findExportedFunction("updateReservationFull");
const fnBody = fnDecl.body!;
const seq = collectCallSequence(fnBody);

const idx = (name: string): number => seq.findIndex((e) => e.name === name);

/* ---------------- Tests ---------------- */

/* 🛡️ FAZ 1/D — DEPENDENCY-INJECTION HİZALAMASI (üretim kodu DEĞİŞMEDİ)
   update.service.ts test edilebilirlik için DI'ya geçti:
     const repository = deps?.repository ?? reservationRepository;
     const { error } = await repository.updateById(id, payload);
   Literal `reservationRepository.updateById` artık yalnız tip tanımında
   ve `deps` default'unda geçiyor, çağrı yerinde değil. Aşağıda aranan
   isim gerçek çağrıya hizalandı ve DI default'unun gerçek repository'ye
   bağlandığı AYRICA doğrulanıyor. BEFORE/AFTER, await ve EXACTLY-ONCE
   invariant'ları aynen korundu. */

describe("updateReservationFull — early validation", () => {
  it("first statement throws 'ID gerekli' if !id", () => {
    const first = fnBody.statements[0];
    expect(ts.isIfStatement(first)).toBe(true);
    if (ts.isIfStatement(first)) {
      const text = first.getText();
      expect(text).toContain("!id");
      expect(text).toContain("ID gerekli");
    }
  });

  it("contains date range validation throw 'Tarih aralığı hatalı'", () => {
    expect(fnBody.getText()).toContain("Tarih aralığı hatalı");
  });
});

describe("updateReservationFull — assertCanConfirm conditional", () => {
  it("assertCanConfirm is CONDITIONAL (gated by status === 'confirmed')", () => {
    const i = idx("assertCanConfirm");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(seq[i].conditional).toBe(true);
    expect(seq[i].awaited).toBe(true);
  });

  it("guard gate references 'confirmed'", () => {
    const fullText = fnBody.getText();
    expect(fullText).toContain('"confirmed"');
    expect(fullText).toContain("assertCanConfirm");
  });
});

describe("updateReservationFull — orchestration order", () => {
  it("buildUpdateReservationPayload BEFORE reservationRepository.updateById", () => {
    const bi = idx("buildUpdateReservationPayload");
    const ui = seq.findIndex(
      (e) => e.name === "repository.updateById" && e.awaited
    );
    expect(bi).toBeGreaterThanOrEqual(0);
    expect(ui).toBeGreaterThanOrEqual(0);
    expect(bi).toBeLessThan(ui);
    expect(seq[ui].awaited).toBe(true);
  });
});

describe("updateReservationFull — single-UPDATE invariant", () => {
  it("repository DI default binds to reservationRepository", () => {
    /* Alias'ın gerçek repository'ye düştüğünü kanıtlar — aşağıdaki
       `repository.updateById` sayımı ancak bu sayede
       "reservationRepository.updateById" anlamına gelir. */
    expect(fnBody.getText()).toMatch(
      /const\s+repository\s*=\s*deps\?\.repository\s*\?\?\s*reservationRepository/
    );
  });

  it("calls reservationRepository.updateById EXACTLY ONCE (top-level await)", () => {
    /* Note: assertCanConfirm helper internal'inde repository çağırabilir
       ama bu test sadece update.service.ts'in own body'sini AST'le
       parse ediyor. Helper'ın iç davranışı testte görünmez.

       FAZ 33: önceden bu iddia `e.name.includes("eski sağlayıcı")` ile
       eski sağlayıcı chain'i sayıyordu; artık repository identifier'ı
       sayıyor — orchestration sırası invariant'ı aynı. */
    const repoCalls = seq.filter(
      (e) => e.name === "repository.updateById"
    );
    expect(repoCalls.length).toBe(1);
  });

  it("does NOT touch the DB client directly (repository delegation)", () => {
    /* Service body'sinde doğrudan `db.*` çağrısı bulunmamalı.
       Tüm DB I/O repository üzerinden olmalı. */
    const directDbCalls = seq.filter((e) => /^db(Admin)?\./.test(e.name));
    expect(directDbCalls.length).toBe(0);
  });

  it("calls buildUpdateReservationPayload EXACTLY ONCE", () => {
    const c = seq.filter((e) => e.name === "buildUpdateReservationPayload");
    expect(c.length).toBe(1);
  });
});

describe("updateReservationFull — error + return", () => {
  it("console.error tag '❌ Update error:' aynen", () => {
    expect(fnBody.getText()).toContain('"❌ Update error:"');
  });

  it("throw 'Güncellenemedi' aynen", () => {
    expect(fnBody.getText()).toContain("Güncellenemedi");
  });

  it("returns true at the end", () => {
    const last = fnBody.statements[fnBody.statements.length - 1];
    expect(ts.isReturnStatement(last)).toBe(true);
    if (ts.isReturnStatement(last)) {
      expect(last.getText()).toContain("true");
    }
  });
});
