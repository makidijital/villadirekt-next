import { MapPin, ShieldCheck, Headphones } from "lucide-react";

import TrustItem from "./TrustItem";

/* ===============================================================
   🛡️ FAZ 3 — HeroTrustStrip (PURE PRESENTATIONAL)
   ===============================================================
   Eski Hero.tsx > 3 TrustItem grid (L896-918) BYTE-IDENTICAL
   kopyası. FAZ 39B spacing (mt-14 → mt-14 md:mt-16) korundu.

   ⚠️ KESIN KURAL:
     - role="list" aria
     - mt-14 md:mt-16 spacing
     - grid-cols-1 md:grid-cols-3 gap-5 md:gap-8
     - 3 ton sırası: coral, emerald, sky (AYNEN — "En İyi Konumlar",
       "Güvenli Rezervasyon", "7/24 Destek")
     - Tüm copy + icon size + strokeWidth=1.6 AYNEN
   =============================================================== */

export default function HeroTrustStrip() {
  return (
    <ul
      role="list"
      className="mt-14 md:mt-16 grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8"
    >
      <TrustItem
        tone="coral"
        icon={<MapPin size={18} aria-hidden strokeWidth={1.6} />}
        title="En İyi Konumlar"
        description="Akdeniz'in en güzel bölgelerinde seçkin villalar"
      />
      <TrustItem
        tone="emerald"
        icon={<ShieldCheck size={18} aria-hidden strokeWidth={1.6} />}
        title="Güvenli Rezervasyon"
        description="Kolay rezervasyon, esnek iptal ve %100 güvenli ödeme"
      />
      <TrustItem
        tone="sky"
        icon={<Headphones size={18} aria-hidden strokeWidth={1.6} />}
        title="7/24 Destek"
        description="Tatiliniz boyunca her an yanınızdayız"
      />
    </ul>
  );
}
