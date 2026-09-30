import type { Metadata } from "next";

import BlogDetailPageBody from "@/app/components/blog/BlogDetailPageBody";
import { buildBlogDetailMetadata } from "@/app/components/blog/blog-metadata";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /de/blog/[slug] — BLOG DETAY (de)
   ===============================================================
   TR ile AYNI gövde (`BlogDetailPageBody`) — tek fark `locale`
   prop'u. Taslak → 404 davranışı ve slug contract'ı BİREBİR aynıdır.
   =============================================================== */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return buildBlogDetailMetadata(params, "de");
}

export default async function DEBlogDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();

  return <BlogDetailPageBody params={params} locale="de" />;
}
