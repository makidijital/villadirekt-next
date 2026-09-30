import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ LocaleRouteComingSoon — PHASE 4A (Public Locale Routing Core)
   ===============================================================
   /en/* ve /de/* route'ları için MİNİMUM içerik. Bu faz kapsamı
   yalnız ROUTING altyapısıdır — asıl TR sayfalarının (kiralik-villa/
   [slug] ~1000 satır, kiralik-villalar, arama, rezervasyon/[slug])
   veri/komponent akışı BURADA KOPYALANMADI/REFACTOR EDİLMEDİ (görev
   tanımının açık kısıtı). Gerçek EN/DE içerik üretimi (translation
   tabloları + fallback zinciri) sonraki bir faz.

   Header/Footer BURADA render EDİLMİYOR — bu component yalnız
   app/(public)/layout.tsx'in `children`'ı olarak render edilir; o
   layout zaten Header/Footer/BottomNav/vb. sağlıyor (DEĞİŞTİRİLMEDİ).

   Yalnız `multilingual_enabled=true` olduğunda (bugün production'da
   false) bu component'e ulaşılır — bkz. lib/i18n/public-locale-
   gate.server.ts. */

const COPY: Record<Exclude<Locale, "tr">, { title: string; body: string }> = {
  en: {
    title: "This page isn't translated yet",
    body: "We're working on the English version of this page. Please check back soon, or switch to the Turkish site for the full experience.",
  },
  de: {
    title: "Diese Seite ist noch nicht übersetzt",
    body: "Wir arbeiten an der deutschen Version dieser Seite. Bitte schauen Sie bald wieder vorbei oder wechseln Sie zur türkischen Seite.",
  },
};

export default function LocaleRouteComingSoon({
  locale,
}: {
  locale: Exclude<Locale, "tr">;
}) {
  const copy = COPY[locale];

  return (
    <div className="max-w-xl mx-auto px-5 md:px-0 py-24 text-center">
      <h1 className="font-display text-[28px] md:text-[36px] text-[var(--color-stone-900)] mb-4 leading-tight">
        {copy.title}
      </h1>
      <p className="text-[var(--color-stone-500)] leading-relaxed text-[15px] md:text-[16px]">
        {copy.body}
      </p>
    </div>
  );
}
