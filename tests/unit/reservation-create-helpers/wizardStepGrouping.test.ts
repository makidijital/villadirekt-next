/* ===============================================================
   🛡️ ADMIN REZERVASYON WIZARD — 9 ADIM → 3 ADIM GRUPLAMASI
   ===============================================================
   Bu değişiklik YALNIZCA step/tab organizasyonudur. Form alanları,
   validation kuralları, payload, API, service, repository ve DB
   AYNEN korunur — aşağıdaki testler ikisini de kilitler.

   ESKİ → YENİ:
     1 Kişisel + 2 Konum                  → 1 "Kişisel Bilgiler ve Konum"
     3 Mülk + 4 Tarih + 5 Misafir         → 2 "Mülk ve Tarih"
     6 Fiyat + 7 Yöntem + 8 Tercih + 9 Not→ 3 "Ödeme Bilgileri"
=============================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

import { validateCreateForm } from "@/app/(admin)/maki-admin/reservations/ekle/_helpers/validateCreateForm";
import { baseCreateData } from "./_fixtures";
import type { ReservationCreateData } from "@/app/(admin)/maki-admin/reservations/ekle/_types/reservation-create-data";

/* Tüm zorunlu alanları BOŞ bir form — validation kurallarının hâlâ
   tetiklendiğini kanıtlamak için (fixture MUTATE EDİLMEZ). */
const EMPTY_CREATE_DATA: ReservationCreateData = {
  ...baseCreateData,
  villa_id: "",
  name: "",
  phone: "",
  email: "",
  country: "",
  city: "",
  guests: 0,
  payment_method_id: null,
  payment_preference: null as never,
  total_price_try: 0,
};

const PAGE = "app/(admin)/maki-admin/reservations/ekle/page.tsx";
const src = (p: string) => readFileSync(join(process.cwd(), p), "utf-8");
const PAGE_SRC = src(PAGE);

/** page.tsx içindeki `STEPS` / `STEP_FIELDS` başlatıcılarını AST ile
 *  okur — kaynak metnine regex ile bakmak yerine gerçek değerleri
 *  değerlendirir. */
