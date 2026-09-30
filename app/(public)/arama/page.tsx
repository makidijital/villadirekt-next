import AramaPageBody, {
  type AramaSearchParams,
} from "@/app/components/search/AramaPageBody";

/* ===============================================================
   🛡️ /arama — SEARCH RESULTS (TR) — PHASE 13
   ===============================================================
   Sayfa gövdesi + tüm arama pipeline'ı `app/components/search/
   AramaPageBody.tsx`'e TAŞINDI (DOM/CSS/veri akışı DEĞİŞTİRİLMEDEN)
   — `/en/arama` ve `/de/arama` AYNI gövdeyi render eder; kodun
   ikinci/üçüncü kopyası YOKTUR (`HomePageBody` / `CmsPageBody`
   Phase 11/12D deseni).

   TR DAVRANIŞI DEĞİŞMEDİ:
     • URL `/arama` + tüm query parametreleri aynı.
     • `locale="tr"` → dictionary TR değerleri eski hardcoded
       metinlerle BİREBİR; `basePath` "/arama".
     • `dynamic = "force-dynamic"` burada KALDI (route segment
       config yalnız route dosyasında geçerli).
   =============================================================== */
export const dynamic = "force-dynamic";

export default async function AramaPage({
  searchParams,
}: {
  searchParams: AramaSearchParams;
}) {
  return <AramaPageBody locale="tr" searchParams={searchParams} />;
}
