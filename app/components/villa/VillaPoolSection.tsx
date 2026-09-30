import { Waves } from "lucide-react";

import { formatPoolDimension } from "@/lib/dimension.helper";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";
import { buildPoolCards, type PoolCardSource } from "@/lib/pool.helper";
import { getPoolTypeLabel } from "@/lib/pool-label.helper";

/* ===============================================================
   🛡️ VillaPoolSection — PHASE 10E BATCH 5
   ===============================================================
   TR villa detay sayfasının ("Havuz Bilgileri" bloğu,
   app/(public)/kiralik-villa/[slug]/page.tsx) SALT-SUNUM karşılığı.

   ⚠️ TR SAYFASI BU COMPONENT'İ KULLANMIYOR — kendi inline JSX'i AYNEN
   duruyor. Bu, `VillaDistancesSection` / `VillaFeaturesSection` ile
   AYNI, projede zaten onaylanmış desendir (Phase 8D-2: "EN/DE için
   küçük, salt-sunum server component'leri; TR dosyasına dokunulmaz").
   Böylece TR çıktısı sıfır riskle byte-identical kalır.

   Server component (interaktivite yok — "use client" GEREKMİYOR).
   DB'ye/translation tablosuna HİÇ erişmez.

   🛡️ TİP ↔ ETİKET YÖNÜ: kartlar canonical `PoolTypeKey` taşır
   (lib/pool.helper.ts); etiket yalnız render anında dictionary'den
   türetilir. Çevrilmiş metinden tip/ikon çıkarımı YAPILMAZ — ikon
   (Waves) zaten tipten bağımsız, section geneline aittir.

   JSX/CSS: TR bloğunun yapısı birebir korunmuştur (aynı container,
   divide-y satırlar, 3 kolonlu ölçü grid'i); yalnız metinler
   locale-aware.
   =============================================================== */

type Props = {
  villa: PoolCardSource;
  locale: Locale;
};

export default function VillaPoolSection({ villa, locale }: Props) {
  const cards = buildPoolCards(villa);
  if (cards.length === 0) return null;

  const dict = getDictionary(locale);

  return (
    <section>
      <div className="flex items-center gap-2.5 mb-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0973BA]/10 text-[#0973BA]">
          <Waves size={16} strokeWidth={1.8} />
        </span>
        <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
          {dict.pool.sectionTitle}
        </h2>
      </div>

      <div className="rounded-2xl border border-[var(--color-stone-200)] bg-[var(--color-sand-100)] divide-y divide-[var(--color-stone-100)]">
        {cards.map((c) => {
          const hasDims = !!(c.width || c.length || c.depth);
          const rows = [
            { k: dict.pool.width, v: formatPoolDimension(c.width) },
            { k: dict.pool.length, v: formatPoolDimension(c.length) },
            { k: dict.pool.depth, v: formatPoolDimension(c.depth) },
          ];
          return (
            <div key={c.key} className="p-4 md:p-5">
              <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--color-stone-500)]">
                <span
                  aria-hidden="true"
                  className="inline-block w-1.5 h-1.5 rounded-full bg-[#ED7926]"
                />
                {getPoolTypeLabel(c.type, locale)}
              </p>
              {hasDims ? (
                <div className="mt-3 grid grid-cols-3 gap-2.5">
                  {rows.map((row) => (
                    <div
                      key={row.k}
                      className="rounded-lg border border-[var(--color-stone-100)] bg-white px-3 py-2.5"
                    >
                      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--color-stone-400)]">
                        {row.k}
                      </p>
                      <p className="mt-1 font-display text-[16px] md:text-[17px] text-[var(--color-stone-900)] tabular-nums">
                        {row.v}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[13px] text-[var(--color-stone-400)] italic">
                  {dict.pool.noDimensions}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