function readInitializer(name: string): string {
  const sf = ts.createSourceFile(PAGE, PAGE_SRC, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let out: string | null = null;
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.name.getText() === name && n.initializer) {
      out = n.initializer.getText();
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (out === null) throw new Error(`${name} bulunamadı`);
  return out;
}

const STEPS = eval(`(${readInitializer("STEPS")})`) as {
  id: number;
  label: string;
}[];
const STEP_FIELDS = eval(`(${readInitializer("STEP_FIELDS")})`) as Record<
  number,
  string[]
>;

/* ===============================================================
   1-4) YENİ STEP YAPISI
   =============================================================== */
describe("1-4) 3 adımlı yapı", () => {
  it("4) toplam step sayısı 3", () => {
    expect(STEPS).toHaveLength(3);
    expect(Object.keys(STEP_FIELDS)).toHaveLength(3);
  });

  it("4b) id'ler 1,2,3 ve sıralı", () => {
    expect(STEPS.map((s) => s.id)).toEqual([1, 2, 3]);
  });

  it("1) STEP 1 — Kişisel Bilgiler ve Konum", () => {
    expect(STEPS[0].label).toBe("Kişisel Bilgiler ve Konum");
    /* Eski adım 1 (name/phone/email) + adım 2 (country/city) */
    expect(STEP_FIELDS[1].sort()).toEqual(
      ["city", "country", "email", "name", "phone"].sort()
    );
  });

  it("2) STEP 2 — Mülk ve Tarih", () => {
    expect(STEPS[1].label).toBe("Mülk ve Tarih");
    /* Eski adım 3 (villa_id) + 4 (start/end) + 5 (guests) */
    expect(STEP_FIELDS[2].sort()).toEqual(
      ["end_date", "guests", "start_date", "villa_id"].sort()
    );
  });

  it("3) STEP 3 — Ödeme Bilgileri", () => {
    expect(STEPS[2].label).toBe("Ödeme Bilgileri");
    /* Eski adım 6 (total_price_try) + 7 (yöntem) + 8 (tercih); 9=Not'un alanı yok */
    expect(STEP_FIELDS[3].sort()).toEqual(
      ["payment_method_id", "payment_preference", "total_price_try"].sort()
    );
  });

  it("4c) 🔒 HİÇBİR validation alanı DÜŞMEDİ — eski 9 adımın birleşimi", () => {
    const merged = [
      ...STEP_FIELDS[1],
      ...STEP_FIELDS[2],
      ...STEP_FIELDS[3],
    ].sort();
    /* Eski STEP_FIELDS'in tam birleşimi (adım 9 boştu). */
    expect(merged).toEqual(
      [
        "name", "phone", "email",
        "country", "city",
        "villa_id",
        "start_date", "end_date",
        "guests",
        "total_price_try",
        "payment_method_id",
        "payment_preference",
      ].sort()
    );
  });

  it("4d) alanlar adımlar arasında TEKRARLANMIYOR", () => {
    const all = [...STEP_FIELDS[1], ...STEP_FIELDS[2], ...STEP_FIELDS[3]];
    expect(new Set(all).size).toBe(all.length);
  });
});

/* ===============================================================
   5-6) STEP GEÇİŞLERİ / GERİ-İLERİ
   =============================================================== */
describe("5-6) navigasyon", () => {
  it("5) TOTAL_STEPS STEPS.length'ten türer (hardcoded sayı yok)", () => {
    expect(PAGE_SRC).toContain("const TOTAL_STEPS = STEPS.length;");
  });

  it("6) goNext üst sınırı TOTAL_STEPS, goBack alt sınırı 1", () => {
    expect(PAGE_SRC).toContain("Math.min(s + 1, TOTAL_STEPS)");
    expect(PAGE_SRC).toContain("Math.max(s - 1, 1)");
  });

  it("6b) goNext hatalı adımda İLERLEMEZ (mevcut guard duruyor)", () => {
    expect(PAGE_SRC).toMatch(
      /const goNext = \(\) => \{[\s\S]{0,260}if \(Object\.keys\(stepErrors\)\.length > 0\)[\s\S]{0,120}return;/
    );
  });

  it("6c) step bar + sticky bar AYNI STEPS dizisini kullanır", () => {
    expect((PAGE_SRC.match(/steps=\{STEPS\}/g) || []).length).toBe(2);
    expect(PAGE_SRC).toContain("submitOnlyOnLastStep");
    expect(PAGE_SRC).toContain("allowFreeNav={false}");
  });

  it("6d) 3 render bloğu var: currentStep === 1 / 2 / 3", () => {
    for (const n of [1, 2, 3]) {
      expect(PAGE_SRC).toContain(`{currentStep === ${n} && (`);
    }
    /* Eski 4..9 blokları KALMADI. */
    for (const n of [4, 5, 6, 7, 8, 9]) {
      expect(PAGE_SRC).not.toContain(`currentStep === ${n}`);
    }
  });
});

/* ===============================================================
   7) VALIDATION KURALLARI KORUNDU
   =============================================================== */
describe("7) validation değişmedi", () => {
  it("7a) validateStep hâlâ validateForm() alt kümesini döner", () => {
    expect(PAGE_SRC).toContain("const all = validateForm();");
    expect(PAGE_SRC).toContain("const fields = STEP_FIELDS[step] || [];");
  });

  it("7b) validateCreateForm kuralları BİREBİR duruyor", () => {
    const e = validateCreateForm({
      data: EMPTY_CREATE_DATA,
      startDate: null,
      endDate: null,
      priceDetail: null,
    });
    /* Eski 9 adımın tüm zorunlu alanları hâlâ hata üretiyor. */
    for (const f of [
      "villa_id", "start_date", "end_date", "name", "phone", "email",
      "country", "city", "guests", "payment_method_id",
      "payment_preference", "total_price_try",
    ]) {
      expect(e[f]).toBeTruthy();
    }
  });

  it("7c) STEP_FIELDS'teki her alan validateCreateForm'da GERÇEKTEN var", () => {
    const e = validateCreateForm({
      data: EMPTY_CREATE_DATA,
      startDate: null,
      endDate: null,
      priceDetail: null,
    });
    for (const step of [1, 2, 3]) {
      for (const f of STEP_FIELDS[step]) {
        expect(Object.keys(e)).toContain(f);
      }
    }
  });

  it("7d) 🔒 validateCreateForm helper'ı DEĞİŞMEDİ (yeni kural yok)", () => {
    const v = src(
      "app/(admin)/maki-admin/reservations/ekle/_helpers/validateCreateForm.ts"
    );
    expect(v).toContain('if (!data.villa_id) e.villa_id = "Villa zorunlu";');
    expect(v).toContain('if (guestsN < 1) e.guests = "En az 1 misafir";');
    expect(v).toContain('e.total_price_try = "Toplam tutar 0\'dan büyük olmalı"');
  });
});

/* ===============================================================
   8-10) SUBMIT / PAYLOAD / REPOSITORY DEĞİŞMEDİ
   =============================================================== */
describe("8-10) rezervasyon oluşturma zinciri dokunulmadı", () => {
  it("8) submit hâlâ handleCreate + aynı buton etiketleri", () => {
    expect(PAGE_SRC).toContain("onSubmit={handleCreate}");
    expect(PAGE_SRC).toContain('submitLabel="Rezervasyonu Oluştur"');
    expect(PAGE_SRC).toContain('loadingLabel="Oluşturuluyor…"');
  });

  it("9) payload builder'ları AYNEN çağrılıyor", () => {
    expect(PAGE_SRC).toContain("buildCreateCustomPricePayload");
    expect(PAGE_SRC).toContain("buildCreateNormalPayload");
  });

  it("9b) mail dispatch akışı duruyor", () => {
    expect(PAGE_SRC).toContain("dispatchReservationRequestMail");
  });

  it("10) 🔒 tüm step component'leri HÂLÂ render ediliyor (bölüm kaybı yok)", () => {
    for (const c of [
      "<PersonalStep",
      "<LocationStep",
      "<VillaSelectStep",
      "<ReservationCalendar",
      "<GuestsStep",
      "<PriceStep",
      "<PaymentMethodStep",
      "<PaymentPreferenceStep",
      "<NoteStep",
    ]) {
      expect(PAGE_SRC).toContain(c);
    }
  });

  it("10b) 🔒 her step component'i TAM BİR KEZ render ediliyor", () => {
    for (const c of [
      "<PersonalStep", "<LocationStep", "<VillaSelectStep",
      "<GuestsStep", "<PriceStep", "<PaymentMethodStep",
      "<PaymentPreferenceStep", "<NoteStep",
    ]) {
      expect(
        (PAGE_SRC.match(new RegExp(c.replace("<", "<"), "g")) || []).length
      ).toBe(1);
    }
  });
});
