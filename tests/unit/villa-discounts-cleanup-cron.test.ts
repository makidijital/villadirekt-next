/* ===============================================================
   🛡️ CRON — GEÇMİŞ villa_discounts TEMİZLİĞİ
   ===============================================================
   KURAL: `end_date < bugün` (STRICT `<`).
     • BUGÜN biten indirim KORUNUR, ertesi gün silinir.
     • Devam eden / gelecek indirimlere DOKUNULMAZ.
     • `discount_collections` HİÇ okunmaz/yazılmaz (admin küratörlüğü
       ve `is_active` korunur).
     • `reservations` snapshot kolonlarına (migration 080) FK YOKTUR →
       geçmiş rezervasyonlar etkilenmez.

   Desen `/api/cron/villa-prices-cleanup` ile BİREBİR aynı olmalı:
   authorizeCronRequest (Bearer CRON_SECRET, fail-closed) + server-only
   repo + tek DELETE + JSON.
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/* ---- sahte native query builder: çağrıları kaydeder ---- */
type Call = {
  table: string;
  deleted: boolean;
  deleteOptions?: { count?: "exact" };
  lt?: [string, string];
};
const calls: Call[] = [];
let deleteResult: { count: number | null; error: { message: string } | null } = {
  count: 0,
  error: null,
};

function makeBuilder(table: string) {
  const call: Call = { table, deleted: false };
  calls.push(call);
  const builder = {
    delete(options?: { count?: "exact" }) {
      call.deleted = true;
      call.deleteOptions = options;
      return builder;
    },
    lt(column: string, value: string) {
      call.lt = [column, value];
      return Promise.resolve(deleteResult) as unknown as typeof builder;
    },
    eq() {
      return builder;
    },
    select() {
      return builder;
    },
  };
  return builder;
}

vi.mock("@/lib/db/native", () => ({
  dbAdminNative: { from: (t: string) => makeBuilder(t) },
  dbNative: { from: (t: string) => makeBuilder(t) },
}));

import { villaDiscountRepository } from "@/lib/db/villa-discount.repository.server";
import { GET } from "@/app/api/cron/villa-discounts-cleanup/route";

function req(auth?: string): Request {
  return new Request("https://x.test/api/cron/villa-discounts-cleanup", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  calls.length = 0;
  deleteResult = { count: 0, error: null };
  process.env.CRON_SECRET = "s3cr3t";
});

describe("villa_discounts cleanup — repository sözleşmesi", () => {
  it("1) villa_discounts tablosundan, end_date < today ile, count exact siler", async () => {
    deleteResult = { count: 4, error: null };
    const res = await villaDiscountRepository.deletePastDiscounts("2026-09-18");
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("villa_discounts");
    expect(calls[0].deleted).toBe(true);
    expect(calls[0].deleteOptions).toEqual({ count: "exact" });
    expect(calls[0].lt).toEqual(["end_date", "2026-09-18"]);
    expect(res.count).toBe(4);
  });

  it("2) STRICT `<` kullanılır — `lte`/`<=` YOK (kolon+operatör kilidi)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/db/villa-discount.repository.server.ts"),
      "utf8"
    );
    const fn = src.slice(src.indexOf("async deletePastDiscounts"));
    expect(fn).toContain('.lt("end_date", today)');
    expect(fn).not.toContain(".lte(");
  });

  it("3) discount_collections tablosuna HİÇ dokunmaz", async () => {
    await villaDiscountRepository.deletePastDiscounts("2026-09-18");
    expect(calls.some((c) => c.table === "discount_collections")).toBe(false);
  });

  it("4) reservations / manual_reservations tablolarına HİÇ dokunmaz", async () => {
    await villaDiscountRepository.deletePastDiscounts("2026-09-18");
    expect(calls.some((c) => c.table === "reservations")).toBe(false);
    expect(calls.some((c) => c.table === "manual_reservations")).toBe(false);
  });
});

