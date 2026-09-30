import { Save, Trash2, X, Loader2 } from "lucide-react";

/* ===============================================================
   🛡️ FAZ 3 — PricingRangeDrawer (PURE PRESENTATIONAL)
   ===============================================================
   Eski `PricingCalendarCanvas.tsx` içinde inline render edilen
   modal/drawer (L645-779) BYTE-IDENTICAL kopyası.

   ⚠️ KESIN KURAL — STATE OWNERSHIP:
     - State (drawerPrice/Currency/Error/saving/selectedFrom/To/
       rangeLabel/rangeNights) parent'ta (PricingCalendarCanvas).
     - Handler (onSave/onDelete/onClose) parent'ta.
     - Drawer pure presentational — props alır + UI çıkar.

   ⚠️ KESIN KURAL — INTERACTION:
     - Backdrop click → onClose
     - Modal card e.stopPropagation()
     - Input onChange: parent setDrawerPrice + clear error
     - Input onKeyDown: Enter → onSave
     - autoFocus AYNEN
     - Currency select 4 option (TRY/USD/EUR/GBP) aynen
     - Delete button border-rose + hover bg-rose-50 aynen
     - Save button btn-primary + Loader2 animate-spin aynen
=============================================================== */

export default function PricingRangeDrawer({
  rangeLabel,
  rangeNights,
  drawerPrice,
  drawerCurrency,
  drawerError,
  saving,
  setDrawerPrice,
  setDrawerCurrency,
  setDrawerError,
  onSave,
  onDelete,
  onClose,
}: {
  rangeLabel: string;
  rangeNights: number;
  drawerPrice: number;
  drawerCurrency: string;
  drawerError: string;
  saving: boolean;
  setDrawerPrice: (n: number) => void;
  setDrawerCurrency: (s: string) => void;
  setDrawerError: (s: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Fiyat aralığını düzenle"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[rgba(27,26,23,0.45)] backdrop-blur-md fade-in"
      />

      {/* Modal card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-[var(--color-stone-100)] flex flex-col overflow-hidden scale-fade-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-stone-100)]">
          <div>
            <p className="eyebrow">Fiyat Aralığı</p>
            <h2 className="font-display text-base text-[var(--color-stone-900)] tracking-[-0.015em] mt-0.5">
              Aralığı düzenle
            </h2>
          </div>
          <button
            onClick={onClose}
            className="admin-icon-btn"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Seçili tarih aralığı + gün */}
          <div>
            <p className="text-[10px] tracking-[0.16em] uppercase font-bold text-[var(--color-stone-400)]">
              Seçili Tarih Aralığı
            </p>
            <p className="text-[14px] font-semibold text-[var(--color-stone-900)] mt-1 leading-snug">
              {rangeLabel}
            </p>
            {rangeNights > 0 && (
              <p className="text-[11px] text-[var(--color-stone-500)] mt-0.5 tabular-nums">
                {rangeNights} gece
              </p>
            )}
          </div>

          {/* Gecelik fiyat + Kur — aynı row */}
          <div className="space-y-1.5">
            <label className="text-[11px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              Gecelik fiyat
            </label>
            <div className="grid grid-cols-[1fr_104px] gap-2">
              <input
                type="number"
                min={0}
                step={1}
                value={
                  Number.isFinite(drawerPrice) ? drawerPrice : 0
                }
                onChange={(e) => {
                  setDrawerPrice(Number(e.target.value) || 0);
                  if (drawerError) setDrawerError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void onSave();
                  }
                }}
                autoFocus
                className={`input !text-base !font-semibold !py-2.5 ${
                  drawerError ? "!border-red-500" : ""
                }`}
                placeholder="0"
              />
              <select
                value={drawerCurrency}
                onChange={(e) =>
                  setDrawerCurrency(e.target.value)
                }
                aria-label="Kur"
                className="input !text-base !font-semibold !py-2.5"
              >
                <option value="TRY">₺ TRY</option>
                <option value="USD">$ USD</option>
                <option value="EUR">€ EUR</option>
                <option value="GBP">£ GBP</option>
              </select>
            </div>
            {drawerError && (
              <p className="text-xs text-red-500">
                {drawerError}
              </p>
            )}
          </div>
        </div>

        {/* Footer — Sil / Kaydet */}
        <div className="px-5 py-4 border-t border-[var(--color-stone-100)] bg-[var(--color-sand-50)] flex items-center justify-between gap-2">
          <button
            onClick={onDelete}
            disabled={saving}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-rose-200 text-rose-700 bg-white hover:bg-rose-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 size={14} />
            Sil
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="btn-primary disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Kaydediliyor…
              </>
            ) : (
              <>
                <Save size={14} />
                Kaydet
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
