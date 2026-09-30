"use server";

/* 🛡️ villa_discounts — SERVER ACTIONS (Admin "İndirimler" UI)
   ===============================================================
   `pricing.action.ts` (villa_prices) İLE AYNI DESEN, TAMAMEN AYRI
   dosya/tablo/RPC üzerinden çalışır:
     - Read: villaDiscountRepository.findDiscountsByVillaId
     - Write: villaDiscountRepository.rpcReplaceVillaDiscounts
       (replace_villa_discounts RPC, migration 079 — atomic
       DELETE+INSERT, `villa_prices`'ın replace-all deseninin
       birebir ikizi; bu action'lar HENÜZ hiçbir çağıranı olmayan
       Adım 1 repository'sinin İLK tüketicisidir).

   ⚠️ KAPSAM SINIRI:
     - villa_prices / pricing.action.ts / PricingCalendarCanvas /
       price.engine.ts / rezervasyon / public fiyat gösterimi —
       HİÇBİRİNE dokunulmadı, HİÇBİRİ buradan import edilmiyor.
     - Bu dosya yalnız villa_discounts CRUD'unu admin UI'a bağlar.

   YETKİ: authorizeAdminSession() — mevcut admin session cookie'si
   (diğer server action'larla aynı gate, bkz. pricing.action.ts /
   gallery.action.ts). Read tarafında gate YOK (mevcut fiyat okuma
   action'ı — loadPricingData — ile aynı: public/no-gate read,
   sadece write admin-gated).
=============================================================== */
import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import { villaDiscountRepository } from "@/lib/db/villa-discount.repository.server";
import type { VillaDiscountInput } from "@/lib/db/villa-discount.repository.server";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import type { VillaDiscountRow } from "@/types/database";
/* 🛡️ SERVER-AUTHORITATIVE CURRENCY ENFORCEMENT (bkz. saveDiscountData) —
   `pricing.action.ts`'in `loadPricingData`/`getVillaCurrency`'de zaten
   kullandığı AYNI repository metodu reuse edilir; yeni repository metodu
   veya sorgu YOK. Client'tan (UI veya başka bir caller) gelen currency
   değerine HİÇ güvenilmez — villa.currency burada AYRICA okunur. */
import { villaAdminRepository as villaRepository } from "@/lib/db/villa.repository.server";
/* 🛡️ FALLBACK — villa.currency NULL/boş olan (bazı eski/eksik villalar)
   villalarda indirim kaydını (silme dahil, replace-all deseni) engellemesin
   diye EKLENDİ. `getVillaPrices` — pricing.action.ts'in `loadPricingData`'da
   ZATEN kullandığı AYNI service (villaAdminRepository.findVillaPrices'ın
   ince sarmalayıcısı); `getStartingPrice` — price.engine.ts'in mevcut,
   DEĞİŞTİRİLMEYEN fonksiyonu, cache.helpers.ts'in villa kartlarında
   "villa_prices içindeki MIN pozitif nightly + O SATIRIN KENDİ currency'si"
   için ZATEN kullandığı AYNI kanonik yöntem — burada YENİ bir seçim mantığı
   İCAT EDİLMEDİ, var olanı reuse ediyoruz. */
import { getVillaPrices } from "@/app/services/villa-price.service";
import { getStartingPrice } from "@/lib/price.engine";

export type DiscountActionResult =
  | { ok: true }
  | { ok: false; error: string };

