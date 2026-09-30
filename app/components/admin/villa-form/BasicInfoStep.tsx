import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import Section from "./shared/Section";
import Label from "./shared/Label";
import RichTextEditor from "./RichTextEditor";
import VillaCombobox from "@/app/(admin)/maki-admin/manual-reservations/ekle/VillaCombobox";

import { getPropertyOwnersForSelectAction as getPropertyOwnersForSelect } from "@/app/services/property-owner.action";
import type { PropertyOwner } from "@/app/services/property-owner.service";

import type {
  VillaFormShape,
  VillaFormSetter,
  VillaLocationOption,
} from "./types";

/* ===============================================================
   🔥 BasicInfoStep — Wizard Adım 1 (Step 1).
   İki Section render eder:
     - Adım 1 → Detaylar (villa adı, bölge, kişi, oda, banyo,
                öne çıkan etiket)
     - Adım 2 → Açıklama
   Öne çıkan etiket (badge) Detaylar grid'inin son satırına
   taşındı; ayrı Section yok. Davranış (state, validation,
   responsive) birebir korunur.
   =============================================================== */

export default function BasicInfoStep({
  form,
  setForm,
  slug,
  setSlug,
  slugify,
  locations,
  selectedLocation,
  setSelectedLocation,
}: {
  form: VillaFormShape;
  setForm: VillaFormSetter;
  slug: string;
  setSlug: (next: string) => void;
  slugify: (text: string) => string;
  locations: ReadonlyArray<VillaLocationOption>;
  selectedLocation: string;
  setSelectedLocation: (next: string) => void;
}) {
  /* 🛡️ MÜLK SAHİBİ listesi — self-contained fetch (parent wiring'e
     dokunulmaz; locations prop pattern'i değiştirilmez). admin-only RLS,
     authenticated admin session ile çekilir. owner_id forma bağlanır. */
  const [owners, setOwners] = useState<PropertyOwner[]>([]);
  useEffect(() => {
    let cancelled = false;
    getPropertyOwnersForSelect().then((data) => {
      if (!cancelled) setOwners(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ownerLabel = (o: PropertyOwner) =>
    `${o.first_name ?? ""} ${o.last_name ?? ""}`.trim() ||
    o.email ||
    o.phone ||
    "—";

  return (
    <>
      {/* DETAYLAR — Adım 1 */}
      <Section
        eyebrow="Adım 1"
        title="Detaylar"
        subtitle="Genel bilgileri gir"
      >
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Mülk adı</Label>
            <input
              placeholder="Örn: Villa Sunset Deluxe"
              className="input"
              value={form.title || ""}
              onChange={(e) => {
                const value = e.target.value;
                setForm({ ...form, title: value });
                setSlug(slugify(value));
              }}
            />
            <div className="text-xs text-[var(--color-stone-400)] flex items-center justify-between">
              <span>
                URL:{" "}
                <span className="font-mono text-[var(--color-stone-700)]">
                  /kiralik-villa/{slug || "villa-adi"}
                </span>
              </span>
              {slug && (
                <span className="text-emerald-600 inline-flex items-center gap-1">
                  <Check size={12} /> hazır
                </span>
              )}
            </div>
          </div>

          {/* 🛡️ Migration 072 — "Villanın Gerçek Adı": admin-only, bilgi
              amaçlı. "Villa adı" input'undan TAMAMEN bağımsız; slug/
              onChange zincirine dokunmaz, opsiyonel (boş bırakılabilir). */}
          <div className="space-y-2">
            <Label>Mülkün Gerçek Adı</Label>
            <input
              placeholder="Villanın gerçek/mülk adı"
              className="input"
              value={form.real_title || ""}
              onChange={(e) =>
                setForm({ ...form, real_title: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Bölge</Label>
            {/* 🛡️ Searchable combobox — Manual Reservation paritesi.
                Map: VillaLocationOption.name → VillaCombobox.title;
                slug varsa aramaya dahil (varsa). value/onChange aynı:
                location_id string. Submit payload, state akışı ve
                ilk-yükleme seçimi byte-identical. */}
            <VillaCombobox
              villas={locations.map((l) => ({
                id: l.id,
                title: l.name,
                slug: (l as { slug?: string | null }).slug ?? null,
              }))}
              value={selectedLocation}
              onChange={setSelectedLocation}
              placeholder="Bölge seç"
            />
          </div>

          {/* 🛡️ MÜLK SAHİBİ — nullable select (zorunlu değil). Boş → null. */}
          <div className="space-y-2">
            <Label>Mülk Sahibi</Label>
            <select
              value={(form.owner_id as string) || ""}
              onChange={(e) =>
                setForm({ ...form, owner_id: e.target.value || null })
              }
              className="input"
            >
              <option value="">Mülk sahibi yok</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {ownerLabel(o)}
                </option>
              ))}
            </select>
          </div>

          {/* Öne çıkan etiket — Detaylar grid'inin tam genişliğinde
              son satır. Ayrı Section'dan buraya taşındı. */}
          <div className="space-y-2">
            <Label>Öne çıkan etiket</Label>
            <input
              placeholder="Örn: Muhafazakar"
              className="input max-w-md"
              value={form.badge || ""}
              onChange={(e) =>
                setForm({ ...form, badge: e.target.value })
              }
            />
            <p className="text-[11px] text-[var(--color-stone-400)]">
              Mülk kartında üstte gösterilen rozet (opsiyonel).
            </p>
          </div>

          <div className="space-y-2">
            <Label>Kişi</Label>
            <input
              type="number"
              placeholder="4"
              className="input"
              value={form.guests || ""}
              onChange={(e) =>
                setForm({ ...form, guests: Number(e.target.value) })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Oda</Label>
            <input
              type="number"
              placeholder="2"
              className="input"
              value={form.bedrooms || ""}
              onChange={(e) =>
                setForm({ ...form, bedrooms: Number(e.target.value) })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Banyo</Label>
            <input
              type="number"
              placeholder="2"
              className="input"
              value={form.bathrooms || ""}
              onChange={(e) =>
                setForm({ ...form, bathrooms: Number(e.target.value) })
              }
            />
          </div>

          {/* 🛡️ COMMISSION RATE — accounting foundation (UI binding only).
              DB kolonu villa.commission_rate production'da MEVCUT;
              booking/pricing/availability/reservation engine'lerine
              ETKİSİ YOK. Form state spread ile payload'a akar; service
              katmanı 0-100 range + 20 fallback uygular.
              Validation: 0-100 dışı veya non-finite → kırmızı border +
              küçük helper text. Boş input service'te 15 default. */}
          <div className="space-y-2">
            <Label>Komisyon Oranı (%)</Label>
            {(() => {
              /* `commission_rate` form type'ı `number | null`. Empty
                 input handler tarafından null'a düşürülür; bu
                 nedenle string "" karşılaştırma gereksiz. */
              const raw = form.commission_rate;
              const numeric =
                raw === null || raw === undefined ? null : Number(raw);
              const isInvalid =
                numeric !== null &&
                (!Number.isFinite(numeric) ||
                  numeric < 0 ||
                  numeric > 100);
              return (
                <>
                  <div
                    className={
                      "relative flex items-center min-w-0 w-full rounded-xl border bg-white " +
                      "transition-colors " +
                      (isInvalid
                        ? "border-red-300 focus-within:border-red-400"
                        : "border-[var(--color-stone-200)] focus-within:border-[var(--brand-coral,#ff653f)]")
                    }
                  >
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      placeholder="20"
                      value={
                        raw === null || raw === undefined ? "" : String(raw)
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm({
                          ...form,
                          commission_rate: v === "" ? null : Number(v),
                        });
                      }}
                      className="
                        flex-1 min-w-0 !border-0 !shadow-none
                        bg-transparent px-3 py-2 text-sm
                        !text-[var(--color-stone-900)]
                        placeholder:!text-[var(--color-stone-400)]
                        focus:!ring-0 focus:!outline-none
                      "
                      aria-invalid={isInvalid}
                    />
                    <span
                      aria-hidden
                      className="px-3 text-[12px] tracking-wide text-[var(--color-stone-500)] select-none"
                    >
                      %
                    </span>
                  </div>
                  {isInvalid ? (
                    <p className="text-[11px] text-red-600">
                      0 ile 100 arasında bir değer girin.
                    </p>
                  ) : (
                    <p className="text-[11px] text-[var(--color-stone-400)]">
                      Bu mülkten alınacak komisyon oranı. Boş bırakılırsa 20
                      uygulanır.
                    </p>
                  )}
                </>
              );
            })()}
          </div>

          {/* 🛡️ FAZ 23 — T.C. Kültür ve Turizm Bakanlığı Belge No.
             Badge field'ı ile birebir aynı layout/pattern (md:col-span-3
             + max-w-md + Label + helper text). Service katmanı (Faz 22)
             zaten ham passthrough yapıyor; UI sadece binding ekler.
             Validation/sanitize/uppercase YAPILMAZ (kullanıcı kuralı). */}
          <div className="space-y-2">
            <Label>T.C. Kültür ve Turizm Bakanlığı Belge No</Label>
            <input
              type="text"
              placeholder="Örn: 07-3388"
              className="input max-w-md"
              value={form.tourism_document_number ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  tourism_document_number: e.target.value,
                })
              }
              autoComplete="off"
              spellCheck={false}
              aria-label="T.C. Kültür ve Turizm Bakanlığı işletme belge numarası"
            />
            <p className="text-[11px] text-[var(--color-stone-400)]">
              Varsa resmi turizm belge numarasını girin (opsiyonel).
            </p>
          </div>
        </div>
      </Section>

      {/* AÇIKLAMA — Adım 2 */}
      <Section
        eyebrow="Adım 2"
        title="Açıklama"
        subtitle="Mülkü detaylı ve etkileyici şekilde anlat"
      >
        <RichTextEditor
          value={form.description || ""}
          onChange={(html) => setForm({ ...form, description: html })}
        />
        <div className="flex justify-between text-xs text-[var(--color-stone-400)] mt-2">
          <span>
            Açıklaman ne kadar detaylı olursa dönüşüm o kadar artar.
          </span>
          <span>
            {(form.description || "").replace(/<[^>]*>/g, "").length} karakter
          </span>
        </div>
      </Section>

    </>
  );
}
