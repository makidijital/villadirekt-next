// @vitest-environment node
/* ===============================================================
   🛡️ KTB parser — GERÇEK production fixture'ları (tests/fixtures/ktb)
   ===============================================================
   ktb_07-6195.html     kayıt var (belgeSahip/adres test için anonimleştirildi)
   ktb_07-99999999.html kayıt yok  → var jsondata = [];
   ktb_abc.html         KTB format doğrulamıyor → "yok" ile aynı yanıt
   ktb_bos.html         (opsiyonel) boş sorgu → filtresiz tüm liste
=============================================================== */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { KTB_PARSER_VERIFIED, parseKtbLicensePage } from "@/lib/ktb/ktb-license.parser";
import { KTB_MAX_RESPONSE_BYTES } from "@/lib/ktb/ktb-license.client.server";

const dir = join(process.cwd(), "tests/fixtures/ktb");
const read = (f: string) => readFileSync(join(dir, f), "utf8");
const VALID_HTML = read("ktb_07-6195.html");
const NOT_FOUND_HTML = read("ktb_07-99999999.html");
const ABC_HTML = read("ktb_abc.html");
const BOS_PATH = join(dir, "ktb_bos.html");

/** Gerçek bir yanıtta yalnız jsondata dizisini değiştirir (yapı aynı kalır). */
const withJsonData = (html: string, json: string) =>
  html.replace(/var jsondata = \[[\s\S]*?\];filtrele\(\);/, `var jsondata = ${json};filtrele();`);

describe("KTB parser — gerçek fixture'lar", () => {
  it("bayrak açık (fixture'larla doğrulandı)", () => {
    expect(KTB_PARSER_VERIFIED).toBe(true);
  });

  it("07-6195 → VALID (belgeNo sorgulananla birebir aynı)", () => {
    expect(parseKtbLicensePage(VALID_HTML, "07-6195")).toEqual({ status: "VALID", reason: null });
  });

  it("07-99999999 → NOT_FOUND (jsondata = [])", () => {
    expect(parseKtbLicensePage(NOT_FOUND_HTML, "07-99999999")).toEqual({ status: "NOT_FOUND", reason: null });
  });

  it("abc → KTB 'yok' ile aynı yanıt veriyor (bizde format dışı numara zaten sorgulanmaz)", () => {
    expect(parseKtbLicensePage(ABC_HTML, "abc")).toEqual({ status: "NOT_FOUND", reason: null });
  });

  it("gerçek fixture'larda hiçbir zaman INVALID üretilmez", () => {
    for (const [html, doc] of [[VALID_HTML, "07-6195"], [NOT_FOUND_HTML, "07-99999999"], [ABC_HTML, "abc"]]) {
      expect(parseKtbLicensePage(html, doc).status).not.toBe("INVALID");
    }
  });

  describe("sorgu yankısı doğrulaması", () => {
    it("başka numaranın yanıtı → CHECK_FAILED/query_mismatch (VALID sayılmaz)", () => {
      expect(parseKtbLicensePage(VALID_HTML, "07-6196")).toMatchObject({ status: "CHECK_FAILED", reason: "query_mismatch", structural: true });
      expect(parseKtbLicensePage(NOT_FOUND_HTML, "07-6195")).toMatchObject({ status: "CHECK_FAILED", reason: "query_mismatch" });
    });
  });

  describe("tanınmayan yapılar → CHECK_FAILED", () => {
    const cases: Array<[string, string, string]> = [
      ["boş gövde", "", "html_changed"],
      ["jsondata yok (ör. engel/CAPTCHA/bakım sayfası)", VALID_HTML.replace("var jsondata = ", "var otherdata = "), "html_changed"],
      ["filtrele() sonlandırıcısı yok", VALID_HTML.replace(";filtrele();", ";"), "html_changed"],
      ["iki jsondata ataması", VALID_HTML.replace("var jsondata = ", "var jsondata = [];var jsondata = "), "html_changed"],
      ["bozuk JSON", withJsonData(VALID_HTML, '[{"belgeNo":"07-6195",}]'), "html_changed"],
      ["dizi değil", withJsonData(VALID_HTML, "{}").replace("{};filtrele", "{};filtrele"), "html_changed"],
      ["belgeNo alanı yok", withJsonData(VALID_HTML, '[{"il":"ANTALYA"}]'), "html_changed"],
      ["yeni/bilinmeyen alan (ör. durum)", withJsonData(VALID_HTML, '[{"belgeNo":"07-6195","durum":"IPTAL"}]'), "unknown_fields"],
      ["filtresiz liste", withJsonData(VALID_HTML, '[{"belgeNo":"07-6195"},{"belgeNo":"48-1234"}]'), "unexpected_entries"],
    ];
    for (const [name, html, reason] of cases) {
      it(name, () => {
        const r = parseKtbLicensePage(html, "07-6195");
        expect(r.status).toBe("CHECK_FAILED");
        expect(r.reason).toBe(reason);
        expect(r.structural).toBe(true);
      });
    }

    it("kayıt var ama birebir eşleşme yok → CHECK_FAILED/ambiguous_result (yapısal değil)", () => {
      const r = parseKtbLicensePage(withJsonData(VALID_HTML, '[{"belgeNo":"07-61950"}]'), "07-6195");
      expect(r).toEqual({ status: "CHECK_FAILED", reason: "ambiguous_result", structural: false });
    });
    it("alt dizge eşleşmeli birden çok kayıt içinde birebir eşleşme → VALID", () => {
      const html = withJsonData(VALID_HTML, '[{"belgeNo":"07-6195"},{"belgeNo":"07-61950"}]');
      expect(parseKtbLicensePage(html, "07-6195")).toEqual({ status: "VALID", reason: null });
    });
  });

  it.skipIf(!existsSync(BOS_PATH))("boş sorgu gerçek yanıtı (filtresiz ~34 bin kayıt) — VALID sayılmaz", () => {
    const html = readFileSync(BOS_PATH, "utf8");
    /* İstemci 2 MB üstünü zaten reddeder (response_too_large). */
    expect(Buffer.byteLength(html, "utf8")).toBeGreaterThan(KTB_MAX_RESPONSE_BYTES);
    /* Parser'a gelse bile: yankı "belgeno=" boş → sorgulanan numarayla eşleşmez. */
    expect(parseKtbLicensePage(html, "07-6195")).toMatchObject({ status: "CHECK_FAILED", reason: "query_mismatch" });
    /* Yankı atlatılsa bile filtresiz liste reddedilir. */
    const forced = html.replace('belgeno=" id="form2"', 'belgeno=07-6195" id="form2"');
    expect(parseKtbLicensePage(forced, "07-6195")).toMatchObject({ status: "CHECK_FAILED", reason: "unexpected_entries" });
  });
});
