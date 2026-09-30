/* ===============================================================
   🛡️ SQL DERLEYİCİ (pure) — veri erişim katmanının çekirdeği
   ===============================================================
   AMAÇ:
     Yapısal bir sorgu tanımını (descriptor) parametreli PostgreSQL
     metnine + parametre dizisine çevirir. Hiçbir bağlantı/sürücü
     bilmez; yalnız SQL üretir. Böylece izole test edilebilir ve
     bakımı kolaydır.

   İLKELER:
     - Değerler DAİMA parametrelenir ($1, $2, ...) → injection yok.
     - Identifier'lar (tablo/kolon) doğrulanır + çift-tırnakla
       kaçırılır → rezerve kelime / özel karakter güvenli.
     - Saf fonksiyon: aynı girdi → aynı çıktı; yan etki yok.
     - Teknoloji-bağımsız: hiçbir dış servis/istemci ismi taşımaz.
   =============================================================== */

import { isRealArrayColumn } from "./pg-array-columns";

/** Derlenmiş SQL — metin + sıralı parametre değerleri. */
export interface CompiledSql {
  readonly text: string;
  readonly params: ReadonlyArray<unknown>;
}

export type SqlDirection = "asc" | "desc";

/** Karşılaştırma operatörleri (repo yüzeyinin ihtiyacı kadar). */
export type CompareOp = "=" | "<>" | ">" | ">=" | "<" | "<=" | "like" | "ilike";

/** WHERE koşulu — sonlu, ayrık birlik (discriminated union). */
export type WhereCondition =
  | { readonly kind: "compare"; readonly column: string; readonly op: CompareOp; readonly value: unknown }
  | { readonly kind: "in"; readonly column: string; readonly values: ReadonlyArray<unknown> }
  | { readonly kind: "is"; readonly column: string; readonly value: null | boolean; readonly negated: boolean }
  | { readonly kind: "not"; readonly condition: WhereCondition }
  | { readonly kind: "or"; readonly conditions: ReadonlyArray<WhereCondition> }
  | { readonly kind: "and"; readonly conditions: ReadonlyArray<WhereCondition> };

/** ORDER BY terimi. */
export interface OrderTerm {
  readonly column: string;
  readonly direction: SqlDirection;
  readonly nullsFirst?: boolean;
}

/** ON CONFLICT davranışı (upsert). */
export interface OnConflict {
  /** Çakışma kolon(lar)ı (unique/pk). */
  readonly columns: ReadonlyArray<string>;
  /** true → DO UPDATE (çakışan kolonlar hariç tümünü EXCLUDED'dan set eder); false → DO NOTHING. */
  readonly update: boolean;
}

/**
 * İlişkili (embed) alt-sorgu tanımı — SOMUT. Bu tip hiçbir ilişki
 * bilgisini KENDİ ÜRETMEZ; keys/table/cardinality çağıran (builder)
 * tarafından metadata'dan çözülüp verilir. Compiler yalnız SQL üretir.
 *   one  → tek JSON obje (yoksa null)
 *   many → JSON dizi (yoksa [])
 */
export interface EmbedSpec {
  /** Sonuçtaki alan adı (alias). */
  readonly alias: string;
  /** Hedef tablo. */
  readonly table: string;
  readonly cardinality: "one" | "many";
  /** Parent tablodaki kolon. */
  readonly localKey: string;
  /** Hedef tablodaki kolon. */
  readonly foreignKey: string;
  /** Embed'in düz (leaf) kolonları. */
  readonly columns: ReadonlyArray<string>;
  /** `many` için sıralama (opsiyonel). */
  readonly orderBy?: ReadonlyArray<OrderTerm>;
  /** `many` için satır limiti (opsiyonel; ör. yalnız kapak görseli). */
  readonly limit?: number;
  /** İç içe embed'ler (opsiyonel). */
  readonly embeds?: ReadonlyArray<EmbedSpec>;
}

export interface SelectDescriptor {
  readonly kind: "select";
  readonly table: string;
  /** Boş veya ["*"] → tüm kolonlar. */
  readonly columns: ReadonlyArray<string>;
  /** İlişkili alt-sorgular (opsiyonel). */
  readonly embeds?: ReadonlyArray<EmbedSpec>;
  readonly where?: ReadonlyArray<WhereCondition>;
  readonly orderBy?: ReadonlyArray<OrderTerm>;
  readonly limit?: number;
  readonly offset?: number;
  /** true → satır yerine `count(*)::int AS count` (kolon/embed/order yok). */
  readonly count?: boolean;
}

