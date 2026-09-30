import { useMemo } from "react";
import { Country, State } from "country-state-city";

import { getCountryLabel } from "@/lib/country.helper";

import Section from "@/app/components/admin/villa-form/shared/Section";

import type {
  ReservationFormShape,
  ReservationFormSetter,
  ReservationFormErrors,
} from "./types";

/* ===============================================================
   🔥 LocationStep — Wizard Adım 2.
   Şehir / Ülke / Adres alanları. Pure presentational.

   "Ülke" ve "Şehir" alanları text input'tan select dropdown'a
   yükseltildi — frontend ReservationForm ile birebir aynı pattern:
     - Ülke: country-state-city `Country.getAllCountries()` listesi
              TR-first sort + `getCountryLabel(iso)` display override
     - Şehir: `State.getStatesOfCountry(country)` ile ülkeye bağlı
              dinamik liste. Country değişince city otomatik resetlenir.
              Country boşken disabled + farklı placeholder text.

   ZERO-IMPACT CONTRACT:
     ❌ DB payload, ISO code akışı, validation, form shape, country
        helper internals, reservation logic → DOKUNULMAZ.
     ✅ Sadece UI input tipi (text → select) + reactive city sync.
   =============================================================== */

export default function LocationStep({
  data,
  setData,
  errors,
}: {
  data: ReservationFormShape;
  setData: ReservationFormSetter;
  errors: ReservationFormErrors;
}) {
  /* TR-first sort — frontend ReservationForm ile birebir pattern.
     useMemo: liste mount'ta bir kez türetilir. */
  const countries = useMemo(() => {
    const all = Country.getAllCountries();
    return [
      ...all.filter((c) => c.isoCode === "TR"),
      ...all.filter((c) => c.isoCode !== "TR"),
    ];
  }, []);

  /* Şehir listesi data.country'ye reactive — country-state-city
     `State.getStatesOfCountry()`. Country boş ise boş liste; select
     disabled hale gelir. Frontend handleCountryChange ile aynı
     kontrat (kütüphane çağrısı aynı imza). */
  const cities = useMemo(() => {
    if (!data.country) return [];
    return State.getStatesOfCountry(data.country);
  }, [data.country]);

  return (
    <Section
      eyebrow="Adım 1"
      title="Konum bilgisi"
      subtitle="Fatura ve doğrulama için"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1">
          {/* 🌍 Ülkeye bağlı select. Frontend ReservationForm ile
              birebir aynı davranış: country boşken disabled +
              "Önce ülke seç" placeholder; country seçilince
              ülkenin state list'i + "Şehir seç" placeholder. */}
          <select
            value={data.city || ""}
            onChange={(e) => setData({ ...data, city: e.target.value })}
            disabled={!data.country}
            className={`input disabled:opacity-60 ${
              errors.city ? "!border-red-500" : ""
            }`}
          >
            <option value="">
              {data.country ? "Şehir seç" : "Önce ülke seç"}
            </option>
            {cities.map((c) => (
              <option key={c.isoCode} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.city && (
            <p className="text-xs text-red-500">{errors.city}</p>
          )}
        </div>
        <div className="space-y-1">
          {/* 🌍 Ülke select. Display label `getCountryLabel` ile TR →
              "Türkiye"; option value ISO code (form state aynen
              ISO code akar). Country değiştiğinde city otomatik
              resetlenir — frontend handleCountryChange ile aynı
              kontrat. */}
          <select
            value={data.country || ""}
            onChange={(e) =>
              setData({ ...data, country: e.target.value, city: "" })
            }
            className={`input ${errors.country ? "!border-red-500" : ""}`}
          >
            <option value="">Ülke seç</option>
            {countries.map((c) => (
              <option key={c.isoCode} value={c.isoCode}>
                {getCountryLabel(c.isoCode)}
              </option>
            ))}
          </select>
          {errors.country && (
            <p className="text-xs text-red-500">{errors.country}</p>
          )}
        </div>
        <input
          placeholder="Adres"
          value={data.address || ""}
          onChange={(e) => setData({ ...data, address: e.target.value })}
          className="input"
        />
      </div>
    </Section>
  );
}
