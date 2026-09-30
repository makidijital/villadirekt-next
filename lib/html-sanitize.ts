import sanitizeHtmlLib from "sanitize-html";

/* ===============================================================
   🛡️ HTML SANITIZE — villa açıklaması (Tiptap rich text)
   ===============================================================
   - sanitizeHtml(): render + kayıt için XSS-güvenli allow-list HTML.
   - stripHtml():    SEO (meta description / JSON-LD) için düz metin.

   YALNIZ server tarafında import edilir (payload.ts + villa detay
   sayfaları) → sanitize-html (Node) client bundle'a girmez.
   Eski düz-metin kayıtlar geçerli HTML olduğundan aynen geçer.
   =============================================================== */

const ALLOWED_TAGS = [
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "blockquote",
];

/** XSS-güvenli HTML — render ve kayıt için (allow-list). */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty || typeof dirty !== "string") return "";
  return sanitizeHtmlLib(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    /* Link'lere güvenli rel/target zorla (tabnabbing + SEO). */
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform("a", {
        rel: "noopener noreferrer nofollow",
        target: "_blank",
      }),
    },
  });
}

/** Tüm etiketleri at → düz metin (SEO meta / JSON-LD için). */
export function stripHtml(dirty: string | null | undefined): string {
  if (!dirty || typeof dirty !== "string") return "";
  return sanitizeHtmlLib(dirty, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}
