import "server-only";

import { getCachedSettings } from "@/lib/cache.helpers";
import {
  resolvePublicHome,
  type PublicHomeResolution,
} from "@/lib/i18n/public-home";

/* ===============================================================
   🛡️ PUBLIC ANA SAYFA ÇÖZÜMLEYİCİSİ — SERVER SARMALAYICISI
   ===============================================================
   Kuralın kendisi `lib/i18n/public-home.ts`'te (saf, client-safe).
   Bu dosya yalnız MEVCUT `getCachedSettings()` okumasını ona bağlar.

   CACHE: yeni bir cache katmanı KURULMADI. `getCachedSettings`
   zaten `unstable_cache(["settings:get"], { tags:["settings"],
   revalidate: 3600 })` (lib/cache.helpers.ts:78-79) ve admin kaydı
   sonrası `revalidateSettings()` → `revalidateTag("settings")`
   (app/services/revalidate.actions.ts:30-32) ile temizleniyor.
   Yani "Varsayılan Dil" değişikliği bir sonraki istekte yansır —
   EK bir invalidation mekanizması GEREKMEZ.

   FAIL-SAFE: okuma hata verirse `.catch(() => null)` → MOD A
   (bugünkü TR davranışı). Public site ASLA çökmez.
   =============================================================== */
export async function getPublicHomeResolution(): Promise<PublicHomeResolution> {
  const settings = await getCachedSettings().catch(() => null);
  return resolvePublicHome(settings);
}
