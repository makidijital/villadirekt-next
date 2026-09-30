/* ===============================================================
   🛡️ PAGE SECTIONS — CMS section type system (migration 014)
   ===============================================================
   /p/[slug] sayfaları typed section array ile render olur:
     pages.sections: JSONB → PageSection[]

   ARCHITECTURE:
     - Discriminated union: `type` field switch-case yerine MAP
       lookup için kullanılır (PageSectionRenderer).
     - Future-proof: yeni section type eklemek için:
         1) type union'a yeni variant ekle
         2) PageSection.tsx > SECTION_RENDERERS map'ine renderer ekle
         3) Admin editor'a (varsa) yeni form alanı ekle
       DB schema değişmez; mevcut sayfalar etkilenmez.
     - parsePageSections: DB'den gelen JSON'u defansif parse eder.
       Geçersiz type / eksik field'lı section düşer (UI çökmez).

   MEVCUT TYPE'LAR (faz 1):
     - richtext: paragraph(s); newline ile blocklara bölünür
     - image:    R2 storage relative path (page-covers/...)
     - quote:    metin + opsiyonel yazar
   =============================================================== */

export type RichTextSection = {
  type: "richtext";
  content: string;
};

export type ImageSection = {
  type: "image";
  /** Bucket-relative path (site-assets bucket).
   *  Public URL `getPageCoverPublicUrl` ile üretilir. */
  path: string;
  alt?: string;
};

export type QuoteSection = {
  type: "quote";
  text: string;
  author?: string;
};

export type PageSection = RichTextSection | ImageSection | QuoteSection;

export const PAGE_SECTION_TYPES = ["richtext", "image", "quote"] as const;
export type PageSectionType = (typeof PAGE_SECTION_TYPES)[number];

/**
 * DB'den gelen `sections` JSONB değerini defansif parse eder.
 * - Array değilse [] döner.
 * - Geçersiz type'lı veya eksik field'lı satırlar düşer.
 * - Çıktı render-safe `PageSection[]`.
 */
export function parsePageSections(raw: unknown): PageSection[] {
  if (!Array.isArray(raw)) return [];
  const out: PageSection[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const type = (r as { type?: unknown }).type;
    if (typeof type !== "string") continue;
    switch (type) {
      case "richtext": {
        const content = (r as { content?: unknown }).content;
        if (typeof content === "string" && content.trim().length > 0) {
          out.push({ type: "richtext", content });
        }
        break;
      }
      case "image": {
        const path = (r as { path?: unknown }).path;
        const alt = (r as { alt?: unknown }).alt;
        if (typeof path === "string" && path.trim().length > 0) {
          out.push({
            type: "image",
            path,
            alt: typeof alt === "string" ? alt : undefined,
          });
        }
        break;
      }
      case "quote": {
        const text = (r as { text?: unknown }).text;
        const author = (r as { author?: unknown }).author;
        if (typeof text === "string" && text.trim().length > 0) {
          out.push({
            type: "quote",
            text,
            author: typeof author === "string" ? author : undefined,
          });
        }
        break;
      }
      default:
        /* Bilinmeyen type → düşür (yeni runtime, eski DB içerik
           bozulmasın diye defansif). */
        break;
    }
  }
  return out;
}
