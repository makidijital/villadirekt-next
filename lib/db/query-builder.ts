import "server-only";

import type { QueryResultRow } from "pg";

import {
  compile,
  type WhereCondition,
  type OrderTerm,
  type OnConflict,
  type EmbedSpec,
  type CompareOp,
  type QueryDescriptor,
} from "./query-compiler";
import { getRelation } from "./relation-metadata";
import {
  nativeDbProvider,
  type DbResult,
  type DbSingleResult,
  type DbEnforcedSingleResult,
} from "./native-db.provider";

/* ===============================================================
   🛡️ FLUENT QUERY BUILDER (server-only)
   ===============================================================
   TEK SORUMLULUK:
     Repository'lerin fluent çağrılarını (`.select().eq()...`) yapısal
     bir descriptor'a çevirir; çalıştırmayı `query-compiler` (SQL) ve
     provider (yürütme) katmanlarına DELEGE eder. Kendisi SQL üretmez,
     bağlantı yönetmez.

   ⚠️ KAPSAM — YALNIZ repo yüzeyi (YAGNI):
     Bu katman genel amaçlı bir query builder / ORM / DSL DEĞİLDİR.
     Yalnız mevcut repository'lerin GERÇEKTEN çağırdığı metodları taşır.
     Yeni metod, ancak bir repository onu kullanıyorsa eklenir.

   DESTEKLENEN (kanıtlı kullanım):
     select · insert · update · upsert(onConflict) · delete ·
     eq · neq · gt · gte · lt · lte · in · is · not(…,"is",…) · ilike ·
     order · limit · range · single · maybeSingle · (thenable → {data,error})
   =============================================================== */

type OrderOptions = {
  ascending?: boolean;
  nullsFirst?: boolean;
  /** Verilirse sıralama embed'e aittir (top-level'a uygulanmaz). */
  referencedTable?: string;
};

/** Tek satır bekleyen terminal (`.single()` / `.maybeSingle()`).
 *  Sonuç zarfı tipi `R` ile parametreli: `.single()` KESİN zarfı
 *  (`DbEnforcedSingleResult`, discriminated), `.maybeSingle()` nullable
 *  zarfı (`DbSingleResult`) yüzeyler. Tek gövde/tek kod yolu. */