/* ---------------------------------------------
   🔥 DB hatasını anlaşılır Türkçe mesaja çevir.
   - EXCLUDE constraint (villa_discounts_no_overlap, SQLSTATE 23P01)
     → çakışan tarih aralığı (kullanıcının Soru 10'da istediği anlaşılır
     hata mesajı, TAM OLARAK BU).
   - CHECK constraint isimlerine göre (23514) daha spesifik mesajlar.
   - Diğer her şey → generic fallback (ham mesaj eklenir, admin'e
     debug bilgisi verir).
---------------------------------------------- */
function mapDiscountError(
  err: { code?: string; message?: string } | null
): string {
  if (!err) return "Bilinmeyen bir hata oluştu.";
  const msg = err.message || "";

  if (err.code === "23P01" || msg.includes("villa_discounts_no_overlap")) {
    return "Seçilen tarih aralığı, bu mülk için tanımlı başka bir indirimle çakışıyor. Lütfen farklı bir tarih aralığı seç.";
  }
  if (msg.includes("villa_discounts_percent_range")) {
    return "Yüzde indirim değeri 100'ü geçemez.";
  }
  if (msg.includes("villa_discounts_currency_consistency")) {
    return "Gecelik özel fiyatta para birimi seçilmelidir.";
  }
  if (msg.includes("villa_discounts_value_positive")) {
    return "İndirim değeri 0'dan büyük olmalıdır.";
  }
  if (msg.includes("villa_discounts_valid_range")) {
    return "Bitiş tarihi, başlangıç tarihinden önce olamaz.";
  }
  if (msg.includes("villa_discounts_type_check")) {
    return "Geçersiz indirim türü.";
  }
  return `İndirim kaydedilemedi${msg ? `: ${msg}` : "."}`;
}

/** READ — bir villanın tüm indirimlerini getirir (start_date artan). */
export async function loadDiscountData(villaId: string): Promise<{
  discounts: VillaDiscountRow[];
  error?: string;
}> {
  await requirePermission("villas");
  const { data, error } =
    await villaDiscountRepository.findDiscountsByVillaId(villaId);

  if (error) {
    console.error("loadDiscountData:", error.message);
    return { discounts: [], error: "İndirimler yüklenemedi." };
  }

  const rows = (data || [])
    .slice()
    .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));

  return { discounts: rows };
}

/** WRITE — atomic replace-all (villa_prices ile birebir aynı desen).
 *  Caller (client component) tam listeyi (mevcut + eklenen/çıkarılan)
 *  gönderir; RPC o villa için tabloyu DELETE+INSERT ile değiştirir. */
