import { redirect } from "next/navigation";

/* ===============================================================
   🛡️ /maki-admin/settings — root index redirect
   ===============================================================
   Legacy 1497-satırlık monolitik form artık modüler sub-route'lara
   parçalandı (genel / iletisim / seo / rezervasyon / odeme /
   sosyal-medya / entegrasyonlar / gelismis).

   Ana URL hit'inde otomatik /genel'e atılır → kullanıcı sticky
   nav'dan istediği bölüme geçer. Mevcut settings tablosu /
   updateSettings service / getCachedSettings cache helper
   DOKUNULMADI; sadece UI shell parçalandı.
   =============================================================== */
export default function SettingsIndex() {
  redirect("/maki-admin/settings/genel");
}
