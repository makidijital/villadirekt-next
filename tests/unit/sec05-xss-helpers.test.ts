/* ===============================================================
   🛡️ SEC-05 — XSS DÜZELTME REGRESYON KİLİDİ
   ===============================================================
   İki injection vektörünün kapatıldığını doğrular:
     1) gtm_container_id → inline GTM script'inde breakout
     2) villa.map_embed → ham iframe HTML enjeksiyonu
   =============================================================== */
import { describe, it, expect } from "vitest";
import { normalizeGtmId, isValidGtmId } from "@/lib/gtm.helper";
import {
  extractSafeMapEmbedSrc,
  hasSafeMapEmbed,
} from "@/lib/map-embed.helper";

describe("SEC-05 — normalizeGtmId (GTM breakout kapatma)", () => {
  it("geçerli GTM ID'leri kabul eder (mevcut GTM bozulmaz)", () => {
    for (const id of ["GTM-ABCD", "GTM-XXXXXXX", "GTM-1234567", "GTM-AB12CD34"]) {
      expect(normalizeGtmId(id)).toBe(id);
      expect(isValidGtmId(id)).toBe(true);
    }
  });

  it("baştaki/sondaki boşluğu trim'ler", () => {
    expect(normalizeGtmId("  GTM-ABCD123  ")).toBe("GTM-ABCD123");
  });

  it("script breakout denemesini reddeder", () => {
    const attack = "');window.SENTINEL_GTM_BREAKOUT=1;//";
    expect(normalizeGtmId(attack)).toBeNull();
    expect(normalizeGtmId("GTM-X');alert(1);//")).toBeNull();
    expect(normalizeGtmId("GTM-X'+alert(1)+'")).toBeNull();
  });

  it("format dışı / tehlikeli karakterleri reddeder", () => {
    for (const bad of [
      "",
      "   ",
      "GTM-",
      "gtm-abcd", // küçük harf
      "GTM-ABC", // çok kısa (<4)
      "GTM-ABCDEFGHIJKLMNOP", // çok uzun (>15)
      "UA-123456-1",
      "GTM ABCD",
      "GTM-ABC<script>",
      "GTM-ABC;DEF",
      "GTM-ABC.DEF",
      "<script>alert(1)</script>",
      null,
      undefined,
    ]) {
      expect(normalizeGtmId(bad as string)).toBeNull();
    }
  });

  it("doğrulanan değer hiçbir breakout karakteri içermez", () => {
    const ok = normalizeGtmId("GTM-ABCD123");
    expect(ok).not.toBeNull();
    expect(ok as string).toMatch(/^GTM-[A-Z0-9]+$/);
    expect(ok as string).not.toMatch(/['"();<>\s]/);
  });
});

describe("SEC-05 — extractSafeMapEmbedSrc (map_embed HTML injection kapatma)", () => {
  const GOOGLE_EMBED =
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3141";

  it("geçerli Google Maps iframe embed'inden src çıkarır (mevcut embed çalışır)", () => {
    const html = `<iframe src="${GOOGLE_EMBED}" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
    expect(extractSafeMapEmbedSrc(html)).toBe(GOOGLE_EMBED);
    expect(hasSafeMapEmbed(html)).toBe(true);
  });

  it("tek tırnaklı src'yi de çıkarır", () => {
    const html = `<iframe src='${GOOGLE_EMBED}'></iframe>`;
    expect(extractSafeMapEmbedSrc(html)).toBe(GOOGLE_EMBED);
  });

  it("çıplak Google Maps URL'ini kabul eder", () => {
    expect(extractSafeMapEmbedSrc(GOOGLE_EMBED)).toBe(GOOGLE_EMBED);
    expect(
      extractSafeMapEmbedSrc(
        "https://www.google.com/maps?q=36.2,29.6&z=14&output=embed"
      )
    ).toContain("/maps");
    expect(
      extractSafeMapEmbedSrc("https://maps.google.com/maps?q=x&output=embed")
    ).not.toBeNull();
  });

  it("ham <script> enjeksiyonunu reddeder", () => {
    expect(
      extractSafeMapEmbedSrc("<script>window.XSS=1</script>")
    ).toBeNull();
    expect(
      extractSafeMapEmbedSrc(
        `<iframe src="${GOOGLE_EMBED}"></iframe><script>window.XSS=1</script>`
      )
    ).toBe(GOOGLE_EMBED); // src çıkar ama sadece güvenli URL döner, script atılır
  });

  it("event-handler / img onerror enjeksiyonunu reddeder", () => {
    expect(
      extractSafeMapEmbedSrc('<img src=x onerror="window.XSS=1">')
    ).toBeNull();
  });

  it("izin verilmeyen host'lu iframe'i reddeder", () => {
    expect(
      extractSafeMapEmbedSrc('<iframe src="https://evil.example.com/x"></iframe>')
    ).toBeNull();
    expect(
      extractSafeMapEmbedSrc(
        '<iframe src="https://www.google.com.evil.com/maps"></iframe>'
      )
    ).toBeNull();
  });

  it("google host ama harita-dışı yolu reddeder", () => {
    expect(
      extractSafeMapEmbedSrc('<iframe src="https://www.google.com/search?q=x"></iframe>')
    ).toBeNull();
  });

  it("javascript: ve http: (non-https) şemalarını reddeder", () => {
    expect(
      extractSafeMapEmbedSrc('<iframe src="javascript:alert(1)"></iframe>')
    ).toBeNull();
    expect(
      extractSafeMapEmbedSrc('<iframe src="http://www.google.com/maps"></iframe>')
    ).toBeNull();
  });

  it("boş / null / undefined → null", () => {
    for (const v of ["", "   ", null, undefined]) {
      expect(extractSafeMapEmbedSrc(v as string)).toBeNull();
    }
  });
});
