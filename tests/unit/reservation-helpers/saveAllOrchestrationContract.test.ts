/* ===============================================================
   🛡️ PHASE 2 — saveAll Orchestration CONTRACT TEST (AST-based)
   ===============================================================
   AMAÇ: saveAll içindeki çağrı SIRASI + await/fire-forget pattern'i
   regression-safe yapmak — implementation detail'larına gömülmeden.

   YAKLAŞIM: page.tsx kaynak kodunu TypeScript Compiler API ile
   parse edip saveAll'ın iki kritik yolunu (custom_price branch +
   normal branch) AST üzerinden walk ediyoruz. Her yolda, sırayla
   çıkan fonksiyon çağrılarının NAME + AWAITED + CONDITIONAL
   özelliklerini "event sequence" olarak çıkarıp, beklediğimiz
   minimum kontrat sırasına karşı assert ediyoruz.

   NEDEN AST? Bu test runtime'da saveAll'ı ÇAĞIRMAZ — ne eski sağlayıcı
   mock'u, ne RTL render, ne window.location override. Sadece kaynak
   kodu okur. Brittle riskini düşürmek için:
     • çağrı argümanları (içeriği) test edilmez
     • değişken adları sabitlenmez (örn. customPayload / payload)
     • yorum satırları görmezden gelinir
     • sadece "şu fonksiyon şuradan ÖNCE/SONRA çağrılıyor mu" ve
       "await edildi mi" check'leri yapılır

   FREEZE EDİLEN KONTRATLAR (her iki path için):
     1. updateReservationFull AWAITED, ilk DB-write
     2. logReservationUpdate fire-forget, hemen sonra
     3. triggerPaymentConfirmation AWAITED, ama YALNIZ
        isConfirmTransition koşullu blok içinde
     4. dispatchStatusChangeMail fire-forget, conditional sonrası
     5. toast.success success path'in sonunda
     6. window.location.reload final çağrı

   Bunlara EK olarak:
     • saveAll başında early-return guard (`if (!id || !data) return`)
     • confirm guard (status===confirmed + paid_amount=0 → toast.error + return)
     • try/catch boundary (catch içinde toast.error)
=============================================================== */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* ---------------- Source load + parse ----------------
   Vitest cwd = project root; test path-resolution stays
   cross-runtime safe (no __dirname / import.meta gymnastics). */
const PAGE_TS_PATH = resolve(
  process.cwd(),
  "app/(admin)/maki-admin/reservations/[id]/page.tsx"
);

const sourceText = readFileSync(PAGE_TS_PATH, "utf8");
const sourceFile = ts.createSourceFile(
  "page.tsx",
  sourceText,
  ts.ScriptTarget.Latest,
  /* setParentNodes */ true,
  ts.ScriptKind.TSX
);

/* ---------------- Helpers ---------------- */

/** Find the `const saveAll = async () => { ... }` declaration. */
function findSaveAllBlock(): ts.Block {
  let result: ts.Block | null = null;
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "saveAll" &&
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
  if (!result) throw new Error("saveAll declaration not found in page.tsx");
  return result;
}

/** Callee identifier name from a CallExpression (best-effort). */
function getCalleeName(call: ts.CallExpression): string {
  const expr = call.expression;
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    const left = expr.expression;
    const leftName = ts.isIdentifier(left)
      ? left.text
      : ts.isPropertyAccessExpression(left) && ts.isIdentifier(left.name)
        ? left.expression.getText() + "." + left.name.text
        : left.getText();
    return leftName + "." + expr.name.text;
  }
  return expr.getText();
}

type CallEvent = {
  name: string;
  awaited: boolean;
  /** true if this call lives inside an `if (...)` block (conditional). */
  conditional: boolean;
};

/** Walk a block (and any nested if-blocks at top level) emitting calls in source order. */
function collectCallSequence(block: ts.Block, conditional = false): CallEvent[] {
  const out: CallEvent[] = [];
  for (const stmt of block.statements) {
    extractFromStmt(stmt, out, conditional);
  }
  return out;
}