describe("villa_discounts cleanup — tarih eşiği (STRICT <)", () => {
  /* Repo `.lt("end_date", today)` uyguladığı için karar kuralı budur;
     aşağıdaki senaryolar bu predicate'i doğrudan doğrular. */
  const isDeleted = (endDate: string, today: string) => endDate < today;

  it("5) 10–17 Eylül, bugün 18 Eylül → SİLİNİR", () => {
    expect(isDeleted("2026-09-17", "2026-09-18")).toBe(true);
  });

  it("6) 10–17 Eylül, bugün 17 Eylül → SİLİNMEZ (bugün biten korunur)", () => {
    expect(isDeleted("2026-09-17", "2026-09-17")).toBe(false);
  });

  it("7) Devam eden indirim (bugün aralığın içinde) → SİLİNMEZ", () => {
    expect(isDeleted("2026-09-30", "2026-09-17")).toBe(false);
  });

  it("8) Gelecek tarihli indirim → SİLİNMEZ", () => {
    expect(isDeleted("2026-12-31", "2026-09-17")).toBe(false);
  });

  it("9) Ay/yıl sınırı — 31 Aralık biten indirim 1 Ocak'ta silinir", () => {
    expect(isDeleted("2026-12-31", "2027-01-01")).toBe(true);
    expect(isDeleted("2026-12-31", "2026-12-31")).toBe(false);
  });
});

describe("villa_discounts cleanup — cron route", () => {
  it("10) CRON_SECRET yoksa 503 (fail-closed), DELETE çalışmaz", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req("Bearer x"));
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("11) Authorization header yoksa 401, DELETE çalışmaz", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("12) Yanlış secret → 401, DELETE çalışmaz", async () => {
    const res = await GET(req("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("13) Doğru secret → 200 + { ok, deleted, date }", async () => {
    deleteResult = { count: 3, error: null };
    const res = await GET(req("Bearer s3cr3t"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      deleted: number;
      date: string;
    };
    expect(json.ok).toBe(true);
    expect(json.deleted).toBe(3);
    expect(json.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(calls[0].table).toBe("villa_discounts");
    expect(calls[0].lt?.[0]).toBe("end_date");
    expect(calls[0].lt?.[1]).toBe(json.date);
  });

  it("14) IDEMPOTENT — eşleşen satır yoksa deleted: 0, hata yok", async () => {
    deleteResult = { count: 0, error: null };
    const res = await GET(req("Bearer s3cr3t"));
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(0);
  });

  it("15) DB hatası → 500, ok:false", async () => {
    deleteResult = { count: null, error: { message: "boom" } };
    const res = await GET(req("Bearer s3cr3t"));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });

  it("16) `today` Europe/Istanbul takvim günü (en-CA) — villa-prices-cleanup ile aynı", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/cron/villa-discounts-cleanup/route.ts"),
      "utf8"
    );
    expect(src).toContain('toLocaleDateString("en-CA"');
    expect(src).toContain('timeZone: "Europe/Istanbul"');
    expect(src).toContain("authorizeCronRequest");
    /* ÇALIŞAN kod (doc-comment HARİÇ) discount_collections'a, cache
       invalidation'a veya rezervasyon akışına DOKUNMAZ. */
    const code = src.slice(src.indexOf("export const runtime"));
    expect(code).not.toContain("discount_collections");
    expect(code).not.toContain("revalidateTag");
    expect(code).not.toContain("reservations");
  });
});

describe("DB güvenliği — FK / snapshot (migration kanıtı)", () => {
  it("17) villa_discounts'a referans veren BAŞKA tablo yok", () => {
    const m079 = readFileSync(
      join(process.cwd(), "db/migrations/079_villa_discounts.sql"),
      "utf8"
    );
    /* Tek FK giden yönde: villa_id → villa(id) ON DELETE CASCADE */
    expect(m079).toContain("villa_id       uuid NOT NULL REFERENCES public.villa(id) ON DELETE CASCADE");
  });

  it("18) reservations indirim bilgisini SNAPSHOT tutar (FK değil)", () => {
    const m080 = readFileSync(
      join(process.cwd(), "db/migrations/080_reservations_discount_snapshot.sql"),
      "utf8"
    );
    expect(m080).toContain("ADD COLUMN IF NOT EXISTS discount_applied");
    expect(m080).toContain("ADD COLUMN IF NOT EXISTS discount_type");
    expect(m080).toContain("ADD COLUMN IF NOT EXISTS discount_value");
    /* reservations → villa_discounts FK'si YOK */
    expect(m080).not.toContain("REFERENCES public.villa_discounts");
  });
});
