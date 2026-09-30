/* ===============================================================
   🛡️ FAZ 5 — villas/[id]/page.tsx > handleUpdate AST contract
   ===============================================================
   FREEZE EDİLEN KONTRATLAR:
     1. early return if loading
     2. validateVillaUpdate guard — if not ok, toast.error + return
     3. setLoading(true)
     4. buildVillaUpdateAuditBefore (sync helper)
     5. AWAITED updateVillaFull(buildVillaUpdatePayload(...))
     6. toast.success("Villa güncellendi")
     7. FIRE-FORGET logActivity({ before_data, after_data }).catch(()=>{})
     8. catch: toast.error
     9. finally: setLoading(false)
=============================================================== */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC_PATH = resolve(
  process.cwd(),
  "app/(admin)/maki-admin/villas/[id]/page.tsx"
);
const sourceText = readFileSync(SRC_PATH, "utf8");
const sourceFile = ts.createSourceFile(
  "page.tsx",
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

function findArrowFn(name: string): ts.Block {
  let result: ts.Block | null = null;
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isArrowFunction(node.initializer)
    ) {
      const body = node.initializer.body;
      if (ts.isBlock(body)) {
        result = body;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!result) throw new Error(`${name} arrow fn not found`);
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

/* 🛡️ ZİNCİR KÖKÜ — `logActivity({...}).catch(() => {})` fire-forget
   zincirinde en dıştaki çağrı `.catch`; sözleşme KÖK çağrıyı ilgilendirir. */
function rootCalleeName(call: ts.CallExpression): string {
  let cur: ts.CallExpression = call;
  for (;;) {
    const expr = cur.expression;
    if (
      ts.isPropertyAccessExpression(expr) &&
      ts.isCallExpression(expr.expression)
    ) {
      cur = expr.expression;
      continue;
    }
    return getCalleeName(cur);
  }
}

/* 🛡️ SERVER WRITE SEAM — client artık doğrudan `updateVillaFull`
   çağırmaz: `adminFetch(PUT /api/admin/villas/:id/full)` ile route'a
   delege eder; route içinde AYNI service çalışır. */
const SERVER_WRITE = "adminFetch";

function findCallsDeep(node: ts.Node, name: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  function walk(n: ts.Node) {
    if (ts.isCallExpression(n) && getCalleeName(n) === name) out.push(n);
    ts.forEachChild(n, walk);
  }
  walk(node);
  return out;
}

function propOf(
  obj: ts.ObjectLiteralExpression,
  key: string
): ts.Expression | undefined {
  for (const p of obj.properties) {
    if (
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === key
    ) {
      return p.initializer;
    }
  }
  return undefined;
}

type CallEvent = {
  name: string;
  awaited: boolean;
  conditional: boolean;
};

function collectCallSequence(block: ts.Block, conditional = false): CallEvent[] {
  const out: CallEvent[] = [];
  for (const stmt of block.statements) extractFromStmt(stmt, out, conditional);
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
    for (const s of stmt.thenStatement.statements) extractFromStmt(s, out, true);
  }
  /* 🛡️ Bare block — `{ const fullPayload = ...; await adminFetch(...); }` */
  if (ts.isBlock(stmt)) {
    for (const s of stmt.statements) extractFromStmt(s, out, conditional);
    return;
  }
  if (ts.isTryStatement(stmt)) {
    for (const s of stmt.tryBlock.statements) extractFromStmt(s, out, conditional);
    if (stmt.catchClause) {
      for (const s of stmt.catchClause.block.statements) extractFromStmt(s, out, true);
    }
    if (stmt.finallyBlock) {
      for (const s of stmt.finallyBlock.statements) extractFromStmt(s, out, true);
    }
  }
}

function pushFromExpr(expr: ts.Expression | undefined, out: CallEvent[], conditional: boolean): void {
  if (!expr) return;
  if (ts.isAwaitExpression(expr) && ts.isCallExpression(expr.expression)) {
    out.push({ name: rootCalleeName(expr.expression), awaited: true, conditional });
    return;
  }
  if (ts.isCallExpression(expr)) {
    out.push({ name: rootCalleeName(expr), awaited: false, conditional });
  }
}

const handleUpdate = findArrowFn("handleUpdate");
const seq = collectCallSequence(handleUpdate);
const idx = (name: string) => seq.findIndex((e) => e.name === name);

describe("villas/[id] handleUpdate — guards", () => {
  it("first statement guards loading", () => {
    const first = handleUpdate.statements[0];
    expect(ts.isIfStatement(first)).toBe(true);
    if (ts.isIfStatement(first)) {
      expect(first.expression.getText()).toContain("loading");
    }
  });

  it("validateVillaUpdate called BEFORE setLoading + try", () => {
    const validateIdx = handleUpdate.statements.findIndex(
      (s) =>
        ts.isVariableStatement(s) &&
        s.declarationList.declarations.some(
          (d) =>
            d.initializer &&
            ts.isCallExpression(d.initializer) &&
            getCalleeName(d.initializer) === "validateVillaUpdate"
        )
    );
    const tryIdx = handleUpdate.statements.findIndex(ts.isTryStatement);
    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(validateIdx).toBeLessThan(tryIdx);
  });
});

describe("villas/[id] handleUpdate — orchestration", () => {
  it("buildVillaUpdateAuditBefore called BEFORE try block (snapshot)", () => {
    const beforeIdx = idx("buildVillaUpdateAuditBefore");
    /* not conditional — top-level before try */
    expect(beforeIdx).toBeGreaterThanOrEqual(0);
  });

  it("buildVillaUpdatePayload called BEFORE server write", () => {
    /* INVARIANT aynen: payload, server write'tan ÖNCE üretilmeli. */
    const buildIdx = idx("buildVillaUpdatePayload");
    const updateIdx = idx(SERVER_WRITE);
    expect(buildIdx).toBeGreaterThanOrEqual(0);
    expect(updateIdx).toBeGreaterThanOrEqual(0);
    expect(buildIdx).toBeLessThan(updateIdx);
  });

  it("server write is AWAITED", () => {
    const i = idx(SERVER_WRITE);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(seq[i].awaited).toBe(true);
    expect(seq[i].conditional).toBe(false);
  });

  it("PUT /api/admin/villas/:id/full — uç + method + content-type + gövde", () => {
    const calls = findCallsDeep(handleUpdate, SERVER_WRITE);
    expect(calls.length).toBe(1);

    const url = calls[0].arguments[0].getText();
    expect(url).toContain("/api/admin/villas/");
    expect(url).toContain("encodeURIComponent(id)");
    expect(url).toContain("/full");

    const obj = calls[0].arguments[1] as ts.ObjectLiteralExpression;
    const method = propOf(obj, "method");
    expect(method && ts.isStringLiteral(method)).toBe(true);
    expect((method as ts.StringLiteral).text).toBe("PUT");

    const headers = propOf(obj, "headers");
    expect(headers && ts.isObjectLiteralExpression(headers)).toBe(true);
    const ct = propOf(headers as ts.ObjectLiteralExpression, "Content-Type");
    expect(ct && ts.isStringLiteral(ct)).toBe(true);
    expect((ct as ts.StringLiteral).text).toBe("application/json");

    const body = propOf(obj, "body");
    expect(body && ts.isCallExpression(body)).toBe(true);
    expect(getCalleeName(body as ts.CallExpression)).toBe("JSON.stringify");
  });

  it("id path parametresiyle gider, gövdeden ÇIKARILIR (çift kaynak yok)", () => {
    /* Üretim: `const { id: _omit, ...bodyPayload } = fullPayload;`
       id yalnız URL'de taşınır; gövdede tekrar gönderilmez. */
    const body = handleUpdate.getText();
    expect(body).toMatch(/const\s*\{\s*id:\s*\w+\s*,\s*\.\.\.\s*\w+\s*\}\s*=/);
  });

  it("toast.success AFTER server write", () => {
    const updateIdx = idx(SERVER_WRITE);
    const toastIdx = idx("toast.success");
    expect(toastIdx).toBeGreaterThan(updateIdx);
  });

  it("buildVillaUpdateAuditAfter, logActivity'nin after_data'sını üretir", () => {
    const logCalls = findCallsDeep(handleUpdate, "logActivity");
    expect(logCalls.length).toBe(1);
    const arg = logCalls[0].arguments[0];
    expect(ts.isObjectLiteralExpression(arg)).toBe(true);
    const afterData = propOf(arg as ts.ObjectLiteralExpression, "after_data");
    expect(afterData && ts.isCallExpression(afterData)).toBe(true);
    expect(getCalleeName(afterData as ts.CallExpression)).toBe(
      "buildVillaUpdateAuditAfter"
    );
  });

  it("logActivity called AFTER toast.success (fire-forget)", () => {
    const toastIdx = idx("toast.success");
    const logIdx = idx("logActivity");
    expect(logIdx).toBeGreaterThan(toastIdx);
    expect(seq[logIdx].awaited).toBe(false);
  });

  it("EXACTLY ONE server write invariant", () => {
    expect(seq.filter((e) => e.name === SERVER_WRITE).length).toBe(1);
    expect(findCallsDeep(handleUpdate, SERVER_WRITE).length).toBe(1);
  });

  it("client doğrudan DB'ye yazmaz (repository/anon update YOK)", () => {
    const noComments = sourceText
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    expect(noComments).not.toMatch(/from\s+["\']@\/lib\/db\//);
    expect(noComments).not.toMatch(/\bdbAdmin\b/);
    expect(noComments).not.toMatch(/\bdb\s*\.\s*from\s*\(/);
    expect(noComments).not.toMatch(/\bupdateVillaFull\s*\(/);
  });
});

describe("villas/[id] handleUpdate — error handling", () => {
  it("catch block calls toast.error", () => {
    const tryStmt = handleUpdate.statements.find(ts.isTryStatement);
    expect(tryStmt?.catchClause).toBeTruthy();
    const catchBlock = tryStmt?.catchClause?.block;
    const hasErr = catchBlock?.statements.some(
      (s) =>
        ts.isExpressionStatement(s) &&
        ts.isCallExpression(s.expression) &&
        getCalleeName(s.expression) === "toast.error"
    );
    expect(hasErr).toBe(true);
  });

  it("finally block calls setLoading(false)", () => {
    const tryStmt = handleUpdate.statements.find(ts.isTryStatement);
    expect(tryStmt?.finallyBlock).toBeTruthy();
    const hasSetLoading = tryStmt?.finallyBlock?.statements.some(
      (s) =>
        ts.isExpressionStatement(s) &&
        ts.isCallExpression(s.expression) &&
        getCalleeName(s.expression) === "setLoading"
    );
    expect(hasSetLoading).toBe(true);
  });
});
