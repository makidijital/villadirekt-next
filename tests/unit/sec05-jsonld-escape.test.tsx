/* ===============================================================
   🛡️ SEC-05 Phase 2 — JSON-LD <script> BREAKOUT REGRESYON KİLİDİ
   ===============================================================
   `JsonLd` inline `<script type="application/ld+json">` üretir.
   Admin kontrollü bir metin `</script>` içerdiğinde blok erken
   kapanmamalı (runtime'da doğrulanan XSS). Aynı zamanda JSON-LD
   verisi (JSON.parse sonucu) BİREBİR aynı kalmalı → SEO bozulmaz.
   =============================================================== */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  JsonLd,
  serializeJsonLd,
  buildVacationRental,
  buildBreadcrumb,
} from "@/app/components/seo/StructuredData";

const BREAKOUT =
  "Villa </script><script>window.__SEC05_JSONLD_TEST=1</script> <!-- x";

describe("SEC-05 — serializeJsonLd", () => {
  it("çıktıda hiç '<' karakteri kalmaz (</script ve <!-- oluşamaz)", () => {
    const out = serializeJsonLd({ name: BREAKOUT, nested: [{ a: "<b>" }] });
    expect(out).not.toContain("<");
    expect(out.toLowerCase()).not.toContain("</script");
    expect(out).not.toContain("<!--");
  });

  it("JSON.parse sonucu orijinal veriyle BİREBİR aynı (SEO verisi değişmez)", () => {
    const data = {
      "@context": "https://schema.org",
      "@type": "VacationRental",
      name: BREAKOUT,
      description: "Kaş'ta 3+1 villa — havuz & deniz manzarası > 50m² \"özel\"",
      image: ["https://cdn.example.test/a.webp"],
      geo: { latitude: 36.2, longitude: 29.6 },
      emoji: "🌊",
    };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it("'<' içermeyen normal veri için çıktı JSON.stringify ile AYNI (mevcut HTML değişmez)", () => {
    const data = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Tatilin Yeri",
      url: "https://example.test/",
      sameAs: ["https://instagram.com/x"],
      text: "Çok güzel & şık > villa",
    };
    expect(serializeJsonLd(data)).toBe(JSON.stringify(data));
  });

  it("undefined → boş string (eski davranış: boş script)", () => {
    expect(serializeJsonLd(undefined)).toBe("");
  });
});

describe("SEC-05 — JsonLd render (SSR markup)", () => {
  it("breakout içeren veriyle bile tek bir script bloğu üretir", () => {
    const html = renderToStaticMarkup(<JsonLd data={{ name: BREAKOUT }} />);
    expect(html.startsWith('<script type="application/ld+json">')).toBe(true);
    // Yalnız bloğun kendi kapanışı: tam olarak 1 adet </script
    expect(html.toLowerCase().split("</script").length - 1).toBe(1);
    expect(html).not.toContain("<script>window.");
    const body = html
      .replace('<script type="application/ld+json">', "")
      .replace(/<\/script>$/, "");
    expect(JSON.parse(body)).toEqual({ name: BREAKOUT });
  });

  it("gerçek builder'lar (VacationRental + Breadcrumb) güvenli ve parse edilebilir", () => {
    const rental = buildVacationRental({
      slug: "villa-x",
      title: BREAKOUT,
      description: "<p>Açıklama</p>",
      images: [],
    } as Parameters<typeof buildVacationRental>[0]);
    const crumb = buildBreadcrumb([{ name: "Ana Sayfa", url: "/" }, { name: BREAKOUT }]);
    for (const data of [rental, crumb]) {
      const html = renderToStaticMarkup(<JsonLd data={data} />);
      expect(html.toLowerCase().split("</script").length - 1).toBe(1);
      const body = html
        .replace('<script type="application/ld+json">', "")
        .replace(/<\/script>$/, "");
      expect(JSON.parse(body)).toEqual(JSON.parse(JSON.stringify(data)));
    }
  });
});
