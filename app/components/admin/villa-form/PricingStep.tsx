import { useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";

import Section from "./shared/Section";
import Label from "./shared/Label";
import DiscountsSection from "./DiscountsSection";

import type { VillaFormShape, VillaFormSetter } from "./types";

/* 🛡️ Migration 076 — sezonluk ay kısıtı. 12 ayın sabit listesi
   (1=Ocak...12=Aralık) — admin'in "yeni ay ekle" diye bir CRUD
   ihtiyacı yok, bu yüzden module-level sabit yeterli (relation
   tablosu/master-liste deseni İLE KARIŞTIRILMASIN). */
const POOL_HEATING_MONTHS = [
  { value: 1, label: "Ocak" },
  { value: 2, label: "Şubat" },
  { value: 3, label: "Mart" },
  { value: 4, label: "Nisan" },
  { value: 5, label: "Mayıs" },
  { value: 6, label: "Haziran" },
  { value: 7, label: "Temmuz" },
  { value: 8, label: "Ağustos" },
  { value: 9, label: "Eylül" },
  { value: 10, label: "Ekim" },
  { value: 11, label: "Kasım" },
  { value: 12, label: "Aralık" },
] as const;

const ALL_POOL_HEATING_MONTHS = POOL_HEATING_MONTHS.map((m) => m.value);

/* ===============================================================
   🔥 PricingStep — Wizard Adım 4 (Step 4).
   - Üst kısım: PricingCalendarCanvas (slot olarak prop)
   - Alt: Adım 9 → Ekstra ücretler (depozito, temizlik, custom prepayment)

   PricingCanvasSlot prop'u: page tarafında PricingCalendarCanvas
   render edilip slot olarak verilir; component buraya dokunmaz,
   sadece konumlandırır. Logic ve state akışı aynen korunur.

   showCleaningCurrency: edit page'de cleaning_currency dropdown'u
   gösterilir; create page'de henüz yok (default true → edit page
   davranışı; create page bu component'i adopt ederken false geçirir).
   =============================================================== */

export default function PricingStep({
  pricingCanvasSlot,
  form,
  setForm,
  showCleaningCurrency = true,
  villaId,
}: {
  pricingCanvasSlot: ReactNode;
  form: VillaFormShape;
  setForm: VillaFormSetter;
  showCleaningCurrency?: boolean;
  /* 🛡️ İNDİRİMLER (villa_discounts) — TAMAMEN AYRI, İZOLE KATMAN.
     villaId verilirse (EDIT mode) DiscountsSection render edilir;
     CREATE mode'da (villaId YOK — villa henüz DB'de yok, FK zorunlu)
     hiç render edilmez, form/prices state'ine DOKUNMAZ. Optional
     olduğu için mevcut TÜM PricingStep çağıranları (ekle sayfası)
     DEĞİŞMEDEN aynı davranışta kalır. */
  villaId?: string;
}) {
  /* 🛡️ Migration 076 — sezonluk ay kısıtı. Panel açık/kapalı state'i
     yalnız UI'da yaşar (form/DB'ye YAZILMAZ) — kapalı durumda formun
     yüksekliğini büyütmemesi için conditional render burada kontrol
     edilir. `activeMonths`: form.pool_heating_months NULL/undefined
     ise TÜM 12 ay "aktif" gösterilir (migration 076'nın NULL =
     "kısıtlama yok" semantiği; DB'ye bu görüntüleme YÜZÜNDEN NULL
     dışında bir değer YAZILMAZ — admin panele hiç dokunmazsa form
     state DEĞİŞMEZ). */
  const [poolHeatingMonthsOpen, setPoolHeatingMonthsOpen] = useState(false);

  const activeMonths =
    form.pool_heating_months == null
      ? ALL_POOL_HEATING_MONTHS
      : form.pool_heating_months;

  const togglePoolHeatingMonth = (month: number) => {
    const next = activeMonths.includes(month)
      ? activeMonths.filter((m) => m !== month)
      : [...activeMonths, month].sort((a, b) => a - b);
    setForm({ ...form, pool_heating_months: next });
  };

  const selectAllPoolHeatingMonths = () => {
    setForm({ ...form, pool_heating_months: null });
  };

  const clearAllPoolHeatingMonths = () => {
    setForm({ ...form, pool_heating_months: [] });
  };

  return (
    <>
      {/* PRICING CANVAS (slot) */}
      {pricingCanvasSlot}

      {/* 🛡️ İNDİRİMLER — villa_prices/PricingCalendarCanvas'tan TAMAMEN
          BAĞIMSIZ, izole bir Section (kendi state'i, kendi server
          action'ları, kendi tablosu — villa_discounts). Yalnız EDIT
          mode'da (villaId mevcutken) gösterilir. */}
      {villaId && <DiscountsSection villaId={villaId} />}

      {/* EXTRA FEES — Adım 9 */}
      <Section
        eyebrow="Adım 9"
        title="Ekstra ücretler"
        subtitle="Ek maliyetleri belirle"
      >
        {/* 🛡️ UI turu — Depozito/Temizlik ücreti/Temizlik sınırı/Özel Ön
            Ödeme/Havuz Isıtma Ücreti artık TEK 5-kolonlu satırda
            (md:grid-cols-5, önceden 2 ayrı 4-col grid'e bölünmüştü).
            Alan/state/handler/payload/normalizer/hesaplama mantığı
            BİREBİR AYNI — yalnız JSX/className değişti. Input+currency
            alt-grid'lerinde (Temizlik ücreti, Havuz Isıtma Ücreti) sabit
            kolon genişliği 120px → 88px, gap 2 → 1.5 ve para birimi
            select'inde küçük font (text-xs) + azaltılmış sol padding
            (!pl-2) ile 5 kolona sığacak şekilde kompaktlaştırıldı —
            sağ padding (chevron ikonu için) DEĞİŞMEDİ. Mobilde
            (< md) grid-cols-1 korunduğu için mevcut tek-sütun davranış
            AYNEN devam eder. */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-2">
            <Label>Depozito</Label>
            <input
              type="number"
              placeholder="₺"
              className="input"
              value={form.deposit || ""}
              onChange={(e) =>
                setForm({ ...form, deposit: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Temizlik ücreti</Label>

            {showCleaningCurrency ? (
              <div className="grid grid-cols-[1fr_88px] gap-1.5">
                <input
                  type="number"
                  placeholder="Ücret"
                  className="input !px-2"
                  value={form.cleaning_fee || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cleaning_fee: Number(e.target.value),
                    })
                  }
                />

                <select
                  value={form.cleaning_currency || "TRY"}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cleaning_currency: e.target.value,
                    })
                  }
                  className="input !pl-2 text-xs"
                >
                  <option value="TRY">₺ TRY</option>
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                  <option value="GBP">£ GBP</option>
                </select>
              </div>
            ) : (
              <input
                type="number"
                placeholder="₺"
                className="input"
                value={form.cleaning_fee || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    cleaning_fee: Number(e.target.value),
                  })
                }
              />
            )}
          </div>
          <div className="space-y-2">
            <Label>Temizlik sınırı</Label>
            <input
              type="number"
              placeholder="örn: 7 gece"
              className="input"
              value={form.cleaning_limit || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  cleaning_limit: Number(e.target.value),
                })
              }
            />
          </div>

          {/* 🔥 CUSTOM PREPAYMENT RATE — villa-level override.
              Artık 5-col grid içinde; diğer alanlarla vertical
              alignment'ta. Hint metni grid hücresinin altında, taşma
              yapmadan wrap olur (grid row height otomatik uyum sağlar). */}
          <div className="space-y-2">
            <Label>Özel Ön Ödeme Oranı (%)</Label>
            <input
              type="number"
              min={0}
              max={100}
              placeholder="örn: 30"
              className="input"
              value={form.custom_prepayment_rate ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  custom_prepayment_rate: e.target.value,
                })
              }
            />
            <p className="text-[11px] text-[var(--color-stone-400)]">
              Boş bırakılırsa genel ayarlardaki oran kullanılır.
            </p>
          </div>

          {/* 🛡️ HAVUZ ISITMA ÜCRETİ — 3. adım (admin form hazırlığı,
              hesaplama YOK). Metin standardizasyonu: "Havuz Isıtma" →
              "Havuz Isıtma Ücreti" (yalnız görünen başlık — form.
              pool_heating_fee/pool_heating_currency alan adları, state,
              handler, hesaplama DEĞİŞMEDİ). Artık Depozito/Temizlik/Özel
              Ön Ödeme ile AYNI 5-kolonlu satırda (önceden ayrı bir 4-col
              grid'de tek başınaydı). Temizlik ücreti ile BİREBİR AYNI
              pattern: gecelik ücret input + currency dropdown
              (showCleaningCurrency ile ilişkilendirilmedi; her iki
              sayfada da (ekle/[id]) showCleaningCurrency default true
              kullanıldığı için mevcut davranışta zaten her zaman
              gösteriliyor — burada da koşulsuz gösterilir).
              NULL veya 0 → villa havuz ısıtma hizmeti SUNMUYOR kabul
              edilir (migration 074 semantiği). Girilen değer TOPLAM
              DEĞİL, GECELİK ücrettir — hesaplama (nights × fee) bu
              adımda YAPILMAZ (price.engine.ts 2. adımda zaten hazır). */}
          <div className="space-y-2">
            <Label>Havuz Isıtma Ücreti</Label>
            <div className="grid grid-cols-[1fr_88px] gap-1.5">
              <input
                type="number"
                placeholder="Gecelik ücret"
                className="input !px-2"
                value={form.pool_heating_fee ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    pool_heating_fee: e.target.value,
                  })
                }
              />

              <select
                value={form.pool_heating_currency || "TRY"}
                onChange={(e) =>
                  setForm({
                    ...form,
                    pool_heating_currency: e.target.value,
                  })
                }
                className="input !pl-2 text-xs"
              >
                <option value="TRY">₺ TRY</option>
                <option value="USD">$ USD</option>
                <option value="EUR">€ EUR</option>
                <option value="GBP">£ GBP</option>
              </select>
            </div>
            <p className="text-[11px] text-[var(--color-stone-400)]">
              Gece başına ücret. Boş bırakılırsa havuz ısıtma hizmeti
              sunulmuyor kabul edilir.
            </p>

            {/* 🛡️ Migration 076 — SEZONLUK AY KISITI (İLK KULLANIM).
                Kapalıyken yalnız TEK SATIR (buton) — form yüksekliği
                büyümez. "Havuz Isıtma Ücreti" hücresinin İÇİNDE,
                mevcut 5 kolonlu grid'i (md:grid-cols-5) BOZMADAN.
                DB'ye YAZMA yalnız admin bu paneli AÇIP bir aya
                dokunduğunda gerçekleşir (bkz. togglePoolHeatingMonth) —
                panel hiç açılmazsa form.pool_heating_months state'i
                (dolayısıyla payload) DEĞİŞMEZ. */}
            <div className="mt-2">
              <button
                type="button"
                onClick={() =>
                  setPoolHeatingMonthsOpen((prev) => !prev)
                }
                className="w-full flex items-center justify-between gap-2 text-left"
              >
                <span className="text-[10.5px] tracking-[0.1em] uppercase font-semibold text-[var(--color-stone-500)]">
                  Isıtma Uygulanan Aylar
                </span>
                <span className="flex items-center gap-1 text-[11px] font-medium text-[#0973BA] shrink-0">
                  {poolHeatingMonthsOpen ? "Gizle" : "Ayları Göster"}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${
                      poolHeatingMonthsOpen ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </button>

              {poolHeatingMonthsOpen && (
                <div className="mt-2 rounded-lg border border-[var(--color-stone-200)] bg-[var(--color-stone-50)] p-2.5 space-y-2">
                  <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
                    {POOL_HEATING_MONTHS.map((month) => (
                      <label
                        key={month.value}
                        className="flex items-center gap-1.5 text-[11px] text-[var(--color-stone-700)] cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={activeMonths.includes(month.value)}
                          onChange={() =>
                            togglePoolHeatingMonth(month.value)
                          }
                          className="h-3.5 w-3.5 rounded border-[var(--color-stone-300)] accent-[#ED7926]"
                        />
                        {month.label}
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1.5 border-t border-[var(--color-stone-200)]">
                    <button
                      type="button"
                      onClick={selectAllPoolHeatingMonths}
                      className="text-[10px] font-semibold uppercase tracking-wide text-[#0973BA]"
                    >
                      Tümünü Seç
                    </button>
                    <span className="text-[var(--color-stone-300)]">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={clearAllPoolHeatingMonths}
                      className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-stone-500)]"
                    >
                      Tümünü Kaldır
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="text-xs text-[var(--color-stone-400)] mt-3">
          Temizlik ücreti, belirlenen gece sayısının altındaki
          rezervasyonlarda uygulanır.
        </p>

        {/* ═══════════════════════════════════════════════════════
            🛡️ FAZ 26C — MİNİMUM KONAKLAMA
            ═══════════════════════════════════════════════════════
            Premium luxury kart; "Ekstra ücretler" Section'ı içinde,
            mevcut 3-col grid'in altında ayrı bir blok.

            Reservation/policy davranışı — pool/map/general info
            ile aynı kategori değil; ekstra ücretler ile aynı kart
            grubunda.

            STATE: form.minimum_stay_nights (number | null)
            NORMALIZE onChange:
              - "" → null  (boş = enforcement yok)
              - NaN / <=0 → null
              - >=1 → Math.floor(Math.max(1, n))
            UI: number input + "Gece" suffix
            FRONTEND ENFORCEMENT: BookingSidebar (Faz 26B).
            ═══════════════════════════════════════════════════════ */}
        <div
          className="
            mt-5 rounded-2xl border border-[var(--color-stone-200)]
            bg-white px-4 py-4 md:px-5 md:py-5
            hover:border-[var(--color-champagne-300)]
            transition-colors motion-reduce:transition-none
          "
        >
          <div className="flex items-center gap-4 flex-wrap">
            <span
              className="
                w-10 h-10 shrink-0 rounded-xl
                bg-[var(--color-sand-50)]
                border border-[var(--color-stone-100)]
                flex items-center justify-center
                text-[var(--color-champagne-600)]
              "
              aria-hidden
            >
              <CalendarDays size={17} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-500)]">
                Minimum Konaklama
              </p>
              <p className="font-display text-[15px] md:text-[16px] text-[var(--color-stone-900)] mt-0.5 tracking-[-0.01em]">
                Minimum gece sayısı
              </p>
              <p className="text-[11.5px] text-[var(--color-stone-500)] mt-1 leading-snug">
                Misafirin seçebileceği minimum konaklama süresi.
                Boş bırakırsan sınırlama uygulanmaz.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                placeholder="3"
                aria-label="Minimum gece sayısı"
                className="input !w-20 text-center tabular-nums"
                value={
                  form.minimum_stay_nights === null ||
                  form.minimum_stay_nights === undefined
                    ? ""
                    : String(form.minimum_stay_nights)
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setForm({ ...form, minimum_stay_nights: null });
                    return;
                  }
                  const n = Number(raw);
                  if (!Number.isFinite(n) || n <= 0) {
                    setForm({ ...form, minimum_stay_nights: null });
                    return;
                  }
                  setForm({
                    ...form,
                    minimum_stay_nights: Math.max(1, Math.floor(n)),
                  });
                }}
              />
              <span className="text-[12px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)]">
                Gece
              </span>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
