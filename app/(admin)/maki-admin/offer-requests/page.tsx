import OfferRequestList from "./OfferRequestList";

/* ===============================================================
   🛡️ FAZ 40 — ADMIN OFFER REQUESTS PAGE
   ===============================================================
   /maki-admin/offer-requests — concierge teklif talep moderasyonu.

   FETCH PATTERN:
     ReviewAdminList paradigması (FAZ 33B): client-side fetch
     (admin'in browser session JWT'si eski sağlayıcıya attached → RLS
     authenticated CRUD). Service-role kullanılmaz.
   =============================================================== */

export default function Page() {
  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">Rezervasyon</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Teklif talepleri
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          /teklif-al sayfasından gelen kişiselleştirilmiş mülk
          talepleri. Tatil danışmanı süreç boyunca durumu günceller.
        </p>
      </div>
      <OfferRequestList />
    </div>
  );
}
