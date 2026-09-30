/* ===============================================================
   🛡️ FAZ 5 — villas/ekle/page.tsx > handleCreate AST contract
   ===============================================================
   FREEZE EDİLEN KONTRATLAR:
     1. early return if loading
     2. setLoading(true)
     3. validateVillaCreate guard — if not ok, toast.error + setLoading(false) + return
     4. AWAITED createVillaFull(buildVillaCreatePayload(...))
     5. toast.success("Villa eklendi")
     6. FIRE-FORGET logActivity({ after_data: buildVillaCreateAuditAfter(...) }).catch(()=>{})
     7. router.push("/maki-admin/villas/{newId}/galeri")
     8. catch: toast.error
     9. finally: setLoading(false)
=============================================================== */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC_PATH = resolve(
  process.cwd(),
  "app/(admin)/maki-admin/villas/ekle/page.tsx"
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

/* 🛡️ ZİNCİR KÖKÜ — `logActivity({...}).catch(() => {})` gibi fire-forget
   zincirlerde en dıştaki çağrı `.catch`'tir; sözleşme ise KÖK çağrıyı
   (logActivity) ilgilendirir. `toast.success(...)` gibi düz property
   çağrıları etkilenmez (kökü CallExpression değildir). */
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
  /* 🛡️ Bare block — `{ const apiRes = await adminFetch(...); ... }`
     Üretim kodu server write adımını kendi kapsamına aldı; koşullu
     DEĞİL. Eskiden atlanıyordu. */
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

const handleCreate = findArrowFn("handleCreate");
const seq = collectCallSequence(handleCreate);
const idx = (name: string) => seq.findIndex((e) => e.name === name);

describe("villas/ekle handleCreate — guards", () => {
  it("first statement guards loading", () => {
    const first = handleCreate.statements[0];
    expect(ts.isIfStatement(first)).toBe(true);
    if (ts.isIfStatement(first)) {
      expect(first.expression.getText()).toContain("loading");
    }
  });

  it("setLoading(true) before validation", () => {
    const setLoading = handleCreate.statements.find(
      (s) =>
        ts.isExpressionStatement(s) &&
        ts.isCallExpression(s.expression) &&
        getCalleeName(s.expression) === "setLoading"
    );
    expect(setLoading).toBeTruthy();
  });

  it("validateVillaCreate called BEFORE try block", () => {
    const validateIdx = handleCreate.statements.findIndex(
      (s) =>
        ts.isVariableStatement(s) &&
        s.declarationList.declarations.some(
          (d) =>
            d.initializer &&
            ts.isCallExpression(d.initializer) &&
            getCalleeName(d.initializer) === "validateVillaCreate"
        )
    );
    const tryIdx = handleCreate.statements.findIndex(ts.isTryStatement);
    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(tryIdx).toBeGreaterThanOrEqual(0);
    expect(validateIdx).toBeLessThan(tryIdx);
  });
});

/* 🛡️ SERVER WRITE SEAM — `handleCreate` artık client'tan doğrudan
   `createVillaFull` çağırmaz: `adminFetch(POST /api/admin/villas)` ile
   route'a delege eder; route içinde AYNI `createVillaFull(payload)`
   service'i çalışır. Kontratın amacı (AWAITED tek server write, toast
   ve audit'ten ÖNCE) korunur; yalnız aranan çağrı adı hizalandı. */
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

describe("villas/ekle handleCreate — try-block orchestration", () => {
  it("payload, server write'ın gövdesinde üretilir (build → write zinciri)", () => {
    /* INVARIANT: eski "buildVillaCreatePayload BEFORE createVillaFull".
       Builder artık write çağrısının ARGÜMANI olduğundan sıra yerine
       YAPISAL İÇERME ile kanıtlanır: gövdeye giden tek veri kaynağı
       builder'dır. */
    const calls = findCallsDeep(handleCreate, SERVER_WRITE);
    expect(calls.length).toBe(1);
    const init = calls[0].arguments[1];
    expect(ts.isObjectLiteralExpression(init)).toBe(true);
    const body = propOf(init as ts.ObjectLiteralExpression, "body");
    expect(body && ts.isCallExpression(body)).toBe(true);
    expect(getCalleeName(body as ts.CallExpression)).toBe("JSON.stringify");
    const inner = (body as ts.CallExpression).arguments[0];
    expect(ts.isCallExpression(inner)).toBe(true);
    expect(getCalleeName(inner as ts.CallExpression)).toBe(
      "buildVillaCreatePayload"
    );
  });

  it("server write is AWAITED", () => {
    const i = idx(SERVER_WRITE);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(seq[i].awaited).toBe(true);
    expect(seq[i].conditional).toBe(false);
  });

  it("toast.success AFTER server write", () => {
    const createIdx = idx(SERVER_WRITE);
    const toastIdx = idx("toast.success");
    expect(toastIdx).toBeGreaterThan(createIdx);
  });

  it("logActivity called AFTER toast.success (fire-forget)", () => {
    const toastIdx = idx("toast.success");
    const logIdx = idx("logActivity");
    expect(logIdx).toBeGreaterThan(toastIdx);
    /* logActivity itself is not awaited — .catch chain handles fail-safe. */
    expect(seq[logIdx].awaited).toBe(false);
  });

  it("buildVillaCreateAuditAfter, logActivity'nin after_data'sını üretir", () => {
    /* Eskiden yalnız "bir yerde çağrılıyor mu" bakılıyordu; artık audit
       payload'ının gerçekten logActivity'ye after_data olarak geçtiği
       yapısal olarak doğrulanır. */
    const logCalls = findCallsDeep(handleCreate, "logActivity");
    expect(logCalls.length).toBe(1);
    const arg = logCalls[0].arguments[0];
    expect(ts.isObjectLiteralExpression(arg)).toBe(true);
    const afterData = propOf(arg as ts.ObjectLiteralExpression, "after_data");
    expect(afterData && ts.isCallExpression(afterData)).toBe(true);
    expect(getCalleeName(afterData as ts.CallExpression)).toBe(
      "buildVillaCreateAuditAfter"
    );
  });

  it("router.push is the FINAL success call", () => {
    const logIdx = idx("logActivity");
    const routerIdx = idx("router.push");
    expect(routerIdx).toBeGreaterThan(logIdx);
  });

  it("single server write invariant (EXACTLY ONCE)", () => {
    expect(seq.filter((e) => e.name === SERVER_WRITE).length).toBe(1);
    expect(findCallsDeep(handleCreate, SERVER_WRITE).length).toBe(1);
  });

  it("POST /api/admin/villas — doğru uç + method + content-type", () => {
    const call = findCallsDeep(handleCreate, SERVER_WRITE)[0];
    const url = call.arguments[0];
    expect(ts.isStringLiteral(url)).toBe(true);
    expect((url as ts.StringLiteral).text).toBe("/api/admin/villas");

    const obj = call.arguments[1] as ts.ObjectLiteralExpression;
    const method = propOf(obj, "method");
    expect(method && ts.isStringLiteral(method)).toBe(true);
    expect((method as ts.StringLiteral).text).toBe("POST");

    const headers = propOf(obj, "headers");
    expect(headers && ts.isObjectLiteralExpression(headers)).toBe(true);
    const ct = propOf(headers as ts.ObjectLiteralExpression, "Content-Type");
    expect(ct && ts.isStringLiteral(ct)).toBe(true);
    expect((ct as ts.StringLiteral).text).toBe("application/json");
  });

  it("client doğrudan DB'ye yazmaz (repository/anon insert YOK)", () => {
    const noComments = sourceText
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    expect(noComments).not.toMatch(/from\s+["\']@\/lib\/db\//);
    expect(noComments).not.toMatch(/\bdbAdmin\b/);
    expect(noComments).not.toMatch(/\bdb\s*\.\s*from\s*\(/);
    expect(noComments).not.toMatch(/\bcreateVillaFull\s*\(/);
  });
});

describe("villas/ekle handleCreate — error handling", () => {
  it("catch block calls toast.error", () => {
    const tryStmt = handleCreate.statements.find(ts.isTryStatement);
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
    const tryStmt = handleCreate.statements.find(ts.isTryStatement);
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