export interface InsertDescriptor {
  readonly kind: "insert";
  readonly table: string;
  readonly rows: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly returning?: ReadonlyArray<string>;
  readonly onConflict?: OnConflict;
}

export interface UpdateDescriptor {
  readonly kind: "update";
  readonly table: string;
  readonly set: Readonly<Record<string, unknown>>;
  readonly where?: ReadonlyArray<WhereCondition>;
  readonly returning?: ReadonlyArray<string>;
}

export interface DeleteDescriptor {
  readonly kind: "delete";
  readonly table: string;
  readonly where?: ReadonlyArray<WhereCondition>;
  readonly returning?: ReadonlyArray<string>;
}

export type QueryDescriptor =
  | SelectDescriptor
  | InsertDescriptor
  | UpdateDescriptor
  | DeleteDescriptor;

/* ---------------------------------------------------------------
   IDENTIFIER GÜVENLİĞİ
   --------------------------------------------------------------- */

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Tablo/kolon adını doğrular + çift-tırnakla kaçırır. `table.column`
 *  ve `*` desteklenir; başka her şey reddedilir (defensive). */
function quoteIdent(name: string): string {
  if (name === "*") return "*";
  const parts = name.split(".");
  return parts
    .map((part) => {
      if (part === "*") return "*";
      if (!IDENT_RE.test(part)) {
        throw new Error(`Geçersiz identifier: "${name}"`);
      }
      return `"${part}"`;
    })
    .join(".");
}

/* ---------------------------------------------------------------
   PARAMETRE TOPLAYICI — $1, $2, ... sırasını yönetir.
   --------------------------------------------------------------- */

class ParamBag {
  private readonly values: unknown[] = [];
  /** Değeri ekler, placeholder ($n) döndürür. */
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
  list(): unknown[] {
    return this.values;
  }
}

/* ---------------------------------------------------------------
   INSERT/UPDATE DEĞER KODLAYICI — jsonb parity (eski sağlayıcı/PostgREST)
   ---------------------------------------------------------------
   node-pg JS dizisini array-literal (`{a,b}`), plain objeyi ise JSON'a
   serialize eder. Dizi tutan `jsonb` kolonlar (ör. sidebar_permissions)
   JSON bekler → array-literal HATA verir. Bu yüzden:
     • JS dizisi → GERÇEK array kolonuysa (registry) pg-literal; değilse
       jsonb kabul edilip JSON metni + `::jsonb`.
     • plain obje → jsonb (JSON metni + `::jsonb`) — eski sağlayıcı ile birebir.
     • null/undefined/scalar/Date → node-pg default (dokunulmaz).
   Böylece jsonb (dizi+obje) doğru, gerçek text[]/uuid[] korunur. */