function extractFromStmt(
  stmt: ts.Statement,
  out: CallEvent[],
  conditional: boolean
): void {
  // const x = await foo() / const x = foo()
  if (ts.isVariableStatement(stmt)) {
    for (const decl of stmt.declarationList.declarations) {
      const init = decl.initializer;
      pushFromExpr(init, out, conditional);
    }
    return;
  }
  // await foo() ; foo()
  if (ts.isExpressionStatement(stmt)) {
    pushFromExpr(stmt.expression, out, conditional);
    return;
  }
  // if (cond) { ... }
  if (ts.isIfStatement(stmt)) {
    const cond = stmt.expression.getText().trim();
    // Carry the condition text into nested events so tests can assert which gate
    const thenStatements = ts.isBlock(stmt.thenStatement)
      ? stmt.thenStatement.statements
      : /* 🛡️ süslü parantezsiz if — tek statement */
        ([stmt.thenStatement] as unknown as ts.NodeArray<ts.Statement>);
    for (const s of thenStatements) {
      const before = out.length;
      extractFromStmt(s, out, /* conditional */ true);
      // Attach the gating condition as metadata on the new events
      for (let i = before; i < out.length; i++) {
        (out[i] as CallEvent & { gate?: string }).gate = cond;
      }
    }
    return;
  }
  /* 🛡️ Bare block statement — `{ const updRes = await adminFetch(...); ... }`
     Üretim kodu server write adımını kendi değişken kapsamına aldı;
     KOŞULLU DEĞİL. Eskiden bu blok atlandığı için AWAITED server write
     sequence'ta hiç görünmüyordu. */
  if (ts.isBlock(stmt)) {
    for (const st of stmt.statements) {
      extractFromStmt(st, out, conditional);
    }
    return;
  }
  // return / try / etc. — caller handles try separately.
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
    out.push({ name: getCalleeName(expr), awaited: false, conditional });
    return;
  }
}

/** Find the try block inside saveAll. */
function findTryBlock(saveAllBlock: ts.Block): ts.TryStatement {
  for (const stmt of saveAllBlock.statements) {
    if (ts.isTryStatement(stmt)) return stmt;
  }
  throw new Error("try/catch block not found in saveAll");
}

/** Locate the custom_price `if` block + the surrounding 'else / fallthrough' block. */
function splitBranches(tryBlock: ts.Block): {
  custom: ts.Block;
  normal: ts.Statement[];
} {
  let custom: ts.Block | null = null;
  const rest: ts.Statement[] = [];
  for (const stmt of tryBlock.statements) {
    if (
      ts.isIfStatement(stmt) &&
      stmt.expression.getText().includes("custom_price") &&
      ts.isBlock(stmt.thenStatement) &&
      !custom
    ) {
      custom = stmt.thenStatement;
      continue;
    }
    rest.push(stmt);
  }
  if (!custom) throw new Error("custom_price branch not found");
  return { custom, normal: rest };
}

/** Find the order of a call name in an event sequence; returns -1 if absent. */
function indexOfCall(seq: CallEvent[], name: string): number {
  return seq.findIndex((e) => e.name === name);
}

/** Find the index of a top-level (non-conditional) call by name. */
function indexOfTopLevelCall(seq: CallEvent[], name: string): number {
  return seq.findIndex((e) => e.name === name && !e.conditional);
}

/* ---------------- Top-level extraction ---------------- */

const saveAllBlock = findSaveAllBlock();
const tryStmt = findTryBlock(saveAllBlock);
const tryBlock = tryStmt.tryBlock;
const { custom: customBranch, normal: normalRest } = splitBranches(tryBlock);

const customSeq = collectCallSequence(customBranch);
// Normal branch is the remaining statements after the custom-price if. They're
// at the same depth as the if's siblings, so we collect them as a synthetic
// block by reusing the helper.
const normalSeq: CallEvent[] = [];
for (const s of normalRest) extractFromStmt(s, normalSeq, false);

/* ---------------- TESTS ---------------- */

describe("saveAll — early guards", () => {
  it("returns early when id or data is missing (very first statement)", () => {
    const first = saveAllBlock.statements[0];
    expect(ts.isIfStatement(first)).toBe(true);
    if (ts.isIfStatement(first)) {
      const condText = first.expression.getText().replace(/\s+/g, "");
      // Accept (!id||!data) variants
      expect(condText.includes("!id") && condText.includes("!data")).toBe(true);
      // then-branch contains a bare `return`
      const then = first.thenStatement;
      const hasReturn = ts.isReturnStatement(then) ||
        (ts.isBlock(then) && then.statements.some((s) => ts.isReturnStatement(s)));
      expect(hasReturn).toBe(true);
    }
  });

  it("blocks save when status='confirmed' and paid_amount cannot confirm (toast.error + return)", () => {
    // Find an if statement BEFORE the try that calls toast.error and returns
    const beforeTry: ts.Statement[] = [];
    for (const s of saveAllBlock.statements) {
      if (ts.isTryStatement(s)) break;
      beforeTry.push(s);
    }
    const guard = beforeTry.find(
      (s): s is ts.IfStatement =>
        ts.isIfStatement(s) &&
        s.expression.getText().includes("requestedStatus") &&
        s.expression.getText().includes('"confirmed"') &&
        s.expression.getText().includes("canConfirmReservation")
    );
    expect(guard).toBeTruthy();
    if (guard && ts.isBlock(guard.thenStatement)) {
      const calls = guard.thenStatement.statements.filter(
        ts.isExpressionStatement
      );
      const toastErr = calls.some(
        (s) =>
          ts.isCallExpression(s.expression) &&
          getCalleeName(s.expression) === "toast.error"
      );
      const hasReturn = guard.thenStatement.statements.some(
        ts.isReturnStatement
      );
      expect(toastErr).toBe(true);
      expect(hasReturn).toBe(true);
    }
  });
});

