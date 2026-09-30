import type { Metadata } from "next";

import BlogIndexPageBody from "@/app/components/blog/BlogIndexPageBody";
import { buildBlogIndexMetadata } from "@/app/components/blog/blog-metadata";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /en/blog — BLOG INDEX (en)
   ===============================================================
   TR ile AYNI gövde (`BlogIndexPageBody`) — tek fark `locale` prop'u.
   Yayın filtresi ve slug/URL contract'ı BİREBİR aynıdır.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildBlogIndexMetadata("en");
}

export default async function ENBlogIndexPage() {
  setRequestLocale("en");
  await requirePublicLocaleEnabled();

  return <BlogIndexPageBody locale="en" />;
}