class SingleResultBuilder<R> implements PromiseLike<R> {
  constructor(private readonly run: () => Promise<R>) {}
  then<TResult1 = R, TResult2 = never>(
    onfulfilled?: ((v: R) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

export class QueryBuilder<T extends QueryResultRow = QueryResultRow>
  implements PromiseLike<DbResult<T>>
{
  private readonly table: string;
  private mode: "select" | "insert" | "update" | "delete" = "select";

  private columns: string[] = [];
  private embedRequests: EmbedRequest[] = [];
  private returning: string[] = [];
  private readonly conditions: WhereCondition[] = [];
  private readonly orderTerms: OrderTerm[] = [];
  private limitValue?: number;
  private offsetValue?: number;

  private insertRows: Array<Record<string, unknown>> = [];
  private updateSet: Record<string, unknown> = {};
  private onConflict?: OnConflict;
  private countExact = false;
  private headOnly = false;
  private deleteCountExact = false;
  private readonly embedLimits = new Map<string, number>();

  constructor(table: string) {
    this.table = table;
  }

  /* ---------------- KOLON / MUTASYON ---------------- */

  /** Okuma → kolonlar (+ embed'ler); mutasyon sonrası → RETURNING. */
  select(
    columns?: string,
    options?: { count?: "exact"; head?: boolean }
  ): this {
    const parsed = parseSelectList(columns ?? "");
    if (this.mode === "select") {
      this.columns = parsed.columns;
      this.embedRequests = parsed.embeds;
      if (options?.count === "exact") this.countExact = true;
      if (options?.head) this.headOnly = true;
    } else {
      /* RETURNING düz kolonlarla sınırlı (embed dönüşü yok). */
      this.returning = parsed.columns.length === 0 ? ["*"] : parsed.columns;
    }
    return this;
  }

  insert(values: Record<string, unknown> | Array<Record<string, unknown>>): this {
    this.mode = "insert";
    this.insertRows = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.mode = "update";
    this.updateSet = values;
    return this;
  }

  upsert(
    values: Record<string, unknown> | Array<Record<string, unknown>>,
    options: { onConflict: string }
  ): this {
    this.mode = "insert";
    this.insertRows = Array.isArray(values) ? values : [values];
    this.onConflict = {
      columns: options.onConflict.split(",").map((c) => c.trim()),
      update: true,
    };
    return this;
  }

  delete(options?: { count?: "exact" }): this {
    this.mode = "delete";
    if (options?.count === "exact") this.deleteCountExact = true;
    return this;
  }

  /* ---------------- FİLTRELER ---------------- */

  eq(column: string, value: unknown): this {
    return this.compare(column, "=", value);
  }
  neq(column: string, value: unknown): this {
    return this.compare(column, "<>", value);
  }
  gt(column: string, value: unknown): this {
    return this.compare(column, ">", value);
  }
  gte(column: string, value: unknown): this {
    return this.compare(column, ">=", value);
  }
  lt(column: string, value: unknown): this {
    return this.compare(column, "<", value);
  }
  lte(column: string, value: unknown): this {
    return this.compare(column, "<=", value);
  }
  ilike(column: string, pattern: string): this {
    return this.compare(column, "ilike", pattern);
  }

  in(column: string, values: ReadonlyArray<unknown>): this {
    this.conditions.push({ kind: "in", column, values });
    return this;
  }

  is(column: string, value: null | boolean): this {
    this.conditions.push({ kind: "is", column, value, negated: false });
    return this;
  }

  /** Repo kullanımı: `.not(col,"is",null|boolean)` → IS NOT …;
   *  `.not(col,"in","(a,b,c)")` → NOT IN (…). */
  not(
    column: string,
    operator: "is" | "in",
    value: null | boolean | string
  ): this {
    if (operator === "is") {
      this.conditions.push({
        kind: "is",
        column,
        value: value as null | boolean,
        negated: true,
      });
    } else {
      this.conditions.push({
        kind: "not",
        condition: { kind: "in", column, values: parseTupleValues(String(value)) },
      });
    }
    return this;
  }

  /** PostgreSQL OR grubu. Argüman `col.op.value,...` biçimli filtre
   *  string'i (bu projenin `.or()` kullanımına özgü, sınırlı gramer). */
  or(filter: string): this {
    this.conditions.push({ kind: "or", conditions: parseOrFilter(filter) });
    return this;
  }

  /* ---------------- SIRALAMA / SAYFALAMA ---------------- */

  order(column: string, options?: OrderOptions): this {
    /* Embed sıralaması relation-metadata'dan gelir → top-level'a ekleme. */
    if (options?.referencedTable) return this;
    this.orderTerms.push({
      column,
      direction: options?.ascending === false ? "desc" : "asc",
      nullsFirst: options?.nullsFirst,
    });
    return this;
  }

  limit(count: number, options?: { referencedTable?: string }): this {
    /* Embed limiti → ilgili embed'e (alias = referencedTable). */
    if (options?.referencedTable) {
      this.embedLimits.set(options.referencedTable, count);
      return this;
    }
    this.limitValue = count;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetValue = from;
    this.limitValue = to - from + 1;
    return this;
  }

  /* ---------------- TERMİNALLER ---------------- */

  single(): SingleResultBuilder<DbEnforcedSingleResult<T>> {
    return new SingleResultBuilder<DbEnforcedSingleResult<T>>(() =>
      nativeDbProvider.queryOne<T>(...this.compiled())
    );
  }

  maybeSingle(): SingleResultBuilder<DbSingleResult<T>> {
    return new SingleResultBuilder<DbSingleResult<T>>(() =>
      nativeDbProvider.queryMaybeOne<T>(...this.compiled())
    );
  }

  then<TResult1 = DbResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((v: DbResult<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  /* ---------------- İÇ YARDIMCILAR ---------------- */

  private compare(
    column: string,
    op: "=" | "<>" | ">" | ">=" | "<" | "<=" | "ilike",
    value: unknown
  ): this {
    this.conditions.push({ kind: "compare", column, op, value });
    return this;
  }

  private descriptor(): QueryDescriptor {
    switch (this.mode) {
      case "insert":
        return {
          kind: "insert",
          table: this.table,
          rows: this.insertRows,
          returning: this.returning.length ? this.returning : undefined,
          onConflict: this.onConflict,
        };
      case "update":
        return {
          kind: "update",
          table: this.table,
          set: this.updateSet,
          where: this.conditions.length ? this.conditions : undefined,
          returning: this.returning.length ? this.returning : undefined,
        };
      case "delete":
        return {
          kind: "delete",
          table: this.table,
          where: this.conditions.length ? this.conditions : undefined,
          returning: this.returning.length ? this.returning : undefined,
        };
      case "select":
        return {
          kind: "select",
          table: this.table,
          columns: this.columns,
          embeds: this.embedRequests.length
            ? resolveEmbeds(this.table, this.embedRequests, this.embedLimits)
            : undefined,
          where: this.conditions.length ? this.conditions : undefined,
          orderBy: this.orderTerms.length ? this.orderTerms : undefined,
          limit: this.limitValue,
          offset: this.offsetValue,
        };
    }
  }

  private compiled(): [string, unknown[]] {
    const { text, params } = compile(this.descriptor());
    return [text, params as unknown[]];
  }

  private compiledCount(): [string, unknown[]] {
    const { text, params } = compile({
      kind: "select",
      table: this.table,
      columns: [],
      where: this.conditions.length ? this.conditions : undefined,
      count: true,
    });
    return [text, params as unknown[]];
  }

  /** Yürütme: delete{count} → etkilenen satır sayısı; head → yalnız
   *  sayım; count → satır + sayım; aksi → satır. */
  private async execute(): Promise<DbResult<T>> {
    if (this.mode === "delete" && this.deleteCountExact) {
      const [text, params] = this.compiled();
      const r = await nativeDbProvider.affectedCount(text, params);
      return { data: null, error: r.error, count: r.count };
    }

    if (this.headOnly) {
      const [text, params] = this.compiledCount();
      const r = await nativeDbProvider.query<CountRow>(text, params);
      if (r.error) return { data: null, error: r.error, count: null };
      /* eski sağlayıcı `.select(col,{head:true,count})` PARITY: head isteği
         gövde döndürmez → `data: null` (dizi DEĞİL). Yalnız `count`
         anlamlıdır. */
      return { data: null, error: null, count: r.data?.[0]?.count ?? 0 };
    }

    const [text, params] = this.compiled();
    const rows = await nativeDbProvider.query<T>(text, params);
    if (!this.countExact || rows.error) return rows;

    const [ctext, cparams] = this.compiledCount();
    const cnt = await nativeDbProvider.query<CountRow>(ctext, cparams);
    return { data: rows.data, error: null, count: cnt.data?.[0]?.count ?? 0 };
  }
}

type CountRow = { count: number };

/* ---------------------------------------------------------------
   SELECT STRING PARSER + METADATA RESOLVE
   ---------------------------------------------------------------
   Repo select string'ini düz kolonlara + embed isteklerine çevirir
   (yalnız bu projenin grameri: kolon adları, `alias:hint`, iç içe
   parantez). Genel amaçlı sorgu parser'ı DEĞİL. Embed isteği sonra
   `relation-metadata` ile somut `EmbedSpec`'e çözülür. */

interface EmbedRequest {
  readonly alias: string;
  readonly columns: string[];
  readonly embeds: EmbedRequest[];
}

/** Virgülle böl — parantez içindeki virgülleri korur. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") {
      depth++;
      cur += ch;
    } else if (ch === ")") {
      depth--;
      cur += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** İlk `(` ile eşleşen `)` arasındaki içeriği döndürür. */
function extractParens(segment: string): string {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < segment.length; i++) {
    if (segment[i] === "(") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (segment[i] === ")") {
      depth--;
      if (depth === 0) return segment.slice(start, i);
    }
  }
  return start >= 0 ? segment.slice(start) : "";
}

function parseSelectList(input: string): {
  columns: string[];
  embeds: EmbedRequest[];
} {
  const columns: string[] = [];
  const embeds: EmbedRequest[] = [];

  for (const item of splitTopLevel(input)) {
    const parenIdx = item.indexOf("(");
    if (parenIdx === -1) {
      columns.push(item);
      continue;
    }
    /* embed: `alias[:hint] ( innerList )` — alias `:` öncesi. */
    const alias = item.slice(0, parenIdx).split(":")[0].trim();
    const inner = parseSelectList(extractParens(item.slice(parenIdx)));
    embeds.push({ alias, columns: inner.columns, embeds: inner.embeds });
  }

  return { columns, embeds };
}

/** Embed isteklerini metadata ile somut `EmbedSpec`'e çözer (recursive). */
function resolveEmbeds(
  parentTable: string,
  requests: ReadonlyArray<EmbedRequest>,
  embedLimits: ReadonlyMap<string, number>
): EmbedSpec[] {
  return requests.map((req) => {
    const rel = getRelation(parentTable, req.alias);
    if (!rel) {
      throw new Error(
        `Tanımsız ilişki: "${parentTable}.${req.alias}" (relation-metadata'da yok)`
      );
    }
    return {
      alias: rel.alias,
      table: rel.table,
      cardinality: rel.cardinality,
      localKey: rel.localKey,
      foreignKey: rel.foreignKey,
      columns: req.columns,
      orderBy: rel.orderBy,
      limit: embedLimits.get(rel.alias),
      embeds: req.embeds.length
        ? resolveEmbeds(rel.table, req.embeds, embedLimits)
        : undefined,
    };
  });
}

/* ---------------------------------------------------------------
   `.not(col,"in","(a,b,c)")` — tuple string → değer dizisi.
   --------------------------------------------------------------- */
/* PostgREST IN-list tuple parser — `("a","b,c","d""e")` → ['a','b,c','d"e'].
   ⚠️ PARITY: PostgREST çift-tırnağı DELIMITER olarak kullanır (virgül/özel
   karakter içeren değerler için); tırnaklar değerin PARÇASI DEĞİLDİR ve
   içteki `""` → `"` unescape edilir. Eski parser yalnız virgülle bölüp
   trim ediyordu → tırnaklı değerler (`"uid"`) tırnakla kalıp yanlış
   eşleşiyordu. Bu parser tırnak-duyarlı böler + unquote eder. */
function parseTupleValues(tuple: string): string[] {
  const inner = tuple.replace(/^\s*\(/, "").replace(/\)\s*$/, "");
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  let quoted = false; // bu token tırnakla mı geldi (→ trim/empty-filter yok)
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inQuotes) {
      if (ch === '"') {
        if (inner[i + 1] === '"') {
          cur += '"'; // "" → "
          i++;
        } else {
          inQuotes = false; // kapanış tırnağı
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
      quoted = true;
    } else if (ch === ",") {
      out.push(quoted ? cur : cur.trim());
      cur = "";
      quoted = false;
    } else {
      cur += ch;
    }
  }
  out.push(quoted ? cur : cur.trim());
  /* Boş token'ları at (ör. sondaki virgül). Repo boş uid geçmez. */
  return out.filter((v) => v.length > 0);
}

/* ---------------------------------------------------------------
   `.or()` FİLTRE STRING PARSER — PostgREST mantık ağacı (recursive)
   ---------------------------------------------------------------
   PostgREST `.or(...)` gramerini destekler:
     • Yaprak (leaf): `col.op.value` (op: eq|neq|gt|gte|lt|lte|like|ilike),
       `col.is.null|true|false`, `col.not.is.…`, `col.not.in.(...)`
     • Mantık grupları: `and(a,b,...)`, `or(a,b,...)` — İÇ İÇE (nested),
       recursive; her eleman yeniden yaprak veya grup olabilir.
     • Grup negasyonu: `not.and(...)`, `not.or(...)`.
   Top-level `.or(x,y,z)` → OR(x,y,z). Virgül bölmesi parantez-derinliği
   ve `"…"` tırnaklarını korur → grup içi virgüller bölünmez.

   ⚠️ GERİYE UYUMLU: düz filtreler (slug.eq.x,slug.ilike.x-%),
     is/not/in yaprakları AYNEN çalışır (parseOrSegment leaf parser'ı
     korundu). Yalnız and(...)/or(...) grup tanıma eklendi. */

const OR_OP_MAP: Readonly<Record<string, CompareOp>> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  like: "like",
  ilike: "ilike",
};

function parseOrFilter(filter: string): WhereCondition[] {
  return splitTopLevelOr(filter).map(parseOrElement);
}

/** Bir `.or()`/grup elemanını çözer: `and(...)`/`or(...)` grubu (nested)
 *  ise recursive alt-ağaç; değilse yaprak (`parseOrSegment`). Baştaki
 *  `not.` + `and(`/`or(` → grup negasyonu (`not.<col>...` yaprak
 *  negasyonuyla karışmaz; yaprakta `not.` kolondan SONRA gelir). */
function parseOrElement(element: string): WhereCondition {
  const seg = element.trim();

  /* Grup negasyonu: yalnız `not.` DOĞRUDAN `and(`/`or(`'dan önceyse. */
  let negated = false;
  let body = seg;
  if (body.startsWith("not.")) {
    const afterNot = body.slice(4);
    if (afterNot.startsWith("and(") || afterNot.startsWith("or(")) {
      negated = true;
      body = afterNot;
    }
  }

  let cond: WhereCondition;
  if (body.startsWith("and(") && body.endsWith(")")) {
    const inner = body.slice(4, -1);
    cond = { kind: "and", conditions: splitTopLevelOr(inner).map(parseOrElement) };
  } else if (body.startsWith("or(") && body.endsWith(")")) {
    const inner = body.slice(3, -1);
    cond = { kind: "or", conditions: splitTopLevelOr(inner).map(parseOrElement) };
  } else {
    cond = parseOrSegment(body); // yaprak (col.op.value / is / not / in)
  }

  return negated ? { kind: "not", condition: cond } : cond;
}

/** Virgülle böl — `"…"` tırnak ve parantez içini korur. */
function splitTopLevelOr(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuote = false;
  let cur = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"' && input[i - 1] !== "\\") inQuote = !inQuote;
    if (!inQuote && ch === "(") depth++;
    else if (!inQuote && ch === ")") depth--;
    else if (!inQuote && ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function parseOrSegment(segment: string): WhereCondition {
  const firstDot = segment.indexOf(".");
  const column = segment.slice(0, firstDot);
  let rest = segment.slice(firstDot + 1);

  let negated = false;
  if (rest.startsWith("not.")) {
    negated = true;
    rest = rest.slice(4);
  }

  const opDot = rest.indexOf(".");
  const op = opDot === -1 ? rest : rest.slice(0, opDot);
  const rawValue = opDot === -1 ? "" : rest.slice(opDot + 1);

  if (op === "is") {
    const value =
      rawValue === "null" ? null : rawValue === "true" ? true : false;
    return { kind: "is", column, value, negated };
  }

  const compareOp = OR_OP_MAP[op];
  if (!compareOp) {
    throw new Error(`Desteklenmeyen .or() operatörü: "${op}"`);
  }
  const condition: WhereCondition = {
    kind: "compare",
    column,
    op: compareOp,
    value: unquoteOrValue(rawValue),
  };
  return negated ? { kind: "not", condition } : condition;
}

/** `"…"` taşıma-tırnağını çıkarır + `\"`/`\\` unescape eder. */
function unquoteOrValue(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return raw;
}
