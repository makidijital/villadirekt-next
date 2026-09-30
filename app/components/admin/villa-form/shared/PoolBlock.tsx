import type { ReactNode } from "react";

/* ===============================================================
   🔥 PoolBlock — havuz grubu için title + içerik wrapper.
   Pure presentational.
   =============================================================== */
export default function PoolBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="font-medium text-[var(--color-stone-800)] text-sm">
        {title}
      </h3>
      {children}
    </div>
  );
}
