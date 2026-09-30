"use server";

/* 🛡️ Villa Migration S8B — findIdTitleCurrencyById native twin'e (S8A,
   byte-identical) repoint. Bu dosya "use server" (server action) →
   server-only native repo import'u güvenli. villaRepository yalnız bu
   method için kullanılıyor; method adı aynı. */
import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import { villaAdminRepository as villaRepository } from "@/lib/db/villa.repository.server";
import {
  getVillaPrices,
  setVillaPrices,
} from "@/app/services/villa-price.service";
/* 🛡️ VP-P1 — app-layer admin gate. Yazma native (dbAdminNative.rpc) + RPC
   auth-bağımsız (DECISION A) olduğundan RLS gate uygulanmıyordu; authz
   burada. Yalnız gate; auth.caller kullanılmaz. */
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import { invalidateVillasCache } from "@/lib/villas-cache-invalidation.server";
/* 🛡️ FALLBACK — discount.action.ts'in saveDiscountData'da KULLANDIĞI
   AYNI kanonik yöntem (getVillaPrices + getStartingPrice). getVillaCurrency
   villa.currency NULL/boş olduğunda artık aynı fallback'i uygular; böylece
   "İndirim Ekle" formunun client-side ön-kontrolü, sunucudaki saveDiscountData
   ile TUTARLI hale gelir (villa.currency NULL ama villa_prices'ta geçerli
   fiyat olan villalarda form artık yanlış yere REJECT etmez). */
import { getStartingPrice } from "@/lib/price.engine";

/* ===============================================================
   🛡️ PRICING CALENDAR — SERVER ACTIONS
   ===============================================================
   PricingCalendarCanvas (client) fiyat okuma/yazmayı artık DOĞRUDAN
   repository/service yerine bu server action'lar üzerinden yapar →
   `villa.repository` / `villa-price.service` / `@/lib/db` client
   bundle'ına GİRMEZ.

   ⚠️ DAVRANIŞ AYNEN:
     - Read (villa + fiyatlar): public RLS okuması, server tarafında
       anon ile birebir çalışır.
     - Write (setVillaPrices): admin RLS yazması. Server action'da
       `session-aware DB client` (session-aware) client'ı geçilir →
       admin session server tarafında da taşınır → RLS `is_active_admin`
       BUGÜNKÜ gibi uygulanır (yetki aynen korunur, değişmez).
   =============================================================== */

export async function loadPricingData(villaId: string) {
  await requirePermission("villas");
  const [villaRes, prices] = await Promise.all([
    villaRepository.findIdTitleCurrencyById(villaId),
    getVillaPrices(villaId),
  ]);
  return { villa: villaRes.data, prices };
}

/* ===============================================================
   🛡️ getVillaCurrency — SADECE UI GÖSTERİMİ İÇİN (FAZ — indirim
   currency zorunluluğu)
   ===============================================================
   `loadPricingData` içinde zaten kullanılan AYNI repository metodunu
   (`villaRepository.findIdTitleCurrencyById`) reuse eder — yeni sorgu/
   repository metodu YOK. `DiscountsSection`'ın "fixed özel fiyat için
   villa'nın mevcut para birimini göster" ihtiyacı için (kullanıcı artık
   manuel currency seçemiyor).

   ⚠️ GÜVENLİK SINIRI: Bu yalnız UI'a bilgi vermek içindir. Gerçek
   enforcement (fixed discount.currency === villa.currency) BURADAN
   DEĞİL, `discount.action.ts`'teki `saveDiscountData` içinde, kendi
   AYRI `villaRepository.findIdTitleCurrencyById` okumasıyla yapılır —
   client'ın bu fonksiyondan aldığı değere server GÜVENMEZ. */
export async function getVillaCurrency(
  villaId: string
): Promise<string | null> {
  await requirePermission("villas");
  const { data } = await villaRepository.findIdTitleCurrencyById(villaId);
  const villaCurrency = data?.currency || null;
  if (villaCurrency) return villaCurrency;

  /* 🛡️ ÖNCELİK: villa.currency (mevcut davranış AYNEN — dolu olan
     villalarda hiçbir şey değişmez). villa.currency NULL/boş olan
     villalarda FALLBACK: villa_prices'tan kanonik currency belirle —
     saveDiscountData'daki İLE BİREBİR AYNI yöntem, yeni bir seçim
     mantığı İCAT EDİLMEDİ. */
  const prices = await getVillaPrices(villaId);
  return getStartingPrice(prices)?.currency || null;
}

export async function savePricingData(
  villaId: string,
  prices: {
    start_date: string;
    end_date: string;
    price: number;
    currency: string;
  }[]
): Promise<void> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return;
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return;
  }

  await setVillaPrices(villaId, prices);
  /* 🛡️ Fiyat takvimi kaydı → kart "…'den başlayan" fiyatı değişebilir;
     public villa listesi cache'i tazelenir. NOT: `setVillaPrices` hata
     durumunda throw etmez (yalnız loglar) → başarı buradan ayırt
     edilemez; invalidation yetkili yazma denemesinden sonra yapılır.
     Başarısız yazmada gereksiz invalidation yalnız cache'i DB'deki
     (değişmemiş) veriyle yeniden kurar — bayat veri üretmez. */
  invalidateVillasCache("admin.pricing.save");
}
