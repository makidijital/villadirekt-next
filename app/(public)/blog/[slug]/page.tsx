import type { Metadata } from "next";

import BlogDetailPageBody from "@/app/components/blog/BlogDetailPageBody";
import { buildBlogDetailMetadata } from "@/app/components/blog/blog-metadata";

/* ===============================================================
   🛡️ BLOG DETAY — /blog/[slug] (public, TR)
   ===============================================================
   Gövde `BlogDetailPageBody`'ye, metadata `blog-metadata`'ya taşındı
   (TR/EN/DE ORTAK) — bu dosya ince bir sarmalayıcıdır. Taslak → 404,
   sanitizeHtml, JSON-LD ve TR çıktısı DEĞİŞMEDİ.
   =============================================================== */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return buildBlogDetailMetadata(params);
}

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <BlogDetailPageBody params={params} />;
}
