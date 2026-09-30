import type { Metadata } from "next";

import ContactPageBody from "@/app/components/contact/ContactPageBody";
import { buildContactMetadata } from "@/app/components/contact/contact-metadata";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /en/iletisim — PUBLIC İLETİŞİM (EN)
   ===============================================================
   TR ile AYNI gövde (`ContactPageBody`) — tek fark `locale` prop'u.
   Veri akışı (`getCachedSettings`), form submit akışı ve JSON-LD
   semantiği BİREBİR aynı.

   KORUNAN PHASE 4A/4B DAVRANIŞI:
     • `setRequestLocale("en")` — request-scoped locale işareti.
     • `await requirePublicLocaleEnabled()` — `multilingual_enabled`
       kapalıyken notFound() → 404 (bugünkü production davranışı).

   Route segment config EKLENMEDİ — TR ile aynı statik/ISR davranışı.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildContactMetadata("en");
}

export default async function EnContactPage() {
  setRequestLocale("en");
  await requirePublicLocaleEnabled();

  return <ContactPageBody locale="en" />;
}
