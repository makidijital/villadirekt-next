/* ===============================================================
   🛡️ PUBLIC EN/DE — HARDCODED TÜRKÇE SIZINTI FORENSİĞİ
   ===============================================================
   NEDEN BU TEST VAR:
   Mevcut `public-locale-completion.test.tsx` / `public-locale-full-
   coverage.test.tsx` içindeki source-lock testleri
     (a) ELLE yazılmış 26 dosyalık bir listeye bakıyordu ve
     (b) yalnız Türkçe ÖZEL KARAKTER (`[çğıöşüÇĞİÖŞÜ]`) arıyordu.
   Bu iki sınır yüzünden şu gerçek hatalar kaçtı:
     • `VillaVideoModal` → aria-label "Villa videosu"
     • `FilterSidebar`   → aria-label "Tarihi temizle"
   İkisi de özel karakter İÇERMİYOR ve ikisi de listede DEĞİLDİ.

   BU TEST İKİ BOŞLUĞU DA KAPATIR:
     1) Dosya listesi ELLE TUTULMAZ — EN/DE route'larından başlayan
        transitive import kapanışı test sırasında hesaplanır; yeni bir
        public component eklendiğinde otomatik kapsama girer.
     2) Türkçe özel karakter taramasına EK olarak, ASCII Türkçe kelime
        taraması yapılır — ama YALNIZ kullanıcıya görünen pozisyonlarda
        (a11y/UI attribute değerleri + JSX metin düğümleri).

   FALSE POSITIVE POLİTİKASI (auditte sınıflandırılan kategoriler):
     • Yorum satırları        → taramadan ÖNCE silinir
     • console.* çağrıları    → pencere bazlı elenir (çok satırlı dahil)
     • import/URL/anchor/CSS  → yalnız "görünür pozisyon" tarandığı için
                                 doğal olarak kapsam dışıdır
     • regex/slug mapping     → `INTENTIONAL_TR` allowlist'inde
     • canonical TR fallback  → `INTENTIONAL_TR` allowlist'inde
     • erişilemez sentinel    → `INTENTIONAL_TR` allowlist'inde
   Allowlist DAR ve AÇIK yazılır: dosya + tam alt-dize. Yeni bir Türkçe
   sızıntısı allowlist'e denk gelmediği sürece test KIRILIR.

   ⚠️ Bu test MEVCUT source-lock testlerinin YERİNE GEÇMEZ; onlar
   dokunulmadan duruyor. Bu dosya onların üstüne EK bir ağ örer.
=============================================================== */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, normalize, relative } from "node:path";

const ROOT = process.cwd();

/* ---------------------------------------------------------------
   1) EN/DE REACHABILITY KAPANIŞI (elle liste YOK)
--------------------------------------------------------------- */

const IMPORT_RE = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
const EXTS = ["", ".tsx", ".ts", "/index.tsx", "/index.ts"];

function resolveSpec(spec: string, from: string): string | null {
  let cand: string;
  if (spec.startsWith("@/")) cand = spec.slice(2);
  else if (spec.startsWith(".")) cand = normalize(join(dirname(from), spec));
  else return null;
  for (const ext of EXTS) {
    const p = cand + ext;
    if (existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isFile()) {
      return normalize(p);
    }
  }
  return null;
}

function walkPages(dir: string, acc: string[]): void {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return;
  for (const name of readdirSync(abs)) {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) walkPages(rel, acc);
    else if (name === "page.tsx" || name === "layout.tsx") acc.push(rel);
  }
}

function reachableFiles(): string[] {
  const entries: string[] = [];
  walkPages("app/(public)/en", entries);
  walkPages("app/(public)/de", entries);
  for (const extra of [
    "app/(public)/layout.tsx",
    "app/layout.tsx",
    "app/not-found.tsx",
  ]) {
    if (existsSync(join(ROOT, extra))) entries.push(extra);
  }

  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const f = normalize(stack.pop()!);
    if (seen.has(f)) continue;
    if (!existsSync(join(ROOT, f))) continue;
    seen.add(f);
    const src = readFileSync(join(ROOT, f), "utf8");
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(src)) !== null) {
      const r = resolveSpec(m[1], f);
      if (r && !seen.has(r)) stack.push(r);
    }
  }
  return [...seen].sort();
}

/** Kullanıcıya metin basan PUBLIC UI dosyaları (lib/service/db hariç —
 *  onların Türkçe içerikleri auditte canonical/teknik olarak sınıflandı
 *  ve zaten UI'a doğrudan basılmıyor). */