export async function saveDiscountData(
  villaId: string,
  discounts: VillaDiscountInput[]
): Promise<DiscountActionResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) {
    return { ok: false, error: auth.error || "Oturum doğrulanamadı." };
  }
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return { ok: false, error: "Yetkisiz." };
  }

  /* 🛡️ SERVER-AUTHORITATIVE CURRENCY ENFORCEMENT — fixed özel fiyatın
     para birimi villa.currency ile AYNI olmak ZORUNDA. Client (UI'ın
     kendisi ya da başka bir caller) hangi currency'yi gönderirse
     göndersin burada YOK SAYILMAZ, TEKRAR KONTROL EDİLİR — UI zaten
     manuel seçim sunmuyor olsa da bu, tek güvenlik sınırı buraya
     taşınmış olur (client'a güvenilmez). Percent tipte currency HER
     ZAMAN null'a zorlanır (client göndermiş olsa bile).

     `pricing.action.ts`'teki `getVillaCurrency` SADECE UI gösterimi
     içindir — burada KULLANILMAZ; villa.currency bu action kendi
     bağımsız okumasıyla (AYNI, zaten var olan repository metodu)
     tekrar elde eder. */
  const { data: villaData, error: villaError } =
    await villaRepository.findIdTitleCurrencyById(villaId);
  if (villaError) {
    /* 🛡️ KÖK NEDEN DÜZELTMESİ: villa satırı okuma HATASI (ör. geçici
       DB/bağlantı hatası) artık isteği DOĞRUDAN reddetmiyor — aşağıdaki
       villa_prices fallback'i HER ZAMAN denenir (calendar'ın kullandığı
       getVillaPrices/loadPricingData ile AYNI okuma). İstek yalnızca
       hem villa.currency hem villa_prices fallback'i currency
       veremediğinde (aşağıdaki ikinci `if (!villaCurrency)` bloğu)
       reddedilir. */
    console.error(
      "saveDiscountData: villa satırı okunamadı (fallback denenecek):",
      villaError.message
    );
  }

  /* 🛡️ ÖNCELİK: villa.currency (mevcut davranış AYNEN — dolu olan
     villalarda hiçbir şey değişmez). villa.currency NULL/boş olan
     (bazı mevcut villalarda veri eksikliği) villalarda FALLBACK:
     villa_prices'tan kanonik currency belirle — getStartingPrice
     (price.engine, DEĞİŞTİRİLMEDİ) ile "en düşük pozitif gecelik
     fiyatın KENDİ currency'si" seçilir; villa_prices'ta rastgele
     bir satır YOK SAYILMAZ, aynı deterministik kural her yerde
     (cache.helpers.ts'teki public kart currency'si de AYNI yöntemle
     belirleniyor) kullanılır. Fixed indirim currency-eşleşme
     GÜVENLİK KONTROLÜ aşağıda AYNEN devam eder — client'a güvenilmez. */
  let villaCurrency = villaData?.currency || null;
  if (!villaCurrency) {
    const prices = await getVillaPrices(villaId);
    villaCurrency = getStartingPrice(prices)?.currency || null;
  }

  if (!villaCurrency) {
    console.error(
      "saveDiscountData: villa currency okunamadı (villa.currency VE villa_prices boş/NULL):",
      villaId
    );
    return {
      ok: false,
      error: "Mülk fiyat para birimi okunamadı, indirim kaydedilemedi.",
    };
  }

  const normalizedDiscounts: VillaDiscountInput[] = [];
  for (const d of discounts) {
    if (d.discount_type === "percent") {
      // Percent'te currency kavramı YOK — client ne gönderirse göndersin null.
      normalizedDiscounts.push({ ...d, currency: null });
      continue;
    }
    // discount_type === "fixed"
    if (!d.currency || d.currency !== villaCurrency) {
      return {
        ok: false,
        error:
          "Özel fiyat para birimi mülkün fiyat para birimiyle aynı olmalıdır.",
      };
    }
    // Eşleşiyor bile olsa server'ın kendi okuduğu değer yazılır (client
    // değerine güvenilmez; defense-in-depth, sonuç aynı).
    normalizedDiscounts.push({ ...d, currency: villaCurrency });
  }

  const { error } = await villaDiscountRepository.rpcReplaceVillaDiscounts(
    villaId,
    normalizedDiscounts
  );

  if (error) {
    console.error("saveDiscountData:", error.message);
    return { ok: false, error: mapDiscountError(error) };
  }

  return { ok: true };
}

/** DELETE — TEK villa_discounts kaydı. `saveDiscountData`/replace-all
 *  akışından TAMAMEN AYRI: currency enforcement YOK, `getVillaPrices`/
 *  `villa.currency` HİÇ okunmaz, `rpcReplaceVillaDiscounts` KULLANILMAZ.
 *  Doğrudan `villaDiscountRepository.deleteDiscountById` (id + villaId
 *  WHERE koşulu — IDOR guard, bkz. repository doc-comment'i). Yetki
 *  kontrolü `saveDiscountData` ile AYNI (`authorizeAdminSession`). */
export async function deleteDiscountData(
  villaId: string,
  discountId: string
): Promise<DiscountActionResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) {
    return { ok: false, error: auth.error || "Oturum doğrulanamadı." };
  }
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return { ok: false, error: "Yetkisiz." };
  }

  const { error } = await villaDiscountRepository.deleteDiscountById(
    villaId,
    discountId
  );

  if (error) {
    console.error("deleteDiscountData:", error.message);
    return {
      ok: false,
      error: `İndirim silinemedi${error.message ? `: ${error.message}` : "."}`,
    };
  }

  return { ok: true };
}
