import type { Metadata } from "next";

import ContactPageBody from "@/app/components/contact/ContactPageBody";
import { buildContactMetadata } from "@/app/components/contact/contact-metadata";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /de/iletisim — PUBLIC İLETİŞİM (DE)
   ===============================================================
   TR ile AYNI gövde (`ContactPageBody`) — tek fark `locale` prop'u.
   Veri akışı (`getCachedSettings`), form submit akışı ve JSON-LD
   semantiği BİREBİR aynı.

   KORUNAN PHASE 4A/4B DAVRANIŞI:
     • `setRequestLocale("de")` — request-scoped locale işareti.
     • `await requirePublicLocaleEnabled()` — `multilingual_enabled`
       kapalıyken notFound() → 404 (bugünkü production davranışı).

   Route segment config EKLENMEDİ — TR ile aynı statik/ISR davranışı.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildContactMetadata("de");
}

export default async function DeContactPage() {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();

  return <ContactPageBody locale="de" />;
}
