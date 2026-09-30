import type { Metadata } from "next";

import KiralikVillalarPageBody, {
  type ArchiveSearchParams,
} from "@/app/components/search/KiralikVillalarPageBody";
import { buildVillasArchiveMetadata } from "@/app/components/search/kiralik-villalar-metadata";

/* ===============================================================
   🛡️ /kiralik-villalar — PUBLIC ARCHIVE (TR)
   ===============================================================
   Sayfa gövdesi + tüm arşiv pipeline'ı `app/components/search/
   KiralikVillalarPageBody.tsx`'e TAŞINDI (DOM/CSS/veri akışı
   DEĞİŞTİRİLMEDEN) — `/en/kiralik-villalar` ve `/de/kiralik-villalar`
   AYNI gövdeyi render eder; kodun ikinci/üçüncü kopyası YOKTUR
   (`AramaPageBody` Phase 13 deseni).

   TR DAVRANIŞI DEĞİŞMEDİ:
     • URL `/kiralik-villalar` + `page`/`pageSize`/`sort` query
       parametreleri AYNI.
     • `locale="tr"` → dictionary TR değerleri eski hardcoded
       metinlerle BİREBİR.
     • Route segment config (`dynamic` vb.) EKLENMEDİ — sayfa
       `cookies()` kullandığı için ZATEN dynamic; önceki davranış
       aynen korunur.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildVillasArchiveMetadata("tr");
}

export default async function KiralikVillalarPage({
  searchParams,
}: {
  searchParams: ArchiveSearchParams;
}) {
  return <KiralikVillalarPageBody locale="tr" searchParams={searchParams} />;
}
