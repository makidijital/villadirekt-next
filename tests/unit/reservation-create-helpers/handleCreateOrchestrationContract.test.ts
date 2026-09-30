/* ===============================================================
   🛡️ FAZ 5 — handleCreate Orchestration CONTRACT TEST (AST-based)
   ===============================================================
   AMAÇ: handleCreate içindeki çağrı SIRASI + await/fire-forget
   pattern'i regression-safe yapmak — implementation detail'larına
   gömülmeden.

   YAKLAŞIM: ekle/page.tsx kaynak kodunu TypeScript Compiler API
   ile parse edip handleCreate'in try-block'ını AST üzerinden walk
   ediyoruz. Sırayla çıkan fonksiyon çağrılarının NAME + AWAITED
   özelliklerini "event sequence" olarak çıkarıp beklediğimiz
   minimum kontrat sırasına karşı assert ediyoruz.

   NEDEN AST? Bu test runtime'da handleCreate'i ÇAĞIRMAZ — eski sağlayıcı
   mock'u yok, RTL render yok, window.location override yok.
   Sadece kaynak kodu okur. Brittle riskini düşürmek için:
     • çağrı argümanları (içeriği) test edilmez
     • değişken adları sabitlenmez (örn. payload / customPayload)
     • yorum satırları görmezden gelinir
     • sadece "şu fonksiyon şuradan ÖNCE/SONRA çağrılıyor mu" ve
       "await edildi mi" check'leri yapılır

   FREEZE EDİLEN KONTRATLAR (try-block içinde):
     1. db.from("reservations").insert(...).select().single() AWAITED
     2. error check + throw
     3. dispatchReservationRequestMail FIRE-FORGET (NOT awaited)
     4. toast.success AFTER dispatch
     5. router.push FINAL

   PRE-TRY GUARD'LAR:
     • validateForm() çağrısı (helper veya wrapper)
     • Boş olmayan errors map → setErrors + return (insert/mail YOK)
     • setErrors({}) reset
     • setLoading(true)

   CATCH GUARD'LAR:
     • toast.error catch içinde

   FINALLY:
     • setLoading(false)
=============================================================== */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* ---------------- Source load + parse ---------------- */
const PAGE_TS_PATH = resolve(
  process.cwd(),
  "app/(admin)/maki-admin/reservations/ekle/page.tsx"
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

/** Find the `const handleCreate = async () => { ... }` declaration. */
function findHandleCreateBlock(): ts.Block {
  let result: ts.Block | null = null;
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "handleCreate" &&
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
  if (!result) throw new Error("handleCreate declaration not found in page.tsx");
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
  conditional: boolean;
};

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
  if (ts.isVariableStatement(stmt)) {
    for (const decl of stmt.declarationList.declarations) {
      const init = decl.initializer;
      pushFromExpr(init, out, conditional);
    }
    return;
  }
  if (ts.isExpressionStatement(stmt)) {
    pushFromExpr(stmt.expression, out, conditional);
    return;
  }
  if (ts.isIfStatement(stmt)) {
    if (ts.isBlock(stmt.thenStatement)) {
      for (const s of stmt.thenStatement.statements) {
        extractFromStmt(s, out, /* conditional */ true);
      }
    } else {
      /* 🛡️ Süslü parantezsiz if — `if (reservationId) dispatchMail(id);`
         Eskiden ATLANIYORDU; fire-forget mail çağrısı sequence'a hiç
         girmiyordu. Artık conditional=true olarak toplanır. */
      extractFromStmt(stmt.thenStatement, out, /* conditional */ true);
    }
    return;
  }
  /* 🛡️ Bare block statement — `{ const res = await adminFetch(...); ... }`
     Üretim kodu DB-write adımını kendi scope'una aldı; koşullu DEĞİL,
     yalnız değişken kapsamı. Eskiden bu blok atlandığı için AWAITED
     server write sequence'ta görünmüyordu. */
  if (ts.isBlock(stmt)) {
    for (const s of stmt.statements) {
      extractFromStmt(s, out, conditional);
    }
    return;
  }
}

