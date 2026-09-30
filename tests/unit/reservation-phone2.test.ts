/* ===============================================================
   🛡️ İKİ TELEFON + ULUSLARARASI NUMARA — Migration 094
   ===============================================================
   Kullanıcı senaryoları 1-16:
     1  Telefon 1 boş → hata
     2  Telefon 2 boş → hata
     3  İkisi de dolu → devam
     4-7 TR/DE/UK/US kabul
     8  Geçersiz numara → hata
     9  TR-only eski validation ARTIK KULLANILMIYOR
     10 İki telefon FARKLI ülke olabilir
     11 Telefon 2 backend'e gerçekten gidiyor
     12 DB payload'ına gerçekten yazılıyor
     13 Mail'de iki telefon
     14 PDF/voucher'da iki telefon
     15 Admin'de iki telefon
     16 Eski rezervasyonlar (phone2 = null) bozulmuyor
=============================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  normalizePhone,
  isValidInternationalPhone,
  joinPhone,
  splitPhone,
  formatPhoneForDisplay,
  DIAL_CODES,
  DEFAULT_DIAL_CODE,
} from "@/lib/phone.helper";
import { validatePublicReservationForm } from "@/app/components/reservation/_helpers/validatePublicReservationForm";
import { initialPublicReservationFormData } from "@/app/components/reservation/_types/reservation-form-data";
import { buildPublicReservationPayload } from "@/app/components/reservation/_helpers/buildPublicReservationPayload";
import { buildCreateReservationPayload } from "@/app/services/reservation/_helpers/payload-create";
import { buildUpdateReservationPayload } from "@/app/services/reservation/_helpers/payload-update";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf-8");

const valid = () => ({
  ...initialPublicReservationFormData(),
  name: "Ahmet Yılmaz",
  phone: "+905551112233",
  phone2: "+4915112345678",
  email: "test@example.com",
  identity: "12345678901",
  payment_method_id: "pm-1",
});

const check = (over: Record<string, unknown> = {}) =>
  validatePublicReservationForm({
    form: { ...valid(), ...over },
    start: "2026-06-01",
    end: "2026-06-08",
  });

/* ===============================================================
   1-3) ZORUNLULUK
   =============================================================== */
describe("1-3) iki telefon da zorunlu", () => {
  it("1) Telefon 1 boş → hata", () => {
    expect(check({ phone: "" }).phone).toBe("Telefon zorunlu");
  });

  it("2) Telefon 2 boş → hata", () => {
    expect(check({ phone2: "" }).phone2).toBe("İkinci telefon zorunlu");
  });

  it("3) ikisi de dolu → hata YOK", () => {
    expect(check()).toEqual({});
  });

  it("3b) ikisi de boşsa İKİ hata birden döner", () => {
    const e = check({ phone: "", phone2: "" });
    expect(e.phone).toBe("Telefon zorunlu");
    expect(e.phone2).toBe("İkinci telefon zorunlu");
  });
});

/* ===============================================================
   4-8) ULUSLARARASI KABUL / RED
   =============================================================== */
describe("4-8) uluslararası numaralar", () => {
  const OK: Array<[string, string]> = [
    ["TR +90", "+905321234567"],
    ["TR sabit hat +90 212", "+902121234567"],
    ["DE +49", "+4915112345678"],
    ["UK +44", "+447911123456"],
    ["FR +33", "+33612345678"],
    ["NL +31", "+31612345678"],
    ["US/CA +1", "+14155552671"],
  ];

  for (const [label, num] of OK) {
    it(`4-7) ${label} → KABUL`, () => {
      expect(isValidInternationalPhone(num)).toBe(true);
      expect(check({ phone: num }).phone).toBeUndefined();
      expect(check({ phone2: num }).phone2).toBeUndefined();
    });
  }

  const BAD: Array<[string, string]> = [
    ["ülke kodu yok (0 önekli)", "05551112233"],
    ["ülke kodu yok (çıplak)", "5551112233"],
    ["çok kısa", "+90555"],
    ["çok uzun (16 hane)", "+9051234567890123"],
    ["harf içeriyor", "+90abc1112233"],
    ["sadece +", "+"],
    ["boş", ""],
    ["+0 ile başlıyor", "+0551112233"],
  ];

  for (const [label, num] of BAD) {
    it(`8) ${label} → RED`, () => {
      expect(isValidInternationalPhone(num)).toBe(false);
    });
  }

  it("8b) geçersiz numara validator'da hata üretir", () => {
    expect(check({ phone: "123" }).phone).toBe("Geçerli telefon gir");
    expect(check({ phone2: "123" }).phone2).toBe("Geçerli ikinci telefon gir");
  });
});

