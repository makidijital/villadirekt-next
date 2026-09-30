/* ===============================================================
   🔥 DAMAGE DEPOSIT — TEK MERKEZİ HELPER
   ===============================================================
   Source-of-truth: villas.deposit (master)
   Snapshot:        reservations.damage_deposit (frozen on insert)

   Bu helper:
   - normalize: number / NaN / negative → 0
   - shouldDisplay: > 0 ise true (0/null/undefined render edilmez)
   - format: TRY tutarı + opsiyonel inline note

   ÖNEMLİ:
   damage_deposit informational bir alandır;
   getPaymentDisplayValues / total / prepayment / remaining_payment
   hesaplarına HİÇ dahil edilmez. Yalnız ayrı info satırı/kartı
   olarak gösterilir.
   =============================================================== */

export const DAMAGE_DEPOSIT_NOTE =
  "Hasar olmadığı takdirde iade edilir";

export function normalizeDamageDeposit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

export function shouldDisplayDamageDeposit(value: unknown): boolean {
  return normalizeDamageDeposit(value) > 0;
}

/* TRY formatlı tutar — formatTRY ile aynı stil */
export function formatDamageDepositTRY(value: unknown): string {
  const n = normalizeDamageDeposit(value);
  return `₺${new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 0,
  }).format(n)}`;
}