function isPlainObject(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

function addColumnValue(
  table: string,
  column: string,
  value: unknown,
  params: ParamBag
): string {
  if (value !== null && value !== undefined) {
    const asJsonb =
      isPlainObject(value) ||
      (Array.isArray(value) && !isRealArrayColumn(table, column));
    if (asJsonb) {
      return `${params.add(JSON.stringify(value))}::jsonb`;
    }
  }
  return params.add(value);
}

/* ---------------------------------------------------------------
   WHERE DERLEYİCİ
   --------------------------------------------------------------- */

function compileCondition(cond: WhereCondition, params: ParamBag): string {
  switch (cond.kind) {
    case "compare":
      return `${quoteIdent(cond.column)} ${cond.op} ${params.add(cond.value)}`;
    case "in": {
      if (cond.values.length === 0) {
        /* Boş IN → daima false (SQL'de IN () geçersizdir). */
        return "FALSE";
      }
      const placeholders = cond.values.map((v) => params.add(v)).join(", ");
      return `${quoteIdent(cond.column)} IN (${placeholders})`;
    }
    case "is": {
      const literal =
        cond.value === null ? "NULL" : cond.value ? "TRUE" : "FALSE";
      return `${quoteIdent(cond.column)} IS ${cond.negated ? "NOT " : ""}${literal}`;
    }
    case "not":
      return `NOT (${compileCondition(cond.condition, params)})`;
    case "or": {
      if (cond.conditions.length === 0) return "TRUE";
      const parts = cond.conditions.map((c) => compileCondition(c, params));
      return `(${parts.join(" OR ")})`;
    }
    case "and": {
      /* Boş AND → nötr eleman TRUE (WHERE'i etkilemez). */
      if (cond.conditions.length === 0) return "TRUE";
      const parts = cond.conditions.map((c) => compileCondition(c, params));
      return `(${parts.join(" AND ")})`;
    }
  }
}

function compileWhere(
  where: ReadonlyArray<WhereCondition> | undefined,
  params: ParamBag
): string {
  if (!where || where.length === 0) return "";
  const parts = where.map((c) => compileCondition(c, params));
  return ` WHERE ${parts.join(" AND ")}`;
}

function compileReturning(returning: ReadonlyArray<string> | undefined): string {
  if (!returning || returning.length === 0) return "";
  const cols = returning.map(quoteIdent).join(", ");
  return ` RETURNING ${cols}`;
}

function compileColumns(columns: ReadonlyArray<string>): string {
  if (columns.length === 0) return "*";
  if (columns.length === 1 && columns[0] === "*") return "*";
  return columns.map(quoteIdent).join(", ");
}

/* ---------------------------------------------------------------
   EMBED (İLİŞKİLİ ALT-SORGU) → scalar subquery + JSON
   ---------------------------------------------------------------
   Her embed, SELECT listesinde korelasyonlu bir alt-sorgu ifadesidir
   (JOIN değil): one → tek JSON obje, many → JSON dizi. Alt-sorgular
   parametre taşımaz (yalnız identifier korelasyonu). */

/** İç içe embed'lerde çakışmayan tablo alias'ları üretir (e0, e1, ...). */
class AliasGen {
  private n = 0;
  next(): string {
    return `e${this.n++}`;
  }
}

/** JSON anahtarını doğrular + tek-tırnak literal döndürür. */
function jsonKey(name: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(`Geçersiz JSON anahtarı: "${name}"`);
  }
  return `'${name}'`;
}

/** `json_build_object('col', ref."col", 'alias', <nested subquery>, ...)`. */
function jsonBuildObject(
  refQuoted: string,
  columns: ReadonlyArray<string>,
  embeds: ReadonlyArray<EmbedSpec> | undefined,
  gen: AliasGen
): string {
  const pairs: string[] = [];
  for (const col of columns) {
    pairs.push(`${jsonKey(col)}, ${refQuoted}.${quoteIdent(col)}`);
  }
  if (embeds) {
    for (const e of embeds) {
      pairs.push(`${jsonKey(e.alias)}, ${compileEmbedExpr(e, refQuoted, gen)}`);
    }
  }
  return `json_build_object(${pairs.join(", ")})`;
}

/** Tek embed → korelasyonlu scalar alt-sorgu ifadesi (AS ekleyen caller). */
function compileEmbedExpr(
  spec: EmbedSpec,
  parentRefQuoted: string,
  gen: AliasGen
): string {
  const aliasQuoted = quoteIdent(gen.next());
  const obj = jsonBuildObject(aliasQuoted, spec.columns, spec.embeds, gen);
  const correlation = `${aliasQuoted}.${quoteIdent(spec.foreignKey)} = ${parentRefQuoted}.${quoteIdent(spec.localKey)}`;
  const from = `FROM ${quoteIdent(spec.table)} ${aliasQuoted} WHERE ${correlation}`;

  if (spec.cardinality === "one") {
    return `(SELECT ${obj} ${from})`;
  }

  let orderSql = "";
  if (spec.orderBy && spec.orderBy.length > 0) {
    const terms = spec.orderBy.map(
      (o) =>
        `${aliasQuoted}.${quoteIdent(o.column)} ${o.direction === "desc" ? "DESC" : "ASC"}`
    );
    orderSql = ` ORDER BY ${terms.join(", ")}`;
  }

  /* Limit varsa: önce sırala+limitle (türetilmiş tablo), sonra topla. */
  if (typeof spec.limit === "number") {
    const inner = `SELECT ${obj} AS __row ${from}${orderSql} LIMIT ${Math.floor(spec.limit)}`;
    return `(SELECT coalesce(json_agg(__lim.__row), '[]'::json) FROM (${inner}) __lim)`;
  }

  return `(SELECT coalesce(json_agg(${obj}${orderSql}), '[]'::json) ${from})`;
}

