"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import Section from "./shared/Section";
import Label from "./shared/Label";
import DiscountCalendarCanvas from "./DiscountCalendarCanvas";

import {
  loadDiscountData,
  saveDiscountData,
  deleteDiscountData,
} from "@/app/components/admin/villa/discount.action";
/* 🛡️ CACHE INVALIDATION — public tarafta "İndirimli Kiralık Villalar"
   bölümünü besleyen getCachedDiscountCollectionVillas (lib/cache.helpers.ts)
   "discount" tag'i ile unstable_cache'lidir (revalidate: 600s TTL).
   saveDiscountData BAŞARILI olduğunda (ekleme/silme, ikisi de aynı
   replace-all RPC) bu tag'i AYRICA invalidate etmezsek, public kartlar
   TTL dolana kadar (en fazla 10 dk) eski veriyi göstermeye devam eder.
   Mevcut, zaten var olan fonksiyon reuse edilir — yeni bir cache/tag
   sistemi YOK. /maki-admin/discount-collection sayfasının kendi
   fireRevalidate() helper'ıyla AYNI fonksiyon, farklı bir call-site. */
import { revalidateDiscount } from "@/app/services/revalidate.actions";
/* 🛡️ SADECE UI gösterimi için — villa'nın fiyat para birimini okur
   (yeni sorgu YOK, pricing.action.ts'in loadPricingData'da zaten
   kullandığı repository metodunun ikinci call-site'ı). Gerçek
   enforcement server'da (saveDiscountData) AYRICA yapılır — bu
   değere GÜVENİLMEZ, yalnız kullanıcıya hangi currency'nin
   uygulanacağını göstermek için kullanılır. */
import { getVillaCurrency } from "@/app/components/admin/villa/pricing.action";
import type { VillaDiscountInput } from "@/lib/db/villa-discount.repository.server";
import type { VillaDiscountRow } from "@/types/database";

/* 🛡️ Yalnız gerekli iki saf helper reuse edilir (proje "TEK source-of-
   truth" kuralı — bkz. lib/date-format.ts doc-comment'i); pricing-calendar
   grid/drag motoru (PricingCalendarCanvas) BURADA TEKRAR KULLANILMAZ. */
import {
  formatLocalDate,
  parseLocalDate,
} from "@/app/components/admin/villa/pricing-calendar/_helpers/date-math";

/* ===============================================================
   🔥 DiscountsSection — Villa admin "İndirimler" UI
   ===============================================================
   villa_prices / PricingCalendarCanvas / price.engine.ts / rezervasyon
   / public fiyat gösteriminden TAMAMEN BAĞIMSIZ, izole bir katman:
     - Kendi state'i (bu component'in dışına HİÇ sızmaz — form/setForm
       parent wizard state'i buraya HİÇ verilmez).
     - Kendi server action'ları (discount.action.ts → villa_discounts).
     - Kendi tablosu (villa_discounts, migration 079).

   Henüz:
     - Public tarafta GÖSTERİLMİYOR.
     - Rezervasyon hesaplamasına ENTEGRE EDİLMİYOR.
   Bu component yalnız admin CRUD (listele/ekle/sil) sağlar.

   TARİH SEMANTİĞİ: villa_prices ile birebir aynı — [start_date,
   end_date] KAPALI interval (ikisi de dahil). Native `<input
   type="date">` kullanılır — PricingCalendarCanvas'ın drag-select
   grid'i (mouse/touch range seçimi) BURADA TEKRAR KULLANILMAZ; yalnız
   date-math.ts'in formatLocalDate/parseLocalDate helper'ları (gece
   sayısı gösterimi ve tarih normalize/karşılaştırma için) reuse edilir.
=============================================================== */

type DraftState = {
  start_date: string;
  end_date: string;
  discount_type: "percent" | "fixed";
  discount_value: string;
};

const EMPTY_DRAFT: DraftState = {
  start_date: "",
  end_date: "",
  discount_type: "percent",
  discount_value: "",
};

