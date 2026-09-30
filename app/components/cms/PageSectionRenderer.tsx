import Image from "next/image";
import type { ReactElement } from "react";

import type { PageSection } from "@/lib/page-sections";
import { getPageCoverPublicUrl } from "@/lib/storage.helpers";
import { withVersionParam } from "@/lib/storage/site-asset-version";

/* ===============================================================
   🛡️ PAGE SECTION RENDERER — type→component map
   ===============================================================
   Switch-case yerine map lookup. Yeni section type eklemek için:
     1) lib/page-sections.ts > PageSection union'a variant ekle
     2) Aşağıdaki SECTION_RENDERERS map'ine entry ekle
   Renderer SSR-safe (server component). Image section
   `next/image` kullanır (R2 storage remote pattern config
   next.config.ts'te zaten tanımlı).

   Spacing: section-arası `space-y-12 md:space-y-16` parent'tan
   gelir (PageSection container'ı). Her renderer kendi içeriğinin
   prose typography'sini taşır.
=============================================================== */

/* ---------- RichText: paragraph blocks, double-newline split ---------- */
function RichTextSection({ content }: { content: string }) {
  /* Double-newline (boş satır) ile paragraph split. Tek newline
     içinde line break (whitespace-pre-line ile). Markdown'sız basit
     HTML-safe text rendering (XSS yok çünkü React string escape). */
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className="space-y-5">
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className="text-[16px] md:text-[17px] leading-[1.8] text-[var(--color-stone-700)] whitespace-pre-line"
        >
          {p}
        </p>
      ))}
    </div>
  );
}

/* ---------- Image: full-width, rounded, lazy ---------- */
function ImageSectionView({
  path,
  alt,
  version,
}: {
  path: string;
  alt?: string;
  /** 🛡️ R2 ETag versiyonu → `?v=` (path aynı; yoksa URL aynen). */
  version?: string;
}) {
  const base = getPageCoverPublicUrl(path);
  const url = base && version ? withVersionParam(base, version) : base;
  if (!url) return null;
  return (
    <figure className="my-6 md:my-10">
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-[var(--color-sand-50)]">
        <Image
          src={url}
          alt={alt || ""}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 80vw, 768px"
          className="object-cover object-center"
        />
      </div>
      {alt ? (
        <figcaption className="text-[12px] tracking-[0.06em] uppercase font-medium text-[var(--color-stone-400)] mt-3 text-center">
          {alt}
        </figcaption>
      ) : null}
    </figure>
  );
}

/* ---------- Quote: editorial pullquote ---------- */
function QuoteSectionView({
  text,
  author,
}: {
  text: string;
  author?: string;
}) {
  return (
    <blockquote className="relative my-10 md:my-14 pl-6 md:pl-8 border-l-2 border-[var(--color-champagne-500)]">
      <p className="font-display text-[22px] md:text-[28px] leading-[1.35] text-[var(--color-stone-900)] tracking-[-0.01em] italic">
        “{text}”
      </p>
      {author ? (
        <footer className="mt-4 text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
          — {author}
        </footer>
      ) : null}
    </blockquote>
  );
}

/* ---------- Map lookup ----------
   Future section type'ı eklemek: union extend + bu map'e entry.
   No switch-case spaghetti. */
const SECTION_RENDERERS = {
  richtext: (s: Extract<PageSection, { type: "richtext" }>) => (
    <RichTextSection content={s.content} />
  ),
  image: (s: Extract<PageSection, { type: "image" }>, version?: string) => (
    <ImageSectionView path={s.path} alt={s.alt} version={version} />
  ),
  quote: (s: Extract<PageSection, { type: "quote" }>) => (
    <QuoteSectionView text={s.text} author={s.author} />
  ),
} as const;

export default function PageSectionRenderer({
  section,
  version,
}: {
  section: PageSection;
  /** 🛡️ Görsel bölümü için R2 versiyonu (opsiyonel). */
  version?: string;
}) {
  /* Type assertion gerekiyor çünkü map lookup TS narrow yapmıyor;
     section.type discriminator union'a göre lookup zaten doğru
     renderer'ı seçer. Bilinmeyen type düşmüş zaten parsePageSections'da. */
  const renderer = SECTION_RENDERERS[section.type] as (
    s: PageSection,
    version?: string
  ) => ReactElement;
  if (!renderer) return null;
  return renderer(section, version);
}