/* ---------------------------------------------------------------
   STATEMENT DERLEYİCİLERİ
   --------------------------------------------------------------- */

function compileSelect(q: SelectDescriptor): CompiledSql {
  const params = new ParamBag();
  const parentRef = quoteIdent(q.table);

  if (q.count) {
    const countText = `SELECT count(*)::int AS "count" FROM ${parentRef}${compileWhere(q.where, params)}`;
    return { text: countText, params: params.list() };
  }

  const selectParts: string[] = [compileColumns(q.columns)];
  if (q.embeds && q.embeds.length > 0) {
    const gen = new AliasGen();
    for (const e of q.embeds) {
      selectParts.push(
        `${compileEmbedExpr(e, parentRef, gen)} AS ${quoteIdent(e.alias)}`
      );
    }
  }

  let text = `SELECT ${selectParts.join(", ")} FROM ${parentRef}`;
  text += compileWhere(q.where, params);

  if (q.orderBy && q.orderBy.length > 0) {
    const terms = q.orderBy.map((o) => {
      const dir = o.direction === "desc" ? "DESC" : "ASC";
      const nulls =
        o.nullsFirst === undefined
          ? ""
          : o.nullsFirst
            ? " NULLS FIRST"
            : " NULLS LAST";
      return `${quoteIdent(o.column)} ${dir}${nulls}`;
    });
    text += ` ORDER BY ${terms.join(", ")}`;
  }

  if (typeof q.limit === "number") text += ` LIMIT ${params.add(q.limit)}`;
  if (typeof q.offset === "number") text += ` OFFSET ${params.add(q.offset)}`;

  return { text, params: params.list() };
}

function compileInsert(q: InsertDescriptor): CompiledSql {
  const params = new ParamBag();
  if (q.rows.length === 0) {
    throw new Error("INSERT: en az bir satır gerekli.");
  }
  /* Kolon kümesi ilk satırdan; tüm satırlar aynı kolon setini paylaşır. */
  const columns = Object.keys(q.rows[0]);
  const colSql = columns.map(quoteIdent).join(", ");

  const valuesSql = q.rows
    .map((row) => {
      const cells = columns.map((c) =>
        addColumnValue(q.table, c, row[c], params)
      );
      return `(${cells.join(", ")})`;
    })
    .join(", ");

  let text = `INSERT INTO ${quoteIdent(q.table)} (${colSql}) VALUES ${valuesSql}`;

  if (q.onConflict) {
    const target = q.onConflict.columns.map(quoteIdent).join(", ");
    if (!q.onConflict.update) {
      text += ` ON CONFLICT (${target}) DO NOTHING`;
    } else {
      const conflictSet = new Set(q.onConflict.columns);
      const updates = columns
        .filter((c) => !conflictSet.has(c))
        .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`);
      text += updates.length
        ? ` ON CONFLICT (${target}) DO UPDATE SET ${updates.join(", ")}`
        : ` ON CONFLICT (${target}) DO NOTHING`;
    }
  }

  text += compileReturning(q.returning);
  return { text, params: params.list() };
}

function compileUpdate(q: UpdateDescriptor): CompiledSql {
  const params = new ParamBag();
  const columns = Object.keys(q.set);
  if (columns.length === 0) {
    throw new Error("UPDATE: en az bir kolon gerekli.");
  }
  const assignments = columns
    .map(
      (c) => `${quoteIdent(c)} = ${addColumnValue(q.table, c, q.set[c], params)}`
    )
    .join(", ");

  let text = `UPDATE ${quoteIdent(q.table)} SET ${assignments}`;
  text += compileWhere(q.where, params);
  text += compileReturning(q.returning);
  return { text, params: params.list() };
}

function compileDelete(q: DeleteDescriptor): CompiledSql {
  const params = new ParamBag();
  let text = `DELETE FROM ${quoteIdent(q.table)}`;
  text += compileWhere(q.where, params);
  text += compileReturning(q.returning);
  return { text, params: params.list() };
}

/* ---------------------------------------------------------------
   GENEL GİRİŞ
   --------------------------------------------------------------- */

/** Sorgu tanımını parametreli SQL'e derler. */
export function compile(query: QueryDescriptor): CompiledSql {
  switch (query.kind) {
    case "select":
      return compileSelect(query);
    case "insert":
      return compileInsert(query);
    case "update":
      return compileUpdate(query);
    case "delete":
      return compileDelete(query);
  }
}