function pushFromExpr(
  expr: ts.Expression | undefined,
  out: CallEvent[],
  conditional: boolean
): void {
  if (!expr) return;
  if (ts.isAwaitExpression(expr) && ts.isCallExpression(expr.expression)) {
    /* Special case: chained call like `.insert(...).select().single()` —
       the entire chain ends with a single CallExpression. We extract the
       LEFTMOST identifier in the chain (typically `db` here). For
       our contract we treat the AWAITED chain as a single insert event. */
    out.push({
      name: chainedCalleeName(expr.expression),
      awaited: true,
      conditional,
    });
    return;
  }
  if (ts.isCallExpression(expr)) {
    out.push({
      name: chainedCalleeName(expr),
      awaited: false,
      conditional,
    });
    return;
  }
  /* Conditional expressions (a ? builder1() : builder2()) — collect both. */
  if (ts.isConditionalExpression(expr)) {
    pushFromExpr(expr.whenTrue, out, conditional);
    pushFromExpr(expr.whenFalse, out, conditional);
    return;
  }
}

/** Walk a chained call expression and return a name that captures the
 *  "leaf" call (last in chain) when it's a property access on a chain,
 *  otherwise the direct callee name. For `db.from(...).insert(...).select().single()`
 *  this returns "db.from..insert.single" semantics; we just check
 *  for `db.from` presence later. */
function chainedCalleeName(call: ts.CallExpression): string {
  return getCalleeName(call);
}

/** Find the try block inside handleCreate. */
function findTryBlock(handleCreateBlock: ts.Block): ts.TryStatement {
  for (const stmt of handleCreateBlock.statements) {
    if (ts.isTryStatement(stmt)) return stmt;
  }
  throw new Error("try/catch block not found in handleCreate");
}

function indexOfCall(seq: CallEvent[], predicate: (e: CallEvent) => boolean): number {
  return seq.findIndex(predicate);
}

/* ---------------- Top-level extraction ---------------- */

const handleCreateBlock = findHandleCreateBlock();
const tryStmt = findTryBlock(handleCreateBlock);
const tryBlock = tryStmt.tryBlock;
const trySeq = collectCallSequence(tryBlock);

/* ---------------- TESTS ---------------- */

