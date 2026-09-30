/* ===============================================================
   🛡️ PHONE HELPER — uluslararası telefon (ülke kodu + numara)
   ===============================================================
   NEDEN VAR:
     Public rezervasyon formundaki telefon doğrulaması
     `/^(\+90|0)?5\d{9}$/` idi → YALNIZ Türkiye CEP hattını kabul
     ediyordu (+49/+44/+33/+1 ve hatta TR sabit hat reddediliyordu).
     Bu helper o kuralı uluslararası E.164'e taşır.

   ⚠️ YENİ KÜTÜPHANE EKLENMEDİ (libphonenumber-js / react-phone-*
     YOK). package.json DEĞİŞMEDİ. Ülke kodu listesi aşağıda statik
     sabit olarak tutulur; `country-state-city` paketinde arama
     (dial) kodu bulunmadığı için ondan türetilemez.

   ⚠️ PURE: DOM/IO/Intl yok → hem client hem server (service, API
     route) tarafında aynı fonksiyonlar kullanılır. "Frontend
     validation'a güvenme" kuralı bu sayede TEK kaynakla sağlanır.

   SAKLAMA BİÇİMİ: E.164 → "+" + yalnız rakamlar (ör. +905321234567).
     Ülke kodu ASLA kaybolmaz; boşluk/parantez/tire normalize edilir.
=============================================================== */

/** E.164: "+" + 8..15 rakam (ITU-T; ülke kodu dahil minimum 8). */
const E164_RE = /^\+[1-9]\d{7,14}$/;

/** UI'da ülke kodu seçici için. `dial` "+" ile başlar.
 *  Liste rezervasyon trafiğine göre sıralı (TR ilk), ardından
 *  alfabetik. Yeni ülke eklemek = tek satır. */
export type DialCodeOption = {
  /** ISO 3166-1 alpha-2 — React key + ülke adı eşlemesi için. */
  iso: string;
  /** "+90" gibi. */
  dial: string;
  /** Seçicide görünen TR ad. */
  label: string;
};

export const DIAL_CODES: readonly DialCodeOption[] = [
  { iso: "TR", dial: "+90", label: "Türkiye" },
  { iso: "DE", dial: "+49", label: "Almanya" },
  { iso: "GB", dial: "+44", label: "İngiltere" },
  { iso: "NL", dial: "+31", label: "Hollanda" },
  { iso: "FR", dial: "+33", label: "Fransa" },
  { iso: "US", dial: "+1", label: "ABD / Kanada" },
  { iso: "RU", dial: "+7", label: "Rusya / Kazakistan" },
  { iso: "AT", dial: "+43", label: "Avusturya" },
  { iso: "AZ", dial: "+994", label: "Azerbaycan" },
  { iso: "BE", dial: "+32", label: "Belçika" },
  { iso: "AE", dial: "+971", label: "BAE" },
  { iso: "BG", dial: "+359", label: "Bulgaristan" },
  { iso: "CZ", dial: "+420", label: "Çekya" },
  { iso: "CN", dial: "+86", label: "Çin" },
  { iso: "DK", dial: "+45", label: "Danimarka" },
  { iso: "IE", dial: "+353", label: "İrlanda" },
  { iso: "ES", dial: "+34", label: "İspanya" },
  { iso: "IL", dial: "+972", label: "İsrail" },
  { iso: "SE", dial: "+46", label: "İsveç" },
  { iso: "CH", dial: "+41", label: "İsviçre" },
  { iso: "IT", dial: "+39", label: "İtalya" },
  { iso: "QA", dial: "+974", label: "Katar" },
  { iso: "KW", dial: "+965", label: "Kuveyt" },
  { iso: "LB", dial: "+961", label: "Lübnan" },
  { iso: "HU", dial: "+36", label: "Macaristan" },
  { iso: "EG", dial: "+20", label: "Mısır" },
  { iso: "NO", dial: "+47", label: "Norveç" },
  { iso: "UZ", dial: "+998", label: "Özbekistan" },
  { iso: "PL", dial: "+48", label: "Polonya" },
  { iso: "PT", dial: "+351", label: "Portekiz" },
  { iso: "RO", dial: "+40", label: "Romanya" },
  { iso: "SA", dial: "+966", label: "Suudi Arabistan" },
  { iso: "UA", dial: "+380", label: "Ukrayna" },
  { iso: "JO", dial: "+962", label: "Ürdün" },
  { iso: "GR", dial: "+30", label: "Yunanistan" },
] as const;