function publicUiFiles(): string[] {
  return reachableFiles().filter(
    (f) =>
      (f.startsWith("app/components/") || f.startsWith("app/(public)/")) &&
      (f.endsWith(".ts") || f.endsWith(".tsx"))
  );
}

const UI_FILES = publicUiFiles();

/* ---------------------------------------------------------------
   2) YORUM TEMİZLEME (satır numarası korunur)
--------------------------------------------------------------- */

function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let state: "none" | "block" | "line" = "none";
  while (i < src.length) {
    if (state === "none") {
      if (src.startsWith("/*", i)) {
        state = "block";
        out += "  ";
        i += 2;
        continue;
      }
      if (src.startsWith("//", i)) {
        state = "line";
        out += "  ";
        i += 2;
        continue;
      }
      out += src[i];
      i += 1;
    } else if (state === "block") {
      if (src.startsWith("*/", i)) {
        state = "none";
        out += "  ";
        i += 2;
        continue;
      }
      out += src[i] === "\n" ? "\n" : " ";
      i += 1;
    } else {
      if (src[i] === "\n") {
        state = "none";
        out += "\n";
        i += 1;
        continue;
      }
      out += " ";
      i += 1;
    }
  }
  return out;
}

/* ---------------------------------------------------------------
   3) BİLİNÇLİ TÜRKÇE — DAR VE AÇIK ALLOWLIST
--------------------------------------------------------------- */

const INTENTIONAL_TR: Record<string, string[]> = {
  /* Slug/başlık EŞLEŞTİRME regex'leri — kullanıcıya BASILMAZ; CMS
     sayfasının hangi rozeti alacağını belirler (auditte "regex
     mapping" false-positive kategorisi). */
  "app/components/cms/CmsPageBody.tsx": [
    "gizlilik|kvkk",
    "sss|faq|sik sorul",
    "hakk|about|biz kim",
  ],
  /* Marka + varsayılan meta metni. `site_name` / `default_meta_*`
     settings ALANLARI çevrilebilir (`resolveSettingsText`); bu iki
     sabit yalnız admin HİÇBİR değer girmediğinde devreye giren
     canonical TR marka fallback'idir ve `app/layout.tsx` ile
     BİREBİR aynıdır (auditte "canonical brand" kategorisi). */
  "app/components/home/home-metadata.ts": [
    "TR_FALLBACK_TITLE",
    "TR_FALLBACK_DESCRIPTION",
    "Villa Kiralama — Lüks Villa Deneyimi",
    "Akdeniz'in seçkin villalarında",
  ],
  /* ERİŞİLEMEZ SENTINEL: `buildHeroDateLabel` bu dalı yalnız
     `startDate == null` iken döner, çağıran ise
     `value={startDate ? dateLabel : ""}` ile onu HİÇ render etmez
     (bkz. HeroSearchPanel.tsx). */
  "app/components/ui/hero/_helpers/date-label.ts": ['"Tarih seç"'],
};

function isAllowed(file: string, line: string): boolean {
  const allow = INTENTIONAL_TR[file];
  if (!allow) return false;
  return allow.some((frag) => line.includes(frag));
}

/** `console.*` çağrısı ÇOK SATIRLI olabilir → 4 satırlık geriye
 *  bakan pencere kullanılır (tek satır `includes` yetersizdi). */
function inConsoleCall(lines: string[], idx: number): boolean {
  return lines.slice(Math.max(0, idx - 3), idx + 1).join("\n").includes("console.");
}

/* ---------------------------------------------------------------
   TEST 1 — Türkçe ÖZEL KARAKTER taraması (kapsam genişletildi)
--------------------------------------------------------------- */

const TR_CHARS = /[çğıİöşüÇĞÖŞÜ]/;

