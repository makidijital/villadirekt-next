/* ===============================================================
   🛡️ FINANCE — client-safe sabitler
   ===============================================================
   Maki Finans dashboard preset date-range sabitleri. Hem
   `finance.service` (server) hem `maki-finans/page.tsx` (client) kullanır.
   Service native repo (server-only) import ettiği için bu sabitler ayrı
   client-safe modülde (yalnız saf-veri; server importu YOK). Değerler AYNEN.
=============================================================== */
export type FinanceRangePreset = "7d" | "30d" | "1y" | "all";

export const DEFAULT_FINANCE_RANGE: FinanceRangePreset = "30d";

export const FINANCE_RANGE_PRESETS: ReadonlyArray<{
  key: FinanceRangePreset;
  label: string;
}> = [
  { key: "7d", label: "Son 7 Gün" },
  { key: "30d", label: "Son 30 Gün" },
  { key: "1y", label: "Son 1 Yıl" },
  { key: "all", label: "Tüm Zamanlar" },
];
