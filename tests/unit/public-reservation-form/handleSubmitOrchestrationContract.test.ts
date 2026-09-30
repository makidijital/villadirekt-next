/* ===============================================================
   🛡️ ReservationForm > handleSubmit — API DELEGATION CONTRACT (AST)
   ===============================================================
   ⚠️ MİMARİ DEĞİŞİKLİĞİ (üretim kodu DEĞİŞMEDİ — test ona hizalandı):
     PHASE 3 "PII-SAFE CREATE" ile client-side anon `createReservation`
     KALDIRILDI. Artık `POST /api/public/reservations` çağrılır; INSERT
     server'da service_role ile yapılır (migration 040 sonrası anon
     INSERT reddedilir) ve response yalnız `{ id, reservation_no }`
     döner. Ayrıca `alert()` yerine inline banner state kullanılır.

     Bu testin ESKİ hâli tam olarak KAPATILAN mimariyi donduruyordu
     (client-side insert + alert). Eski beklentiler geri getirilmedi;
     her invariant YENİ mimarideki karşılığıyla — ve daha sıkı biçimde
     (HTTP method, endpoint, payload zinciri, sıra, EXACTLY ONCE,
     PII/hata-sızıntısı guard'ları) — yeniden ifade edildi.

   FREEZE EDİLEN KONTRATLAR (public submit flow):
     1. validatePublicReservationForm called FIRST
     2. early return if errors > 0 (setErrors + return; setLoading YOK)
     3. setLoading(true) BEFORE try
     4. AWAITED fetch("/api/public/reservations", { method: "POST" })
        body = JSON.stringify(buildPublicReservationPayload(...))
     5. FIRE-FORGET dispatchPublicReservationRequestMail (conditional,
        insert SONRASI)
     6. success state sırası: setSubmitError(null) → setForm(factory)
        → setErrors({}) → router.push(success url)
     7. catch → setSubmitError (alert DEĞİL)
     8. finally → setLoading(false)

   🔒 GÜVENLİK INVARIANT'LARI (yeni, ayrı describe):
     • client'tan doğrudan DB/repository/anon INSERT erişimi YOK
     • server'ın ham hata metni UI'a SIZMAZ (dictionary metni kullanılır)
     • response'tan yalnız `reservation.id` okunur — PII okunmaz
=============================================================== */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC_PATH = resolve(
  process.cwd(),
  "app/components/reservation/ReservationForm.tsx"
);
const sourceText = readFileSync(SRC_PATH, "utf8");
const sourceFile = ts.createSourceFile(
  "ReservationForm.tsx",
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
    out.push({ name: getCalleeName(expr.expression), awaited: true, conditional });
    return;
  }
  if (ts.isCallExpression(expr)) {
    out.push({ name: getCalleeName(expr), awaited: false, conditional });
  }
}

const handleSubmit = findArrowFn("handleSubmit");
const seq = collectCallSequence(handleSubmit);
const idx = (name: string) => seq.findIndex((e) => e.name === name);

/* ---------------- Derin çağrı arama ----------------
   `collectCallSequence` yalnız EN DIŞTAKİ çağrıyı kaydeder; yeni
   mimaride payload builder `fetch(...)` argümanının içinde iç içe
   duruyor. Bu yardımcı argümanlara da iner. */
function findCallsDeep(node: ts.Node, name: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  function walk(n: ts.Node) {
    if (ts.isCallExpression(n) && getCalleeName(n) === name) out.push(n);
    ts.forEachChild(n, walk);
  }
  walk(node);
  return out;
}

/** Object literal'dan bir property'nin initializer'ını döndürür. */
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

/** handleSubmit içindeki TEK fetch çağrısı. */
function theFetchCall(): ts.CallExpression {
  const calls = findCallsDeep(handleSubmit, "fetch");
  if (calls.length !== 1) {
    throw new Error(`handleSubmit içinde 1 fetch bekleniyordu, ${calls.length} bulundu`);
  }
  return calls[0];
}

