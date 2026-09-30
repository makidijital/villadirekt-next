import { describe, it, expect } from "vitest";

import { validatePublicReservationForm } from "@/app/components/reservation/_helpers/validatePublicReservationForm";
import { initialPublicReservationFormData } from "@/app/components/reservation/_types/reservation-form-data";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ FAZ 4 — validatePublicReservationForm UNIT TESTS
   ===============================================================
   Pure validator. Eski ReservationForm > handleSubmit body'sinden
   BYTE-IDENTICAL extract. Regression guard.

   Test edilen kurallar:
     - name required
     - phone required + ULUSLARARASI (E.164)
     - phone2 required + ULUSLARARASI (E.164)

   ⚠️ SÖZLEŞME DEĞİŞİKLİĞİ (kullanıcı talebi §2/§9):
     Eski kural `/^(\+90|0)?5\d{9}$/` YALNIZ TR cep hattını kabul
     ediyordu. Artık E.164 → ülke kodu ZORUNLU. Bu nedenle ülke kodu
     TAŞIMAYAN "05551112233" ve "5551112233" artık REDDEDİLİR;
     bunun yerine "+905551112233" kullanılır. +49/+44/+33/+1 kabul.
     - email required + regex
     - identity required + regex /^\d{11}$/
     - payment_method_id required
     - start && end required (date message)
=============================================================== */

const valid = () => ({
  ...initialPublicReservationFormData(),
  name: "Ahmet Yılmaz",
  phone: "+905551112233",
  /* 🛡️ İkinci telefon ZORUNLU — farklı ülke (bağımsızlık kanıtı). */
  phone2: "+4915112345678",
  email: "test@example.com",
  identity: "12345678901",
  payment_method_id: "pm-1",
});

describe("validatePublicReservationForm — happy path", () => {
  it("returns {} when all fields valid", () => {
    const errors = validatePublicReservationForm({
      form: valid(),
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors).toEqual({});
  });
});

describe("validatePublicReservationForm — name", () => {
  it("flags 'Ad zorunlu' when empty", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), name: "" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.name).toBe("Ad zorunlu");
  });
});

describe("validatePublicReservationForm — phone regex", () => {
  it("required: 'Telefon zorunlu' when empty", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), phone: "" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.phone).toBe("Telefon zorunlu");
  });

  it("accepts +90 prefix", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), phone: "+905551112233" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.phone).toBeUndefined();
  });

  it("🔄 ARTIK REDDEDER — 0 öneki (ülke kodu yok)", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), phone: "05551112233" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    /* ⚠️ ARTIK RED: ülke kodu yok → E.164 değil. Kural bilerek değişti. */
    expect(errors.phone).toBe("Geçerli telefon gir");
  });

  it("🔄 ARTIK REDDEDER — öneksiz 5xxxxxxxxx (ülke kodu yok)", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), phone: "5551112233" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    /* ⚠️ ARTIK RED: ülke kodu yok. */
    expect(errors.phone).toBe("Geçerli telefon gir");
  });

  it("flags invalid 'Geçerli telefon gir' for wrong format", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), phone: "1234567890" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.phone).toBe("Geçerli telefon gir");
  });

  it("flags short numbers", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), phone: "555111" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.phone).toBe("Geçerli telefon gir");
  });
});

describe("validatePublicReservationForm — email regex", () => {
  it("required: 'Email zorunlu' when empty", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), email: "" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.email).toBe("Email zorunlu");
  });

  it("accepts valid email", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), email: "user@domain.co.uk" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.email).toBeUndefined();
  });

  it("flags missing @ → 'Geçerli email gir'", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), email: "not-an-email" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.email).toBe("Geçerli email gir");
  });

  it("flags missing dot → invalid", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), email: "user@domain" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.email).toBe("Geçerli email gir");
  });
});

describe("validatePublicReservationForm — identity (TC) regex", () => {
  it("required: 'TC zorunlu' when empty", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), identity: "" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.identity).toBe("TC zorunlu");
  });

  it("accepts exactly 11 digits", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), identity: "12345678901" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.identity).toBeUndefined();
  });

  it("flags 10 digits → '11 haneli TC gir'", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), identity: "1234567890" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.identity).toBe("11 haneli TC gir");
  });

  it("flags 12 digits", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), identity: "123456789012" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.identity).toBe("11 haneli TC gir");
  });

  it("flags non-digit characters", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), identity: "12345abcdef" },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.identity).toBe("11 haneli TC gir");
  });
});

describe("validatePublicReservationForm — payment_method_id", () => {
  it("required: 'Ödeme yöntemi seç' when null", () => {
    const errors = validatePublicReservationForm({
      form: { ...valid(), payment_method_id: null },
      start: "2026-06-01",
      end: "2026-06-08",
    });
    expect(errors.payment_method_id).toBe("Ödeme yöntemi seç");
  });
});

describe("validatePublicReservationForm — date", () => {
  it("flags 'Tarih seçmelisin' when start missing", () => {
    const errors = validatePublicReservationForm({
      form: valid(),
      start: undefined,
      end: "2026-06-08",
    });
    expect(errors.date).toBe("Tarih seçmelisin");
  });

  it("flags 'Tarih seçmelisin' when end missing", () => {
    const errors = validatePublicReservationForm({
      form: valid(),
      start: "2026-06-01",
      end: null,
    });
    expect(errors.date).toBe("Tarih seçmelisin");
  });

  it("flags when both missing", () => {
    const errors = validatePublicReservationForm({
      form: valid(),
      start: null,
      end: null,
    });
    expect(errors.date).toBe("Tarih seçmelisin");
  });
});