/* ===============================================================
   9) ESKİ TR-ONLY VALIDATION ARTIK YOK
   =============================================================== */
describe("9) TR-only regex kaldırıldı", () => {
  it("9a) 🔒 validator kaynağında eski regex YOK", () => {
    const body = src(
      "app/components/reservation/_helpers/validatePublicReservationForm.ts"
    );
    /* Yorum bloklarını çıkar → yalnız YÜRÜTÜLEN kod incelenir. */
    const exec = body
      .slice(body.indexOf("export function"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(exec).not.toContain("5\\d{9}");
    expect(exec).not.toContain(".test(form.phone)");
    expect(exec).toContain("isValidInternationalPhone");
  });

  it("9b) 🔒 hiçbir ülke ayrıcalıklı değil — helper'da +90 özel kuralı YOK", () => {
    const h = src("lib/phone.helper.ts");
    const exec = h.slice(h.indexOf("const E164_RE"));
    expect(exec).not.toMatch(/\+90['"`]\s*===/);
    expect(exec).not.toContain("startsWith(\"+90\")");
  });

  it("9c) 🔒 YENİ telefon kütüphanesi EKLENMEDİ", () => {
    const pkg = JSON.parse(src("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const bad of [
      "libphonenumber-js",
      "react-phone-number-input",
      "react-phone-input-2",
      "intl-tel-input",
      "google-libphonenumber",
    ]) {
      expect(deps[bad]).toBeUndefined();
    }
  });
});

/* ===============================================================
   10) İKİ TELEFON FARKLI ÜLKE
   =============================================================== */
describe("10) bağımsız ülke kodları", () => {
  it("10a) TR + DE birlikte geçerli", () => {
    expect(
      check({ phone: "+905321234567", phone2: "+4915112345678" })
    ).toEqual({});
  });

  it("10b) US + UK birlikte geçerli", () => {
    expect(
      check({ phone: "+14155552671", phone2: "+447911123456" })
    ).toEqual({});
  });

  it("10c) form state'inde iki ayrı ülke kodu alanı var", () => {
    const f = initialPublicReservationFormData();
    expect(f.phone_dial).toBe(DEFAULT_DIAL_CODE);
    expect(f.phone2_dial).toBe(DEFAULT_DIAL_CODE);
    expect(f.phone_national).toBe("");
    expect(f.phone2_national).toBe("");
  });

  it("10d) joinPhone ülke kodunu KAYBETMEZ", () => {
    expect(joinPhone("+49", "15112345678")).toBe("+4915112345678");
    expect(joinPhone("+90", "0532 123 45 67")).toBe("+905321234567");
    expect(joinPhone("+1", "(415) 555-2671")).toBe("+14155552671");
  });

  it("10e) splitPhone en uzun ülke kodunu seçer (+1 ile +972 karışmaz)", () => {
    expect(splitPhone("+14155552671")).toEqual({
      dial: "+1",
      national: "4155552671",
    });
    expect(splitPhone("+972501234567")).toEqual({
      dial: "+972",
      national: "501234567",
    });
  });

  it("10f) tanınmayan ülke kodunda veri KAYBOLMAZ", () => {
    expect(splitPhone("+6591234567")).toEqual({
      dial: "",
      national: "+6591234567",
    });
  });

  it("10g) ülke kodu listesi istenen ülkeleri içerir", () => {
    const dials = DIAL_CODES.map((c) => c.dial);
    for (const d of ["+90", "+49", "+44", "+33", "+31", "+1"]) {
      expect(dials).toContain(d);
    }
  });
});

/* ===============================================================
   11-12) BACKEND'E GİDİYOR / DB'YE YAZILIYOR
   =============================================================== */
describe("11-12) payload zinciri", () => {
  it("11a) public payload builder phone2'yi gönderir", () => {
    const p = buildPublicReservationPayload({
      villa: { id: "villa-1" },
      start: "2026-06-01",
      end: "2026-06-08",
      form: {
        ...valid(),
        phone: "+90 532 123 45 67",
        phone2: "+49 151 12345678",
      },
      guestNames: [],
    } as never);
    expect(p.phone).toBe("+905321234567");
    expect(p.phone2).toBe("+4915112345678");
  });

  it("11b) 🔒 API route'unda SUNUCU TARAFI zorunluluk guard'ı var", () => {
    const r = src("app/api/public/reservations/route.ts");
    expect(r).toContain("isValidInternationalPhone");
    expect(r).toContain("ikinci telefon numarası gir");
    expect(r).toMatch(/body\.phone2\s*=\s*p2/);
  });

  it("12a) DB create payload phone2 içerir", () => {
    const p = buildCreateReservationPayload({
      data: {
        villa_id: "v1",
        name: "A",
        phone: "+905321234567",
        phone2: "+4915112345678",
        start_date: "2026-06-01",
        end_date: "2026-06-08",
      },
      reservationCommissionAmount: 0,
    } as never);
    expect(p.phone2).toBe("+4915112345678");
  });

  it("12b) DB update payload phone2 içerir", () => {
    const p = buildUpdateReservationPayload({
      name: "A",
      phone: "+905321234567",
      phone2: "+4915112345678",
    } as never);
    expect(p.phone2).toBe("+4915112345678");
  });

  it("12c) repository SELECT'leri phone2 okur", () => {
    const repo = src("lib/db/reservation.repository.server.ts");
    expect(repo).toContain("name, phone, phone2, email");
    expect(repo).toContain("villa_id, name, phone, phone2, start_date");
    expect(src("lib/db/voucher.repository.server.ts")).toContain(
      "name, phone, phone2, email"
    );
    expect(
      src("app/services/reservation/_helpers/select-shapes.ts")
    ).toContain("phone2");
  });
});

/* ===============================================================
   13-15) GÖRÜNÜRLÜK — mail / PDF / admin
   =============================================================== */
describe("13-15) görünürlük", () => {
  it("13a) üç mail şablonu da Telefon 2 satırı basar", () => {
    for (const f of [
      "ReservationRequestEmail",
      "ReservationApprovedEmail",
      "ReservationCancelledEmail",
    ]) {
      const t = src(`app/lib/mail/templates/${f}.ts`);
      expect(t).toContain('emailKeyValueRow("Telefon", props.phone)');
      expect(t).toContain('emailKeyValueRow("Telefon 2", props.phone2)');
    }
  });

  it("13b) mail route'ları phone2'yi şablona geçirir", () => {
    for (const f of [
      "reservation-request",
      "reservation-approved",
      "reservation-cancelled",
    ]) {
      expect(src(`app/api/mail/${f}/route.ts`)).toContain(
        "phone2: r.phone2 || null"
      );
    }
  });

  it("14a) PDF/voucher şablonu Telefon 2 satırı basar", () => {
    const t = src("app/lib/voucher/template.ts");
    expect(t).toContain('rowHtml("Telefon", props.phone)');
    expect(t).toContain('rowHtml("Telefon 2", props.phone2)');
    expect(src("app/lib/voucher/data.ts")).toContain(
      "phone2: r.phone2 || null"
    );
  });

  it("15a) admin detay kartlarında Telefon 2 alanı var", () => {
    for (const f of [
      "app/(admin)/maki-admin/reservations/[id]/_components/MisafirBilgisiCard.tsx",
      "app/(admin)/maki-admin/reservations/[id]/_components/PersonalInfoCard.tsx",
    ]) {
      expect(src(f)).toContain('{ key: "phone2", label: "Telefon 2" }');
    }
  });

  it("15b) admin ekleme formunda (wizard) Telefon 2 alanı var", () => {
    expect(src("app/components/admin/reservation-form/PersonalStep.tsx")).toContain(
      '{ key: "phone2", label: "Telefon 2" }'
    );
  });

  it("15c) admin listesinde phone2 gösterilir ve aranabilir", () => {
    const l = src("app/(admin)/maki-admin/reservations/page.tsx");
    expect(l).toContain("{r.phone2 && (");
    expect(l).toContain('normalizeSearchText(r.phone2 || "")');
  });
});

/* ===============================================================
   16) GERİYE DÖNÜK UYUMLULUK — eski kayıtlar
   =============================================================== */
describe("16) eski rezervasyonlar (phone2 = null)", () => {
  it("16a) mail şablonu phone2 null iken satırı BASMAZ (çökmez)", () => {
    for (const f of [
      "ReservationRequestEmail",
      "ReservationApprovedEmail",
      "ReservationCancelledEmail",
    ]) {
      /* Koşullu render: props.phone2 ? ... : "" → null güvenli. */
      expect(src(`app/lib/mail/templates/${f}.ts`)).toContain(
        'props.phone2 ? emailKeyValueRow("Telefon 2", props.phone2) : ""'
      );
    }
  });

  it("16b) voucher şablonu phone2 null iken satırı BASMAZ", () => {
    expect(src("app/lib/voucher/template.ts")).toContain(
      'props.phone2 ? rowHtml("Telefon 2", props.phone2) : ""'
    );
  });

  it("16c) DB payload'ları undefined → null'a düşer (NOT NULL ihlali yok)", () => {
    const c = buildCreateReservationPayload({
      data: {
        villa_id: "v1",
        name: "A",
        phone: "+905321234567",
        start_date: "2026-06-01",
        end_date: "2026-06-08",
      },
      reservationCommissionAmount: 0,
    } as never);
    expect(c.phone2).toBeNull();

    const u = buildUpdateReservationPayload({
      name: "A",
      phone: "+905321234567",
    } as never);
    expect(u.phone2).toBeNull();
  });

  it("16d) formatPhoneForDisplay null/boş girdide ÇÖKMEZ", () => {
    expect(formatPhoneForDisplay(null)).toBe("");
    expect(formatPhoneForDisplay(undefined)).toBe("");
    expect(formatPhoneForDisplay("")).toBe("");
  });

  it("16e) normalizePhone null/undefined güvenli", () => {
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone(undefined)).toBe("");
    expect(normalizePhone("  ")).toBe("");
  });

  it("16f) migration NULLABLE — eski satırlar bozulmaz", () => {
    const m = src("db/migrations/094_reservations_phone2.sql");
    expect(m).toContain("ADD COLUMN IF NOT EXISTS phone2 text");
    /* Yorum satırları (-- ...) çıkarılır → yalnız çalışan SQL. */
    const sql = m.replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/phone2 text\s+NOT NULL/);
    expect(sql).not.toContain("DROP COLUMN");
    expect(sql).not.toContain("ALTER COLUMN phone");
  });

  it("16g) admin tarafında phone2 ZORUNLU DEĞİL (eski kayıt düzenlenebilir)", () => {
    const v = src(
      "app/(admin)/maki-admin/reservations/ekle/_helpers/validateCreateForm.ts"
    );
    expect(v).not.toContain("phone2");
  });
});

/* ===============================================================
   17) NORMALİZASYON — ülke kodu asla kaybolmaz
   =============================================================== */
describe("17) normalize", () => {
  it("17a) boşluk/tire/parantez temizlenir, + korunur", () => {
    expect(normalizePhone("+90 532 123 45 67")).toBe("+905321234567");
    expect(normalizePhone("+49 (151) 1234-5678")).toBe("+4915112345678");
  });

  it("17b) 00 öneki + olur", () => {
    expect(normalizePhone("00905321234567")).toBe("+905321234567");
  });

  it("17c) görüntüleme formatı değeri BOZMAZ", () => {
    expect(formatPhoneForDisplay("+905321234567")).toBe("+90 532 123 456 7");
    /* Parse edilemezse girdi aynen döner. */
    expect(formatPhoneForDisplay("bilinmeyen")).toBe("bilinmeyen");
  });
});
