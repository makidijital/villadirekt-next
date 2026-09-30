/* ===============================================================
   📦 Reservation Detail — PersonalInfoCard (Adım 1: Kişisel bilgiler)
   ===============================================================
   FAZ 2 refactor: JSX byte-identical _components/'a taşındı.
   4 form alanı (name, phone, email, identity_number) tek field
   map'inden render edilir; functional update pattern aynen.
=============================================================== */

import Section from "./Section";
import Label from "./Label";

export default function PersonalInfoCard({
  data,
  setData,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setData: (updater: (prev: any) => any) => void;
}) {
  return (
    <Section
      eyebrow="Bilgiler"
      title="Kişisel bilgiler"
      subtitle="İletişim ve kimlik"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                /* 🛡️ FUNCTIONAL UPDATE (Faz 3A):
                   stale closure → functional update. Aynı
                   semantic; alanı eziyor, diğer alanlar prev
                   üzerinden korunuyor. */
                setData((prev) => ({
                  ...prev,
                  [field.key]: e.target.value,
                }))
              }
              className="input"
            />
          </div>
        ))}
      </div>
    </Section>
  );
}