describe("handleCreate — pre-try guards", () => {
  it("first statement calls validateForm() and gates errors", () => {
    /* validateForm() çağrısı handleCreate'in BAŞINDA olmalı.
       Errors > 0 → setErrors + return (insert/mail tetiklenmez). */
    const pre: ts.Statement[] = [];
    for (const s of handleCreateBlock.statements) {
      if (ts.isTryStatement(s)) break;
      pre.push(s);
    }
    /* validateForm wrapper'ı `validateForm()` veya helper inline çağırabilir. */
    const calls: string[] = [];
    for (const s of pre) {
      if (ts.isVariableStatement(s)) {
        for (const d of s.declarationList.declarations) {
          if (d.initializer && ts.isCallExpression(d.initializer)) {
            calls.push(getCalleeName(d.initializer));
          }
        }
      }
    }
    expect(
      calls.some((c) => c === "validateForm" || c === "validateCreateForm")
    ).toBe(true);
  });

  it("guards early return when errors are present (setErrors + return)", () => {
    /* `if (Object.keys(newErrors).length > 0) { setErrors(...); return; }`
       Pre-try statement'lar arasında bu pattern aranır. */
    let foundGuard = false;
    for (const s of handleCreateBlock.statements) {
      if (ts.isTryStatement(s)) break;
      if (ts.isIfStatement(s) && ts.isBlock(s.thenStatement)) {
        const hasSetErrors = s.thenStatement.statements.some(
          (st) =>
            ts.isExpressionStatement(st) &&
            ts.isCallExpression(st.expression) &&
            getCalleeName(st.expression) === "setErrors"
        );
        const hasReturn = s.thenStatement.statements.some(ts.isReturnStatement);
        if (hasSetErrors && hasReturn) foundGuard = true;
      }
    }
    expect(foundGuard).toBe(true);
  });

  it("setLoading(true) before try", () => {
    let found = false;
    for (const s of handleCreateBlock.statements) {
      if (ts.isTryStatement(s)) break;
      if (
        ts.isExpressionStatement(s) &&
        ts.isCallExpression(s.expression) &&
        getCalleeName(s.expression) === "setLoading"
      ) {
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe("handleCreate — try/catch/finally boundary", () => {
  it("wraps async work in try/catch with toast.error in catch", () => {
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

  it("has finally block calling setLoading(false)", () => {
    expect(tryStmt.finallyBlock).toBeTruthy();
    const finallyBlock = tryStmt.finallyBlock;
    expect(finallyBlock).toBeTruthy();
    if (finallyBlock) {
      const hasSetLoading = finallyBlock.statements.some(
        (s) =>
          ts.isExpressionStatement(s) &&
          ts.isCallExpression(s.expression) &&
          getCalleeName(s.expression) === "setLoading"
      );
      expect(hasSetLoading).toBe(true);
    }
  });
});

/* 🛡️ DB WRITE SEAM — `handleCreate` artık doğrudan DB'ye yazmaz:
   `adminFetch("/api/admin/reservations", { method: "POST" })` ile
   route → `createReservation` service'ine delege eder. Test AMACI
   DEĞİŞMEDİ (payload-build → AWAITED write → mail → toast sırası ve
   "tam bir kez" invariantı); yalnız aranan çağrı adı güncellendi. */
const DB_WRITE = "adminFetch";

describe("handleCreate — try-block orchestration order", () => {
  it("calls a payload builder (Custom or Normal) BEFORE the DB write", () => {
    /* `const payload = data.custom_price ? buildCreateCustomPricePayload(...) : buildCreateNormalPayload(...)` */
    const builderIdx = indexOfCall(
      trySeq,
      (e) =>
        e.name === "buildCreateCustomPricePayload" ||
        e.name === "buildCreateNormalPayload"
    );
    const insertIdx = indexOfCall(
      trySeq,
      (e) => e.name.includes(DB_WRITE) && e.awaited
    );
    expect(builderIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(builderIdx).toBeLessThan(insertIdx);
  });

  it("uses BOTH branch builders (custom XOR normal via ternary)", () => {
    /* Ternary branch'ı tek statement'ta iki builder'ı toplar; her ikisi
       de sequence'ta görünür. Karşı koruma: yalnız tek branch'ı çağıran
       linear if/else'ye düşülmesin. */
    const hasCustom = trySeq.some((e) => e.name === "buildCreateCustomPricePayload");
    const hasNormal = trySeq.some((e) => e.name === "buildCreateNormalPayload");
    expect(hasCustom).toBe(true);
    expect(hasNormal).toBe(true);
  });

  it("DB write is AWAITED (first DB write)", () => {
    const insertIdx = indexOfCall(
      trySeq,
      (e) => e.name.includes(DB_WRITE) && e.awaited
    );
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(trySeq[insertIdx].awaited).toBe(true);
  });

  it("dispatchReservationRequestMail is FIRE-FORGET (NOT awaited) and AFTER insert", () => {
    const insertIdx = indexOfCall(
      trySeq,
      (e) => e.name.includes(DB_WRITE) && e.awaited
    );
    const mailIdx = indexOfCall(
      trySeq,
      (e) => e.name === "dispatchReservationRequestMail"
    );
    expect(mailIdx).toBeGreaterThanOrEqual(0);
    expect(trySeq[mailIdx].awaited).toBe(false);
    expect(insertIdx).toBeLessThan(mailIdx);
  });

  it("toast.success AFTER mail dispatch", () => {
    const mailIdx = indexOfCall(
      trySeq,
      (e) => e.name === "dispatchReservationRequestMail"
    );
    const toastIdx = indexOfCall(trySeq, (e) => e.name === "toast.success");
    expect(toastIdx).toBeGreaterThanOrEqual(0);
    expect(mailIdx).toBeLessThan(toastIdx);
  });

  it("router.push is the FINAL success call (after toast.success)", () => {
    const toastIdx = indexOfCall(trySeq, (e) => e.name === "toast.success");
    const routerIdx = indexOfCall(trySeq, (e) => e.name === "router.push");
    expect(routerIdx).toBeGreaterThanOrEqual(0);
    expect(toastIdx).toBeLessThan(routerIdx);
  });
});

describe("handleCreate — single-insert invariant", () => {
  it("calls the DB write EXACTLY ONCE (no duplicate per-branch insert)", () => {
    /* Eski inline kodda her branch ayrı insert çağırıyordu; refactor
       sonrası tek insert + payload builder XOR ile birleşmeli.
       Duplicate insert regression'ı guard'la. */
    const inserts = trySeq.filter(
      (e) => e.name.includes(DB_WRITE) && e.awaited
    );
    expect(inserts.length).toBe(1);
  });

  it("calls dispatchReservationRequestMail EXACTLY ONCE", () => {
    const mails = trySeq.filter(
      (e) => e.name === "dispatchReservationRequestMail"
    );
    expect(mails.length).toBe(1);
  });

  it("calls toast.success EXACTLY ONCE", () => {
    const toasts = trySeq.filter((e) => e.name === "toast.success");
    expect(toasts.length).toBe(1);
  });

  it("calls router.push EXACTLY ONCE", () => {
    const pushes = trySeq.filter((e) => e.name === "router.push");
    expect(pushes.length).toBe(1);
  });
});

/* ===============================================================
   🔒 API DELEGATION CONTRACT (yeni mimari — güçlendirme)
   ===============================================================
   Eski kontrat yalnız "AWAITED bir DB write var mı" diyordu. Server'a
   taşındıktan sonra asıl invariant, YAZMANIN DOĞRU UÇA, DOĞRU METOTLA
   ve BUILDER'DAN GELEN PAYLOAD'LA gitmesidir. Aşağısı bunu yapısal
   olarak kilitler; client'ın tekrar doğrudan DB'ye yazmasını engeller.
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

describe("handleCreate — API delegation (POST /api/admin/reservations)", () => {
  const calls = findCallsDeep(tryBlock, "adminFetch");

  it("tek bir adminFetch çağrısı var", () => {
    expect(calls.length).toBe(1);
  });

  it("endpoint TAM OLARAK /api/admin/reservations", () => {
    const url = calls[0].arguments[0];
    expect(ts.isStringLiteral(url)).toBe(true);
    expect((url as ts.StringLiteral).text).toBe("/api/admin/reservations");
  });

  it("HTTP method POST ve Content-Type application/json", () => {
    const init = calls[0].arguments[1];
    expect(ts.isObjectLiteralExpression(init)).toBe(true);
    const obj = init as ts.ObjectLiteralExpression;

    const method = propOf(obj, "method");
    expect(method && ts.isStringLiteral(method)).toBe(true);
    expect((method as ts.StringLiteral).text).toBe("POST");

    const headers = propOf(obj, "headers");
    expect(headers && ts.isObjectLiteralExpression(headers)).toBe(true);
    const ct = propOf(headers as ts.ObjectLiteralExpression, "Content-Type");
    expect(ct && ts.isStringLiteral(ct)).toBe(true);
    expect((ct as ts.StringLiteral).text).toBe("application/json");
  });

  it("body = JSON.stringify(payload) — builder çıktısı gövdeye gider", () => {
    const init = calls[0].arguments[1] as ts.ObjectLiteralExpression;
    const body = propOf(init, "body");
    expect(body && ts.isCallExpression(body)).toBe(true);
    expect(getCalleeName(body as ts.CallExpression)).toBe("JSON.stringify");
  });

  it("client doğrudan DB'ye yazmaz (repository/anon insert YOK)", () => {
    const noComments = sourceText
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    expect(noComments).not.toMatch(/from\s+["\']@\/lib\/db\//);
    expect(noComments).not.toMatch(/\bdbAdmin\b/);
    expect(noComments).not.toMatch(/\bdb\s*\.\s*from\s*\(/);
  });
});