describe("public EN/DE — Türkçe özel karakter sızıntısı", () => {
  it("reachability kapanışı makul büyüklükte (elle liste kullanılmıyor)", () => {
    /* Regresyon guard'ı: kapanış hesabı bozulup 0/az dosya dönerse
       test sessizce "geçmiş" görünmesin. */
    expect(UI_FILES.length).toBeGreaterThan(80);
    expect(UI_FILES).toContain("app/components/villa/VillaVideoModal.tsx");
    expect(UI_FILES).toContain("app/(public)/arama/FilterSidebar.tsx");
    expect(UI_FILES).toContain("app/components/villa/VillaCard.tsx");
  });

  it("hiçbir public UI dosyasında bilinçsiz Türkçe karakter yok", () => {
    const offending: string[] = [];
    for (const f of UI_FILES) {
      const lines = stripComments(readFileSync(join(ROOT, f), "utf8")).split("\n");
      lines.forEach((line, i) => {
        if (!TR_CHARS.test(line)) return;
        if (inConsoleCall(lines, i)) return;
        if (isAllowed(f, line)) return;
        offending.push(`${f}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }
    expect(offending).toEqual([]);
  });
});

/* ---------------------------------------------------------------
   TEST 2 — ASCII TÜRKÇE taraması (özel karakter İÇERMEYEN)
   Yalnız KULLANICIYA GÖRÜNEN pozisyonlar taranır:
     • a11y / UI attribute değerleri (aria-label, title, placeholder,
       alt, aria-description)
     • JSX metin düğümleri (`>metin<`)
   Bu sayede import yolları, URL/query contract'ları, anchor id'leri,
   CSS sınıfları ve tab id'leri DOĞAL OLARAK kapsam dışı kalır.
--------------------------------------------------------------- */

const VISIBLE_ATTR =
  /(?:aria-label|title|placeholder|alt|aria-description)\s*=\s*"([^"]{2,120})"/g;
const JSX_TEXT = />\s*([A-Za-zÇĞİÖŞÜçğıöşü][^<>{}\n]{2,120}?)\s*</g;

/** Türkçe'ye ÖZGÜ, EN/DE UI metninde geçmesi beklenmeyen tokenlar.
 *  ⚠️ "Villa", "Blog", "Market" gibi dil-nötr kelimeler BİLEREK YOK. */
const TR_ASCII_WORD =
  /(?<![a-z])(videosu|videolar|fotograf|fotografi|gorsel|sayfasi|bulunamadi|yukleniyor|gonder|gonderiliyor|kapat|temizle|secin|seciniz|bulundu|basarili|yakinda|gecerli|girin|deneyin|olmali|gerekli|kaydedildi|guncelle|tarihi|tarihler|misafir|konaklama|rezervasyon|temizlik|mesafe|iletisim|ayrinti|secenek|bolge|gece|kisi|yorum|fiyat|indirim|toplam|arasi|dahil|villalar|villayi|odasi|banyo|havuz)(?![a-z])/i;

function visibleStrings(line: string): string[] {
  const out: string[] = [];
  for (const re of [VISIBLE_ATTR, JSX_TEXT]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) out.push(m[1]);
  }
  return out;
}

describe("public EN/DE — ASCII Türkçe sızıntısı (özel karakter içermeyen)", () => {
  it("tarayıcı gerçekten çalışıyor: bilinen eski hatalar yakalanır", () => {
    /* Regresyon kanıtı — bu satırlar production'da GERÇEKTEN vardı. */
    expect(visibleStrings('aria-label="Tarihi temizle"').some((s) => TR_ASCII_WORD.test(s))).toBe(true);
    expect(visibleStrings('aria-label="Villa videosu"').some((s) => TR_ASCII_WORD.test(s))).toBe(true);
    expect(visibleStrings('title="Villa YouTube videosu"').some((s) => TR_ASCII_WORD.test(s))).toBe(true);
    expect(visibleStrings("<span>Misafir Yorumlari</span>").some((s) => TR_ASCII_WORD.test(s))).toBe(true);
  });

  it("false positive üretmiyor: EN/DE metinleri ve teknik contract'lar temiz", () => {
    const clean = [
      'aria-label="Clear dates"',
      'aria-label="Daten löschen"',
      'title="Villa video"',
      'title="Villa-Video"',
      'href="/rezervasyon/test-villa"',
      'from "@/app/components/villa/VillaPoolSection"',
      'const CMS_SSS_RE = /sss|faq|yardim/;',
      'id="misafir-deneyimleri"',
      '{ id: "fiyatlar", label: dict.villaTabs.prices }',
    ];
    for (const line of clean) {
      expect(
        visibleStrings(line).some((s) => TR_ASCII_WORD.test(s)),
        line
      ).toBe(false);
    }
  });

  it("hiçbir public UI dosyasında ASCII Türkçe UI metni yok", () => {
    const offending: string[] = [];
    for (const f of UI_FILES) {
      const lines = stripComments(readFileSync(join(ROOT, f), "utf8")).split("\n");
      lines.forEach((line, i) => {
        if (inConsoleCall(lines, i)) return;
        if (isAllowed(f, line)) return;
        for (const s of visibleStrings(line)) {
          if (TR_ASCII_WORD.test(s)) {
            offending.push(`${f}:${i + 1}  ${s.slice(0, 100)}`);
          }
        }
      });
    }
    expect(offending).toEqual([]);
  });
});

/* ---------------------------------------------------------------
   TEST 3 — Bu turda kapatılan 3 bulgunun KALICI guard'ı
--------------------------------------------------------------- */

describe("kapatılan bulgular geri gelmiyor", () => {
  it("VillaVideoModal hardcoded Türkçe a11y metni içermiyor", () => {
    const src = readFileSync(
      join(ROOT, "app/components/villa/VillaVideoModal.tsx"),
      "utf8"
    );
    expect(src).not.toContain("Villa videosu");
    expect(src).not.toContain("YouTube videosu");
    expect(src).toContain("dict.gallery.videoModalAriaLabel");
    expect(src).toContain("dict.gallery.videoFrameTitle");
  });

  it("FilterSidebar tarih temizleme aria-label'ı dictionary'den", () => {
    const src = readFileSync(
      join(ROOT, "app/(public)/arama/FilterSidebar.tsx"),
      "utf8"
    );
    expect(src).not.toContain('aria-label="Tarihi temizle"');
    expect(src).toContain("dict.clearDateAriaLabel");
  });

  it("CMS metadata son-çare başlığı dictionary'den", () => {
    const src = readFileSync(
      join(ROOT, "app/components/cms/cms-page-metadata.ts"),
      "utf8"
    );
    expect(src).not.toContain('|| "Sayfa"');
    expect(src).toContain("cms.fallbackTitle");
  });
});

/* ---------------------------------------------------------------
   TEST 4 — villa.badge çevirisi TÜM kart yüzeylerinde bağlı
--------------------------------------------------------------- */

const BADGE_SURFACES = [
  "app/components/search/AramaPageBody.tsx",
  "app/components/search/KiralikVillalarPageBody.tsx",
  "app/(public)/favoriler/FavoritesGrid.tsx",
  "app/components/favorites/SharedFavoritesPageBody.tsx",
  "app/components/short-gaps/ShortGapsPageBody.tsx",
  "app/components/shared-list/SharedListPageBody.tsx",
  "app/components/villa/VillaList.tsx",
  "app/components/home/DiscountCollection.tsx",
  "app/components/villa/SimilarVillasSection.tsx",
];

describe("villa.badge — tüm public kart yüzeylerinde locale-aware", () => {
  it.each(BADGE_SURFACES)("%s badge'i locale'e göre çözüyor", (f) => {
    const src = readFileSync(join(ROOT, f), "utf8");
    const resolved =
      src.includes("getVillaBadgesByLocale") ||
      src.includes("getVillaBadgesAction") ||
      /resolveTranslatedField\(\s*\n?\s*villaTranslations\.get\([^)]*\)\?\.badge/.test(
        src
      );
    expect(resolved, `${f} badge çevirisini okumuyor`).toBe(true);
  });

  it.each(BADGE_SURFACES)("%s canonical fallback'i koruyor", (f) => {
    const src = readFileSync(join(ROOT, f), "utf8");
    /* Çeviri yoksa canonical rozet gösterilmeli → `?? <canonical>`
       veya `resolveTranslatedField(..., canonical)` deseni. */
    const hasFallback =
      /badgeBy(VillaId|Id)(\.get\([^)]*\)|\[[^\]]*\])\s*\?\?/.test(src) ||
      /resolveTranslatedField\(/.test(src);
    expect(hasFallback, `${f} canonical fallback'i kaybetmiş`).toBe(true);
  });

  it("badge çözümü villa BAŞINA değil, BATCH (N+1 yok)", () => {
    for (const f of BADGE_SURFACES) {
      const src = readFileSync(join(ROOT, f), "utf8");
      const calls =
        (src.match(/getVillaBadgesByLocale\(/g) || []).length +
        (src.match(/getVillaBadgesAction\(/g) || []).length;
      /* Her yüzeyde EN FAZLA 1 batch çağrısı (AramaPageBody iki listeyi
         TEK çağrıda birleştirir). 0 ise `resolveTranslatedField` üst
         seviyede batch ile çözüyor demektir (SimilarVillasSection). */
      expect(calls, `${f} ${calls} kez badge sorgusu yapıyor`).toBeLessThanOrEqual(1);
      /* `.map(` içinden çağrı YAPILMAMALI (klasik N+1 imzası). */
      expect(
        /\.map\([^)]*\)\s*=>[\s\S]{0,200}?getVillaBadges/.test(src),
        `${f} map içinde badge sorgusu yapıyor (N+1)`
      ).toBe(false);
    }
  });
});
