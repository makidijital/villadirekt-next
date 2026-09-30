/* ===============================================================
   📦 Reservation Detail — MisafirBilgisiCard (presentational wrapper)
   ===============================================================
   🛡️ UI/yerleşim turu — Bu component ESKİ 3 ayrı karti TEK, yalnızca
   wizard'ın 1. adımında (currentStep === 1) görünen "Misafir Bilgisi"
   kartında birleştirir:
     - PersonalInfoCard.tsx ("Kişisel bilgiler": Ad Soyad/Telefon/
       E-posta/TC-Pasaport)
     - LocationCard.tsx ("Konum bilgisi": Şehir/Ülke/Adres)
     - GuestsCard.tsx ("Misafir bilgisi": Toplam misafir + Diğer
       misafirler) — önceden ayrı bir 3. sekmede (currentStep === 3)
       gösteriliyordu; DÜZELTME turunda buraya taşındı, 3. sekme
       kaldırıldı.

   ⚠️ SIFIR LOGIC DEĞİŞİKLİĞİ:
     - Alan listesi (name/phone/email/identity_number/city/country/
       address/guests/guestNames) yukarıdaki 3 karttan BİREBİR aynı
       şekilde kopyalandı — hiçbir alan eklenmedi/çıkarılmadı.
     - onChange handler'ları (setData functional update, setGuestNames)
       BİREBİR AYNI.
     - city/country select'lerin "önce ülke seç" disabled davranışı
       ve seçenek sırası LocationCard.tsx'teki mevcut JSX sırasıyla
       AYNI korundu.
     - guestNames.map + "Misafir {i+2} Ad Soyad" placeholder deseni
       GuestsCard.tsx ile BİREBİR AYNI.
     - Veri kaynağı (data/setData, countryOptions/cityOptions,
       guestNames/setGuestNames — page.tsx'teki mevcut state/
       useMemo'lardan gelir) DEĞİŞMEDİ.

   Bu component YALNIZCA page.tsx'te {currentStep === 1 && (...)}
   koşulu içinde render edilmelidir — her sekmede görünmez.

   Tasarım: Section wrapper (= "Fiyat bilgisi" kartıyla AYNI beyaz
   card-premium, border/shadow/radius) + 2 sütunlu kompakt grid
   (mobilde 1 sütuna düşer — grid-cols-1 md:grid-cols-2).
=============================================================== */

import { getCountryLabel } from "@/lib/country.helper";
import Section from "./Section";
import Label from "./Label";

export default function MisafirBilgisiCard({
  data,
  setData,
  countryOptions,
  cityOptions,
  guestNames,
  setGuestNames,
}: {
  data: Record<string, any>;
  setData: (updater: (prev: any) => any) => void;
  countryOptions: ReadonlyArray<{ isoCode: string; name: string }>;
  cityOptions: ReadonlyArray<{ isoCode: string; name: string }>;
  guestNames: string[];
  setGuestNames: (next: string[]) => void;
}) {
  return (
    <Section
      eyebrow="Bilgiler"
      title="Misafir Bilgisi"
      subtitle="İletişim, kimlik, konum ve misafir bilgileri"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* PersonalInfoCard.tsx ile BİREBİR AYNI alanlar/handler. */}
        {[
          { key: "name", label: "Ad Soyad" },
          { key: "phone", label: "Telefon" },
          /* 🛡️ Migration 094 — ikinci telefon. Admin tarafında OPSİYONEL:
             eski kayıtlarda boş kalır, düzenleme engellenmez. */
          { key: "phone2", label: "Telefon 2" },
          { key: "email", label: "E-posta" },
          { key: "identity_number", label: "TC / Pasaport" },
        ].map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label>{field.label}</Label>
            <input
              value={data[field.key] || ""}
              onChange={(e) =>
                setData((prev) => ({
                  ...prev,
                  [field.key]: e.target.value,
                }))
              }
              className="input"
            />
          </div>
        ))}

        {/* LocationCard.tsx ile BİREBİR AYNI alanlar/handler/sıra
            (şehir select'i ülke seçilene kadar disabled — mevcut
            davranış korunuyor). */}
        <div className="space-y-1.5">
          <Label>Şehir</Label>
          <select
            value={data.city || ""}
            onChange={(e) =>
              setData((prev) => ({ ...prev, city: e.target.value }))
            }
            disabled={!data.country}
            className="input disabled:opacity-60"
          >
            <option value="">
              {data.country ? "Şehir seç" : "Önce ülke seç"}
            </option>
            {cityOptions.map((c) => (
              <option key={c.isoCode} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>Ülke</Label>
          <select
            value={data.country || ""}
            onChange={(e) => {
              const next = e.target.value;
              setData((prev) => ({ ...prev, country: next, city: "" }));
            }}
            className="input"
          >
            <option value="">Ülke seç</option>
            {countryOptions.map((c) => (
              <option key={c.isoCode} value={c.isoCode}>
                {getCountryLabel(c.isoCode)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label>Adres</Label>
          <input
            placeholder="Adres"
            value={data.address || ""}
            onChange={(e) =>
              setData((prev) => ({ ...prev, address: e.target.value }))
            }
            className="input"
          />
        </div>
      </div>

      {/* GuestsCard.tsx ile BİREBİR AYNI: toplam misafir sayısı.
          setData functional update DEĞİŞMEDİ. */}
      <div className="space-y-1.5 mt-4">
        <Label>Toplam misafir</Label>
        <input
          type="number"
          value={data.guests || 1}
          onChange={(e) =>
            /* 🛡️ FUNCTIONAL UPDATE (Faz 3A): guests recompute
               guestNames sync useEffect'iyle eşzamanlı; race
               sırasında prev üzerinden update edildiğinde
               guests sayısı kaybolmaz. */
            setData((prev) => ({
              ...prev,
              guests: Math.max(Number(e.target.value) || 0, 0),
            }))
          }
          className="input"
          min={1}
        />
      </div>

      {/* GuestsCard.tsx ile BİREBİR AYNI: ek misafir isimleri. */}
      {guestNames.length > 0 && (
        <div className="space-y-2 mt-4">
          <p className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)]">
            Diğer misafirler
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {guestNames.map((g: string, i: number) => (
              <input
                key={i}
                value={g}
                placeholder={`Misafir ${i + 2} Ad Soyad`}
                onChange={(e) => {
                  const updated = [...guestNames];
                  updated[i] = e.target.value;
                  setGuestNames(updated);
                }}
                className="input"
              />
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
