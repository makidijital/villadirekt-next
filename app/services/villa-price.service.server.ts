import "server-only";

import { villaAdminRepository } from "@/lib/db/villa.repository.server";

/* ===============================================================
   🛡️ VILLA PRICE — SERVER-ONLY WRITE (service-role, throws)
   ===============================================================
   AMAÇ:
     `setVillaPrices` (anon) **server context'ten** çağrılınca silent
     fail oluyordu: anon `db` JWT taşımaz → mig 037
     `villa_prices_admin_write` policy DENY → RPC içindeki
     DELETE+INSERT bloklanır → RPC error döner → caller
     (`createVillaFull` / `updateVillaFull`) hata'yı **fark etmez**
     (eski service `console.error` + silent return).

     Sonuç production: villa + relations kaydolur, fiyatlar BOŞ →
     admin "Kaydedildi" toast'u görür, DB'de fiyat satırı yok.

   ⚠️ NEDEN AYRI DOSYA (sıralı fix, minimum risk):
     Eski `villa-price.service.ts` CLIENT (`PricingCalendarCanvas`)
     tarafından import ediliyor. Onu server-only'a çevirmek client
     bundle'ı kırardı. Bu yeni dosya:
       • `import "server-only"` — client bundle'a sızarsa build HATA
       • Sadece `createVillaFull` ve `updateVillaFull` tarafından
         kullanılır (server route handler context)
       • Service-role repo (`villa.repository.server`) → RLS bypass
       • Error → throw (eski service'ten farklı) → orchestrator
         try/catch zaten var → route 400 + admin gerçek hata görür

   ⚠️ ESKI SERVICE (villa-price.service.ts) DOKUNULMAZ:
     CLIENT path (`PricingCalendarCanvas` "save price grid") browser
     admin JWT taşır → `is_active_admin()` true → RLS allow → çalışır.
     Davranış AYNEN.

   ⚠️ RPC + payload shape AYNEN:
     • `replace_villa_prices` RPC (mig 002, atomic replace-all,
       pg_advisory_xact_lock ile concurrent serileştirme)
     • Date format ("sv-SE") + currency fallback ("TRY") AYNEN
=============================================================== */

/* sv-SE → YYYY-MM-DD. Eski service edge'inde tanımlıydı; AYNEN. */
const formatDate = (date: Date) => date.toLocaleDateString("sv-SE");

export async function setVillaPricesServer(
  villaId: string,
  prices: {
    start_date: string | Date;
    end_date: string | Date;
    price: number;
    currency?: string;
  }[]
): Promise<void> {
  /* Payload normalize (date format + currency fallback) eski service
     ile BYTE-IDENTICAL. */
  const payload = prices.map((p) => ({
    start_date:
      p.start_date instanceof Date
        ? formatDate(p.start_date)
        : p.start_date,
    end_date:
      p.end_date instanceof Date ? formatDate(p.end_date) : p.end_date,
    price: p.price,
    currency: p.currency || "TRY",
  }));

  const { error } = await villaAdminRepository.rpcReplaceVillaPrices(
    villaId,
    payload
  );

  if (error) {
    /* 🛡️ THROW (eski service silent return ediyordu — bug).
       Orchestrator try/catch'i 400'e map'ler, admin'e gerçek hata
       gider. */
    console.error("[setVillaPricesServer] FAILED", error.message);
    throw new Error(error.message || "Villa fiyatları kaydedilemedi");
  }
}
