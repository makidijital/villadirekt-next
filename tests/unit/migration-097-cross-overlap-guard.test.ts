/* ===============================================================
   🛡️ MIGRATION 097 — reservations ↔ manual_reservations DB guard
   ===============================================================
   Statik kilit: migration'ın sözleşmesi (semantik) sessizce
   değişmesin. Davranış testleri yerel PostgreSQL'de ayrıca koşuldu
   (A–H senaryoları + eşzamanlılık); burada yalnız metin sözleşmesi.
=============================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "db/migrations");
const sql = readFileSync(join(dir, "097_reservations_manual_cross_overlap_guard.sql"), "utf-8");
const code = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

describe("migration 097", () => {
  it("iki yönlü trigger: reservations → manual ve manual → reservations", () => {
    expect(code).toMatch(
      /CREATE TRIGGER reservations_manual_no_overlap_trg\s+BEFORE INSERT OR UPDATE OF villa_id, start_date, end_date, status\s+ON public\.reservations/
    );
    expect(code).toMatch(
      /CREATE TRIGGER manual_reservations_reservation_no_overlap_trg\s+BEFORE INSERT OR UPDATE OF villa_id, start_date, end_date\s+ON public\.manual_reservations/
    );
  });

  it("mevcut status semantiği: yalnız pending + confirmed bloklar", () => {
    expect(code).toContain("NEW.status NOT IN ('pending', 'confirmed')");
    expect(code).toContain("r.status IN ('pending', 'confirmed')");
  });

  it("half-open [) overlap clause'u (10–15 ile 15–20 çakışmaz)", () => {
    expect(code).toMatch(/m\.start_date < NEW\.end_date\s+AND m\.end_date\s+> NEW\.start_date/);
    expect(code).toMatch(/r\.start_date < NEW\.end_date\s+AND r\.end_date\s+> NEW\.start_date/);
  });

  it("app'in mevcut hata eşlemesi için SQLSTATE 23P01", () => {
    expect((code.match(/ERRCODE = '23P01'/g) || []).length).toBe(2);
  });

  it("yarış güvenliği: villa bazlı transaction-scoped advisory lock", () => {
    expect((code.match(/pg_advisory_xact_lock\(/g) || []).length).toBe(2);
    expect(code).toContain("'villa_availability:' || NEW.villa_id::text");
  });

  it("idempotent + mevcut constraint/trigger'lara dokunmaz", () => {
    expect(code).toContain("CREATE OR REPLACE FUNCTION public.check_reservation_manual_no_overlap()");
    expect(code).toMatch(/DROP TRIGGER IF EXISTS reservations_manual_no_overlap_trg/);
    expect(code).toMatch(/DROP TRIGGER IF EXISTS manual_reservations_reservation_no_overlap_trg/);
    expect(code).not.toMatch(/DROP CONSTRAINT|ALTER TABLE/);
    expect(code).not.toMatch(/external_no_overlap_trg/);
    expect(code).not.toMatch(/check_external_calendar_no_overlap/);
    expect(code).not.toMatch(/ON public\.external_calendar_events/);
    expect(code).not.toMatch(/\b(DELETE FROM|UPDATE public\.|INSERT INTO)\b/);
  });

  it("031 (external) migration'ı değişmedi — trigger adları aynen", () => {
    const m031 = readFileSync(join(dir, "031_external_calendar_overlap_trigger.sql"), "utf-8");
    expect(m031).toContain("CREATE TRIGGER reservations_external_no_overlap_trg");
    expect(m031).toContain("CREATE TRIGGER manual_reservations_external_no_overlap_trg");
  });
});
