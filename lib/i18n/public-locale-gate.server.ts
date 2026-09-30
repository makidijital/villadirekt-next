import "server-only";

import { notFound } from "next/navigation";

import { getCachedSettings } from "@/lib/cache.helpers";
import { isMultilingualEnabled } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ PUBLIC LOCALE GATE — PHASE 4A (Public Locale Routing Core)
   ===============================================================
   Yeni /en/* ve /de/* public route'larının TEK ortak korumasıdır.
   `settings.multilingual_enabled` (migration 081 / Phase 1A) false
   olduğu sürece bu fonksiyon `notFound()` çağırır — yani bugün
   production'da (multilingual_enabled=false) /en/... ve /de/...
   isteklerinin gözlemlenen davranışı BİREBİR AYNI kalır: sayfa
   "yokmuş" gibi 404 döner (mevcut `app/not-found.tsx` üzerinden),
   tıpkı bu route'lar hiç var olmadan önceki davranış gibi.

   `getCachedSettings` — lib/cache.helpers.ts'teki MEVCUT, public-safe,
   cache'lenmiş settings okuyucusu (zaten app/layout.tsx ve tüm public
   sayfalarda kullanılıyor). Burada YENİ bir cache mekanizması
   KURULMADI — var olanı çağırıyoruz.

   `isMultilingualEnabled` — lib/i18n/config.ts (Phase 1B), burada
   YENİDEN TANIMLANMADI, olduğu gibi reuse edildi.

   Bu fazda: TR route'ları bu dosyayı hiç import etmiyor/çağırmıyor —
   yalnız yeni app/(public)/en/* ve app/(public)/de/* sayfaları
   kullanır. Mevcut TR sayfa/route davranışına SIFIR etkisi vardır.
   =============================================================== */

/** multilingual_enabled=false (veya settings okunamıyorsa, fail-safe
 *  olarak KAPALI kabul edilir) → notFound() fırlatır (Next.js'in
 *  standart digest-throw mekanizması; çağıran page component'in
 *  gövdesinden `await` ile çağrılmalı). true ise sessizce döner. */
export async function requirePublicLocaleEnabled(): Promise<void> {
  const settings = await getCachedSettings().catch(() => null);
  if (!isMultilingualEnabled(settings)) {
    notFound();
  }
}
