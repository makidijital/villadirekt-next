"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/* ===============================================================
   🔒 HideableSection — dashboard "privacy screen" wrapper
   ===============================================================
   AMAÇ:
     Admin dashboard'da hassas olabilecek verileri (rezervasyon
     sayıları/isimleri/villaları/tutarları) varsayılan olarak
     görsel şekilde gizler. SALT UI/state davranışı — veri her
     koşulda `children` olarak DOM'da mevcut kalır (unmount
     edilmez), yalnız blur + üzerine binen bir overlay ile görsel
     olarak maskelenir. Bu yüzden içine sarılan bir grafiğin (örn.
     ReservationsChart, kendi ResizeObserver'ıyla) ölçüm/layout
     mantığı etkilenmez; scroll/height/layout değişmez.

   DAVRANIŞ:
     - Varsayılan: gizli (`visible` başlangıç değeri `false`).
       localStorage/persist YOK — sayfa yenilenince component
       yeniden mount olur ve her zaman gizli başlar.
     - Gizliyken: children blur + pointer-events-none + aria-hidden;
       üzerinde tam-kaplayan bir buton (yarı saydam overlay + Eye
       ikonu + kısa açıklama) — overlay'in HERHANGİ bir noktasına
       tıklamak içeriği gösterir.
     - Görünürken: sağ üstte küçük bir EyeOff ikon-butonu ile
       tekrar gizlenebilir.
     - Her instance kendi state'ini taşır → birden çok
       HideableSection (ör. grafik + liste) birbirinden bağımsız
       açılıp kapanır.

   TASARIM:
     Yalnız mevcut admin CSS custom property'leri (--admin-surface /
     --admin-border / --admin-text / --admin-muted) + marka renkleri
     (#ED7926 turuncu / #0973BA mavi) kullanılır. Yeni global CSS
     eklenmedi — tamamen Tailwind utility. Köşe yarıçapı dashboard
     kartlarıyla (admin-card-flat / admin-table: 16px) hizalı olsun
     diye `rounded-2xl`. Gereksiz/sürekli animasyon YOK — yalnız
     kısa bir renk/blur geçişi (200ms).
   =============================================================== */

export default function HideableSection({
  children,
  label,
}: {
  children: React.ReactNode;
  /** Aria-label / overlay bağlamı için insan-okur kısa isim,
   *  örn. "Günlük rezervasyon grafiği". */
  label: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      {/* İçerik HER ZAMAN mount'lu — yalnız görsel olarak maskelenir.
         (Grafik component'inin ResizeObserver'ı bu yüzden etkilenmez.) */}
      <div
        aria-hidden={!visible}
        className={
          "transition-[filter] duration-200 ease-out " +
          (visible ? "" : "pointer-events-none select-none blur-md")
        }
      >
        {children}
      </div>

      {!visible && (
        <button
          type="button"
          onClick={() => setVisible(true)}
          aria-label={`${label} — görüntülemek için tıklayın`}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)]/80 backdrop-blur-[2px] transition-colors duration-200 hover:bg-[var(--admin-surface)]/90"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#ED7926]/15 to-[#0973BA]/15 text-[#0973BA]">
            <Eye size={18} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="text-[13px] font-medium text-[var(--admin-text)]">
            Görüntülemek için tıklayın
          </span>
        </button>
      )}

      {visible && (
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label={`${label} — gizle`}
          title="Gizle"
          className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-muted)] shadow-sm transition-colors duration-200 hover:text-[#0973BA] hover:border-[#0973BA]/40"
        >
          <EyeOff size={15} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
