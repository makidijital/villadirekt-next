"use client";

import { useCallback, useEffect, useState } from "react";

import { getSiteAssetVersionsAction } from "@/app/services/site-asset-version.action";
import {
  normalizeSiteAssetPath,
  versionedAssetUrl,
} from "@/lib/storage/site-asset-version";

/* ===============================================================
   🛡️ useSiteAssetVersions — admin önizleme görselleri için `?v=`
   ===============================================================
   - Açılışta verilen path'lerin R2 versiyonlarını (ETag) bir kez
     alır; path kümesi değişmedikçe yeniden sormaz.
   - `refresh(path)`: upload başarısından sonra çağrılır → aynı path'in
     YENİ versiyonu gelir → önizleme `src`'si değişir → tarayıcı yeni
     görseli çeker (sayfa yenilemeden).
   - `versioned(url, path)`: URL'ye (varsa) versiyonu ekler; versiyon
     yoksa URL AYNEN döner (bugünkü davranış).
   Versiyon alınamazsa (ağ/oturum hatası) upload sonrası önizleme yine
   de tazelensin diye yalnız O upload için yerel bir işaret kullanılır.
   =============================================================== */
export function useSiteAssetVersions(
  values: ReadonlyArray<string | null | undefined>
) {
  const [versions, setVersions] = useState<Record<string, string>>({});

  const key = Array.from(
    new Set(
      values
        .map((v) => normalizeSiteAssetPath(v))
        .filter((p): p is string => p !== null)
    )
  )
    .sort()
    .join("\n");

  useEffect(() => {
    if (!key) return;
    let alive = true;
    getSiteAssetVersionsAction(key.split("\n"))
      .then((v) => {
        if (alive) setVersions((prev) => ({ ...prev, ...v }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);

  const refresh = useCallback(async (value: string | null | undefined) => {
    const path = normalizeSiteAssetPath(value);
    if (!path) return;
    let next: string | undefined;
    try {
      next = (await getSiteAssetVersionsAction([path]))[path];
    } catch {
      next = undefined;
    }
    setVersions((prev) => ({
      ...prev,
      [path]: next ?? `u${Date.now().toString(36)}`,
    }));
  }, []);

  const versioned = useCallback(
    (url: string | null | undefined, value: string | null | undefined) =>
      versionedAssetUrl(url, versions, value),
    [versions]
  );

  return { versions, refresh, versioned };
}
