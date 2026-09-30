/* ===============================================================
   📦 Reservation Detail — Section (presentational wrapper)
   ===============================================================
   FAZ 1 refactor: page.tsx 3009 satır → extraction (zero regression).
   Davranış BYTE-IDENTICAL. JSX birebir taşındı; eyebrow + title +
   subtitle + children compose pattern.
=============================================================== */

export default function Section({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-premium p-6 md:p-7">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="font-display text-2xl text-[var(--color-stone-900)] mt-1.5 tracking-[-0.015em]">
        {title}
      </h2>
      <p className="text-sm text-[var(--color-stone-500)] mt-1.5 mb-6">
        {subtitle}
      </p>
      {children}
    </section>
  );
}
