/* ===============================================================
   🛡️ FAZ 5 — createReservation Orchestration CONTRACT TEST (AST;
   FAZ 33 evolution — repository delegation)
   ===============================================================
   AMAÇ: create.service.ts > createReservation içindeki çağrı SIRASI
   + await + EXCLUDE constraint catch pattern'i regression-safe yapmak.

   FREEZE EDİLEN KONTRATLAR:
     1. throw "Villa zorunlu" if !villa_id  (first statement)
     2. throw "Tarih zorunlu" if !start_date || !end_date
     3. throw "Ad ve telefon zorunlu" if !name || !phone
     4. throw "Tarih aralığı hatalı" if start >= end
     5. AWAITED checkReservationConflict
     6. AWAITED checkManualBlockConflict
     7. AWAITED fetchCommissionRate
     8. calcCommissionAmount (sync helper)
     9. AWAITED reservationRepository.insert(buildCreateReservationPayload(...))
        (FAZ 33: önceden `db.from("reservations").insert(...).select().single()`;
         `.select().single()` chain repository içine taşındı; caller `inserted`
         return shape'i aynen.)
    10. on error: console.error + mapInsertError + throw error.message
    11. return inserted

   ⚠️ ORDER INVARIANT:
     - reservation conflict BEFORE manual conflict
     - manual conflict BEFORE commission fetch
     - commission fetch BEFORE INSERT
     - mapInsertError BEFORE throw error.message

   ⚠️ FAZ 33: DB I/O kanalı `db.from(...).insert().select().single()`
   chain'inden tek metod çağrısına (`reservationRepository.insert`)
   indi. `mapInsertError` (SQLSTATE 23P01 parse) service edge'inde
   aynen. EXCLUDE constraint atomic guarantee DB-level — değişmedi.
=============================================================== */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC_PATH = resolve(
  process.cwd(),
  "app/services/reservation/create.service.ts"
);
const sourceText = readFileSync(SRC_PATH, "utf8");
const sourceFile = ts.createSourceFile(
  "create.service.ts",
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

const fnDecl = findExportedFunction("createReservation");
const fnBody = fnDecl.body!;
const seq = collectCallSequence(fnBody);

const idx = (name: string): number => seq.findIndex((e) => e.name === name);

/* ---------------- Tests ---------------- */

/* 🛡️ FAZ 1/D — DEPENDENCY-INJECTION HİZALAMASI (üretim kodu DEĞİŞMEDİ)
   create.service.ts test edilebilirlik için DI'ya geçti:
     const insertRepository = deps?.insertRepository ?? reservationRepository;
     await insertRepository.insert(buildCreateReservationPayload({...}));
   1) Çağrı artık `insertRepository.insert` adıyla görünüyor → aranan
      isim hizalandı; ayrıca DI default'unun gerçekten
      `reservationRepository`ye bağlandığı AYRICA doğrulanıyor.
   2) `buildCreateReservationPayload` artık insert çağrısının ARGÜMANI
      olarak inline duruyor. Bu dosyadaki AST toplayıcısı (pushFromExpr)
      yalnız en dıştaki çağrıyı kaydeder, argümanlara İNMEZ — bu yüzden
      sayım 0 dönüyordu. EXACTLY-ONCE invariant'ı korunsun diye sayım
      fonksiyon gövdesinin kaynak metni üzerinden yapılıyor (inline
      konumu da kapsar). Assertion GEVŞEMEDİ. */

describe("createReservation — early validation throws", () => {
  it("first if-statement guards villa_id (throw 'Villa zorunlu')", () => {
    const first = fnBody.statements[0];
    expect(ts.isIfStatement(first)).toBe(true);
    if (ts.isIfStatement(first)) {
      const cond = first.expression.getText();
      expect(cond).toContain("villa_id");
      const fullText = first.getText();
      expect(fullText).toContain("Villa zorunlu");
    }
  });

  it("includes throw 'Tarih zorunlu'", () => {
    expect(fnBody.getText()).toContain("Tarih zorunlu");
  });

  it("includes throw 'Ad ve telefon zorunlu'", () => {
    expect(fnBody.getText()).toContain("Ad ve telefon zorunlu");
  });

  it("includes throw 'Tarih aralığı hatalı'", () => {
    expect(fnBody.getText()).toContain("Tarih aralığı hatalı");
  });
});

describe("createReservation — orchestration order", () => {
  it("checkReservationConflict AWAITED before checkManualBlockConflict", () => {
    const ri = idx("checkReservationConflict");
    const mi = idx("checkManualBlockConflict");
    expect(ri).toBeGreaterThanOrEqual(0);
    expect(mi).toBeGreaterThanOrEqual(0);
    expect(ri).toBeLessThan(mi);
    expect(seq[ri].awaited).toBe(true);
    expect(seq[mi].awaited).toBe(true);
  });

  it("checkManualBlockConflict AWAITED before fetchCommissionRate", () => {
    const mi = idx("checkManualBlockConflict");
    const ci = idx("fetchCommissionRate");
    expect(ci).toBeGreaterThanOrEqual(0);
    expect(mi).toBeLessThan(ci);
    expect(seq[ci].awaited).toBe(true);
  });

  it("calcCommissionAmount called (sync) after fetchCommissionRate", () => {
    const ci = idx("fetchCommissionRate");
    const cai = idx("calcCommissionAmount");
    expect(cai).toBeGreaterThanOrEqual(0);
    expect(ci).toBeLessThan(cai);
    /* sync — not awaited */
    expect(seq[cai].awaited).toBe(false);
  });

  it("reservationRepository.insert AWAITED after fetchCommissionRate", () => {
    const cai = idx("calcCommissionAmount");
    const insertIdx = seq.findIndex(
      (e) => e.name === "insertRepository.insert" && e.awaited
    );
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(cai).toBeLessThan(insertIdx);
    expect(seq[insertIdx].awaited).toBe(true);
  });
});

describe("createReservation — EXCLUDE constraint catch", () => {
  it("references mapInsertError", () => {
    const i = idx("mapInsertError");
    expect(i).toBeGreaterThanOrEqual(0);
    /* mapInsertError ya conditional (if error block) ya da direct call;
       her halükarda INSERT'ten sonra. */
    const insertIdx = seq.findIndex(
      (e) => e.name === "insertRepository.insert" && e.awaited
    );
    expect(insertIdx).toBeLessThan(i);
  });

  it("error.message throw exists after mapInsertError (generic fallback)", () => {
    const fullText = fnBody.getText();
    expect(fullText).toContain("mapInsertError(error)");
    expect(fullText).toContain("throw new Error(error.message)");
  });
});

describe("createReservation — return invariant", () => {
  it("returns inserted at the end", () => {
    const last = fnBody.statements[fnBody.statements.length - 1];
    expect(ts.isReturnStatement(last)).toBe(true);
    if (ts.isReturnStatement(last)) {
      const text = last.getText();
      expect(text).toContain("inserted");
    }
  });
});

describe("createReservation — single-INSERT invariant", () => {
  it("insertRepository DI default binds to reservationRepository", () => {
    /* Alias'ın gerçek repository'ye düştüğünü kanıtlar — aşağıdaki
       `insertRepository.insert` sayımı ancak bu sayede
       "reservationRepository.insert" anlamına gelir. */
    expect(fnBody.getText()).toMatch(
      /const\s+insertRepository\s*=\s*deps\?\.insertRepository\s*\?\?\s*reservationRepository/
    );
  });

  it("calls reservationRepository.insert EXACTLY ONCE (DI alias üzerinden)", () => {
    /* FAZ 33: önceden `db` identifier'ı sayılıyordu; artık
       repository identifier sayılıyor — INSERT atomicity invariant
       aynı (tek round-trip, tek EXCLUDE constraint check). */
    const repoCalls = seq.filter(
      (e) => e.name === "insertRepository.insert"
    );
    expect(repoCalls.length).toBe(1);
  });

  it("does NOT touch the DB client directly (repository delegation)", () => {
    /* Service body'sinde doğrudan `db.*` çağrısı bulunmamalı.
       Tüm DB I/O repository üzerinden. */
    const directDbCalls = seq.filter((e) => /^db(Admin)?\./.test(e.name));
    expect(directDbCalls.length).toBe(0);
  });

  it("calls checkReservationConflict EXACTLY ONCE", () => {
    const c = seq.filter((e) => e.name === "checkReservationConflict");
    expect(c.length).toBe(1);
  });

  it("calls checkManualBlockConflict EXACTLY ONCE", () => {
    const c = seq.filter((e) => e.name === "checkManualBlockConflict");
    expect(c.length).toBe(1);
  });

  it("calls fetchCommissionRate EXACTLY ONCE", () => {
    const c = seq.filter((e) => e.name === "fetchCommissionRate");
    expect(c.length).toBe(1);
  });

  it("calls buildCreateReservationPayload EXACTLY ONCE", () => {
    /* insert çağrısının ARGÜMANI olarak inline duruyor; AST toplayıcı
       argümanlara inmediği için sayım kaynak metninden yapılır.
       EXACTLY-ONCE invariant'ı aynen. */
    const c =
      fnBody.getText().match(/\bbuildCreateReservationPayload\s*\(/g) || [];
    expect(c.length).toBe(1);
  });

  it("buildCreateReservationPayload, insert çağrısının İÇİNDE kullanılır", () => {
    /* Payload'ın DB write'a giden tek kaynak olduğunu kilitler. */
    expect(fnBody.getText()).toMatch(
      /insertRepository\.insert\(\s*buildCreateReservationPayload\s*\(/
    );
  });
});