/** Formda ön seçili ülke kodu. */
export const DEFAULT_DIAL_CODE = "+90";

/** Bilinen ülke kodları — uzundan kısaya (en uzun eşleşme kazanır:
 *  "+1" ile "+972" karışmasın). */
const DIALS_LONGEST_FIRST: readonly string[] = [...DIAL_CODES]
  .map((c) => c.dial)
  .sort((a, b) => b.length - a.length);

/* ---------------------------------------------
   normalizePhone(raw) → "+905321234567" | ""
   - Boşluk, tire, parantez, nokta temizlenir.
   - Baştaki "00" → "+" (uluslararası çevirme öneki).
   - "+" yoksa ve numara "0" ile başlıyorsa: ülke kodu BİLİNMEZ →
     dokunulmaz (çağıran ülke kodunu ayrıca vermelidir).
   - Ülke kodu ASLA düşürülmez.
--------------------------------------------- */
export function normalizePhone(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  /* 🛡️ Yalnız telefon yazımında meşru karakterler kabul edilir.
     Harf/simge içeren girdi SESSİZCE TEMİZLENMEZ — aksi halde
     "+90abc1112233" gizlice "+901112233" (BAŞKA bir numara) olurdu. */
  if (/[^\d+\s().\-/]/.test(s)) return "";
  /* Yalnız rakam ve baştaki + korunur. */
  const plus = s.startsWith("+") || s.startsWith("00");
  const digits = s.replace(/\D/g, "").replace(/^00/, "");
  if (!digits) return "";
  return plus ? `+${digits}` : digits;
}

/* ---------------------------------------------
   isValidInternationalPhone(raw) → boolean
   E.164 kuralı: "+" + ülke kodu + abone no, toplam 8..15 rakam.
   ⚠️ Ülkeye ÖZEL kural YOK — +90 dahil hiçbir ülke ayrıcalıklı
   veya kısıtlı değil.
--------------------------------------------- */
export function isValidInternationalPhone(
  raw: string | null | undefined
): boolean {
  return E164_RE.test(normalizePhone(raw));
}

/* ---------------------------------------------
   joinPhone(dial, national) → E.164
   Ülke kodu seçici + numara input'unu tek değere birleştirir.
   Kullanıcı numaranın başına ulusal "0" koyarsa (0532...) atılır.
--------------------------------------------- */
export function joinPhone(
  dial: string | null | undefined,
  national: string | null | undefined
): string {
  const d = normalizePhone(dial);
  const n = String(national ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!d || !n) return "";
  return `${d.startsWith("+") ? d : `+${d}`}${n}`;
}

/* ---------------------------------------------
   splitPhone(full) → { dial, national }
   Kayıtlı E.164 değeri düzenleme formuna geri yüklerken kullanılır.
   Bilinen ülke kodlarından EN UZUN eşleşme seçilir; tanınmayan bir
   ülke kodu varsa dial boş döner ve TÜM numara national'da kalır →
   veri KAYBOLMAZ.
--------------------------------------------- */
export function splitPhone(full: string | null | undefined): {
  dial: string;
  national: string;
} {
  const e164 = normalizePhone(full);
  if (!e164.startsWith("+")) return { dial: "", national: e164 };
  for (const d of DIALS_LONGEST_FIRST) {
    if (e164.startsWith(d) && e164.length > d.length) {
      return { dial: d, national: e164.slice(d.length) };
    }
  }
  return { dial: "", national: e164 };
}

/* ---------------------------------------------
   formatPhoneForDisplay(raw) → "+90 532 123 45 67" benzeri
   Salt görsel gruplama (mail/PDF/admin). Değer DEĞİŞMEZ; parse
   edilemezse girdi aynen döner → hiçbir yerde veri kaybı olmaz.
--------------------------------------------- */
export function formatPhoneForDisplay(
  raw: string | null | undefined
): string {
  const { dial, national } = splitPhone(raw);
  if (!dial || !national) return String(raw ?? "").trim();
  const groups = national.match(/\d{1,3}/g) || [national];
  return `${dial} ${groups.join(" ")}`;
}
