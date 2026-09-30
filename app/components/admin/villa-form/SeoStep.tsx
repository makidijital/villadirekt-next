/* ===============================================================
   🔥 SeoStep — Adım 6: SEO & Sosyal Paylaşım.
   Pure presentational. Önceden villa edit page'in altında
   inline SeoSection olarak tanımlıydı; davranış birebir.

   Tüm değişiklikler parent handler'larıyla yönetilir; bu component
   yalnızca render eder.
   =============================================================== */

export default function SeoStep({
  seoTitle,
  seoDescription,
  noindex,
  fallbackTitle,
  fallbackDescription,
  onChangeTitle,
  onChangeDescription,
  onToggleNoindex,
  slug,
}: {
  seoTitle: string;
  seoDescription: string;
  noindex: boolean;
  fallbackTitle?: string;
  fallbackDescription?: string;
  onChangeTitle: (v: string) => void;
  onChangeDescription: (v: string) => void;
  onToggleNoindex: () => void;
  slug?: string;
}) {
  const previewTitle = (
    seoTitle ||
    fallbackTitle ||
    "Mülk Başlığı"
  ).trim();
  const previewDescriptionRaw = (
    seoDescription ||
    fallbackDescription ||
    "Mülk açıklaması burada görünecek."
  ).toString();
  const previewDescription =
    previewDescriptionRaw.length > 160
      ? previewDescriptionRaw.slice(0, 160) + "…"
      : previewDescriptionRaw;

  const titleCount = (seoTitle || "").length;
  const descCount = (seoDescription || "").length;

  const titleOver = titleCount > 60;
  const descOver = descCount > 160;

  return (
    <section className="card-premium p-6 md:p-8">
      <p className="eyebrow">SEO</p>
      <h2 className="font-display text-2xl text-[var(--color-stone-900)] mt-1.5 tracking-[-0.015em]">
        SEO &amp; Sosyal Paylaşım
      </h2>
      <p className="text-sm text-[var(--color-stone-500)] mt-1.5 mb-6">
        Arama motorları ve sosyal paylaşım önizlemesini özelleştir.
      </p>

      {/* SEO TITLE */}
      <div className="space-y-2">
        <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
          SEO Başlık
        </label>
        <input
          value={seoTitle}
          onChange={(e) => onChangeTitle(e.target.value)}
          placeholder={fallbackTitle || "Mülk Başlığı"}
          className="input"
          maxLength={120}
        />
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-[var(--color-stone-400)]">
            Boş bırakılırsa mülk adı kullanılır
          </span>
          <span
            className={
              titleOver
                ? "text-red-600 font-semibold"
                : "text-[var(--color-stone-500)]"
            }
          >
            {titleCount} / 60 karakter
          </span>
        </div>
      </div>

      {/* SEO DESCRIPTION */}
      <div className="space-y-2 mt-5">
        <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
          SEO Açıklama
        </label>
        <textarea
          value={seoDescription}
          onChange={(e) => onChangeDescription(e.target.value)}
          placeholder={
            fallbackDescription || "Mülk açıklamasından kısa bir özet"
          }
          className="input !rounded-2xl !p-4 min-h-[110px] resize-none"
          maxLength={300}
        />
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-[var(--color-stone-400)]">
            Boş bırakılırsa mülk açıklamasından özet üretilir
          </span>
          <span
            className={
              descOver
                ? "text-red-600 font-semibold"
                : "text-[var(--color-stone-500)]"
            }
          >
            {descCount} / 160 karakter
          </span>
        </div>
      </div>

      {/* NOINDEX TOGGLE */}
      <div className="flex items-center justify-between bg-[var(--color-sand-50)] border border-[var(--color-sand-100)] rounded-2xl px-4 py-3 mt-6">
        <div>
          <p className="text-sm font-medium text-[var(--color-stone-900)]">
            Arama motorlarında gizle
          </p>
          <p className="text-xs text-[var(--color-stone-500)] mt-0.5">
            Açıkken bu mülk Google&apos;da listelenmez (noindex,
            nofollow)
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleNoindex}
          className={`relative w-11 h-6 rounded-full transition shrink-0 ${
            noindex
              ? "bg-[var(--color-champagne-500)]"
              : "bg-[var(--color-stone-200)]"
          }`}
          aria-label="Noindex aç/kapa"
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
              noindex ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {/* GOOGLE PREVIEW */}
      <div className="mt-6">
        <p className="text-[11px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] mb-2">
          Google önizleme
        </p>
        <div className="rounded-2xl border border-[var(--color-stone-100)] bg-white p-5 shadow-soft">
          <div className="text-[12px] text-[var(--color-stone-500)] tracking-wide truncate">
            siteadi.com{slug ? ` › ${slug}` : ""}
          </div>
          <div className="font-display text-[18px] text-[#1a0dab] mt-1 leading-snug truncate">
            {previewTitle}
          </div>
          <div className="text-[13px] text-[var(--color-stone-700)] mt-1 leading-relaxed line-clamp-2">
            {previewDescription}
          </div>
        </div>
      </div>
    </section>
  );
}
