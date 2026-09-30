import "server-only";

import { parsePageSections } from "@/lib/page-sections";
import { getSiteAssetVersions } from "@/lib/storage/site-asset-version.server";

/* ===============================================================
   🛡️ CMS SAYFA GÖRSEL VERSİYONLARI (TR/EN/DE `/p/[slug]` ortak)
   ===============================================================
   Kapak (`pages.cover_image`) + görsel bölümleri (`sections[].path`,
   locale-aware çözülmüş bölümler verilmişse onlar) için R2 ETag
   versiyonları → `CmsPageBody assetVersions`. Bölüm parse'ı
   CmsPageBody ile AYNI (`parsePageSections`). Hata/eksik → `{}`
   (URL'ler bugünkü gibi versiyonsuz).
   =============================================================== */
export async function getCmsPageAssetVersions(
  page: { cover_image?: string | null; sections?: unknown },
  resolvedSections?: unknown
): Promise<Record<string, string>> {
  const sections = parsePageSections(
    resolvedSections !== undefined ? resolvedSections : page.sections
  );
  const imagePaths = sections.flatMap((s) => (s.type === "image" ? [s.path] : []));
  return getSiteAssetVersions([page.cover_image, ...imagePaths]);
}
