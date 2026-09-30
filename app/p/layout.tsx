/* ===============================================================
   🛡️ /p/* CMS ROUTE — public layout inheritance shim
   ===============================================================
   `app/p/[slug]/page.tsx` root-level route altında (silinemediği
   için bu konumda kaldı). Mevcut `app/(public)/layout.tsx`
   route group'ta olduğu için /p/* otomatik inherit etmiyordu
   → Header/Footer yoktu, sayfa shell'den kopuk görünüyordu.

   ÇÖZÜM: Bu layout dosyası aynı PublicLayout component'ini
   re-export eder. Sadece bir satır — duplicate kod yok, tek
   source-of-truth `(public)/layout.tsx` korunur. Mevcut public
   sayfaları (Hero, /arama, /kiralik-villa, /kiralik-villalar)
   dokunulmadı.

   Sonuç: /p/* CMS sayfaları artık tam Header + Footer +
   ivory background + main wrapper içinde render eder.
   =============================================================== */
export { default } from "@/app/(public)/layout";
