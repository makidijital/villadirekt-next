"use server";

import { requireAdminAction } from "@/lib/auth/action-authz";
import { getSiteAssetVersions } from "@/lib/storage/site-asset-version.server";

/* ===============================================================
   🛡️ ADMIN ÖNİZLEME — site-assets görsel versiyonları (salt okuma)
   ===============================================================
   Admin client sayfaları (tip/bölge/sayfa/blog kapakları, ayar
   upload alanları) önizleme URL'sine `?v=<R2 ETag>` ekler; upload
   sonrası aynı path'in yeni versiyonunu buradan alır → önizleme
   sayfa yenilenmeden yeni görseli gösterir. Mevcut API'ler ve yanıt
   formatları DEĞİŞMEDİ (ayrı, yalnız okuyan action).
   Güvenlik: aktif admin oturumu şart (R2 HEAD amplifikasyonu yok);
   en fazla 200 path; yalnız relative site-assets path'leri.
   =============================================================== */

const MAX_PATHS = 200;

export async function getSiteAssetVersionsAction(
  paths: string[]
): Promise<Record<string, string>> {
  await requireAdminAction();
  if (!Array.isArray(paths)) return {};
  const clean = paths
    .filter((p): p is string => typeof p === "string")
    .slice(0, MAX_PATHS);
  return getSiteAssetVersions(clean);
}
