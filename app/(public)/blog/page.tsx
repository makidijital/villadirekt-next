import type { Metadata } from "next";

import BlogIndexPageBody from "@/app/components/blog/BlogIndexPageBody";
import { buildBlogIndexMetadata } from "@/app/components/blog/blog-metadata";

/* ===============================================================
   🛡️ BLOG INDEX — /blog (public, TR)
   ===============================================================
   Gövde `BlogIndexPageBody`'ye, metadata `blog-metadata`'ya taşındı
   (TR/EN/DE ORTAK) — bu dosya ince bir sarmalayıcıdır. Yayın filtresi,
   sıralama, URL contract'ı ve TR çıktısı DEĞİŞMEDİ.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildBlogIndexMetadata();
}

export default async function BlogIndexPage() {
  return <BlogIndexPageBody />;
}
