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

/* Kompakt mavi kart — #1B4EF5 düz renk (gradient YOK), ~56px, hafif
   mavi gölge, hafif hover lift (reduced-motion guard'lı). */
const POOL_CARD_CLASS =
  "group flex items-center gap-2.5 min-w-0 rounded-[13px] bg-[#1B4EF5] px-3 py-2.5 shadow-[0_4px_12px_-8px_rgba(27,78,245,0.55)] transition duration-200 motion-reduce:transition-none hover:bg-[#2A5BF7] hover:-translate-y-px motion-reduce:hover:translate-y-0";
const POOL_ICON_CLASS =
  "shrink-0 w-8 h-8 rounded-[9px] bg-white/15 text-white flex items-center justify-center";

export default function VillaPoolSection({ villa, locale }: Props) {
  const cards = buildPoolCards(villa);
  if (cards.length === 0) return null;

  const dict = getDictionary(locale);

  return (
    <section>
      <div className="flex items-center gap-2.5 mb-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Waves size={16} strokeWidth={1.8} />
        </span>
        <h2 className="font-display font-bold text-[20px] md:text-[22px] leading-tight text-[var(--color-stone-900)] tracking-[-0.015em]">
          {dict.pool.sectionTitle}
        </h2>
      </div>

      {/* Kompakt mavi kart dili — "Yakındaki Noktalar" / "Konaklama
          Düzeni" ile AYNI. Her havuz: tip etiketi + ölçü kartları
          (Genişlik / Uzunluk / Derinlik). Ölçü yoksa tek kart: tip +
          "ölçü yok" metni. Veri/sıra/etiketler AYNEN. */}
      <div className="space-y-3.5">
        {cards.map((c) => {
          const hasDims = !!(c.width || c.length || c.depth);
          const typeLabel = getPoolTypeLabel(c.type, locale);
          const rows = [
            { k: dict.pool.width, v: formatPoolDimension(c.width) },
            { k: dict.pool.length, v: formatPoolDimension(c.length) },
            { k: dict.pool.depth, v: formatPoolDimension(c.depth) },
          ];
          return (
            <div key={c.key}>
              {hasDims ? (
                <>
                  <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-stone-500)]">
                    <span
                      aria-hidden="true"
                      className="inline-block w-1.5 h-1.5 rounded-full bg-accent"
                    />
                    {typeLabel}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {rows.map((row) => (
                      <div key={row.k} className={POOL_CARD_CLASS}>
                        <span aria-hidden="true" className={POOL_ICON_CLASS}>
                          <Waves size={15} strokeWidth={1.5} />
                        </span>
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className="text-[13px] font-semibold text-white truncate">
                            {row.k}
                          </p>
                          <p className="mt-0.5 text-[12px] font-medium text-white/80 truncate tabular-nums">
                            {row.v}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  <div className={POOL_CARD_CLASS}>
                    <span aria-hidden="true" className={POOL_ICON_CLASS}>
                      <Waves size={15} strokeWidth={1.5} />
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="text-[13px] font-semibold text-white truncate">
                        {typeLabel}
                      </p>
                      <p className="mt-0.5 text-[12px] font-medium text-white/80 truncate">
                        {dict.pool.noDimensions}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
