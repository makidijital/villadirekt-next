import { getCachedSettings } from "@/lib/cache.helpers";
/* 🛡️ PHASE 11 — sunum katmanı client'a taşındı (locale `usePathname()`
   ile çözülüyor); veri okuma (`getCachedSettings`) BU DOSYADA KALDI. */
import FloatingSocialClient from "./FloatingSocialClient";

/* ===============================================================
   🛡️ FLOATING CONTACT DOCK — fixed bottom-right conversion widget
   ===============================================================
   AMAÇ:
     Public site genelinde (yalnız `md:flex` — masaüstü/tablet; mobilde
     bu widget zaten görünmüyordu, davranış AYNEN korunuyor) sağ alt
     köşede sabit (fixed) duran premium iletişim dock'u. 2 stacked CTA:
     "Hemen Ara" (tel:) ve "WhatsApp" (wa.me).

     🛡️ "Villa Önerisi Al" (/teklif-al) CTA'sı BU DOSYADAN tamamen
     kaldırıldı — link, ikon (Sparkles) ve render bloğu silindi; yeni
     bir öneri/teklif akışı OLUŞTURULMADI. `next/link` import'u da bu
     tek kullanım kaldırıldığı için artık gereksiz, kaldırıldı.

   VERİ KAYNAĞI (mevcut alanlar — YENİ ŞEMA / YENİ LİNK YOK):
     - settings.phone          → `tel:` linki (Footer paterni AYNEN)
                                  + WhatsApp wa.me fallback digits.
     - settings.whatsapp_link  → admin'in girdiği tam URL (tercih).
                                  Boşsa wa.me/<phoneDigits> fallback.
     Hesaplama mantığı (phoneHref/phoneDigits/whatsappHref) BİREBİR
     korunuyor — tek satırı bile değişmedi.

   GRACEFUL NO-SHOW:
     Villa Önerisi Al kaldırıldığı için dock artık HER ZAMAN render
     edilmiyor — phone VE whatsapp href'i ikisi de yoksa component
     `null` döner (bu davranış zaten dokümante edilmişti, şimdi fiilen
     de doğru: DOM'a hiçbir şey eklenmez, layout etkilenmez).

   TASARIM (yalnız bu dosyada scoped <style>, globals.css DEĞİŞMEDİ):
     - Buton başına yumuşak, sürekli "nefes alan" (breathe) ambient
       glow katmanı (radial-gradient + blur, kendi marka rengiyle:
       telefon turuncu #ED7926, WhatsApp gerçek marka yeşili #25D366).
     - İki marka renginin (#ED7926 turuncu, #0973BA mavi) ikisi de
       butonların ambient/dual-tone shadow'unda kullanılıyor — WhatsApp
       kendi yeşil kimliğini korurken hafif mavi tonla harmanlanıyor.
     - İkon rozetinde camsı/parlak üst highlight (glass hissi).
     - Hover'da: daha belirgin scale + lift + hızlanan/güçlenen glow.
     - `prefers-reduced-motion: no-preference` guard'lı — reduced-motion
       tercihinde nefes alma animasyonu ve hover translate/scale devre
       dışı kalır (motion-reduce: utility'leri + media query guard).
     - aria-label / title / focus-visible ring / keyboard erişimi
       (native <a> odaklanabilir) AYNEN korunuyor.

   ARCHITECTURE:
     - 🛡️ PHASE 11: Server WRAPPER — `getCachedSettings()` burada
       kalır (aynı render lifecycle'ında dedupe; extra DB hit yok).
       Sunum `FloatingSocialClient` (client) tarafından yapılır çünkü
       locale yalnız client'ta (`usePathname()`) güvenle çözülebilir —
       PublicLayout bir server component ve request locale'ini okuyamaz
       (Phase 7E). HeaderWrapper/FooterWrapper ile AYNI desen.
     - PublicLayout'tan render edilir; admin/maintenance scope DIŞI.
     - Print: `print:hidden` ile yazdırma çıktısında gizlenir.

   POSITIONING / Z-INDEX: AYNEN korundu (fixed bottom-right, z-40).
   =============================================================== */

export default async function FloatingSocial() {
  const settings = await getCachedSettings().catch(() => null);

  /* Phone → tel: linki (Footer L527 paterni: `tel:${settings.phone}`). */
  const phoneHref = settings?.phone?.trim()
    ? `tel:${settings.phone.trim()}`
    : null;

  /* Phone → WhatsApp wa.me fallback (Footer paterni). */
  const phoneDigits = (settings?.phone || "").replace(/\D/g, "");

  /* Tercih sırası:
     1) admin'in girdiği tam URL (settings.whatsapp_link)
     2) telefon numarasından türetilen wa.me URL
     3) null (buton gösterilmez) */
  const whatsappHref =
    settings?.whatsapp_link?.trim() ||
    (phoneDigits ? `https://wa.me/${phoneDigits}` : null);

  /* İkisi de yoksa dock'un gösterecek hiçbir şeyi yok → null. */
  if (!phoneHref && !whatsappHref) return null;

  return (
    <FloatingSocialClient phoneHref={phoneHref} whatsappHref={whatsappHref} />
  );
}
