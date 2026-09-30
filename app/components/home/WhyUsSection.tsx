import {
  ShieldCheck,
  Lock,
  Headphones,
  BadgePercent,
  MessageCircle,
} from "lucide-react";

/* ===============================================================
   🛡️ WhyUsSection — premium güven + dönüşüm bölümü (STATİK)
   ===============================================================
   Yerleşim: Villa listesi'nin altında.
   Tamamen statik: CMS/settings/DB yok. Tek dinamik veri WhatsApp
   numarası — homepage'in zaten elindeki settings.phone prop olarak
   geçer (yeni veri kaynağı eklenmez). phone yoksa /teklif-al
   fallback'i.

   Tasarım: ayrı yüzey (kırık beyaz card) + gerçek beyaz özellik
   kartları (border + soft shadow + hover lift) + premium tint CTA.
   Gradient/glassmorphism/neon yok; yüksek kontrast, lüks villa
   markası tonu (Plum Guide / Villanovo / Oliver's Travels).
=============================================================== */

type Props = {
  /** Marka adı — başlık "Neden {brand}?" için. Homepage'den geçer. */
  brandName?: string;
  /** Mevcut settings.phone (homepage'den). WhatsApp linki için. */
  phone?: string | null;
};

const FEATURES: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  desc: string;
}[] = [
  {
    icon: ShieldCheck,
    title: "Doğrulanmış Villalar",
    desc: "Her villa, listelenmeden önce ekibimiz tarafından titizlikle kontrol edilir.",
  },
  {
    icon: Lock,
    title: "Güvenli Rezervasyon",
    desc: "Rezervasyon ve ödeme süreçleri uçtan uca güvence altındadır.",
  },
  {
    icon: Headphones,
    title: "Yerel Uzman Desteği",
    desc: "Rezervasyon öncesi ve sonrasında, bölgeyi bilen ekipten destek alın.",
  },
  {
    icon: BadgePercent,
    title: "En İyi Fiyat Garantisi",
    desc: "Doğrudan rezervasyonun avantajlarıyla en uygun fiyatı sunuyoruz.",
  },
];

export default function WhyUsSection({ brandName, phone }: Props) {
  const brand = brandName?.trim() || "Villa Kiralama";
  const phoneDigits = phone?.replace(/[^\d]/g, "") || "";
  const ctaHref = phoneDigits
    ? `https://wa.me/${phoneDigits}`
    : "/teklif-al";
  const ctaExternal = !!phoneDigits;

  return (
    <section
      aria-label="Neden biz"
      className="px-5 md:px-10 lg:px-16 pt-20 md:pt-28 pb-4 md:pb-10"
    >
      {/* AYRI YÜZEY — kırık beyaz card; sayfadan ayrışır */}
      <div
        className="
          max-w-[1280px] mx-auto
          rounded-3xl border border-black/[0.06]
          bg-[#FAF8F5]
          shadow-[0_24px_60px_-32px_rgba(27,26,23,0.18)]
          px-6 py-14 md:px-14 md:py-20
        "
      >
        {/* HEADER — belirgin eyebrow + dekoratif çizgi */}
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-[11px] tracking-[0.24em] uppercase font-semibold text-[var(--brand-coral)]">
            Güvence
          </p>
          <h2 className="font-display text-[30px] md:text-[44px] text-[var(--color-stone-900)] mt-4 leading-[1.06] tracking-[-0.025em]">
            Neden {brand}?
          </h2>
          {/* dekoratif ince çizgi */}
          <span
            aria-hidden="true"
            className="block w-12 h-[3px] rounded-full bg-[var(--brand-coral)] mx-auto mt-6"
          />
          <p className="mt-6 text-[15px] md:text-[16.5px] leading-relaxed text-[var(--color-stone-600)] max-w-2xl mx-auto">
            Doğrulanmış villalar, güvenli rezervasyon süreçleri ve yerel
            uzman desteğiyle tatilinizi güvenle planlayın.
          </p>
        </div>

        {/* 4 GERÇEK KART — beyaz, border, soft shadow, hover lift, eşit boy */}
        <div className="mt-14 md:mt-18 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="
                  h-full flex flex-col
                  rounded-2xl border border-[var(--color-stone-100)]
                  bg-white
                  shadow-[0_10px_30px_-18px_rgba(27,26,23,0.12)]
                  px-6 py-7 md:px-7 md:py-8
                  hover:-translate-y-1
                  hover:shadow-[0_24px_50px_-24px_rgba(27,26,23,0.22)]
                  hover:border-[var(--color-stone-200)]
                  transition-[transform,box-shadow,border-color] duration-300
                  motion-reduce:transition-none motion-reduce:hover:translate-y-0
                "
              >
                <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--brand-coral-tint)] text-[var(--brand-coral)]">
                  <Icon size={26} strokeWidth={1.6} />
                </span>
                <h3 className="font-display text-[19px] md:text-[20px] text-[var(--color-stone-900)] mt-5 tracking-[-0.015em] leading-snug">
                  {f.title}
                </h3>
                <p className="mt-3 text-[14px] md:text-[14.5px] leading-relaxed text-[var(--color-stone-500)]">
                  {f.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* PREMIUM CTA — açık lacivert tint, belirgin border, güçlü buton */}
        <div
          className="
            mt-14 md:mt-18
            rounded-3xl border border-[#dbe4f0]
            bg-[#F4F7FC]
            shadow-[0_16px_40px_-28px_rgba(20,40,70,0.25)]
            px-7 py-9 md:px-12 md:py-11
            flex flex-col md:flex-row md:items-center md:justify-between gap-7
          "
        >
          <div className="max-w-xl">
            <h3 className="font-display text-[23px] md:text-[28px] text-[var(--color-stone-900)] tracking-[-0.02em] leading-tight">
              Villa seçmekte kararsız mısınız?
            </h3>
            <p className="mt-3 text-[15px] md:text-[16px] leading-relaxed text-[var(--color-stone-600)]">
              Uzman ekibimiz ihtiyaçlarınıza uygun villaları sizin için
              belirlesin.
            </p>
          </div>

          <a
            href={ctaHref}
            {...(ctaExternal
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
            className="
              inline-flex items-center justify-center gap-2.5 shrink-0
              rounded-full px-7 py-4
              bg-[#1FAA59] text-white
              text-[15px] font-semibold tracking-[0.01em]
              shadow-[0_18px_38px_-14px_rgba(31,170,89,0.6)]
              hover:bg-[#178e4a] hover:scale-[1.02]
              transition-[transform,background-color] duration-300
              motion-reduce:transition-none motion-reduce:hover:scale-100
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FAA59]/40
            "
          >
            <MessageCircle size={18} strokeWidth={1.85} aria-hidden />
            WhatsApp ile İletişime Geç
          </a>
        </div>
      </div>
    </section>
  );
}
