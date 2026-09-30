/* ===============================================================
   📦 Reservation Detail — LocationCard (Adım 1: Şehir / Ülke / Adres)
   ===============================================================
   FAZ 2 refactor: JSX byte-identical _components/'a taşındı.
   country-state-city + getCountryLabel helper logic page.tsx'te;
   countryOptions / cityOptions useMemo derivations prop olarak gelir.
=============================================================== */

import { getCountryLabel } from "@/lib/country.helper";

import Section from "./Section";

export default function LocationCard({
  data,
  setData,
  countryOptions,
  cityOptions,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setData: (updater: (prev: any) => any) => void;
  countryOptions: ReadonlyArray<{ isoCode: string; name: string }>;
  cityOptions: ReadonlyArray<{ isoCode: string; name: string }>;
}) {
  return (
    <Section
      eyebrow="Konum"
      title="Konum bilgisi"
      subtitle="Şehir, ülke, adres"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 🌍 Şehir — dinamik select. Manuel rezervasyon LocationStep
            pattern'i ile birebir: ülkeye bağlı option list, country
            boşken disabled + "Önce ülke seç" placeholder. Option
            value = city name (mevcut payload contract: data.city
            string olarak akar). */}
        <select
          value={data.city || ""}
          /* 🛡️ FUNCTIONAL UPDATE (Faz 3A): stale closure fix */
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
        {/* 🌍 Ülke — TR-first select. Display label getCountryLabel
            ile TR → "Türkiye"; option value ISO code (data.country
            hâlâ "TR" akar). Country değişince city otomatik resetlenir
            — frontend handleCountryChange ile aynı kontrat. */}
        <select
          value={data.country || ""}
          /* 🛡️ FUNCTIONAL UPDATE (Faz 3A) */
          onChange={(e) => {
            const next = e.target.value;
            setData((prev) => ({
              ...prev,
              country: next,
              city: "",
            }));
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
        <input
          placeholder="Adres"
          value={data.address || ""}
          /* 🛡️ FUNCTIONAL UPDATE (Faz 3A) */
          onChange={(e) =>
            setData((prev) => ({ ...prev, address: e.target.value }))
          }
          className="input"
        />
      </div>
    </Section>
  );
}
