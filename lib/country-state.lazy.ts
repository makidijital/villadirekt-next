/* ===============================================================
   🌍 COUNTRY-STATE DATA — YALNIZ DYNAMIC IMPORT İLE YÜKLENİR
   ===============================================================
   Aşama 7A — `country-state-city` (country.json + state.json,
   ~636 KB ham) public `/rezervasyon/[slug]` route'unun İLK JS
   bundle'ından çıkarıldı.

   ⚠️ KURAL: Bu dosyayı public/client kodda STATİK import ETMEYİN.
   Yalnız `import("@/lib/country-state.lazy")` ile yükleyin; aksi hâlde
   paket yeniden ilk bundle'a girer.

   Named import (Country, State) KASITLI: paketin tree-shaking'i
   korunur — `City` ve devasa city.json bu chunk'a GİRMEZ (önceki
   statik import ile aynı içerik, yalnız ayrı/lazy bir chunk'ta).
   =============================================================== */

import { Country, State } from "country-state-city";

export { Country, State };