describe("saveAll — try/catch boundary", () => {
  it("wraps the orchestration in try/catch with toast.error in catch", () => {
    expect(tryStmt.catchClause).toBeTruthy();
    const catchBlock = tryStmt.catchClause?.block;
    expect(catchBlock).toBeTruthy();
    if (catchBlock) {
      const hasToastError = catchBlock.statements.some(
        (s) =>
          ts.isExpressionStatement(s) &&
          ts.isCallExpression(s.expression) &&
          getCalleeName(s.expression) === "toast.error"
      );
      expect(hasToastError).toBe(true);
    }
  });
});

/* 🛡️ SERVER WRITE SEAM — `saveAll` artık client'tan doğrudan
   `updateReservationFull` çağırmaz: `adminFetch(PATCH
   /api/admin/reservations/:id)` ile route'a delege eder; service
   (paid_amount guard + audit + mail dispatch) SERVER tarafında çalışır.
   Kontratın AMACI değişmedi — "AWAITED server write, log'dan ÖNCE,
   branch başına TAM BİR KEZ"; yalnız aranan çağrı adı yeni mimariye
   hizalandı. Aşağıdaki API delegation describe'ı endpoint + HTTP
   method + payload zincirini ayrıca kilitler. */
const SERVER_WRITE = "adminFetch";

/* ---------------- Shared per-branch contracts ---------------- */
function assertOrchestrationContract(seq: CallEvent[], branchName: string) {
  describe(`saveAll — ${branchName} branch orchestration order`, () => {
    it("calls server write (adminFetch) AWAITED before logReservationUpdate", () => {
      const updIdx = indexOfCall(seq, SERVER_WRITE);
      const logIdx = indexOfCall(seq, "logReservationUpdate");
      expect(updIdx).toBeGreaterThanOrEqual(0);
      expect(logIdx).toBeGreaterThanOrEqual(0);
      expect(updIdx).toBeLessThan(logIdx);
      expect(seq[updIdx].awaited).toBe(true);
    });

    it("logReservationUpdate is fire-forget (NOT awaited)", () => {
      const logIdx = indexOfCall(seq, "logReservationUpdate");
      expect(logIdx).toBeGreaterThanOrEqual(0);
      expect(seq[logIdx].awaited).toBe(false);
    });

    it("triggerPaymentConfirmation is AWAITED and lives under isConfirmTransition gate", () => {
      const idx = indexOfCall(seq, "triggerPaymentConfirmation");
      expect(idx).toBeGreaterThanOrEqual(0);
      const ev = seq[idx] as CallEvent & { gate?: string };
      expect(ev.awaited).toBe(true);
      expect(ev.conditional).toBe(true);
      expect(ev.gate ?? "").toContain("isConfirmTransition");
    });

    it("triggerPaymentConfirmation happens AFTER logReservationUpdate", () => {
      const logIdx = indexOfCall(seq, "logReservationUpdate");
      const pcIdx = indexOfCall(seq, "triggerPaymentConfirmation");
      expect(logIdx).toBeLessThan(pcIdx);
    });

    it("dispatchStatusChangeMail is fire-forget AFTER the confirm transition gate", () => {
      const pcIdx = indexOfCall(seq, "triggerPaymentConfirmation");
      const dispIdx = indexOfCall(seq, "dispatchStatusChangeMail");
      expect(dispIdx).toBeGreaterThanOrEqual(0);
      expect(seq[dispIdx].awaited).toBe(false);
      // dispatch lives OUTSIDE the gate
      expect(seq[dispIdx].conditional).toBe(false);
      // and happens after the conditional trigger
      expect(pcIdx).toBeLessThan(dispIdx);
    });

    it("toast.success fires AFTER dispatchStatusChangeMail, AT TOP LEVEL (not conditional)", () => {
      const dispIdx = indexOfCall(seq, "dispatchStatusChangeMail");
      const toastIdx = indexOfCall(seq, "toast.success");
      expect(toastIdx).toBeGreaterThanOrEqual(0);
      expect(seq[toastIdx].conditional).toBe(false);
      expect(dispIdx).toBeLessThan(toastIdx);
    });

    it("window.location.reload is the FINAL success call (after toast.success, at top level)", () => {
      const toastIdx = indexOfCall(seq, "toast.success");
      // Note: an additional conditional reload exists in the error-recovery
      // sub-branch (`if (!confResult.ok)`); we specifically assert the
      // SUCCESS-path reload (non-conditional, after toast.success).
      const reloadIdx = indexOfTopLevelCall(seq, "window.location.reload");
      expect(reloadIdx).toBeGreaterThanOrEqual(0);
      expect(toastIdx).toBeLessThan(reloadIdx);
    });
  });
}