/** Yorumları çıkarılmış kaynak (yorumdaki kelimeler guard'ı yanıltmasın). */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("ReservationForm handleSubmit — pre-try guards", () => {
  it("validatePublicReservationForm called as first call (top-level)", () => {
    const validateIdx = idx("validatePublicReservationForm");
    expect(validateIdx).toBe(0);
    expect(seq[validateIdx].awaited).toBe(false);
    expect(seq[validateIdx].conditional).toBe(false);
  });

  it("early return guard: setErrors + return when errors > 0", () => {
    /* Look for if statement with setErrors + return in conditional branch. */
    let foundGuard = false;
    for (const stmt of handleSubmit.statements) {
      if (ts.isTryStatement(stmt)) break;
      if (ts.isIfStatement(stmt) && ts.isBlock(stmt.thenStatement)) {
        const hasSetErrors = stmt.thenStatement.statements.some(
          (s) =>
            ts.isExpressionStatement(s) &&
            ts.isCallExpression(s.expression) &&
            getCalleeName(s.expression) === "setErrors"
        );
        const hasReturn = stmt.thenStatement.statements.some(ts.isReturnStatement);
        if (hasSetErrors && hasReturn) foundGuard = true;
      }
    }
    expect(foundGuard).toBe(true);
  });

  it("setLoading(true) called BEFORE try block", () => {
    let setLoadingIdx = -1;
    let tryIdx = -1;
    handleSubmit.statements.forEach((s, i) => {
      if (
        ts.isExpressionStatement(s) &&
        ts.isCallExpression(s.expression) &&
        getCalleeName(s.expression) === "setLoading"
      ) {
        if (setLoadingIdx === -1) setLoadingIdx = i;
      }
      if (ts.isTryStatement(s) && tryIdx === -1) tryIdx = i;
    });
    expect(setLoadingIdx).toBeGreaterThanOrEqual(0);
    expect(setLoadingIdx).toBeLessThan(tryIdx);
  });
});

