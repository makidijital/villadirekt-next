import ManualReservationForm from "./ManualReservationForm";
/* 🛡️ Villa Migration S8F — findAllIdTitleSlug native twin'e (S8E, byte-
   identical, ARRAY) repoint. Server Component → server-only native repo
   import'u güvenli. villaRepository yalnız findAllIdTitleSlug için
   kullanılıyor; call-site aynı (villaAdminRepository → villaRepository alias). */
import { villaAdminRepository as villaRepository } from "@/lib/db/villa.repository.server";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import AdminPageSessionRefresh from "@/app/components/admin/AdminPageSessionRefresh";
import { adminPermissionGate } from "@/app/components/admin/AdminSectionGuard";

async function getVillas() {
  const { data, error } = await villaRepository.findAllIdTitleSlug();
  if (error) throw error;
  return data;
}

/* 🛡️ Quick-action: villa listesinden "Takvim" butonuyla gelen
   pre-select query param. URL örneği:
     /maki-admin/manual-reservations/ekle?villa=<uuid>
   Yoksa eski davranış birebir devam eder (initialVillaId undefined →
   form selectedVilla boş başlar). */
type SearchParams = Promise<{ villa?: string }>;

export default async function Page({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  /* 🛡️ SEC-01 — AUTH ÖNCE, VERİ SONRA (bkz. maki-admin/page.tsx). */
  const auth = await authorizeAdminSession();
  if (!auth.ok) return <AdminPageSessionRefresh />;

  /* 🛡️ Yetki ("manual_reservations") — VERİDEN ÖNCE. Bölüm layout'u sayfanın
     server render'ını durdurmadığı için kontrol burada da yapılır. */
  const denied = await adminPermissionGate(auth.caller.id, "manual_reservations");
  if (denied) return denied;

  const villas = await getVillas();

  const sp = (await searchParams) || {};
  const rawVilla = typeof sp.villa === "string" ? sp.villa.trim() : "";
  /* 🛡️ Defansif: query param geçerli bir villa.id'yi göstermiyorsa
     initialVillaId boş bırakılır → form eski davranışa düşer.
     `villa` tablosu fetch'i zaten yapıldığı için ek round-trip yok. */
  const initialVillaId =
    rawVilla.length > 0 &&
    (villas || []).some((v) => v.id === rawVilla)
      ? rawVilla
      : undefined;

  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">Rezervasyon</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Yeni blok / harici rezervasyon
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          Takvimde manuel olarak gün veya aralık bloklamak için kullan.
        </p>
      </div>

      <ManualReservationForm
        villas={villas || []}
        initialVillaId={initialVillaId}
      />
    </div>
  );
}
