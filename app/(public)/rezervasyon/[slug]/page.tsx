import ReservationPageBody from "@/app/components/reservation/ReservationPageBody";

/* ===============================================================
   🛡️ /rezervasyon/[slug] — PUBLIC REZERVASYON (TR)
   ===============================================================
   Sayfa gövdesi `app/components/reservation/ReservationPageBody.tsx`'e
   TAŞINDI (DOM/CSS/veri akışı/servis çağrıları DEĞİŞTİRİLMEDEN) —
   `/en/rezervasyon/[slug]` ve `/de/rezervasyon/[slug]` AYNI gövdeyi
   render eder; kodun ikinci/üçüncü kopyası YOKTUR.

   TR DAVRANIŞI DEĞİŞMEDİ:
     • URL `/rezervasyon/[slug]` aynı.
     • `locale="tr"` → dictionary TR değerleri eski hardcoded
       metinlerle BİREBİR.
     • Route segment config (`dynamic`/`revalidate`) EKLENMEDİ.
     • `generateMetadata` YOK (eskiden de yoktu) — robots.ts zaten
       `/rezervasyon/` segmentini Disallow ediyor (DEĞİŞTİRİLMEDİ).
     • TR'de locale gate (`requirePublicLocaleEnabled`) ÇAĞRILMAZ.
   =============================================================== */

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    start?: string | string[];
    end?: string | string[];
    adults?: string | string[];
    children?: string | string[];
    poolHeating?: string | string[];
  }>;
};

export default async function ReservationPage({ params, searchParams }: Props) {
  return (
    <ReservationPageBody
      params={params}
      searchParams={searchParams}
      locale="tr"
    />
  );
}