describe("ReservationForm handleSubmit — API delegation (POST /api/public/reservations)", () => {
  it("tek bir fetch çağrısı var ve AWAITED (EXACTLY ONCE)", () => {
    /* INVARIANT: eski "AWAITED createReservation + EXACTLY ONCE insert"
       kontratının yeni mimarideki karşılığı — tek bir server write. */
    expect(findCallsDeep(handleSubmit, "fetch").length).toBe(1);
    const i = idx("fetch");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(seq[i].awaited).toBe(true);
    expect(seq[i].conditional).toBe(false);
  });

  it("endpoint TAM OLARAK /api/public/reservations", () => {
    const url = theFetchCall().arguments[0];
    expect(ts.isStringLiteral(url)).toBe(true);
    expect((url as ts.StringLiteral).text).toBe("/api/public/reservations");
  });

  it("HTTP method POST ve Content-Type application/json", () => {
    const init = theFetchCall().arguments[1];
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

  it("body = JSON.stringify(buildPublicReservationPayload(...)) — payload zinciri", () => {
    /* INVARIANT: eski "buildPublicReservationPayload BEFORE insert"
       kontratı. Artık builder, write çağrısının ARGÜMANI olduğu için
       "önce/sonra" yerine YAPISAL İÇERME ile kanıtlanır: gövdeye giden
       tek veri kaynağı builder'dır. */
    const init = theFetchCall().arguments[1] as ts.ObjectLiteralExpression;
    const body = propOf(init, "body");
    expect(body && ts.isCallExpression(body)).toBe(true);

    const bodyCall = body as ts.CallExpression;
    expect(getCalleeName(bodyCall)).toBe("JSON.stringify");

    const inner = bodyCall.arguments[0];
    expect(ts.isCallExpression(inner)).toBe(true);
    expect(getCalleeName(inner as ts.CallExpression)).toBe(
      "buildPublicReservationPayload"
    );
  });

  it("buildPublicReservationPayload EXACTLY ONCE ve yalnız fetch body'sinde", () => {
    const all = findCallsDeep(handleSubmit, "buildPublicReservationPayload");
    expect(all.length).toBe(1);
    const inFetch = findCallsDeep(
      theFetchCall(),
      "buildPublicReservationPayload"
    );
    expect(inFetch.length).toBe(1);
  });

  it("dispatchPublicReservationRequestMail FIRE-FORGET, conditional, fetch SONRASI", () => {
    const fetchIdx = idx("fetch");
    const mailIdx = idx("dispatchPublicReservationRequestMail");
    expect(mailIdx).toBeGreaterThanOrEqual(0);
    expect(fetchIdx).toBeLessThan(mailIdx);
    expect(seq[mailIdx].awaited).toBe(false);
    expect(seq[mailIdx].conditional).toBe(true); // inside `if (reservationId)`
  });

  it("success state sırası: setSubmitError(null) → setForm → setErrors → router.push", () => {
    /* INVARIANT: eski "alert → setForm → setErrors" sırası. alert()
       inline banner state'e taşındığı için ilk adım setSubmitError(null);
       sıra garantisi AYNEN korunuyor, üstüne redirect adımı eklendi. */
    const mailIdx = idx("dispatchPublicReservationRequestMail");
    const clearBannerIdx = seq.findIndex(
      (e, i) => e.name === "setSubmitError" && !e.conditional && i > mailIdx
    );
    const setFormIdx = idx("setForm");
    const successSetErrorsIdx = seq.findIndex(
      (e, i) => e.name === "setErrors" && !e.conditional && i > setFormIdx
    );
    const pushIdx = idx("router.push");

    expect(clearBannerIdx).toBeGreaterThan(mailIdx);
    expect(setFormIdx).toBeGreaterThan(clearBannerIdx);
    expect(successSetErrorsIdx).toBeGreaterThan(setFormIdx);
    expect(pushIdx).toBeGreaterThan(successSetErrorsIdx);
  });

  it("setForm reset ARGÜMANI initialPublicReservationFormData() factory'sidir", () => {
    /* Eskiden yalnız "factory bir yerde geçiyor mu" bakılıyordu; artık
       gerçekten setForm'a geçirildiği yapısal olarak doğrulanır. */
    const setFormCalls = findCallsDeep(handleSubmit, "setForm");
    expect(setFormCalls.length).toBe(1);
    const arg = setFormCalls[0].arguments[0];
    expect(ts.isCallExpression(arg)).toBe(true);
    expect(getCalleeName(arg as ts.CallExpression)).toBe(
      "initialPublicReservationFormData"
    );
  });
});

describe("ReservationForm handleSubmit — catch + finally", () => {
  it("catch bloğu inline banner state'i set eder (alert DEĞİL)", () => {
    /* INVARIANT: eski "catch → alert(err.message)" — kullanıcıya hata
       geri bildirimi. alert() modern inline banner'a taşındı; geri
       bildirimin VARLIĞI aynen kilitleniyor, alert geri getirilmiyor. */
    const tryStmt = handleSubmit.statements.find(ts.isTryStatement);
    expect(tryStmt?.catchClause).toBeTruthy();
    const catchBlock = tryStmt!.catchClause!.block;

    const names = catchBlock.statements
      .filter(ts.isExpressionStatement)
      .map((st) => st.expression)
      .filter(ts.isCallExpression)
      .map(getCalleeName);

    expect(names).toContain("setSubmitError");
    expect(names).not.toContain("alert");
  });

  it("handleSubmit'in TAMAMINDA alert() kullanılmaz", () => {
    expect(findCallsDeep(handleSubmit, "alert").length).toBe(0);
  });

  it("finally block calls setLoading", () => {
    const tryStmt = handleSubmit.statements.find(ts.isTryStatement);
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

describe("ReservationForm handleSubmit — invariants (EXACTLY ONCE)", () => {
  it("validatePublicReservationForm called EXACTLY ONCE", () => {
    expect(seq.filter((e) => e.name === "validatePublicReservationForm").length).toBe(1);
  });

  it("server write (fetch) called EXACTLY ONCE", () => {
    expect(findCallsDeep(handleSubmit, "fetch").length).toBe(1);
  });

  it("dispatchPublicReservationRequestMail called EXACTLY ONCE", () => {
    expect(
      seq.filter((e) => e.name === "dispatchPublicReservationRequestMail").length
    ).toBe(1);
  });
});

describe("ReservationForm handleSubmit — 🔒 güvenlik invariant'ları", () => {
  const fileNoComments = stripComments(sourceText);

  it("client'ta doğrudan DB / repository / anon INSERT erişimi YOK", () => {
    /* PHASE 3 güvenlik düzeltmesinin geri alınmasını engeller. */
    expect(fileNoComments).not.toMatch(/from\s+["']@\/lib\/db\//);
    expect(fileNoComments).not.toMatch(/\bdbAdmin\b/);
    expect(fileNoComments).not.toMatch(/\bdb\s*\.\s*from\s*\(/);
    expect(fileNoComments).not.toMatch(/\.insert\s*\(/);
    /* client-side `createReservation` bir daha import/çağrı olmamalı
       (yalnız açıklama yorumlarında geçebilir → yorumlar strip edildi). */
    expect(fileNoComments).not.toMatch(/\bcreateReservation\s*\(/);
    expect(fileNoComments).not.toMatch(/import[^;]*\bcreateReservation\b/);
  });

  it("server'ın HAM hata metni UI'a sızdırılmaz", () => {
    /* Route'un TR mesajları, rate-limit'in İngilizce gövdesi ve ham DB
       hata metni locale dışıdır → UI dictionary metni gösterir. */
    const body = stripComments(handleSubmit.getText());
    expect(body).not.toMatch(/json\s*[.?]*\s*\.?\s*error/);
    expect(body).toContain("dict.form.errorGeneric");
    expect(body).toContain("dict.form.errorDatesUnavailable");
  });

  it("response'tan YALNIZ reservation.id okunur (PII okunmaz)", () => {
    const body = stripComments(handleSubmit.getText());
    const reads = [...new Set(body.match(/json[?.]*\.[A-Za-z_]+/g) || [])].sort();
    /* İzin verilen TEK okuma kümesi: başarı bayrağı + reservation (→ .id).
       Buraya yeni bir alan eklenirse test kırılır — PII sızıntısı guard'ı. */
    expect(reads).toEqual(["json.reservation", "json?.ok"]);
    for (const pii of ["name", "email", "phone", "identity_number", "address"]) {
      expect(body).not.toContain(`json.${pii}`);
      expect(body).not.toContain(`reservation.${pii}`);
    }
  });
});