describe("validatePublicReservationForm — accumulated errors", () => {
  it("returns ALL failing fields in single pass", () => {
    const errors = validatePublicReservationForm({
      form: {
        ...initialPublicReservationFormData(),
        name: "",
        phone: "",
        phone2: "",
        email: "",
        identity: "",
        payment_method_id: null,
      },
      start: null,
      end: null,
    });
    expect(Object.keys(errors).sort()).toEqual([
      "date",
      "email",
      "identity",
      "name",
      "payment_method_id",
      "phone",
      "phone2",
    ].sort());
  });
});

/* ===============================================================
   🛡️ REZERVASYON ÇOKLU DİL — locale-aware validation mesajları
   ===============================================================
   `locale` OPSİYONEL 2. parametredir. Verilmezse "tr" → yukarıdaki
   22 test (mevcut TR sözleşmesi) BİREBİR geçerli kalır.

   Kural/regex/alan-adı DEĞİŞMEDİ — yalnız mesaj metni dictionary'den
   (`reservation.validation`) gelir.
=============================================================== */

describe("validatePublicReservationForm — locale (TR/EN/DE)", () => {
  const allInvalid = () => ({
    form: {
      ...initialPublicReservationFormData(),
      name: "",
      phone: "",
      email: "",
      identity: "",
      payment_method_id: null,
    },
    start: null as string | null,
    end: null as string | null,
  });

  it("locale verilmezse TR mesajları (backward compatibility)", () => {
    const errors = validatePublicReservationForm(allInvalid());
    expect(errors.name).toBe("Ad zorunlu");
    expect(errors.phone).toBe("Telefon zorunlu");
    expect(errors.email).toBe("Email zorunlu");
    expect(errors.identity).toBe("TC zorunlu");
    expect(errors.payment_method_id).toBe("Ödeme yöntemi seç");
    expect(errors.date).toBe("Tarih seçmelisin");
  });

  it('locale="tr" açıkça verildiğinde de AYNI TR mesajları', () => {
    expect(validatePublicReservationForm(allInvalid(), "tr")).toEqual(
      validatePublicReservationForm(allInvalid())
    );
  });

  it('locale="en" → mesajlar dictionary EN değerleri', () => {
    const dict = getDictionary("en").reservation.validation;
    const errors = validatePublicReservationForm(allInvalid(), "en");
    expect(errors.name).toBe(dict.nameRequired);
    expect(errors.phone).toBe(dict.phoneRequired);
    expect(errors.email).toBe(dict.emailRequired);
    expect(errors.identity).toBe(dict.identityRequired);
    expect(errors.payment_method_id).toBe(dict.paymentMethodRequired);
    expect(errors.date).toBe(dict.dateRequired);
  });

  it('locale="de" → mesajlar dictionary DE değerleri', () => {
    const dict = getDictionary("de").reservation.validation;
    const errors = validatePublicReservationForm(allInvalid(), "de");
    expect(errors.name).toBe(dict.nameRequired);
    expect(errors.phone).toBe(dict.phoneRequired);
    expect(errors.email).toBe(dict.emailRequired);
    expect(errors.identity).toBe(dict.identityRequired);
    expect(errors.payment_method_id).toBe(dict.paymentMethodRequired);
    expect(errors.date).toBe(dict.dateRequired);
  });

  it("EN/DE mesajları TR ile AYNI DEĞİL (gerçekten çevrilmiş)", () => {
    const tr = validatePublicReservationForm(allInvalid(), "tr");
    const en = validatePublicReservationForm(allInvalid(), "en");
    const de = validatePublicReservationForm(allInvalid(), "de");
    for (const key of ["name", "phone", "phone2", "email", "identity", "date"] as const) {
      expect(en[key]).not.toBe(tr[key]);
      expect(de[key]).not.toBe(tr[key]);
      expect(en[key]).not.toBe(de[key]);
    }
  });

  it("format hataları (regex) da locale-aware — EN", () => {
    const dict = getDictionary("en").reservation.validation;
    const errors = validatePublicReservationForm(
      {
        form: {
          ...initialPublicReservationFormData(),
          name: "John Doe",
          phone: "123",
          email: "not-an-email",
          identity: "42",
          payment_method_id: "pm-1",
        },
        start: "2026-06-01",
        end: "2026-06-08",
      },
      "en"
    );
    expect(errors.phone).toBe(dict.phoneInvalid);
    expect(errors.email).toBe(dict.emailInvalid);
    expect(errors.identity).toBe(dict.identityInvalid);
  });

  it("locale hata ALANLARINI (key set) DEĞİŞTİRMEZ — sadece metni", () => {
    const keys = (l?: "tr" | "en" | "de") =>
      Object.keys(validatePublicReservationForm(allInvalid(), l)).sort();
    expect(keys("en")).toEqual(keys());
    expect(keys("de")).toEqual(keys());
  });

  it("geçerli form her locale'de {} döner (kural değişmedi)", () => {
    const input = {
      form: {
        ...initialPublicReservationFormData(),
        name: "Ahmet Yılmaz",
        phone: "+905551112233",
        phone2: "+4915112345678",
        email: "test@example.com",
        identity: "12345678901",
        payment_method_id: "pm-1",
      },
      start: "2026-06-01",
      end: "2026-06-08",
    };
    expect(validatePublicReservationForm(input, "tr")).toEqual({});
    expect(validatePublicReservationForm(input, "en")).toEqual({});
    expect(validatePublicReservationForm(input, "de")).toEqual({});
  });
});
