import type { Metadata } from "next";

import ContactPageBody from "@/app/components/contact/ContactPageBody";
import { buildContactMetadata } from "@/app/components/contact/contact-metadata";

/* ===============================================================
   🛡️ /iletisim — PUBLIC İLETİŞİM (TR)
   ===============================================================
   Sayfa gövdesi `app/components/contact/ContactPageBody.tsx`'e
   TAŞINDI (DOM/CSS/veri akışı DEĞİŞTİRİLMEDEN) — `/en/iletisim` ve
   `/de/iletisim` AYNI gövdeyi render eder; kodun ikinci/üçüncü
   kopyası YOKTUR (`KiralikVillalarPageBody` Phase deseni).

   TR DAVRANIŞI DEĞİŞMEDİ:
     • URL `/iletisim` aynı.
     • `locale="tr"` → dictionary TR değerleri eski hardcoded
       metinlerle BİREBİR.
     • Route segment config (`dynamic`/`revalidate`) EKLENMEDİ —
       mevcut statik/ISR davranışı AYNEN korunur.
     • TR'de locale gate (`requirePublicLocaleEnabled`) ÇAĞRILMAZ.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildContactMetadata("tr");
}

export default async function ContactPage() {
  return <ContactPageBody locale="tr" />;
}