function formatDiscountValue(row: VillaDiscountRow): string {
  const value = Number(row.discount_value) || 0;
  if (row.discount_type === "percent") {
    return `%${value}`;
  }
  /* 🛡️ SEMANTİK DÜZELTME — bu değer bir "indirim tutarı" DEĞİL, o tarih
     aralığındaki HER GECENİN doğrudan NİHAİ ÖZEL FİYATIdır (normal
     fiyattan düşülmez, onun YERİNE geçer). "/gece" eki HER GECEYE ayrı
     ayrı uygulandığını netleştirir — admin bunu "aralığın tamamı için
     tek seferlik bir tutar" sanmasın. Yalnız gösterim metni —
     hesaplama/DB/parametre DEĞİŞMEDİ. */
  return `${value} ${row.currency || ""} / gece`.trim();
}

/** Kapalı interval gece sayısı: [start, end] ikisi de dahil. */
function nightsInclusive(start: string, end: string): number {
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

/** İki kapalı aralık ([]) çakışıyor mu? DB EXCLUDE constraint'i ile
 *  aynı semantik (daterange(..., '[]') && ) — yalnız hızlı/anlaşılır
 *  ön-kontrol; kesin doğrulama sunucuda (EXCLUDE constraint). */
function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export default function DiscountsSection({ villaId }: { villaId: string }) {
  const [discounts, setDiscounts] = useState<VillaDiscountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listError, setListError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  /* 🛡️ Fixed özel fiyat artık manuel currency seçtirmiyor — villa'nın
     kendi fiyat para birimi otomatik kullanılır (bkz. dosya başı importu).
     null = henüz yüklenmedi VEYA villa'da currency yok (fixed indirim
     eklemeyi engelleyen guard, bkz. handleAdd). */
  const [villaCurrency, setVillaCurrency] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ discounts: rows, error }, currency] = await Promise.all([
        loadDiscountData(villaId),
        getVillaCurrency(villaId),
      ]);
      if (cancelled) return;
      setDiscounts(rows);
      setListError(error || "");
      setVillaCurrency(currency);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [villaId]);

  const toInput = (row: VillaDiscountRow): VillaDiscountInput => ({
    start_date: row.start_date,
    end_date: row.end_date,
    discount_type: row.discount_type,
    discount_value: Number(row.discount_value) || 0,
    currency: row.currency,
  });

  const resetForm = () => {
    setDraft(EMPTY_DRAFT);
    setFormError("");
    setFormOpen(false);
  };

  const refresh = async () => {
    const { discounts: rows, error } = await loadDiscountData(villaId);
    setDiscounts(rows);
    setListError(error || "");
  };

  const handleAdd = async () => {
    setFormError("");

    if (!draft.start_date || !draft.end_date) {
      setFormError("Başlangıç ve bitiş tarihi seçmelisin.");
      return;
    }
    if (draft.start_date > draft.end_date) {
      setFormError("Bitiş tarihi, başlangıç tarihinden önce olamaz.");
      return;
    }
    const value = Number(draft.discount_value);
    if (!Number.isFinite(value) || value <= 0) {
      setFormError(
        draft.discount_type === "percent"
          ? "Geçerli bir indirim oranı gir."
          : "Geçerli bir gecelik özel fiyat gir."
      );
      return;
    }
    if (draft.discount_type === "percent" && value > 100) {
      setFormError("Yüzde indirim 100'den büyük olamaz.");
      return;
    }
    if (draft.discount_type === "fixed" && !villaCurrency) {
      setFormError(
        "Mülk için bir fiyat para birimi belirlenmemiş; önce Fiyatlar bölümünden bir fiyat gir."
      );
      return;
    }

    // Hızlı/anlaşılır ön-kontrol — kesin doğrulama sunucuda (EXCLUDE constraint).
    const overlapping = discounts.some((d) =>
      rangesOverlap(draft.start_date, draft.end_date, d.start_date, d.end_date)
    );
    if (overlapping) {
      setFormError(
        "Seçilen tarih aralığı, mevcut bir indirimle çakışıyor. Lütfen farklı bir tarih aralığı seç."
      );
      return;
    }

    const newInput: VillaDiscountInput = {
      start_date: draft.start_date,
      end_date: draft.end_date,
      discount_type: draft.discount_type,
      discount_value: value,
      currency: draft.discount_type === "fixed" ? villaCurrency : null,
    };

    const payload = [...discounts.map(toInput), newInput];

    setSaving(true);
    const res = await saveDiscountData(villaId, payload);
    setSaving(false);

    if (!res.ok) {
      setFormError(res.error);
      return;
    }

    // 🛡️ Save başarılı — public villa kartı cache'ini invalidate et
    // (bkz. dosya başı importu). Save başarısız olsaydı buraya hiç
    // gelinmezdi (üstteki early return). revalidateTag kendisi hata
    // fırlatmaz ("use server" action), ama .catch ile savunmacı —
    // ekranda görünen refresh()/resetForm() akışını asla bloklamaz.
    await revalidateDiscount().catch(() => {});
    await refresh();
    resetForm();
  };

  const handleDelete = async (target: VillaDiscountRow) => {
    const ok = window.confirm(
      `${formatLocalDate(parseLocalDate(target.start_date))} - ${formatLocalDate(
        parseLocalDate(target.end_date)
      )} tarih aralığındaki indirim silinsin mi?`
    );
    if (!ok) return;

    /* 🛡️ ARTIK saveDiscountData/replace-all'dan GEÇMİYOR — doğrudan
       tek-kayıt DELETE (discount.action.ts > deleteDiscountData).
       currency enforcement / villa.currency / villa_prices okuması HİÇ
       devreye girmez (villanın fiyat verisi eksik olsa bile silme
       çalışır). `remaining`/`toInput` listesi artık burada gerekmiyor —
       `toInput` yalnız handleAdd'de (ekleme payload'ı) kullanılmaya
       devam ediyor. */
    setSaving(true);
    setListError("");
    const res = await deleteDiscountData(villaId, target.id);
    setSaving(false);

    if (!res.ok) {
      setListError(res.error);
      return;
    }

    // 🛡️ Silme başarılı — public villa kartı cache'ini invalidate et.
    await revalidateDiscount().catch(() => {});
    await refresh();
  };

  return (
    <Section
      eyebrow="Bağımsız Katman"
      title="İndirimler"
      subtitle="Belirli tarih aralıkları için gecelik fiyata yüzde indirim uygula veya doğrudan bir gecelik özel fiyat belirle. Normal fiyat sistemini etkilemez."
    >
      {loading ? (
        <div className="py-8 text-center text-[var(--color-stone-500)]">
          <Loader2 size={16} className="animate-spin inline mr-2 -mt-0.5" />
          İndirimler yükleniyor…
        </div>
      ) : (
        <>
          {listError && (
            <p className="text-xs text-red-500 mb-3">{listError}</p>
          )}

          {discounts.length === 0 ? (
            <p className="text-sm text-[var(--color-stone-500)] mb-4">
              Henüz bir indirim tanımlanmadı.
            </p>
          ) : (
            <ul className="space-y-2 mb-4">
              {discounts.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-stone-200)] bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-stone-900)]">
                      {formatLocalDate(parseLocalDate(d.start_date))} →{" "}
                      {formatLocalDate(parseLocalDate(d.end_date))}
                      <span className="text-[var(--color-stone-400)] font-normal ml-2">
                        ({nightsInclusive(d.start_date, d.end_date)} gece)
                      </span>
                    </p>
                    <p className="text-xs text-[var(--color-stone-500)] mt-0.5">
                      {d.discount_type === "percent"
                        ? "Yüzde indirim"
                        : "Gecelik özel fiyat"}
                      {" — "}
                      {formatDiscountValue(d)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(d)}
                    disabled={saving}
                    aria-label="İndirimi sil"
                    className="admin-icon-btn shrink-0 text-rose-600 disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {formOpen ? (
            <div className="rounded-2xl border border-[var(--color-stone-200)] bg-[var(--color-sand-50)] p-4 space-y-3">
              <div className="space-y-2">
                <Label>Tarih aralığı</Label>
                {/* 🛡️ Native <input type="date"> KALDIRILDI — Fiyatlar
                    bölümündeki PricingCalendarCanvas'ın ay-grid + mouse
                    drag + mobil tap-to-range deneyimiyle AYNI HİSSİ veren
                    ayrı, izole bir takvim (DiscountCalendarCanvas). Kendi
                    state'i var; PricingCalendarCanvas'ın kendisi burada
                    İKİNCİ KEZ MOUNT EDİLMEDİ, yalnız onun saf/sunum
                    parçaları (PricingCalendarNav/MonthBlock/DayCell,
                    date-math.ts) değiştirilmeden reuse edildi. */}
                <DiscountCalendarCanvas
                  value={
                    draft.start_date && draft.end_date
                      ? { start_date: draft.start_date, end_date: draft.end_date }
                      : null
                  }
                  onChange={(range) =>
                    setDraft({
                      ...draft,
                      start_date: range.start_date,
                      end_date: range.end_date,
                    })
                  }
                  villaId={villaId}
                />
                {draft.start_date && draft.end_date && (
                  <p className="text-xs text-[var(--color-stone-500)]">
                    Seçili aralık:{" "}
                    {formatLocalDate(parseLocalDate(draft.start_date))} →{" "}
                    {formatLocalDate(parseLocalDate(draft.end_date))} (
                    {nightsInclusive(draft.start_date, draft.end_date)} gece)
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>İndirim türü</Label>
                  <select
                    className="input"
                    value={draft.discount_type}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        discount_type: e.target.value as "percent" | "fixed",
                      })
                    }
                  >
                    <option value="percent">Yüzde İndirim (%)</option>
                    <option value="fixed">Gecelik Özel Fiyat</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>
                    {draft.discount_type === "percent"
                      ? "Yüzde İndirim (%)"
                      : "Gecelik Özel Fiyat"}
                  </Label>
                  {draft.discount_type === "fixed" ? (
                    <div className="space-y-1">
                      <div className="grid grid-cols-[1fr_88px] gap-1.5">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="örn: 5000"
                          className="input !px-2"
                          value={draft.discount_value}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              discount_value: e.target.value,
                            })
                          }
                        />
                        {/* 🛡️ Para birimi artık MANUEL SEÇİLEMEZ — villa'nın
                            kendi fiyat para birimi otomatik uygulanır (server
                            tarafında da AYRICA zorunlu kılınır, bkz.
                            discount.action.ts → saveDiscountData). Salt-okunur
                            gösterim; <select> DEĞİL. */}
                        <div
                          className="input !pl-2 text-xs flex items-center justify-center bg-[var(--color-stone-100)] text-[var(--color-stone-500)] cursor-not-allowed select-none"
                          title="Para birimi mülkün fiyatlandırmasından otomatik alınır"
                        >
                          {villaCurrency || "—"}
                        </div>
                      </div>
                      <p className="text-[11px] text-[var(--color-stone-400)]">
                        Para birimi villanın fiyat para biriminden ({villaCurrency || "—"}) otomatik alınır, değiştirilemez.
                      </p>
                    </div>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      placeholder="örn: 20"
                      className="input"
                      value={draft.discount_value}
                      onChange={(e) =>
                        setDraft({ ...draft, discount_value: e.target.value })
                      }
                    />
                  )}
                </div>
              </div>

              {formError && (
                <p className="text-xs text-red-500">{formError}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={saving}
                  className="btn-primary disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Kaydediliyor…
                    </>
                  ) : (
                    "Kaydet"
                  )}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="px-3 py-2 rounded-xl text-sm font-medium text-[var(--color-stone-500)] hover:text-[var(--color-stone-700)] transition"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-[var(--color-stone-200)] text-[var(--color-stone-700)] bg-white hover:bg-[var(--color-sand-50)] transition"
            >
              <Plus size={14} />
              İndirim Ekle
            </button>
          )}
        </>
      )}
    </Section>
  );
}
