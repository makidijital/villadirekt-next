import type {
  PublicReservationFormData,
  PublicReservationFormErrors,
} from "../_types/reservation-form-data";

/* 🛡️ REZERVASYON ÇOKLU DİL — mesajlar MEVCUT public dictionary'den
   (`reservation.validation`). VALIDATION KURALLARI (alan zorunlulukları,
   regex'ler, kontrol sırası) DEĞİŞMEDİ; yalnız mesaj metni locale-aware
   oldu. Helper PURE kalır (DB/IO yok — `getDictionary` saf statik
   lookup). */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { isValidInternationalPhone } from "@/lib/phone.helper";

/* ===============================================================
   🛡️ FAZ 2 — validatePublicReservationForm (PURE)
   ===============================================================
   Eski `ReservationForm.tsx > handleSubmit` içinde inline tanımlı
   validation guard'ının BYTE-IDENTICAL kopyası (L260-273).

   ⚠️ KESIN KURAL — Validation KURALLARI AYNEN (mesajlar artık
   dictionary'den; TR değerleri aşağıdakilerle BİREBİR):
     - name              → "Ad zorunlu"
     - phone (required)  → "Telefon zorunlu"
     - phone (regex)     → "Geçerli telefon gir"
                           ⚠️ ARTIK ULUSLARARASI (E.164). Eski TR-only
                           regex /^(\+90|0)?5\d{9}$/ KALDIRILDI.
     - phone2 (required) → "İkinci telefon zorunlu"   (YENİ, zorunlu)
     - phone2 (regex)    → "Geçerli ikinci telefon gir"
     - email (required)  → "Email zorunlu"
     - email (regex)     → "Geçerli email gir"
                           regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
     - identity (req)    → "TC zorunlu"
     - identity (regex)  → "11 haneli TC gir"
                           ⚠️ ARTIK TC **veya** PASAPORT kabul edilir
                           (bkz. isValidIdentityOrPassport). TC kuralı
                           /^\d{11}$/ AYNEN korundu; pasaport EK bir
                           daldır. Hata mesajı anahtarı DEĞİŞMEDİ
                           (identityInvalid) — yeni metin eklenmedi.
     - payment_method_id → "Ödeme yöntemi seç"
     - !start || !end    → date: "Tarih seçmelisin"

   ⚠️ FARK admin/validateCreateForm ile:
     Public form STRICTER — phone + TC regex'leri admin'de yok.
     Public country/city/guests/total VALIDATE EDİLMEZ (mevcut davranış).

   PURE: input alır, error map döner. Toast/setErrors caller'da.
=============================================================== */

/* ===============================================================
   🛡️ KİMLİK NO — TC Kimlik **veya** uluslararası pasaport
   ===============================================================
   NEDEN: alan etiketi "TC / Pasaport" olduğu hâlde validation
   yalnız /^\d{11}$/ kabul ediyordu → yabancı misafirler pasaport
   numarasıyla rezervasyon yapamıyordu.

   İKİ DAL — sıra önemli:
     1) TC KİMLİK: /^\d{11}$/ — MEVCUT KURAL BİREBİR KORUNDU.
        11 haneli olmayan SALT RAKAM değerler (ör. "1234567890")
        pasaport dalına DÜŞMEZ → geçersiz TC eskisi gibi reddedilir.
     2) PASAPORT: harfle BAŞLAR, devamı harf/rakam, toplam 6..12,
        en az bir RAKAM içerir.
          A12345678 ✓   P1234567 ✓   X12345678 ✓   AB1234C5 ✓
          12345ABCDEF ✗ (harfle başlamıyor — mevcut test korunur)
          ABCDEFGH ✗ (rakam yok)   !!!!!! ✗   "" ✗   30 karakter ✗
        Tek bir ülkenin formatına KİLİTLENMEZ.

   ⚠️ SALT DOĞRULAMA: değer normalize EDİLMEZ/yazılmaz — payload ve
     DB'ye giden `identity_number` kullanıcının yazdığı gibi kalır.
     API sözleşmesi ve admin tarafı DEĞİŞMEDİ.
   PURE: IO yok; testten doğrudan import edilebilir.
=============================================================== */

/** TC Kimlik — MEVCUT kural, değiştirilmedi. */
const TC_IDENTITY_RE = /^\d{11}$/;
/** Pasaport — ülke-bağımsız makul şablon. */
const PASSPORT_RE = /^[A-Z][A-Z0-9]{5,11}$/;

export function isValidIdentityOrPassport(
  raw: string | null | undefined
): boolean {
  const v = String(raw ?? "").trim();
  if (!v) return false;

  /* 1) TC Kimlik — önce denenir (mevcut davranış). */
  if (TC_IDENTITY_RE.test(v)) return true;

  /* 2) Pasaport — boşluk/tire yazım tercihidir, doğrulama için
     yok sayılır; değerin KENDİSİ değişmez. */
  const p = v.replace(/[\s-]/g, "").toUpperCase();
  return PASSPORT_RE.test(p) && /\d/.test(p);
}

export type ValidatePublicReservationFormInput = {
  form: PublicReservationFormData;
  start: string | null | undefined;
  end: string | null | undefined;
};

export function validatePublicReservationForm(
  input: ValidatePublicReservationFormInput,
  /** Opsiyonel — verilmezse "tr" → mesajlar BİREBİR eskisi gibi. */
  locale: Locale = DEFAULT_LOCALE
): PublicReservationFormErrors {
  const { form, start, end } = input;
  const v = getDictionary(locale).reservation.validation;
  const newErrors: PublicReservationFormErrors = {};

  if (!form.name) newErrors.name = v.nameRequired;
  /* 🛡️ ULUSLARARASI TELEFON — eski TR-only regex `/^(\+90|0)?5\d{9}$/`
     KALDIRILDI (yalnız TR cep hattını kabul ediyordu; +49/+44/+33/+1
     ve TR sabit hat reddediliyordu). Artık E.164: ülke kodu + 8..15
     rakam. İki alan da ZORUNLU ve birbirinden bağımsız ülkede olabilir. */
  if (!form.phone) newErrors.phone = v.phoneRequired;
  else if (!isValidInternationalPhone(form.phone))
    newErrors.phone = v.phoneInvalid;
  if (!form.phone2) newErrors.phone2 = v.phone2Required;
  else if (!isValidInternationalPhone(form.phone2))
    newErrors.phone2 = v.phone2Invalid;
  if (!form.email) newErrors.email = v.emailRequired;
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
    newErrors.email = v.emailInvalid;
  if (!form.identity) newErrors.identity = v.identityRequired;
  else if (!isValidIdentityOrPassport(form.identity))
    newErrors.identity = v.identityInvalid;
  if (!form.payment_method_id)
    newErrors.payment_method_id = v.paymentMethodRequired;
  if (!start || !end) newErrors.date = v.dateRequired;

  return newErrors;
}