assertOrchestrationContract(customSeq, "custom_price");
assertOrchestrationContract(normalSeq, "normal");

describe("saveAll — branch split invariants", () => {
  it("custom_price branch exists as the first sibling-if inside try", () => {
    // splitBranches already threw if missing; assert non-empty seq
    expect(customSeq.length).toBeGreaterThan(0);
    expect(indexOfCall(customSeq, SERVER_WRITE)).toBeGreaterThanOrEqual(0);
  });

  it("normal branch (post custom-if siblings) also runs full orchestration", () => {
    expect(normalSeq.length).toBeGreaterThan(0);
    expect(indexOfCall(normalSeq, SERVER_WRITE)).toBeGreaterThanOrEqual(0);
  });

  it("both branches call buildCustomPricePayload XOR buildNormalPayload (single path each)", () => {
    const customHasCustomPayload =
      indexOfCall(customSeq, "buildCustomPricePayload") >= 0;
    const customHasNormalPayload = indexOfCall(customSeq, "buildNormalPayload") >= 0;
    expect(customHasCustomPayload).toBe(true);
    expect(customHasNormalPayload).toBe(false);

    const normalHasNormalPayload = indexOfCall(normalSeq, "buildNormalPayload") >= 0;
    const normalHasCustomPayload =
      indexOfCall(normalSeq, "buildCustomPricePayload") >= 0;
    expect(normalHasNormalPayload).toBe(true);
    expect(normalHasCustomPayload).toBe(false);
  });
});

/* ===============================================================
   🔒 API DELEGATION CONTRACT (yeni mimari — güçlendirme)
   ===============================================================
   Eski kontrat "AWAITED updateReservationFull" diyordu. Server'a
   taşındıktan sonra asıl invariant: HER İKİ BRANCH de aynı uca,
   PATCH ile, kendi payload'ıyla ve villa id'siyle yazmalı; client
   doğrudan DB'ye dokunmamalı.
=============================================================== */
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

describe("saveAll — API delegation (PATCH /api/admin/reservations/:id)", () => {
  const calls = findCallsDeep(tryStmt.tryBlock, SERVER_WRITE);

  it("her branch için TAM BİR server write çağrısı (custom + normal = 2)", () => {
    expect(calls.length).toBe(2);
  });

  it("her iki çağrı da /api/admin/reservations/:id ucuna gider", () => {
    for (const c of calls) {
      const url = c.arguments[0].getText();
      expect(url).toContain("/api/admin/reservations/");
      /* id path parametresi encode edilerek geçilir. */
      expect(url).toContain("encodeURIComponent(id)");
    }
  });

  it("her iki çağrı da PATCH + application/json", () => {
    for (const c of calls) {
      const init = c.arguments[1];
      expect(ts.isObjectLiteralExpression(init)).toBe(true);
      const obj = init as ts.ObjectLiteralExpression;

      const method = propOf(obj, "method");
      expect(method && ts.isStringLiteral(method)).toBe(true);
      expect((method as ts.StringLiteral).text).toBe("PATCH");

      const headers = propOf(obj, "headers");
      expect(headers && ts.isObjectLiteralExpression(headers)).toBe(true);
      const ct = propOf(headers as ts.ObjectLiteralExpression, "Content-Type");
      expect(ct && ts.isStringLiteral(ct)).toBe(true);
      expect((ct as ts.StringLiteral).text).toBe("application/json");
    }
  });

  it("gövde JSON.stringify(<branch payload>) — custom ve normal AYRI payload", () => {
    const bodies = calls.map((c) => {
      const init = c.arguments[1] as ts.ObjectLiteralExpression;
      const body = propOf(init, "body");
      expect(body && ts.isCallExpression(body)).toBe(true);
      const call = body as ts.CallExpression;
      expect(getCalleeName(call)).toBe("JSON.stringify");
      return call.arguments[0].getText();
    });
    /* İki branch aynı payload değişkenini kullanmamalı — aksi hâlde
       custom/normal ayrımı sessizce kaybolur. */
    expect(new Set(bodies).size).toBe(2);
  });

  it("client doğrudan DB'ye yazmaz (repository/anon update YOK)", () => {
    const noComments = sourceText
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    expect(noComments).not.toMatch(/from\s+["\']@\/lib\/db\//);
    expect(noComments).not.toMatch(/\bdbAdmin\b/);
    expect(noComments).not.toMatch(/\bdb\s*\.\s*from\s*\(/);
  });
});
