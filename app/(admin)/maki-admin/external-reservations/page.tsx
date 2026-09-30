import ExternalReservationList from "./ExternalReservationList";

/* ===============================================================
   🛡️ FAZ 56G — iCAL REZERVASYONLARI ADMIN PAGE
   ===============================================================
   /maki-admin/external-reservations
   external_calendar_events tablosunun read-only operations view'ı.

   KRİTİK AYRIM:
     Bu sayfa GERÇEK reservation göstermez. external iCal sync'ten
     gelen availability blocker kayıtlardır (Airbnb / Booking / VRBO).
     • Reservation tablosuna yazılmaz
     • Payment flow yok
     • Mail tetiklemez
     • Status lifecycle yok

   /maki-admin/reservations gerçek rezervasyon listesi; bağımsız
   ekran (collision yok).
=============================================================== */
export default function Page() {
  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">Rezervasyon</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          iCal Rezervasyonları
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          Airbnb, Booking ve diğer platformlardan sync edilen takvim
          blokları. Yalnız görüntülemek için — düzenleme / silme
          yapılamaz. Bu kayıtlar villa availability'sini bloklar ama
          gerçek rezervasyon değildir.
        </p>
      </div>
      <ExternalReservationList />
    </div>
  );
}
