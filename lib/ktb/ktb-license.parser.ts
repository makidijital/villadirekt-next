/* ===============================================================
   🛡️ KTB SORGU SAYFASI AYRIŞTIRICISI (bakanlikbelgelikonutlardemo.aspx)
   ===============================================================
   GERÇEK production yanıtlarına dayanır (tests/fixtures/ktb/):
     ktb_07-6195.html      → kayıt var
     ktb_07-99999999.html  → kayıt yok
     ktb_abc.html          → KTB format doğrulaması YAPMIYOR; "yok" ile
                             birebir aynı yanıt (yalnız form action farklı)
     ktb_bos.html          → belgeno boşken FİLTRESİZ tüm liste (34.071
                             kayıt, ~8,8 MB) döner

   SAYFA YAPISI (doğrulanan işaretler):
     1) Sorgu yankısı — form action sorgulanan numarayı taşır:
          <form method="post"
                action="/genel/bakanlikbelgelikonutlardemo.aspx?belgeno=07-6195" …>
     2) Sonuç verisi sayfaya gömülü TEK bir JS atamasıdır (client-side
        grid bunu okur; ayrı XHR/API yok):
          var jsondata = [ … ];filtrele();
        • kayıt var : [{"il":…,"ilce":…,"belgeSahip":…,"belgeNo":"07-6195",
                        "belgeKonutTip":…,"adres":…,"konutAdet":…,
                        "odaSayi":…,"yatakSayi":…}]
        • kayıt yok : []
     3) Kayıtlarda DURUM / İPTAL alanı YOK. Filtresiz 34.071 kayıtlık
        listede anahtar kümesi tek (yukarıdaki 9 alan) ve sayfada "iptal"
        / "geçersiz" ibaresi hiç geçmiyor → KTB bu sayfada iptali
        GÖSTERMİYOR. Bu yüzden bu ayrıştırıcı INVALID ÜRETMEZ; iptal
        edilen belge listeden düştüğünde NOT_FOUND olur ve durum makinesi
        (VALID → NOT_FOUND) "inceleme gerekli" işaretler.

   SINIFLANDIRMA (yalnız belge numarası okunur; diğer alanlar
   YORUMLANMAZ ve hiçbir yere yazılmaz):
     VALID      → sorgu yankısı doğru + jsondata ≥1 kayıt + en az bir
                  kaydın belgeNo'su sorgulanan numarayla BİREBİR aynı +
                  tüm kayıtlar sorguyu içeriyor (filtre uygulanmış)
     NOT_FOUND  → sorgu yankısı doğru + jsondata tam olarak []
     CHECK_FAILED → diğer HER durum:
        html_changed        işaret yok / birden fazla / JSON bozuk
        query_mismatch      yanıt başka bir sorguya ait
        unknown_fields      kayıtlarda tanınmayan alan (ör. yeni bir
                            durum alanı) — sessizce VALID sayılmaz
        unexpected_entries  sorguyu içermeyen kayıtlar (filtresiz liste)
        ambiguous_result    kayıt var ama birebir eşleşme yok
=============================================================== */

import type { LicenseCheckResult } from "./license-state";

/** Gerçek KTB örnekleriyle doğrulandı (tests/fixtures/ktb). */
export const KTB_PARSER_VERIFIED = true;

export type KtbParseResult = {
  status: LicenseCheckResult;
  reason: string | null;
  /** Sayfa beklenen yapıda değil (art arda gelirse tarama durdurulur). */
  structural?: boolean;
  /** CAPTCHA / engel sayfası — tarama hemen durdurulur. */
  stopRun?: boolean;
};

const JSONDATA_START = "var jsondata = ";
const JSONDATA_END = ";filtrele();";

/** Doğrulanan kayıt anahtarları (fazlası → CHECK_FAILED/unknown_fields). */
const KNOWN_ENTRY_KEYS = new Set([
  "il",
  "ilce",
  "belgeSahip",
  "belgeNo",
  "belgeKonutTip",
  "adres",
  "konutAdet",
  "odaSayi",
  "yatakSayi",
]);

function checkFailed(reason: string, structural = true): KtbParseResult {
  return { status: "CHECK_FAILED", reason, structural };
}

/** Sayfadaki TEK `var jsondata = [...];filtrele();` dizisini çıkarır. */
function extractJsonData(html: string): unknown[] | null {
  const start = html.indexOf(JSONDATA_START);
  if (start < 0 || html.indexOf(JSONDATA_START, start + 1) >= 0) return null;
  const from = start + JSONDATA_START.length;
  const end = html.indexOf(JSONDATA_END, from);
  if (end < 0) return null;
  try {
    const parsed: unknown = JSON.parse(html.slice(from, end));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseKtbLicensePage(
  html: string,
  normalizedDocumentNumber: string
): KtbParseResult {
  if (typeof html !== "string" || html.length === 0) return checkFailed("html_changed");

  /* 1) Yanıt bu sorguya mı ait? (form action yankısı) */
  const echo = `action="/genel/bakanlikbelgelikonutlardemo.aspx?belgeno=${normalizedDocumentNumber}"`;
  if (!html.includes(echo)) return checkFailed("query_mismatch");

  /* 2) Gömülü sonuç dizisi. */
  const entries = extractJsonData(html);
  if (entries === null) return checkFailed("html_changed");

  if (entries.length === 0) return { status: "NOT_FOUND", reason: null };

  /* 3) Kayıt yapısı: yalnız belgeNo okunur; tanınmayan alan → güvenli red. */
  const numbers: string[] = [];
  for (const e of entries) {
    if (!e || typeof e !== "object" || Array.isArray(e)) return checkFailed("html_changed");
    const rec = e as Record<string, unknown>;
    for (const k of Object.keys(rec)) {
      if (!KNOWN_ENTRY_KEYS.has(k)) return checkFailed("unknown_fields");
    }
    if (typeof rec.belgeNo !== "string") return checkFailed("html_changed");
    numbers.push(rec.belgeNo.trim());
  }

  /* 4) Filtre gerçekten uygulanmış mı? (boş sorgu tüm listeyi döndürür) */
  if (!numbers.every((n) => n.includes(normalizedDocumentNumber))) {
    return checkFailed("unexpected_entries");
  }

  /* 5) Birebir eşleşme şart — HTTP 200 veya "kayıt var" tek başına yetmez. */
  if (numbers.some((n) => n === normalizedDocumentNumber)) {
    return { status: "VALID", reason: null };
  }
  return checkFailed("ambiguous_result", false);
}
