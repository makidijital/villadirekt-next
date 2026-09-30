"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Compass } from "lucide-react";

import VillaCard from "@/app/components/villa/VillaCard";

/* 🛡️ PUBLIC ÇOKLU DİL — 404 GÖVDESİ
   ===============================================================
   `Header.tsx` / `Footer.tsx` (Phase 9A/9B) ile BİREBİR AYNI desen:
   aktif locale `usePathname()` + `localeFromPathname()` ile RENDER
   sırasında türetilir, metinler `getDictionary(locale)`'den gelir.
   Yeni bir i18n sistemi/provider KURULMADI.

   `app/not-found.tsx` bir SERVER component'tir ve `headers()`
   kullanmadan locale'i bilemez (root layout'un statik/ISR uygunluğunu
   bozmamak için bu proje genelinde bilinçli bir karardır) — bu yüzden
   görünen gövde bu küçük client island'a taşındı. Villa verisi
   sunucuda çekilip `suggestionVillas` olarak prop geçilir; DOM/CSS ve
   `getCachedVillas` akışı DEĞİŞMEDİ.

   🛡️ Öneri kartları da BURADA render edilir (önceden hazır ReactNode
   olarak sunucudan geliyordu): `VillaCard` ancak bu island içinde
   türetilen locale'i alabilir → `/en` ve `/de` 404'ünde kart metinleri
   ve detay linkleri de locale-aware olur. Villa verisi, sıralama ve
   kart prop'ları AYNEN korundu.
   =============================================================== */
import { DEFAULT_LOCALE, localeFromPathname } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/** `app/not-found.tsx`'in `getCachedVillas()` sonucundan geçirdiği
 *  öneri villaları — kart prop'larıyla BİREBİR aynı alanlar. */
export type NotFoundSuggestionVilla = {
  id: string;
  slug?: string | null;
  title: string;
  location: string;
  price?: number | null;
  currency?: string | null;
  images?: string[];
  bedrooms?: number | null;
  bathrooms?: number | null;
  guests?: number | null;
};

export default function NotFoundContent({
  suggestionVillas,
}: {
  suggestionVillas?: NotFoundSuggestionVilla[];
}) {
  const locale = localeFromPathname(usePathname());
  const dict = getDictionary(locale).notFound;
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;

  return (
    <main className="flex-1">
      {/* HERO */}
      <section className="px-5 md:px-10 lg:px-16 pt-16 md:pt-24 pb-10 md:pb-14">
        <div className="max-w-[760px] mx-auto text-center">
          <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--brand-coral)]">
            <Compass className="w-4 h-4" />
            404
          </span>
          <h1 className="font-display font-medium text-[30px] md:text-[44px] leading-tight tracking-[-0.02em] text-[var(--color-stone-900)] mt-4">
            {dict.title}
          </h1>
          <p className="mt-4 text-[15px] md:text-[16px] leading-relaxed text-[var(--color-stone-500)] max-w-xl mx-auto">
            {dict.body}
          </p>

          {/* BUTONLAR */}
          <div className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <Link
              href={prefix === "" ? "/" : prefix}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[var(--color-stone-900)] text-white text-[14px] font-medium tracking-[0.02em] hover:bg-[var(--color-stone-700)] transition-colors motion-reduce:transition-none"
            >
              <Home className="w-4 h-4" />
              {dict.homeCta}
            </Link>
            <Link
              href={`${prefix}/kiralik-villalar`}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-[var(--color-stone-200)] text-[14px] font-medium text-[var(--color-stone-800)] hover:border-[var(--color-stone-300)] hover:bg-white transition-colors motion-reduce:transition-none"
            >
              <Search className="w-4 h-4" />
              {dict.villasCta}
            </Link>
          </div>
        </div>
      </section>

      {/* ÖNE ÇIKAN VİLLALAR */}
      {suggestionVillas && suggestionVillas.length > 0 && (
        <section className="px-5 md:px-10 lg:px-16 pb-16 md:pb-24">
          <div className="max-w-[1280px] mx-auto">
            <div className="text-center mb-8 md:mb-10">
              <p className="text-[10.5px] tracking-[0.28em] uppercase font-medium text-[var(--brand-coral)]">
                {dict.suggestionsEyebrow}
              </p>
              <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
                {dict.suggestionsTitle}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {suggestionVillas.map((villa) => (
                <VillaCard
                  key={villa.slug || villa.id}
                  id={villa.id}
                  slug={villa.slug ?? ""}
                  title={villa.title}
                  location={villa.location}
                  price={villa.price ?? undefined}
                  currency={villa.currency || "TRY"}
                  images={villa.images}
                  bedrooms={villa.bedrooms || 1}
                  bathrooms={villa.bathrooms || 1}
                  guests={villa.guests || 2}
                  locale={locale}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
