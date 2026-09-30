/* ===============================================================
   🔎 lib/search.ts — normalizeSearchText REGRESSION TEST
   ===============================================================
   AMAÇ:
     Migration 078 (villa.real_title_search) + searchByTitle düzeltmesi
     ("real_title" yerine "real_title_search" ile ILIKE), bu fonksiyonun
     ürettiği `needle`'ın search_title (migration 065) VE real_title_search
     (migration 078) ile AYNI SQL formülünü (translate ç/Ç→c ğ/Ğ→g ı→i
     İ→i ö/Ö→o ş/Ş→s ü/Ü→u â/Â→a î/Î→i û/Û→u → lower → whitespace
     sadeleştir → btrim) üretmesine bağımlıdır. Bu test o varsayımı
     KİLİTLER — DB'ye bağımlı DEĞİL, saf fonksiyon testi.

   Audit senaryosu (real_title = "Villa Aydoğdu"):
    "Aydoğdu" / "Aydogdu" / "aydoğdu" / "aydogdu" → AYNI needle "aydogdu"
    "Doğdu" / "Dogdu" / "doğdu" / "dogdu"         → AYNI needle "dogdu"
   Bu 8 terimin HER BİRİ aynı needle'a foldlandığı için, real_title_search
   (aynı formülle üretilmiş) üzerinde ILIKE '%needle%' hepsi için AYNI
   şekilde davranır — simetrik, güvenilir eşleşme.
   =============================================================== */

import { describe, it, expect } from "vitest";
import { normalizeSearchText, escapeLikePattern } from "@/lib/search";

describe("normalizeSearchText — real_title_search (Migration 078) needle kanonu", () => {
  it("audit senaryosu — 'Villa Aydoğdu' real_title için 8 terim de AYNI needle'a foldlanır", () => {
    const aydogduVariants = ["Aydoğdu", "Aydogdu", "aydoğdu", "aydogdu"];
    const dogduVariants = ["Doğdu", "Dogdu", "doğdu", "dogdu"];

    for (const term of aydogduVariants) {
      expect(normalizeSearchText(term)).toBe("aydogdu");
    }
    for (const term of dogduVariants) {
      expect(normalizeSearchText(term)).toBe("dogdu");
    }
  });

  it("normalize edilmiş real_title ('villa aydogdu') tüm 8 terimin needle'ını substring olarak içerir", () => {
    // real_title_search GENERATED STORED kolonunun üreteceği değeri simüle eder
    // (aynı translate/lower formülü — migration 078, coalesce(real_title,'') + TR-fold + lower).
    const simulatedRealTitleSearch = normalizeSearchText("Villa Aydoğdu");
    expect(simulatedRealTitleSearch).toBe("villa aydogdu");

    const terms = [
      "Aydoğdu",
      "Aydogdu",
      "aydoğdu",
      "aydogdu",
      "Doğdu",
      "Dogdu",
      "doğdu",
      "dogdu",
    ];
    for (const term of terms) {
      const needle = normalizeSearchText(term);
      expect(simulatedRealTitleSearch.includes(needle)).toBe(true);
    }
  });

  it("tek başına Türkçe harfler doğru ASCII karşılığına foldlanır (ç,ğ,ı,İ,ö,ş,ü)", () => {
    expect(normalizeSearchText("ç")).toBe("c");
    expect(normalizeSearchText("ğ")).toBe("g");
    expect(normalizeSearchText("ı")).toBe("i");
    expect(normalizeSearchText("İ")).toBe("i");
    expect(normalizeSearchText("ö")).toBe("o");
    expect(normalizeSearchText("ş")).toBe("s");
    expect(normalizeSearchText("ü")).toBe("u");
  });

  it("regresyon — mevcut villa adı (title/search_title) araması davranışı DEĞİŞMEDİ", () => {
    // search_title (migration 065) hâmâ AYNI formülü kullanıyor; bu test
    // yalnızca normalizeSearchText'in title-arama senaryosunda da tutarlı
    // kaldığını doğrular (regression guard, DB'ye dokunmaz).
    expect(normalizeSearchText("Villa Irmak")).toBe("villa irmak");
    expect(normalizeSearchText("villa ırmak")).toBe("villa irmak");
    expect(normalizeSearchText("VİLLA IRMAK")).toBe("villa irmak");
  });

  it("boş/whitespace-only terim → boş needle (searchByTitle needle.length===0 erken [] davranışı bununla tutarlı)", () => {
    expect(normalizeSearchText("")).toBe("");
    expect(normalizeSearchText("   ")).toBe("");
    expect(normalizeSearchText(null)).toBe("");
    expect(normalizeSearchText(undefined)).toBe("");
  });

  it("escapeLikePattern — needle ILIKE wildcard karakterlerini literal'e çevirir (davranış korunuyor)", () => {
    expect(escapeLikePattern("50%_off")).toBe("50\\%\\_off");
    expect(escapeLikePattern(normalizeSearchText("Doğdu"))).toBe("dogdu");
  });
});
