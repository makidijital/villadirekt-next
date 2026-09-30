/* ===============================================================
   🔥 PoolSizeRow — derinlik/genişlik/uzunluk inputları (3 col).
   Pure presentational. Original davranış birebir korunur:
     - onChange(idx, v) signature (DEĞİŞMEDİ)
     - 3-col grid (DEĞİŞMEDİ)
     - value type (DEĞİŞMEDİ)
     - input className (DEĞİŞMEDİ)

   🛡️ FAZ 13 — UX iyileştirmesi:
     - Placeholder'lar "Derinlik (örn: 1.5m)" → "1.5" gibi numeric
       örneklere sadeleştirildi. Eski format admin kullanıcıların
       placeholder'ı kopyalamasına yol açıyordu ("1.5m", "4 metre",
       "8 mt" gibi inkonsistent veri).
     - Title attribute'lar etiketi koruyor (mouse hover tooltip +
       screen reader). Görsel placeholder daha sade.
     - inputMode="decimal" mobile keyboard'a numeric keypad açar.
     - Frontend villa detay render'ında `formatPoolDimension`
       (lib/dimension.helper) ham değere "m" akıllı append eder.
       Backward-compat: eski "4m" kayıtları as-is render.
   =============================================================== */

export type PoolSizeValue = string | number | null | undefined;

/** Etiket sırası: [Derinlik, Genişlik, Uzunluk] — onChange(idx) ile
 *  parent state field map'ine birebir karşılık geliyor. */
const FIELD_LABELS_SHORT = ["Derinlik", "Genişlik", "Uzunluk"] as const;
const FIELD_LABELS_FULL = [
  "Derinlik (m)",
  "Genişlik (m)",
  "Uzunluk (m)",
] as const;
const FIELD_PLACEHOLDERS = ["1.5", "4", "8"] as const;

export default function PoolSizeRow({
  values,
  onChange,
}: {
  values: ReadonlyArray<PoolSizeValue>;
  onChange: (idx: number, v: string) => void;
}) {
  /* 🛡️ FAZ 14 — UX clarity:
     Her input'un üstünde küçük muted eyebrow label.
     Placeholder sade numeric ("1.5"/"4"/"8") kalır, label context
     verir. Grid 3-col düzeni korunur (mobile dahil). Yalnız
     ~16-18px ek dikey alan. <label> tag input'u implicit
     associate eder → screen reader a11y native. */
  return (
    <div className="grid grid-cols-3 gap-3">
      {values.map((v, i) => (
        <label key={i} className="block">
          <span className="block text-[10px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-400)] mb-1.5">
            {FIELD_LABELS_SHORT[i]}
          </span>
          <input
            /* Numeric-only placeholder — admin'in placeholder'ı
               kopyalama eğilimini kırar. Birim hint label içinde
               görsel olarak yansıtılır (yukarıda); ayrıca title
               attr ile tooltip. */
            placeholder={FIELD_PLACEHOLDERS[i]}
            title={FIELD_LABELS_FULL[i]}
            aria-label={FIELD_LABELS_FULL[i]}
            /* Mobile keyboard'da decimal numpad açar. */
            inputMode="decimal"
            value={(v as string | number | null | undefined) ?? ""}
            onChange={(e) => onChange(i, e.target.value)}
            className="input w-full"
          />
        </label>
      ))}
    </div>
  );
}
