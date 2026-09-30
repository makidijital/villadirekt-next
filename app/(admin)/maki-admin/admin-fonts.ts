import { Inter, Fraunces } from "next/font/google";

/* ===============================================================
   🛡️ ADMIN FONTLARI — Inter (gövde) + Fraunces (başlık)
   ===============================================================
   Önceden root `app/layout.tsx` içindeydi → public sayfalarda hiç
   kullanılmadıkları halde her sayfada preload edilip indiriliyordu.
   Yalnız admin route'larında yüklenmeleri için buraya taşındı.
   Ayarlar (subsets / display / axes / variable adları) BİREBİR aynı;
   `--font-inter` / `--font-fraunces` değişkenleri `.admin-shell`
   elementine eklenir → globals.css `.admin-shell` pin'i AYNEN çalışır.
=============================================================== */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz", "SOFT"],
});

/** `.admin-shell` elementine eklenecek font değişkeni class'ları. */
export const adminFontVariables = `${inter.variable} ${fraunces.variable}`;
